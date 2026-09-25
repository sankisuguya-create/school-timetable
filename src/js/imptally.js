/* ==================================================================
   imptally.js — 時数表の取り込み（表 → 学年の各クラスのコマへ）

   週案の型に合わせた時数表を貼って、その週のコマに入れる。
   貼った表に載っている学年のクラスぜんぶの行が、そのクラスの担任の層へ
   ふだんの書き込みと同じ「未保存」の形で入る。
   （窓と取り込みの切り替えは impplan.js、行事計画は impevent.js に）
================================================================== */

const impTallySlots = () => SLOTS.filter(s => s.kind === "lesson");

/* 取り込む表の1日ぶんの行は、**その学年のクラスが上から並んだもの**。
   時数表は学年ごとに分かれているので、開いているクラスの学年の編成から引く
   （手で決める並びは「時数をコピー」のほうのもの） */
function impTallyList_(){
  const g = view.kind === "class" ? gradeOf(view.cls) : "";
  const l = g ? classesOfGrade(g) : [];
  return l.length ? l : tallyClasses();
}

/* 1日ぶんの行の数。**窓の中で選べる（既定はその学年のクラス数）** ──
   時数表の日付のセルは、その学年のクラスのぶんだけ縦につながっているのが普通。
   学年の表で違うので、手で変えたぶんは学年ごとに覚える */
function impTallyBlock_(){
  const s = $("ipBlock"), v = s && +s.value;
  if(v >= 1) return Math.min(7, Math.max(1, v));
  const g = gradeOf(view.cls), st = db.settings.tally.impBlock || {};
  return Math.min(7, Math.max(1, +st[g] || classesOfGrade(g).length || 3));
}

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
  return {width, bySlot, block: impTallyBlock_(), list: impTallyList_()};
}

/* 「今の週案を表に入れる」の中身。**窓の形**（1日ぶんの行の数・
   その学年のクラスの並び）に合わせて出す ──「時数をコピー」の矩形とは
   組み方が違うので、こちら専用に組む */
function impTallyTemplate(){
  const g = impTallyCols(), t = db.settings.tally;
  const rows = [];
  for(let d = 0; d < WEEKDAYS; d++) for(let r = 0; r < g.block; r++){
    const line = new Array(g.width).fill("");
    /* **休みの日は数えない**（tallyGrid と同じ決まり） */
    if(r < g.list.length && !isDayOff(d)){
      for(const s of SLOTS){
        if(!(s.id in t.cols)) continue;
        /* 特別校時の日は朝学習が無い。紙に出ていないものを数えない */
        if(!slotShown(d, s)) continue;
        const sub = countSub(compose(g.list[r], d, s.id));
        line[t.cols[s.id]] = sub ? sub.short : "";
      }
    }
    rows.push(line);
  }
  return rows;
}

/* いま開いているクラスが、1日の塊の何行目か。無ければ -1 */
const impTallyRow = () => impTallyCols().list.indexOf(view.kind === "class" ? view.cls : "");

/* 読む。戻すのは {rows, warn}。rows は [{cls, d, slot, sub, mark}]。
   **学年の各クラスの行を全部読む**（時数表は学年ごとの表なので、
   開いているクラスの行だけだと、ほかのクラスのぶんが捨てられる） */
function impTallyRead(grid){
  const g = impTallyCols();
  const at = impTallyRow();
  if(view.kind !== "class")
    return {warn:"<b>クラスを開いてから取り込みます。</b>"};
  if(at < 0)
    return {warn:"<b>" + escText(view.cls) + " が学年の編成に入っていません。</b>"
          + "どの行がこのクラスかを決められないので、取り込めません。<br>"
          + "設定の「クラス・専科」で編成を確かめてください。"};
  if(at >= g.block)
    return {warn:"<b>このクラスは、1日 " + g.block + " 行の並びに入っていません"
          + "（" + (at + 1) + " 行目です）。</b>"
          + "「1日ぶんの行の数」を増やすか、貼る表を確かめてください。"};
  if(grid.length < WEEKDAYS * g.block)
    return {warn:"<b>行が足りません。</b>"
          + (WEEKDAYS * g.block) + " 行（" + WEEKDAYS + "日 × 1日 " + g.block + "行）が要ります。"
          + "今 " + grid.length + " 行です。"};

  const out = [], unknown = {}, noread = [];
  /* 1日の塊の、上から r 行目がその学年の r 番目のクラス。
     行の数を超えたクラスは表に乗らないので、名指しで言う */
  for(let r = 0; r < g.list.length; r++){
    if(r >= g.block){ noread.push(g.list[r]); continue; }
    const cls = g.list[r];
    for(let d = 0; d < WEEKDAYS; d++){
      const line = grid[d * g.block + r] || [];
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
        const now = compose(cls, d, sl.id);
        const nowT = plain(now.title).trim();
        const nowMark = !nowT ? "" : nowT === NO_LESSON ? "／"
                                   : shortOf(now.subject, now.title, now.short);
        if(impNorm(nowMark) === v) continue;               /* すでに同じ */
        if(v === "／" || v === "/"){
          out.push({cls, d, slot:sl.id, sub:null, mark:NO_LESSON});
          continue;
        }
        const sub = impSubject(v);
        if(!sub){ unknown[v] = (unknown[v] || 0) + 1; continue; }
        out.push({cls, d, slot:sl.id, sub, mark:sub.name});
      }
    }
  }
  const un = Object.keys(unknown);
  /* **変わっていなければ、何も入れないと言う。** 0件のまま黙って閉じると、
     「入ったのか、入らなかったのか」が分からない */
  if(!out.length && !un.length && !noread.length)
    return {rows:out, warn:"<b>今の週案と同じでした。</b>変わった欄がありません。"};
  const warn = [];
  if(un.length)
    warn.push("<b>読めない字がありました：</b>" + escText(un.join("・"))
            + "<br>その欄は入れません。教科の1文字か教科名で書いてください"
            + "（設定の「教科の表し方」で、どの1文字を使うかみられます）。");
  if(noread.length)
    warn.push("<b>" + escText(noread.join("・")) + " の行は表に入っていません</b>"
            + "（1日 " + g.block + " 行まで）。"
            + "「1日ぶんの行の数」を増やすと入ります。");
  return {rows:out, warn: warn.join("<br>")};
}

