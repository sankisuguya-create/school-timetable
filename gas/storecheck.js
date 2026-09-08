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
        setFontWeight(){ return this; }, setNumberFormat(){ return this; }
      };
    },
    getMaxRows(){ return Math.max(200, grid.length); },
    setFrozenRows(){},
    getDataRange(){
      const r = s0.getLastRow(), c = s0.getLastColumn();
      return s0.getRange(1, 1, Math.max(1, r), Math.max(1, c));
    }
  };
  return s0;
}

let EMAIL = "tanaka@edu.nishi.or.jp";
const locks = {held:0};

const sandbox = {
  console,
  Logger: {log(){}},
  Session: {getActiveUser: () => ({getEmail: () => EMAIL})},
  SpreadsheetApp: {
    getActive: () => ({
      getSheetByName: n => (n in SHEETS) ? fakeSheet(n) : null,
      insertSheet(n){ SHEETS[n] = []; return fakeSheet(n); },
      getSheets(){ return Object.keys(SHEETS).map(fakeSheet); }
    }),
    openById(id){
      if(id !== TPID) throw new Error("そんなファイルは無い: " + id);
      return {
        getName: () => TPFILE.name,
        getSheets: () => Object.keys(TPFILE.sheets).map(tpSheet),
        getSheetByName: n => (n in TPFILE.sheets) ? tpSheet(n) : null
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
    formatDate(d, tz, fmt){
      const p = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
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

/* ── シートを作る ─────────────────────────────── */
console.log("■ シートを作る");
let made = ev("Sheets.setup()");
ok("8枚＋貼り付け用の1枚ができる", made.made.length === 9, made.made);
made = ev("Sheets.setup()");
ok("2回目は何も作らない（何度走らせても同じ）",
   made.made.length === 0 && made.kept.length === 8, made);
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
ok("担任のコマが戻る", w.home["3-3"]["2026-11-16|p2"].title === "算数", w.home);
ok("学年のコマが戻る", w.grade["3"]["2026-11-18|p3"].title === "学年体育");
ok("全校のコマが戻る", w.school["2026-11-20|am1"].title === "避難訓練");
ok("専科のコマは担当付きで戻る",
   w.special["2-1"]["2026-11-17|p2"].sp === "ongaku", w.special);
ok("更新時刻はサーバが打つ（0でない）",
   w.home["3-3"]["2026-11-16|p2"].at > 0, w.home["3-3"]["2026-11-16|p2"].at);

console.log("\n■ 要るシートだけ読む");
const only = ev(`Store.readWeek(2026, "2026-11-16",
   [{layer:"school",target:""},{layer:"grade",target:"3"},{layer:"home",target:"3-3"}])`);
ok("頼んだクラスは戻る", !!only.home["3-3"]["2026-11-16|p2"]);
ok("頼んでいないクラスは読まない", !only.special["2-1"], only.special);

console.log("\n■ 週と年度でしぼる");
ev(`Store.writeCells(2026, [{date:"2026-11-24", slot:"p1", layer:"home", target:"3-3", title:"来週"}])`);
ev(`Store.writeCells(2027, [{date:"2026-11-16", slot:"p1", layer:"home", target:"3-3", title:"別年度"}])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("次の週のコマは混ざらない", !w.home["3-3"]["2026-11-24|p1"], Object.keys(w.home["3-3"]));
ok("別の年度のコマは混ざらない", !w.home["3-3"]["2026-11-16|p1"]);
ok("別の年度は残っている",
   !!ev('Store.readWeek(2027, "2026-11-16")').home["3-3"]["2026-11-16|p1"]);

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
ok("中身が入れ替わる", w.home["3-3"]["2026-11-16|p2"].title === "社会",
   w.home["3-3"]["2026-11-16|p2"]);

console.log("\n■ 空にすると、その行だけ消える");
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"", note:""}
])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("消える", !(w.home["3-3"] || {})["2026-11-16|p2"], w.home["3-3"]);
ok("同じシートのほかのコマは残る", !!w.home["3-3"]["2026-11-16|am1"], w.home["3-3"]);
ok("学年のコマも残っている", !!w.grade["3"]["2026-11-18|p3"]);
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
ok("旧シートのコマが読めるようになる", !!w52 && !!w52["2026-11-19|p4"], w52);
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

console.log("\n■ たんぽぽ交流級の印");
ev(`Store.writeRoster(2028, {"3":["3-1","3-2","3-3"]},
    [{code:"ongaku", label:"音楽"}], "2028-04-03", ["3-1","3-3"])`);
const r28 = ev("Store.readRoster(2028)");
ok("印を付けたクラスだけ返る",
   JSON.stringify(r28.tanpopo) === JSON.stringify(["3-1","3-3"]), r28.tanpopo);
ok("印はクラス表の欄で持つ（コードに書かない）",
   ev('Sheets.head("クラス").at["たんぽぽ交流級"]') >= 0,
   ev('Sheets.head("クラス").cols'));
/* シートに手で ○ 以外を書いても通す。消したいときは空にする */
(function(){
  const at = ev('Sheets.head("クラス").at');
  for(const row of SHEETS["クラス"])
    if(String(row[at["年度"]]) === "2028" && String(row[at["クラス"]]) === "3-2")
      row[at["たんぽぽ交流級"]] = "あり";
})();
ok("○ でなくても、空でなければ印として読む",
   ev("Store.readRoster(2028).tanpopo").indexOf("3-2") >= 0,
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
    [{code:"ongaku", label:"音楽"}], "2028-04-03", ["3-1"])`);
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
ok("印は書き直したとおりになる",
   JSON.stringify(ev("Store.readRoster(2028).tanpopo")) === JSON.stringify(["3-1"]),
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

/* この週の日付が無ければ、黙って何もしない代わりに理由を返す */
const rep3 = ev(`Store.exportTanpopo(2026, "2026-12-07", ${JSON.stringify(titles)}, ["3-3"])`);
ok("その週が無ければ書かず、理由を返す",
   rep3.days === 0 && rep3.skipped.length === 1, rep3);

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

console.log("\n■ 画面から呼ぶ口はすべて関門を通る");
const gated = ["apiBoot()", 'apiReadYear(2026)', 'apiReadWeek(2026,"2026-11-16")',
               'apiWriteCells(2026,[])', 'apiWriteRoster(2026,{},[],"")',
               'apiWriteBase(2026,"3-3","A",{})', 'apiWriteBaseAll(2026,{})',
               'apiReadPaste()', 'apiExportTanpopo(2026,"2026-11-16",{},[])'];
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
   ev('Store.readWeek(2026, "2026-11-30")').home["6-3"]["2026-12-01|p1"].title === "理科");

console.log("\n■ ロック");
ok("書き込みのあとロックは残らない", locks.held === 0, locks.held);

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
