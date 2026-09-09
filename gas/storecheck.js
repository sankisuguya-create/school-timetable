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

function ensure(grid, r, c){
  while(grid.length < r) grid.push(new Array(WIDE).fill(""));
  for(const row of grid) while(row.length < c) row.push("");
}
function fakeSheet(name){
  const grid = SHEETS[name];
  return {
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
    getMaxRows(){ return Math.max(1000, grid.length); },
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
function fakeSheetOn(grid, name){
  const s0 = {
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
    getMaxRows(){ return Math.max(200, grid.length); },
    setFrozenRows(){}, setFrozenColumns(){},
    setName(n){ TPFILE.sheets[n] = grid; delete TPFILE.sheets[name]; name = n; return s0; },
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
        getSheets: () => Object.keys(TPFILE.sheets).map(tpSheet),
        getSheetByName: n => (n in TPFILE.sheets) ? tpSheet(n) : null,
        insertSheet(n){ TPFILE.sheets[n] = []; return tpSheet(n); },
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
ok("9枚＋貼り付け用の1枚ができる", made.made.length === 10, made.made);
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

console.log("\n■ たんぽぽ時間割へ出す");
(function(){
  /* 実物と同じ形の1週ぶん。1日16行・各校時は2行（上が授業名、下が担当者・場所） */
  const W = 12;
  const blank = () => new Array(W).fill("");
  const g = [];
  g.push(blank());                                     /* 1行目：取り扱い注意など */
  const days = [[2026,10,16], [2026,10,17], [2026,10,18], [2026,10,19], [2026,10,20]];
  for(const d of days){
    const head = blank();
    head[0] = new Date(d[0], d[1], d[2]);
    head[1] = "3-3"; head[2] = "３－３"; head[3] = "5-1"; head[4] = "大屋";
    g.push(head);
    for(let i = 1; i <= 15; i++){
      const row = blank();
      if(i === 5)  row[0] = "中休み";
      if(i === 10) row[0] = "給食";
      if(i === 11) row[0] = "昼休み";
      /* 担当者・場所の行。**ここは触らせない** */
      if([2,4,7,9,13,15].indexOf(i) >= 0){ row[1] = "交：丸山"; row[2] = "た：桝村"; row[3] = "交：星川"; }
      if([1,3,6,8,12,14].indexOf(i) >= 0){ row[3] = "のこす"; }   /* 選ばない列の授業名 */
      g.push(row);
    }
  }
  TPFILE.sheets["週案"] = g;
  /* 設定にファイルIDを入れる */
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = TPID;
})();
const titles = {"3-3":{}, "5-1":{}};
for(let d = 0; d < 5; d++){
  titles["3-3"][String(d)] = {p1:"国語" + d, p2:"算数", p3:"", p4:"体育", p5:"理科", p6:"総合"};
  titles["5-1"][String(d)] = {p1:"だめ", p2:"だめ", p3:"だめ", p4:"だめ", p5:"だめ", p6:"だめ"};
}
const rep = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`);
ok("5日ぶん書く", rep.days === 5, rep);
ok("書いたコマ数を返す", rep.wrote === 5 * 6 * 2, rep.wrote);   /* 3-3 の列が2つ */
const G = TPFILE.sheets["週案"];
ok("1校時の授業名の行に入る", G[2][1] === "国語0", G[2].slice(0,5));
ok("同じ交流学級の列が2つあれば両方に入る", G[2][2] === "国語0", G[2].slice(0,5));
ok("6校時は +14 の行", G[15][1] === "総合", G[15].slice(0,5));
ok("空の校時は空で入る（先週の授業名を残さない）", G[7][1] === "", G[7].slice(0,5));
ok("担当者・場所の行は触らない", G[3][1] === "交：丸山" && G[3][2] === "た：桝村",
   G[3].slice(0,5));
ok("選んでいない交流級の列は触らない", G[2][3] === "のこす", G[2].slice(0,5));
ok("中休み・給食・昼休みの行は触らない",
   G[6][0] === "中休み" && G[11][0] === "給食" && G[12][0] === "昼休み",
   [G[6][0], G[11][0], G[12][0]]);
ok("見出しの日付は触らない",
   !!G[1][0] && typeof G[1][0] === "object" && typeof G[1][0].getMonth === "function",
   String(G[1][0]));

/* 形が合わない日は、その日だけ書かない */
TPFILE.sheets["週案"][6][0] = "こわれた";     /* 月曜の +5 を「中休み」でなくする */
const rep2 = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`);
ok("形が合わない日は書かない", rep2.days === 4, rep2);
ok("どの日をなぜ飛ばしたかを言う",
   rep2.skipped.length === 1 && rep2.skipped[0].indexOf("中休み") >= 0, rep2.skipped);
TPFILE.sheets["週案"][6][0] = "中休み";

/* **人数と列の数が合っているか。** 2人いるのに1列しかなければ、片方が入らない */
const rn = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, {"3-3":2})`);
ok("2人ぶん2列あれば、食い違いは出ない",
   (rn.short || []).length === 0, rn.short);
const rn1 = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, {"3-3":1})`);
ok("1人と書いてあるのに2列あれば知らせる",
   (rn1.short || []).length === 5 && rn1.short[0].indexOf("1人だが列は2つ") >= 0,
   rn1.short && rn1.short[0]);
const rn3 = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, {"3-3":3})`);
ok("3人と書いてあるのに2列でも知らせる",
   (rn3.short || []).length === 5 && rn3.short[0].indexOf("3人だが列は2つ") >= 0,
   rn3.short && rn3.short[0]);
ok("食い違っても、ある列には書く", rn3.days === 5, rn3);

/* 実物は日によって行数が違う（16・18・15・18・18）。**揃っていなくても書く。**
   骨（中休み・給食・昼休み）を探して、そこから校時の行を数える */
(function(){
  const W = 12, blank = () => new Array(W).fill("");
  const g = [];
  g.push(blank());
  const days = [[2026,10,16], [2026,10,17]];
  days.forEach((d, di) => {
    const head = blank();
    head[0] = new Date(d[0], d[1], d[2]);
    head[1] = "3-3";
    g.push(head);
    /* 1日目は上に空行が1つ多い（＝骨の位置が下にずれる） */
    if(di === 0) g.push(blank());
    for(let i = 1; i <= 15; i++){
      const row = blank();
      if(i === 5)  row[0] = "中休み";
      if(i === 10) row[0] = "給食";
      if(i === 11) row[0] = "昼休み";
      g.push(row);
      /* 2日目は5校時のあとに空行を2つ足す（＝下がふくらむ） */
      if(di === 1 && i === 13){ g.push(blank()); g.push(blank()); }
    }
  });
  TPFILE.sheets["ずれ"] = g;
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"]){
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = TPID;
    if(String(row[at["キー"]]) === "たんぽぽシート名")  row[at["値"]] = "ずれ";
  }
})();
const rz = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`);
ok("行数が日によって違っても書く", rz.days === 2, rz);
const Z = TPFILE.sheets["ずれ"];
ok("空行が1つ多い日でも、正しい行に入る", Z[3][1] === "国語0", Z.slice(1,5).map(r => r[1]));
ok("下がふくらんだ日でも、正しい行に入る", Z[19][1] === "国語1",
   Z.slice(17,22).map(r => r[1]));

