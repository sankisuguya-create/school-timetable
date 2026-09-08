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
  const DOW_ = ["日", "月", "火", "水", "木", "金", "土"];
  const ymd = d => Utilities.formatDate(
    Sheets.isDate(d) ? d : new Date(String(d)), TZ, "yyyy-MM-dd");

  /* ── どのシートを見るか ────────────────────────
     週案はクラスごとに1枚（Sheets.planName）。
     **その画面に要るシートだけを読む。** 27枚を毎回読むと、
     開くたびに数秒待つことになる。 */
  function planKey(layer, target){ return layer + "|" + (target || ""); }

  /* 時程の並び。日付順に並べたあと、同じ日の中はこの順で並べる。
     p1 p2 … の字で並べると、朝学習や中休みが授業の間に混じる。 */
  function slotRank(){
    const out = {};
    Sheets.readAll("時程").rows.forEach((r, i) => { out[String(r["ID"]).trim()] = i; });
    return out;
  }

  /* ── 読む ────────────────────────────────────
     targets = [{layer, target}]。渡されなければ、いまあるシートを全部読む。 */
  function readWeek(year, mondayISO, targets){
    const start = mondayISO, end = ymd(addDays_(mondayISO, 6));
    const w = {school:{}, grade:{}, special:{}, home:{}};
    const names = {};
    if(targets && targets.length){
      for(const t of targets) names[Sheets.planName(t.layer, t.target)] = true;
    } else {
      for(const n of Sheets.planNames()) names[n] = true;
    }
    for(const name in names){
      for(const r of Sheets.readPlan(name, ymd)){
        if(String(r["年度"]) !== String(year)) continue;
        const date = r["日付"];
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
      /* 授業＝題名と備考／備考＝備考だけ／それ以外＝題名だけ */
      kind:  String(r["種別"]).indexOf("授業") >= 0 ? "lesson"
           : String(r["種別"]).indexOf("備考") >= 0 ? "note" : "brk",
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

     **シートごとに、丸ごと読んで・差し替えて・日付順に並べて・書き戻す。**
     行番号を覚えて1行ずつ直すやり方はやめた。
     日付は書いた瞬間にシートの側で日付型になるので、文字のまま覚えた行番号は
     次に読んだときもう合わない。合わないと、直したつもりの行が増えていく。 */
  function writeCells(year, patches){
    if(!patches || !patches.length) return {at:{}, count:0};
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try{
      const rank = slotRank();
      const now = new Date(), at = {};
      const me = (function(){ try{ return Gate.activeEmail(); }catch(e){ return ""; } })();

      /* シートごとにまとめる */
      const byName = {};
      for(const p of patches){
        const name = Sheets.planName(p.layer, Sheets.asClass(p.target));
        (byName[name] || (byName[name] = [])).push(p);
      }

      for(const name in byName){
        const rows = Sheets.readPlan(name, ymd);
        const index = {};
        rows.forEach((r, i) => {
          index[[String(r["年度"]), r["日付"], String(r["時程"]),
                 String(r["層"]), Sheets.asClass(r["対象"])].join("\t")] = i;
        });
        const drop = {};
        for(const p of byName[name]){
          const date = ymd(p.date), target = Sheets.asClass(p.target);
          const k = [String(year), date, p.slot, p.layer, target].join("\t");
          const outKey = [date, p.slot, p.layer, target].join("|");
          const empty = !String(p.title || "").trim() && !String(p.note || "").trim();
          const i = index[k];
          if(p.remove || empty){
            if(i !== undefined) drop[i] = true;
            at[outKey] = 0;
            continue;
          }
          const obj = {
            "年度":year, "日付":date, "曜日":DOW_[new Date(date + "T00:00:00").getDay()],
            "時程":p.slot, "題名":String(p.title || ""), "詳細":String(p.note || ""),
            "教科コード":String(p.subject || ""), "層":p.layer, "対象":target,
            "担当":String(p.sp || ""), "更新者":me, "更新時刻":now
          };
          if(i !== undefined) rows[i] = obj;
          else { index[k] = rows.length; rows.push(obj); }
          at[outKey] = now.getTime();
        }
        const keep = rows.filter((r, i) => !drop[i]);
        keep.sort(function(x, y){
          const a1 = String(x["年度"]), b1 = String(y["年度"]);
          if(a1 !== b1) return a1 < b1 ? -1 : 1;
          if(x["日付"] !== y["日付"]) return x["日付"] < y["日付"] ? -1 : 1;
          const rx = rank[String(x["時程"])], ry = rank[String(y["時程"])];
          return (rx === undefined ? 99 : rx) - (ry === undefined ? 99 : ry);
        });
        Sheets.writePlan(name, keep);
      }
      SpreadsheetApp.flush();
      return {at, count: patches.length};
    } finally {
      lock.releaseLock();
    }
  }

  /* ── たんぽぽ時間割へ出す ──────────────────────
     実物の形（docs/spec.md 7節）。1日ぶんが縦のブロックで、各校時は2行。
     上が授業名、下が担当者・場所。列は児童ごとで、見出しはその日の交流学級。

       +0  日付 ／ その日の交流学級
       +1  1校時 授業名   +2  担当者・場所
       +3  2校時 授業名   +4  担当者・場所
       +5  中休み
       +6  3校時 授業名   +7  担当者・場所
       +8  4校時 授業名   +9  担当者・場所
       +10 給食
       +11 昼休み
       +12 5校時 授業名   +13 担当者・場所
       +14 6校時 授業名   +15 担当者・場所

     **書く前に形を確かめる。** 形が合わない日はその日だけ書かない。
     合わない日に書くと、別の校時の行に授業名が入る。落ちないので気づかない。 */
  const TP_TITLE_ROW = [1, 3, 6, 8, 12, 14];      /* 1〜6校時の授業名の行 */
  const TP_MARK = [[5, "中休み"], [10, "給食"], [11, "昼休み"]];

  function tpNorm(v){
    let t = String(v == null ? "" : v).normalize("NFKC").trim().replace(/[　\s]+/g, "");
    return t.replace(/[‐‑–—―ー−ｰ－]/g, "-");
  }
  /* A列の値を日付にする。Date でも「11/16」でも「11月16日」でも読む */
  function tpDate(v, year){
    if(Sheets.isDate(v)) return ymd(v);
    const t = tpNorm(v);
    let m = t.match(/^(\d{1,2})[\/-](\d{1,2})$/);
    if(m) return ymd(new Date(+year, +m[1] - 1, +m[2]));
    m = t.match(/^(\d{1,2})月(\d{1,2})日?$/);
    if(m) return ymd(new Date(+year, +m[1] - 1, +m[2]));
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m) return ymd(new Date(+m[1], +m[2] - 1, +m[3]));
    return "";
  }

  /* titles = {クラス: {"0": {p1:"国語", …}, …}}（0〜4 は月〜金）
     classes = 出す交流級。**選んだ交流級の列だけに書く。** */
  function exportTanpopo(year, mondayISO, titles, classes){
    const cfg = readConfig();
    const id = String(cfg["たんぽぽファイルID"] || "").trim();
    if(!id) throw new Error("「設定」シートの「たんぽぽファイルID」が空です。"
                          + "たんぽぽ時間割のスプレッドシートIDを入れてください");
    const ss = SpreadsheetApp.openById(id);
    const want = String(cfg["たんぽぽシート名"] || "").trim();
    const sh = want ? ss.getSheetByName(want) : ss.getSheets()[0];
    if(!sh) throw new Error("たんぽぽ時間割に「" + want + "」というシートがありません");

    const pick = {};
    for(const c of (classes || [])) pick[tpNorm(c)] = true;
    const dayOf = {};                       /* 日付 → 月〜金の何日目か */
    for(let i = 0; i < 5; i++) dayOf[ymd(addDays_(mondayISO, i))] = i;

    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if(lastRow < 2 || lastCol < 2) throw new Error("たんぽぽ時間割のシートが空です");
    const colA = sh.getRange(1, 1, lastRow, 1).getValues();

    /* 日付の入った行を探す。**先頭行を決め打ちしない**（行が足された表もある） */
    const blocks = [];
    for(let r = 0; r < lastRow; r++){
      const d = tpDate(colA[r][0], year);
      if(d && dayOf[d] !== undefined) blocks.push({row: r + 1, day: dayOf[d], date: d});
    }

    const slotIds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const report = {wrote:0, days:0, skipped:[], unknown:{}, file:ss.getName()};

    for(const b of blocks){
      if(b.row + 15 > lastRow){ report.skipped.push(b.date + "（行が足りない）"); continue; }
      const grid = sh.getRange(b.row, 1, 16, lastCol).getValues();
      /* 形を確かめる。合わない日は書かない */
      let bad = "";
      for(const m of TP_MARK)
        if(tpNorm(grid[m[0]][0]).indexOf(tpNorm(m[1])) < 0)
          bad = bad || ("+" + m[0] + " が「" + m[1] + "」でない");
      if(bad){ report.skipped.push(b.date + "（" + bad + "）"); continue; }

      /* その日の見出しを読んで、書く列を決める */
      const cols = [];
      for(let c = 1; c < lastCol; c++){
        const cls = tpNorm(grid[0][c]);
        if(!/^[1-9]-[1-9]$/.test(cls)) continue;      /* 支援員などの列は飛ばす */
        if(!pick[cls]){ continue; }
        if(!titles[cls]){ report.unknown[cls] = true; continue; }
        cols.push({c, cls});
      }
      if(!cols.length){ report.skipped.push(b.date + "（出す交流級の列が無い）"); continue; }

      const from = Math.min.apply(null, cols.map(x => x.c));
      const to   = Math.max.apply(null, cols.map(x => x.c));
      for(let i = 0; i < TP_TITLE_ROW.length; i++){
        const rowIdx = TP_TITLE_ROW[i];
        const line = grid[rowIdx].slice(from, to + 1);   /* 触らない列はそのまま戻す */
        for(const x of cols){
          const v = ((titles[x.cls] || {})[String(b.day)] || {})[slotIds[i]];
          line[x.c - from] = (v === undefined || v === null) ? "" : String(v);
          report.wrote++;
        }
        sh.getRange(b.row + rowIdx, from + 1, 1, line.length).setValues([line]);
      }
      report.days++;
    }
    SpreadsheetApp.flush();
    report.unknown = Object.keys(report.unknown);
    if(!report.days && !report.skipped.length)
      report.skipped.push("この週の日付が、たんぽぽ時間割のA列に見つかりません");
    return report;
  }

  /* 旧・週案（1枚に全クラス）を、クラスごとのシートへ移す。
     **何度走らせても同じ。** すでに移してあるコマは上書きするだけ。
     旧シートは消さない（移し損ねたときに元を見られるように）。 */
  function migratePlan(){
    const src = Sheets.sheet("週案");
    if(!src) return {moved:0, sheets:0, note:"旧・週案シートは無い"};
    const rows = Sheets.readAll("週案").rows;
    const rank = slotRank(), byName = {}, seen = {};
    for(const r of rows){
      const layer = String(r["層"] || "").trim();
      const target = Sheets.asClass(r["対象"]);
      if(!layer) continue;
      const date = ymd(r["日付"]);
      if(!date || String(date) === "NaN-aN-aN") continue;
      const name = Sheets.planName(layer, target);
      const key = [String(r["年度"]), date, String(r["時程"]), layer, target].join("\t");
      if(seen[key]) continue;            /* 同じコマが何度も積まれている（旧版の不具合） */
      seen[key] = true;
      (byName[name] || (byName[name] = [])).push({
        "年度":r["年度"], "日付":date,
        "曜日":DOW_[new Date(date + "T00:00:00").getDay()],
        "時程":r["時程"], "題名":r["題名"], "詳細":r["詳細"],
        "教科コード":r["教科コード"], "層":layer, "対象":target,
        "担当":r["担当"], "更新者":r["更新者"], "更新時刻":r["更新時刻"]
      });
    }
    let moved = 0, sheets = 0;
    for(const name in byName){
      const add = byName[name];
      const cur = Sheets.readPlan(name, ymd);
      const index = {};
      cur.forEach((r, i) => {
        index[[String(r["年度"]), r["日付"], String(r["時程"]),
               String(r["層"]), Sheets.asClass(r["対象"])].join("\t")] = i;
      });
      for(const o of add){
        const k = [String(o["年度"]), o["日付"], String(o["時程"]),
                   String(o["層"]), o["対象"]].join("\t");
        if(index[k] !== undefined) cur[index[k]] = o;
        else { index[k] = cur.length; cur.push(o); }
        moved++;
      }
      cur.sort(function(x, y){
        if(String(x["年度"]) !== String(y["年度"]))
          return String(x["年度"]) < String(y["年度"]) ? -1 : 1;
        if(x["日付"] !== y["日付"]) return x["日付"] < y["日付"] ? -1 : 1;
        const rx = rank[String(x["時程"])], ry = rank[String(y["時程"])];
        return (rx === undefined ? 99 : rx) - (ry === undefined ? 99 : ry);
      });
      Sheets.writePlan(name, cur);
      sheets++;
    }
    SpreadsheetApp.flush();
    return {moved, sheets};
  }

  /* 学級編成。**その年度の行だけ入れ替える。** 前の年度の行には触らない。 */
  function writeRoster(year, classes, specials, week1, tanpopo){
    /* **空の編成では上書きしない。** 一度でも空で書くと、その年度の
       クラスの行が全部消える。画面の不具合や通信の途中切れで空が届いても、
       シートの側で止める。消したいときは、シートを人が直す。 */
    let n = 0;
    for(const g in (classes || {})) n += (classes[g] || []).length;
    if(!n) throw new Error("学級編成が空です。シートのクラス行は消しません");

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

  /* 固定時間割の取り込み。**クラスごと・週ごとに丸ごと入れ替える。**
     1クラスずつ40回に分けて送ると、途中で切れたときに半分だけ入った表が残る。
     table = {クラス: {A:{"曜日|時程":{title,subject}}, B:{…}}} */
  function writeBaseAll(year, table){
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try{
      const target = {};
      for(const cls in (table || {})) target[Sheets.asClass(cls)] = true;
      for(const r of Sheets.readAll("基本時間割").rows)
        if(String(r["年度"]) === String(year) && target[Sheets.asClass(r["クラス"])])
          Sheets.blankRow("基本時間割", r.__row);
      const adds = [];
      for(const cls in (table || {}))
        for(const v of ["A", "B"]){
          const bank = (table[cls] || {})[v] || {};
          for(const k in bank){
            const p = k.split("|");
            adds.push(Sheets.toArray("基本時間割", {
              "年度":year, "クラス":cls, "週":v, "曜日":p[0], "時程":p[1],
              "教科コード":bank[k].subject || "", "表示名":bank[k].title || ""
            }));
          }
        }
      Sheets.appendRows("基本時間割", adds);
      SpreadsheetApp.flush();
      return {classes:Object.keys(table || {}).length, rows:adds.length};
    } finally {
      lock.releaseLock();
    }
  }

  /* 貼り付けたシートを、そのままの形で渡す。読み方は画面側（src/js/fixed.js）。
     **読み方を1か所にしておく。**シート用と貼り付け用で読み方が分かれると、
     片方だけ直したときに結果が食い違う。 */
  function readPaste(){
    return Sheets.readGrid(Sheets.PASTE);
  }

  function addDays_(isoStr, n){
    const p = String(isoStr).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] + n);
  }

  return {readWeek, readBase, readRoster, readConfig, readSlots, readSubjects,
          writeCells, writeRoster, writeBase, writeBaseAll, readPaste,
          exportTanpopo, migratePlan, ymd};
})();

