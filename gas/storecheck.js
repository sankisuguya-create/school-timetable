/* ==================================================================
   storecheck.js — シートの読み書きを手元で動かして確かめる。

     node gas/storecheck.js

   Apps Script の API を偽物に差し替える。偽物は**実際に値を溜める**ので、
   書いて読み直すところまで見られる。Google のアカウントは要らない。
   貼らない。
================================================================== */
process.env.TZ = "Asia/Tokyo";
const fs = require("fs"), path = require("path"), vm = require("vm");

/* ── 偽のスプレッドシート ─────────────────────── */
const SHEETS = {};                       /* 名前 → 二次元配列 */
const FORMATS = {};                      /* 名前/列 → 表示形式 */
const WIDE = 20;                         /* 偽物の最大列数 */

/* **偽物を本物より寛容にしない。**
   前はここで、要求された行と列を勝手に足していた。だから
   「1000行を超えると setValues が範囲外で落ちる」という本物の壁が
   検査に一度も出ず、230件が全部通ったまま本番で落ちる形になっていた。
   いまは新しいシートと同じ 1000行 × 26列から始め、
   insertRowsAfter / insertColumnsAfter で伸ばしたぶんだけ広がる。 */
const NEW_ROWS = 1000, NEW_COLS = 26;
function ensure(grid, r, c){
  /* 検査のほうが直に押し込んだ行は、シートの側にもあることにする
     （put(...) で1行ずつ足す書き方をしている検査があるため） */
  if(grid.length > grid.max.rows) grid.max.rows = grid.length;
  if(r > grid.max.rows)
    throw new Error("範囲外：" + r + " 行目は、このシート（" + grid.max.rows
                  + " 行）にはありません");
  if(c > grid.max.cols)
    throw new Error("範囲外：" + c + " 列目は、このシート（" + grid.max.cols
                  + " 列）にはありません");
  while(grid.length < r) grid.push(new Array(WIDE).fill(""));
  for(const row of grid) while(row.length < c) row.push("");
}
/* 偽シートの中身に、行数・列数の上限を持たせる */
function limited(grid){
  if(!grid.max) grid.max = {rows: NEW_ROWS, cols: NEW_COLS};
  return grid;
}
function fakeSheet(name){
  const grid = limited(SHEETS[name]);
  return {
    /* 本物と同じ。**足りない行・列は勝手に増えない。** insertRows/Columns で増やす */
    getMaxRows(){ return grid.max.rows; },
    getMaxColumns(){ return grid.max.cols; },
    insertRowsAfter(after, n){ grid.max.rows += n; return this; },
    insertColumnsAfter(after, n){ grid.max.cols += n; return this; },
    getName: () => name,
    getLastRow(){
      let last = 0;
      grid.forEach((row, i) => { if(row.some(v => v !== "" && v != null)) last = i + 1; });
      return last;
    },
    getLastColumn(){
      let last = 0;
      for(const row of grid) row.forEach((v, i) => { if(v !== "" && v != null) last = Math.max(last, i + 1); });
      return last;
    },
    getRange(r, c, nr, nc){
      nr = nr || 1; nc = nc || 1;
      ensure(grid, r + nr - 1, c + nc - 1);
      return {
        getValues(){
          const out = [];
          for(let i = 0; i < nr; i++) out.push(grid[r - 1 + i].slice(c - 1, c - 1 + nc));
          return out;
        },
        setValue(v){
          ensure(grid, r, c);
          grid[r - 1][c - 1] = v;
          return this;
        },
        setValues(v){
          for(let i = 0; i < nr; i++) for(let j = 0; j < nc; j++)
            grid[r - 1 + i][c - 1 + j] = v[i][j];
          return this;
        },
        clearContent(){
          for(let i = 0; i < nr; i++) for(let j = 0; j < nc; j++)
            grid[r - 1 + i][c - 1 + j] = "";
          return this;
        },
        setFontWeight(){ return this; },
        setNumberFormat(f){
          for(let j = 0; j < nc; j++) FORMATS[name + "/" + (c + j)] = f;
          return this;
        }
      };
    },
    setFrozenRows(){},
    getDataRange(){
      const r = this.getLastRow(), c = this.getLastColumn();
      return this.getRange(1, 1, Math.max(1, r), Math.max(1, c));
    }
  };
}
/* たんぽぽ時間割（別のファイル）。openById で開く先 */
const TPID = "1FNJFrJP_bjdA2fA8I3pUTtHeXLt9Df25rRttKWkIXGo";   /* 実物と同じ長さのID */
const TPFILE = {name:"たんぽぽ時間割", sheets:{}};
function tpSheet(name){
  const grid = TPFILE.sheets[name];
  const base = fakeSheetOn(grid, name);
  return base;
}
/* 列の幅。**本物と同じで、読み書きできる。**
   幅を入れているつもりで入っていない形を、検査で見分けられるようにする */
const WIDTHS = {};
function fakeSheetOn(grid0, name){
  const grid = limited(grid0);
  const s0 = {
    setColumnWidth(c, w){ WIDTHS[name + "/" + c] = w; return s0; },
    setColumnWidths(c, n, w){
      for(let i = 0; i < n; i++) WIDTHS[name + "/" + (c + i)] = w;
      return s0;
    },
    getMaxRows(){ return grid.max.rows; },
    getMaxColumns(){ return grid.max.cols; },
    insertRowsAfter(after, n){ grid.max.rows += n; return s0; },
    insertColumnsAfter(after, n){ grid.max.cols += n; return s0; },
    getName: () => name,
    getLastRow(){ let last = 0;
      grid.forEach((row, i) => { if(row.some(v => v !== "" && v != null)) last = i + 1; });
      return last; },
    getLastColumn(){ let last = 0;
      for(const row of grid) row.forEach((v, i) => { if(v !== "" && v != null) last = Math.max(last, i + 1); });
      return last; },
    getRange(r, c, nr, nc){
      nr = nr || 1; nc = nc || 1;
      ensure(grid, r + nr - 1, c + nc - 1);
      return {
        getValues(){ const out = [];
          for(let i = 0; i < nr; i++) out.push(grid[r - 1 + i].slice(c - 1, c - 1 + nc));
          return out; },
        setValues(v){ for(let i = 0; i < nr; i++) for(let j = 0; j < nc; j++)
            grid[r - 1 + i][c - 1 + j] = v[i][j];
          return this; },
        setValue(v){ grid[r - 1][c - 1] = v; return this; },
        clearContent(){ return this; },
        setFontWeight(){ return this; },
        /* **書式を実際に覚える。** 覚えない偽物にしていると、
           「交流級の列を書式なしテキストにした」ことを検査できない */
        setNumberFormat(f){
          for(let i = 0; i < nr; i++) for(let j = 0; j < nc; j++)
            FORMATS[name + "/" + (r + i) + "," + (c + j)] = f;
          return this;
        },
        setBorder(){ return this; },
        setBackground(){ return this; }
      };
    },
    setConditionalFormatRules(){},
    setFrozenRows(){}, setFrozenColumns(){},
    setName(n){
      TPFILE.sheets[n] = grid; delete TPFILE.sheets[name];
      if(TPFILE.order){
        const i = TPFILE.order.indexOf(name);
        if(i >= 0) TPFILE.order[i] = n;
      }
      name = n; return s0;
    },
    getDataRange(){
      const r = s0.getLastRow(), c = s0.getLastColumn();
      return s0.getRange(1, 1, Math.max(1, r), Math.max(1, c));
    }
  };
  return s0;
}

/* 退避先（人がドライブで丸ごと複製したもの）。openById で開く先。
   複製なので、中身は本体のシートの写しになる。 */
const BOOKID = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";   /* 本体のID */
const ARCID  = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";   /* 退避先のID */
/* たんぽぽファイルのシートの並び。insertSheet の位置がそのまま出る */
function tpNames(){
  const have = Object.keys(TPFILE.sheets);
  const ord = (TPFILE.order || []).filter(n => n in TPFILE.sheets);
  for(const n of have) if(ord.indexOf(n) < 0) ord.push(n);
  TPFILE.order = ord;
  return ord;
}

const ARCFILE = {name:"週案 保存 2026年度", sheets:{}};
const arcSheet = name => fakeSheetOn(ARCFILE.sheets[name], name);
/* 人がドライブで「コピーを作成」したのと同じことをする */
const activeBook = () => ({
  getId: () => BOOKID,
  getName: () => "週案 2026年度",
  getSheetByName: n => (n in SHEETS) ? fakeSheet(n) : null,
  insertSheet(n){ SHEETS[n] = []; return fakeSheet(n); },
  getSheets(){ return Object.keys(SHEETS).map(fakeSheet); }
});
function copyBook(){
  ARCFILE.sheets = {};
  for(const n in SHEETS) ARCFILE.sheets[n] = SHEETS[n].map(r => r.slice());
}

let EMAIL = "tanaka@edu.nishi.or.jp";
const locks = {held:0};

