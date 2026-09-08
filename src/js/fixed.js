/* 固定時間割（基本時間割）の取り込み。

   学校の「固定時間割案」は、1行が1クラス・横に 月〜金 の各校時が並び、
   各校時が **A週とB週の2列**に分かれた表になっている。
   その形のまま読んで、クラスごとの基本時間割にする。

   **同じ教科が続く2列（A・B）は、片方だけに字が入っている。**
   もとの表では2列をつないで1つのマスに見せているため、
   値はその中のどちらか一方にしかない。だから
   **片方が空なら、もう片方と同じ**として読む。
   授業が無い校時は、空ではなく「ー」と書いてある。 */

/* 表の1文字と教科コードの対応。**表示名（国語など）でも通す。** */
const FIXED_MARK = {
  "国":"kokugo", "社":"shakai", "算":"sansu", "理":"rika", "生":"seikatsu",
  "音":"ongaku", "図":"zuko",   "家":"katei", "体":"taiiku", "道":"doutoku",
  "外":"gaikoku","総":"sogo",   "学":"gakkatsu", "と":"tosho"
};
const DASHES = /^[-ー‐‑–—―−ｰ－~〜]+$/;

/* 授業のコマ（休み時間を除く）だけを、表の 1・2・3… に当てる */
const lessonSlots = () => SLOTS.filter(s => s.kind === "lesson");

function fixNorm(v){
  let s = String(v == null ? "" : v).normalize("NFKC").trim();
  s = s.replace(/[　\s]+/g, "");
  return s;
}
/* クラス名。**日付に化けた値（Date）でも元に戻す。** */
function fixCls(v){
  if(v && typeof v === "object" && typeof v.getMonth === "function")
    return (v.getMonth() + 1) + "-" + v.getDate();
  let s = fixNorm(v).replace(/[‐‑–—―ー−ｰ－]/g, "-");
  const m = s.match(/^([1-9])\s*年\s*([1-9])\s*組$/);
  if(m) return m[1] + "-" + m[2];
  return s;
}
const isClsName = s => /^[1-9]-[1-9]$/.test(s);

/* 1マスの値を、基本時間割の中身にする。
   知らない字は**捨てずに題名として残し、あとで知らせる**。 */
function fixCell(v, unknown){
  const s = fixNorm(v);
  if(!s || DASHES.test(s)) return null;
  const code = FIXED_MARK[s]
            || (SUB_BY_NAME[s] && SUB_BY_NAME[s].code)
            || (SUB_BY_CODE[s] && s);
  /* **「教科」シートに無い教科は、教科として入れない。**
     1文字の対応表はこちらが持っているが、正本は「教科」シート。
     こちらの対応表にあるからといって、その学校がその教科を持っているとは限らない。 */
  const sub = code ? SUB_BY_CODE[code] : null;
  if(!sub){
    if(unknown.indexOf(s) < 0) unknown.push(s);
    return {title:s, subject:null};
  }
  return {title:sub.name, subject:sub.code};
}

/* ── 表を読む ──────────────────────────────────
   grid = 行の配列（1行は列の配列）。戻り値は
     {classes:{クラス:{A:bank, B:bank}}, days, periods, unknown, notes} */
