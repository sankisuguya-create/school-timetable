/* ── 表からコマを取り込む（時数表・年間行事計画表）────────────

   どちらも同じ運び方にしてある。

     ① サイトが**雛形を出す**（いまの中身が入った状態で）
     ② それをスプレッドシートへ貼り、手元の表から中身を貼り替える
     ③ 校時や対象など、足りない列だけ手で埋める（微修正）
     ④ 丸ごとコピーして、ここへ貼って取り込む

   *雛形を出す理由*：列の並びと意味を、こちらが決めて渡す。
   先生の手元の表は学校ごと・学年ごとに形が違うので、
   「その形を読む」側に回ると、形の数だけ読み方が要る。
   **こちらの形に合わせてもらうほうが、直すところが1か所で済む。**

   *いまの中身を入れて出す理由*：空の雛形だと、埋まっているべき欄が
   分からない。既に入っているものが見えていれば、**変えるところだけ**
   直せばよく、間違えても「元と違う」ことに気づける。

   取り込む先は2つで別々。
     時数表       → **いま開いているクラス**の、その週（担任の層）
     年間行事計画表 → **全校・学年**（雛形の「対象」列で決める）
*/

/* 表の1マスを、比べられる字にする。全角・空白・記号のゆれを吸収する */
function impNorm(v){
  return String(v == null ? "" : v).normalize("NFKC").replace(/[\s　]+/g, "").trim();
}
/* 貼られた字を表に直す。**タブ区切り**（Excel もスプレッドシートもこれで出る） */
function impSplit(text){
  return String(text || "").replace(/\r/g, "").split("\n")
    .filter(ln => ln.trim() !== "").map(ln => ln.split("\t"));
}
const impTsv = rows => rows.map(r => r.join("\t")).join("\n");

/* 1文字（または教科名）から教科を引く。**時数表に入っている字を正本にする。**
   時数表は1文字で書く決まりなので、まず1文字で引き、見つからなければ名前で引く
   （先生が雛形の上で「算数」と書き直すことがある）。 */
function impSubject(v){
  const s = impNorm(v);
  if(!s) return null;
  for(const sub of SUBJECTS) if(sub.short && sub.short === s) return sub;
  if(SUB_BY_NAME[s]) return SUB_BY_NAME[s];
  for(const sub of SUBJECTS) if(impNorm(sub.name) === s) return sub;
  return null;
}

/* ══ ① 時数表 → いま開いているクラスの週案 ══════════════

   **並びは「時数をコピー」と同じ矩形**にしてある（dialogs.js tallyGrid）。
   手元の時数集計表からその週の塊をそのままコピーして、窓の表へ1回で
   貼れるようにするため ── 形が違うと、貼る前に並べ替える手間が入る。

     行 … 月〜金 × 1日あたりの行数（設定の「1日の行数」）。
          先頭から順にクラス（設定の「クラスの並び」）。
     列 … 設定の「列のずれ」に従う。校時ごとに何列目かが決まっている。

   **取り込むのは、いま開いているクラスの行だけ。** ほかのクラスの行は
   貼ったまま置いておける（消させない ── 消させると、次に貼るとき
   また塊ごと持ってくることになる）。 */

const impTallySlots = () => SLOTS.filter(s => s.kind === "lesson");

/* 設定の「列のずれ」から、列 → 校時 の対応を作る */
function impTallyCols(){
  const t = (db.settings.tally || {cols:{}});
  const cols = t.cols || {};
  const used = Object.keys(cols).map(k => +cols[k] || 0);
  const width = (used.length ? Math.max.apply(null, used) : 0) + 1;
  const bySlot = new Array(width).fill(null);
  for(const id in cols){
    const sl = SLOT_BY_ID[id];
    if(sl) bySlot[+cols[id] || 0] = sl;
  }
  return {width, bySlot, block: Math.max(1, +t.block || 10), list: tallyClasses()};
}

/* 雛形。**「時数をコピー」と同じ矩形**をそのまま使う */
const impTallyTemplate = () => tallyGrid();

/* いま開いているクラスが、1日の塊の何行目か。無ければ -1 */
const impTallyRow = () => impTallyCols().list.indexOf(view.kind === "class" ? view.cls : "");

