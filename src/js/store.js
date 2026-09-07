/* 保存。**年度で丸ごう分ける。前の年度は消さずに残る。**

   db = {
     v: 3,
     settings: { 用紙・時数コピーの形 …（年度をまたいで同じもの） },
     years: {
       "2026": { classes, specials, base, weeks, week1 },
       "2027": { … }
     }
   }

   年度は 4/1 起点で、**開いている週の日付から決まる**。手で切り替えさせない。
   切り替えを残すと、切り替えたまま別の年度に書く事故が起きる。 */

const KEY = "school-timetable/v3";

const blankDb = () => ({
  v: 3,
  settings: {
    paper:"B5", margin:8, k:1, vz:100, fit:true,
    tally:{ anchor:"C2", classes:"3-1,3-2,3-3", block:10,
            cols:{am2:0, p1:2, p2:4, br:6, p3:7, p4:9, lun:11, p5:12, p6:14} }
  },
  years: {}
});

let db = blankDb();
let storeBroken = "";          /* 保存できなくなった理由。空なら健全 */

function loadDb(){
  let raw = null;
  try{ raw = localStorage.getItem(KEY); }catch(e){ storeBroken = "この端末では保存できない設定になっている"; }
  if(!raw) return;
  let got;
  try{ got = JSON.parse(raw); }
  catch(e){
    /* 壊れた中身で上書きしない。退避してから初期状態で開く */
    try{ localStorage.setItem(KEY + "/broken/" + Date.now(), raw); }catch(_){}
    storeBroken = "保存されていた内容を読めなかった。退避して新しく始めた";
    return;
  }
  if(!got || typeof got !== "object") return;
  db.settings = Object.assign(blankDb().settings, got.settings || {});
  db.settings.tally = Object.assign(blankDb().settings.tally, (got.settings||{}).tally || {});
  db.years = (got.years && typeof got.years === "object") ? got.years : {};
}

/* 保存できなかったことを黙って飲み込まない。
   飲み込むと、教師は書けたつもりで書けていない状態のまま週を進める。 */
let onStoreError = () => {};
function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify(db));
    if(storeBroken){ storeBroken = ""; }
    return true;
  }catch(e){
    storeBroken = (e && e.name === "QuotaExceededError")
      ? "端末の保存領域がいっぱいで、これ以上保存できない"
      : "保存できなかった（" + ((e && e.name) || "原因不明") + "）";
    onStoreError(storeBroken);
    return false;
  }
}

/* ── 年度ごとの入れ物 ────────────────────────── */

let monday = mondayOf(new Date());          /* いま開いている週の月曜 */
const wkKey = () => iso(monday);
const fy    = () => fyOf(monday);

function newYear(y){
  const prev = db.years[String(y - 1)];
  return {
    /* クラス編成と専科は前年度から引き継ぐ（学年ごとのクラス数は年で変わらない）。
       基本時間割は引き継がない。**毎年変わるものを黙って持ち越さない。** */
    classes:  prev ? clone(prev.classes)  : clone(DEFAULT_CLASSES),
    specials: prev ? clone(prev.specials) : clone(DEFAULT_SPECIALS),
    base:{}, weeks:{}, week1: firstMonday(y)
  };
}
/* 読むだけ。**ここでは保存しない**（描画のたびに呼ばれるため）。
   新しい年度を作ったときは、その場で1回 save() する側が呼ぶ。 */
function Y(){
  const y = String(fy());
  let Yr = db.years[y];
  if(!Yr){ Yr = db.years[y] = newYear(+y); }
  if(!Yr.classes)  Yr.classes  = clone(DEFAULT_CLASSES);
  if(!Yr.specials) Yr.specials = clone(DEFAULT_SPECIALS);
  if(!Yr.base)  Yr.base  = {};
  if(!Yr.weeks) Yr.weeks = {};
  if(!Yr.week1) Yr.week1 = firstMonday(+y);
  return Yr;
}
const knownYears = () => Object.keys(db.years).sort();

/* ── クラス編成 ──────────────────────────────── */

const grades         = () => Object.keys(Y().classes).sort();
const classesOfGrade = g  => (Y().classes[g] || []);
const allClasses     = () => grades().reduce((a,g) => a.concat(classesOfGrade(g)), []);
const specials       = () => Y().specials;
/* クラス名から学年を引く。**名前を「-」で割らない。**
   学年を名前に持たないクラスがあっても壊れない。 */
function gradeOf(c){
  const t = Y().classes;
  for(const g in t) if(t[g].indexOf(c) >= 0) return g;
  return "";
}

/* ── 週 ──────────────────────────────────────── */

const ck = (d, s) => d + "|" + s;

function week(){
  const ws = Y().weeks, k = wkKey();
  let w = ws[k];
  if(!w) w = ws[k] = {school:{}, grade:{}, special:{}, home:{}, acked:[], variant:"A"};
  for(const f of ["school","grade","special","home"]) if(!w[f]) w[f] = {};
  if(!Array.isArray(w.acked)) w.acked = [];
  if(!w.variant) w.variant = "A";
  return w;
}
function weekNo(){
  const w1 = parseISO(Y().week1 || firstMonday(fy()));
  if(!w1) return null;
  const n = Math.round((monday - mondayOf(w1)) / (7 * 86400000)) + 1;
  return n > 0 ? n : null;
}