/* 6校時の行が無い日（実物の水曜）。**その日を丸ごと飛ばさない** */
(function(){
  const g = TPFILE.sheets["ずれ"];
  g.length = 0;
  g.push(new Array(12).fill(""));
  const head = new Array(12).fill(""); head[0] = new Date(2026, 10, 18); head[1] = "3-3";
  g.push(head);
  for(let i = 1; i <= 13; i++){          /* 6校時の2行が無い（+14 +15 が無い） */
    const row = new Array(12).fill("");
    if(i === 5)  row[0] = "中休み";
    if(i === 10) row[0] = "給食";
    if(i === 11) row[0] = "昼休み";
    g.push(row);
  }
})();
const rs = ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`);
ok("6校時の行が無い日でも、1〜5校時は書く",
   rs.days === 1 && TPFILE.sheets["ずれ"][2][1] === "国語2",
   [rs, TPFILE.sheets["ずれ"][2][1]]);
ok("書けなかった校時があることは言う",
   rs.skipped.length === 1 && rs.skipped[0].indexOf("6校時") >= 0, rs.skipped);
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽシート名") row[at["値"]] = "";
})();

/* この週の日付が入っていなくても、**日付を入れ直して使う**。
   たんぽぽ時間割は毎週おなじシートを使い回すため。 */
const rep3 = ev(`Store.exportTanpopo(2026, "2026-12-07", ${JSON.stringify(titles)}, {"3-3":2})`);
ok("この週の日付が無ければ、日付を入れ直して書く",
   rep3.days === 5 && rep3.redated === 5, rep3);
ok("入れ直した日付はその週の月〜金", (function(){
     const g = TPFILE.sheets["週案"];
     const d = g[1][0];
     return !!d && typeof d === "object" && d.getMonth() === 11 && d.getDate() === 7;
   })() === true, String(TPFILE.sheets["週案"][1][0]));
/* 骨が1つも無ければ、日付も入れ直せない */
(function(){
  for(const row of TPFILE.sheets["週案"]) if(String(row[0]) === "中休み") row[0] = "";
})();
const rep4 = ev(`Store.exportTanpopo(2026, "2027-05-10", ${JSON.stringify(titles)}, {"3-3":2})`);
ok("骨も日付も無ければ、書かずに理由を返す",
   rep4.days === 0 && rep4.skipped.length >= 1, rep4);
(function(){                      /* 骨を戻す */
  const g = TPFILE.sheets["週案"];
  for(let i = 0; i < g.length; i++) if((i - 1) % 16 === 5) g[i][0] = "中休み";
})();

/* **URL をそのまま貼っても通す。** ID だけ抜くのは知らないとできない操作 */
const setId = v => {
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = v;
};
setId("https://docs.google.com/spreadsheets/d/" + TPID + "/edit?pli=1&gid=0#gid=0");
ok("URLをそのまま貼っても開ける",
   ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`).days === 5);