/* 読む。戻すのは {rows, warn}。rows は [{d, slot, sub, mark}] */
function impTallyRead(grid){
  const g = impTallyCols();
  const at = impTallyRow();
  if(view.kind !== "class")
    return {warn:"<b>クラスを開いてから取り込みます。</b>"};
  if(at < 0)
    return {warn:"<b>" + escText(view.cls) + " が、時数の「クラスの並び」に入っていません。</b>"
          + "どの行がこのクラスかを決められないので、取り込めません。<br>"
          + "左メニューの「時数をコピー」の窓で、並びを実物に合わせてください"
          + (g.list.length ? "（いまは " + escText(g.list.join("・")) + "）" : "") + "。"};
  if(grid.length < WEEKDAYS * g.block)
    return {warn:"<b>行が足りません。</b>"
          + (WEEKDAYS * g.block) + " 行（" + WEEKDAYS + "日 × 1日 " + g.block + "行）が要ります。"
          + "いま " + grid.length + " 行です。"};

  const out = [], unknown = {};
  for(let d = 0; d < WEEKDAYS; d++){
    const line = grid[d * g.block + at] || [];
    for(let col = 0; col < g.width; col++){
      const sl = g.bySlot[col];
      if(!sl || sl.kind !== "lesson") continue;      /* 授業の列だけ入れる */
      if(!slotShown(d, sl)) continue;                /* 紙に出ていない校時 */
      const v = impNorm(line[col]);
      if(v === "" || v === "－" || v === "-") continue;   /* 空欄は触らない */
      /* **変わっていない欄は入れない。**
         雛形はいまの中身を入れて出すので、貼り戻すと全欄が「書いた」ことになる。
         そのまま入れると、学年や全校から降りてきたコマにも担任の層で
         同じ字を書き込み、**降りてきたはずのコマが担任のものに化ける**
         （紙の見た目は同じなので、書いた本人には気づけない）。 */
      const now = cellFor(d, sl.id);
      const nowT = plain(now.title).trim();
      const nowMark = !nowT ? "" : nowT === NO_LESSON ? "／"
                                 : shortOf(now.subject, now.title, now.short);
      if(impNorm(nowMark) === v) continue;               /* すでに同じ */
      if(v === "／" || v === "/"){
        out.push({d, slot:sl.id, sub:null, mark:NO_LESSON});
        continue;
      }
      const sub = impSubject(v);
      if(!sub){ unknown[v] = (unknown[v] || 0) + 1; continue; }
      out.push({d, slot:sl.id, sub, mark:sub.name});
    }
  }
  const un = Object.keys(unknown);
  /* **変わっていなければ、何も入れないと言う。** 0件のまま黙って閉じると、
     「入ったのか、入らなかったのか」が分からない */
  if(!out.length && !un.length)
    return {rows:out, warn:"<b>いまの週案と同じでした。</b>変わった欄がありません。"};
  return {rows:out,
    warn: un.length ? "<b>読めない字がありました：</b>" + escText(un.join("・"))
                    + "<br>その欄は入れません。教科の1文字か教科名で書いてください"
                    + "（設定の「教科の表し方」で、どの1文字を使うか見られます）。" : ""};
}

/* 入れる。**いま開いているクラスの、担任の層**。
   書き込みは writeCell の1本道を通す ── ロック・休みの日・undo・
   サーバへの知らせが、ふだんの打鍵とまったく同じになる。 */
function impTallyApply(rows){
  if(view.kind !== "class") return toast("クラスを開いてから取り込む");
  const keep = scope;
  let n = 0, skip = 0;
  try{
    scope = "self";                 /* 入れる先は、このクラス自身 */
    for(const r of rows){
      if(whyCantWrite(r.d, r.slot)){ skip++; continue; }
      const ok = writeCell(r.d, r.slot,
        r.sub ? {title:escText(r.sub.name), subject:r.sub.code}
              : {title:escText(NO_LESSON), subject:null});
      if(ok) n++; else skip++;
    }
  } finally{ scope = keep; }
  buildSheet();
  return {n, skip};
}

/* ══ ② 年間行事計画表 → 全校・学年 ══════════════════════

   年間行事計画表には**校時の列が無い**（日付にしか結びついていない）。
   だから雛形に「校時」と「対象」の列を足して、そこだけ手で埋めてもらう。

   **行事の入っている日だけ**を並べて出す。240日ぶん出すと、
   埋める行を探すだけで終わってしまう。 */

const IMP_EV_HEAD = ["日付", "校時", "対象", "行事名", "備考"];

/* 雛形。年間行事計画表から読んだ行事を、1行1件で並べる */
function impEvTemplate(){
  const rows = [IMP_EV_HEAD.slice()];
  const ev = Y().events || {};
  for(const key of Object.keys(ev).sort()){
    const e = ev[key] || {};
    for(const who of ["c", "s"]){
      const t = String(e[who] || "").trim();
      if(!t) continue;
      /* 校時と対象は空のまま出す。**ここを埋めた行だけが入る。**
         埋めなかった行は、いままでどおり日付の印として残るだけ */
      rows.push([key, "", "", t, who === "s" ? "職員" : ""]);
    }
  }
  return rows;
}

/* 「3年」「3」「全校」「全学年」を、層と対象に直す */
function impTarget(v){
  const s = impNorm(v);
  if(!s) return null;
  if(/^(全校|全学年|学校全体|全)$/.test(s)) return {layer:"school", target:""};
  const m = s.match(/^([1-9])年?$/);
  if(m && gradesAll().indexOf(m[1]) >= 0) return {layer:"grade", target:m[1]};
  return null;
}
/* いまある学年。学級編成から引く（1〜6 を決め打ちにしない） */
function gradesAll(){
  const out = [];
  for(const c of allClasses()){
    const g = gradeOf(c);
    if(out.indexOf(g) < 0) out.push(g);
  }
  return out;
}

/* 「1」「1校時」「朝の会」を校時に直す。**授業以外の行にも入れられる**
   （全校朝会は朝の会の行、避難訓練は業間のこともある） */
function impSlot(v){
  const s = impNorm(v);
  if(!s) return null;
  const les = impTallySlots();
  const m = s.match(/^([0-9]+)(校時|限)?$/);
  if(m){ const i = +m[1] - 1; return les[i] ? les[i].id : null; }
  for(const sl of SLOTS) if(impNorm(sl.name) === s) return sl.id;
  return null;
}

