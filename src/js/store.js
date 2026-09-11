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
    /* A週の起点の月曜。**この週がA週で、以後1週ごとに入れ替わる**（config.js） */
    abAnchor: AB_ANCHOR,
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

/* ── 古い週の間引き ──────────────────────────
   **本番でだけ間引く。手元だけで使っているときは、ここが正本なので消さない。**

   1クラス週30コマで、手元の控えは年に 2〜3MB 増える。localStorage の上限は
   5MB 前後なので、**2年目に必ず溢れる**（30人が同じ日に書けなくなる）。
   本番ではシートが正本で、消した週は次に開いたときに読み直されるだけなので、
   古い週は捨ててよい。

   捨てるのは「いま見ている週から遠い順」。年度はまたいで数える。 */
const KEEP_WEEKS = 60;              /* 平常時に手元へ残す週の数（およそ1年半） */

function onSheet(){
  return typeof Backend !== "undefined" && Backend.isGas && Backend.isGas();
}
function pruneWeeks(keep){
  if(!onSheet()) return 0;                 /* 手元では消さない */
  if(typeof Backend.unsaved === "function" && Backend.unsaved() > 0) return 0;
  const all = [];
  for(const y in db.years)
    for(const k in (db.years[y].weeks || {})) all.push({y, k});
  if(all.length <= keep) return 0;
  const here = wkKey();
  const far = (a) => Math.abs(new Date(a.k) - new Date(here)) || 0;
  all.sort((a, b) => far(a) - far(b));     /* 近い順。うしろから捨てる */
  let n = 0;
  for(const x of all.slice(keep)){
    if(x.k === here) continue;             /* いま見ている週は残す */
    delete db.years[x.y].weeks[x.k];
    n++;
  }
  return n;
}

/* 保存できなかったことを黙って飲み込まない。
   飲み込むと、教師は書けたつもりで書けていない状態のまま週を進める。 */