setId("  " + TPID + "  ");
ok("IDだけでも開ける（前後の空白ごと）",
   ev(`Store.exportTanpopo(2026, "2026-11-16", ${JSON.stringify(titles)}, ["3-3"])`).days === 5);
setId("これはURLではない");
let badId = "";
try{ ev(`Store.exportTanpopo(2026, "2026-11-16", {}, ["3-3"])`); }
catch(e){ badId = String(e.message || e); }
ok("URLでもIDでもなければ、何が悪いかを言う",
   badId.indexOf("たんぽぽファイルID") >= 0 && badId.indexOf("URL") >= 0, badId);
setId(TPID);

/* ファイルIDが空なら止める */
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = "";
})();
let noId = false;
try{ ev(`Store.exportTanpopo(2026, "2026-11-16", {}, ["3-3"])`); }catch(e){ noId = true; }
ok("ファイルIDが空なら、何もせず知らせる", noId === true);

console.log("\n■ たんぽぽ時間割の形を作る");
/* 偽のファイルに、形の合っていないシートを置く */
TPFILE.sheets["ばらばら"] = (function(){
  const g = [];
  for(let i = 0; i < 30; i++) g.push(new Array(12).fill(""));
  g[0][0] = "たんぽぽ"; g[3][1] = "なにか";
  return g;
})();
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"]){
    if(String(row[at["キー"]]) === "たんぽぽシート名")  row[at["値"]] = "ばらばら";
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = TPID;
  }
})();
const sp0 = ev(`Store.shapeTanpopo("2026-11-16")`);
ok("形が合っていないと、何が無いかを言う",
   sp0.note.length >= 2 && sp0.note.join("").indexOf("日付") >= 0, sp0.note);

const bt = ev(`Store.buildTanpopo(2026, "2026-11-16", {"3-3":2, "1-1":1}, ["p1","p2","p3","p4","p5","p6"])`);
ok("児童の数だけ列を作る（2人いる交流級は2列）", bt.cols === 3, bt);
ok("列は学年・組の順に並ぶ",
   JSON.stringify(bt.list) === JSON.stringify(["1-1", "3-3", "3-3"]), bt.list);
ok("1日16行・5日ぶんと見出しの行", bt.rows === 1 + 16 * 5, bt.rows);
ok("前の形は消さずに名前を変えて残す", !!bt.backup && !!TPFILE.sheets[bt.backup], bt.backup);
const G2 = TPFILE.sheets["ばらばら"];
ok("A列に骨（中休み・給食・昼休み）が入る",
   String(G2[1 + 5][0]) === "中休み" && String(G2[1 + 10][0]) === "給食"
   && String(G2[1 + 11][0]) === "昼休み",
   [G2[6][0], G2[11][0], G2[12][0]]);