/* 日付。雛形は YYYY-MM-DD で出すが、貼り直しで M/D になることがある。
   **年が無いときは、いま開いている年度の中で決める**（4月始まり） */
function impDate(v){
  if(v && typeof v === "object" && typeof v.getMonth === "function") return v;
  const s = impNorm(v);
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})$/);
  if(m){
    const mo = +m[1], y = fy() + (mo >= 4 ? 0 : 1);
    return new Date(y, mo - 1, +m[2]);
  }
  return null;
}

/* 読む。戻すのは {rows, warn}。rows は [{dt, slot, to, title, note}] */
function impEvRead(text){
  const grid = impSplit(text);
  if(grid.length < 2)
    return {warn:"<b>見出しと、少なくとも1行が要ります。</b>"
          + "雛形を見出しの行ごとコピーして貼ってください。"};
  const head = grid[0].map(impNorm);
  if(head[0].indexOf("日付") < 0)
    return {warn:"<b>1行目が見出しではありません。</b>"
          + "見出しは " + IMP_EV_HEAD.join("／") + " の5つです。"};

  const out = [], bad = [];
  for(let i = 1; i < grid.length; i++){
    const r = grid[i];
    const slotRaw = r[1], toRaw = r[2];
    /* **校時と対象の両方が空の行は、はじめから読まない。**
       雛形には行事のある日をぜんぶ並べてあるので、
       コマにしないものが残っているのがふつう（消させない） */
    if(!impNorm(slotRaw) && !impNorm(toRaw)) continue;
    const dt = impDate(r[0]), slot = impSlot(slotRaw), to = impTarget(toRaw);
    const title = String(r[3] == null ? "" : r[3]).trim();
    const note  = String(r[4] == null ? "" : r[4]).trim();
    /* **学級編成に無い学年は入れない。** 入れても、その学年のクラスが
       1つも無いので誰の紙にも出ない。打ち間違い（9年）をここで拾う */
    const why = !dt ? "日付が読めない"
              : !slot ? "校時が読めない"
              : !to ? (/^[1-9]年?$/.test(impNorm(toRaw))
                       ? "その学年のクラスが無い（いまある学年は "
                         + gradesAll().join("・") + "）"
                       : "対象が読めない（全校／◯年）")
              : !title ? "行事名が空" : "";
    if(why){ bad.push((i + 1) + "行目：" + why + "（" + (r.slice(0, 4).join(" ")) + "）"); continue; }
    /* 日曜は紙に無い。**入れる場所が無いので読まない** */
    if((dt.getDay() + 6) % 7 >= DAYS){
      bad.push((i + 1) + "行目：日曜は紙にありません（" + iso(dt) + "）");
      continue;
    }
    out.push({dt, slot, to, title, note});
  }
  return {rows:out,
    warn: bad.length ? "<b>入れない行が " + bad.length + " ありました。</b><br>"
                     + bad.slice(0, 8).map(escText).join("<br>")
                     + (bad.length > 8 ? "<br>ほか " + (bad.length - 8) + " 行" : "") : ""};
}

/* ══ 行事計画の字を、そのまま貼って読む ══════════════════

   学校の行事計画（月ごとの「日 曜 行事計画（児童）」の並びや、
   3ヶ月横並びの年間行事計画表）を、**雛形に直さずそのまま貼って**読む。

   文中の決まり字を拾って、校時と対象に直す:

     「3h」「34h」           → 3校時／3・4校時（数字の数だけ連続）
     「AM」「am」           → 1〜4校時
     「特4h」               → 特別校時。5・6校時は授業なし
     「12時台／13:40下校」   → その時刻以降に始まる校時は授業なし
                             （始まる時刻は設定の校時表から読む。
                               12時台→5・6校時、13:40→6校時のみ）
     「5校時後下校」         → 5校時のあとは授業なし
     「2-6年」「135年」「6年」 → その学年だけ（無ければ全校）

   **h・AM・下校のどれも無い予定は読まない**（日の行事＝日の形は
   べつの口から入れるもので、ここでは校時の話だけを扱う）。 */

/* 「◯日 ◯曜」の字。行頭か空白のあとに、日にち→曜日の並びで立つ */
const IMP_DOC_DAY = /(?:^|[\s　])(\d{1,2})\s+([月火水木金土日])(?=[\s　]|$)/g;

/* 下校の時刻 → 潰れる校時。**その時刻以降に始まる校時**を潰す
   （その時刻のまん中にある校時は、半分だけ教えて終わったことにする ──
   13:40下校は5校時の途中なので、潰すのは6校時だけ）。始まる時刻は
   設定の校時表（SLOTS.time）から読む */
function impDocOff(les, hhmm){
  const out = [];
  for(let i = 0; i < les.length; i++){
    const m = /(\d{1,2}):(\d{2})/.exec(les[i].time || "");
    if(m && (+m[1]) * 60 + (+m[2]) >= hhmm) out.push(i);
  }
  return out;
}