let onStoreError = () => {};
function put_(){ localStorage.setItem(KEY, JSON.stringify(db)); }
function save(){
  try{
    put_();
    if(storeBroken){ storeBroken = ""; }
    return true;
  }catch(e){
    /* 溢れたときは、**まず古い週を捨ててもう一度書く**。
       本番ならシートが正本なので、捨てた週は次に開けば戻る。
       それでも書けなければ、はじめて教師に知らせる。 */
    if(e && e.name === "QuotaExceededError"){
      for(const keep of [KEEP_WEEKS, 12]){
        if(!pruneWeeks(keep)) continue;
        try{ put_(); storeBroken = ""; return true; }catch(_){}
      }
    }
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
    base:{}, weeks:{}, week1: firstMonday(y),
    /* 年間行事計画表から読んだもの。**日付にしか結びついていない**
       （校時への割り付けは人がする。docs/spec.md 6節） */
    events:{},
    /* たんぽぽ児童を、**たんぽぽの組ごとに**持つ。{"1":["1-3","3-2"], "2":["4-1"]}。
       たんぽぽ時間割は児童ごとに1列で、たんぽぽ担当は組ごとに見るので、
       出す列も 1組の全員 → 2組の全員 … の順に並べる。
       同じ交流級を同じ組へ2つ入れれば2人（＝2列）。 */
    tanpopo: prev ? clone(prev.tanpopo || {}) : {}
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
  if(!Yr.events || typeof Yr.events !== "object") Yr.events = {};
  /* **毎回作り直さない。** 作り直すと、直した中身が次の呼び出しで捨てられる。
     組ごとの並び（値が配列）になっていなければ、そのときだけ直す。 */
  if(!Yr.tanpopo || typeof Yr.tanpopo !== "object" || Array.isArray(Yr.tanpopo)
     || Object.keys(Yr.tanpopo).some(k => !Array.isArray(Yr.tanpopo[k])))
    Yr.tanpopo = tpNorm_(Yr.tanpopo);
  return Yr;
}
/* たんぽぽの組。**既定は4組。** 学校によって数が違うので増やせる。 */
const TP_GROUPS = 4;

/* 持ち方を「組ごとの並び」へそろえる。**古い控えを捨てない。**
   捨てると、選び直しからやることになる。

     ["3-3","1-1"]          いちばん古い形（並びだけ）→ 全員を1組へ
     {"3-3":2, "1-1":1}     人数で持っていた形        → 全員を1組へ
     {"1":["3-3"], "2":[…]} いまの形                  → そのまま */
function tpNorm_(v){
  const out = {};
  const put = (g, c) => { const k = String(g); (out[k] || (out[k] = [])).push(String(c)); };
  if(Array.isArray(v)){ for(const c of v) put(1, c); }
  else if(v && typeof v === "object"){
    for(const k in v){
      const val = v[k];
      if(Array.isArray(val)){ for(const c of val) put(k, c); }        /* いまの形 */
      else { const n = +val || 0; for(let i = 0; i < Math.min(9, n); i++) put(1, k); }
    }
  }
  for(const k in out) out[k].sort(clsRank_);
  return out;
}
/* クラスの並び順。**1-1 〜 6-4。** 名前を割って数で見る（字の順では 10 が 2 の前に来る） */
function clsRank_(a, b){
  const r = c => { const m = String(c).match(/^(\d+)-(\d+)$/);
                   return m ? (+m[1]) * 100 + (+m[2]) : 9999; };
  return r(a) - r(b);
}
/* たんぽぽの組の番号。**空の組も出す**（引っぱって落とす先が要る） */
function tpGroups(){
  const t = Y().tanpopo || {};
  let n = TP_GROUPS;
  /* **空の組も数に入れる。** 足したばかりの組が消えると、落とす先が無くなる */
  for(const k in t) n = Math.max(n, +k || 0);
  const out = [];
  for(let i = 1; i <= n; i++) out.push(String(i));
  return out;
}
const tpIn = g => (Y().tanpopo || {})[String(g)] || [];
/* たんぽぽへの提出。**担任が「今週ぶんは書き終えた」と言った印。**
   週ごとの持ちもので、月曜が変われば、また未に戻る。 */
const tpSubmitted = cls => !!(week().tpSub || {})[String(cls)];
const tpSubmitInfo = cls => (week().tpSub || {})[String(cls)] || null;
/* 1人足す／1人減らす。**同じ交流級を2つ入れれば2人（＝2列）。** */
function tpAdd(g, cls){
  const t = Y().tanpopo, k = String(g);
  (t[k] || (t[k] = [])).push(String(cls));
  t[k].sort(clsRank_);
}
/* **空になっても組は残す。** 消すと、いま見ている受け皿が画面から無くなる */
function tpDrop(g, cls){
  const a = (Y().tanpopo || {})[String(g)] || [];
  const i = a.indexOf(String(cls));
  if(i >= 0) a.splice(i, 1);
}
/* 組を1つ足す。空の組を増やしても、出すときは飛ばされる */
function tpAddGroup(){ Y().tanpopo[String(tpGroups().length + 1)] = []; }

/* 出す列の並び。**1組の全員 → 2組の全員 → …**、組の中はクラス順。 */
function tpColumns(){
  const out = [];
  for(const g of tpGroups())
    for(const c of tpIn(g)) out.push({cls:c, group:+g});
  return out;
}
/* そのクラスに何人いるか（組をまたいだ合計）。0 なら出さない */
const tpCount  = c => tpColumns().filter(x => x.cls === c).length;
const tpChosen = () => {
  const seen = {}, out = [];
  for(const x of tpColumns()) if(!seen[x.cls]){ seen[x.cls] = 1; out.push(x.cls); }
  return out.sort(clsRank_);
};
const tpTotal  = () => tpColumns().length;
/* そのクラスがどの組に入っているか（画面の印に使う） */
const tpGroupsOf = c => tpGroups().filter(g => tpIn(g).indexOf(c) >= 0);

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

/* ── A週・B週 ────────────────────────────────
   **起点の月曜から1週ごとに入れ替える。** 手で選ばせない。
   手で選ばせていたころは、この端末だけの持ちものだったので、
   同じ週を教員Aは A週、教員Bは B週の基本時間割で見ていた。
   日付から決めれば、誰の画面でも同じになる（シートに持たなくてよい）。 */
function autoVariant(mondayISO){
  const a = parseISO(db.settings.abAnchor || AB_ANCHOR);
  const m = parseISO(mondayISO);
  if(!a || !m) return "A";
  const n = Math.round((mondayOf(m) - mondayOf(a)) / (7 * 86400000));
  return (((n % 2) + 2) % 2) === 0 ? "A" : "B";
}
function week(){
  const ws = Y().weeks, k = wkKey();
  let w = ws[k];
  if(!w) w = ws[k] = {school:{}, grade:{}, special:{}, home:{}, acked:[]};
  for(const f of ["school","grade","special","home"]) if(!w[f]) w[f] = {};
  if(!Array.isArray(w.acked)) w.acked = [];
  /* **手で変えていない週は、そのつど日付から決め直す。**
     控えに残った古い値を使うと、起点を直しても直らない週が残る */
  if(!w.vset) w.variant = autoVariant(k);
  else if(!w.variant) w.variant = autoVariant(k);
  return w;
}
function weekNo(){
  const w1 = parseISO(Y().week1 || firstMonday(fy()));
  if(!w1) return null;
  const n = Math.round((monday - mondayOf(w1)) / (7 * 86400000)) + 1;
  return n > 0 ? n : null;
}
