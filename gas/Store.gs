/* ==================================================================
   Store.gs — 週案の読み書き。

   **画面から呼べる関数は、すべて1行目で Gate.check() を呼ぶ。**
   URL を開ける人は google.script.run で直接叩ける。
   画面を出さないのは目隠しであって関門ではない。

   勝ち負けは「最後に書かれたもの」で決まる（docs/spec.md 3節）。
   その時刻は **サーバが打つ**。教師それぞれの PC の時計を信じると、
   時計が進んでいる人がいつも勝つ。
================================================================== */
const Store = (function(){

  const TZ  = "Asia/Tokyo";
  const ymd = d => Utilities.formatDate(
    Sheets.isDate(d) ? d : new Date(String(d)), TZ, "yyyy-MM-dd");

  /* 層と対象の組で1コマが決まる。
       school  対象なし   ／ grade   対象=学年
       special 対象=クラス ／ home    対象=クラス          */
  const keyOf = r => [r["日付"], r["時程"], r["層"], r["対象"]].join("\t");
  const keyOfPatch = (date, p) => [date, p.slot, p.layer, Sheets.asClass(p.target)].join("\t");

  /* ── 読む ────────────────────────────────────── */

  function readWeek(year, mondayISO){
    const start = mondayISO, end = ymd(addDays_(mondayISO, 6));
    const rows = Sheets.readAll("週案").rows;
    const w = {school:{}, grade:{}, special:{}, home:{}};
    for(const r of rows){
      if(String(r["年度"]) !== String(year)) continue;
      const date = ymd(r["日付"]);
      if(date < start || date > end) continue;
      const cell = {
        title:   String(r["題名"] || ""),
        note:    String(r["詳細"] || ""),
        subject: String(r["教科コード"] || "") || null,
        at:      Sheets.isDate(r["更新時刻"]) ? r["更新時刻"].getTime() : 0,
        by:      String(r["更新者"] || "")
      };
      const k = date + "|" + r["時程"];      /* 画面は 日付|時程 で持つ */
      const layer = String(r["層"]), target = Sheets.asClass(r["対象"]);
      if(layer === "school")       w.school[k] = cell;
      else if(layer === "grade")   (w.grade[target]   || (w.grade[target]   = {}))[k] = cell;
      else if(layer === "special"){ cell.sp = String(r["担当"] || "");
                                    (w.special[target] || (w.special[target] = {}))[k] = cell; }
      else if(layer === "home")    (w.home[target]    || (w.home[target]    = {}))[k] = cell;
    }
    return w;
  }

  function readBase(year){
    const rows = Sheets.readAll("基本時間割").rows;
    const out = {};
    for(const r of rows){
      if(String(r["年度"]) !== String(year)) continue;
      const cls = Sheets.asClass(r["クラス"]), v = String(r["週"] || "A");
      const k = String(r["曜日"]) + "|" + String(r["時程"]);
      const bank = out[cls] || (out[cls] = {});
      (bank[v] || (bank[v] = {}))[k] = {
        title: String(r["表示名"] || ""), subject: String(r["教科コード"] || "") || null
      };
    }
    return out;
  }

  /* たんぽぽ児童がいる交流級の印。○ でも 1 でも「はい」でも通す。
     消したいときに空にするのが自然なので、**空だけを「いいえ」**とする。 */
  const marked = v => {
    const t = String(v == null ? "" : v).trim().toLowerCase();
    return t !== "" && t !== "false" && t !== "0" && t !== "×" && t !== "x" && t !== "-";
  };

  /* 年度の欄が空の行は「どの年度でも使う既定」。年度を書いた行があれば、そちらが勝つ。 */
  function readRoster(year){
    const tanpopo = [];
    const classes = pickYear_("クラス", year).reduce((a, r) => {
      const g = Sheets.asClass(r["学年"]), c = Sheets.asClass(r["クラス"]);
      if(g && c){
        (a[g] || (a[g] = [])).push(c);
        if(marked(r["たんぽぽ交流級"]) && tanpopo.indexOf(c) < 0) tanpopo.push(c);
      }
      return a;
    }, {});
    const specials = pickYear_("専科", year)
      .map(r => ({code: String(r["教科コード"] || "").trim(),
                  label: String(r["表示名"] || "").trim()}))
      .filter(s => s.code)
      .map(s => ({code: s.code, label: s.label || s.code}));
    let week1 = "";
    for(const r of Sheets.readAll("年設定").rows)
      if(String(r["年度"]) === String(year) && r["第1週の月曜"]) week1 = ymd(r["第1週の月曜"]);
    return {classes, specials, week1, tanpopo};
  }
  function pickYear_(name, year){
    const rows = Sheets.readAll(name).rows;
    const mine = rows.filter(r => String(r["年度"] || "").trim() === String(year));
    if(mine.length) return mine;
    return rows.filter(r => String(r["年度"] || "").trim() === "");
  }

  function readConfig(){
    const out = {};
    for(const r of Sheets.readAll("設定").rows) out[String(r["キー"]).trim()] = r["値"];
    return out;
  }
  const truthy = v => v === true || String(v).trim().toLowerCase() === "true";

  function readSlots(){
    return Sheets.readAll("時程").rows.map(r => ({
      id:    String(r["ID"]).trim(),
      name:  String(r["表示名"]),
      kind:  String(r["種別"]).indexOf("授業") >= 0 ? "lesson" : "brk",
      time:  String(r["時刻"] || ""),
      tally: String(r["時数表の列"] || "") || undefined,
      chips: truthy(r["教科を選べる"])
    })).filter(s => s.id);
  }
  function readSubjects(){
    return Sheets.readAll("教科").rows.map(r => ({
      code:  String(r["コード"]).trim(),
      name:  String(r["表示名"]),
      short: String(r["時数表の1文字"] || ""),
      count: truthy(r["時数に数える"])
    })).filter(s => s.code);
  }

  /* ── 書く ────────────────────────────────────── */

  /* patches = [{date, slot, layer, target, title, note, subject, sp, remove}]
     戻り値は、いま入った更新時刻（サーバの時計）。画面はこれで手元の控えを直す。

     **ロックの中で1回だけ読み、まとめて書く。** 2人が同じ週を開いていても、
     片方の編集がもう片方の書き戻しで消えない（触るのは差分の行だけ）。 */
  function writeCells(year, patches){
    if(!patches || !patches.length) return {at:{}, count:0};
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const index = {};
      for(const r of Sheets.readAll("週案").rows) index[keyOf(r)] = r.__row;

      const now = new Date(), at = {}, adds = [];
      const me = (function(){ try{ return Gate.activeEmail(); }catch(e){ return ""; } })();

      for(const p of patches){
        const date = ymd(p.date), target = Sheets.asClass(p.target);
        const k = keyOfPatch(date, p), rowNo = index[k];
        const outKey = [date, p.slot, p.layer, target].join("|");
        const empty = !String(p.title || "").trim() && !String(p.note || "").trim();

        if(p.remove || empty){
          if(rowNo) Sheets.blankRow("週案", rowNo);
          delete index[k];
          at[outKey] = 0;
          continue;
        }
        const obj = {
          "年度":year, "日付":date, "時程":p.slot, "層":p.layer, "対象":target,
          "題名":String(p.title || ""), "詳細":String(p.note || ""),
          "教科コード":String(p.subject || ""), "担当":String(p.sp || ""),
          "更新者":me, "更新時刻":now
        };
        if(rowNo) Sheets.setRow("週案", rowNo, obj);
        else      adds.push(Sheets.toArray("週案", obj));
        at[outKey] = now.getTime();
      }
      if(adds.length) Sheets.appendRows("週案", adds);
      SpreadsheetApp.flush();
      return {at, count: patches.length};
    } finally {
      lock.releaseLock();
    }
  }

  /* 学級編成。**その年度の行だけ入れ替える。** 前の年度の行には触らない。 */
  function writeRoster(year, classes, specials, week1, tanpopo){
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const tp = tanpopo || [];
      /* **人の手で入れた欄を消さない。** 画面が持っていないのは
         担任メールと専科のメールだけなので、いまの行から引き継ぐ。
         引き継がないと、学級編成を1回直すたびに連絡先が全部消える。 */
      const mailOf = keep_("クラス", year, r => Sheets.asClass(r["クラス"]), r => String(r["担任メール"] || ""));
      const spMail = keep_("専科", year, r => String(r["教科コード"] || "").trim(), r => String(r["メール"] || ""));
      const clsRows = [];
      for(const g of Object.keys(classes || {}).sort())
        for(const c of classes[g]) clsRows.push({
          "年度":year, "学年":g, "クラス":c, "担任メール": mailOf[c] || "",
          "たんぽぽ交流級": tp.indexOf(c) >= 0 ? "○" : ""
        });
      replaceYear_("クラス", year, clsRows);
      replaceYear_("専科", year, (specials || []).map(s =>
        ({"年度":year, "教科コード":s.code, "表示名":s.label, "メール": spMail[s.code] || ""})));
      if(week1) replaceYear_("年設定", year, [{"年度":year, "第1週の月曜":week1}]);
      SpreadsheetApp.flush();
      return readRoster(year);
    } finally {
      lock.releaseLock();
    }
  }
  /* いまその年度で使っている行から、画面が持たない欄を拾っておく。
     年度の行が無ければ既定（年度が空）の行から拾う。 */
  function keep_(name, year, keyOf_, valOf_){
    const out = {};
    for(const r of pickYear_(name, year)){
      const k = keyOf_(r), v = valOf_(r);
      if(k && v) out[k] = v;
    }
    return out;
  }
  function replaceYear_(name, year, objs){
    for(const r of Sheets.readAll(name).rows)
      if(String(r["年度"]).trim() === String(year)) Sheets.blankRow(name, r.__row);
    Sheets.appendRows(name, objs.map(o => Sheets.toArray(name, o)));
  }

  function writeBase(year, cls, variant, bank){
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      for(const r of Sheets.readAll("基本時間割").rows)
        if(String(r["年度"]) === String(year) && Sheets.asClass(r["クラス"]) === Sheets.asClass(cls)
        && String(r["週"]) === String(variant)) Sheets.blankRow("基本時間割", r.__row);
      const adds = [];
      for(const k in (bank || {})){
        const p = k.split("|");
        adds.push(Sheets.toArray("基本時間割", {
          "年度":year, "クラス":cls, "週":variant, "曜日":p[0], "時程":p[1],
          "教科コード":bank[k].subject || "", "表示名":bank[k].title || ""
        }));
      }
      Sheets.appendRows("基本時間割", adds);
      SpreadsheetApp.flush();
      return true;
    } finally {
      lock.releaseLock();
    }
  }

  function addDays_(isoStr, n){
    const p = String(isoStr).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] + n);
  }

  return {readWeek, readBase, readRoster, readConfig, readSlots, readSubjects,
          writeCells, writeRoster, writeBase, ymd};
})();

/* ── 画面から呼ぶ口。**すべて1行目で Gate.check()。** ───────── */

function apiBoot(){
  const me = Gate.check();
  return {
    me:       me.email,
    config:   Store.readConfig(),
    slots:    Store.readSlots(),
    subjects: Store.readSubjects()
  };
}
function apiReadYear(year){
  Gate.check();
  return {roster: Store.readRoster(year), base: Store.readBase(year)};
}
function apiReadWeek(year, mondayISO){
  Gate.check();
  return Store.readWeek(year, mondayISO);
}
function apiWriteCells(year, patches){
  Gate.check();
  return Store.writeCells(year, patches);
}
function apiWriteRoster(year, classes, specials, week1, tanpopo){
  Gate.check();
  return Store.writeRoster(year, classes, specials, week1, tanpopo);
}
function apiWriteBase(year, cls, variant, bank){
  Gate.check();
  return Store.writeBase(year, cls, variant, bank);
}