/* **他クラスのぶんも、ふだんの書き込みと同じ形で入れる。**
   writeCell は開いているクラスしか書かないので、学年のほかのクラスへは
   ここで同じ決まりを回す（いま出ているものを引き継いでから直す・
   消えたなら行を消す・サーバには cellChanged で届ける） */
function impWriteCls_(cls, d, s, patch){
  const w = week(), key = ck(d, s);
  const st = w.home[cls] || (w.home[cls] = {});
  const cur = compose(cls, d, s);
  const was = (st[key] || {}).sat || 0;
  const wasT = plain((st[key] || {}).title);
  const e = st[key] || {
    title:   cur.title || "",
    note:    cur.note  || "",
    subject: cur.subject || null,
    short:   cur.short || "",
    u:       cur.u || ""
  };
  if("title"   in patch) e.title   = clean(patch.title);
  if("subject" in patch) e.subject = patch.subject;
  e.by = myEmail();
  e.at = Date.now();
  if(isEmptyCell(e)) delete st[key]; else { e.sat = was; st[key] = e; }
  Backend.cellChanged("home", cls, d, s, was, undefined, wasT);
  return save();
}

/* **学年の各クラスの週を読んでおく。** 他クラスのコマと照合するので、
   読んでいないと「いまと同じ」の区別が付かず、物差し（sat）も 0 で送って
   競合してしまう。読みずみのぶんはもう一度読みに行かない */
function impTallyEnsureGrade_(after){
  if(!Backend.isGas()) return after();
  const g = impTallyCols();
  const want = targetsForView()
    .concat(g.list.map(c => ({layer:"home", target:c})));
  Backend.readWeeks([wkKey()], after, want);
}

/* 入れる。**学年の各クラスの、担任の層**。
   書き込みは writeCell の1本道を通す ── ロック・休みの日・undo・
   サーバへの知らせが、ふだんの打鍵とまったく同じになる。
   開いているクラスは writeCell（undo が効く）、ほかのクラスは
   impWriteCls_ で同じ決まりを回す。
   **入るのは未保存の形** ── cellChanged で控えに入り、あとの保存・
   週送りでふだんどおり届く（競合もふだんどおりに聞く） */
function impTallyApply(rows){
  if(view.kind !== "class") return toast("クラスを開いてから取り込む");
  const keep = scope;
  let n = 0, skip = 0;
  try{
    scope = "self";                 /* 入れる先は、各クラスの担任の層 */
    for(const r of rows){
      if(whyCantWrite(r.d, r.slot)){ skip++; continue; }
      const patch = r.sub ? {title:escText(r.sub.name), subject:r.sub.code}
                          : {title:escText(NO_LESSON), subject:null};
      const ok = r.cls === view.cls
        ? writeCell(r.d, r.slot, patch)
        : impWriteCls_(r.cls, r.d, r.slot, patch);
      if(ok) n++; else skip++;
    }
  } finally{ scope = keep; }
  buildSheet();
  return {n, skip};
}

/* ── 窓の中のマス目の表（時数表のほう）────────────────
   **貼る先をそのまま見せる。** スプレッドシートを開かずに済む。

   左の2列は目じるし（曜日・クラス）。触れない。
   右のマスが中身で、1マスが1校時ぶん。**いま開いているクラスの行に印**を付ける
   ── 入るのは学年の各クラスの行ぜんぶだが、自分の行がどこかは見て分かるように。 */
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