/* ── 画面から呼ぶ口。**すべて1行目で Gate.check()。** ───────── */

/* 立ち上がりの1回で、要るものを全部返す。
   **往復の回数がそのまま待ち時間になる。** 設定・時程・教科・その年度を
   別々に取りに行くと、入口が出るまでに3回待つことになる。 */
function apiBoot(year){
  const me = Gate.check();
  const out = {
    me:       me.email,
    config:   Store.readConfig(),
    slots:    Store.readSlots(),
    subjects: Store.readSubjects()
  };
  if(year){
    out.year   = +year;
    out.roster = Store.readRoster(+year);
    out.base   = Store.readBase(+year);
  }
  return out;
}
function apiReadYear(year){
  Gate.check();
  return {roster: Store.readRoster(year), base: Store.readBase(year)};
}
function apiReadWeek(year, mondayISO, targets){
  Gate.check();
  return Store.readWeek(year, mondayISO, targets);
}
function apiWriteCells(year, patches){
  Gate.check();
  return Store.writeCells(year, patches);
}
/* 週案シートを、いまの学級編成のぶんだけ先に作っておく。
   書くまで無いと、担任が「自分のシートが無い」と探すことになる。 */
function setupPlanSheets(year){
  Gate.check();
  const y = year || new Date().getFullYear();
  const r = Store.readRoster(y);
  const made = [];
  const want = [Sheets.planName("school", "")];
  for(const g in r.classes){
    want.push(Sheets.planName("grade", g));
    for(const c of r.classes[g]) want.push(Sheets.planName("home", c));
  }
  for(const n of want)
    if(!Sheets.sheet(n)){ Sheets.ensurePlan(n); made.push(n); }
  return {made};
}

/* 旧・週案（1枚に全クラス）から移す。エディタから1回だけ実行する。 */
function migratePlanSheets(){
  Gate.check();
  const r = Store.migratePlan();
  const msg = "移したコマ: " + r.moved + "／シート: " + r.sheets
            + (r.note ? "\n" + r.note : "")
            + "\n旧・週案シートはそのまま残してある。";
  try{ SpreadsheetApp.getUi().alert(msg); }catch(e){ Logger.log(msg); }
  return r;
}

function apiWriteRoster(year, classes, specials, week1, tanpopo){
  Gate.check();
  return Store.writeRoster(year, classes, specials, week1, tanpopo);
}
function apiWriteBase(year, cls, variant, bank){
  Gate.check();
  return Store.writeBase(year, cls, variant, bank);
}
function apiWriteBaseAll(year, table){
  Gate.check();
  return Store.writeBaseAll(year, table);
}
function apiReadPaste(){
  Gate.check();
  return Store.readPaste();
}
function apiExportTanpopo(year, mondayISO, titles, classes){
  Gate.check();
  return Store.exportTanpopo(year, mondayISO, titles, classes);
}