const sandbox = {
  console,
  Logger: {log(){}},
  Session: {getActiveUser: () => ({getEmail: () => EMAIL})},
  SpreadsheetApp: {
    BorderStyle: {SOLID_THICK: "SOLID_THICK"},
    newConditionalFormatRule(){
      const r = {whenFormulaSatisfied(){ return r; }, setBackground(){ return r; },
                 setRanges(){ return r; }, build(){ return {}; }};
      return r;
    },
    getActive: () => activeBook(),
    openById(id){
      if(id === BOOKID) return activeBook();      /* 同じファイルのURLを貼った形 */
      if(id === ARCID) return {
        getId: () => ARCID,
        getName: () => ARCFILE.name,
        getSheets: () => Object.keys(ARCFILE.sheets).map(arcSheet),
        getSheetByName: n => (n in ARCFILE.sheets) ? arcSheet(n) : null
      };
      if(id !== TPID) throw new Error("そんなファイルは無い: " + id);
      return {
        getName: () => TPFILE.name,
        getSheets: () => tpNames().map(tpSheet),
        getSheetByName: n => (n in TPFILE.sheets) ? tpSheet(n) : null,
        /* **位置を受ける。** 週の順に並べているかを検査で見る */
        insertSheet(n, at){
          TPFILE.sheets[n] = [];
          TPFILE.order = TPFILE.order || Object.keys(TPFILE.sheets).filter(x => x !== n);
          const cur = (TPFILE.order || []).filter(x => x in TPFILE.sheets && x !== n);
          const i = (at === undefined || at === null) ? cur.length : Math.max(0, Math.min(cur.length, at));
          cur.splice(i, 0, n);
          TPFILE.order = cur;
          return tpSheet(n);
        },
        deleteSheet(x){ delete TPFILE.sheets[x.getName()]; }
      };
    },
    flush(){},
    getUi(){ throw new Error("UI 無し"); }
  },
  LockService: {
    getScriptLock: () => ({
      waitLock(){ locks.held++; if(locks.held > 1) throw new Error("ロックが二重に取られた"); },
      releaseLock(){ locks.held--; }
    })
  },
  Utilities: {
    /* **形の指定どおりに返す。** 「yyyy-MM-dd」だけを返す偽物にしていると、
       退避したシートの名前が本物と違う形になり、そこを検査できない */
    formatDate(d, tz, fmt){
      const p = n => String(n).padStart(2, "0");
      return String(fmt)
        .replace(/yyyy/g, d.getFullYear())
        .replace(/MM/g,   p(d.getMonth() + 1))
        .replace(/dd/g,   p(d.getDate()))
        .replace(/HH/g,   p(d.getHours()))
        .replace(/mm/g,   p(d.getMinutes()));
    }
  }
};
vm.createContext(sandbox);
for(const f of ["Gate.gs", "Sheets.gs", "Store.gs"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, {filename: f});
const ev = s => vm.runInContext(s, sandbox);

/* ── 道具 ─────────────────────────────────────── */
let ng = 0;
function ok(name, cond, got){
  const pass = cond === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name + (pass ? "" : "   → " + JSON.stringify(got)));
}
const rowsOf = name => SHEETS[name].filter(r => r.some(v => v !== "" && v != null));
const Sheets_asClass = v => ev("Sheets.asClass")(v);

/* ── シートを作る ─────────────────────────────── */
console.log("■ シートを作る");
let made = ev("Sheets.setup()");
ok("9枚＋取り込み用の2枚ができる", made.made.length === 11, made.made);
made = ev("Sheets.setup()");
ok("2回目は何も作らない（何度走らせても同じ）",
   made.made.length === 0 && made.kept.length === 9, made);
ok("列は名前で引ける", Object.keys(ev('Sheets.head("週案").at')).length >= 11);

console.log("\n■ 既定値の読み取り");
const slots = ev("Store.readSlots()");
ok("時程が11行（放課後を含む）", slots.length === 11, slots.length);
ok("1校時は授業で、時刻を持つ",
   slots[2].id === "p1" && slots[2].kind === "lesson" && slots[2].time.indexOf(":") > 0, slots[2]);
ok("朝休みは休み", slots[0].kind === "brk");
ok("放課後は備考だけの行", slots.find(x => x.id === "after").kind === "note",
   slots.find(x => x.id === "after"));
const subs = ev("Store.readSubjects()");
ok("教科が18（図書を含む）", subs.length === 18, subs.length);
ok("国語は数える／行事は数えない",
   subs.find(s => s.code === "kokugo").count === true
   && subs.find(s => s.code === "gyoji").count === false);
ok("数えない教科の1文字は空",
   subs.filter(s => !s.count).every(s => s.short === ""));

console.log("\n■ 学級編成（5年6年だけ4クラス）");
let roster = ev("Store.readRoster(2026)");
const n = g => (roster.classes[g] || []).length;
ok("1〜4年が3クラス", [1,2,3,4].every(g => n(g) === 3), [n(1),n(2),n(3),n(4)]);
ok("5年6年が4クラス", n(5) === 4 && n(6) === 4, [n(5), n(6)]);
ok("合計20学級",
   Object.keys(roster.classes).reduce((a,g) => a + n(g), 0) === 20);
ok("専科が4つ（音楽・図工・理科・外国語）",
   roster.specials.length === 4
   && roster.specials.map(s => s.code).indexOf("gaikoku") >= 0, roster.specials);

console.log("\n■ 週案はクラスごとのシートに、日付順で入る");
let res = ev(`Store.writeCells(2026, [
  {date:"2026-11-20", slot:"p1", layer:"home",   target:"3-3", title:"あとの日"},
  {date:"2026-11-16", slot:"p2", layer:"home",   target:"3-3", title:"算数", note:"わり算", subject:"sansu"},
  {date:"2026-11-16", slot:"am1",layer:"home",   target:"3-3", title:"朝の会"},
  {date:"2026-11-18", slot:"p3", layer:"grade",  target:"3",   title:"学年体育", subject:"taiiku"},
  {date:"2026-11-20", slot:"am1",layer:"school", target:"",    title:"避難訓練"},
  {date:"2026-11-17", slot:"p2", layer:"special",target:"2-1", title:"音楽", subject:"ongaku", sp:"ongaku"}
])`);
ok("6件書いた", res.count === 6);
ok("担任のコマは「週案 3-3」に入る", !!SHEETS["週案 3-3"], Object.keys(SHEETS));
ok("学年のコマは「週案 3年」に入る", !!SHEETS["週案 3年"]);
ok("全校のコマは「週案 全校」に入る", !!SHEETS["週案 全校"]);
ok("専科がクラスに入れたコマも、そのクラスのシートに入る",
   !!SHEETS["週案 2-1"], Object.keys(SHEETS));
ok("1枚に全クラスを積まない", rowsOf("週案 3-3").length === 4, rowsOf("週案 3-3").length);
/* 入力した順ではなく日付順。同じ日は時程の順 */
const dates = (function(){
  const at = ev('(function(){const o={};Sheets.PLAN_COLS.forEach((c,i)=>o[c]=i);return o;})()');
  return rowsOf("週案 3-3").slice(1)
    .map(r => String(r[at["日付"]]) + " " + String(r[at["時程"]]));
})();
ok("日付順・時程順に並ぶ（入力した順ではない）",
   JSON.stringify(dates) === JSON.stringify(
     ["2026-11-16 am1", "2026-11-16 p2", "2026-11-20 p1"]), dates);
ok("曜日も入る（人が読むため）", (function(){
     const at = ev('(function(){const o={};Sheets.PLAN_COLS.forEach((c,i)=>o[c]=i);return o;})()');
     return String(rowsOf("週案 3-3")[1][at["曜日"]]) === "月";
   })() === true);

let w = ev('Store.readWeek(2026, "2026-11-16")');
ok("担任のコマが戻る", w.home["3-3"]["0|p2"].title === "算数", w.home);
ok("学年のコマが戻る", w.grade["3"]["2|p3"].title === "学年体育");
ok("全校のコマが戻る", w.school["4|am1"].title === "避難訓練");
ok("専科のコマは担当付きで戻る",
   w.special["2-1"]["1|p2"].sp === "ongaku", w.special);
/* **画面は「月曜から何日目か」でコマを持つ。** 日付のまま返すと、
   シートには正しく入るのに、次に開いたとき画面が見つけられず、
   基本時間割に戻って見える。ここは形の取り決めなので、字で押さえる。 */
ok("画面と同じキー（何日目|時程）で返す",
   Object.keys(w.home["3-3"]).every(k => /^[0-6]\|/.test(k)),
   Object.keys(w.home["3-3"]));
ok("日付のままのキーは返さない",
   !Object.keys(w.home["3-3"]).some(k => /^\d{4}-/.test(k)),
   Object.keys(w.home["3-3"]));
ok("月曜は0、金曜は4", !!w.home["3-3"]["0|p2"] && !!w.school["4|am1"],
   [Object.keys(w.home["3-3"]), Object.keys(w.school)]);
ok("更新時刻はサーバが打つ（0でない）",
   w.home["3-3"]["0|p2"].at > 0, w.home["3-3"]["0|p2"].at);

console.log("\n■ 要るシートだけ読む");
const only = ev(`Store.readWeek(2026, "2026-11-16",
   [{layer:"school",target:""},{layer:"grade",target:"3"},{layer:"home",target:"3-3"}])`);
ok("頼んだクラスは戻る", !!only.home["3-3"]["0|p2"]);
ok("頼んでいないクラスは読まない", !only.special["2-1"], only.special);