ok("日ブロックの先頭に日付が入る",
   !!G2[1][0] && typeof G2[1][0] === "object", String(G2[1][0]));
ok("見出しの行に交流学級が並ぶ",
   String(G2[1][1]) === "1-1" && String(G2[1][2]) === "3-3" && String(G2[1][3]) === "3-3",
   G2[1].slice(0, 5));
/* 作った形にそのまま出せる */
const bt2 = ev(`Store.exportTanpopo(2026, "2026-11-16",
  ${JSON.stringify({"3-3":{"0":{p1:"国語",p2:"算数",p3:"",p4:"体育",p5:"理科",p6:"総合"},
                          "1":{},"2":{},"3":{},"4":{}},
                    "1-1":{"0":{p1:"生活"},"1":{},"2":{},"3":{},"4":{}}})},
  {"3-3":2, "1-1":1})`);
ok("作った形にはそのまま出せる", bt2.days === 5 && (bt2.short || []).length === 0, bt2);
ok("2人ぶんの列に同じ授業が入る",
   String(G2[2][2]) === "国語" && String(G2[2][3]) === "国語", G2[2].slice(0, 5));
ok("担当者・場所の行は空のまま（たんぽぽ担当が書く）",
   String(G2[3][2]) === "", G2[3].slice(0, 5));
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽシート名") row[at["値"]] = "";
})();

/* **消さずに退避する**のと、**形が分からないときは書かない**のは、
   外へ出すところ全部で同じにする。1本に寄せてある（Sheets.stash / shapeOk）。 */
/* **年度末に、人がドライブでファイルを丸ごと複製する。**
   こちらは数える・照合する・消すだけ。複製をコードで書かないので、
   コピー漏れが原理的に起きない。本体のURLは変わらない。 */
/* **交流級の見出しは Date に化ける。** 1-2 は「1月2日」として取り込まれる。
   画面には 1-2 と出るのに getValues() は Date を返すので、字として比べると
   交流級が1つも見つからず、1コマも書けない。落ちないので気づかない。 */
console.log("\n■ 交流級の見出しが日付に化けても読む");
ok("Date の 1-2 を交流級として読む",
   ev('Store.__tpCls(new Date(2026, 0, 2))') === "1-2",
   ev('Store.__tpCls(new Date(2026, 0, 2))'));
ok("Date の 6-4 も読む（6月4日）",
   ev('Store.__tpCls(new Date(2026, 5, 4))') === "6-4",
   ev('Store.__tpCls(new Date(2026, 5, 4))'));
ok("字のままの見出しはそのまま", ev('Store.__tpCls("3-3")') === "3-3");
ok("全角や長音の混じった見出しも直す",
   ev('Store.__tpCls("１ー１")') === "1-1", ev('Store.__tpCls("１ー１")'));

/* 作った形の見出しが、次に読むとき字として残っているか */
console.log("\n■ たんぽぽの列は、組ごとに並べて作る");
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"]){
    if(String(row[at["キー"]]) === "たんぽぽシート名")   row[at["値"]] = "組ならび";
    if(String(row[at["キー"]]) === "たんぽぽファイルID") row[at["値"]] = TPID;
  }
})();
TPFILE.sheets["組ならび"] = [["たんぽぽ"], ["x"]];
const bg = ev(`Store.buildTanpopo(2026, "2026-11-16", [
  {cls:"6-4", group:1}, {cls:"1-2", group:2}, {cls:"3-3", group:1},
  {cls:"1-1", group:2}, {cls:"3-3", group:2}
], ["p1","p2","p3","p4","p5","p6"])`);
ok("たんぽぽ1組から順に、組の中はクラス順",
   JSON.stringify(bg.list) === JSON.stringify(["3-3","6-4","1-1","1-2","3-3"]), bg.list);
ok("どの列が何組かも返す",
   JSON.stringify(bg.groups) === JSON.stringify([1,1,2,2,2]), bg.groups);
const GB = TPFILE.sheets["組ならび"];
ok("見出しは字として残る（Date にならない）",
   typeof GB[1][1] === "string" && GB[1][1] === "3-3", GB[1].slice(0, 6));
