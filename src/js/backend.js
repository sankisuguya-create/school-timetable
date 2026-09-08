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

  /* **まだ送っていないコマの「場所」だけを覚える。中身は覚えない。**
     打鍵のたびに中身を積むと、1コマ書くだけで何十件も送ることになる。
     送る直前に、そのとき画面が持っている中身を読んで1件にまとめる。 */
  let dirty = {};        /* "層|対象|曜日|時程" → {layer,target,d,slot} */
  let dirtyN = 0;
  let timer = 0;
  let sending = false;
  let notify = () => {};
  let onDirty = () => {};   /* 未保存の数が変わったら画面に知らせる */
  let lastErr = "";

  /* ── 共通 ────────────────────────────────────── */

  const isGas = () => !!onGas;
  const setNotifier = fn => { notify = fn; };

  /* 1コマ変わった。**場所を覚えるだけで、まだ送らない。**
     手元（localStorage）はそのつど丸ごと書き出しているので、
     ここで覚えるのは本番のシートへ送るぶん。 */
  function cellChanged(layer, target, d, slotId){
    if(!onGas) return;
    const k = [layer, target || "", fy(), wkKey(), d, slotId].join("|");
    if(!dirty[k]){ dirty[k] = {layer, target:target || "", year:fy(),
                               monday:wkKey(), d, slot:slotId}; dirtyN++; }
    onDirty(dirtyN, lastErr);
    schedule();
  }

  /* **打鍵では送らない。** 手が止まってしばらく経ってから、念のため送る。
     ふだんは「保存」を押したとき・週や画面を変えたとき・閉じるときに送る。 */
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(flush, 180000);          /* 3分。取りこぼしの受け皿 */
  }

  /* 送る直前に、いま画面が持っている中身を読んで1コマ1件にする。 */
  function patchOf(m){
    const w = (db.years[String(m.year)] || {weeks:{}}).weeks[m.monday];
    const bank = !w ? null
               : m.layer === "school" ? w.school
               : m.layer === "grade"  ? (w.grade[m.target]   || {})
               : m.layer === "special"? (w.special[m.target] || {})
               :                        (w.home[m.target]    || {});
    const e = bank ? bank[ck(m.d, m.slot)] : null;
    const p = m.monday.split("-");
    const date = iso(new Date(+p[0], +p[1] - 1, +p[2] + m.d));
    return {date, slot:m.slot, layer:m.layer, target:m.target,
            title:   e ? e.title : "",
            note:    e ? e.note  : "",
            subject: e ? (e.subject || "") : "",
            sp:      e ? (e.sp || "")      : "",
            remove:  !e};
  }

  /* 貯めたぶんを送る。after は送り終わってから呼ぶ（押した手ごたえを返すため）。 */
  function flush(after){
    if(!onGas || !dirtyN){ lastErr = ""; onDirty(0, ""); return after && after(true); }
    if(sending){ schedule(); return after && after(false); }
    const batch = dirty, n = dirtyN;
    dirty = {}; dirtyN = 0; sending = true;
    onDirty(0, lastErr);
    const byYear = {};
    for(const k in batch){
      const m = batch[k];
      (byYear[m.year] || (byYear[m.year] = [])).push(patchOf(m));
    }
    /* ふつうは1年度ぶん。年度をまたいで直したときだけ2回に分かれる */
    const years = Object.keys(byYear);
    let left = years.length, bad = false;
    for(const y of years){
      google.script.run
        .withSuccessHandler(res => {
          applyServerTimes(res && res.at);
          if(!--left){ sending = false; lastErr = bad ? lastErr : "";
                       onDirty(dirtyN, lastErr); after && after(!bad); }
        })
        .withFailureHandler(err => {
          bad = true;
          /* 送れなかったぶんは捨てない。次の保存でもう一度送る */
          for(const k in batch) if(String(batch[k].year) === String(y)){
            if(!dirty[k]){ dirty[k] = batch[k]; dirtyN++; }
          }
          lastErr = err && err.message ? err.message : "通信できない";
          notify("<b>保存できていない</b>（" + escText(lastErr) + "）。もう一度「保存」を押す");
          if(!--left){ sending = false; onDirty(dirtyN, lastErr); after && after(false); }
        })
        .apiWriteCells(+y, byYear[y]);
    }
  }
  const unsaved = () => dirtyN;
  const setDirtyWatcher = fn => { onDirty = fn; fn(dirtyN, lastErr); };

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

  /* 立ち上がり。**設定と、いまの年度のぶんを1回でもらう。**
     別々に取りに行くと、入口が出るまでにその回数だけ待つことになる。 */
  let booted = false;
  const waiters = [];
  function boot(after){
    if(!onGas){ booted = true; return after(); }
    google.script.run
      .withSuccessHandler(b => {
        if(b.slots    && b.slots.length)    setSlots(b.slots);
        if(b.subjects && b.subjects.length) setSubjects(b.subjects);
        if(b.config)  applyConfig(b.config);
        if(b.year) applyYear(String(b.year), b);
        booted = true;
        after();
        while(waiters.length) waiters.shift()();
      })
      .withFailureHandler(e => {
        booted = true;             /* 開けなくても止めない。手元の控えで続ける */
        notify("開けなかった（" + escText(String(e && e.message)) + "）");
        after();
        while(waiters.length) waiters.shift()();
      })
      .apiBoot(fy());
  }
  const whenBooted = fn => booted ? fn() : waiters.push(fn);

  const loadedYear = {}, loadedWeek = {};

  function applyYear(y, r){
    if(String(y) !== String(fy())) return;  /* いま開いている年度のぶんだけ */
    const Yr = Y();
    if(r.roster){
      if(r.roster.classes && Object.keys(r.roster.classes).length) Yr.classes = r.roster.classes;
      if(r.roster.specials && r.roster.specials.length)            Yr.specials = r.roster.specials;
      if(r.roster.week1) Yr.week1 = r.roster.week1;
      if(Array.isArray(r.roster.tanpopo)) Yr.tanpopo = r.roster.tanpopo;
    }
    Yr.base = r.base || {};
    loadedYear[y] = true;
  }

  function ensureYear(after){
    if(!onGas) return after();
    const y = String(fy());
    Y();                                   /* その年度の入れ物を用意しておく */
    if(loadedYear[y]) return after();
    google.script.run
      .withSuccessHandler(r => {
        /* たんぽぽ交流級は空も答えのうち（全部外した年度がある）。
           有無ではなく、配列が返ってきたかどうかで見る（applyYear の中） */
        applyYear(y, r);
        after();
      })
      .withFailureHandler(e => notify("年度の設定を読めなかった（" + escText(String(e && e.message)) + "）"))
      .apiReadYear(+y);
  }

  /* **その画面に要るシートだけを読む。**
     週案はクラスごとに1枚あるので、全部読むと27枚ぶん待つことになる。
     3-3 を開くなら「週案 3-3」「週案 3年」「週案 全校」の3枚で足りる。 */
  function ensureWeek(after){
    if(!onGas) return after();
    const want = targetsForView().filter(t => !loadedWeek[weekTag(t)]);
    if(!want.length) return after();
    google.script.run
      .withSuccessHandler(w => {
        const cur = week();
        /* 頼んだぶんだけ入れ替える。頼んでいないクラスの控えは残す */
        for(const t of want){
          if(t.layer === "school")     cur.school = w.school || {};
          else if(t.layer === "grade") cur.grade[t.target]  = (w.grade || {})[t.target] || {};
          else {
            cur.home[t.target]    = (w.home    || {})[t.target] || {};
            cur.special[t.target] = (w.special || {})[t.target] || {};
          }
          loadedWeek[weekTag(t)] = true;
        }
        after();
      })
      .withFailureHandler(e => notify("この週を読めなかった（" + escText(String(e && e.message)) + "）"))
      .apiReadWeek(fy(), wkKey(), want);
  }
  const weekTag = t => fy() + "/" + wkKey() + "/" + t.layer + "/" + (t.target || "");
  /* 週や年度を開くときの入口。手元では即その場で続く。
     立ち上がりの1回がまだ返っていなければ、それを待ってから読む
     （待たないと、シートの時程を知らないまま紙を組んでしまう）。 */
  const ready = after => whenBooted(() => ensureYear(() => ensureWeek(after)));
  const readyYear = after => whenBooted(() => ensureYear(after));

  /* ── 設定の書き込み ─────────────────────────── */

  function saveRoster(){
    if(!onGas) return save();
    const Yr = Y();
    google.script.run
      .withFailureHandler(e => notify("学級編成を保存できなかった（" + escText(String(e && e.message)) + "）"))
      .apiWriteRoster(fy(), Yr.classes, Yr.specials, Yr.week1, Yr.tanpopo || []);
  }
  function saveBase(cls, variant){
    if(!onGas) return save();
    google.script.run
      .withFailureHandler(e => notify("基本時間割を保存できなかった（" + escText(String(e && e.message)) + "）"))
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

  /* 画面を閉じる前に、貯めたぶんを出し切る。
     出し切れないうちに閉じられそうなときは、引き止める。 */
  addEventListener("beforeunload", ev => {
    if(onGas && (dirtyN || sending)){
      flush();
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  return {isGas, setNotifier, setDirtyWatcher, unsaved,
          cellChanged, flush, boot, ready, readyYear,
          saveRoster, saveBase, saveBaseAll, readPaste};
})();
