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
    if(!patches || !patches.length) return {at:{}, count:0, ms:0, waitMs:0};
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
      return {at, count: patches.length, sheets: Object.keys(byName).length,
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
  /* 交流級の見出しを読む。**Date で返ってくることがある。**
     スプレッドシートは 1-2 を「1月2日」として取り込む。画面には 1-2 と
     出ているのに getValues() は Date を返すので、字として比べると
     交流級の列が1つも見つからない。Sheets.asClass が月-日から元の字へ戻す。 */
  function tpCls(v){ return tpNorm(Sheets.asClass(v)); }

  /* たんぽぽ時間割のファイルを開く。**シートは名前で作る**ので、
     「たんぽぽシート名」の設定はもう見ない（週ごとに名前が変わるため）。 */
  function tpOpen(){
    const cfg = readConfig();
    const id = fileId(cfg["たんぽぽファイルID"], "たんぽぽファイルID");
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
  function exportWeek(year, mondayISO, titles, cols, slots, name){
    const {ss, cfg} = tpOpen();
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

    /* 授業名の行は灰色。担当者・場所が「た」で始まる列だけ、条件付き書式で白に戻す */
    const rules = [];
    for(let d = 0; d < 5; d++){
      const top = 2 + d * TP_BUILD_ROWS;
      for(const off of TP_TITLE_OFF){
        const r = top + off;
        const rng = nw.getRange(r, 2, 1, width - 1);
        rng.setBackground(F.imported);
        for(const c of even) nw.getRange(r, c).setBackground(F.evenImported);
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=LEFT(B' + (r + 1) + ',1)="た"')
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

  function addDays_(isoStr, n){
    const p = String(isoStr).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] + n);
  }

  return {readWeek, readBase, readRoster, readConfig, readSlots, readSubjects,
          writeCells, writeRoster, writeBase, writeBaseAll, readPaste,
          exportWeek, weekSheetName, weekOrder, migratePlan, checkYear,
          archiveCount, archiveVerify, archivePurge, archivedAll, ymd,
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
/* たんぽぽ時間割へ、**1週ぶんを1枚のシートとして出す**。シート名は「9月1週」。
   同じ名前のシートがあれば、消さずに名前を変えて残す。
   出す先の形をこちらが毎週作るので、「形をみる」「形を作りなおす」は要らない。 */
function apiExportWeek(year, mondayISO, titles, cols, slots, name){
  Gate.check();
  return Store.exportWeek(year, mondayISO, titles, cols, slots, name);
}
