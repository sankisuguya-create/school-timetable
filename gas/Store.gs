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
  /* 何日目か。**画面は「月曜から数えて何日目か」でコマを持っている。**
     シートは日付で持っているので、返すときにここで直す。
     ここを日付のまま返すと、書いたものは正しくシートに入るのに、
     次に開いたときに画面が見つけられず、基本時間割に戻って見える。 */
  function dayOffset_(dateISO, mondayISO){
    const a = String(dateISO).split("-"), b = String(mondayISO).split("-");
    const x = Date.UTC(+a[0], +a[1] - 1, +a[2]), y = Date.UTC(+b[0], +b[1] - 1, +b[2]);
    return Math.round((x - y) / 86400000);
  }

  function readWeek(year, mondayISO, targets){
    const start = mondayISO, end = ymd(addDays_(mondayISO, 6));
    const w = {school:{}, grade:{}, special:{}, home:{}};
    const names = {};
    if(targets && targets.length){
      for(const t of targets) names[Sheets.planName(t.layer, t.target)] = true;
    } else {
      for(const n of Sheets.planNames()) names[n] = true;
    }
    const all = Sheets.planMap();          /* シートを1枚ずつ探しに行かない */
    for(const name in names){
      if(!all[name]) continue;             /* まだ1度も書いていないクラス */
      for(const r of Sheets.readPlan(name, ymd, all)){
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
        const off = dayOffset_(date, mondayISO);
        if(off < 0 || off > 6) continue;
        const k = off + "|" + r["時程"];      /* **画面は 何日目|時程 で持つ** */
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

  /* ── 人が手で書いた行も読む ────────────────────
     基本時間割シートは**人が直接書く場所**でもある。
     機械が書いた形しか読めないと、手で書き足した行が黙って無視される。
     入っていないのか読めていないのかが画面から分からず、いちばん困る。

     曜日は「月」でも 0 でも読む。時程は「p1」でも「1」でも読む。 */
  const DOW_JP = ["月", "火", "水", "木", "金"];
  function dayIndex(v){
    if(v === 0) return 0;
    const t = String(v == null ? "" : v).normalize("NFKC").trim();
    if(/^[0-4]$/.test(t)) return +t;
    for(let i = 0; i < DOW_JP.length; i++)
      if(t.charAt(0) === DOW_JP[i]) return i;     /* 月・月曜・月曜日 */
    return -1;
  }
  /* 時程。IDそのままが基本。数字だけなら、授業の行の上から数える */
  function slotId(v, lessons){
    const t = String(v == null ? "" : v).normalize("NFKC").trim();
    if(!t) return "";
    if(lessons.indexOf(t) >= 0) return t;
    if(/^[1-9]$/.test(t) && lessons[+t - 1]) return lessons[+t - 1];
    return t;                                     /* 休み時間などはそのまま */
  }

  function readBase(year, warn){
    const rows = Sheets.readAll("基本時間割").rows;
    const ids = Sheets.readAll("時程").rows
      .filter(r => String(r["種別"]).indexOf("授業") >= 0)
      .map(r => String(r["ID"]).trim());
    const out = {};
    for(const r of rows){
      if(String(r["年度"]) !== String(year)) continue;
      const cls = Sheets.asClass(r["クラス"]), v = String(r["週"] || "A").trim() || "A";
      const d = dayIndex(r["曜日"]), sl = slotId(r["時程"], ids);
      if(d < 0 || !sl || !cls){
        if(warn) warn.push(r.__row + "行目：" + (!cls ? "クラス" : d < 0 ? "曜日" : "時程")
                         + "「" + String(!cls ? r["クラス"] : d < 0 ? r["曜日"] : r["時程"])
                         + "」が読めない");
        continue;
      }
      const bank = out[cls] || (out[cls] = {});
      (bank[v] || (bank[v] = {}))[d + "|" + sl] = {
        title: String(r["表示名"] || ""), subject: String(r["教科コード"] || "") || null
      };
    }
    return out;
  }

  /* たんぽぽ児童がいる交流級と、その**人数**。
     たんぽぽ時間割は児童ごとに1列なので、2人いれば2列に書く。
     数で書くのが本筋だが、○ や「あり」と書いてあれば1人として読む
     （前は○で持っていた。書き直させない）。 */
  function tpNum(v){
    const t = String(v == null ? "" : v).trim().toLowerCase();
    if(t === "" || t === "false" || t === "0" || t === "×" || t === "x" || t === "-") return 0;
    const m = t.match(/^(\d+)/);
    if(m) return Math.min(9, +m[1]);
    return 1;
  }

  /* 年度の欄が空の行は「どの年度でも使う既定」。年度を書いた行があれば、そちらが勝つ。 */
  function readRoster(year){
    const tanpopo = {};
    const classes = pickYear_("クラス", year).reduce((a, r) => {
      const g = Sheets.asClass(r["学年"]), c = Sheets.asClass(r["クラス"]);
      if(g && c){
        (a[g] || (a[g] = [])).push(c);
        const n = tpNum(r["たんぽぽ交流級"]);
        if(n > 0) tanpopo[c] = n;
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
  /* 1日ぶんのブロックの中で、授業名の行がどこかを決める。
     **行数を決め打ちしない。** 実物は日によって 16・18・15・18・18 行と
     まちまちで、空行の入り方も揃っていない。決め打ちすると、
     揃えてもらうまで1日も書けない。揃えたあとに誰かが行を足しても壊れる。

     代わりに「中休み」「給食」「昼休み」の行を探して、そこから数える。
     この3つは日ブロックの骨で、動かすことはない。

       1校時 = 中休み − 4      2校時 = 中休み − 2
       3校時 = 中休み + 1      4校時 = 中休み + 3
       5校時 = 昼休み + 1      6校時 = 昼休み + 3     （いずれも授業名の行）

     見つからない日は、その日だけ書かない。 */
  const TP_MARKS = ["中休み", "給食", "昼休み"];
  function tpRows(grid, len){
    const at = {};
    for(let r = 1; r < len; r++){
      const a = tpNorm(grid[r][0]);
      for(const m of TP_MARKS)
        if(at[m] === undefined && a.indexOf(tpNorm(m)) >= 0) at[m] = r;
    }
    for(const m of TP_MARKS) if(at[m] === undefined) return {bad:"「" + m + "」の行が無い"};
    const br = at["中休み"], lu = at["昼休み"];
    if(!(br >= 5)) return {bad:"「中休み」が上すぎる（1・2校時の行が足りない）"};
    if(!(lu > br)) return {bad:"「昼休み」が「中休み」より上にある"};
    if(!(at["給食"] > br + 3)) return {bad:"「給食」が4校時より上にある"};
    const rows = [br - 4, br - 2, br + 1, br + 3, lu + 1, lu + 3];
    /* **短い日は、ある校時だけ書く。** 水曜は6校時が無いので2行短い。
       日ごと丸ごと飛ばすと、1〜5校時まで書けるのに書かないことになる。 */
    const miss = [];
    for(let i = 0; i < rows.length; i++)
      if(rows[i] < 1 || rows[i] >= len){ miss.push(i + 1); rows[i] = -1; }
    if(rows.every(function(r){ return r < 0; })) return {bad:"授業名の行が1つも無い"};
    return {rows, miss};
  }

  /* ファイルの指定。**URL をそのまま貼っても通す。**
     ID だけを抜いて貼るのは、知っていないとできない操作。
     知らずに URL を貼ると「Illegal spreadsheet id or key」とだけ出て、
     何が悪いのか分からない。 */
  function fileId(v, label){
    const t = String(v == null ? "" : v).trim();
    if(!t) throw new Error("「設定」シートの「" + label + "」が空です。"
                         + "スプレッドシートのURL（またはID）を入れてください");
    const m = t.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)
           || t.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
    if(m) return m[1];
    if(/^[A-Za-z0-9_-]{20,}$/.test(t)) return t;
    throw new Error("「設定」シートの「" + label + "」が読めません（" + t.slice(0, 40)
                  + "…）。スプレッドシートのURLをそのまま貼ってください");
  }

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
  /* たんぽぽ時間割のファイルとシートを開く。3つの入口（見る・作る・出す）で使う */
  function tpOpen(){
    const cfg = readConfig();
    const id = fileId(cfg["たんぽぽファイルID"], "たんぽぽファイルID");
    let ss;
    try{ ss = SpreadsheetApp.openById(id); }
    catch(e){
      throw new Error("たんぽぽ時間割のファイルを開けません（ID " + id + "）。"
        + "URLが正しいか、このスクリプトを置いたアカウントに共有されているかを見てください");
    }
    const want = String(cfg["たんぽぽシート名"] || "").trim();
    const sh = want ? ss.getSheetByName(want) : ss.getSheets()[0];
    if(!sh) throw new Error("たんぽぽ時間割に「" + want + "」というシートがありません。"
      + "あるのは「" + ss.getSheets().map(function(x){ return x.getName(); }).join("」「")
      + "」");
    return {ss, sh, cfg, want};
  }

  /* ── 形をみる ──────────────────────────────────
     「出せない」ときに、**何がどう違うのか**を見せる。
     推し量って直すより、いまの形をそのまま出したほうが早い。 */
  function shapeTanpopo(mondayISO){
    const {ss, sh} = tpOpen();
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    const out = {file:ss.getName(), sheet:sh.getName(),
                 sheets:ss.getSheets().map(function(x){ return x.getName(); }),
                 rows:lastRow, cols:lastCol, days:[], marks:[], note:[]};
    if(lastRow < 2 || lastCol < 2){ out.note.push("シートが空です"); return out; }
    const colA = sh.getRange(1, 1, lastRow, 1).getValues();
    const year = +String(mondayISO).slice(0, 4);
    for(let r = 0; r < lastRow; r++){
      const a = tpNorm(colA[r][0]);
      const d = tpDate(colA[r][0], year);
      if(d) out.days.push({row:r + 1, date:d});
      for(const m of TP_MARKS) if(a.indexOf(tpNorm(m)) >= 0) out.marks.push({row:r + 1, mark:m});
    }
    /* いちばん上の日ブロックの見出しを、そのまま見せる */
    const first = out.days.length ? out.days[0].row
                : (out.marks.length ? Math.max(1, out.marks[0].row - 5) : 0);
    if(first){
      const head = sh.getRange(first, 1, 1, lastCol).getValues()[0];
      out.headRow = first;
      out.head = head.slice(0, 30).map(function(v){ return String(v == null ? "" : v); });
      out.classCols = out.head.filter(function(v){ return /^[1-9]-[1-9]$/.test(tpNorm(v)); }).length;
    }
    if(!out.days.length) out.note.push("A列に日付が見つかりません");
    if(!out.marks.length) out.note.push("A列に「中休み」「給食」「昼休み」が見つかりません");
    if(out.classCols === 0) out.note.push("交流学級（1-1 のような字）の見出しが1つもありません");
    return out;
  }

  /* ── 形を作る ──────────────────────────────────
     **手で整えるのをやめる。** 1日16行・児童ごとに1列の形をこちらで作る。
     いまのシートは名前を変えて残す（消さない）。 */
  const TP_BUILD_ROWS = 16;
  function buildTanpopo(year, mondayISO, counts, slots){
    const {ss, sh, cfg, want} = tpOpen();
    const name = sh.getName();

    /* 列を決める。**児童ごとに1列。** 2人いる交流級は2列 */
    const cols = [];
    const cs = Object.keys(counts || {}).sort(function(a, b){
      const pa = String(a).split("-"), pb = String(b).split("-");
      return (+pa[0] - +pb[0]) || (+pa[1] - +pb[1]);
    });
    for(const c of cs)
      for(let i = 0; i < (+counts[c] || 0); i++) cols.push(tpNorm(c));
    if(!cols.length) throw new Error("交流級を1つも選んでいません");
    const staff = String(cfg["たんぽぽ支援員"] || "").split(/[,、\s]+/)
      .map(function(x){ return x.trim(); }).filter(Boolean);

    const width = 1 + cols.length + staff.length;
    const ids = (slots && slots.length === 6) ? slots : ["p1","p2","p3","p4","p5","p6"];
    const rows = [];
    rows.push(["たんぽぽ 週案"].concat(new Array(width - 1).fill("")));
    for(let d = 0; d < 5; d++){
      /* **日付として置く。** 字で置くと、シートの側で日付になったりならなかったり
         して、次に読むときに見つけられないことがある */
      const head = [addDays_(mondayISO, d)].concat(cols, staff);
      rows.push(head);
      const lab = ["1", "", "2", "", "中休み", "3", "", "4", "", "給食", "昼休み",
                   "5", "", "6", ""];
      for(const t of lab) rows.push([t].concat(new Array(width - 1).fill("")));
    }

    /* いまのシートは残す。**消さない。** */
    const backup = name + "（前の形 " + Utilities.formatDate(new Date(), TZ, "MMdd-HHmm") + "）";
    if(sh.getLastRow() > 1) sh.setName(backup);
    else ss.deleteSheet(sh);
    const nw = ss.insertSheet(name, 0);
    nw.getRange(1, 1, rows.length, width).setValues(rows);
    nw.setFrozenColumns(1);
    nw.setFrozenRows(1);
    for(let d = 0; d < 5; d++)
      nw.getRange(2 + d * TP_BUILD_ROWS, 1).setNumberFormat("m/d（ddd）");

    /* 授業名の行は灰色。担当者・場所が「た」で始まる列だけ、条件付き書式で白に戻す */
    const titleOff = [1, 3, 6, 8, 12, 14];
    const rules = [];
    for(let d = 0; d < 5; d++){
      const top = 2 + d * TP_BUILD_ROWS;
      for(const off of titleOff){
        const r = top + off;
        const rng = nw.getRange(r, 2, 1, width - 1);
        rng.setBackground(Sheets.TANPOPO_FILL.imported);
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=LEFT(B' + (r + 1) + ',1)="た"')
          .setBackground(Sheets.TANPOPO_FILL.own).setRanges([rng]).build());
      }
      nw.getRange(top, 1, 1, width).setFontWeight("bold");
      for(const off of [5, 10, 11])
        nw.getRange(top + off, 1, 1, width).setBackground("#EFEFEF");
    }
    nw.setConditionalFormatRules(rules);
    SpreadsheetApp.flush();
    return {file:ss.getName(), sheet:name, cols:cols.length, staff:staff.length,
            rows:rows.length, backup:(sh.getLastRow() > 1 ? backup : ""), list:cols};
  }

  function exportTanpopo(year, mondayISO, titles, classes, slots){
    const {ss, sh} = tpOpen();

    /* classes は {クラス:人数} でも、クラス名の並びでも受ける */
    const pick = {};
    if(Array.isArray(classes)) for(const c of classes) pick[tpNorm(c)] = 1;
    else for(const c in (classes || {})) if(+classes[c] > 0) pick[tpNorm(c)] = +classes[c];
    const dayOf = {};                       /* 日付 → 月〜金の何日目か */
    for(let i = 0; i < 5; i++) dayOf[ymd(addDays_(mondayISO, i))] = i;

    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if(lastRow < 2 || lastCol < 2) throw new Error("たんぽぽ時間割のシートが空です");
    const colA = sh.getRange(1, 1, lastRow, 1).getValues();

    /* 日ブロックを探す。まず日付で。**行が足された表もあるので先頭行は決め打ちしない。** */
    const blocks = [];
    for(let r = 0; r < lastRow; r++){
      const d = tpDate(colA[r][0], year);
      if(d && dayOf[d] !== undefined) blocks.push({row: r + 1, day: dayOf[d], date: d});
    }

    /* この週の日付が入っていないとき。**日付だけを入れ直して使う。**
       たんぽぽ時間割は毎週おなじシートを使い回す。週が変わるたびに人が
       日付を打ち替えるのでは、打ち替え忘れた週に何も入らない。
       「中休み」の行を骨にして日ブロックを見つけ、その先頭に日付を書く。 */
    let redated = 0;
    if(blocks.length < 5){
      const starts = [];
      for(let r = 0; r < lastRow; r++)
        if(tpNorm(colA[r][0]).indexOf(tpNorm("中休み")) >= 0 && r - 5 >= 0)
          starts.push(r - 5 + 1);                 /* +5 が中休み → その5つ上 */
      if(starts.length === 5){
        blocks.length = 0;
        for(let i = 0; i < 5; i++){
          const d = ymd(addDays_(mondayISO, i));
          sh.getRange(starts[i], 1).setValue(new Date(d + "T00:00:00"));
          blocks.push({row: starts[i], day: i, date: d});
          redated++;
        }
        SpreadsheetApp.flush();
      }
    }

    /* 校時のIDは画面から受け取る。時程シートを直した学校でも合う */
    const slotIds = (slots && slots.length === 6)
      ? slots : ["p1", "p2", "p3", "p4", "p5", "p6"];
    const report = {wrote:0, days:0, skipped:[], short:[], unknown:{},
                    redated:redated, file:ss.getName()};

    /* 次の日の日付までが、その日のブロック */
    for(let bi = 0; bi < blocks.length; bi++){
      const b = blocks[bi];
      const end = (bi + 1 < blocks.length) ? blocks[bi + 1].row : lastRow + 1;
      const len = Math.min(end - b.row, lastRow - b.row + 1);
      if(len < 6){ report.skipped.push(b.date + "（行が足りない）"); continue; }
      const grid = sh.getRange(b.row, 1, len, lastCol).getValues();
      const found = tpRows(grid, len);
      if(found.bad){ report.skipped.push(b.date + "（" + found.bad + "）"); continue; }
      const TITLE = found.rows;
      if(found.miss.length)
        report.skipped.push(b.date + "（" + found.miss.join("・") + "校時の行が無い）");

      /* その日の見出しを読んで、書く列を決める */
      const cols = [], seen = {};
      for(let c = 1; c < lastCol; c++){
        const cls = tpNorm(grid[0][c]);
        if(!/^[1-9]-[1-9]$/.test(cls)) continue;      /* 支援員などの列は飛ばす */
        if(!pick[cls]){ continue; }
        if(!titles[cls]){ report.unknown[cls] = true; continue; }
        seen[cls] = (seen[cls] || 0) + 1;
        cols.push({c, cls});
      }
      /* **人数と列の数が合っているか。** 合わないと、誰かのぶんが入らないか、
         もう居ない児童の列に入る。落ちないので気づかない */
      for(const cls in pick){
        const got = seen[cls] || 0;
        if(got !== pick[cls])
          report.short.push(b.date + " " + cls + "：" + pick[cls] + "人だが列は" + got + "つ");
      }
      if(!cols.length){ report.skipped.push(b.date + "（出す交流級の列が無い）"); continue; }

      /* **選んだ列だけを書く。** 続きになっている列はまとめて1回で書く。
         触らない列を巻き込むと、そこに式が入っていたときに値へ潰れる。 */
      cols.sort(function(p, q){ return p.c - q.c; });
      const runs = [];
      for(const x of cols){
        const last = runs[runs.length - 1];
        if(last && x.c === last[last.length - 1].c + 1) last.push(x);
        else runs.push([x]);
      }
      for(let i = 0; i < TITLE.length; i++){
        if(TITLE[i] < 0) continue;                 /* その校時の行が無い日 */
        for(const run of runs){
          const line = run.map(function(x){
            const v = ((titles[x.cls] || {})[String(b.day)] || {})[slotIds[i]];
            report.wrote++;
            return (v === undefined || v === null) ? "" : String(v);
          });
          sh.getRange(b.row + TITLE[i], run[0].c + 1, 1, line.length).setValues([line]);
        }
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
      const tp = tpNormObj_(tanpopo);
      /* **人の手で入れた欄を消さない。** 画面が持っていないのは
         担任メールと専科のメールだけなので、いまの行から引き継ぐ。
         引き継がないと、学級編成を1回直すたびに連絡先が全部消える。 */
      const mailOf = keep_("クラス", year, r => Sheets.asClass(r["クラス"]), r => String(r["担任メール"] || ""));
      const spMail = keep_("専科", year, r => String(r["教科コード"] || "").trim(), r => String(r["メール"] || ""));
      const clsRows = [];
      for(const g of Object.keys(classes || {}).sort())
        for(const c of classes[g]) clsRows.push({
          "年度":year, "学年":g, "クラス":c, "担任メール": mailOf[c] || "",
          "たんぽぽ交流級": tp[c] ? tp[c] : ""
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
  /* 前は「クラス名の並び」で来ていた。人数の形に直す */
  function tpNormObj_(v){
    const out = {};
    if(Array.isArray(v)){ for(const c of v) out[Sheets.asClass(c)] = 1; return out; }
    if(v && typeof v === "object")
      for(const c in v){ const n = +v[c] || 0; if(n > 0) out[Sheets.asClass(c)] = Math.min(9, n); }
    return out;
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
        /* **曜日は「月」で書く。** 人が直接書き足す場所なので、
           0〜4 で書くと、隣の行にならって書いた行が読めなくなる */
        adds.push(Sheets.toArray("基本時間割", {
          "年度":year, "クラス":cls, "週":variant,
          "曜日":(DOW_JP[+p[0]] || p[0]), "時程":p[1],
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
              "年度":year, "クラス":cls, "週":v,
              "曜日":(DOW_JP[+p[0]] || p[0]), "時程":p[1],
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
          exportTanpopo, shapeTanpopo, buildTanpopo, migratePlan, ymd};
})();

/* ── 画面から呼ぶ口。**すべて1行目で Gate.check()。** ───────── */

/* 立ち上がりの1回で、要るものを全部返す。
   **往復の回数がそのまま待ち時間になる。** 設定・時程・教科・その年度を
   別々に取りに行くと、入口が出るまでに3回待つことになる。 */
function apiBoot(year){
  const me = Gate.check();
  const out = {
    me:       me.email,
    file:     Sheets.bookName(),        /* 管理画面に出す。どのファイルを開いているか */
    config:   Store.readConfig(),
    slots:    Store.readSlots(),
    subjects: Store.readSubjects()
  };
  if(year){
    const warn = [];
    out.year   = +year;
    out.roster = Store.readRoster(+year);
    out.base   = Store.readBase(+year, warn);
    out.warn   = warn;
  }
  return out;
}
function apiReadYear(year){
  Gate.check();
  const warn = [];
  const base = Store.readBase(year, warn);
  return {roster: Store.readRoster(year), base, warn};
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
function apiShapeTanpopo(mondayISO){
  Gate.check();
  return Store.shapeTanpopo(mondayISO);
}
function apiBuildTanpopo(year, mondayISO, counts, slots){
  Gate.check();
  return Store.buildTanpopo(year, mondayISO, counts, slots);
}
function apiExportTanpopo(year, mondayISO, titles, classes, slots){
  Gate.check();
  return Store.exportTanpopo(year, mondayISO, titles, classes, slots);
}