function parseFixed(grid){
  const notes = [], unknown = [];
  const cell = (r, c) => (grid[r] && grid[r][c] !== undefined) ? grid[r][c] : "";

  /* A週・B週の行を探す。この行がこの表の背骨になる */
  let abRow = -1, abBest = 0;
  for(let r = 0; r < grid.length; r++){
    let n = 0;
    for(let c = 0; c < grid[r].length; c++){
      const s = fixNorm(cell(r, c)).toUpperCase();
      if(s === "A" || s === "B") n++;
    }
    if(n > abBest){ abBest = n; abRow = r; }
  }
  if(abRow < 0 || abBest < 4)
    return {error:"A週・B週の行が見つからない。表の見出しごと貼る"};

  /* A と、その次の B で1つの校時 */
  const pairs = [];
  let openA = -1;
  for(let c = 0; c < grid[abRow].length; c++){
    const s = fixNorm(cell(abRow, c)).toUpperCase();
    if(s === "A") openA = c;
    else if(s === "B" && openA >= 0){ pairs.push([openA, c]); openA = -1; }
  }
  if(!pairs.length) return {error:"A と B の組が見つからない"};

  /* 校時の行（A週B週の上）と、曜日の行（さらに上）。
     **いちばん当てはまる行を選ぶ。**上から数えた位置で決めない
     （学校の表は上に題名や空行が入る） */
  let perRow = -1, perBest = 1;
  for(let r = abRow - 1; r >= 0; r--){
    let n = 0;
    for(const [a, b] of pairs)
      if(/^[1-9]$/.test(fixNorm(cell(r, a))) || /^[1-9]$/.test(fixNorm(cell(r, b)))) n++;
    if(n > perBest){ perBest = n; perRow = r; }
  }
  if(perRow < 0) return {error:"校時（1・2・3…）の行が見つからない"};

  let dayRow = -1, dayBest = 0;
  for(let r = perRow - 1; r >= 0; r--){
    let n = 0;
    for(let c = 0; c < grid[r].length; c++)
      if(DOW.indexOf(fixNorm(cell(r, c)).charAt(0)) >= 0) n++;
    if(n > dayBest){ dayBest = n; dayRow = r; }
  }
  if(dayRow < 0) return {error:"曜日（月・火…）の行が見つからない"};

  /* 曜日は1日ぶんをつないだマスなので、左から見て最後に出たものを引き継ぐ */
  const dayAt = [];
  let cur = -1;
  for(let c = 0; c <= pairs[pairs.length - 1][1]; c++){
    const d = DOW.indexOf(fixNorm(cell(dayRow, c)).charAt(0));
    if(d >= 0) cur = d;
    dayAt[c] = cur;
  }

  /* 校時の並び。曜日で校時数が違う（月・水は5校時までなど） */
  const slots = lessonSlots();
  const cols = [];
  for(const [a, b] of pairs){
    const d = dayAt[a];
    const nStr = fixNorm(cell(perRow, a)) || fixNorm(cell(perRow, b));
    const n = +nStr;
    if(d < 0 || !(n >= 1 && n <= slots.length)){
      notes.push("読めない見出しの列があった（" + (nStr || "空") + "）。その列は飛ばした");
      continue;
    }
    cols.push({a, b, d, slot:slots[n - 1].id});
  }
  if(!cols.length) return {error:"曜日と校時のわかる列が1つも無い"};

  /* 1行1クラス */
  const classes = {}, order = [];
  const left = pairs[0][0];
  for(let r = abRow + 1; r < grid.length; r++){
    let cls = "";
    for(let c = 0; c < left && !cls; c++){
      const s = fixCls(cell(r, c));
      if(isClsName(s)) cls = s;
    }
    if(!cls) continue;
    if(classes[cls]){ notes.push(cls + " の行が2つあった。**下の行を使った**"); }
    else order.push(cls);
    const A = {}, B = {};
    for(const col of cols){
      let a = fixCell(cell(r, col.a), unknown);
      let b = fixCell(cell(r, col.b), unknown);
      /* つないだマスは片方だけに字がある。**空いている側は同じ授業** */
      if(a && !b) b = clone(a);
      else if(b && !a) a = clone(b);
      const k = ck(col.d, col.slot);
      if(a) A[k] = a;
      if(b) B[k] = b;
    }
    classes[cls] = {A, B};
  }
  if(!order.length) return {error:"クラスの行（1-1 など）が見つからない"};
  return {classes, order, unknown, notes,
          days:new Set(cols.map(c => c.d)).size, periods:cols.length};
}

/* ── 同梱の写し（2026年度 固定時間割案 4.15現在） ──────
   1クラス2行（A週・B週）。1日6文字で、授業の無い校時は「.」。
   **正本は学校の固定時間割表。**ここにあるのは取り込みの元にする写しで、
   表が新しくなったら「貼り付けて取り込む」で入れ替える。 */