/* 「135年」「2-6年」「4年」→ 学年の並び。**無ければ全校。** */
function impDocGrades(t){
  const gs = [], unknown = [];
  t = t.replace(/全学年|全校|全員/g, "");
  const re = /(\d+(?:[-–~〜]\d+)?)年/g;
  let m;
  while((m = re.exec(t))){
    const seg = m[1], list = [];
    const rm = seg.match(/^(\d+)[-–~〜](\d+)$/);
    if(rm){ for(let g = +rm[1]; g <= +rm[2]; g++) list.push(String(g)); }
    else for(const c of seg) list.push(c);
    for(const g of list)
      if(gradesAll().indexOf(g) >= 0){ if(gs.indexOf(g) < 0) gs.push(g); }
      else unknown.push(g + "年");
  }
  return {grades: gs, unknown, rest: t.replace(re, "")};
}

/* 1件ぶんの字 → {evPeriods, offPeriods, grades, title, unknown}
   evPeriods は行事が入る校時、offPeriods は授業なしにする校時（ともに0起き） */
function impDocToken(token, les){
  let t = String(token || "").normalize("NFKC").replace(/[\s　]+/g, "");
  if(!t) return null;
  const ev = new Set(), off = new Set();
  const eat = (re, fn) => { t = t.replace(re, fn); };

  /* **効き方の強いほうから消していく**（「特3h」の3hを、ふつうの3hとして
     読まないように先に取る。下校時刻を取ったあとに h を取ると、
     「11:25下校」の25を拾いそうになるので先に下校） */
  eat(/特(\d{1,2})[hHｈ]/g, (s, n) => {
    for(let i = +n; i < les.length; i++) off.add(i); return ""; });
  eat(/(\d{1,2})校時?後下校/g, (s, n) => {
    for(let i = +n; i < les.length; i++) off.add(i); return ""; });
  eat(/(\d{1,2})時(?:台|頃|すぎ|過ぎ)?下校/g, (s, h) => {
    for(const i of impDocOff(les, (+h) * 60)) off.add(i); return ""; });
  eat(/(\d{1,2}):(\d{1,2})(?:頃|台)?下校/g, (s, h, m) => {
    for(const i of impDocOff(les, (+h) * 60 + (+m))) off.add(i); return ""; });
  /* 学年。**時程の前に取る**（「23h6年」の6年は学年で、6校時ではない） */
  const g = impDocGrades(t); t = g.rest;
  eat(/(?:AM|am|ＡＭ)/g, () => {
    for(let i = 0; i < Math.min(4, les.length); i++) ev.add(i); return ""; });
  eat(/(\d{1,6})[hHｈ]/g, (s, ds) => {
    for(const c of ds){ const i = +c - 1; if(i >= 0 && i < les.length) ev.add(i); }
    return ""; });
  eat(/(\d)校時(?!後)/g, (s, n) => {
    const i = +n - 1; if(i >= 0 && i < les.length) ev.add(i); return ""; });

  /* 題名は残った字。時刻の字（15:20）や、行が切れて残った「下」の
     ひとかけらは題名から除く。注釈だけでできた件名（特4h12:15下校）は
     題名が要らない ── あとで「ひとつ前の題名」が入る */
  const title = t.replace(/\d{1,2}:\d{2}/g, "")
                 .replace(/[（(][）)]/g, "")
                 .replace(/^[、，,・。]+|[、，,・。]+$/g, "")
                 .replace(/下$/g, "");
  return {hit:!!(ev.size || off.size), ev:[...ev], off:[...off],
          grades:g.grades, title, unknown:g.unknown};
}

/* 行を日・欄に割る。**児童の欄は、欄の切れ目（2つ以上の空白）の
   集まりから見つける** ── 「行事計画（児童）」の見出しの位置と、
   実際の中身が始まる位置はずれる（PDFから取った字はだいたいずれる）ので、
   中身が何列目から始まるかを全行から数えて列を決め、
   見出しの位置にいちばん近い列を「児童の欄」とする。
   見出し自体が無いときは、いちばん手前の列を児童の欄と見なす。 */