ok("B列から右を書式なしテキストにしている",
   FORMATS["組ならび/1,2"] === "@" && FORMATS["組ならび/1,6"] === "@",
   [FORMATS["組ならび/1,2"], FORMATS["組ならび/1,6"]]);
ok("A列（日付）は書式なしテキストにしない",
   FORMATS["組ならび/1,1"] !== "@", FORMATS["組ならび/1,1"]);
ok("日ブロックの先頭は日付のまま",
   !!GB[1][0] && typeof GB[1][0] === "object", String(GB[1][0]));

/* **6-4 は「6月4日」に化けやすい。** 往復して残ることを見る */
ok("6-4 の列がそのまま残る", GB[1].indexOf("6-4") > 0, GB[1].slice(0, 6));
const bg2 = ev(`Store.shapeTanpopo("2026-11-16")`);
ok("作った形を読み直すと、交流級の列が数えられる", bg2.classCols === 5, bg2.classCols);
ok("見出しを読み返しても 6-4 のまま",
   bg2.head.indexOf("6-4") >= 0, bg2.head.slice(0, 8));
/* 出す側も、化けた見出しを読めること */
const ex = ev(`Store.exportTanpopo(2026, "2026-11-16",
  {"3-3":{"0":{p1:"国語"},"1":{},"2":{},"3":{},"4":{}},
   "6-4":{"0":{p1:"算数"},"1":{},"2":{},"3":{},"4":{}},
   "1-1":{"0":{p1:"生活"},"1":{},"2":{},"3":{},"4":{}},
   "1-2":{"0":{p1:"体育"},"1":{},"2":{},"3":{},"4":{}}},
  {"3-3":2, "6-4":1, "1-1":1, "1-2":1})`);
ok("組ごとの並びのまま書き込める", ex.days === 5 && (ex.short || []).length === 0, ex);
ok("6-4 の列に 6-4 の授業が入る",
   String(GB[2][GB[1].indexOf("6-4")]) === "算数", GB[2].slice(0, 6));
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽシート名") row[at["値"]] = "";
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
   av.ok === false && av.why.join("").indexOf("行数が合いません") >= 0, av.why);
let threw = "";
try{ ev(`Store.archivePurge(2025, "${ARCID}", "2025")`); }catch(e){ threw = e.message; }
ok("合わないときは1行も消さない", ev("Store.archiveCount(2025)").rows === 3, threw);
ok("そのとき何が合わないかを言う", threw.indexOf("行数が合いません") >= 0, threw);

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
ok("次に何をすればよいかも言う", se.message.indexOf("いまの形をみる") >= 0, se.message);

/* 空のシートへは1マスも書かない。**書くと別の行に授業名が入る** */
TPFILE.sheets["からっぽ"] = [[""]];
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽシート名") row[at["値"]] = "からっぽ";
})();
threw = "";
try{ ev(`Store.exportTanpopo(2026, "2026-11-16", {}, {"3-3":1})`); }
catch(e){ threw = e.message; }
ok("形が分からないシートへは書かない", threw.indexOf("形が読めません") >= 0, threw);
ok("そのときも「エラーが発生しました」で終わらせない",
   threw.indexOf("からっぽ") >= 0 && threw.indexOf("行が") >= 0, threw);
(function(){
  const at = ev('Sheets.head("設定").at');
  for(const row of SHEETS["設定"])
    if(String(row[at["キー"]]) === "たんぽぽシート名") row[at["値"]] = "";
})();

/* **古い画面からの保存を止める。**
   A先生が読み、B先生が保存し、そのあとA先生が古い画面のまま保存すると、
   B先生の予定は書いた本人にも見えないまま消える。 */
console.log("\n■ 古い状態からの保存は競合として止める");
const CW = (patches) => ev("Store.writeCells")(2026, patches);
const one = (extra) => Object.assign({date:"2026-06-15", slot:"p4", layer:"home",
  target:"3-3", note:"", subject:null}, extra);

/* 新しいコマ。まだ誰も書いていない ＝ expectedAt 0 */
let cw = CW([one({title:"Aの国語", expectedAt:0})]);
ok("誰も書いていないコマは expectedAt 0 で入る",
   cw.count === 1 && cw.conflicts.length === 0, cw);
