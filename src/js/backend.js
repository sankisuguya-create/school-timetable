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
  /* **いま送っている途中のぶん。** 成功が返るまで、ここに中身ごと置いておく。
     前は送り始めた時点で dirty から外していたので、返事が来る前に画面を
     閉じられると、そのぶんが控えにも残らないまま消えていた。
     控えは「まだシートに入っていないもの」を全部持っていなければ意味がない。 */
  let inflight = {};     /* 送った回ごとの id → [patch, …] */
  let flightId = 0;
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
    onDirty(unsaved(), lastErr);
    persistSoon();
    schedule();
  }

  /* **打鍵では送らない。** 手が止まってしばらく経ってから、念のため送る。
     ふだんは「保存」を押したとき・週や画面を変えたとき・閉じるときに送る。 */
  function schedule(){ retry(180000); }        /* 3分。取りこぼしの受け皿 */
  function retry(ms){
    clearTimeout(timer);
    timer = setTimeout(() => flush(), ms);
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
    if(sending){ retry(900); return after && after(false); }
    const batch = dirty;
    dirty = {}; dirtyN = 0; sending = true;
    const byYear = {};
    for(const k in batch){
      const m = batch[k];
      (byYear[m.year] || (byYear[m.year] = [])).push(patchOf(m));
    }
    /* ふつうは1年度ぶん。年度をまたいで直したときだけ2回に分かれる */
    const years = Object.keys(byYear);
    let left = years.length, bad = false;
    const t0 = Date.now();
    for(const y of years){
      /* **送るぶんを、成功が返るまで控えの側にも置いておく。**
         返事が来る前に画面を閉じられても、次に開いたときに送り直せる */
      const id = ++flightId;
      inflight[id] = byYear[y];
      persistPending();
      google.script.run
        .withSuccessHandler(res => {
          delete inflight[id];            /* シートに入った。控えから外してよい */
          noteTime(res, Date.now() - t0);
          applyServerTimes(res && res.at);
          if(!--left){ sending = false; lastErr = bad ? lastErr : ""; }
          onDirty(unsaved(), lastErr);
          persistPending();
          if(!left) after && after(!bad);
        })
        .withFailureHandler(err => {
          bad = true;
          delete inflight[id];
          /* 送れなかったぶんは捨てない。次の保存でもう一度送る */
          for(const k in batch) if(String(batch[k].year) === String(y)){
            if(!dirty[k]){ dirty[k] = batch[k]; dirtyN++; }
          }
          lastErr = err && err.message ? err.message : "通信できない";
          notify("<b>保存できていない</b>（" + escText(lastErr) + "）。もう一度「保存」を押す");
          if(!--left) sending = false;
          onDirty(unsaved(), lastErr);
          persistPending();
          if(!left) after && after(false);
        })
        .apiWriteCells(+y, byYear[y]);
    }
    /* **送り始めても、入っていない数は減らさない。** 減らすと、押した直後に
       「保存ずみ」と出て、そこで閉じた人は入ったと思ってしまう */
    onDirty(unsaved(), lastErr);
  }
  /* ── 送れないまま閉じられたぶんを持ち越す ────────
     送っている途中で画面を閉じられると、シートに入らないまま消える。
     手元（localStorage）には中身が残るが、次に開いたときシートの側を
     読み直すので、**シートに無いものは上書きされて消える。**

     だから、まだ送っていないコマは**中身ごと**この端末に控えておき、
     次に開いたときに送り直す。送れたら控えを捨てる。 */
  const PEND = KEY + "/pending";
  let pendT = 0;

  /* 控えに書く中身。**まだ送っていないぶんと、送っている途中のぶんの両方。**
     同じコマが両方にあれば、いま画面が持っているほう（dirty）が正しい。 */
  function pendingNow(){
    const seen = {}, out = [];
    for(const k in dirty){
      const q = patchOf(dirty[k]);
      seen[[q.layer, q.target, q.date, q.slot].join("|")] = 1;
      out.push(q);
    }
    for(const id in inflight)
      for(const q of inflight[id])
        if(!seen[[q.layer, q.target, q.date, q.slot].join("|")]) out.push(q);
    return out;
  }
  function persistPending(){
    if(!onGas) return;
    try{
      const list = pendingNow();
      if(list.length) localStorage.setItem(PEND, JSON.stringify(list));
      else localStorage.removeItem(PEND);
    }catch(e){}                 /* 控えられなくても、いまの保存は止めない */
  }
  const persistSoon = () => { clearTimeout(pendT); pendT = setTimeout(persistPending, 900); };

  /* 前に閉じたときの持ち越しを送る。**週を読み直す前に送る。**
     あとから送ると、読み直しで消えた中身を送ることになる。 */
  function sendPending(after){
    if(!onGas) return after();
    let list = null;
    try{ list = JSON.parse(localStorage.getItem(PEND) || "null"); }catch(e){}
    if(!list || !list.length) return after();
    const byYear = {};
    for(const q of list){
      const y = String(q.date).slice(0, 4);
      /* 4月始まりなので、1〜3月は前の年度 */
      const m = +String(q.date).slice(5, 7);
      const fyOf = m <= 3 ? (+y - 1) : +y;
      (byYear[fyOf] || (byYear[fyOf] = [])).push(q);
    }
    let left = Object.keys(byYear).length;
    /* **送れなかったぶんは捨てない。** 前はここで控えを消していた。
       消したあとに週を読み直すので、閉じる直前に書いたコマが、
       翌朝の通信1回のつまずきで**永久に消えていた**。控えが要るのは
       まさにこの事故のためなので、送れたものだけを控えから外す。 */
    const leftOver = [];
    const done = () => {
      if(--left) return;
      try{
        if(leftOver.length) localStorage.setItem(PEND, JSON.stringify(leftOver));
        else localStorage.removeItem(PEND);
      }catch(e){}
      after();
    };
    for(const y in byYear)
      (function(y, list){
        google.script.run
          .withSuccessHandler(done)
          .withFailureHandler(() => {
            /* 控えに残すだけでなく、いまの送り待ちにも積む。
               次に「保存」を押したときに、これも一緒に出ていく */
            for(const q of list){
              leftOver.push(q);
              const d = String(q.date).split("-");
              const mon = iso(mondayOf(new Date(+d[0], +d[1] - 1, +d[2])));
              const dd = Math.round((parseISO(q.date) - parseISO(mon)) / 86400000);
              const k = [q.layer, q.target || "", y, mon, dd, q.slot].join("|");
              if(!dirty[k]){
                dirty[k] = {layer:q.layer, target:q.target || "", year:+y,
                            monday:mon, d:dd, slot:q.slot};
                dirtyN++;
              }
            }
            onDirty(unsaved(), lastErr);
            notify("<b>前に閉じたときのぶんを送れなかった</b>（" + list.length
                 + " コマ）。もう一度「保存」を押す");
            done();
          })
          .apiWriteCells(+y, list);
      })(y, byYear[y]);
  }

  /* **まだシートに入っていないコマの数。** 送っている途中のぶんも数える。
     数えないと、押した直後に「保存ずみ」と出てしまい、
     そこで閉じた人は入ったと思ってしまう。 */
  const unsaved = () => {
    let n = dirtyN;
    for(const id in inflight) n += inflight[id].length;
    return n;
  };
  const setDirtyWatcher = fn => { onDirty = fn; fn(unsaved(), lastErr); };

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
  /* 立ち上がりでもらった、**自分と置き場所のこと**。管理画面に出す。
     手元で開いているときは空のまま（サーバに聞いていないので分からない）。 */
  let bootInfo = {me:"", file:"", archived:{}};

  /* **保存にかかった時間を、最近のぶんだけ覚える。**
     長くなってきたことに、誰かが困る前に気づくため。
     溜め込まない（大きな監査ログは作らない。作れば作ったで誰も見ない）。 */
  const TIMES = 20;
  const times = [];
  function noteTime(res, roundMs){
    if(!res) return;
    times.push({ms: +res.ms || 0, wait: +res.waitMs || 0, round: roundMs,
                cells: +res.count || 0, sheets: +res.sheets || 0});
    while(times.length > TIMES) times.shift();
  }
  /* 遅いほうから見る。**平均は、たまに出る遅さを隠す。**
     困るのは「たまに10秒待たされる」ほうで、平均が速いことではない。 */
  function saveTimes(){
    if(!times.length) return null;
    const pick = f => times.map(f).sort((a, b) => a - b);
    const worst = a => a[a.length - 1];
    return {n: times.length,
            ms: worst(pick(x => x.ms)), wait: worst(pick(x => x.wait)),
            round: worst(pick(x => x.round)),
            cells: worst(pick(x => x.cells)), sheets: worst(pick(x => x.sheets))};
  }
  const info = () => ({me: bootInfo.me, file: bootInfo.file, gas: !!onGas,
                      archived: bootInfo.archived || {}, times: saveTimes()});
  /* その年度は退避ずみか。**退避ずみの年度に、何も言わずに紙を出さない。**
     週案の行はもう本体に無いので、基本時間割だけの紙が出る。
     それを黙って出すと「週案が全部消えた」と言われる。 */
  const archivedYear = y => (bootInfo.archived || {})[String(y)] || null;
  function boot(after){
    if(!onGas){ booted = true; return after(); }
    google.script.run
      .withSuccessHandler(b => {
        bootInfo = {me: b.me || "", file: b.file || "", archived: b.archived || {}};
        if(b.slots    && b.slots.length)    setSlots(b.slots);
        if(b.subjects && b.subjects.length) setSubjects(b.subjects);
        if(b.config)  applyConfig(b.config);
        if(b.year) applyYear(String(b.year), b);
        /* **週を読み直す前に、持ち越しを送る。** */
        sendPending(() => {
          booted = true;
          after();
          while(waiters.length) waiters.shift()();
        });
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
  /* **一度読んだら二度と読み直さない、をやめる。**
     30人が同じ週を触る運用なのに、タブを開いたままの担任には
     その日ほかの誰が何を入れても映らなかった。「次に開いたときに知らせる」
     （docs/spec.md 3節）の"開いたとき"が、実際には再読み込みしか無かった。

     読んだ時刻を覚えておき、古くなっていたら画面を開くときに読み直す。
     すぐに読み直すのではなく間を置くのは、クラスを続けて見るときに
     1つずつ往復させないため。 */
  const FRESH_MS = 60000;          /* これより古い控えは、開くときに読み直す */
  const WATCH_MS = 180000;         /* 開きっぱなしの画面を、これごとに見に行く */
  const fresh_ = tag => (loadedWeek[tag] || 0) > Date.now() - FRESH_MS;

  function applyYear(y, r){
    if(String(y) !== String(fy())) return;  /* いま開いている年度のぶんだけ */
    const Yr = Y();
    if(r.roster){
      if(r.roster.classes && Object.keys(r.roster.classes).length) Yr.classes = r.roster.classes;
      if(r.roster.specials && r.roster.specials.length)            Yr.specials = r.roster.specials;
      if(r.roster.week1) Yr.week1 = r.roster.week1;
      /* 空も答えのうち（全部外した年度がある）。有無ではなく、返ってきたかで見る */
      if(r.roster.tanpopo !== undefined && r.roster.tanpopo !== null)
        Yr.tanpopo = tpNorm_(r.roster.tanpopo);
    }
    Yr.base = r.base || {};
    /* **読めなかった行は黙って捨てない。** 入っていないのか読めていないのかが
       分からないと、シートを見ながら何度も書き直すことになる */
    if(r.warn && r.warn.length)
      notify("<b>基本時間割シートに読めない行がある</b>（" + r.warn.length + "行）：<br>"
           + r.warn.slice(0, 3).map(escText).join("<br>")
           + (r.warn.length > 3 ? "<br>ほか " + (r.warn.length - 3) + "行" : ""));
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
      /* **読めなくても先へ進む。** 進まないと、開いたつもりの画面が出ないまま
         前の画面が残り、どこを見ているのか分からなくなる。
         中身は手元の控えのまま。読めなかったことは帯で言う。 */
      .withFailureHandler(e => {
        notify("年度の設定を読めなかった（" + escText(String(e && e.message)) + "）");
        after();
      })
      .apiReadYear(+y);
  }

  /* **その画面に要るシートだけを読む。**
     週案はクラスごとに1枚あるので、全部読むと27枚ぶん待つことになる。
     3-3 を開くなら「週案 3-3」「週案 3年」「週案 全校」の3枚で足りる。 */
  function ensureWeek(after){
    if(!onGas) return after();
    const want = targetsForView().filter(t => !fresh_(weekTag(t)));
    if(!want.length) return after();
    /* **どの年度・どの週に頼んだのかを覚えておく。**
       返事が来るころには、もう別の週を見ているかもしれない。
       いま見ている週へ入れてしまうと、その週の中身が消える。
       校内の回線では返事の順序が入れ替わる（古い週の返事があとから届く）。 */
    const year = fy(), mon = wkKey();
    google.script.run
      .withSuccessHandler(w => {
        mergeWeek(want, w, year, mon);   /* 頼んだぶんだけ入れ替える。控えは残す */
        after();
      })
      .withFailureHandler(e => {
        notify("この週を読めなかった（" + escText(String(e && e.message))
             + "）。<b>この週はまだ書かない</b>");
        after();
      })
      .apiReadWeek(year, mon, want);
  }
  const weekTag = (t, year, mon) =>
    (year === undefined ? fy() : year) + "/" + (mon === undefined ? wkKey() : mon)
    + "/" + t.layer + "/" + (t.target || "");

  /* まだ送っていないコマがある対象は、読み直しで上書きしない。
     **上書きすると、書いたのに消えたように見える。** */
  function hasPending(layer, target){
    for(const k in dirty){
      const m = dirty[k];
      if(m.layer === layer && m.target === (target || "")) return true;
      /* 専科のコマはクラスのシートに入る。クラスを読み直すときは専科も見る */
      if(layer === "home" && m.layer === "special" && m.target === target) return true;
    }
    return false;
  }

  /* **次のクラスを待たせない。** 1つ開いたあと、手が空いているうちに
     この週の残りを読んでおく。開くたびに1往復待つのは、
     3クラス見るだけで3回待つということ。 */
  let preT = 0;
  function prefetchWeek(){
    if(!onGas) return;
    clearTimeout(preT);
    preT = setTimeout(() => {
      /* 先読みは**一度も読んでいないもの**だけ。古くなっただけのものまで
         先読みすると、開いてもいないクラスのために毎分読みに行くことになる */
      const want = allTargets().filter(t => !loadedWeek[weekTag(t)]);
      if(!want.length || sending) return;
      const year = fy(), mon = wkKey();
      google.script.run
        .withSuccessHandler(w => mergeWeek(want, w, year, mon))
        .withFailureHandler(() => {})     /* 先読みが失敗しても、開くときに読み直す */
        .apiReadWeek(year, mon, want);
    }, 1200);
  }
  function allTargets(){
    const out = [{layer:"school", target:""}];
    for(const g of grades()) out.push({layer:"grade", target:g});
    for(const c of allClasses()) out.push({layer:"home", target:c});
    return out;
  }

  /* year/mon は「頼んだときの年度と週」。渡されなければ、いまの年度と週。
     **頼んだ先の週へ入れる。** いま見ている週へ入れると、
     返事が遅れたぶんだけ別の週の中身が消える。 */
  function mergeWeek(want, w, year, mon){
    const y = (year === undefined) ? fy() : year;
    const m = (mon  === undefined) ? wkKey() : mon;
    const Yr = db.years[String(y)];
    if(!Yr || !Yr.weeks) return;      /* その年度がもう無い */
    const cur = Yr.weeks[m] || (Yr.weeks[m] =
      {school:{}, grade:{}, special:{}, home:{}, acked:[], variant:"A"});
    for(const t of want){
      /* まだ送っていないコマがある対象は触らない */
      if(hasPending(t.layer, t.target)) continue;
      if(t.layer === "school")     cur.school = w.school || {};
      else if(t.layer === "grade") cur.grade[t.target]  = (w.grade || {})[t.target] || {};
      else {
        cur.home[t.target]    = (w.home    || {})[t.target] || {};
        cur.special[t.target] = (w.special || {})[t.target] || {};
      }
      loadedWeek[weekTag(t, y, m)] = Date.now();
    }
  }
  /* **開きっぱなしの画面を、たまに読み直す。**
     木曜の夕方に30人が同じ週を触る運用で、開いたまま置いている担任に
     ほかの人の書き込みが1つも映らないのがいちばん困る。

     見ていないタブでは読まない（電池と回線を使わない）。
     まだ送っていないコマがある対象は、読み直しても触らない（hasPending）。 */
  let watchT = 0;
  function watch(){
    clearInterval(watchT);
    if(!onGas) return;
    watchT = setInterval(() => {
      if(document.hidden || sending) return;
      if(typeof view === "undefined" || view.kind === "gate") return;
      ensureWeek(() => { if(typeof paintSheet === "function" && view.kind !== "tanpopo") paintSheet(); });
    }, WATCH_MS);
  }
  /* いま開いている画面の控えを「古い」ことにする。次に読むときに読み直す。
     **タブへ戻ってきた人がいちばん古いものを見ている**ので、そこで必ず1回読む。 */
  function stale(){
    for(const t of targetsForView()) delete loadedWeek[weekTag(t)];
  }
  addEventListener("visibilitychange", () => {
    if(document.hidden || !onGas || !booted) return;
    if(typeof view === "undefined" || view.kind === "gate" || view.kind === "tanpopo") return;
    stale();
    ensureWeek(() => { if(typeof paintSheet === "function") paintSheet(); });
  });

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
      .apiWriteRoster(fy(), Yr.classes, Yr.specials, Yr.week1, Yr.tanpopo || {});
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

  /* 年度の退避。**数える／照合する／消す の3つに分けてある。**
     1つにまとめると、確かめずに消せてしまう。 */
  function archiveCount(year, ok, ng){
    if(!onGas) return ng("手元ではシートにつながっていないので、退避できない");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("数えられなかった（" + (e && e.message) + "）"))
      .apiArchiveCount(+year);
  }
  function archiveVerify(year, url, ok, ng){
    if(!onGas) return ng("手元ではシートにつながっていないので、照合できない");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("照合できなかった（" + (e && e.message) + "）"))
      .apiArchiveVerify(+year, url);
  }
  function archivePurge(year, url, typed, ok, ng){
    if(!onGas) return ng("手元ではシートにつながっていないので、消せない");
    google.script.run
      .withSuccessHandler(r => {
        /* 消したら、その年度は退避ずみになる。**画面にもすぐ映す** */
        (bootInfo.archived || (bootInfo.archived = {}))[String(year)] =
          {url:r.url, at:r.at, by:r.by};
        ok(r);
      })
      .withFailureHandler(e => ng(String((e && e.message) || "消せなかった")))
      .apiArchivePurge(+year, url, typed);
  }

  /* 年度の検査。**4月に開けたとき、何が足りないかを1画面で言う。**
     手元では見られない（シートを読まなければ、足りないものが分からない）。 */
  function checkYear(ok, ng){
    if(!onGas) return ng("手元ではシートにつながっていないので、検査できない");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("検査できなかった（" + (e && e.message) + "）"))
      .apiCheckYear(fy());
  }

  /* 貼り付け用シートを、そのままの形で読む。手元では使えない */
  function readPaste(ok, ng){
    if(!onGas) return ng("手元では、シートの代わりに貼り付け欄を使う");
    google.script.run
      .withSuccessHandler(g => ok(g || []))
      .withFailureHandler(e => ng("シートを読めなかった（" + (e && e.message) + "）"))
      .apiReadPaste();
  }

  /* たんぽぽ時間割へ、**1週ぶんを1枚のシートとして出す**。
     どのクラスのどの校時が何かを決めるのは画面（層の重ね方を知っている）。
     どんな形のシートを作るかを決めるのはシート側（実物の形を知っている）。
     cols = [{cls, group}] の並び。**並びと組をこちらで決めて渡す。** */
  function exportWeek(titles, cols, slots, name, ok, ng){
    if(!onGas) return ng("手元ではたんぽぽ時間割につながっていない");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "書き込めなかった")))
      .apiExportWeek(fy(), wkKey(), titles, cols, slots, name);
  }

  /* 画面を閉じる前に、貯めたぶんを出し切る。
     出し切れないうちに閉じられそうなときは、引き止める。 */
  addEventListener("beforeunload", ev => {
    if(onGas && (unsaved() || sending)){
      persistPending();          /* 先に控える。送り切れなくても次に開いたときに送る */
      flush();
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  return {isGas, info, setNotifier, setDirtyWatcher, unsaved, prefetchWeek, watch, stale,
          cellChanged, flush, boot, ready, readyYear,
          saveRoster, saveBase, saveBaseAll, readPaste, checkYear, archivedYear,
          archiveCount, archiveVerify, archivePurge, exportWeek};
})();