function impDocLines(text){
  const raw = String(text || "").replace(/\r/g, "").split("\n");
  const markRe = /行事計画[\s　]*[（(](児童|職員)[）)]/g;
  const lines = [];                /* {anchs, chunks, pg} */
  let headPos = [];                /* 「行事計画（児童）」見出しの列位置 */
  const pages = [];                /* [{months:[{m,pos}]}] 見開きごとの月の見出し */
  let curPage = -1, year = 0;
  const dayRe = new RegExp(IMP_DOC_DAY.source, "g");

  for(const ln of raw){
    if(!ln.trim()) continue;
    const t = ln.normalize("NFKC");
    const ym = t.match(/(\d{4})\s*年度?/) || t.match(/令和\s*(\d+)年度?/);
    if(ym) year = ym[1].length === 4 ? +ym[1] : 2018 + +ym[1];
    /* 「◯月行事計画」は、その先の紙が全部その月の印（月ごとの計画表） */
    const ml = t.match(/(\d{1,2})\s*月\s*行事計画/);
    if(ml){ pages.push({months:[{m:+ml[1], pos:0}]}); curPage = pages.length - 1; }
    markRe.lastIndex = 0;
    const hp = []; let mm;
    while((mm = markRe.exec(t))) if(mm[1] === "児童") hp.push(mm.index);
    if(hp.length){ headPos = hp; continue; }          /* 欄の見出し行 */
    const mo = [...t.matchAll(/(\d{1,2})月/g)];

    dayRe.lastIndex = 0;
    const anchs = []; let am;
    while((am = dayRe.exec(t)))
      anchs.push({pos:am.index, end:dayRe.lastIndex, d:+am[1], dow:am[2]});
    /* 月の見出し行（「◯月」だけが並ぶ行。年間表は見開きごとに3つ並ぶ。
       **見開きごとに別の見出し**なので、行を見つけるたびに新しい頁として
       積む ── あとの日の字は、そのとき積んだいちばん新しい頁の月を使う。
       文中の「3月分」などは月だけの行にならないので当たらない） */
    if(!anchs.length && mo.length >= 2 && /^[\s\d月]+$/.test(t)){
      pages.push({months:mo.map(x => ({m:+x[1], pos:x.index}))});
      curPage = pages.length - 1;
    }

    /* 塊（2つ以上の空白・タブで切れる字のまとまり）を開始位置つきで取る。
       **「日 ◯曜」の字は空白に潰しておく** ── そのまま取ると、
       日の字と中身が1つの塊に繋がって中身ごと消えてしまう */
    let t2 = t;
    for(const a of anchs)
      t2 = t2.slice(0, a.pos) + " ".repeat(a.end - a.pos) + t2.slice(a.end);
    const chunks = [];
    let p = 0, n = t2.length;
    while(p < n){
      while(p < n && (t2[p] === " " || t2[p] === "\t")) p++;
      if(p >= n) break;
      let q = p;
      while(q < n && !(t2[q] === "\t" || (t2[q] === " " && t2[q + 1] === " "))) q++;
      chunks.push({pos:p, text:t2.slice(p, q).trim()});
      p = q;
    }
    lines.push({anchs, chunks, pg:curPage});
  }

  /* 塊の開始位置を全部集めて、近いものは同じ列と見なす（列の帯を作る） */
  const starts = [];
  for(const l of lines) for(const c of l.chunks) starts.push(c.pos);
  starts.sort((a, b) => a - b);
  const cols = [];                 /* {lo,hi} 列の帯 */
  for(const s of starts){
    const c = cols[cols.length - 1];
    if(c && s - c.hi <= 6) c.hi = s; else cols.push({lo:s, hi:s});
  }
  const colIndex = pos => {
    for(let i = 0; i < cols.length; i++)
      if(pos >= cols[i].lo - 4 && pos <= cols[i].hi + 4) return i;
    return -1;
  };
  /* 児童の欄：見出しの位置にいちばん近い列（見出しと中身はずれているので
     ±30字は許す）。見出しが無いときは、いちばん手前の列 */
  const childCols = [];
  if(headPos.length){
    for(let bi = 0; bi < headPos.length; bi++){
      let best = -1, bd = 1e9;
      for(let i = 0; i < cols.length; i++){
        const c = cols[i];
        const dd = Math.min(Math.abs(c.lo - headPos[bi]),
                            Math.abs((c.lo + c.hi) / 2 - headPos[bi]),
                            Math.abs(c.hi - headPos[bi]));
        if(dd < bd){ bd = dd; best = i; }
      }
      if(best >= 0 && bd <= 30) childCols.push({col:best, band:bi});
    }
  }
  if(!childCols.length && cols.length) childCols.push({col:0, band:0});
  const bandOf = ci => (childCols.find(x => x.col === ci) || {band:0}).band;

  /* 日の字に、児童の欄の塊を割り当てる（その日の字より右・次の日の字より左） */
  const days = [], lastByBand = {};
  for(const l of lines){
    const child = l.chunks.filter(c => childCols.some(x => x.col === colIndex(c.pos)));
    if(l.anchs.length){
      for(let i = 0; i < l.anchs.length; i++){
        const a = l.anchs[i], nx = l.anchs[i + 1];
        const mine = child.filter(c => c.pos > a.pos && (!nx || c.pos < nx.pos));
        const seg = mine.map(c => c.text).join("、");
        const band = mine.length ? bandOf(colIndex(mine[0].pos))
          : (() => { let b = 0, bd = 1e9;
              for(const cc of childCols){
                const dd2 = cols[cc.col].lo - a.end;
                if(dd2 >= 0 && dd2 < bd){ bd = dd2; b = cc.band; }
              } return b; })();
        days.push({band, d:a.d, dow:a.dow, text:seg, pg:l.pg});
        lastByBand[band] = days.length - 1;
      }
    }else{
      /* 日の字が無い行は、前の日の字のつづき（欄ごとに独立して継ぐ） */
      for(const c of child){
        const b = bandOf(colIndex(c.pos)), li = lastByBand[b];
        if(li != null && days[li])
          days[li].text += (days[li].text ? "、" : "") + c.text;
      }
    }
  }
  return {days, cols, childCols, pages, year};
}

/* 月を引く。**その日の字が属する頁の月見出し**から、欄の分を取る。
   頁の月が1つ（月ごとの計画表）なら全部その月。3つ（3ヶ月横並び）なら
   欄の順に宛てる。数が合わないときは、欄の位置にいちばん近い月。 */
function impDocMonth(L, d){
  const pg = d.pg >= 0 ? L.pages[d.pg] : L.pages[0];
  if(!pg || !pg.months.length) return 0;
  const ms = pg.months;
  if(ms.length === L.childCols.length && ms[d.band]) return ms[d.band].m;
  const cc = L.childCols[d.band];
  const at = cc ? L.cols[cc.col].lo : d.band * 60;
  let m = 0;
  for(const x of ms) if(x.pos <= at + 30) m = x.m;
  return m || ms[0].m;
}

