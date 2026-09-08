/* 置き場所の継ぎ目。**画面はどちらで動いているかを知らない。**

     手元（ブラウザで dist/index.html を開く）  … localStorage
     本番（Apps Script のウェブアプリ）        … シート

   画面は今までどおり、メモリの db を見て同期に描く。
   本番でも**週を1回読んでメモリに持ち、書き込みは差分を貯めてまとめて送る**。
   1コマ打つたびにサーバを待つ作りにすると、校内の回線では打鍵が止まる。

   時刻（勝ち負けを決める値）は**サーバが打ったものが正**。
   送ったあとに戻ってきた時刻で、手元の控えを直す。 */
const Backend = (function(){

  const onGas = typeof google !== "undefined" && google.script && google.script.run;

  let queue = [];        /* まだ送っていない差分 */
  let timer = 0;
  let sending = false;
  let notify = () => {};

  /* ── 共通 ────────────────────────────────────── */

  const isGas = () => !!onGas;
  const setNotifier = fn => { notify = fn; };

  /* 1コマ変わった。手元では db を丸ごと書き出すので、差分は本番だけで使う。 */
  function cellChanged(layer, target, d, slotId, entry){
    if(!onGas) return;
    queue.push({
      date: iso(addDays(monday, d)), slot: slotId, layer, target: target || "",
      title:   entry ? entry.title   : "",
      note:    entry ? entry.note    : "",
      subject: entry ? (entry.subject || "") : "",
      sp:      entry ? (entry.sp || "")      : "",
      remove:  !entry
    });
    schedule();
  }

  /* 打ち終わってから少し待って、まとめて送る。
     打鍵のたびに送ると、1週ぶんで数十回の往復になる。 */
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(flush, 600);
  }
  function flush(){
    if(!onGas || sending || !queue.length) return;
    const batch = queue; queue = []; sending = true;
    google.script.run
      .withSuccessHandler(res => {
        sending = false;
        applyServerTimes(res && res.at);
        if(queue.length) schedule();
      })
      .withFailureHandler(err => {
        sending = false;
        queue = batch.concat(queue);      /* 送れなかったぶんは捨てない */
        notify("保存できていない（" + (err && err.message ? err.message : "通信できない")
             + "）。この画面を閉じない");
      })
      .apiWriteCells(fy(), batch);
  }

  /* サーバが打った時刻で手元の控えを直す。
     教師それぞれの PC の時計で勝ち負けを決めると、時計が進んでいる人が always 勝つ。 */
  function applyServerTimes(at){
    if(!at) return;
    const w = week();
    for(const k in at){
      const p = k.split("|");            /* 日付|時程|層|対象 */
      const day = Math.round((parseISO(p[0]) - monday) / 86400000);
      if(day < 0 || day > 6) continue;
      const key = ck(day, p[1]);
      const bank = p[2] === "school" ? w.school
                 : p[2] === "grade"  ? w.grade[p[3]]
                 : p[2] === "special"? w.special[p[3]]
                 : w.home[p[3]];
      if(bank && bank[key]) bank[key].at = at[k];
    }
  }

  /* ── 読み込み ────────────────────────────────
     手元では何もしない（db がそのまま正本）。
     本番では、その年度と週をシートから引いてメモリに載せる。 */

  function boot(after){
    if(!onGas) return after();
    google.script.run
      .withSuccessHandler(b => {
        if(b.slots    && b.slots.length)    setSlots(b.slots);
        if(b.subjects && b.subjects.length) setSubjects(b.subjects);
        if(b.config)  applyConfig(b.config);
        after();
      })
      .withFailureHandler(e => notify("開けなかった（" + (e && e.message) + "）"))
      .apiBoot();
  }

  const loadedYear = {}, loadedWeek = {};

  function ensureYear(after){
    if(!onGas) return after();
    const y = String(fy());
    if(loadedYear[y]) return after();
    google.script.run
      .withSuccessHandler(r => {
        const Yr = Y();
        if(r.roster){
          if(r.roster.classes && Object.keys(r.roster.classes).length) Yr.classes = r.roster.classes;
          if(r.roster.specials && r.roster.specials.length)            Yr.specials = r.roster.specials;
          if(r.roster.week1) Yr.week1 = r.roster.week1;
          /* たんぽぽ交流級は空も答えのうち（全部外した年度がある）。
             有無ではなく、配列が返ってきたかどうかで見る */
          if(Array.isArray(r.roster.tanpopo)) Yr.tanpopo = r.roster.tanpopo;
        }
        Yr.base = r.base || {};
        loadedYear[y] = true;
        after();
      })
      .withFailureHandler(e => notify("年度の設定を読めなかった（" + (e && e.message) + "）"))
      .apiReadYear(+y);
  }

  function ensureWeek(after){
    if(!onGas) return after();
    const k = fy() + "/" + wkKey();
    if(loadedWeek[k]) return after();
    google.script.run
      .withSuccessHandler(w => {
        const cur = week();
        cur.school = w.school || {};
        cur.grade  = w.grade  || {};
        cur.special= w.special|| {};
        cur.home   = w.home   || {};
        loadedWeek[k] = true;
        after();
      })
      .withFailureHandler(e => notify("この週を読めなかった（" + (e && e.message) + "）"))
      .apiReadWeek(fy(), wkKey());
  }
  /* 週や年度を開くときの入口。手元では即その場で続く。 */
  const ready = after => ensureYear(() => ensureWeek(after));

  /* ── 設定の書き込み ─────────────────────────── */

  function saveRoster(){
    if(!onGas) return save();
    const Yr = Y();
    google.script.run
      .withFailureHandler(e => notify("学級編成を保存できなかった（" + (e && e.message) + "）"))
      .apiWriteRoster(fy(), Yr.classes, Yr.specials, Yr.week1, Yr.tanpopo || []);
  }
  function saveBase(cls, variant){
    if(!onGas) return save();
    google.script.run
      .withFailureHandler(e => notify("基本時間割を保存できなかった（" + (e && e.message) + "）"))
      .apiWriteBase(fy(), cls, variant, ((Y().base[cls] || {})[variant]) || {});
  }

  /* 固定時間割の取り込み。**20クラス×A週B週を1回で送る。**
     1クラスずつ送ると、途中で切れたときに半分だけ入った表が残る。 */
  function saveBaseAll(list, after){
    if(!onGas){ save(); return after && after(); }
    const table = {}, B = Y().base;
    for(const c of list) if(B[c]) table[c] = {A:B[c].A || {}, B:B[c].B || {}};
    google.script.run
      .withSuccessHandler(r => after && after(r))
      .withFailureHandler(e => notify("基本時間割を保存できなかった（" + (e && e.message) + "）"))
      .apiWriteBaseAll(fy(), table);
  }

  /* 貼り付け用シートを、そのままの形で読む。手元では使えない */
  function readPaste(ok, ng){
    if(!onGas) return ng("手元では、シートの代わりに貼り付け欄を使う");
    google.script.run
      .withSuccessHandler(g => ok(g || []))
      .withFailureHandler(e => ng("シートを読めなかった（" + (e && e.message) + "）"))
      .apiReadPaste();
  }

  /* 画面を閉じる前に、貯めた差分を出し切る */
  addEventListener("beforeunload", ev => {
    if(onGas && (queue.length || sending)){
      flush();
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  return {isGas, setNotifier, cellChanged, flush, boot, ready,
          saveRoster, saveBase, saveBaseAll, readPaste};
})();