console.log("\n■ 週と年度でしぼる");
ev(`Store.writeCells(2026, [{date:"2026-11-24", slot:"p1", layer:"home", target:"3-3", title:"来週"}])`);
ev(`Store.writeCells(2027, [{date:"2026-11-16", slot:"p1", layer:"home", target:"3-3", title:"別年度"}])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("次の週のコマは混ざらない", !w.home["3-3"]["1|p1"], Object.keys(w.home["3-3"]));
ok("別の年度のコマは混ざらない", !w.home["3-3"]["0|p1"]);
ok("別の年度は残っている",
   !!ev('Store.readWeek(2027, "2026-11-16")').home["3-3"]["0|p1"]);

console.log("\n■ 同じコマを書き直しても行は増えない");
const before = rowsOf("週案 3-3").length;
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"国語", subject:"kokugo"}
])`);
ok("行は増えない", rowsOf("週案 3-3").length === before, rowsOf("週案 3-3").length);
/* 日付はシートの中で日付型になる。**そこで取り違えると、打つたびに行が増える。** */
(function(){
  const at = ev('(function(){const o={};Sheets.PLAN_COLS.forEach((c,i)=>o[c]=i);return o;})()');
  for(const row of SHEETS["週案 3-3"])
    if(String(row[at["日付"]]) === "2026-11-16") row[at["日付"]] = new Date(2026, 10, 16);
})();
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"社会", subject:"shakai"}
])`);
ok("日付が日付型になっていても、同じ行を直す",
   rowsOf("週案 3-3").length === before, rowsOf("週案 3-3").length);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("中身が入れ替わる", w.home["3-3"]["0|p2"].title === "社会",
   w.home["3-3"]["0|p2"]);

console.log("\n■ 空にすると、その行だけ消える");
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"", note:""}
])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("消える", !(w.home["3-3"] || {})["0|p2"], w.home["3-3"]);
ok("同じシートのほかのコマは残る", !!w.home["3-3"]["0|am1"], w.home["3-3"]);
ok("学年のコマも残っている", !!w.grade["3"]["2|p3"]);
ok("消したぶん行が減る", rowsOf("週案 3-3").length === before - 1,
   rowsOf("週案 3-3").length);

console.log("\n■ 旧・週案（1枚に全クラス）から移す");
(function(){
  const cols = ev('Sheets.SPEC["週案"].cols');
  const g = SHEETS["週案"];
  g.length = 0;
  g.push(cols.concat());
  const put = o => g.push(cols.map(c => (c in o) ? o[c] : ""));
  put({"年度":2026, "日付":new Date(2026,10,19), "時程":"p4", "層":"home", "対象":"5-2",
       "題名":"理科", "教科コード":"rika", "更新者":"a@edu.nishi.or.jp"});
  /* 旧版は同じコマを打鍵のたびに積んでいた。**移すときに1つにまとめる** */
  put({"年度":2026, "日付":new Date(2026,10,19), "時程":"p4", "層":"home", "対象":"5-2",
       "題名":"理", "教科コード":"", "更新者":"a@edu.nishi.or.jp"});
  put({"年度":2026, "日付":new Date(2026,10,17), "時程":"p1", "層":"home", "対象":"5-2",
       "題名":"国語", "教科コード":"kokugo", "更新者":"a@edu.nishi.or.jp"});
})();
const mig = ev("Store.migratePlan()");
ok("移した", mig.moved > 0, mig);
ok("クラスのシートができる", !!SHEETS["週案 5-2"], Object.keys(SHEETS));
const w52 = ev('Store.readWeek(2026, "2026-11-16")').home["5-2"];
ok("旧シートのコマが読めるようになる", !!w52 && !!w52["3|p4"], w52);
ok("同じコマが積まれていても1つにまとまる",
   rowsOf("週案 5-2").length === 3, rowsOf("週案 5-2").length);
ok("移しても旧シートは消さない", rowsOf("週案").length === 4, rowsOf("週案").length);
ok("二度実行しても増えない", (function(){
     ev("Store.migratePlan()");
     return rowsOf("週案 5-2").length === 3;
   })() === true, rowsOf("週案 5-2").length);

console.log("\n■ 学級編成を年度ごとに入れ替える");
ev(`Store.writeRoster(2027, {"1":["1-1","1-2"], "6":["6-1","6-2","6-3","6-4"]},
    [{code:"ongaku", label:"音楽"}], "2027-04-05")`);
const r27 = ev("Store.readRoster(2027)"), r26 = ev("Store.readRoster(2026)");
ok("2027年度が入れ替わる",
   r27.classes["1"].length === 2 && r27.classes["6"].length === 4, r27.classes);
ok("2027年度の第1週の月曜が入る", r27.week1 === "2027-04-05", r27.week1);
ok("2026年度は変わらない（既定のまま20学級）",
   Object.keys(r26.classes).reduce((a,g) => a + r26.classes[g].length, 0) === 20);
ok("2027年度の専科は1つ", r27.specials.length === 1, r27.specials);

console.log("\n■ 空の編成では上書きしない");
const keep26 = Object.keys(ev("Store.readRoster(2026).classes"))
  .reduce((a, g) => a + ev("Store.readRoster(2026).classes")[g].length, 0);
let threwEmpty = false;
try{ ev(`Store.writeRoster(2026, {}, [], "")`); }catch(e){ threwEmpty = true; }
ok("空の編成は断る", threwEmpty === true);
ok("断ったのでクラスは消えない",
   Object.keys(ev("Store.readRoster(2026).classes"))
     .reduce((a, g) => a + ev("Store.readRoster(2026).classes")[g].length, 0) === keep26);
threwEmpty = false;
try{ ev(`Store.writeRoster(2026, {"1":[], "2":[]}, [], "")`); }catch(e){ threwEmpty = true; }
ok("学年だけあってクラスが無いのも断る", threwEmpty === true);

/* **たんぽぽ児童は、たんぽぽの組ごとに持つ。**
   たんぽぽ担当は組ごとに見るので、出す列も 1組の全員 → 2組の全員 … と並べる。 */
console.log("\n■ たんぽぽ児童は、たんぽぽの組ごとに持つ");
ev(`Store.writeRoster(2028, {"3":["3-1","3-2","3-3"]},
    [{code:"ongaku", label:"音楽"}], "2028-04-03",
    {"1":["3-3","3-1"], "2":["3-3"]})`);
const r28 = ev("Store.readRoster(2028)");
ok("組ごとに返る",
   JSON.stringify(r28.tanpopo) === JSON.stringify({"1":["3-1","3-3"], "2":["3-3"]}),
   r28.tanpopo);
ok("組の中はクラス順に並ぶ（字の順ではない）",
   JSON.stringify(r28.tanpopo["1"]) === JSON.stringify(["3-1","3-3"]), r28.tanpopo["1"]);
ok("シートには組の番号を書く", (function(){
     const at = ev('Sheets.head("クラス").at');
     return SHEETS["クラス"].some(r => String(r[at["年度"]]) === "2028"
       && String(r[at["クラス"]]) === "3-3" && String(r[at["たんぽぽ交流級"]]) === "1,2");
   })() === true, SHEETS["クラス"].slice(-4));
ok("1つの組にしかいなければ番号1つ", (function(){
     const at = ev('Sheets.head("クラス").at');
     return SHEETS["クラス"].some(r => String(r[at["年度"]]) === "2028"
       && String(r[at["クラス"]]) === "3-1" && String(r[at["たんぽぽ交流級"]]) === "1");
   })() === true);
/* 同じ組に2人 */
ev(`Store.writeRoster(2030, {"3":["3-1"]}, [], "", {"1":["3-1","3-1"]})`);
ok("同じ組に2人なら、番号を2つ書く", (function(){
     const at = ev('Sheets.head("クラス").at');
     return SHEETS["クラス"].some(r => String(r[at["年度"]]) === "2030"
       && String(r[at["たんぽぽ交流級"]]) === "1,1");
   })() === true);
ok("読み直しても2人のまま",
   JSON.stringify(ev("Store.readRoster(2030)").tanpopo) === JSON.stringify({"1":["3-1","3-1"]}),
   ev("Store.readRoster(2030)").tanpopo);

/* 古い形も受ける。**書き直させない。** */
ev(`Store.writeRoster(2029, {"3":["3-1","3-2"]}, [], "", ["3-1"])`);
ok("いちばん古い形（並びだけ）は1組として受ける",
   JSON.stringify(ev("Store.readRoster(2029)").tanpopo) === JSON.stringify({"1":["3-1"]}),
   ev("Store.readRoster(2029)").tanpopo);
ev(`Store.writeRoster(2031, {"3":["3-1","3-2"]}, [], "", {"3-2":2})`);
ok("人数で持っていた形も1組として受ける",
   JSON.stringify(ev("Store.readRoster(2031)").tanpopo) === JSON.stringify({"1":["3-2","3-2"]}),
   ev("Store.readRoster(2031)").tanpopo);
ok("印はクラス表の欄で持つ（コードに書かない）",
   ev('Sheets.head("クラス").at["たんぽぽ交流級"]') >= 0,
   ev('Sheets.head("クラス").cols'));
/* 前は○で持っていた。書き直させない */
(function(){
  const at = ev('Sheets.head("クラス").at');
  for(const row of SHEETS["クラス"])
    if(String(row[at["年度"]]) === "2028" && String(row[at["クラス"]]) === "3-2")
      row[at["たんぽぽ交流級"]] = "○";
})();
ok("○ と書いてあれば1組の1人として読む",
   ev("Store.readRoster(2028).tanpopo")["1"].indexOf("3-2") >= 0,
   ev("Store.readRoster(2028).tanpopo"));

console.log("\n■ 学級編成を直しても、人が入れた欄を消さない");
(function(){
  const at = ev('Sheets.head("クラス").at');
  for(const row of SHEETS["クラス"])
    if(String(row[at["年度"]]) === "2028" && String(row[at["クラス"]]) === "3-1")
      row[at["担任メール"]] = "tanaka@edu.nishi.or.jp";
  const sat = ev('Sheets.head("専科").at');
  for(const row of SHEETS["専科"])
    if(String(row[sat["年度"]]) === "2028") row[sat["メール"]] = "sp@edu.nishi.or.jp";
})();
ev(`Store.writeRoster(2028, {"3":["3-1","3-2","3-3","3-4"]},
    [{code:"ongaku", label:"音楽"}], "2028-04-03", {"3-1":1})`);
ok("担任メールは残る", (function(){
     const at = ev('Sheets.head("クラス").at');
     return SHEETS["クラス"].some(r => String(r[at["年度"]]) === "2028"
       && String(r[at["クラス"]]) === "3-1"
       && String(r[at["担任メール"]]) === "tanaka@edu.nishi.or.jp");
   })() === true);
ok("専科のメールも残る", (function(){
     const at = ev('Sheets.head("専科").at');
     return SHEETS["専科"].some(r => String(r[at["年度"]]) === "2028"
       && String(r[at["メール"]]) === "sp@edu.nishi.or.jp");
   })() === true);
ok("たんぽぽの組は書き直したとおりになる",
   JSON.stringify(ev("Store.readRoster(2028).tanpopo")) === JSON.stringify({"1":["3-1"]}),
   ev("Store.readRoster(2028).tanpopo"));

console.log("\n■ 固定時間割の取り込み（貼り付け用シート）");
ok("貼り付け用のシートも作る", !!SHEETS["固定時間割取り込み"], Object.keys(SHEETS));
ok("見出しは作らない（学校の表をそのまま貼るため）",
   ev('Sheets.SPEC["固定時間割取り込み"]') === undefined);
(function(){
  const g = SHEETS["固定時間割取り込み"];
  g.length = 0;
  const put = rows => rows.forEach(r => g.push(r.concat(new Array(20 - r.length).fill(""))));
  put([["", "", "月", "", "", ""],
       ["", "", "1", "", "2", ""],
       ["", "", "A", "B", "A", "B"],
       ["1-1", "", "国", "", "算", "理"]]);
})();
const paste = ev("Store.readPaste()");
ok("貼ったものを形のまま読む", paste.length === 4 && paste[2][2] === "A", paste[2]);
ok("読み方はシートに持たせない（画面側で読む）",
   paste[3][0] === "1-1" && paste[3][2] === "国", paste[3]);
/* クラス名が日付に化けていても戻す */
SHEETS["固定時間割取り込み"][3][0] = new Date(2026, 0, 1);
ok("化けたクラス名は月-日に戻して渡す", ev("Store.readPaste()")[3][0] === "1-1",
   ev("Store.readPaste()")[3][0]);

console.log("\n■ 基本時間割");
ev(`Store.writeBase(2026, "3-3", "A", {"0|p1":{title:"国語", subject:"kokugo"},
                                       "0|p2":{title:"算数", subject:"sansu"}})`);
ev(`Store.writeBase(2026, "3-3", "B", {"0|p1":{title:"体育", subject:"taiiku"}})`);
let base = ev("Store.readBase(2026)");
ok("A週が2コマ", Object.keys(base["3-3"].A).length === 2, base["3-3"].A);
ok("B週が1コマ", Object.keys(base["3-3"].B).length === 1);
ok("A週とB週は別に持つ", base["3-3"].A["0|p1"].title === "国語"
                       && base["3-3"].B["0|p1"].title === "体育");
ev(`Store.writeBase(2026, "3-3", "A", {"0|p1":{title:"社会", subject:"shakai"}})`);
base = ev("Store.readBase(2026)");
ok("A週を入れ替えてもB週は残る",
   Object.keys(base["3-3"].A).length === 1 && base["3-3"].B["0|p1"].title === "体育");

console.log("\n■ 基本時間割は、人が手で書いた行も読む");
(function(){
  const cols = ev('Sheets.SPEC["基本時間割"].cols');
  const at = {}; cols.forEach((c, i) => at[c] = i);
  const g = SHEETS["基本時間割"];
  const put = o => {
    const row = new Array(20).fill("");
    for(const k in o) row[at[k]] = o[k];
    g.push(row);
  };
  /* 人が書くときは「月」と書く。0 とは書かない */
  put({"年度":2026, "クラス":"1-1", "週":"A", "曜日":"月", "時程":"p1",
       "教科コード":"kokugo", "表示名":"国語"});
  put({"年度":2026, "クラス":"1-1", "週":"B", "曜日":"火曜日", "時程":"p2",
       "教科コード":"sansu", "表示名":"算数"});
  /* 時程を数字で書いた行 */
  put({"年度":2026, "クラス":"1-1", "週":"A", "曜日":"水", "時程":"3",
       "教科コード":"taiiku", "表示名":"体育"});
  /* 昔の書き方（0〜4）も読めること */
  put({"年度":2026, "クラス":"1-1", "週":"A", "曜日":0, "時程":"p4",
       "教科コード":"ongaku", "表示名":"音楽"});
  /* 読めない行 */
  put({"年度":2026, "クラス":"1-1", "週":"A", "曜日":"げつ", "時程":"p5",
       "教科コード":"rika", "表示名":"理科"});
})();
const bw = [];
const hb = ev("Store.readBase(2026, [])") && (function(){
  const warn = [];
  sandbox.__warn = warn;
  const r = ev("Store.readBase(2026, __warn)");
  bw.push.apply(bw, warn);
  return r;
})();
ok("「月」と書いた行が読める", !!hb["1-1"].A["0|p1"], hb["1-1"].A);
ok("「火曜日」と書いた行も読める", !!hb["1-1"].B["1|p2"], hb["1-1"].B);
ok("時程を数字で書いた行も読める（授業の行の上から数える）",
   !!hb["1-1"].A["2|p3"], hb["1-1"].A);
ok("0〜4 で書いた古い行も読める", !!hb["1-1"].A["0|p4"], hb["1-1"].A);
ok("読めない行は捨てずに知らせる",
   bw.length === 1 && bw[0].indexOf("曜日") >= 0, bw);
/* 書くときは人が読める曜日にする */
ev(`Store.writeBase(2026, "2-2", "A", {"3|p1":{title:"社会", subject:"shakai"}})`);
ok("書くときは「木」と書く（隣にならって手で書き足せるように）", (function(){
     const cols = ev('Sheets.SPEC["基本時間割"].cols');
     const at = {}; cols.forEach((c, i) => at[c] = i);
     return SHEETS["基本時間割"].some(r => String(r[at["クラス"]]) === "2-2"
       && String(r[at["曜日"]]) === "木");
   })() === true);
ok("書いたものは読み直せる",
   !!ev("Store.readBase(2026)")["2-2"].A["3|p1"],
   ev("Store.readBase(2026)")["2-2"]);

console.log("\n■ 固定時間割をまとめて入れる");
ev(`Store.writeBaseAll(2026, {
      "3-3": {A:{"0|p1":{title:"国語",subject:"kokugo"}, "1|p2":{title:"算数",subject:"sansu"}},
              B:{"0|p1":{title:"体育",subject:"taiiku"}}},
      "3-1": {A:{"0|p1":{title:"音楽",subject:"ongaku"}},
              B:{"0|p1":{title:"音楽",subject:"ongaku"}}}})`);
base = ev("Store.readBase(2026)");
ok("2クラスぶんが1回で入る",
   base["3-3"].A["1|p2"].title === "算数" && base["3-1"].B["0|p1"].title === "音楽",
   [base["3-3"].A, base["3-1"].B]);
ok("入れ替えなので前の内容は残らない",
   Object.keys(base["3-3"].A).length === 2 && Object.keys(base["3-3"].B).length === 1,
   base["3-3"]);
/* 表に無いクラスと、ほかの年度には触らない */
ev(`Store.writeBase(2027, "3-3", "A", {"0|p1":{title:"総合", subject:"sogo"}})`);
ev(`Store.writeBase(2026, "6-1", "A", {"0|p1":{title:"家庭", subject:"katei"}})`);
ev(`Store.writeBaseAll(2026, {"3-3": {A:{"0|p1":{title:"理科",subject:"rika"}}, B:{}}})`);
base = ev("Store.readBase(2026)");
ok("表に無いクラスは触らない", base["6-1"].A["0|p1"].title === "家庭", base["6-1"]);
ok("ほかの年度も触らない",
   ev("Store.readBase(2027)")["3-3"].A["0|p1"].title === "総合");
ok("B週を空で渡せばB週は消える", !base["3-3"].B || !Object.keys(base["3-3"].B).length,
   base["3-3"].B);

console.log("\n■ たんぽぽ時間割へ出す（1週1シート）");
(function(){
  /* 設定にファイルIDを入れる。**URL のまま貼っても通ること**もあとで見る */
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = TPID;
})();
const titles = {"3-3":{}, "5-1":{}};
for(let d = 0; d < 5; d++){
  titles["3-3"][String(d)] = {p1:"国語" + d, p2:"算数", p3:"", p4:"体育", p5:"理科", p6:"総合"};
  titles["5-1"][String(d)] = {p1:"5年", p2:"5年", p3:"5年", p4:"5年", p5:"5年", p6:"5年"};
}
const SLOT6 = ["p1","p2","p3","p4","p5","p6"];
const cols2 = [{cls:"3-3", group:1}, {cls:"5-1", group:2}];
const ex = ev("Store.exportWeek(2026, '2026-11-16', " + JSON.stringify(titles)
            + ", " + JSON.stringify(cols2) + ", " + JSON.stringify(SLOT6) + ")");
const SH = () => TPFILE.sheets[ex.sheet];

ok("シート名は「◯月◯週」", ex.sheet === "11月3週", ex.sheet);
ok("その月の何番目の月曜かで数える",
   ev("Store.weekSheetName('2026-09-07')") === "9月1週"
   && ev("Store.weekSheetName('2026-09-14')") === "9月2週"
   && ev("Store.weekSheetName('2026-11-16')") === "11月3週",
   [ev("Store.weekSheetName('2026-09-07')"), ev("Store.weekSheetName('2026-11-16')")]);
ok("シートが1枚できる", !!SH(), Object.keys(TPFILE.sheets));
ok("5日ぶん・1日16行（見出し1行を足して81行）", ex.rows === 81, ex.rows);
ok("列は 1 + 児童の数", ex.cols === 2, ex);
ok("日ブロックの先頭は 2・18・34・50・66", [0,1,2,3,4].every(function(d){
     const r = SH()[1 + d * 16];
     return r && r[0] && typeof r[0].getMonth === "function";
   }), [2,18,34,50,66].map(function(r){ return String(SH()[r-1][0]); }));
ok("見出しの行に交流級が並ぶ", SH()[1][1] === "3-3" && SH()[1][2] === "5-1", SH()[1].slice(0,4));
ok("1校時の授業名は +1 行目", SH()[2][1] === "国語0", SH()[2].slice(0,3));
ok("2校時は +3 行目", SH()[4][1] === "算数", SH()[4].slice(0,3));
ok("3校時は +6 行目（中休みの1つ下）", SH()[7][1] === "", SH()[7].slice(0,3));
ok("4校時は +8 行目", SH()[9][1] === "体育", SH()[9].slice(0,3));
ok("5校時は +12 行目（昼休みの1つ下）", SH()[13][1] === "理科", SH()[13].slice(0,3));
ok("6校時は +14 行目", SH()[15][1] === "総合", SH()[15].slice(0,3));
ok("骨は +5 中休み・+10 給食・+11 昼休み",
   SH()[6][0] === "中休み" && SH()[11][0] === "給食" && SH()[12][0] === "昼休み",
   [SH()[6][0], SH()[11][0], SH()[12][0]]);
ok("担当者・場所の行には書かない（空のまま）",
   SH()[3][1] === "" && SH()[5][1] === "" && SH()[16][1] === "",
   [SH()[3][1], SH()[5][1], SH()[16][1]]);
ok("日ごとに授業名が変わる", SH()[18][1] === "国語1" && SH()[34][1] === "国語2",
   [SH()[18][1], SH()[34][1]]);
ok("選んだクラスは全部入る", SH()[2][2] === "5年", SH()[2].slice(0,3));
ok("空のコマは空で入る（先週のぶんが残らない）", SH()[7][2] === "5年" && SH()[7][1] === "");
ok("何コマ書いたかを返す", ex.wrote > 0 && ex.days === 5, ex);
ok("B列から右は書式なしテキスト（1-2 が1月2日に化けない）",
   Object.keys(FORMATS).some(function(k){
     return k.indexOf(ex.sheet + "/") === 0 && FORMATS[k] === "@"; }),
   Object.keys(FORMATS).filter(function(k){ return k.indexOf(ex.sheet) === 0; }).slice(0, 3));

ok("児童の列は 50px（既定）", WIDTHS[ex.sheet + "/2"] === 50, WIDTHS[ex.sheet + "/2"]);
ok("A列は広いまま（日付と「中休み」が入る）",
   WIDTHS[ex.sheet + "/1"] === 92, WIDTHS[ex.sheet + "/1"]);
ok("列の幅は設定シートから動かせる", (function(){
     const at = ev('Sheets.head("設定").at');
     const put = v => { for(const row of SHEETS["設定"])
       if(String(row[at["キー"]]) === "たんぽぽ列幅") row[at["値"]] = v; };
     put(38);
     const r = ev("Store.exportWeek(2026, '2027-02-01', " + JSON.stringify(titles)
              + ", " + JSON.stringify(cols2) + ", " + JSON.stringify(SLOT6) + ")");
     put(50);
     return WIDTHS[r.sheet + "/2"] === 38 && r.colW === 38;
   })() === true, WIDTHS);

console.log("\n■ 週シートは、週の順に右へ並べる");
(function(){
  /* **いちばん左に入れ続けるとタブが逆順になる。** 4月 → 翌3月の順に並べる */
  TPFILE.sheets = {}; TPFILE.order = [];
  const t = {"3-3":{}};
  for(let d = 0; d < 5; d++)
    t["3-3"][String(d)] = {p1:"国語", p2:"", p3:"", p4:"", p5:"", p6:""};
  const c = [{cls:"3-3", group:1}];
  const put = mon => ev("Store.exportWeek(2026, '" + mon + "', " + JSON.stringify(t)
                      + ", " + JSON.stringify(c) + ", " + JSON.stringify(SLOT6) + ")");
  /* わざと順番をばらばらに出す */
  put("2026-09-14");     /* 9月2週 */
  put("2026-11-16");     /* 11月3週 */
  put("2026-09-07");     /* 9月1週 */
  put("2027-01-11");     /* 1月2週 → 年度では11月より後 */
  put("2026-04-06");     /* 4月1週 → いちばん前 */
  ok("出した順ではなく、週の順に並ぶ",
     JSON.stringify(tpNames()) === JSON.stringify(["4月1週","9月1週","9月2週","11月3週","1月2週"]),
     tpNames());
  ok("年度は4月からで、1月は11月より後ろ",
     tpNames().indexOf("1月2週") > tpNames().indexOf("11月3週"), tpNames());
  ok("あとから間の週を出しても、間に入る", (function(){
       put("2026-10-05");                       /* 10月1週 */
       return tpNames().indexOf("10月1週") > tpNames().indexOf("9月2週")
           && tpNames().indexOf("10月1週") < tpNames().indexOf("11月3週");
     })() === true, tpNames());
  ok("週シートでない名前は数えない",
     ev("Store.weekOrder('9月1週（前の 0911-1630）')") === -1
     && ev("Store.weekOrder('週案')") === -1
     && ev("Store.weekOrder('9月1週')") >= 0,
     [ev("Store.weekOrder('9月1週（前の 0911-1630）')"), ev("Store.weekOrder('9月1週')")]);
  ok("並べる順は 4月=いちばん小さい・3月=いちばん大きい",
     ev("Store.weekOrder('4月1週')") < ev("Store.weekOrder('12月1週')")
     && ev("Store.weekOrder('12月1週')") < ev("Store.weekOrder('3月1週')"),
     [ev("Store.weekOrder('4月1週')"), ev("Store.weekOrder('3月1週')")]);
  /* 出し直しても並びは崩れない（退避したぶんは数えない） */
  put("2026-09-14");
  ok("出し直しても、週の順のまま",
     tpNames().filter(n => /^\d+月\d+週$/.test(n)).join("／")
       === "4月1週／9月1週／9月2週／10月1週／11月3週／1月2週",
     tpNames());
})();

console.log("\n■ 同じ名前のシートは、消さずに名前を変えて残す");
(function(){
  const before = TPFILE.sheets[ex.sheet];
  before[3][1] = "たんぽぽ担当が書いた";              /* 残っていてほしい値 */
  const again = ev("Store.exportWeek(2026, '2026-11-16', " + JSON.stringify(titles)
               + ", " + JSON.stringify(cols2) + ", " + JSON.stringify(SLOT6) + ")");
  ok("前のシートは名前を変えて残る", !!again.backup && again.backup.indexOf("前の") >= 0, again);
  ok("残したシートに、前の中身がある",
     !!TPFILE.sheets[again.backup]
     && TPFILE.sheets[again.backup][3][1] === "たんぽぽ担当が書いた",
     again.backup);
  ok("新しいシートは同じ名前で作り直される",
     !!TPFILE.sheets[again.sheet] && again.sheet === ex.sheet, Object.keys(TPFILE.sheets));
})();

console.log("\n■ 出す先の列は、組ごとに並べる");
(function(){
  const cols = [{cls:"6-4", group:2}, {cls:"1-1", group:1},
                {cls:"3-3", group:1}, {cls:"1-1", group:1}];
  const t = {};
  for(const c of ["6-4","1-1","3-3"]){
    t[c] = {};
    for(let d = 0; d < 5; d++) t[c][String(d)] = {p1:c, p2:"", p3:"", p4:"", p5:"", p6:""};
  }
  const r = ev("Store.exportWeek(2026, '2026-12-07', " + JSON.stringify(t)
             + ", " + JSON.stringify(cols) + ", " + JSON.stringify(SLOT6) + ")");
  const g = TPFILE.sheets[r.sheet];
  ok("1組の全員 → 2組の全員 の順", JSON.stringify(r.list) === '["1-1","1-1","3-3","6-4"]', r.list);
  ok("組の中はクラス順（字の順で 10 を 2 の前に置かない）",
     r.list[2] === "3-3" && r.list[3] === "6-4", r.list);
  ok("同じ交流級を2つ入れれば2列になる",
     r.list.filter(function(x){ return x === "1-1"; }).length === 2, r.list);
  ok("見出しの行も同じ並び", g[1][1] === "1-1" && g[1][4] === "6-4", g[1].slice(0,6));
  ok("6-4（6月4日に化けるクラス名）の列に 6-4 の授業が入る",
     g[2][4] === "6-4", g[2].slice(0,6));
})();

console.log("\n■ 26列を超えても作れる（新しいシートは26列しかない）");
(function(){
  const cols = [], t = {};
  for(let i = 1; i <= 4; i++) for(let j = 1; j <= 8; j++){
    const c = ((i % 6) + 1) + "-" + ((j % 4) + 1);
    cols.push({cls:c, group:i});
    if(!t[c]){ t[c] = {}; for(let d = 0; d < 5; d++)
      t[c][String(d)] = {p1:"国語", p2:"", p3:"", p4:"", p5:"", p6:""}; }
  }
  let why = "";
  let r = null;
  try{
    r = ev("Store.exportWeek(2026, '2027-01-11', " + JSON.stringify(t)
         + ", " + JSON.stringify(cols) + ", " + JSON.stringify(SLOT6) + ")");
  }catch(e){ why = String(e && e.message); }
  ok("32列ぶんでも落ちない（先に列を伸ばしている）", !!r && r.cols === 32, why || r);
  ok("いちばん右の列にも授業名が入る",
     !!r && TPFILE.sheets[r.sheet][2][32] === "国語",
     r && TPFILE.sheets[r.sheet][2].slice(28, 34));
})();

console.log("\n■ 交流級を1つも選ばずに出そうとしたら止まる");
(function(){
  let why = "";
  try{ ev("Store.exportWeek(2026, '2026-11-16', {}, [], " + JSON.stringify(SLOT6) + ")"); }
  catch(e){ why = String(e && e.message); }
  ok("何も選んでいなければ出さない", why.indexOf("交流級") >= 0, why);
})();

console.log("\n■ たんぽぽファイルの指定は URL のまま貼れる");
(function(){
  const at = ev('Sheets.head("設定").at');
  const put = v => { for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = v; };
  put("https://docs.google.com/spreadsheets/d/" + TPID + "/edit#gid=0");
  let ok1 = false;
  try{ ev("Store.exportWeek(2026, '2026-11-16', " + JSON.stringify(titles)
        + ", " + JSON.stringify(cols2) + ", " + JSON.stringify(SLOT6) + ")"); ok1 = true; }
  catch(e){ ok1 = String(e && e.message); }
  ok("URL をそのまま貼っても開ける", ok1 === true, ok1);
  put("これはURLではない");
  let why = "";
  try{ ev("Store.exportWeek(2026, '2026-11-16', " + JSON.stringify(titles)
        + ", " + JSON.stringify(cols2) + ", " + JSON.stringify(SLOT6) + ")"); }
  catch(e){ why = String(e && e.message); }
  ok("読めないときは、何が読めないかを言う",
     why.indexOf("たんぽぽファイルID") >= 0 && why.indexOf("読めません") >= 0, why);
  put(TPID);
})();

console.log("\n■ シートの行・列は、足りなければ先に伸ばす（本番で落ちていたところ）");
(function(){
  /* 20クラス × A週B週 × 5日 × 6校時 = 1,200行。**新しいシートは1000行しかない。**
     前は伸ばしていなかったので、1回目の固定時間割取り込みで落ちていた。 */
  const table = {};
  const g = ["1","2","3","4","5","6"];
  for(const gr of g){
    const n = (gr === "5" || gr === "6") ? 4 : 3;
    for(let i = 1; i <= n; i++){
      const cls = gr + "-" + i, bank = {};
      for(let d = 0; d < 5; d++) for(const s of ["p1","p2","p3","p4","p5","p6"])
        bank[d + "|" + s] = {title:"国語", subject:"kokugo"};
      table[cls] = {A:bank, B:bank};
    }
  }
  let why = "", r = null;
  try{ r = ev("Store.writeBaseAll(2027, " + JSON.stringify(table) + ")"); }
  catch(e){ why = String(e && e.message); }
  ok("20クラス×A週B週（1,200行）を1回で入れても落ちない", !!r && r.rows === 1200, why || r);
  ok("入れたぶんが読み直せる",
     Object.keys(ev("Store.readBase(2027, [])")).length === 20,
     Object.keys(ev("Store.readBase(2027, [])")).length);
  /* 週案シートも同じ。1クラス年1,200行を超えて保存できること */
  const patches = [];
  for(let i = 0; i < 1100; i++){
    const d = new Date(2027, 3, 5 + Math.floor(i / 6));
    patches.push({date: d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0")
                      + "-" + String(d.getDate()).padStart(2,"0"),
                  slot: ["p1","p2","p3","p4","p5","p6"][i % 6],
                  layer:"home", target:"3-3", title:"国語", note:"", subject:"kokugo"});
  }
  let why2 = "", w = null;
  try{ w = ev("Store.writeCells(2027, " + JSON.stringify(patches) + ")"); }
  catch(e){ why2 = String(e && e.message); }
  ok("1クラスの週案が1,000行を超えても保存できる", !!w && w.count === 1100, why2 || w);
  ok("超えたぶんも読み直せる",
     rowsOf("週案 3-3").length > 1000, rowsOf("週案 3-3").length);
})();

/* **たんぽぽの設定が保存できないという報告があった。**
   6-4 は「6月4日」に化けるクラス名なので、往復を1件ずつ見る。 */
console.log("\n■ たんぽぽ交流級の設定が往復する（6-4 を含む）");
const rw = ev(`Store.writeRoster(2026,
  {"6":["6-1","6-2","6-3","6-4"], "1":["1-1","1-2","1-3"]}, [], "",
  {"1":["6-4","6-1"], "2":["6-4","1-2"]})`);
ok("6-4 が2つの組に残る",
   rw.tanpopo["1"].indexOf("6-4") >= 0 && rw.tanpopo["2"].indexOf("6-4") >= 0, rw.tanpopo);
ok("6-4 は合わせて2人（＝2列）", ev("Store.__tpColumns")(
     ev("Store.readRoster(2026)").tanpopo["1"].map(c => ({cls:c, group:1}))
       .concat(ev("Store.readRoster(2026)").tanpopo["2"].map(c => ({cls:c, group:2}))))
     .filter(x => x.cls === "6-4").length === 2);
ok("ほかのクラスも残る",
   rw.tanpopo["1"].indexOf("6-1") >= 0 && rw.tanpopo["2"].indexOf("1-2") >= 0, rw.tanpopo);
ok("選んでいないクラスは入らない",
   JSON.stringify(rw.tanpopo).indexOf("6-2") < 0, rw.tanpopo);
ok("読み直しても同じ",
   JSON.stringify(ev("Store.readRoster(2026)").tanpopo) === JSON.stringify(rw.tanpopo),
   ev("Store.readRoster(2026)").tanpopo);
/* シートに化けた Date が入っていても読める形にしておく */
(function(){
  const at = ev('Sheets.head("クラス").at');
  for(const row of SHEETS["クラス"])
    if(String(row[at["年度"]]) === "2026" && Sheets_asClass(row[at["クラス"]]) === "6-4")
      row[at["クラス"]] = new Date(2026, 5, 4);      /* 6月4日に化けた状態を作る */
})();
ok("クラス名が日付に化けていても、たんぽぽの設定を見失わない",
   ev("Store.readRoster(2026)").tanpopo["1"].indexOf("6-4") >= 0,
   ev("Store.readRoster(2026)").tanpopo);
ok("学級編成そのものも化けたまま出さない",
   ev("Store.readRoster(2026)").classes["6"].indexOf("6-4") >= 0,
   ev("Store.readRoster(2026)").classes["6"]);
/* **編成を元に戻す。** この節でクラスを2学年ぶんに置き換えたままにすると、
   あとの節（年度の検査など）が別の学校を見ることになる。 */
ev(`Store.writeRoster(2026, {"1":["1-1","1-2","1-3"],"2":["2-1","2-2","2-3"],
  "3":["3-1","3-2","3-3"],"4":["4-1","4-2","4-3"],
  "5":["5-1","5-2","5-3","5-4"],"6":["6-1","6-2","6-3","6-4"]},
  [{code:"ongaku",label:"音楽"},{code:"zuko",label:"図工"},
   {code:"rika",label:"理科"},{code:"gaikoku",label:"外国語"}], "", {})`);
ok("戻したら20学級", ev("Store.readRoster(2026)").classes["5"].length === 4
   && Object.keys(ev("Store.readRoster(2026)").classes).length === 6,
   ev("Store.readRoster(2026)").classes);

console.log("\n■ 年度の退避（数える → 照合する → 消す）");
/* 2025年度と2026年度の週案を1コマずつ入れておく */
ev(`Store.writeCells(2025, [{date:"2025-06-10", slot:"p1", layer:"home",
  target:"3-3", title:"むかしの国語", note:"", subject:"kokugo"}])`);
ev(`Store.writeCells(2025, [{date:"2025-06-11", slot:"p2", layer:"grade",
  target:"3", title:"むかしの学年行事", note:"", subject:null}])`);
ev(`Store.writeCells(2026, [{date:"2026-06-10", slot:"p1", layer:"home",
  target:"3-3", title:"いまの国語", note:"", subject:"kokugo"}])`);

let ac = ev("Store.archiveCount(2025)");
ok("その年度の行だけを数える", ac.rows === 2 && ac.cells === 2, ac);
ok("シートごとの内訳を出す", ac.sheets.length === 2, ac.sheets);
ok("いちばん古い日付と新しい日付を出す",
   ac.from === "2025-06-10" && ac.to === "2025-06-11", ac);
ok("まだ退避していないと言う", ac.done === null, ac.done);
/* いまの年度は、この検査より前に書いたぶんが入っている。**数えて覚えておく** */
const now2026 = ev("Store.archiveCount(2026)").rows;
ok("別の年度は数に入れない", now2026 >= 1 && now2026 !== ac.rows, [now2026, ac.rows]);

/* **複製する前は、照合が通らない** */
let av = ev(`Store.archiveVerify(2025, "${ARCID}")`);
ok("複製していなければ止める", av.ok === false && av.why.length >= 1, av.why);

/* 同じファイルのURLを貼る事故 */
av = ev(`Store.archiveVerify(2025, "https://docs.google.com/spreadsheets/d/${BOOKID}/edit")`);
ok("いま開いているファイルそのものを貼ったら止める",
   av.ok === false && av.why.join("").indexOf("そのもの") >= 0, av.why);

/* 開けないファイル */
av = ev(`Store.archiveVerify(2025, "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC")`);
ok("開けない退避先は、理由を言って止める",
   av.ok === false && av.why.join("").indexOf("開けません") >= 0, av.why);

/* ここで人が複製する */
copyBook();
av = ev(`Store.archiveVerify(2025, "https://docs.google.com/spreadsheets/d/${ARCID}/edit")`);
ok("複製したあとは照合が通る", av.ok === true, av.why);
ok("URLをそのまま貼っても通る（IDを抜かせない）", av.there.id === ARCID, av.there);
ok("退避先のファイル名を出す", av.there.file === "週案 保存 2026年度", av.there);

/* 複製したあとに本体へ書き足すと、退避先に無い行ができる */
ev(`Store.writeCells(2025, [{date:"2025-06-12", slot:"p3", layer:"home",
  target:"3-3", title:"あとから足した", note:"", subject:null}])`);
av = ev(`Store.archiveVerify(2025, "${ARCID}")`);
ok("複製したあとに増えた行があれば止める",
   av.ok === false && av.why.join("").indexOf("中身が合いません") >= 0, av.why);
ok("どのコマが違うのかを名指しする",
   av.why.join("").indexOf("2025-06-12") >= 0
   && av.why.join("").indexOf("退避先にありません") >= 0, av.why);
let threw = "";
try{ ev(`Store.archivePurge(2025, "${ARCID}", "2025")`); }catch(e){ threw = e.message; }
ok("合わないときは1行も消さない", ev("Store.archiveCount(2025)").rows === 3, threw);
ok("そのとき何が合わないかを言う", threw.indexOf("中身が合いません") >= 0, threw);

/* **行数もコマ数も変えずに中身だけ直した場合。**
   前はここが素通りしていた。「国語」を「校外学習」に直しても数は変わらない。 */
console.log("\n■ 複製したあとの書き換えは、数が同じでも見つける");
copyBook();
(function(){
  const before = ev(`Store.archiveVerify(2025, "${ARCID}")`);
  ok("複製した直後は通る", before.ok === true, before.why);
})();
const cnt0 = ev("Store.archiveCount(2025)");
ev(`Store.writeCells(2025, [{date:"2025-06-12", slot:"p3", layer:"home",
  target:"3-3", title:"校外学習", note:"", subject:null}])`);
const cnt1 = ev("Store.archiveCount(2025)");
ok("行数もコマ数も変わっていない",
   cnt0.rows === cnt1.rows && cnt0.cells === cnt1.cells, [cnt0.rows, cnt1.rows]);
av = ev(`Store.archiveVerify(2025, "${ARCID}")`);
ok("それでも照合は止まる", av.ok === false, av.why);
ok("「中身が違います」と言う",
   av.why.join("").indexOf("中身が違います") >= 0, av.why);
ok("どの日のどの校時かを言う", av.why.join("").indexOf("2025-06-12 p3") >= 0, av.why);
threw = "";
try{ ev(`Store.archivePurge(2025, "${ARCID}", "2025")`); }catch(e){ threw = e.message; }
ok("書き換えたときも1行も消さない", ev("Store.archiveCount(2025)").rows === cnt1.rows, threw);
ok("本体の書き換えは残っている", (function(){
     for(const r of ev(`Sheets.readPlan("週案 3-3", Store.ymd)`))
       if(String(r["日付"]) === "2025-06-12" && String(r["時程"]) === "p3")
         return String(r["題名"]);
     return "";
   })() === "校外学習");

/* **照合してから押すまでのあいだの書き換え**も、数が同じなら前は素通りしていた */
console.log("\n■ 照合してから押すまでに書き換えても、消さない");
copyBook();
av = ev(`Store.archiveVerify(2025, "${ARCID}")`);
ok("照合は通る", av.ok === true, av.why);
ev(`Store.writeCells(2025, [{date:"2025-06-12", slot:"p3", layer:"home",
  target:"3-3", title:"ジャンボ落語", note:"", subject:null}])`);
threw = "";
try{ ev(`Store.archivePurge(2025, "${ARCID}", "2025")`); }catch(e){ threw = e.message; }
/* 消すほうも、押した中でもう一度照合する。だから照合を通したあとに
   書き換えても、そこで止まる（数が同じでも中身で見つかる） */
ok("押す直前の見直しで止まる",
   threw.indexOf("1行も消しません") >= 0 || threw.indexOf("変わりました") >= 0, threw);
ok("どのシートのどのコマかを言う",
   threw.indexOf("週案 3-3") >= 0 && threw.indexOf("2025-06-12") >= 0, threw);
ok("1行も消していない", ev("Store.archiveCount(2025)").rows === cnt1.rows, threw);
ok("本体の書き換えは残っている", (function(){
     for(const r of ev(`Sheets.readPlan("週案 3-3", Store.ymd)`))
       if(String(r["日付"]) === "2025-06-12" && String(r["時程"]) === "p3")
         return String(r["題名"]);
     return "";
   })() === "ジャンボ落語");

/* 複製し直せば通る */
copyBook();
threw = "";
try{ ev(`Store.archivePurge(2025, "${ARCID}", "2024")`); }catch(e){ threw = e.message; }
ok("年度を打ち間違えたら消さない", threw.indexOf("打ち込んで") >= 0, threw);
ok("そのときも1行も消えていない", ev("Store.archiveCount(2025)").rows === 3);

const pg = ev(`Store.archivePurge(2025, "${ARCID}", "2025")`);
ok("年度を打ち込めば消える", pg.rows === 3 && pg.sheets === 2, pg);
ok("消したのはその年度だけ", ev("Store.archiveCount(2025)").rows === 0);
ok("いまの年度は1行も減っていない",
   ev("Store.archiveCount(2026)").rows === now2026,
   [ev("Store.archiveCount(2026)").rows, now2026]);
ok("シートは消さない（見出しは残る）",
   !!SHEETS["週案 3-3"] && String(SHEETS["週案 3-3"][0][0]) === "年度",
   SHEETS["週案 3-3"] && SHEETS["週案 3-3"][0]);
ok("消しても退避先はそのまま", ARCFILE.sheets["週案 3-3"].length >= 2);

const dn = ev("Store.archiveCount(2025).done");
ok("退避したことを記録する", !!dn && dn.rows === 3, dn);
ok("誰がいつ退避したかを残す",
   dn.by === "tanaka@edu.nishi.or.jp" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dn.at), dn);
ok("退避先のURLを残す", dn.url.indexOf(ARCID) >= 0, dn.url);
ok("立ち上がりで、退避ずみの年度を画面へ渡す",
   !!ev("apiBoot(2026).archived")["2025"], ev("apiBoot(2026).archived"));
ok("退避していない年度は渡さない", !ev("apiBoot(2026).archived")["2026"]);
/* 退避したあとも、基本時間割とクラスは残る（「前年度から写す」が使える） */
ok("基本時間割は消さない", ev("Store.readRoster(2025)").classes["3"].length === 3,
   ev("Store.readRoster(2025)").classes);

console.log("\n■ 退避と、形の見分け（外へ出すところ共通）");
TPFILE.sheets["退避テスト"] = [["見出し"], ["中身"]];
const st = ev(`Sheets.stash(SpreadsheetApp.openById("${TPID}").getSheetByName("退避テスト"), "前の形")`);
ok("名前を変えて残す（消さない）", !!st && !!TPFILE.sheets[st], [st, Object.keys(TPFILE.sheets)]);
ok("いつ退けたかが名前に入る", /（前の形 \d{4}-\d{4}）$/.test(st), st);
TPFILE.sheets["空っぽ"] = [[""]];
ok("空のシートは退避しない（残す値が無い）",
   ev(`Sheets.stash(SpreadsheetApp.openById("${TPID}").getSheetByName("空っぽ"), "前の形")`) === "");
ok("シートが無いときも落ちない", ev("Sheets.stash(null, '前の形')") === "");

const sk = ev(`Sheets.shapeOk("たんぽぽ時間割（見本）", [
  {ok:true,  why:"通るもの"},
  {ok:false, why:"行が 1 しかありません"},
  {ok:false, why:"列が 1 しかありません"}])`);
ok("足りないものだけを並べる", sk.ok === false && sk.why.length === 2, sk);
const se = ev(`Sheets.shapeError(Sheets.shapeOk("たんぽぽ時間割（見本）",
  [{ok:false, why:"行が 1 しかありません"}]))`);
ok("どのファイルの話かを言う", se.message.indexOf("たんぽぽ時間割（見本）") >= 0, se.message);
ok("何が足りないかを言う", se.message.indexOf("行が 1 しかありません") >= 0, se.message);
ok("次に何をすればよいかも言う", se.message.indexOf("形を直してから") >= 0, se.message);
ok("行と列の数を見ろと言う", se.message.indexOf("何行×何列") >= 0, se.message);

console.log("\n■ 保存にかかった時間を返す");
const tm = ev(`Store.writeCells(2026, [{date:"2026-11-16", slot:"p1", layer:"home",
  target:"3-3", title:"国語", note:"", subject:"kokugo"}])`);
ok("書き込みにかかった時間を返す", typeof tm.ms === "number" && tm.ms >= 0, tm);
ok("ロック待ちを分けて返す", typeof tm.waitMs === "number" && tm.waitMs >= 0, tm);
ok("何シートに書いたかも返す", tm.sheets === 1, tm);
ok("書くものが無いときも形はそろえる",
   (function(){ const z = ev("Store.writeCells(2026, [])");
                return z.ms === 0 && z.waitMs === 0; })() === true,
   ev("Store.writeCells(2026, [])"));

console.log("\n■ 画面から呼ぶ口はすべて関門を通る");
const gated = ["apiBoot()", 'apiReadYear(2026)', 'apiReadWeek(2026,"2026-11-16")',
               'apiWriteCells(2026,[])', 'apiWriteRoster(2026,{},[],"")',
               'apiWriteBase(2026,"3-3","A",{})', 'apiWriteBaseAll(2026,{})',
               'apiReadPaste()', 'apiExportTanpopo(2026,"2026-11-16",{},[])',
               'apiShapeTanpopo("2026-11-16")', 'apiBuildTanpopo(2026,"2026-11-16",{},[])'];
EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
for(const call of gated){
  let threw = false;
  try{ ev(call); }catch(e){ threw = true; }
  ok("児童が " + call.split("(")[0] + " を直接叩いても止まる", threw === true);
}
EMAIL = "tanaka@edu.nishi.or.jp";
ok("教職員は apiBoot を通る", typeof ev("apiBoot()").me === "string");
ok("apiBoot が時程と教科を渡す",
   ev("apiBoot()").slots.length === 11 && ev("apiBoot()").subjects.length === 18);

console.log("\n■ クラス表記が日付に化けるのを防ぐ");
ok("クラス列は書式なしテキストにしてある", FORMATS["クラス/3"] === "@", FORMATS);
ok("基本時間割のクラス列も同じ", FORMATS["基本時間割/2"] === "@");
ok("週案の対象列も同じ", FORMATS["週案/5"] === "@");
ok("1-1 は Date で来ても 1-1 に戻る",
   ev('Sheets.asClass(new Date(2026, 0, 1))') === "1-1",
   ev('Sheets.asClass(new Date(2026, 0, 1))'));
ok("6-3 は Date で来ても 6-3 に戻る", ev('Sheets.asClass(new Date(2026, 5, 3))') === "6-3");
ok("5-4 は Date で来ても 5-4 に戻る", ev('Sheets.asClass(new Date(2026, 4, 4))') === "5-4");
ok("ふつうの字はそのまま", ev('Sheets.asClass(" 3-2 ")') === "3-2");

/* すでに化けているシートでも読めるか。クラス列に Date を直に入れて確かめる */
(function(){
  const grid = SHEETS["クラス"];
  const at = ev('Sheets.head("クラス").at');
  for(const row of grid.slice(1)){
    if(String(row[at["クラス"]]) === "6-3") row[at["クラス"]] = new Date(2026, 5, 3);
    if(String(row[at["クラス"]]) === "1-1") row[at["クラス"]] = new Date(2026, 0, 1);
  }
})();
const fixed = ev("Store.readRoster(2026)");
ok("化けたシートでも 6-3 が読める",
   (fixed.classes["6"] || []).indexOf("6-3") >= 0, fixed.classes["6"]);
ok("化けたシートでも 1-1 が読める",
   (fixed.classes["1"] || []).indexOf("1-1") >= 0, fixed.classes["1"]);
ok("化けても学級数は変わらない",
   Object.keys(fixed.classes).reduce((a,g) => a + fixed.classes[g].length, 0) === 20);

/* 週案の対象が化けていても、同じコマとして扱えるか */
ev(`Store.writeCells(2026, [{date:"2026-12-01", slot:"p1", layer:"home", target:"6-3", title:"社会"}])`);
(function(){
  const at = ev('Sheets.head("週案").at');
  for(const row of SHEETS["週案"]) if(String(row[at["対象"]]) === "6-3")
    row[at["対象"]] = new Date(2026, 5, 3);
})();
const rows0 = rowsOf("週案").length;
ev(`Store.writeCells(2026, [{date:"2026-12-01", slot:"p1", layer:"home", target:"6-3", title:"理科"}])`);
ok("対象が化けていても同じ行を直す（行が増えない）",
   rowsOf("週案").length === rows0, rowsOf("週案").length - rows0);
ok("読み直すと 6-3 のコマとして戻る",
   ev('Store.readWeek(2026, "2026-11-30")').home["6-3"]["1|p1"].title === "理科");

/* 4月に開けたとき、**足りないものを名指しできるか**。
   ここが黙ると、担任が「自分のクラスが無い」と探すことになる。 */
console.log("\n■ 年間行事計画表を読む（1行1日の縦長の表）");
(function(){
  const g = SHEETS["行事取り込み"];
  const put = (d, c, st, w) => {
    const row = new Array(6).fill("");
    row[0] = d; row[1] = w || ""; row[2] = c || ""; row[3] = st || "";
    g.push(row);
  };
  put(new Date(2026, 10, 16), "校外学習6年(奈良)", "職員会議15:00", "A");
  put("2026-11-17", "", "定時退勤日", "");
  put("11/18", "ジャンボ落語・計画", "", "B");
  put("2026-11-19", "", "", "");              /* 何も書いていない日は入れない */
  put("2027-05-01", "来年度の行事", "", "");   /* 別の年度は入れない */
  put("よめない", "だめ", "", "");             /* 日付が読めない行 */
})();
const evs = ev("Store.readEvents(2026)");
ok("日付ごとに読める", evs.rows === 3, evs);
ok("児童と職員を分けて持つ",
   evs.events["2026-11-16"].c === "校外学習6年(奈良)"
   && evs.events["2026-11-16"].s === "職員会議15:00", evs.events["2026-11-16"]);
ok("日付が Date でも読める", !!evs.events["2026-11-16"], Object.keys(evs.events));
ok("「2026-11-17」の形でも読める", evs.events["2026-11-17"].s === "定時退勤日");
ok("「11/18」の形でも読める（年度の年を当てる）",
   evs.events["2026-11-18"].c === "ジャンボ落語・計画", Object.keys(evs.events));
ok("A週B週も持つ（参考として）",
   evs.events["2026-11-16"].w === "A" && evs.events["2026-11-18"].w === "B");
ok("何も書いていない日は入れない", !evs.events["2026-11-19"], Object.keys(evs.events));
ok("別の年度の行は入れない", !evs.events["2027-05-01"], Object.keys(evs.events));
ok("日付が読めない行は、何行目かを言う",
   evs.warn.join("").indexOf("よめない") >= 0, evs.warn);
ok("読めない行があっても、ほかは読む", evs.rows === 3, evs);
ok("年度の初めから終わりまで（4/1〜翌3/31）で切る", (function(){
     const r = ev("Store.readEvents(2027)");
     return !!r.events["2027-05-01"] && !r.events["2026-11-16"] && !r.events["2026-11-17"];
   })() === true, ev("Store.readEvents(2027)").events);
/* **年の無い書き方（11/18）は、読む年度の日として当てる。**
   どちらの年度で読んでも入るので、年間行事計画表には年まで書いてもらう */
ok("年の無い日付は、読む年度に当てる",
   !!ev("Store.readEvents(2027)").events["2027-11-18"],
   ev("Store.readEvents(2027)").events);

console.log("\n■ 行事の見出しは、括弧や空白が揺れても読む");
(function(){
  const g = SHEETS["行事取り込み"];
  g[0] = ["日 付", "週", "行事計画 (児童)", "行事計画（職員）", "", ""];
})();
ok("全角半角と空白の揺れを通す",
   ev("Store.readEvents(2026)").events["2026-11-16"].c === "校外学習6年(奈良)",
   ev("Store.readEvents(2026)").events["2026-11-16"]);
(function(){
  const g = SHEETS["行事取り込み"];
  g[0] = ["ひづけ", "週", "児童", "職員", "", ""];
})();
ok("「日付」の列が無ければ、何が足りないかを言う", (function(){
     const r = ev("Store.readEvents(2026)");
     return r.rows === 0 && r.warn.join("").indexOf("日付") >= 0;
   })() === true, ev("Store.readEvents(2026)").warn);
(function(){ SHEETS["行事取り込み"][0] = ["日付", "週", "行事計画（児童）", "行事計画（職員）", "", ""]; })();

console.log("\n■ 立ち上がりの1回で、年間行事も返す");
ok("apiBoot が行事を返す", (function(){
     const b = ev("apiBoot(2026)");
     return !!b.events && !!b.events["2026-11-16"];
   })() === true, ev("apiBoot(2026)").events);
ok("apiReadYear も返す", (function(){
     const r = ev("apiReadYear(2026)");
     return !!r.events && !!r.events["2026-11-16"];
   })() === true);

console.log("\n■ 年度の検査");
let chk = ev("Store.checkYear(2026)");
const item = w => chk.items.find(x => x.what === w);
ok("9項目を見る", chk.items.length === 9, chk.items.map(x => x.what));
ok("クラスは20組と言う", item("クラス").detail.indexOf("20組") >= 0, item("クラス"));
ok("時程の校時数を言う", item("時程").level === "ok", item("時程"));
ok("基本時間割が空なら止める（ng）", item("基本時間割").level === "ng", item("基本時間割"));
ok("直し方を書く", !!item("基本時間割").fix, item("基本時間割"));
ok("ng の数を返す", chk.ng >= 1, chk);
ok("つないでいるファイルの名前も返す", typeof chk.file === "string", chk);

/* 担任に児童のアドレスが入っていたら、そこで止める */
SHEETS["クラス"][1][0] = 2026;
SHEETS["クラス"][1][3] = "12345678@kyoiku.edu.nishi.or.jp";
chk = ev("Store.checkYear(2026)");
ok("担任の欄に児童のアドレスがあれば ng",
   chk.items.find(x => x.what === "担任のメール").level === "ng",
   chk.items.find(x => x.what === "担任のメール"));
SHEETS["クラス"][1][3] = "tanaka@edu.nishi.or.jp";
chk = ev("Store.checkYear(2026)");
ok("教職員のアドレスなら止めない",
   chk.items.find(x => x.what === "担任のメール").level !== "ng",
   chk.items.find(x => x.what === "担任のメール"));
ok("年度の行が1行だけなら、そのことを言う",
   chk.items.find(x => x.what === "クラス").detail.indexOf("1組") >= 0,
   chk.items.find(x => x.what === "クラス"));
/* **年度の欄を戻す。** 1行だけ 2026 が入っていると、その年度はその1行が
   全部になる（年度の行があれば、年度の空欄の行は使わない）。 */
SHEETS["クラス"][1][0] = "";
SHEETS["クラス"][1][3] = "";

/* 基本時間割を入れると ok に変わる（検査が中身を見ている証拠） */
ev(`Store.writeBaseAll(2026, {"1-1":{A:{"0|p1":{title:"国語",subject:"kokugo"}},
                                     B:{"0|p1":{title:"国語",subject:"kokugo"}}}})`);
chk = ev("Store.checkYear(2026)");
ok("1組だけ入れても、残りが空なら ng のまま",
   chk.items.find(x => x.what === "基本時間割").level === "ng",
   chk.items.find(x => x.what === "基本時間割"));
ok("空のクラス名を並べる",
   chk.items.find(x => x.what === "基本時間割").detail.indexOf("1-2") >= 0,
   chk.items.find(x => x.what === "基本時間割").detail);

console.log("\n■ ロック");
ok("書き込みのあとロックは残らない", locks.held === 0, locks.held);

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