/* 読む。戻すのは impEvRead と同じ {rows, warn} */
function impDocRead(text){
  const les = impTallySlots();
  const L = impDocLines(text);
  if(!L.days.length)
    return {warn:"<b>日にちと曜日の並びが見つかりません。</b>"};
  const year = L.year || fy();
  const rows = [], bad = [], map = {};
  let daysHit = 0, sunday = 0;
  for(const d of L.days){
    const m = impDocMonth(L, d);
    if(!m){ bad.push(d.d + "日：月が読めない"); continue; }
    const dt = new Date(year, m - 1, d.d);
    if(dt.getMonth() !== m - 1){ bad.push(m + "月" + d.d + "日：日付が変"); continue; }
    if((dt.getDay() + 6) % 7 >= DAYS){ sunday++; continue; }  /* 日曜は紙に無い */
    if(!d.text) continue;
    daysHit++;
    let lastT = "";   /* ひとつ前の題名 ── 「参観懇談、12h」のような
                        題名の無い校時メモに、直前の題名をあてる */
    for(const token of d.text.split(/[、，,]|・(?!\S)/)){
      const r = impDocToken(token, les);
      if(!r) continue;
      if(r.title && r.title.length >= 2) lastT = r.title;
      for(const x of r.unknown)
        bad.push(m + "月" + d.d + "日：" + x + " は、いまある学年に無い");
      if(!r.hit) continue;
      const title = r.title && r.title.length >= 2 ? r.title
        : (lastT || String(token).trim().slice(0, 20));
      const tos = r.grades.length ? r.grades.map(g => ({layer:"grade", target:g}))
                                  : [{layer:"school", target:""}];
      for(const to of tos){
        for(const i of r.ev){
          const k = iso(dt) + "|" + les[i].id + "|" + to.layer + "|" + to.target;
          /* **授業なしが先に入っていれば、行事では上書かない** */
          if(map[k] == null) map[k] = rows.push({dt, slot:les[i].id, to,
            title, note:String(token).trim()}) - 1;
        }
        for(const i of r.off){
          const k = iso(dt) + "|" + les[i].id + "|" + to.layer + "|" + to.target;
          /* **授業なしは行事より強い。** 同じコマに両方あれば、
             潰れるほうを残す（下校のほうが手堅い判断） */
          const row = {dt, slot:les[i].id, to, title:NO_LESSON,
                       note:String(token).trim()};
          if(map[k] != null) rows[map[k]] = row;
          else map[k] = rows.push(row) - 1;
        }
      }
    }
  }
  const headInfo = "<b>読んだ形：</b>"
    + (L.pages.length === 1 && L.pages[0].months.length === 1
        ? L.pages[0].months[0].m + "月行事計画"
        : year + "年の年間行事計画")
    + "　" + daysHit + "日ぶん";
  let warn = headInfo;
  if(!rows.length)
    warn += "<br><b>校時が読めた予定がありません。</b>"
      + "入るのは「3h」「34h」「AM」「特4h」「◯◯下校」のある予定だけです"
      + "（日の行事は、日の形から入れます）。";
  if(sunday) warn += "<br>日曜の " + sunday + " 行は紙に無いので入れません。";
  if(bad.length) warn += "<br><b>入れない行が " + bad.length + " ありました。</b><br>"
    + bad.slice(0, 8).map(escText).join("<br>")
    + (bad.length > 8 ? "<br>ほか " + (bad.length - 8) + " 行" : "");
  return {rows, warn};
}

/* 入れる。**日付が何週にもまたがる。**
   書く前に、当たる週をぜんぶ読む ── 読まずに書くと、そのコマの
   サーバ側の時刻（sat）が 0 のまま送られる。0 は「その行はまだ無い」の意味
   なので、既にある行を書こうとしていると見なされて競合で止まる
   （→ gas/Domain.gs expectedVersionMatches）。 */
function impEvApply(rows, then){
  const byFy = {};
  for(const r of rows){
    const mon = mondayOf(r.dt);
    (byFy[fyOf(mon)] || (byFy[fyOf(mon)] = {}))[iso(mon)] = true;
  }
  const w = Wait.begin("入れる先の週を読んでいます");
  readByFy(byFy, () => {
    Wait.end(w);
    then(impEvWrite(rows));
  });
}

function impEvWrite(rows){
  const keep = monday;
  let n = 0, skip = 0;
  try{
    for(const r of rows){
      monday = mondayOf(r.dt);
      const d = Math.round((r.dt - monday) / 86400000);
      if(d < 0 || d >= DAYS){ skip++; continue; }
      const wk = week();
      const st = r.to.layer === "school"
        ? wk.school
        : (wk.grade[r.to.target] || (wk.grade[r.to.target] = {}));
      const key = ck(d, r.slot);
      /* **書き替える前に、サーバの時刻を控える**（writeCell と同じ決まり） */
      const was  = (st[key] || {}).sat || 0;
      const wasT = plain((st[key] || {}).title);
      const e = st[key] || {title:"", note:"", subject:null};
      e.title = escText(r.title);
      if(r.note) e.note = escText(r.note);
      /* 教科は付けない。**行事は時数に数えない**（数えるものは教科で決まる）。
         行事の教科コードを当てにいくと、名前の似た教科に吸われる */
      e.subject = e.subject || null;
      e.by = myEmail();
      e.at = Date.now();
      e.sat = was;
      st[key] = e;
      /* **どの週のコマかを渡す。** 渡さないと「いま開いている週」として
         送られ、別の週のコマを書き替えることになる */
      Backend.cellChanged(r.to.layer, r.to.target, d, r.slot, was,
                          {year:fy(), monday:wkKey()}, wasT);
      n++;
    }
  } finally{ monday = keep; }
  save();
  return {n, skip};
}