const FIXED_YEAR = 2026;
const FIXED_NAME = "2026年度 固定時間割案（4.15現在）";
const FIXED_TABLE = {
  "1-1": ["国算音国生./国体算生国./国道図図../算国体国学./体算と生音.",
           "国算音国生./国体算生国./国道図図../算国体国学./体算と生音."],
  "1-2": ["国国図図生./体国算生道./国音算国../算体生国学./国と体算音.",
           "国国図図生./体国算生道./国音算国../算体生国学./国と体算音."],
  "1-3": ["国算生学と./国算体生国./国算音国../体国図図道./国体算生音.",
           "国算生学と./国算体生国./国算音国../体国図図道./国体算生音."],
  "2-1": ["算国体生国./算国生道音./体算国と国./図図算国音./算国生体学.",
           "算国体生国./算国生道音./体算国と国./図図算国音./算国生体学."],
  "2-2": ["体算国道音./国算生国音./算体生国学./算生国体国./図図国と算.",
           "体算国道音./国算生国音./算体生国学./算生国体国./図図国と算."],
  "2-3": ["国体算国生./算国音生と./国算体生国./国算音道体./算国図図学.",
           "国体算国生./算国音生と./国算体生国./国算音道体./算国図図学."],
  "3-1": ["国体算社理./国外算総図図/体算道国音./国算理理と./国算体社学総",
           "国体算社図./国外算総理理/体算道国音./国算音理と./国算体社学総"],
  "3-2": ["国社体算図./国と外算理理/国体社算総./音国道算総./体算国学音理",
           "国社体算理./国と外算図図/国体社算総./音国道算総./体算国学理理"],
  "3-3": ["体と算国社./外国算道総社/国算体学理./理理算国総./算体図図国音",
           "体と算国社./外国算道総社/国算体学図./理音算国総./算体理理国音"],
  "4-1": ["国音社体算./理理体国道算/国理外算総./社体算学国社/と総国算図図",
           "国音社体算./理理体国道算/国理外算総./社体算学国音/と総国算図社"],
  "4-2": ["と国音社算./国体理理道算/外社算国総./図図体国社算/国理算総体学",
           "と国音社算./国体理理道算/外社算国総./図社体国音算/国理算総体学"],
  "4-3": ["音国理理算./と国算体道社/理外国算総./体国算社図図/国算社体学総",
           "音国理理算./と国算体道社/理外国算総./体国算音図社/国算社体学総"],
  "5-1": ["図総国算外./家家音体算国/社算理理国./体学算理国社/外体算社国道",
           "図図国算外./家総音体算国/社算理理国./体と算理国社/外音算社国道"],
  "5-2": ["理理算外国./図総体国音算/家家社国算./国体理社算学/国外社体算道",
           "理理算外国./図図体国音算/家総社国算./国体理社算と/国外社音算道"],
  "5-3": ["国外算体理./体算社音国学/図総社算国./算外家家国社/体国理理算道",
           "国外算体理./体算社音国と/図図社算国./算外家総国社/音国理理算道"],
  "5-4": ["算国外社体./国体理理算音/国学家家算./外国図総算社/理算体社国道",
           "算国外社体./国体理理算音/国と家総算./外国図図算社/理算音社国道"],
  "6-1": ["国体図図算./音国家総算社/理理算音国./算理体社外国/算国外道社と",
           "国体図総算./音国家家算社/理理算体国./算理体社外国/算国外道社学"],
  "6-2": ["算国体社音./社算国と理理/音国図図算./理道国外体算/国算家総外社",
           "算国体社音./社算国学理理/体国図総算./理道国外体算/国算家家外社"],
  "6-3": ["家総国音算./理理国社体算/国音社算理./算道外と社国/図図算国体外",
           "家家国音算./理理国社体算/国体社算理./算道外学社国/図総算国体外"],
  "6-4": ["体算理理国./社音図図算国/と社音国算./国算道体社外/家総国外理算",
           "体算理理国./社音図総算国/学社体国算./国算道体社外/家家国外理算"]
};

/* 写しを、表を読んだのと同じ形にする */
function fixedBuiltin(){
  const slots = lessonSlots(), classes = {}, order = [], unknown = [];
  for(const cls in FIXED_TABLE){
    const [sa, sb] = FIXED_TABLE[cls];
    const bank = s => {
      const out = {};
      s.split("/").forEach((day, d) => {
        for(let i = 0; i < day.length && i < slots.length; i++){
          if(day.charAt(i) === ".") continue;      /* 授業の無い校時 */
          const v = fixCell(day.charAt(i), unknown);
          if(v) out[ck(d, slots[i].id)] = v;
        }
      });
      return out;
    };
    classes[cls] = {A:bank(sa), B:bank(sb)};
    order.push(cls);
  }
  return {classes, order, unknown, notes:[], days:5, periods:28, name:FIXED_NAME};
}

/* ── 入れる ────────────────────────────────────
   読めたクラスだけを入れ替える。表に無いクラスの基本時間割は触らない。 */
function applyFixed(res){
  const B = Y().base, done = [];
  for(const cls of res.order){
    if(allClasses().indexOf(cls) < 0) continue;   /* 編成に無いクラスは入れない */
    B[cls] = {A:clone(res.classes[cls].A), B:clone(res.classes[cls].B)};
    done.push(cls);
  }
  save();
  Backend.saveBaseAll(done);
  return done;
}
