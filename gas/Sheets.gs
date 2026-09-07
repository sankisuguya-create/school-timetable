/* ==================================================================
   Sheets.gs — シートの形と、読み書きの道具。

   **正本はシート。** コードに埋め込むのは既定値だけ。
   列の並びはここ1箇所で決める。読む側も書く側もここを通す。
================================================================== */
const Sheets = (function(){

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
        ["たんぽぽファイルID", "", "たんぽぽ時間割のスプレッドシートID"],
        ["行事ファイルID",   "",   "年間行事計画表（取り込み用）のスプレッドシートID"]
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
        ["p6", "6",    "授業","14:20〜15:05","6校時",true ]
      ]
    },
    /* 1行1クラス。**学年でクラス数が違う**ので、数を決め打ちしない。 */
    "クラス": {
      cols: ["年度", "学年", "クラス", "担任メール"],
      seed: (function(){
        const n = {"1":3, "2":3, "3":3, "4":3, "5":4, "6":4}, out = [];
        for(const g in n) for(let i = 1; i <= n[g]; i++) out.push(["", g, g + "-" + i, ""]);
        return out;
      })()
    },
    "専科": {
      cols: ["年度", "教科コード", "表示名", "メール"],
      seed: [["", "ongaku", "音楽", ""], ["", "zuko", "図工", ""], ["", "rika", "理科", ""]]
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
        /* 数えない教科は1文字を空にする。**書くと Excel 側の集計が増える。** */
        ["gyoji","行事","",false],   ["kyushoku","給食","",false],
        ["club","クラブ","",false],  ["iinkai","委員会","",false]
      ]
    },
    "基本時間割": {
      cols: ["年度", "クラス", "週", "曜日", "時程", "教科コード", "表示名"],
      seed: []
    },
    /* **1行1コマ。** 書かれたものだけが行になる（基本時間割どおりの週は0行）。 */
    "週案": {
      cols: ["年度", "日付", "時程", "層", "対象", "題名", "詳細",
             "教科コード", "担当", "更新者", "更新時刻"],
      seed: []
    },
    "年設定": {
      cols: ["年度", "第1週の月曜"],
      seed: []
    }
  };

  const NAMES = Object.keys(SPEC);

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

  function asClass(v){
    if(isDate(v)) return (v.getMonth() + 1) + "-" + v.getDate();
    return String(v == null ? "" : v).trim();
  }

  function sheet(name){
    const ss = SpreadsheetApp.getActive();
    return ss.getSheetByName(name);
  }

  /* シートを作る。**あるものは触らない。** 何度走らせても同じ結果になる。 */
  function setup(){
    const ss = SpreadsheetApp.getActive();
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
    return {made, kept};
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
    sh.getRange(sh.getLastRow() + 1, 1, arrays.length, arrays[0].length).setValues(arrays);
  };
  function toArray(name, obj){
    return SPEC[name].cols.map(c => (c in obj && obj[c] != null) ? obj[c] : "");
  }
  function setRow(name, rowNo, obj){
    const {sh} = head(name);
    sh.getRange(rowNo, 1, 1, SPEC[name].cols.length).setValues([toArray(name, obj)]);
  }
  /* 行は消さずに空にする。**消すと、その下の行番号がすべてずれる。**
     同じ書き込みの途中で覚えた行番号が、別の行を指すようになる。 */
  function blankRow(name, rowNo){
    const {sh} = head(name);
    sh.getRange(rowNo, 1, 1, SPEC[name].cols.length).clearContent();
  }

  return {SPEC, NAMES, CLASS_COLS, asClass, isDate,
          setup, head, readAll, appendRows, toArray, setRow, blankRow, sheet};
})();

/* シートを作る。エディタから1回実行する。 */
function setupSheets(){
  const r = Sheets.setup();
  const msg = "作った: " + (r.made.join("、") || "なし")
            + "\nもうあった: " + (r.kept.join("、") || "なし");
  try{ SpreadsheetApp.getUi().alert(msg); }catch(e){ Logger.log(msg); }
  return r;
}