/* ══ 窓 ══════════════════════════════════════════════ */

let impPlanKind = "tally", impPlanRows = null;

function openImpPlan(kind){
  impPlanKind = kind;
  impPlanRows = null;
  const tally = kind === "tally";
  if(tally && view.kind !== "class")
    return toast("時数表は<b>クラスを開いてから</b>取り込む");
  $("ipTtl").textContent = tally ? "時数表から取り込む" : "年間行事計画表からコマを作る";
  $("ipLead").innerHTML = tally
    ? "<b>いま開いている「" + escText(viewName()) + "」の、この週に入ります。</b>"
      + "下の表は<b>「時数をコピー」と同じ並び</b>です。"
      + "手元の時数集計表からその週の塊をコピーして、"
      + "<b>左上のマスを選んでそのまま貼る</b>と、1回で入ります。"
      + "マスを直に打ち直しても構いません。"
    : "<b>全校・学年の層に入ります。</b>雛形には、年間行事計画表に入っている行事が"
      + "並びます。<b>コマにしたい行だけ「校時」と「対象」を埋めて</b>、"
      + "丸ごと貼り戻してください。埋めなかった行は入りません。<br>"
      + "<b>行事計画の字をそのまま貼っても読みます</b>"
      + "（月ごとの「日 曜 行事計画（児童）」や年間行事計画表）。"
      + "「3h」「34h」「AM」「特4h」「12時台／13:40下校」「2-6年」の字を拾って、"
      + "校時と対象に直します。";
  /* 時数表はマス目の表、年間行事は字の欄。**運び方は同じでも、形が違う。**
     時数表は矩形なので、表のほうが貼りやすい（列のずれを目で合わせられる）。
     年間行事は1行1件で、行を足し引きするので、字の欄のほうが直しやすい */
  $("ipTableWrap").hidden = !tally;
  $("ipTextWrap").hidden  = tally;
  $("ipTpl").textContent  = tally ? "いまの週案を表に入れる" : "雛形を出す（コピー）";
  $("ipText").value = "";
  $("ipStat").textContent = "";
  $("ipWarn").innerHTML = "";
  $("ipGrid").innerHTML = "";
  $("ipGo").disabled = true;
  $("ipGo").textContent = tally ? "この週に入れる" : "全校・学年に入れる";
  if(tally) impTallyTable(impTallyTemplate());
  $("impPlanDlg").showModal();
}

/* ── 窓の中のマス目の表（時数表のほう）────────────────
   **貼る先をそのまま見せる。** スプレッドシートを開かずに済む。

   左の2列は目じるし（曜日・クラス）。触れない。
   右のマスが中身で、1マスが1校時ぶん。**いま開いているクラスの行に印**を付け、
   ほかのクラスの行は薄くする ── 貼るのは塊ごとなので消させないが、
   入るのは自分の行だけだと、見て分かるようにしておく。 */
function impTallyTable(grid){
  const g = impTallyCols(), at = impTallyRow();
  const head = ["<tr><th></th><th></th>"
    + g.bySlot.map((sl, i) => "<th>" + escText(sl ? sl.name : String(i)) + "</th>").join("")
    + "</tr>"];
  const body = [];
  for(let d = 0; d < WEEKDAYS; d++) for(let r = 0; r < g.block; r++){
    const n = d * g.block + r;
    const line = grid[n] || [];
    const mine = r === at;
    body.push("<tr" + (mine ? " class='mine'" : "") + (r === 0 ? " data-top='1'" : "") + ">"
      + "<th class='dow'>" + (r === 0 ? escText(DOW[d]) : "") + "</th>"
      + "<th class='cls'>" + escText(g.list[r] || "") + "</th>"
      + g.bySlot.map((sl, i) =>
          "<td" + (sl && sl.kind === "lesson" ? "" : " class='off'") + ">"
          + "<input data-n='" + n + "' data-c='" + i + "' value='"
          + escText(line[i] == null ? "" : line[i]) + "'"
          + (sl && sl.kind === "lesson" ? "" : " tabindex='-1'") + "></td>").join("")
      + "</tr>");
  }
  $("ipTable").innerHTML = "<table class='iptbl'>" + head.join("") + body.join("") + "</table>";
  /* **塊ごと貼れるようにする。** 1マスずつ打ち直させない ──
     時数集計表からコピーしてくるのが、この口のそもそもの目的 */
  for(const e of $("ipTable").querySelectorAll("input"))
    e.addEventListener("paste", ev => {
      const txt = (ev.clipboardData || window.clipboardData).getData("text");
      if(!txt || txt.indexOf("\t") < 0 && txt.indexOf("\n") < 0) return;  /* 1マスぶんはそのまま */
      ev.preventDefault();
      impTallyPaste(+e.dataset.n, +e.dataset.c, impSplit(txt));
    });
}