const at1 = cw.at["2026-06-15|p4|home|3-3"];
ok("入った時刻を返す", typeof at1 === "number" && at1 > 0, at1);

/* B先生が上書きする（最新の時刻を知っている） */
cw = CW([one({title:"Bの算数", expectedAt:at1})]);
ok("最新を知っていれば書ける", cw.count === 1 && cw.conflicts.length === 0, cw);
const at2 = cw.at["2026-06-15|p4|home|3-3"];

/* ケース1：A先生が古い画面のまま保存 */
cw = CW([one({title:"Aの理科", expectedAt:at1})]);
ok("古い時刻のまま保存すると競合する", cw.conflicts.length === 1, cw);
ok("競合したぶんは数に入れない", cw.count === 0 && cw.asked === 1, cw);
ok("いま入っている中身を返す", cw.conflicts[0].currentTitle === "Bの算数", cw.conflicts[0]);
ok("いま入っている時刻も返す", cw.conflicts[0].currentAt === at2, cw.conflicts[0]);
ok("誰が入れたかも返す",
   cw.conflicts[0].currentBy === "tanaka@edu.nishi.or.jp", cw.conflicts[0]);
ok("どのコマかを返す",
   cw.conflicts[0].date === "2026-06-15" && cw.conflicts[0].slot === "p4"
   && cw.conflicts[0].layer === "home" && cw.conflicts[0].target === "3-3", cw.conflicts[0]);
ok("**Bの内容は書き替わっていない**",
   ev(`Store.readWeek(2026, "2026-06-15", [{layer:"home",target:"3-3"}])`)
     .home["3-3"]["0|p4"].title === "Bの算数",
   ev(`Store.readWeek(2026, "2026-06-15", [{layer:"home",target:"3-3"}])`).home["3-3"]);

/* ケース3：A先生が「それでも上書きする」（最新の時刻で送り直す） */
cw = CW([one({title:"Aの理科", expectedAt:at2})]);
ok("最新の時刻で送り直せば書ける", cw.count === 1 && cw.conflicts.length === 0, cw);
const at3 = cw.at["2026-06-15|p4|home|3-3"];
ok("上書きが入っている",
   ev(`Store.readWeek(2026, "2026-06-15", [{layer:"home",target:"3-3"}])`)
     .home["3-3"]["0|p4"].title === "Aの理科");

/* ケース4：確認しているあいだに、さらに別の人が書いた */
CW([one({title:"Cの体育", expectedAt:at3})]);
cw = CW([one({title:"Aの理科（再）", expectedAt:at3})]);
ok("確認しているあいだに書かれたら、もう一度競合する", cw.conflicts.length === 1, cw);
ok("そのときも中身は Cのまま", cw.conflicts[0].currentTitle === "Cの体育", cw.conflicts[0]);

/* 消すときも同じ */
cw = CW([one({title:"", remove:true, expectedAt:at1})]);
ok("消すときも古い時刻なら止める", cw.conflicts.length === 1, cw);
ok("止めたので消えていない",
   !!ev(`Store.readWeek(2026, "2026-06-15", [{layer:"home",target:"3-3"}])`)
     .home["3-3"]["0|p4"]);

/* 1つのまとめの中に、通るものと競合するものが混じる */
const two = ev("Store.writeCells")(2026, [
  one({title:"通るほう", slot:"p5", expectedAt:0}),
  one({title:"競合するほう", expectedAt:at1})
]);
ok("通るぶんは書く", two.count === 1, two);
ok("競合するぶんだけ返す", two.conflicts.length === 1
   && two.conflicts[0].slot === "p4", two.conflicts);
ok("通ったコマは実際に入っている",
   ev(`Store.readWeek(2026, "2026-06-15", [{layer:"home",target:"3-3"}])`)
     .home["3-3"]["0|p5"].title === "通るほう");

/* 古い版の画面（expectedAt を送らない）は、今までどおり書ける */
cw = CW([one({title:"古い版から", slot:"p6"})]);
ok("expectedAt を送らない画面は今までどおり書ける",
   cw.count === 1 && cw.conflicts.length === 0, cw);

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
console.log("\n■ 年度の検査");
let chk = ev("Store.checkYear(2026)");
const item = w => chk.items.find(x => x.what === w);
ok("8項目を見る", chk.items.length === 8, chk.items.map(x => x.what));
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
