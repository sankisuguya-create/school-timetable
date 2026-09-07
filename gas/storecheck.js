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
        setFontWeight(){ return this; }
      };
    },
    setFrozenRows(){}
  };
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
      insertSheet(n){ SHEETS[n] = []; return fakeSheet(n); }
    }),
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
ok("8枚できる", made.made.length === 8, made.made);
made = ev("Sheets.setup()");
ok("2回目は何も作らない（何度走らせても同じ）",
   made.made.length === 0 && made.kept.length === 8, made);
ok("列は名前で引ける", Object.keys(ev('Sheets.head("週案").at')).length >= 11);

console.log("\n■ 既定値の読み取り");
const slots = ev("Store.readSlots()");
ok("時程が10行", slots.length === 10, slots.length);
ok("1校時は授業で、時刻を持つ",
   slots[2].id === "p1" && slots[2].kind === "lesson" && slots[2].time.indexOf(":") > 0, slots[2]);
ok("朝休みは休み", slots[0].kind === "brk");
const subs = ev("Store.readSubjects()");
ok("教科が17", subs.length === 17, subs.length);
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
ok("専科が3つ", roster.specials.length === 3, roster.specials);

console.log("\n■ 週案を書いて読み直す");
let res = ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home",   target:"3-3", title:"算数", note:"わり算", subject:"sansu"},
  {date:"2026-11-18", slot:"p3", layer:"grade",  target:"3",   title:"学年体育", subject:"taiiku"},
  {date:"2026-11-20", slot:"am1",layer:"school", target:"",    title:"避難訓練"},
  {date:"2026-11-17", slot:"p2", layer:"special",target:"2-1", title:"音楽", subject:"ongaku", sp:"ongaku"}
])`);
ok("4件書いた", res.count === 4);
ok("週案シートが 見出し+4行", rowsOf("週案").length === 5, rowsOf("週案").length);
let w = ev('Store.readWeek(2026, "2026-11-16")');
ok("担任のコマが戻る", w.home["3-3"]["2026-11-16|p2"].title === "算数", w.home);
ok("学年のコマが戻る", w.grade["3"]["2026-11-18|p3"].title === "学年体育");
ok("全校のコマが戻る", w.school["2026-11-20|am1"].title === "避難訓練");
ok("専科のコマは担当付きで戻る",
   w.special["2-1"]["2026-11-17|p2"].sp === "ongaku", w.special);
ok("更新時刻はサーバが打つ（0でない）",
   w.home["3-3"]["2026-11-16|p2"].at > 0, w.home["3-3"]["2026-11-16|p2"].at);

console.log("\n■ 週と年度でしぼる");
ev(`Store.writeCells(2026, [{date:"2026-11-24", slot:"p1", layer:"home", target:"3-3", title:"来週"}])`);
ev(`Store.writeCells(2027, [{date:"2026-11-16", slot:"p1", layer:"home", target:"3-3", title:"別年度"}])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("次の週のコマは混ざらない", !w.home["3-3"]["2026-11-24|p1"], Object.keys(w.home["3-3"]));
ok("別の年度のコマは混ざらない", !w.home["3-3"]["2026-11-16|p1"]);
ok("別の年度は残っている",
   !!ev('Store.readWeek(2027, "2026-11-16")').home["3-3"]["2026-11-16|p1"]);

console.log("\n■ 同じコマを書き直す");
const before = rowsOf("週案").length;
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"国語", subject:"kokugo"}
])`);
ok("行は増えない（同じコマは同じ行を直す）", rowsOf("週案").length === before, rowsOf("週案").length);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("中身が入れ替わる", w.home["3-3"]["2026-11-16|p2"].title === "国語");

console.log("\n■ 空にすると消える。ただし行番号はずらさない");
const rowOfGrade = SHEETS["週案"].findIndex(r => r[3] === "grade") + 1;
ev(`Store.writeCells(2026, [
  {date:"2026-11-16", slot:"p2", layer:"home", target:"3-3", title:"", note:""}
])`);
w = ev('Store.readWeek(2026, "2026-11-16")');
ok("消える", !(w.home["3-3"] || {})["2026-11-16|p2"], w.home["3-3"]);
ok("下の行はずれない（消さずに空にしている）",
   SHEETS["週案"][rowOfGrade - 1][3] === "grade",
   SHEETS["週案"][rowOfGrade - 1]);
ok("学年のコマは残っている", !!w.grade["3"]["2026-11-18|p3"]);

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

console.log("\n■ 画面から呼ぶ口はすべて関門を通る");
const gated = ["apiBoot()", 'apiReadYear(2026)', 'apiReadWeek(2026,"2026-11-16")',
               'apiWriteCells(2026,[])', 'apiWriteRoster(2026,{},[],"")',
               'apiWriteBase(2026,"3-3","A",{})'];
EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
for(const call of gated){
  let threw = false;
  try{ ev(call); }catch(e){ threw = true; }
  ok("児童が " + call.split("(")[0] + " を直接叩いても止まる", threw === true);
}
EMAIL = "tanaka@edu.nishi.or.jp";
ok("教職員は apiBoot を通る", typeof ev("apiBoot()").me === "string");
ok("apiBoot が時程と教科を渡す",
   ev("apiBoot()").slots.length === 10 && ev("apiBoot()").subjects.length === 17);

console.log("\n■ ロック");
ok("書き込みのあとロックは残らない", locks.held === 0, locks.held);

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