/* 貼られた塊を、選んだマスを左上にして流し込む */
function impTallyPaste(n0, c0, rows){
  const g = impTallyCols();
  for(let r = 0; r < rows.length; r++) for(let c = 0; c < rows[r].length; c++){
    const box = $("ipTable").querySelector(
      "input[data-n='" + (n0 + r) + "'][data-c='" + (c0 + c) + "']");
    if(box) box.value = rows[r][c];
  }
  $("ipStat").textContent = rows.length + " 行を貼った。「読む」で確かめる";
}

/* 表を読み出して矩形に戻す */
function impTallyGrid(){
  const g = impTallyCols(), out = [];
  for(let n = 0; n < WEEKDAYS * g.block; n++){
    const line = new Array(g.width).fill("");
    for(let c = 0; c < g.width; c++){
      const box = $("ipTable").querySelector("input[data-n='" + n + "'][data-c='" + c + "']");
      if(box) line[c] = box.value;
    }
    out.push(line);
  }
  return out;
}

function impPlanTemplate(){
  if(impPlanKind === "tally"){
    impTallyTable(impTallyTemplate());
    $("ipStat").textContent = "いまの週案を表に入れた";
    return;
  }
  const rows = impEvTemplate();
  if(rows.length < 2) return toast("年間行事計画表に行事がありません");
  copyText(impTsv(rows),
    "雛形をコピーした。スプレッドシートへ <b>貼り付け</b> してください");
  /* **貼る先の窓にも出しておく。** クリップボードが使えない環境がある
     （校務のブラウザで止めてあることがある）ので、字としても見せる */
  $("ipText").value = impTsv(rows);
  $("ipStat").textContent = (rows.length - 1) + " 行の雛形を出した";
}

function impPlanRead(){
  let r;
  if(impPlanKind === "tally") r = impTallyRead(impTallyGrid());
  else{
    r = impEvRead($("ipText").value);
    /* **雛形の形で貼っていなければ、行事計画の書き方として読む。**
       貼る手間は、雛形に直させるより、そのまま読むほうが軽い */
    if(!r.rows || !r.rows.length){
      const alt = impDocRead($("ipText").value);
      if(alt.rows && alt.rows.length) r = alt;
      else if(!r.rows) r = {rows:[], warn:(r.warn || "")
        + (alt.warn ? "<br>" + alt.warn : "")};
    }
  }
  impPlanRows = null;
  $("ipGrid").innerHTML = "";
  $("ipGo").disabled = true;
  $("ipWarn").innerHTML = r.warn ? "<div class='box'>" + r.warn + "</div>" : "";
  if(!r.rows) return void ($("ipStat").textContent = "");
  impPlanRows = r.rows;
  $("ipStat").textContent = r.rows.length + " 件を入れます";
  $("ipGo").disabled = !r.rows.length;
  /* **入れる前に、入るものを見せる。** 貼った表そのままではなく、
     「どの日の何校時に、何が入るか」に直して出す ── 読み違えはここで分かる */
  const head = impPlanKind === "tally" ? ["曜日", "校時", "入るもの"]
                                       : ["日付", "校時", "対象", "行事名"];
  const line = x => impPlanKind === "tally"
    ? [DOW[x.d], (SLOT_BY_ID[x.slot] || {}).name || x.slot, x.mark]
    : [iso(x.dt), (SLOT_BY_ID[x.slot] || {}).name || x.slot,
       x.to.layer === "school" ? "全校" : x.to.target + "年", x.title];
  $("ipGrid").innerHTML = "<table class='tp'><tr>"
    + head.map(h => "<th>" + escText(h) + "</th>").join("") + "</tr>"
    + r.rows.slice(0, 14).map(x => "<tr>"
        + line(x).map(c => "<td>" + escText(c) + "</td>").join("") + "</tr>").join("")
    + "</table>"
    + (r.rows.length > 14 ? "<p class='hint'>ほか " + (r.rows.length - 14) + " 件</p>" : "");
}

function impPlanGo(){
  if(!impPlanRows || !impPlanRows.length) return;
  if(typeof isLocked === "function" && isLocked())
    return toast("この面はロックしてある。<b>直すには、上のロックを押す</b>");
  const done = r => {
    $("impPlanDlg").close();
    toast("<b>" + r.n + "件</b>を入れた"
        + (r.skip ? "（" + r.skip + "件は入れられなかった）" : ""));
    if(typeof redrawCenter === "function") redrawCenter(true);
  };
  if(impPlanKind === "tally") return done(impTallyApply(impPlanRows));
  /* 全校・学年は、ほかの先生の紙にも出る。**押す前に、範囲を言う** */
  askOk({
    title: impPlanRows.length + "件を全校・学年に入れますか",
    lines: ["<b>ここで入れたものは、当たるクラスぜんぶの紙に出ます。</b>",
            "同じ日・同じ校時に予定が入っているコマは、<b>これで上書きされます</b>"
            + "（前のものは、書いた人の画面に「上書きされました」と出ます）。",
            "入る先は、雛形の「対象」列のとおりです。"],
    goLabel: "入れる",
    onYes: () => impEvApply(impPlanRows, done)
  });
}
