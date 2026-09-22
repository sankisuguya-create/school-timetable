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
                          {year:fy(), week:wkKey()}, wasT);
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
      + "丸ごと貼り戻してください。埋めなかった行は入りません。";
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
  const r = impPlanKind === "tally" ? impTallyRead(impTallyGrid())
                                    : impEvRead($("ipText").value);
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
