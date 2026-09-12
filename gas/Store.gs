/* ==================================================================
   Store.gs — 週案の読み書き。

   **画面から呼べる関数は、すべて1行目で Gate.check() を呼ぶ。**
   URL を開ける人は google.script.run で直接叩ける。
   画面を出さないのは目隠しであって関門ではない。

   勝ち負けは「最新の状態を見たうえで、最後に書いたもの」で決まる
   （docs/spec.md 3節）。その時刻は **サーバが打つ**。教師それぞれの PC の
   時計を信じると、時計が進んでいる人がいつも勝つ。
   最新を見ていない保存は writeCells がコマ単位で止める（expectedAt）。
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
          /* **競合を見るための物差し。** at とは別に持つ。
             at は層の重ね順（あとから書いたものが上に出る）にも使うので、
             更新時刻の無い行を負の値にすると、その行が基本時間割より
             下に沈んで画面から消える。だから at は 0 のままにする。

             sat の 0 は「その行がまだ無い」の意味に使う。
             行はあるのに更新時刻が無い（1.3.0 より前に書かれた行、
             人が手で足した行）を 0 と同じ扱いにすると、
             画面が「新しいコマだ」と思って送ってくる 0 と一致してしまい、
             見えないまま上書きできてしまう。だから -1 で区別する。 */
          sat:     Sheets.isDate(r["更新時刻"]) ? r["更新時刻"].getTime() : -1,
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
    /* **提出の印も一緒に返す。** 別に取りに行くと、その回数だけ待つ。
       週の読みは週ごとに1回来るので、ここに載せるのがいちばん安い */
    w.submits = tpSubmits(year, mondayISO);
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

  /* そのクラスのたんぽぽ児童が、**どのたんぽぽ組にいるか**。
     たんぽぽ時間割は児童ごとに1列で、たんぽぽ担当は組ごとに見るので、
     出す列も 1組の全員 → 2組の全員 … の順に並べる。

       ""        いない
       "1"       たんぽぽ1組に1人
       "1,2"     1組に1人・2組に1人（合わせて2人＝2列）
       "1,1"     1組に2人
       "○"       組が分からない。1組として読む（前は○で持っていた）

     **前の版では、この欄は「人数」だった。** 「2」は2人の意味だったが、
     いまは「2組に1人」として読む。版を上げたあと、たんぽぽの画面で
     並べ直す（→ docs/setup.md Step 8）。 */
  function tpGroupsOf_(v){
    const t = String(v == null ? "" : v).trim().toLowerCase();
    if(t === "" || t === "false" || t === "0" || t === "×" || t === "x" || t === "-") return [];
    const out = [];
    for(const part of t.split(/[,、\s]+/)){
      const m = part.match(/^(\d+)/);
      if(m && +m[1] > 0) out.push(Math.min(99, +m[1]));
      else if(part) out.push(1);        /* ○ や「あり」。組が分からないので1組 */
    }
    return out.length ? out : [1];
  }

  /* 年度の欄が空の行は「どの年度でも使う既定」。年度を書いた行があれば、そちらが勝つ。 */
  function readRoster(year){
    const tanpopo = {};                 /* たんぽぽ組の番号 → 交流級の並び */
    const classes = pickYear_("クラス", year).reduce((a, r) => {
      const g = Sheets.asClass(r["学年"]), c = Sheets.asClass(r["クラス"]);
      if(g && c){
        (a[g] || (a[g] = [])).push(c);
        for(const n of tpGroupsOf_(r["たんぽぽ交流級"]))
          (tanpopo[String(n)] || (tanpopo[String(n)] = [])).push(c);
      }
      return a;
    }, {});
    /* 組の中はクラス順（1-1〜6-4）。**字の順で並べない**（10 が 2 の前に来る） */
    const rank = c => { const m = String(c).match(/^(\d+)-(\d+)$/);
                        return m ? (+m[1]) * 100 + (+m[2]) : 9999; };
    for(const k in tanpopo) tanpopo[k].sort(function(x, y){ return rank(x) - rank(y); });
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

  /* ── 年間行事計画表 ────────────────────────────
     **1行1日の縦長の表を読む**（docs/spec.md 6節）。
     元の表は3か月が横に並んでいるが、そのままは読ませない。
     月ブロックの開始列を1つ間違えると、別の月の行事が別の日付に静かに入る。
     落ちずに、間違った予定が週案に出る。いちばん気づきにくい壊れ方。

     **校時への割り付けはしない。** 行事は日付にしか結びついていない。
     自動でコマに入れると、外れたものを毎週打ち消す作業が生まれる。
     打ち消す作業は、最初から入れない作業より必ず多い。 */
  /* 行事表の置いてあるファイル。**本体とはかぎらない。** */
  function eventBook_(){
    const cfg = readConfig();
    const url = String(cfg["行事ファイルID"] || "").trim();
    if(!url) return {ss: Sheets.book(), outside: false};
    let ss;
    try{ ss = SpreadsheetApp.openById(fileId(url, "行事ファイルID")); }
    catch(e){
      throw new Error("年間行事計画表のファイルを開けません（" + String(e && e.message)
        + "）。URLが正しいか、このスクリプトを置いたアカウントに共有されているかを見てください");
    }
    return {ss: ss, outside: true};
  }
  function eventSheet_(){
    const b = eventBook_();
    return b.outside ? b.ss.getSheetByName(Sheets.EVENTS) : Sheets.sheet(Sheets.EVENTS);
  }
  /* 日付。**Date でも「2026-11-16」でも「11/18」でも読む。**
     年の無い書き方は、その年度の中の日として当てる（4月〜12月はその年、
     1月〜3月は翌年）。 */
  function evDate_(v, year){
    if(Sheets.isDate(v)) return ymd(v);
    const t = String(v == null ? "" : v).normalize("NFKC").trim().replace(/[\s　]/g, "");
    let m = t.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if(m) return ymd(new Date(+m[1], +m[2] - 1, +m[3]));
    m = t.match(/^(\d{1,2})[\/-](\d{1,2})$/) || t.match(/^(\d{1,2})月(\d{1,2})日?$/);
    if(m){
      const mo = +m[1];
      return ymd(new Date(mo >= 4 ? +year : +year + 1, mo - 1, +m[2]));
    }
    return "";
  }

  /* 見出しの語は決まっているが、括弧や空白の揺れは通す */
  function eventCols_(head){
    const at = {};
    head.forEach(function(v, i){
      const t = String(v == null ? "" : v).normalize("NFKC").replace(/[\s　]/g, "");
      if(at.date === undefined && t.indexOf("日付") >= 0) at.date = i;
      else if(at.child === undefined && t.indexOf("児童") >= 0) at.child = i;
      else if(at.staff === undefined && t.indexOf("職員") >= 0) at.staff = i;
      else if(at.week === undefined && t === "週") at.week = i;
    });
    return at;
  }
  /* 年度（4/1 起点）のぶんだけ返す。365行を毎回まるごと返しても仕方がない */
  function readEvents(year){
    const y = +year;
    const sh = eventSheet_();
    if(!sh) return {events:{}, rows:0, warn:["「" + Sheets.EVENTS + "」シートがありません"]};
    const last = sh.getLastRow(), wide = sh.getLastColumn();
    if(last < 2 || !wide) return {events:{}, rows:0, warn:[]};
    const v = sh.getRange(1, 1, last, wide).getValues();
    const at = eventCols_(v[0]);
    if(at.date === undefined)
      return {events:{}, rows:0,
              warn:["「" + Sheets.EVENTS + "」シートに「日付」の列がありません。"
                  + "見出しは " + Sheets.EVENT_COLS.join("／") + " の4つです"]};
    const from = y + "-04-01", to = (y + 1) + "-03-31";
    const out = {}, warn = [];
    let n = 0, bad = 0;
    for(let i = 1; i < v.length; i++){
      const row = v[i];
      const d = evDate_(row[at.date], y);
      if(!d){
        if(String(row[at.date] == null ? "" : row[at.date]).trim()){ bad++;
          if(bad <= 3) warn.push((i + 1) + "行目：日付「"
            + String(row[at.date]).slice(0, 20) + "」が読めない"); }
        continue;
      }
      if(d < from || d > to) continue;                 /* ほかの年度のぶん */
      const c = at.child !== undefined ? String(row[at.child] || "").trim() : "";
      const st = at.staff !== undefined ? String(row[at.staff] || "").trim() : "";
      const w = at.week !== undefined
        ? String(row[at.week] || "").normalize("NFKC").trim().toUpperCase() : "";
      if(!c && !st && !w) continue;                    /* 何も書いていない日 */
      out[d] = {c: c, s: st, w: (w === "A" || w === "B") ? w : ""};
      n++;
    }
    if(bad > 3) warn.push("ほか " + (bad - 3) + " 行の日付が読めない");
    return {events: out, rows: n, warn: warn};
  }

  /* ── 年度の検査 ──────────────────────────────
     4月に開けたとき、**何が足りないかを1画面で言う**。
     足りないまま使い始めると、担任が「自分のクラスが無い」と探すことになる。
     直しはしない。**黙って直すと、直した中身が誰にも見えない。** */
  function checkYear(year){
    const y = +year;
    const items = [];
    const say = (level, what, detail, fix) => items.push({level, what, detail, fix});

    /* 1. クラス */
    const r = readRoster(y);
    const grades = Object.keys(r.classes).sort();
    const cls = grades.reduce((a, g) => a.concat(r.classes[g]), []);
    const own = Sheets.readAll("クラス").rows
      .filter(x => String(x["年度"] || "").trim() === String(y));
    if(!cls.length)
      say("ng", "クラス", "1つも読めない", "「クラス」シートに学年とクラスを入れる");
    else if(!own.length)
      say("warn", "クラス", cls.length + "組（年度の欄が空の行を使っている）",
          y + " の行を作ると、来年度そのまま持ち越さずに済む");
    else
      say("ok", "クラス", cls.length + "組（" + grades.join("・") + "年）", "");

    /* 2. 担任のメール。**児童のアドレスが混ざっていないかも見る。** */
    const bad = [], dup = {}, dups = [], none = [];
    for(const x of (own.length ? own : Sheets.readAll("クラス").rows)){
      const c = Sheets.asClass(x["クラス"]);
      if(!c) continue;
      const m = String(x["担任メール"] || "").trim().toLowerCase();
      if(!m){ none.push(c); continue; }
      if(!Gate.judge(m).ok) bad.push(c + "（" + m + "）");
      if(dup[m]) dups.push(c + "＝" + dup[m]); else dup[m] = c;
    }
    if(bad.length)      say("ng", "担任のメール", "通らないアドレス：" + bad.join("、"),
                            "教職員は なまえ@" + Gate.STAFF_DOMAIN + "。児童のアドレスは入れない");
    else if(dups.length) say("warn", "担任のメール", "同じ人が2クラス：" + dups.join("、"), "写し間違いでないか見る");
    else if(none.length) say("warn", "担任のメール", none.length + "組が空", "空でも書けるが、上書きの知らせが届かない");
    else                 say("ok", "担任のメール", "全クラスに入っている", "");

    /* 3. 専科 */
    if(!r.specials.length) say("warn", "専科", "1つも無い", "「専科」シートに教科コードと表示名を入れる");
    else say("ok", "専科", r.specials.map(s => s.label).join("・"), "");

    /* 4. 時程 */
    const slots = readSlots();
    const lessons = slots.filter(s => s.kind === "lesson");
    /* **放課後（種別＝備考）の行。** setup は無いシートを作るだけなので、
       先にシートを作った学校にはこの行が入らず、画面に放課後の欄が出ない */
    const after = slots.filter(s => s.kind === "note");
    if(!lessons.length) say("ng", "時程", "授業の行が1つも無い", "「時程」シートの種別を「授業」にする");
    else if(!after.length) say("warn", "時程", "放課後（種別＝備考）の行が無い",
                               "エディタから setupSheets を1回走らせると足される");
    else say("ok", "時程", lessons.length + "校時＋放課後（" + slots.length + "行）", "");

    /* 5. 基本時間割。**A週が無いクラスは、開いても空のまま出る。** */
    const warn = [];
    const base = readBase(y, warn);
    const noA = cls.filter(c => !(base[c] && base[c].A && Object.keys(base[c].A).length));
    const noB = cls.filter(c => base[c] && base[c].A && !(base[c].B && Object.keys(base[c].B).length));
    if(warn.length)     say("ng", "基本時間割", "読めない行が " + warn.length + " 行", warn.slice(0, 5).join(" / "));
    else if(noA.length) say("ng", "基本時間割", "A週が空：" + noA.join("、"),
                            "画面の「基本時間割」から入れるか、表から取り込む");
    else if(noB.length) say("warn", "基本時間割", "B週が空：" + noB.join("、"),
                            "A週と同じでよければ「A週をB週へ写す」");
    else say("ok", "基本時間割", cls.length + "組ぶん入っている", "");

    /* 6. 年設定（第1週の月曜）。**ここが空だと週番号が出ない。** */
    if(!r.week1) say("warn", "年設定", "第1週の月曜が空", "「年設定」シートに " + y + " の行を作る");
    else say("ok", "年設定", "第1週の月曜 " + r.week1, "");

    /* 7. たんぽぽ */
    const cfg = readConfig();
    const tpN = Object.keys(r.tanpopo).length;
    if(!String(cfg["たんぽぽファイルID"] || "").trim())
      say("warn", "たんぽぽ", "出し先のファイルが未設定", "「設定」シートの たんぽぽファイルID にURLを貼る");
    else if(!tpN) say("warn", "たんぽぽ", "交流級が1つも選ばれていない", "「クラス」シートの たんぽぽ交流級 に人数を入れる");
    else say("ok", "たんぽぽ", tpN + "組・" +
             Object.keys(r.tanpopo).reduce((a, c) => a + r.tanpopo[c].length, 0) + "人", "");

    /* 7.5 年間行事計画表 */
    let ev = null;
    try{ ev = readEvents(y); }catch(e){ ev = {events:{}, rows:0, warn:[String(e && e.message)]}; }
    if(ev.warn && ev.warn.length)
      say("warn", "年間行事", ev.warn.slice(0, 2).join(" / "),
          "1行1日の縦長の表を「" + Sheets.EVENTS + "」シートに貼る（docs/setup.md Step 9）");
    else if(!ev.rows)
      say("warn", "年間行事", "1日も読めない",
          "1行1日の縦長の表を「" + Sheets.EVENTS + "」シートに貼る（docs/setup.md Step 9）");
    else say("ok", "年間行事", ev.rows + "日ぶん読めている", "");

    /* 8. 週案シート。**担任が開く前に揃えておく。** */
    const have = Sheets.planNames();
    const want = [Sheets.planName("school", "")]
      .concat(grades.map(g => Sheets.planName("grade", g)))
      .concat(cls.map(c => Sheets.planName("home", c)));
    const miss = want.filter(n => have.indexOf(n) < 0);
    if(miss.length) say("warn", "週案シート", miss.length + "枚が未作成",
                        "エディタから setupPlanSheets を1回走らせる（書けば自動でも作られる）");
    else say("ok", "週案シート", want.length + "枚そろっている", "");

    const ng   = items.filter(x => x.level === "ng").length;
    const warn2 = items.filter(x => x.level === "warn").length;
    return {year: y, items, ng, warn: warn2, file: Sheets.bookName()};
  }

  /* ── 年度の退避 ──────────────────────────────
     **年度末に、人がドライブでファイルを丸ごと複製する。**
     こちらは「数える」「照合する」「消す」の3つだけをやる。

     複製をコードで書かないのは、**コピー漏れを原理的に起こさないため**。
     Drive への書き込み権限も要らない。複製は人の手のほうが安全で、速い。

     消すのは週案シートの、その年度の行だけ。**シートも見出しも消さない。**
     基本時間割・クラス・専科は残す（「前年度から写す」がそのまま使える）。

     本体のURLは変わらない。**新年度も教員は今までと同じURLを開く。**
     複製のほうが保管庫になる。 */

  /* ── 中身の指紋 ────────────────────────────────
     **行数とコマ数だけでは、書き換えを見つけられない。**
     複製したあとに「国語」を「校外学習」へ直しても、行数もコマ数も変わらない。
     そのまま消すと、その直しは複製にも本体にも残らない。

     コマの場所（日付・時程・層・対象）を鍵に、中身（題名・詳細・教科コード・
     担当・更新者・更新時刻）を並べて、1コマ1本の字にする。
     照合はこの字どうしで行い、違うコマを名指しする。 */
  const stamp_ = v => Sheets.isDate(v) ? String(v.getTime())
                    : String(v == null ? "" : v).trim();
  function planContent_(rows, y){
    const map = {};
    let n = 0, c = 0, from = "", to = "";
    for(const r of rows){
      if(String(r["年度"]) !== y) continue;
      n++;
      const t = String(r["題名"] || "").trim(), d = String(r["詳細"] || "").trim();
      if(t || d) c++;
      if(!from || r["日付"] < from) from = r["日付"];
      if(!to   || r["日付"] > to)   to = r["日付"];
      const key = [r["日付"], String(r["時程"]).trim(), String(r["層"]).trim(),
                   Sheets.asClass(r["対象"])].join("|");
      map[key] = [t, d, String(r["教科コード"] || "").trim(),
                  String(r["担当"] || "").trim(), String(r["更新者"] || "").trim(),
                  stamp_(r["更新時刻"])].join("\u0001");
    }
    return {n, c, from, to, map};
  }
  /* 指紋を短い字にする。**照合のときは中身どうしを比べる**ので、
     ここは「照合してから消すまでのあいだに変わっていないか」を見るためだけ。
     暗号の強さは要らない（守るのは事故であって、人ではない）。 */
  function sig_(map){
    const keys = Object.keys(map).sort();
    let h = 5381;
    for(const k of keys){
      const s = k + "\u0002" + map[k] + "\u0003";
      for(let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    }
    return keys.length + "-" + h.toString(36);
  }
  /* コマの鍵を、人が読める形にする（どのコマが違うのかを言うため） */
  function keyLabel_(k){
    const p = String(k).split("|");
    return p[0] + " " + p[1] + "（" + (p[2] || "") + (p[3] ? "・" + p[3] : "") + "）";
  }

  /* 週案シートを年度で数える。**読むだけ。** */
  function archiveCount(year){
    const y = String(year);
    const all = Sheets.planMap();
    const sheets = [];
    let rows = 0, cells = 0, from = "", to = "";
    for(const name in all){
      const g = planContent_(Sheets.readPlan(name, ymd, all), y);
      if(!g.n) continue;
      sheets.push({name, rows:g.n, cells:g.c, sig:sig_(g.map)});
      rows += g.n; cells += g.c;
      if(g.from && (!from || g.from < from)) from = g.from;
      if(g.to   && (!to   || g.to   > to))   to = g.to;
    }
    sheets.sort(function(a, b){ return a.name < b.name ? -1 : 1; });
    return {year: +year, sheets, rows, cells, from, to,
            file: Sheets.bookName(), done: archiveDone(year)};
  }
  /* 本体の、その年度ぶんの中身。照合と、消す直前の見直しで使う */
  function planMaps_(y){
    const all = Sheets.planMap(), out = {};
    for(const name in all){
      const g = planContent_(Sheets.readPlan(name, ymd, all), y);
      if(g.n) out[name] = g;
    }
    return out;
  }

  /* 退避ずみか。**この行があれば退避ずみ。** 無いシートも読める（readAllSoft） */
  function archiveDone(year){
    const y = String(year);
    let hit = null;
    for(const r of Sheets.readAllSoft("退避").rows)
      if(String(r["年度"]).trim() === y)
        hit = {year:+y, url:String(r["退避先URL"] || ""),
               at:String(r["退避日"] || ""), by:String(r["退避した人"] || ""),
               rows:+r["行数"] || 0, cells:+r["コマ数"] || 0};
    return hit;
  }
  function archivedAll(){
    const out = {};
    for(const r of Sheets.readAllSoft("退避").rows){
      const y = String(r["年度"]).trim();
      if(y) out[y] = {url:String(r["退避先URL"] || ""), at:String(r["退避日"] || ""),
                      by:String(r["退避した人"] || "")};
    }
    return out;
  }

  /* 退避先と突き合わせる。**読むだけ。合わなければ消させない。** */
  function archiveVerify(year, url){
    const y = String(year);
    const mine = archiveCount(year);
    const id = fileId(url, "退避先のURL");
    const here = Sheets.book().getId();
    if(id === here)
      return {ok:false, why:["貼られたURLが、いま開いているファイルそのものです。"
                           + "複製のほうのURLを貼ってください"], mine};

    let ss;
    try{ ss = SpreadsheetApp.openById(id); }
    catch(e){
      return {ok:false, why:["退避先を開けません（" + String(e && e.message) + "）。"
                           + "複製が管理者に共有されているか確かめてください"], mine};
    }

    /* 退避先の週案シートを、**同じ形の行にしてから**読む。
       列の位置は名前で引く（複製でも列を足した人がいるかもしれない） */
    const there = {};
    for(const sh of ss.getSheets()){
      const name = sh.getName();
      if(name.indexOf(Sheets.PLAN_PREFIX) !== 0) continue;
      const v = sh.getDataRange().getValues();
      if(v.length < 2) continue;
      const at = {};
      v[0].forEach(function(h, i){ const k = String(h).trim(); if(k) at[k] = i; });
      if(!("年度" in at) || !("日付" in at) || !("時程" in at)) continue;
      const rows = [];
      for(let i = 1; i < v.length; i++){
        const row = v[i], o = {};
        for(const k of Sheets.PLAN_COLS) o[k] = (k in at) ? row[at[k]] : "";
        o["日付"] = ymd(o["日付"]);
        o["対象"] = Sheets.asClass(o["対象"]);
        if(!o["日付"] || !String(o["時程"]).trim()) continue;
        rows.push(o);
      }
      const g = planContent_(rows, y);
      if(g.n) there[name] = g;
    }

    /* シートごとに突き合わせる。**行数とコマ数だけでは足りない。**
       複製したあとに「国語」を「校外学習」へ直しても、数は変わらない。
       コマの中身どうしを比べて、違うコマを名指しする。 */
    const why = [], mineMaps = planMaps_(y);
    for(const s of mine.sheets){
      const t = there[s.name], m = mineMaps[s.name];
      if(!t){ why.push("退避先に「" + s.name + "」の " + y + "年度の行がありません"); continue; }
      const diff = [];
      for(const k in m.map){
        if(!(k in t.map)) diff.push(keyLabel_(k) + " が退避先にありません");
        else if(t.map[k] !== m.map[k]) diff.push(keyLabel_(k) + " の中身が違います");
        if(diff.length > 6) break;
      }
      if(diff.length <= 6)
        for(const k in t.map)
          if(!(k in m.map)){
            diff.push(keyLabel_(k) + " が本体にありません（退避先にだけある）");
            if(diff.length > 6) break;
          }
      if(diff.length)
        why.push("「" + s.name + "」の中身が合いません（" + m.n + "コマ中 "
               + diff.slice(0, 5).join(" ／ ")
               + (diff.length > 5 ? " ／ ほか" : "") + "）");
    }
    if(!mine.rows) why.push(y + "年度の週案が、本体に1行もありません（退避するものがない）");
    if(why.length)
      why.push("**複製をやり直してください。** 照合したあとに本体を直すと、"
             + "その直しは複製に入っていません。");

    return {ok: why.length === 0, why, mine,
            there: {file: ss.getName(), id,
                    rows: Object.keys(there).reduce(function(a, k){ return a + there[k].n; }, 0),
                    sheets: Object.keys(there).length}};
  }

  /* 本体から、その年度の行だけを消す。**押す直前にもう一度照合する。**
     貼ってから押すまでのあいだに、誰かが書き足しているかもしれない。 */
  function archivePurge(year, url, typed){
    const y = String(year);
    if(String(typed || "").trim() !== y)
      throw new Error("消す前に、年度（" + y + "）をそのまま打ち込んでください");

    const v = archiveVerify(year, url);
    if(!v.ok) throw new Error("退避先と合っていないので、1行も消しません。\n・"
                            + v.why.join("\n・"));

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try{
      /* **消す直前にもう一度見直す。** ここで変わっていたら、その変わったぶんは
         退避先に入っていない。消せば、書いた本人にも見えないまま消える。

         数だけでなく**中身の指紋**まで見る。行数もコマ数も変えずに
         「国語」を「校外学習」へ直すことができるので、数だけでは素通りする。 */
      const now = archiveCount(year);
      const sigOf = r => { const o = {};
        for(const s of r.sheets) o[s.name] = s.sig + "/" + s.rows + "/" + s.cells;
        return o; };
      const a = sigOf(v.mine), b = sigOf(now), moved = [];
      for(const n in a) if(a[n] !== b[n]) moved.push(n);
      for(const n in b) if(!(n in a)) moved.push(n);
      if(now.rows !== v.mine.rows || now.cells !== v.mine.cells || moved.length)
        throw new Error("確かめてから押すまでのあいだに、" + y + "年度の週案が変わりました"
                      + "（" + v.mine.rows + " 行 → " + now.rows + " 行"
                      + (moved.length ? "／変わったシート：" + moved.slice(0, 5).join("、") : "")
                      + "）。複製をやり直してください。1行も消していません。");

      const all = Sheets.planMap();
      const gone = [];
      for(const s of now.sheets){
        const keep = Sheets.readPlan(s.name, ymd, all)
                       .filter(function(r){ return String(r["年度"]) !== y; });
        Sheets.writePlan(s.name, keep);
        gone.push(s.name);
      }
      const me = (function(){ try{ return Gate.activeEmail(); }catch(e){ return ""; } })();
      const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
      Sheets.setup();                    /* 「退避」シートがまだ無い学校でも書ける */
      Sheets.appendRows("退避", [Sheets.toArray("退避", {
        "年度": +y, "退避先URL": String(url || ""), "退避日": when,
        "退避した人": me, "行数": now.rows, "コマ数": now.cells
      })]);
      SpreadsheetApp.flush();
      return {year:+y, sheets:gone.length, rows:now.rows, cells:now.cells,
              at:when, by:me, url:String(url || "")};
    } finally {
      lock.releaseLock();
    }
  }

  /* ── 書く ────────────────────────────────────── */

  /* patches = [{date, slot, layer, target, title, note, subject, sp, remove}]
     戻り値は、いま入った更新時刻（サーバの時計）。画面はこれで手元の控えを直す。

     **シートごとに、丸ごと読んで・差し替えて・日付順に並べて・書き戻す。**
     行番号を覚えて1行ずつ直すやり方はやめた。
     日付は書いた瞬間にシートの側で日付型になるので、文字のまま覚えた行番号は
     次に読んだときもう合わない。合わないと、直したつもりの行が増えていく。 */
  function writeCells(year, patches){
    if(!patches || !patches.length)
      return {at:{}, count:0, asked:0, conflicts:[], ms:0, waitMs:0};
    /* **保存にかかった時間を測って返す。**
       「速くする改造」は、必ず正しさを削る方向に働く。数字が基準に届く前に
       手を入れない（→ docs/spec.md 13-2）。ロック待ちと書き込みは分けて測る。
       木曜の夕方に30人が同時に押すと、伸びるのはロック待ちのほうなので、
       混ぜて測ると、どちらを直せばよいのか分からなくなる。 */
    const t0 = Date.now();
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    const t1 = Date.now();
    try{
      const rank = slotRank();
      const now = new Date(), at = {};
      /* **競合したコマは、黙って飛ばさない。** 数も中身も返す。
         返さないと、教師は書けたつもりで書けていないまま週を進める。 */
      const conflicts = [];
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

          /* **古い画面からの保存を止める。**
             expectedAt ＝「この編集を始めたとき、自分が知っていたサーバの更新時刻」。
             いまシートに入っている時刻と違えば、そのあいだに誰かが書いている。
             そのまま書くと、書いた本人にも見えないまま消える。

             expectedAt が無いのは古い版の画面。**そこは今までどおり書く**
             （止めると、貼り替えの途中で全員が保存できなくなる）。 */
          if(p.expectedAt !== undefined && p.expectedAt !== null){
            /* 0 は「行がまだ無い」。**行はあるが更新時刻が無い**ときは -1。
               どちらも 0 にすると、新しいコマのつもりで 0 を送ってきた画面と
               一致してしまい、1.3.0 より前に書かれた行を見ないまま消せる。 */
            const cur = (i !== undefined) ? rows[i] : null;
            const curAt = !cur ? 0
                        : Sheets.isDate(cur["更新時刻"]) ? cur["更新時刻"].getTime() : -1;
            if(curAt !== (+p.expectedAt || 0)){
              conflicts.push({
                date: date, slot: p.slot, layer: p.layer, target: target,
                expectedAt: +p.expectedAt || 0, currentAt: curAt,
                currentTitle: cur ? String(cur["題名"] || "") : "",
                currentNote:  cur ? String(cur["詳細"] || "") : "",
                currentBy:    cur ? String(cur["更新者"] || "") : ""
              });
              continue;                 /* **このコマは書かない。黙って飛ばさない** */
            }
          }

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
      return {at, count: patches.length - conflicts.length,
              asked: patches.length, conflicts: conflicts,
              sheets: Object.keys(byName).length,
              ms: Date.now() - t1, waitMs: t1 - t0};
    } finally {
      lock.releaseLock();
    }
  }

  /* ── たんぽぽ時間割へ出す ──────────────────────
     **1週ぶんを、1枚の新しいシートとして出す。** シート名は「9月1週」。

     前は「向こうのシートの形を読んで、合う行を探して書き込む」やり方だった。
     そのために「いまの形をみる」「この形で作りなおす」という操作が2つ要り、
     形が合わない日は黙って飛ばされ、飛ばされたことに気づくには
     結果の文を読むしかなかった。**出す先の形を、こちらが毎週作れば、
     読み違える余地そのものが消える。**

     形（docs/spec.md 7節）。1日ぶんが縦16行のブロックで、各校時は2行。
     上が授業名、下が担当者・場所。列は児童ごと。

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

     **同じ名前のシートがあったら、消さずに名前を変えて残す**（Sheets.stash）。
     たんぽぽ担当が担当者・場所に書き足したものを、こちらが消さないため。 */

  /* ファイルの指定。**URL をそのまま貼っても通す。**
     ID だけを抜いて貼るのは、知っていないとできない操作。
     知らずに URL を貼ると「Illegal spreadsheet id or key」とだけ出て、
     何が悪いのか分からない。 */
  /* where は「どこに書いてあるものか」。**設定シートとはかぎらない。**
     出す先は「たんぽぽ出力先」シートにも、画面が渡す値にもある。
     場所を言わずに「読めません」とだけ言うと、どこを直せばよいか分からない */
  function fileId(v, label, where){
    const at = where === undefined ? "「設定」シートの" : String(where);
    const t = String(v == null ? "" : v).trim();
    if(!t) throw new Error(at + "「" + label + "」が空です。"
                         + "スプレッドシートのURL（またはID）を入れてください");
    const m = t.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/)
           || t.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
    if(m) return m[1];
    if(/^[A-Za-z0-9_-]{20,}$/.test(t)) return t;
    throw new Error(at + "「" + label + "」が読めません（" + t.slice(0, 40)
                  + "…）。スプレッドシートのURLをそのまま貼ってください");
  }

  function tpNorm(v){
    let t = String(v == null ? "" : v).normalize("NFKC").trim().replace(/[　\s]+/g, "");
    return t.replace(/[‐‑–—―ー−ｰ－]/g, "-");
  }
  /* 交流級の見出しを読む。**Date で返ってくることがある。**
     スプレッドシートは 1-2 を「1月2日」として取り込む。画面には 1-2 と
     出ているのに getValues() は Date を返すので、字として比べると
     交流級の列が1つも見つからない。Sheets.asClass が月-日から元の字へ戻す。 */
  function tpCls(v){ return tpNorm(Sheets.asClass(v)); }

  /* ── たんぽぽへの提出 ────────────────────────
     **担任が「今週ぶんは書き終えた」と言った印。**
     1コマでも書いてあれば済、にはしない。ちょっと触っただけの週と、
     出してよい週を、たんぽぽ担当が見分けられなくなる。

     週ごとに持つ。月曜が変われば、また未に戻る。
     たんぽぽ担当は「今週はだれがまだか」を見て支援員を組むので、
     前の週の印が残っていると、組んだあとで予定が変わる。 */
  function tpSubmits(year, mondayISO){
    const out = {};
    for(const r of Sheets.readAllSoft("たんぽぽ提出").rows){
      if(String(r["年度"]).trim() !== String(year)) continue;
      if(ymd(r["月曜"]) !== String(mondayISO)) continue;
      const c = Sheets.asClass(r["クラス"]);
      if(c) out[c] = {at: String(r["提出日時"] || ""), by: String(r["提出者"] || "")};
    }
    return out;
  }
  /* 立てる／外す。**外せるようにしておく。**
     押し間違いを直せないと、押すこと自体が怖くなる。 */
  function tpSubmit(year, mondayISO, cls, on){
    const c = Sheets.asClass(cls);
    if(!c) throw new Error("クラスが分かりません");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(mondayISO)))
      throw new Error("週の月曜が分かりません（" + mondayISO + "）");
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const me = Gate.check().email;
      let row = 0;
      for(const r of Sheets.readAllSoft("たんぽぽ提出").rows)
        if(String(r["年度"]).trim() === String(year)
           && ymd(r["月曜"]) === String(mondayISO)
           && Sheets.asClass(r["クラス"]) === c){ row = r.__row; break; }
      if(on){
        const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
        const obj = {"年度": +year, "月曜": String(mondayISO), "クラス": c,
                     "提出日時": when, "提出者": me};
        if(row) Sheets.setRow("たんぽぽ提出", row, obj);
        else Sheets.appendRows("たんぽぽ提出", [Sheets.toArray("たんぽぽ提出", obj)]);
      }else if(row){
        Sheets.blankRow("たんぽぽ提出", row);
      }
      SpreadsheetApp.flush();
      return tpSubmits(year, mondayISO);
    }finally{ lock.releaseLock(); }
  }

  /* ── たんぽぽの出す先 ────────────────────────
     **1本とはかぎらない。** たんぽぽ時間割が学年で分かれている学校もあるし、
     年度でファイルを作り直す学校もある。「たんぽぽ出力先」シートに行を持つ。

     行が1つも無いあいだは、今までどおり「設定」の たんぽぽファイルID を
     1本の出す先として返す。**版を上げただけの学校が、貼った瞬間に
     出せなくなるのを避ける。** 画面から1本でも足せば、そちらが正本になる。 */
  function tpTargets(){
    const rows = Sheets.readAllSoft("たんぽぽ出力先").rows;
    const out = [];
    for(const r of rows){
      const url = String(r["URL"] || "").trim();
      if(!url) continue;
      out.push({name: String(r["名前"] || "").trim() || "（名前なし）",
                url: url, def: !!r["既定"]});
    }
    if(out.length){
      /* 既定が1つも無い／2つ以上あるときは、いちばん上を既定にする。
         どれに出るか分からないまま押させない */
      if(out.filter(function(x){ return x.def; }).length !== 1){
        for(const x of out) x.def = false;
        out[0].def = true;
      }
      return out;
    }
    const legacy = String(readConfig()["たんぽぽファイルID"] || "").trim();
    return legacy ? [{name: "たんぽぽ時間割", url: legacy, def: true, legacy: true}] : [];
  }
  /* 出す先を丸ごと書き替える。**1行ずつ足さない。**
     足す・消す・直すを別々の口にすると、消えたのに残っているつもりの
     行が出る。画面が持っている並びを、そのまま正本にする。 */
  function writeTargets(list){
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const objs = [];
      for(const x of (list || [])){
        const url = String((x && x.url) || "").trim();
        if(!url) continue;
        fileId(url, "URL", "たんぽぽの出す先の");   /* 読めない URL はここで弾く */
        objs.push({"名前": String((x && x.name) || "").trim() || "たんぽぽ時間割",
                   "URL": url, "既定": false});
      }
      if(objs.length){
        let i = 0;
        for(let k = 0; k < (list || []).length; k++) if(list[k] && list[k].def) i = k;
        objs[Math.min(i, objs.length - 1)]["既定"] = true;
      }
      const sh = Sheets.sheet("たんぽぽ出力先");
      if(sh && sh.getLastRow() > 1)
        sh.getRange(2, 1, sh.getLastRow() - 1, Sheets.SPEC["たんぽぽ出力先"].cols.length)
          .clearContent();
      if(objs.length)
        Sheets.appendRows("たんぽぽ出力先",
          objs.map(function(o){ return Sheets.toArray("たんぽぽ出力先", o); }));
      SpreadsheetApp.flush();
      return {saved: objs.length};
    }finally{ lock.releaseLock(); }
  }
  /* 開けるか試す。**貼った時点で確かめる。**
     出すときに初めて失敗すると、週案を送ったあとで止まる */
  function testTarget(url){
    const id = fileId(url, "URL", "たんぽぽの出す先の");
    try{
      const ss = SpreadsheetApp.openById(id);
      return {ok: true, file: ss.getName(),
              sheets: ss.getSheets().length};
    }catch(e){
      return {ok: false, why: "開けません。URLが正しいか、このスクリプトを置いた"
                            + "アカウントに共有されているかを見てください"};
    }
  }

  /* たんぽぽ時間割のファイルを開く。**シートは名前で作る**ので、
     「たんぽぽシート名」の設定はもう見ない（週ごとに名前が変わるため）。
     どの出す先かは画面が渡す。渡されなければ既定の1本。 */
  function tpOpen(url){
    const cfg = readConfig();
    let want = String(url || "").trim(), label = "たんぽぽ出力先のURL", where = "";
    if(!want){
      const list = tpTargets();
      const def = list.filter(function(x){ return x.def; })[0] || list[0];
      if(!def) throw new Error("たんぽぽ時間割の出す先が1つもありません。"
                             + "たんぽぽの面で出す先を足してください");
      want = def.url;
      /* 出す先シートがまだ空で、設定の たんぽぽファイルID を見ているとき。
         直す場所は設定シートなので、そう言う */
      if(def.legacy){ label = "たんぽぽファイルID"; where = undefined; }
    }
    const id = fileId(want, label, where);
    let ss;
    try{ ss = SpreadsheetApp.openById(id); }
    catch(e){
      throw new Error("たんぽぽ時間割のファイルを開けません（ID " + id + "）。"
        + "URLが正しいか、このスクリプトを置いたアカウントに共有されているかを見てください");
    }
    return {ss, cfg};
  }

  /* 列の並び。**たんぽぽ1組の全員 → 2組の全員 → …**
     組の中はクラスの順（1-1〜6-4）。たんぽぽ担当は組ごとに見るので、
     クラス順に混ぜて並べると、自分の組の児童を目で拾えない。

     受けるのは2つの形。
       [{cls:"3-3", group:1}, …]   新しい形。並びも組もこちらが決める
       {"3-3":2, "1-1":1}          古い形（人数だけ）。全員を1組として扱う */
  function tpColumns_(cols){
    const clsRank = c => {
      const m = String(c).match(/^(\d+)-(\d+)$/);
      return m ? (+m[1]) * 100 + (+m[2]) : 9999;
    };
    const out = [];
    if(Array.isArray(cols)){
      for(const x of cols){
        const cls = tpNorm(x && x.cls != null ? x.cls : x);
        if(cls) out.push({cls, group: Math.max(1, +((x && x.group) || 1))});
      }
    }else{
      for(const c in (cols || {}))
        for(let i = 0; i < (+cols[c] || 0); i++) out.push({cls: tpNorm(c), group: 1});
    }
    out.sort(function(a, b){ return (a.group - b.group) || (clsRank(a.cls) - clsRank(b.cls)); });
    return out;
  }

  const TP_BUILD_ROWS = 16;
  /* 列の幅（px）。児童の列は狭く、時程の列（A）は日付が入るので広いまま */
  const TP_COL_W = 50, TP_LABEL_W = 92;
  /* 日ブロックの先頭からの相対行。授業名の行だけを持つ（担当者・場所は書かない） */
  const TP_TITLE_OFF = [1, 3, 6, 8, 12, 14];

  /* シート名。**「9月1週」。** その月の何番目の月曜かで数える。
     日付をそのまま名前にすると、たんぽぽ担当が「何週目のぶんか」を
     毎回数えることになる。 */
  function weekSheetName(mondayISO){
    const p = String(mondayISO).split("-");
    return (+p[1]) + "月" + (Math.floor((+p[2] - 1) / 7) + 1) + "週";
  }
  /* 週シートの並び順。**年度の順（4月 → 翌3月）。**
     名前は月と週しか持っていないので、4月を先頭に置き替えて数える。
     週シートでない名前（退避したもの・ほかの用途のシート）は -1 を返す。 */
  const WEEK_NAME = /^([1-9]|1[0-2])月([1-5])週$/;
  function weekOrder(name){
    const m = String(name).match(WEEK_NAME);
    if(!m) return -1;
    return (((+m[1]) + 8) % 12) * 10 + (+m[2]);     /* 4月=0 … 3月=110 */
  }
  /* 新しい週シートを、**週の順に右へ**入れる位置。
     いちばん左（0）に入れ続けると、タブが 10月 → 9月 → … と逆順に並び、
     たんぽぽ担当は毎週いちばん右ではなく左端を探すことになる。
     いまある週シートのうち、自分より前の週の**いちばん右**の次に入れる。 */
  function weekIndex_(ss, name){
    const mine = weekOrder(name);
    if(mine < 0) return 0;
    const sheets = ss.getSheets();
    let after = -1, before = -1;
    for(let i = 0; i < sheets.length; i++){
      const o = weekOrder(sheets[i].getName());
      if(o < 0 || o === mine) continue;
      if(o < mine) after = i;                       /* 自分より前の週 */
      else if(before < 0) before = i;               /* 自分より後の週の、いちばん左 */
    }
    if(after >= 0) return after + 1;                /* その次へ */
    if(before >= 0) return before;                  /* いちばん前の週なら、その手前へ */
    return sheets.length;                           /* 週シートが1枚も無ければ末尾 */
  }

  /* titles = {クラス: {"0": {p1:"国語", …}, …}}（0〜4 は月〜金）
     cols   = [{cls, group}] の並び。**児童ごとに1列。** */
  function exportWeek(year, mondayISO, titles, cols, slots, name, url){
    const {ss, cfg} = tpOpen(url);
    const plan = tpColumns_(cols);
    if(!plan.length) throw new Error("交流級を1つも選んでいません");
    const list = plan.map(function(x){ return x.cls; });
    const sheetName = String(name || "").trim() || weekSheetName(mondayISO);
    const staff = String(cfg["たんぽぽ支援員"] || "").split(/[,、\s]+/)
      .map(function(x){ return x.trim(); }).filter(Boolean);

    const width = 1 + list.length + staff.length;
    const ids = (slots && slots.length === 6) ? slots : ["p1","p2","p3","p4","p5","p6"];

    /* 中身を組む。**先に全部の値を作ってから1回で書く。**
       1コマずつ書くと、26列×5日で百回以上の往復になる。 */
    const rows = [];
    rows.push([sheetName].concat(new Array(width - 1).fill("")));
    let wrote = 0, empty = 0;
    for(let d = 0; d < 5; d++){
      /* **日付として置く。** 字で置くと、シートの側で日付になったりならなかったり
         して、次に読むときに見つけられないことがある */
      rows.push([addDays_(mondayISO, d)].concat(list, staff));
      const lab = ["1", "", "2", "", "中休み", "3", "", "4", "", "給食", "昼休み",
                   "5", "", "6", ""];
      const body = lab.map(function(t){
        return [t].concat(new Array(width - 1).fill(""));
      });
      /* 授業名の行に、その日のコマを入れる。担当者・場所の行は空のまま
         （たんぽぽ担当が書くところ。こちらは触らない） */
      for(let i = 0; i < TP_TITLE_OFF.length; i++){
        const r = body[TP_TITLE_OFF[i] - 1];          /* body は +1 から始まる */
        for(let c = 0; c < list.length; c++){
          const v = ((titles[list[c]] || {})[String(d)] || {})[ids[i]];
          const t = (v === undefined || v === null) ? "" : String(v);
          r[1 + c] = t;
          if(t) wrote++; else empty++;
        }
      }
      for(const b of body) rows.push(b);
    }

    /* **同じ名前のシートがあれば、消さずに名前を変えて残す。**
       たんぽぽ担当が担当者・場所に書き足したものを、こちらが消さない */
    const old = ss.getSheetByName(sheetName);
    let backup = "";
    if(old){
      backup = Sheets.stash(old, "前の");
      if(!backup) ss.deleteSheet(old);       /* 空のシートだけは消す。残す値が無い */
    }
    /* **週の順に右へ並べる。** いちばん左に入れ続けるとタブが逆順になる */
    const nw = ss.insertSheet(sheetName, weekIndex_(ss, sheetName));
    Sheets.grow(nw, rows.length, width);     /* 26列を超えると落ちる。先に伸ばす */
    /* **値を入れる前に、B列から右を「書式なしテキスト」にする。**
       交流級の見出し 1-2 は、そのままだと 1月2日 として取り込まれる。
       画面には 1-2 と出るのに getValues() では Date が返る。
       A列は日付を入れるところなので、ここには掛けない。 */
    if(width > 1)
      nw.getRange(1, 2, nw.getMaxRows(), width - 1).setNumberFormat("@");
    nw.getRange(1, 1, rows.length, width).setValues(rows);
    nw.setFrozenColumns(1);
    nw.setFrozenRows(1);

    /* ── 列の幅 ────────────────────────────────
       **児童の列は 50px（約13mm）。** 既定の 100px のままだと、
       10人ぶんで B4 の幅を超え、たんぽぽ担当が毎週手で詰めることになる。
       幅は「設定」シートの `たんぽぽ列幅` で動かせる（正本はシート）。

       A列だけは広いまま置く。ここには日付（11/16（月））と
       「中休み」「給食」「昼休み」が入り、50px では読めない。

       **B4 1枚に入る列の数**：B4 横は 364mm、余白を引いて約 350mm
       ＝ 約 1,323px。A列 92px を引いて 1,231px なので、50px なら
       **24列**まで（児童＋支援員の合計）。これを超える年は、
       `たんぽぽ列幅` を下げるか、B4 に収めるのをあきらめて縮小印刷にする。 */
    const colW = Math.max(20, Math.min(200, +cfg["たんぽぽ列幅"] || TP_COL_W));
    nw.setColumnWidth(1, TP_LABEL_W);
    if(width > 1) nw.setColumnWidths(2, width - 1, colW);
    for(let d = 0; d < 5; d++)
      nw.getRange(2 + d * TP_BUILD_ROWS, 1).setNumberFormat("m/d（ddd）");

    /* **偶数組の列に地を敷く。** 奇数組は白のまま。
       たんぽぽ担当は組ごとに見るので、どこからどこまでが自分の組かが
       ひと目で要る。色だけに頼らないよう、組の境目には太い縦罫線も引く。 */
    const F = Sheets.TANPOPO_FILL;
    const even = [];                    /* 偶数組の列（1始まり・シートの列番号） */
    for(let i = 0; i < plan.length; i++)
      if(plan[i].group % 2 === 0) even.push(2 + i);
    for(const c of even)
      nw.getRange(1, c, rows.length, 1).setBackground(F.evenBody);

    /* 授業名の行は灰色。**たんぽぽの中で受けるコマだけ、条件付き書式で白に戻す。**
       白にするのは次のどちらか。
         ・すぐ下の担当者・場所が「た」で始まる（担当が自分で直したコマ）
         ・授業名そのものが 国語・算数・自立 で始まる（Sheets.TANPOPO_OWN）
       2つめは、担当者・場所を直す前でも自分の持ちコマが白く出るようにするため。
       **前方一致にする。** 「含むか」で見ると「外国語」が「国語」を含む。 */
    const rules = [];
    for(let d = 0; d < 5; d++){
      const top = 2 + d * TP_BUILD_ROWS;
      for(const off of TP_TITLE_OFF){
        const r = top + off;
        const rng = nw.getRange(r, 2, 1, width - 1);
        rng.setBackground(F.imported);
        for(const c of even) nw.getRange(r, c).setBackground(F.evenImported);
        const own = Sheets.TANPOPO_OWN.map(function(w){
          return 'LEFT(B' + r + ',' + w.length + ')="' + w + '"';
        }).join(",");
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=OR(LEFT(B' + (r + 1) + ',1)="た",' + own + ')')
          .setBackground(F.own).setRanges([rng]).build());
      }
      nw.getRange(top, 1, 1, width).setFontWeight("bold");
      for(const off of [5, 10, 11])
        nw.getRange(top + off, 1, 1, width).setBackground("#EFEFEF");
    }

    /* 組の境目に太い縦罫線。**色に頼らない手がかり。**
       支援員の列との境にも引く（別のまとまりなので） */
    const edges = [];
    for(let i = 1; i < plan.length; i++)
      if(plan[i].group !== plan[i - 1].group) edges.push(2 + i);
    if(staff.length) edges.push(2 + plan.length);
    for(const c of edges)
      nw.getRange(1, c, rows.length, 1)
        .setBorder(null, true, null, null, null, null, "#5A6773",
                   SpreadsheetApp.BorderStyle.SOLID_THICK);

    nw.setConditionalFormatRules(rules);
    SpreadsheetApp.flush();
    return {file: ss.getName(), sheet: sheetName, cols: list.length,
            staff: staff.length, rows: rows.length, backup: backup, colW: colW,
            wrote: wrote, empty: empty, days: 5, list: list,
            groups: plan.map(function(x){ return x.group; })};
  }
  /* ── 新年度の設定 ────────────────────────────
     **4月に開いたとき、何を、どの順でやるかを1画面で出す。**

     checkYear は「足りないもの」を名指しするが、**順序を持たない**。
     年度初めにやることは順序が要る（前年度を消す前に複製する、
     クラスを直す前に基本時間割を入れても意味が無い）。ここは手順の側。

     判定できるものは checkYear の結果をそのまま使う。**二重に書かない**
     （判定を2か所に書くと、片方だけ直したときに画面が食い違う）。
     人しか判定できない2つだけ「新年度設定」シートに記録する。 */

  /* 人が押して記録する手順。ここに無いものは機械が判定する */
  /* 見出しは「これからやること」の形に書く。**過去形にしない。**
     「複製した」と出ていると、済んだものが並んでいるように読める。
     押すボタンの側だけ「できたので、済にする」にする。 */
  const HAND = {
    "arc.copy": "ドライブで、このファイルを丸ごと複製する",
    "specials": "専科の担当を、新しい年度の人に直す"
  };

  function ticks(year){
    const out = {};
    for(const r of Sheets.readAllSoft("新年度設定").rows){
      if(String(r["年度"]).trim() !== String(year)) continue;
      const k = String(r["項目"] || "").trim();
      if(k) out[k] = {on: !!r["済"], by: String(r["記録した人"] || ""),
                      at: String(r["記録した日時"] || ""), row: r.__row};
    }
    return out;
  }
  function tickYearSetup(year, key, on){
    if(!HAND[key]) throw new Error("記録できない手順です（" + key + "）");
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const me = Gate.check().email;
      const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
      const had = ticks(year)[key];
      const obj = {"年度": +year, "項目": key, "済": !!on,
                   "記録した人": on ? me : "", "記録した日時": on ? when : ""};
      if(had) Sheets.setRow("新年度設定", had.row, obj);
      else Sheets.appendRows("新年度設定", [Sheets.toArray("新年度設定", obj)]);
      SpreadsheetApp.flush();
      return yearSetup(year);
    }finally{ lock.releaseLock(); }
  }

  /* A週B週が、年間行事計画表の「週」欄と合っているか。
     **起点は毎年直すものではない**（1週ごとに入れ替わるので、何年前の
     起点でも交互になる）。直すのは行事表と1週ずれているときだけ。
     ずれたまま使うと、書いた週案・たんぽぽへ出したぶん・時数が全部ずれる。 */
  function variantFit(year){
    const anchor = String(readConfig()["A週の起点の月曜"] || "").trim();
    if(!anchor) return {level:"warn", detail:"起点が空", fix:"新年度の設定から入れる"};
    const a = new Date(anchor.slice(0,4), +anchor.slice(5,7) - 1, +anchor.slice(8,10));
    if(isNaN(a.getTime()))
      return {level:"warn", detail:"起点「" + anchor + "」が読めない", fix:"2026-09-07 の形で入れる"};
    let ev = null;
    try{ ev = readEvents(year); }catch(e){ ev = {events:{}}; }
    let same = 0, diff = 0, sample = "";
    for(const d in ev.events){
      const w = ev.events[d].w;
      if(w !== "A" && w !== "B") continue;
      const p = d.split("-");
      const day = new Date(+p[0], +p[1] - 1, +p[2]);
      const n = Math.round((mondayOf_(day) - mondayOf_(a)) / (7 * 86400000));
      const mine = ((((n % 2) + 2) % 2) === 0) ? "A" : "B";
      if(mine === w) same++;
      else { diff++; if(!sample) sample = d + " は行事表が" + w + "週・こちらは" + mine + "週"; }
    }
    if(!same && !diff)
      return {level:"warn", detail:"行事表に週の欄が無い（起点 " + anchor + "）",
              fix:"行事表の「週」欄を入れると、ここで照合できる"};
    if(diff > same)
      return {level:"ng", detail:"行事表と食い違う（合 " + same + "・違 " + diff + "）。" + sample,
              fix:"新年度の設定から、起点の月曜を1週動かす"};
    if(diff)
      return {level:"warn", detail:same + " 日は合い、" + diff + " 日が違う。" + sample,
              fix:"行事表の側の書き間違いでないか見る"};
    return {level:"ok", detail:same + " 日ぶん、行事表と合っている（起点 " + anchor + "）", fix:""};
  }
  function mondayOf_(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getTime();
  }

  /* 起点の月曜を書く。**月曜でない日は受け取らない。**
     火曜を入れられると、以後の週がすべて半週ずれる */
  function writeVariantOrigin(monday){
    const t = String(monday || "").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(t))
      throw new Error("日付は 2026-09-07 の形で入れてください");
    const d = new Date(+t.slice(0,4), +t.slice(5,7) - 1, +t.slice(8,10));
    if(isNaN(d.getTime())) throw new Error("読めない日付です（" + t + "）");
    if(d.getDay() !== 1) throw new Error("月曜を入れてください（" + t + " は月曜ではありません）");
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const {sh, at} = Sheets.head("設定");
      const last = sh.getLastRow();
      const v = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
      for(let i = 0; i < v.length; i++){
        if(String(v[i][at["キー"]] || "").trim() === "A週の起点の月曜"){
          sh.getRange(i + 2, at["値"] + 1).setValue(t);
          SpreadsheetApp.flush();
          return {saved: t};
        }
      }
      Sheets.appendRows("設定", [Sheets.toArray("設定",
        {"キー":"A週の起点の月曜", "値":t, "覚え書き":"この週がA週。あとは1週ごとに入れ替わる"})]);
      SpreadsheetApp.flush();
      return {saved: t};
    }finally{ lock.releaseLock(); }
  }

  /* 年間行事計画表を貼り替える。**見出しごと、丸ごと入れ替える。**
     行を足し引きすると、消したはずの行事が残る年が出る。
     出す先は「行事ファイルID」があればそちら、無ければ本体の取り込みシート。 */
  function writeEvents(rows){
    if(!Array.isArray(rows) || rows.length < 2)
      throw new Error("見出しと、少なくとも1行が要ります");
    const at = eventCols_(rows[0]);
    if(at.date === undefined)
      throw new Error("「日付」の列が見つかりません。見出しは "
                    + Sheets.EVENT_COLS.join("／") + " の4つです");
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try{
      const bk = eventBook_();
      const sh = bk.outside ? bk.ss.getSheetByName(Sheets.EVENTS) : Sheets.sheet(Sheets.EVENTS);
      if(!sh) throw new Error("「" + Sheets.EVENTS + "」シートがありません");

      /* **貼り替える前に、いまの中身を丸ごと残す。**
         丸ごと入れ替えるので、間違った表を貼られると前年度の行事が戻せない。
         年度初めにこれをやるのは、たいてい今年から入った人。
         「消えて戻らない」を、この画面のどこにも作らない。
         残すのは同じファイルの中の別シート。名前で日時が分かる。 */
      let kept = "";
      const had = sh.getLastRow();
      if(had > 1){
        const wideOld = sh.getLastColumn();
        const old = sh.getRange(1, 1, had, wideOld).getValues();
        const stamp = Utilities.formatDate(new Date(), TZ, "MMdd-HHmm");
        kept = Sheets.EVENTS + "（前の " + stamp + "）";
        let i = 2;
        while(bk.ss.getSheetByName(kept)){
          kept = Sheets.EVENTS + "（前の " + stamp + "-" + (i++) + "）";
        }
        const ks = bk.ss.insertSheet(kept);
        Sheets.grow(ks, had, wideOld);
        ks.getRange(1, 1, had, wideOld).setValues(old);
      }

      let wide = 0;
      for(const r of rows) wide = Math.max(wide, r.length);
      const grid = rows.map(function(r){
        const out = [];
        for(let i = 0; i < wide; i++) out.push(r[i] == null ? "" : String(r[i]));
        return out;
      });
      Sheets.grow(sh, grid.length, wide);
      if(sh.getLastRow()) sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).clearContent();
      /* **日付の列を書式なしテキストにしない。** 日付として置くほうが
         readEvents は素直に読める（evDate_ は Date も字も読む） */
      sh.getRange(1, 1, grid.length, wide).setValues(grid);
      SpreadsheetApp.flush();
      /* **どこへ書いたかを返す。** 行事ファイルIDを入れてある学校では、
         本体ではなく別のファイルへ入る。入れた先が違うと気づけない */
      /* **どこへ書いたか・前の中身をどこへ残したかを返す。**
         残した先を言わないと、戻したい人がどこを見ればよいか分からない */
      return {rows: grid.length - 1, sheet: sh.getName(),
              kept: kept, outside: bk.outside};
    }finally{ lock.releaseLock(); }
  }

  /* 手順。**上から順にやる。** */
  function yearSetup(year){
    const y = +year, prev = y - 1;
    const ck = checkYear(y);
    const by = {};
    for(const x of ck.items) if(!by[x.what]) by[x.what] = x;
    const tk = ticks(y);
    const items = [];
    /* 1件ぶんの手順。**画面が判断しなくてよいように、ここで全部持たせる。**
       year setup をやるのは、たいてい今年その学校へ来た人。
       「何を」だけ出して「なぜ・どうなる・戻せるか」を出さないと、
       押してよいのか分からないまま止まるか、分からないまま押す。
         why  なぜ要るか（やらないと何が起きるか）
         undo 元に戻せるか。**戻せないものはここで名指しする**
         mins かかる目安
         act  画面のどの窓を開くか（画面側の NY_ACT と同じ名前） */
    const put = (key, group, label, level, detail, fix, act, why, undo, mins) =>
      items.push({key, group, label, level, detail, fix, act,
                  why: why || "", undo: undo || "", mins: mins || 0,
                  hand: !!HAND[key],
                  by: (tk[key] || {}).by || "", at: (tk[key] || {}).at || ""});
    const from = (key, group, label, what, act, why, undo, mins) => {
      const x = by[what] || {level:"warn", detail:"判定できなかった", fix:""};
      put(key, group, label, x.level, x.detail, x.fix, act, why, undo, mins);
    };

    /* ① 前年度を退避する。**複製は人の手。**
       複製をコードで書かないので、コピー漏れが原理的に起きない */
    const done = archiveDone(prev);
    let cnt = null;
    try{ cnt = archiveCount(prev); }catch(e){ cnt = null; }
    const rows = cnt ? cnt.rows : 0;
    put("arc.count", "① 前の年度を保管する", "前の年度に、どれだけ入っているかを数える",
        "ok", done ? prev + "年度は保管ずみ"
                   : (rows ? prev + "年度に " + rows + " 行（" + cnt.cells + " コマ）ある"
                           : prev + "年度の週案は1行もない。保管するものがない"),
        "", "admin",
        "数えた行数とコマ数を、あとで複製と突き合わせます。ここが保管の物差しです。",
        "数えるだけ。何も変わりません。", 1);
    const need = !done && rows > 0;
    const cp = tk["arc.copy"];
    put("arc.copy", "① 前の年度を保管する", HAND["arc.copy"],
        (!need || (cp && cp.on)) ? "ok" : "ng",
        !need ? "保管するものがない"
              : (cp && cp.on) ? "済（" + cp.by + "　" + cp.at + "）"
                              : "Googleドライブでこのファイルを右クリック →「コピーを作成」→ "
                                + "名前を「週案 保存 " + prev + "年度」に直す",
        need ? "できたら、コピーのURLを「年度の退避」の欄に貼る" : "", "admin",
        "複製はコードで作りません。人がドライブで作るので、コピー漏れが起きません。",
        "コピーを作るだけ。元のファイルは何も変わりません。作りすぎても消せます。", 5);
    put("arc.verify", "① 前の年度を保管する", "複製と、いまのファイルを突き合わせる",
        (!need || done) ? "ok" : "ng",
        !need ? "突き合わせるものがない" : done ? "突き合わせは通っている" : "まだ突き合わせていない",
        need ? "「年度の退避」の［照合する］を押す。1枚でも合わなければ、次へ進めません" : "", "admin",
        "1行でも欠けた複製で次へ進むと、消したぶんが本当に消えます。ここが最後の砦です。",
        "見比べるだけ。何も変わりません。何度でもやり直せます。", 1);
    put("arc.purge", "① 前の年度を保管する", "いまのファイルから、前の年度の行を消す",
        (!need || done) ? "ok" : "ng",
        done ? "保管ずみ（" + done.at + "　" + done.by + "）"
             : !need ? "消すものがない" : rows + " 行が、いまのファイルに残っている",
        need ? "突き合わせが通ってから、年度を打ち込むと押せるようになります" : "", "admin",
        "残したままでも動きますが、年々重くなって保存に時間がかかるようになります。",
        "**ここだけは元に戻せません。**押した直後にもう一度突き合わせるので、"
        + "そのあいだに誰かが書いた行があれば1行も消しません。"
        + "消えるのは前の年度の週案の行だけで、複製にはそのまま残っています。", 2);

    /* ② 新年度のかたちを入れる */
    from("roster", "② 新しい年度のかたちを入れる", "クラスの数と名前を、新しい年度に直す",
         "クラス", "roster",
         "ここが元になって、担任が開くクラスの一覧ができます。空だと誰も開けません。",
         "戻せます。前の年度の行はそのまま残るので、上書きにはなりません。", 10);
    const sp = tk["specials"];
    put("specials", "② 新しい年度のかたちを入れる", HAND["specials"],
        (sp && sp.on) ? "ok" : "ng",
        (sp && sp.on) ? "済（" + sp.by + "　" + sp.at + "）"
                      : "いまの専科：" + ((by["専科"] || {}).detail || "—"),
        "［学級編成をひらく］の「専科」で、担当のメールを新しい人に直す", "roster",
        "担当が前の人のままだと、その先生の画面に自分の専科の週が出ません。",
        "戻せます。書き直すだけです。", 3);
    from("week1", "② 新しい年度のかたちを入れる", "第1週の月曜日を入れる", "年設定", "roster",
         "時数集計表のシート名（第◯週）が、ここから決まります。",
         "戻せます。書き直すだけです。", 1);
    from("base", "② 新しい年度のかたちを入れる", "基本時間割を、A週・B週とも入れる",
         "基本時間割", "base",
         "担任が週を開いたとき、初めに出るのがこれです。空だと真っ白な紙が出ます。",
         "戻せます。前の年度の行はそのまま残ります。", 30);

    /* ③ 外とつなぐ */
    from("events", "③ ほかの表とつなぐ", "年間行事計画表を貼り替える", "年間行事", "events",
         "行事が入っていると、その日の見出しに行事名が出ます。",
         "戻せます。貼り替える前の中身は、別のシートに丸ごと残します。", 5);
    const vf = variantFit(y);
    put("variant", "③ ほかの表とつなぐ", "A週・B週が、年間行事計画表と合っているか確かめる",
        vf.level, vf.detail, vf.fix, "ab",
        "1週ずれたまま使うと、書いた週案・たんぽぽへ出したぶん・時数が全部ずれます。",
        "戻せます。合わなければ、もう一度1週動かせば元どおりです。", 2);
    from("tanpopo", "③ ほかの表とつなぐ", "たんぽぽの交流級と、出す先を直す", "たんぽぽ", "tanpopo",
         "たんぽぽ時間割へ出す列が、ここで決まります。",
         "戻せます。出す先の一覧から外しても、向こうのファイルは消えません。", 5);

    /* ④ 担任が開ける形にする */
    from("plan", "④ 担任が開ける形にする", "クラスごとの週案シートを作る", "週案シート", "plan",
         "無くても書けば自動でできますが、初めの1人が待たされます。先に作っておきます。",
         "何度押しても同じです。あるシートには触りません。", 1);

    /* **順番を飛ばせないようにする。**
       ①を済ませる前に②へ行くと、消す前の年度の上に新しい編成を重ねることになる。
       前の段に「まだ」が残っているあいだ、次の段は wait を立てて画面で淡くする。
       止めるのではなく、順番でないことを言う（急ぎで飛ばす年もある）。 */
    let blocked = "";
    for(const x of items){
      x.wait = blocked && x.group !== blocked ? blocked : "";
      if(x.level === "ng" && !blocked) blocked = x.group;
    }
    for(const x of items) if(x.group === blocked) x.wait = "";

    /* いま押すべき1件。**次の一手だけを大きく出すために返す。**
       上から順に、最初の「まだ」。迷わせないための1件なので、複数返さない。 */
    const next = items.filter(function(x){ return x.level === "ng"; })[0] || null;
    const ng = items.filter(function(x){ return x.level === "ng"; }).length;
    /* **使い始める前の年度には、知らせを出さない。**
       2026年度はもう走っているので、いまさら「準備が未了」と出しても、
       やることは無いのに橙色の知らせだけが消えない。
       「設定」の年度より前は off を立て、画面が知らせを出さない。
       手順そのものは見られる（去年どうやったかを確かめたい年がある）。 */
    const since = +readConfig()["新年度の準備を出す年度から"] || 0;
    const off = since > 0 && y < since;
    return {year: y, prev: prev, items: items, ng: ng, done: ng === 0,
            off: off, from: since,
            next: next ? next.key : "", file: Sheets.bookName()};
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
  /* 画面から来た「組ごとの並び」を、クラスごとの欄の字に直す。
     {"1":["1-3","3-2"], "2":["3-2"]} → {"1-3":"1", "3-2":"1,2"}
     古い形（並びだけ・人数だけ）も受ける。**書き直させない。** */
  function tpNormObj_(v){
    const per = {};                     /* クラス → 組番号の並び */
    const put = (g, c) => {
      const k = Sheets.asClass(c);
      if(k) (per[k] || (per[k] = [])).push(+g || 1);
    };
    if(Array.isArray(v)){ for(const c of v) put(1, c); }
    else if(v && typeof v === "object"){
      for(const k in v){
        const val = v[k];
        if(Array.isArray(val)){ for(const c of val) put(k, c); }      /* いまの形 */
        else { const n = +val || 0;                                   /* 人数だった形 */
               for(let i = 0; i < Math.min(9, n); i++) put(1, k); }
      }
    }
    const out = {};
    for(const c in per) out[c] = per[c].sort(function(a, b){ return a - b; }).join(",");
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

  /* ChatへURLを貼って共有できる週案。権限は作成者のDrive設定のままにし、
     リンク公開へ勝手に変えない。 */
  function exportPlanSheet(name, sheets){
    if(!Array.isArray(sheets) || !sheets.length) throw new Error("出す週がありません");
    const book = SpreadsheetApp.create(String(name || "週案"));
    sheets.forEach((part, i) => {
      const sh = i ? book.insertSheet() : book.getSheets()[0];
      sh.setName(String(part.name || (i + 1)).slice(0, 99));
      const values = part.values || [];
      if(values.length){
        const cols = Math.max.apply(null, values.map(r => r.length));
        const rect = values.map(r => { const x = r.slice(); while(x.length < cols) x.push(""); return x; });
        sh.getRange(1, 1, rect.length, cols).setValues(rect).setWrap(true).setVerticalAlignment("middle");
        sh.setFrozenRows(1); sh.setFrozenColumns(1);
      }
    });
    return {name:book.getName(), url:book.getUrl()};
  }

  function addDays_(isoStr, n){
    const p = String(isoStr).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] + n);
  }

  return {readWeek, readBase, readRoster, readConfig, readSlots, readSubjects,
          writeCells, writeRoster, writeBase, writeBaseAll, readPaste, exportPlanSheet,
          exportWeek, weekSheetName, weekOrder, migratePlan, checkYear, readEvents,
          archiveCount, archiveVerify, archivePurge, archivedAll, ymd,
          tpTargets, writeTargets, testTarget, tpSubmits, tpSubmit,
          yearSetup, tickYearSetup, writeVariantOrigin, writeEvents,
          /* 検査から呼ぶ。**画面からは呼ばない**（形を読むための道具） */
          __tpCls: tpCls, __tpColumns: tpColumns_};
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
    /* **退避ずみの年度。** これを渡さないと、退避した年度を開いた人に
       基本時間割だけの紙が出て、「週案が全部消えた」と言われる。 */
    archived: Store.archivedAll(),
    config:   Store.readConfig(),
    slots:    Store.readSlots(),
    subjects: Store.readSubjects()
  };
  if(year){
    const warn = [];
    out.year   = +year;
    out.roster = Store.readRoster(+year);
    out.base   = Store.readBase(+year, warn);
    /* **年間行事も一緒に返す。** 別に取りに行くと、その回数だけ待つ */
    try{ const ev = Store.readEvents(+year);
         out.events = ev.events; if(ev.warn) warn.push.apply(warn, ev.warn); }
    catch(e){ out.events = {}; warn.push(String(e && e.message)); }
    out.warn   = warn;
  }
  return out;
}
/* 年度の検査。**4月に開けたとき、何が足りないかを1画面で言う。**
   直しはここでやらない。黙って直すと、直した中身が誰にも見えない。 */
