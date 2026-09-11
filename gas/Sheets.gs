/* ==================================================================
   Sheets.gs — シートの形と、読み書きの道具。

   **正本はシート。** コードに埋め込むのは既定値だけ。
   列の並びはここ1箇所で決める。読む側も書く側もここを通す。
================================================================== */
const Sheets = (function(){

  /* いま開いているファイル。**この中で SpreadsheetApp.getActive() を直に呼ばない。**
     年度でファイルを分ける日が来たら、差し替えるのはここ1か所にする
     （→ docs/spec.md 13-2）。呼ぶ側は「どのファイルか」を知らないままでよい。
     いまは1ファイルのままなので、中身は getActive() そのもの。

     Gate.gs だけは別で、自分で getActive() を呼んでいる。関門は Sheets.gs を
     読み込まずに動けなければならない（関門の検査は Gate.gs だけを読む）。 */
  function book(){ return SpreadsheetApp.getActive(); }
  function bookName(){ try{ return book().getName(); }catch(e){ return ""; } }

  /* 列は名前で引く。**位置で引かない。**
     列を1つ足しただけで全部ずれる書き方をしない。 */
  const SPEC = {
    "設定": {
      cols: ["キー", "値", "覚え書き"],
      seed: [
        ["印刷用紙",        "B5",  "B5 か A4"],
        ["印刷余白mm",      8,     "刷って教務必携に当てて決める"],
        ["印刷倍率",        1,     "同上。0.7〜1.15"],
        ["時数_貼る先",     "C2",  "時数集計表で、この左上のセルを選んで貼る"],
        ["時数_クラスの順", "3-1,3-2,3-3", "上から順に"],
        ["時数_1日の行数",  10,    "次の曜日が始まるまでの行数"],
        ["時数_列のずれ",   "am2:0,p1:2,p2:4,br:6,p3:7,p4:9,lun:11,p5:12,p6:14",
                                   "時程ID:左からの列数。実物に合わせて直す"],
        ["例外で通すメール", "",   "8桁の数字が本名のアドレスになっている職員だけ。"
                                 + "教職員ドメインの中でしか効かない"],
        ["たんぽぽファイルID", "", "たんぽぽ時間割のURL（そのまま貼ってよい）"],
        ["A週の起点の月曜", "2026-09-07", "この週がA週。あとは1週ごとに入れ替わる"],
        ["たんぽぽ支援員",     "", "たんぽぽ時間割に列を作る支援員。カンマ区切り"],
        ["たんぽぽ列幅",       50,   "児童の列の幅（px）。B4に入る枚数はここで決まる"],
        ["行事ファイルID",   "",   "年間行事計画表（取り込み用）のURL（そのまま貼ってよい）"]
      ]
    },
    "時程": {
      cols: ["ID", "表示名", "種別", "時刻", "時数表の列", "教科を選べる"],
      seed: [
        ["am1","朝休み","休み","8:10〜8:25","",       false],
        ["am2","朝学習","休み","8:25〜8:40","朝",     true ],
        ["p1", "1",    "授業","8:45〜9:30", "1校時", true ],
        ["p2", "2",    "授業","9:40〜10:25","2校時", true ],
        ["br", "業間",  "休み","10:25〜10:45","中",   false],
        ["p3", "3",    "授業","10:45〜11:30","3校時",true ],
        ["p4", "4",    "授業","11:40〜12:25","4校時",true ],
        ["lun","昼休み","休み","12:25〜13:25","昼",   false],
        ["p5", "5",    "授業","13:25〜14:10","5校時",true ],
        ["p6", "6",    "授業","14:20〜15:05","6校時",true ],
        /* 放課後は「備考」。題名の欄を作らず、備考だけにする */
        ["after","放課後","備考","",         "",     false]
      ]
    },
    /* 1行1クラス。**学年でクラス数が違う**ので、数を決め打ちしない。 */
    "クラス": {
      cols: ["年度", "学年", "クラス", "担任メール", "たんぽぽ交流級"],
      seed: (function(){
        const n = {"1":3, "2":3, "3":3, "4":3, "5":4, "6":4}, out = [];
        for(const g in n) for(let i = 1; i <= n[g]; i++) out.push(["", g, g + "-" + i, "", ""]);
        return out;
      })()
    },
    "専科": {
      cols: ["年度", "教科コード", "表示名", "メール"],
      seed: [["", "ongaku",  "音楽",   ""], ["", "zuko", "図工", ""],
             ["", "rika",    "理科",   ""], ["", "gaikoku", "外国語", ""]]
    },
    "教科": {
      cols: ["コード", "表示名", "時数表の1文字", "時数に数える"],
      seed: [
        ["kokugo","国語","国",true], ["shakai","社会","社",true],
        ["sansu","算数","算",true],  ["rika","理科","理",true],
        ["seikatsu","生活","生",true],["ongaku","音楽","音",true],
        ["zuko","図工","図",true],   ["katei","家庭","家",true],
        ["taiiku","体育","体",true], ["doutoku","道徳","道",true],
        ["gaikoku","外国語","外",true],["sogo","総合","総",true],
        ["gakkatsu","学活","学",true],
        /* 図書は固定時間割の「と」。数えるかは学校が決める（1文字を入れて true に） */
        ["tosho","図書","",false],
        /* 数えない教科は1文字を空にする。**書くと Excel 側の集計が増える。** */
        ["gyoji","行事","",false],   ["kyushoku","給食","",false],
        ["club","クラブ","",false],  ["iinkai","委員会","",false]
      ]
    },
    "基本時間割": {
      cols: ["年度", "クラス", "週", "曜日", "時程", "教科コード", "表示名"],
      seed: []
    },
    /* 旧・週案（1枚に全クラス）。**いまは使わない。**
       migratePlanSheets() でクラス別のシートへ移したあと、置いたままにしておく。
       消さないのは、移し損ねたときに元を見られるようにするため。 */
    "週案": {
      cols: ["年度", "日付", "時程", "層", "対象", "題名", "詳細",
             "教科コード", "担当", "更新者", "更新時刻"],
      seed: []
    },
    "年設定": {
      cols: ["年度", "第1週の月曜"],
      seed: []
    },
    /* 退避の記録。**この行がある年度＝退避ずみ。**

       「年設定」に列を足す形にしない。head() は列が1つ足りないだけで
       例外を投げるので、列を足した版を貼った瞬間、まだ列を足していない
       学校では全員が立ち上がらなくなる。**新しいシートなら誰も壊れない**
       （setup は無いシートを作るだけで、あるシートには触らない）。 */
    "退避": {
      cols: ["年度", "退避先URL", "退避日", "退避した人", "行数", "コマ数"],
      seed: []
    },
    /* たんぽぽ時間割の出す先。**1本とはかぎらない。**
       「設定」シートの たんぽぽファイルID を置き換えるもの。この行が
       1つも無いあいだは、今までどおり たんぽぽファイルID を見る
       （版を上げただけの学校が、貼った瞬間に出せなくなるのを避ける）。 */
    "たんぽぽ出力先": {
      cols: ["名前", "URL", "既定"],
      seed: []
    },
    /* 新年度の設定。**人しか判定できない手順だけを、ここに記録する。**
       残りは checkYear がシートを見て判定するので、書き込まない。
       3名の管理者が別々に進めるので、端末ではなくシートに置く。 */
    "新年度設定": {
      cols: ["年度", "項目", "済", "記録した人", "記録した日時"],
      seed: []
    }
  };

  const NAMES = Object.keys(SPEC);

  /* 見出しの決まっていないシート。**学校の固定時間割表をそのまま貼る場所。**
     列の並びは学校の表しだいなので、列名では読まない（読み方は src/js/fixed.js）。 */
  const PASTE = "固定時間割取り込み";

  /* 年間行事計画表の取り込み用。**1行1日の縦長の表**（docs/spec.md 6節）。
     元の表は3か月が横に並んでいるが、**そのままは読ませない。**
     月ブロックの開始列を1つ間違えると、別の月の行事が別の日付に静かに入る。
     日付の列があれば読み違えようがない。 */
  const EVENTS = "行事取り込み";
  const EVENT_COLS = ["日付", "週", "行事計画（児童）", "行事計画（職員）"];

  /* ── 週案はクラスごとに1枚 ──────────────────────
     1枚に全クラスを積むと、担任が自分の週案を目で確かめられない。
     シートを開いても、どの行が自分のものか分からない。
     **クラスごとに分け、中は日付順に並べる。**

       週案 3-3    … 担任が書いたもの・専科がそのクラスに入れたもの
       週案 3年    … 学年で入れたもの
       週案 全校    … 学校全体で入れたもの

     並べ替えは書くたびにこちらで行う。人が並べ替えなくても日付順に見える。 */
  const PLAN_PREFIX = "週案 ";
  const PLAN_ALL    = "全校";
  const PLAN_COLS = ["年度", "日付", "曜日", "時程", "題名", "詳細",
                     "教科コード", "層", "対象", "担当", "更新者", "更新時刻"];
  const PLAN_CLASS_COLS = ["対象"];

  /* 層と対象から、どのシートに置くかを決める。
     専科がクラスに入れたコマも、そのクラスのシートに置く。
     **担任が自分のシートを見れば、その週のすべてが載っている。** */
  function planName(layer, target){
    if(layer === "school") return PLAN_PREFIX + PLAN_ALL;
    if(layer === "grade")  return PLAN_PREFIX + asClass(target) + "年";
    return PLAN_PREFIX + asClass(target);
  }

  function ensurePlan(name){
    const ss = book();
    let sh = ss.getSheetByName(name);
    if(sh) return sh;
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, PLAN_COLS.length).setValues([PLAN_COLS]).setFontWeight("bold");
    sh.setFrozenRows(1);
    /* 対象の列は書式なしテキスト。**3-3 が「3月3日」に化けるのを止める。** */
    for(const col of PLAN_CLASS_COLS){
      const i = PLAN_COLS.indexOf(col);
      if(i >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat("@");
    }
    return sh;
  }

  /* 週案シートを読む。無ければ空。**日付は文字に直して返す。**
     シートに入れた "2026-09-07" は日付として取り込まれ、読むと Date で返る。
     文字のまま比べると、書いた行を二度と見つけられなくなる。 */
  /* **1枚につき、シートを開く1回と読む1回だけ。**
     GAS は API を呼ぶたびに待つ。行数・列数・見出し・中身を別々に取りに行くと、
     1枚あたり5往復になり、3枚で15往復ぶん待たされる。
     getDataRange は「字の入っている範囲」を1回で返す。 */
  function readPlan(name, ymdFn, all){
    const sh = (all && all[name]) || sheet(name);
    if(!sh) return [];
    const v = sh.getDataRange().getValues();
    if(v.length < 2) return [];
    const at = {};
    v[0].forEach((h, i) => { const k = String(h).trim(); if(k) at[k] = i; });
    const out = [];
    for(let i = 1; i < v.length; i++){
      const row = v[i];
      const o = {};
      for(const k of PLAN_COLS) o[k] = (k in at) ? row[at[k]] : "";
      o["日付"] = ymdFn(o["日付"]);
      o["対象"] = asClass(o["対象"]);
      if(!o["日付"] || !String(o["時程"]).trim()) continue;    /* 空行は飛ばす */
      out.push(o);
    }
    return out;
  }

  /* 名前 → シート の対応を1回で作る。**シートを1枚ずつ探しに行かない。** */
  function planMap(){
    const out = {};
    for(const sh of book().getSheets()){
      const n = sh.getName();
      if(n.indexOf(PLAN_PREFIX) === 0) out[n] = sh;
    }
    return out;
  }

  /* 並べ替えたものを丸ごと書き戻す。**行番号を覚えない。**
     行番号を覚えて1行ずつ直すやり方は、間に行が入ると別の行を書き換える。 */
  function writePlan(name, rows){
    const sh = ensurePlan(name);
    const w = PLAN_COLS.length;
    const body = rows.map(o => PLAN_COLS.map(c => (c in o && o[c] != null) ? o[c] : ""));
    grow(sh, body.length + 1, w);           /* 足りない行を先に作る（無いと落ちる） */
    if(body.length) sh.getRange(2, 1, body.length, w).setValues(body);
    const last = sh.getLastRow();
    if(last > body.length + 1)
      sh.getRange(body.length + 2, 1, last - body.length - 1, w).clearContent();
  }

  /* ── 退避 ────────────────────────────────────
     **消さない。名前を変えて残す。** 消してしまうと、形を作り直したあとに
     「前はこうだった」を誰も確かめられない。教員が自分で戻すこともできない。

     戻り値は退避後の名前（残さなかったときは空）。呼ぶ側は、これを画面に出して
     「どこへ退けたか」を必ず伝える。伝えないと、消えたと思われる。 */
  function stash(sh, tag){
    if(!sh) return "";
    if(sh.getLastRow() <= 1) return "";          /* 空なら残す値が無い */
    const stamp = Utilities.formatDate(new Date(), TZ_, "MMdd-HHmm");
    const name = sh.getName() + "（" + (tag || "前の形") + " " + stamp + "）";
    sh.setName(name);
    return name;
  }
  const TZ_ = Session.getScriptTimeZone ? Session.getScriptTimeZone() : "Asia/Tokyo";

  /* 外へ出す前に形を確かめる。**形が分からないときは書かない。**
     書いてしまうと、別の行に授業名が入る。落ちないので誰も気づかない。

     want = [{ok:真偽, why:"何がどう足りないか"}] の並び。
     すべて ok なら {ok:true}。だめなら {ok:false, why:[…]} を返す。
     **「エラーが発生しました」だけを出さない。** 何が足りないかを必ず言う。 */
  function shapeOk(where, want){
    const why = (want || []).filter(x => x && !x.ok).map(x => x.why);
    if(!why.length) return {ok:true, where, why:[]};
    return {ok:false, where, why};
  }
  /* 形が合わないときの言い方。**どのファイルの、何が、どう足りないか。** */
  function shapeError(r){
    return new Error(r.where + "の形が読めません。\n・" + r.why.join("\n・")
                   + "\n\n形を直してからもう一度。"
                   + "何行×何列あるか、見出しの行がどこかを見てください。");
  }

  /* いまある週案シートの名前。**移行や書き出しで、全部を見たいときに使う。** */
  function planNames(){
    return book().getSheets()
      .map(sh => sh.getName())
      .filter(n => n.indexOf(PLAN_PREFIX) === 0);
  }

  /* **クラス名は日付に化ける。**
     スプレッドシートは 1-1 を「1月1日」、6-3 を「6月3日」として取り込む。
     打ち込んでも、スクリプトから setValue しても同じ。放っておくと
     クラス「1-1」が Date になり、String() すると "Sat Jan 01 ..." になる。

     塞ぎ方は2枚。
       1. その列を**書式「書式なしテキスト」**にしておく（作るときに1回）
       2. 読むときに、Date で来たら **月-日 に戻す**（すでに化けたシートも直る）
     1-1 は1月1日、6-3 は6月3日なので、月と日から元の字にそのまま戻せる。 */
  const CLASS_COLS = {
    "クラス":     ["クラス"],
    "基本時間割": ["クラス"],
    "週案":       ["対象"]
  };

  /* 日付かどうかは **形で見る**。instanceof は、違う実行環境から来た値では
     必ず外れる（同じ Date でも別物として扱われる）。 */
  const isDate = v => !!v && typeof v === "object"
                   && typeof v.getMonth === "function" && typeof v.getDate === "function";

  /* たんぽぽ時間割の塗り分け。**モノクロ印刷で見分けるための色。**
       このサイトから入れたコマ  … 灰色
       担当者・場所が「た」で始まる … 白（たんぽぽの中で受ける授業）
       授業名が 国語・算数・自立 で始まる … 白（同上。TANPOPO_OWN）
     灰は #DCDCDC。白との明るさの差が 1.4 倍あり、黒い字は 12.7:1 で読める。
     #F2F2F2 まで薄くすると差が 1.1 倍しかなく、トナーを節約する設定の
     プリンタや白黒コピーで消える（実測して落とした）。

     **この色はこちらが塗らない。** たんぽぽ時間割の側の条件付き書式
     （すぐ下の担当者・場所が「た」で始まるか、授業名が TANPOPO_OWN で始まるか）が塗る。
     こちらが塗ると、たんぽぽ担当が担当者・場所を直したあとに色と中身が食い違う。
     ここに残しているのは、シート側の書式を作るときの値の控え（docs/setup.md Step 8）。 */
  const TANPOPO_FILL = {
    imported: "#DCDCDC",   /* このサイトから入れたコマ（奇数組） */
    own:      "#FFFFFF",   /* たんぽぽの中で受ける授業（担当が「た」） */
    /* **たんぽぽ偶数組の列。** 奇数組と見分けるための地。
       色だけに頼らない：組の境目には太い縦罫線も引く（→ Store.buildTanpopo）。
       青みの側に振ってあるのは、青が最も多くの色覚型で灰と分かれるため。
       どちらも黒文字とのコントラストは 10:1 を超える。 */
    evenImported: "#C3D2E2",   /* 偶数組の授業名の行 */
    evenBody:     "#EDF2F8"    /* 偶数組のそれ以外の行 */
  };

  /* **たんぽぽの中で受ける授業の名前。** 授業名がこれで始まるコマも白にする。
     担当者・場所を直す前でも、たんぽぽ担当が自分の持ちコマを見つけられる。

     **前方一致にする。** 「含むか」で見ると **「外国語」が「国語」を含む**ので、
     5・6年の外国語がすべて白くなる。「国語 音読テスト」のように書き足された
     コマは白にしたいので、完全一致でもない。
     画面の下見も同じ規則で塗る（→ src/js/tanpopo.js TANPOPO_OWN）。 */
  const TANPOPO_OWN = ["国語", "算数", "自立"];

  function asClass(v){
    if(isDate(v)) return (v.getMonth() + 1) + "-" + v.getDate();
    return String(v == null ? "" : v).trim();
  }

  function sheet(name){
    const ss = book();
    return ss.getSheetByName(name);
  }

  /* ── 足りない行・列を先に作る ──────────────────
     **Apps Script は getRange で足りない行を自動では作らない。**
     新しいシートの既定は 1000行 × 26列で、そこを1行でも超えた瞬間、
     setValues が「範囲外」で落ちる。落ちるのは

       基本時間割  20クラス × A/B × 5日 × 6校時 = 1,200行
                   → **1回目の固定時間割取り込みで落ちる**
       週案 ◯-◯   1クラス 週30コマ × 年40週 = 1,200行
                   → **1年目の11〜12月ごろ、そのクラスだけ保存が止まる**
       たんぽぽ    1 + 児童26列 + 支援員8列 = 35列
                   → **26列を超えた時点で、形を作るところで落ちる**

     どれも「そのうち必ず来る」ので、書く前にここで伸ばす。
     まとめて余分に伸ばすのは、1行ずつ足すたびに API を1往復するのを避けるため。 */
  const GROW_SLACK = 200;
  function grow(sh, rows, cols){
    if(rows){
      const have = sh.getMaxRows();
      if(rows > have) sh.insertRowsAfter(have, rows - have + GROW_SLACK);
    }
    if(cols){
      const have = sh.getMaxColumns();
      if(cols > have) sh.insertColumnsAfter(have, cols - have + 8);
    }
    return sh;
  }

  /* シートを作る。**あるものは触らない。** 何度走らせても同じ結果になる。 */
  function setup(){
    const ss = book();
    const made = [], kept = [];
    for(const name of NAMES){
      let sh = ss.getSheetByName(name);
      if(sh){ kept.push(name); continue; }
      sh = ss.insertSheet(name);
      const spec = SPEC[name];
      const rows = [spec.cols].concat(spec.seed.map(r => r.slice()));
      sh.getRange(1, 1, rows.length, spec.cols.length).setValues(rows);
      sh.getRange(1, 1, 1, spec.cols.length).setFontWeight("bold");
      sh.setFrozenRows(1);
      /* クラス名の列は「書式なしテキスト」にして、日付に化けないようにする */
      for(const col of (CLASS_COLS[name] || [])){
        const i = spec.cols.indexOf(col);
        if(i >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat("@");
      }
      made.push(name);
    }
    /* 行事の取り込み用。**見出しは作る**（1行1日の形が決まっているため） */
    if(!ss.getSheetByName(EVENTS)){
      const sh = ss.insertSheet(EVENTS);
      sh.getRange(1, 1, 1, EVENT_COLS.length).setValues([EVENT_COLS]).setFontWeight("bold");
      sh.setFrozenRows(1);
      made.push(EVENTS);
    }
    /* 貼り付け用のシート。見出しは作らない（学校の表をそのまま貼るため） */
    if(!ss.getSheetByName(PASTE)){
      const sh = ss.insertSheet(PASTE);
      sh.getRange(1, 1).setValue(
        "ここに学校の固定時間割表を、見出し（曜日・校時・A/B）ごと貼る。"
        + "貼ったらウェブアプリの「基本時間割を取り込む」で読む。この1行は消してよい。");
      made.push(PASTE);
    }
    return {made, kept};
  }

  /* ── 放課後の行を足す ────────────────────────
     `setup()` は**無いシートを作るだけ**で、あるシートには触らない。
     だから「時程」シートを先に作った学校には、あとから足した
     **放課後（種別＝備考）の行が永久に入らない**。画面には放課後の欄が
     出ず、シートを見ても何が足りないのか分からない。

     足すのはこの1行だけ。ほかの行は触らない（学校が消した行を勝手に戻さない）。
     戻り値は足したかどうか。**足したことは必ず画面に出す。** */
  function fillAfterRow(){
    const sh = sheet("時程");
    if(!sh) return "";
    const {at} = head("時程");
    const last = sh.getLastRow();
    if(last < 2) return "";
    const v = sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).getValues();
    for(const row of v)
      if(String(row[at["種別"]] || "").indexOf("備考") >= 0) return "";   /* もうある */
    const seed = SPEC["時程"].seed.filter(r => String(r[2]).indexOf("備考") >= 0);
    if(!seed.length) return "";
    appendRows("時程", seed.map(r => r.slice()));
    return String(seed[0][1]);                   /* 「放課後」 */
  }

  /* 見出しの行を読んで、列名 → 位置 の対応を作る。 */
  function head(name){
    const sh = sheet(name);
    if(!sh) throw new Error("シートが無い: " + name + "（setupSheets を実行する）");
    const w = Math.max(1, sh.getLastColumn());
    const row = sh.getRange(1, 1, 1, w).getValues()[0];
    const at = {};
    row.forEach((v, i) => { const k = String(v).trim(); if(k) at[k] = i; });
    for(const c of SPEC[name].cols)
      if(!(c in at)) throw new Error(name + " シートに「" + c + "」の列が無い");
    return {sh, at, width: w};
  }

  /* 表を丸ごと読んで、行オブジェクトの配列にする。
     GAS は API を1回呼ぶたびに待つので、**まとめて1回で読む。** */
  /* まだ無いシートも読む。**無いことを「例外」にしない。**
     退避の記録のように、あとから足したシートは、古い学校にはまだ無い。
     無いだけで立ち上がらなくなるほうが、よほど困る。 */
  function readAllSoft(name){
    if(!sheet(name)) return {rows: [], at: {}};
    try{ return readAll(name); }
    catch(e){ return {rows: [], at: {}}; }     /* 列が足りない古い形も、無いものとして扱う */
  }

  function readAll(name){
    const {sh, at} = head(name);
    const last = sh.getLastRow();
    if(last < 2) return {rows: [], at};
    const w = Math.max(1, sh.getLastColumn());
    const v = sh.getRange(2, 1, last - 1, w).getValues();
    const rows = [], fix = CLASS_COLS[name] || [];
    for(let i = 0; i < v.length; i++){
      const o = {__row: i + 2};
      for(const k in at) o[k] = v[i][at[k]];
      for(const col of fix) if(col in o) o[col] = asClass(o[col]);   /* 化けていたら戻す */
      if(String(o[SPEC[name].cols[0]]).trim() === "" &&
         String(o[SPEC[name].cols[1]] || "").trim() === "") continue;   /* 空行は飛ばす */
      rows.push(o);
    }
    return {rows, at};
  }

  const appendRows = (name, arrays) => {
    if(!arrays.length) return;
    const {sh} = head(name);
    const at = sh.getLastRow() + 1;
    grow(sh, at + arrays.length - 1, arrays[0].length);
    sh.getRange(at, 1, arrays.length, arrays[0].length).setValues(arrays);
  };
  function toArray(name, obj){
    return SPEC[name].cols.map(c => (c in obj && obj[c] != null) ? obj[c] : "");
  }
  function setRow(name, rowNo, obj){
    const {sh} = head(name);
    grow(sh, rowNo, SPEC[name].cols.length);
    sh.getRange(rowNo, 1, 1, SPEC[name].cols.length).setValues([toArray(name, obj)]);
  }
  /* 行は消さずに空にする。**消すと、その下の行番号がすべてずれる。**
     同じ書き込みの途中で覚えた行番号が、別の行を指すようになる。 */
  function blankRow(name, rowNo){
    const {sh} = head(name);
    sh.getRange(rowNo, 1, 1, SPEC[name].cols.length).clearContent();
  }

  /* 貼り付けたシートを、字の入っている範囲だけ**そのままの形**で読む。
     日付に化けた 1-1 などもあるので、Date は月-日に戻して渡す。 */
  function readGrid(name){
    const sh = sheet(name);
    if(!sh) return [];
    const r = sh.getLastRow(), c = sh.getLastColumn();
    if(!r || !c) return [];
    return sh.getRange(1, 1, r, c).getValues()
             .map(row => row.map(v => isDate(v) ? asClass(v) : String(v == null ? "" : v)));
  }

  return {SPEC, NAMES, PASTE, EVENTS, EVENT_COLS, CLASS_COLS,
          TANPOPO_FILL, TANPOPO_OWN, asClass, isDate, readGrid,
          book, bookName, stash, shapeOk, shapeError, readAllSoft, grow, fillAfterRow,
          PLAN_PREFIX, PLAN_ALL, PLAN_COLS, planName, ensurePlan, readPlan, writePlan,
          planNames, planMap,
          setup, head, readAll, appendRows, toArray, setRow, blankRow, sheet};
})();

/* シートを作る。エディタから1回実行する。 */
function setupSheets(){
  Gate.check();                 /* URL を開ける人は直接叩ける。ここも関門を通す */
  const r = Sheets.setup();
  /* **あとから足した行は、setup では入らない。** ここで1行だけ面倒を見る。
     放課後の行が無いと、画面に放課後の欄そのものが出ない */
  r.added = Sheets.fillAfterRow();
  const msg = "作った: " + (r.made.join("、") || "なし")
            + "\nもうあった: " + (r.kept.join("、") || "なし")
            + (r.added ? "\n「時程」シートに「" + r.added + "」の行を足した" : "");
  try{ SpreadsheetApp.getUi().alert(msg); }catch(e){ Logger.log(msg); }
  return r;
}