function apiCheckYear(year){
  Gate.check();
  return Store.checkYear(year || new Date().getFullYear());
}
/* 年度の退避。**3つに分けてある。数える／照合する／消す。**
   1つのボタンにまとめない。まとめると、確かめずに消せてしまう。 */
function apiArchiveCount(year){
  Gate.check();
  return Store.archiveCount(year);
}
function apiArchiveVerify(year, url){
  Gate.check();
  return Store.archiveVerify(year, url);
}
function apiArchivePurge(year, url, typed){
  Gate.check();
  return Store.archivePurge(year, url, typed);
}
function apiReadYear(year){
  Gate.check();
  const warn = [];
  const base = Store.readBase(year, warn);
  let events = {};
  try{ const ev = Store.readEvents(year);
       events = ev.events; if(ev.warn) warn.push.apply(warn, ev.warn); }
  catch(e){ warn.push(String(e && e.message)); }
  return {roster: Store.readRoster(year), base, events, warn};
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
/* たんぽぽ時間割へ、**1週ぶんを1枚のシートとして出す**。シート名は「9月1週」。
   同じ名前のシートがあれば、消さずに名前を変えて残す。
   出す先の形をこちらが毎週作るので、「形をみる」「形を作りなおす」は要らない。 */
function apiExportWeek(year, mondayISO, titles, cols, slots, name, url){
  Gate.check();
  return Store.exportWeek(year, mondayISO, titles, cols, slots, name, url);
}
/* たんぽぽの出す先。**1本とはかぎらない。**
   行が1つも無いあいだは「設定」の たんぽぽファイルID を1本として返す。 */
/* たんぽぽへの提出。**担任が「今週ぶんは書き終えた」と言った印。**
   週ごとに立て直す（月曜が変われば、また未に戻る）。 */
function apiTpSubmit(year, mondayISO, cls, on){
  Gate.check();
  return Store.tpSubmit(year, mondayISO, cls, !!on);
}
function apiTpTargets(){
  Gate.check();
  return Store.tpTargets();
}
function apiWriteTpTargets(list){
  Gate.check();
  return Store.writeTargets(list);
}
function apiTestTpTarget(url){
  Gate.check();
  return Store.testTarget(url);
}
/* 新年度の設定。**手順と、いまどこまで済んでいるか。**
   判定できるものは checkYear がシートを見て決め、人しか判定できない手順だけ
   「新年度設定」シートに記録する。 */
function apiYearSetup(year){
  Gate.check();
  return Store.yearSetup(year || new Date().getFullYear());
}
function apiTickYearSetup(year, key, on){
  Gate.check();
  return Store.tickYearSetup(year, key, on);
}
/* 週案シートを作る。**これまではエディタからしか走らせられなかった。**
   新年度の手順の最後がエディタ頼みだと、そこで止まる。 */
function apiSetupPlanSheets(year){
  Gate.check();
  return setupPlanSheets(year);
}
/* A週の起点の月曜。**「設定」シートの1行だけを画面から直す。**
   ほかのキーは受け付けない（画面から設定を全部いじれるようにすると、
   関門の例外リストまで画面から書けることになる）。 */
function apiWriteVariantOrigin(monday){
  Gate.check();
  return Store.writeVariantOrigin(monday);
}
/* 年間行事計画表を貼り替える。**貼るのはシートではなく画面から。**
   シートのURLを教員に渡さないまま、年度初めの貼り替えが閉じる。 */
function apiWriteEvents(rows){
  Gate.check();
  return Store.writeEvents(rows);
}
function apiExportPlanSheet(name, sheets){
  Gate.check();
  return Store.exportPlanSheet(name, sheets);
}
