/* 紙を描く。**ここで作った DOM だけが刷られる。** */

let selCell = null;   /* いま選んでいるコマ {d, s} */
/* いま打ち込んでいる欄。ここだけは塗り直しで上書きしない。
   「フォーカスされている欄は触らない」にすると、パレットやドラッグで値を変えても
   字が変わらず、入れた本人には反映されていないように見える。 */
let typing = null;

/* 行の高さ。**mm で決め打ちする。**
   `auto` にしてコマの高さから決めさせると、日ごとに別の格子（下の dayColEl）を
   敷いたときに、外の格子には高さを決める中身が無くなって行が潰れる。 */
const rowH = s => s.kind === "note"   ? "1fr"
                : s.kind === "lesson" ? "calc((var(--h-title) + var(--h-note))*var(--k))"
                                      : "calc(var(--h-break)*var(--k))";

/* 紙の組み方。**外は「見出し／本体／週メモ」の3行だけ。**
   本体の中は列ごとに別の格子で、そこで初めて時程の行が並ぶ。

   *行をまたぐ形にしなかった理由*：外の格子に11行を並べ、日の列でそれをまたぐと、
   **またいだ中身の高さが、またいだ先の `1fr`（放課後）の行に全部乗る。**
   実際に組んでみたら放課後が 200mm になり、紙が 412mm になった。
   列を1マスにすれば、またぐものが無くなる。

   *列ごとに格子を持たせる理由*：特別校時の日は朝学習の行が無い。
   外の行をずらす形にすると、朝学習の行に授業1コマが落ちてその行が
   6mm から 29mm に膨らみ、**ほかの5日ぶんも巻き添えで崩れる**
   （紙が 239.5mm → 295.2mm になり B5 に入らない。実測）。 */
/* 紙を1枚組む。**どこへ、どの週を描くかを渡せる。**
   月の面は同じものを4枚並べるので、組み立てを2つ持たない
   （2つ持つと、片方だけ直した版が出る）。
   渡さなければ、いつもの1枚（#sheet ・いま見ている週）。 */
function buildSheet(into, mon){
  const sh = into || $("sheet");
  /* **いま見ている週を、一時だけ差し替える。** 層の重ね方・行事・メモは
     すべて monday から決まるので、ここを動かせば中身がそろって動く */
  const keep = monday;
  if(mon) monday = mon;
  try{ buildSheet_(sh); } finally{ monday = keep; }
}
function buildSheet_(sh){
  sh.textContent = "";
  sh.style.gridTemplateRows = "auto 1fr auto";      /* 見出し／本体／週メモ */

  const put = (node, col, row) => {
    node.style.gridColumn = String(col);
    node.style.gridRow = String(row);
    sh.appendChild(node); return node;
  };
  put(el("div", "lab corner"), 1, 1);                       /* 左上の角 */

  for(let d = 0; d < DAYS; d++){
    const dt = addDays(monday, d), f = dayForm(d);
    /* **この日の形は、日付の見出しに印で出す。** 紙の上の情報なので刷っても残る */
    const hd = el("div", "hd" + (d === DAYS - 1 ? " sat lastcol" : ""),
      "<span>" + md(dt) + "</span><span class='dow'>" + DOW[d] + "</span>"
      + (f ? "<span class='mark'>" + DAY_FORM[f].mark + "</span>" : ""));
    hd.dataset.d = d;
    /* 年間行事のある日に、小さな印。**画面だけ**（紙には出さない）。
       紙に出すと、どの校時か決まっていないものが版面に居座る */
    if(hasEvents(d)) hd.classList.add("hasev");
    /* **決められるのは全学年の面だけ。** 効く範囲が全クラスなので、
       担任の画面から押せると、自分の学級を直したついでに全校が動く */
    if(view.kind === "school"){
      hd.classList.add("pick");
      hd.title = "この日の形を決める（全クラスに入る）";
      hd.addEventListener("click", () => openDayDlg(d));
    }
    put(hd, 2 + d, 1);
  }

  /* 時程の列。**ここだけは、いつも全部の行を並べる。**
     特別校時の日はこの見出しと合わなくなるが、合わせて行を抜くと
     ほかの5日ぶんが読めなくなる（横に読む紙なので、多数派に合わせる） */
  const labs = put(el("div", "labcol"), 1, 2);
  labs.style.gridTemplateRows = SLOTS.map(rowH).join(" ");
  for(const s of SLOTS){
    const lab = el("div", "lab" + (s.kind === "brk" ? " row-break" : ""),
      (s.kind === "lesson" ? "<span class='no'>" + s.name + "</span>"
                           : "<span>" + s.name + "</span>")
      + (s.time ? "<span class='tm'>" + s.time + "</span>" : ""));
    labs.appendChild(lab);
  }

  for(let d = 0; d < DAYS; d++) put(dayColEl(d), 2 + d, 2);

  const foot = put(el("div", "foot",
    "<div class='lab'><span>週の</span><span>メモ</span></div>"
    + "<div class='t' contenteditable></div>"), "1 / 8", 3);
  const ft = foot.querySelector(".t");
  /* **週メモは画面（学級）ごとに持ち、シートへも送る**（compose.js の setMemo）。
     前は週にひとつしか無く、この端末にしか残らなかったので、
     3-1 で書いたメモが 3-2 の紙にも出て、ほかの先生には見えなかった */
  ft.innerHTML = memoOf() || "";
  ft.addEventListener("input", () => {
    if(typeof isLocked === "function" && isLocked()) return;
    setMemo(ft.innerHTML);
  });

  paintSheet(null, sh);
  if(typeof applyLock === "function") applyLock();
}

/* 1日ぶんの列。**この列だけの行の並びを持つ。**
   特別校時の日は朝学習を抜く。抜いたぶんの 6mm は、いちばん下の
   `1fr`（放課後）が受け取るので、紙の高さは変わらない。 */
function dayColEl(d){
  const f = dayForm(d);
  const shown = SLOTS.filter(s => slotShown(d, s));
  const col = el("div", "daycol" + (d === DAYS - 1 ? " lastcol" : "")
                      + (f ? " form-" + f : ""));
  col.dataset.d = d;
  col.style.gridTemplateRows = shown.map(rowH).join(" ");
  /* **1つずつ置く場所を書く。** 下の斜め線が場所を先に取るので、
     自動で並べさせると、そこを避けたぶんだけ行が増える（実際に8行増えた） */
  shown.forEach((s, i) => {
    const c = cellEl(d, s);
    c.style.gridColumn = "1";
    c.style.gridRow = String(i + 1);
    col.appendChild(c);
  });

  /* **休みの日は 1〜6 を1本の斜め線で消す。**
     コマごとに引くと、業間と昼休みの行で線が切れて「1〜4だけ休み」に見える。
     線は図形で描く（背景の色は、トナーを節約する設定のプリンタで消える）。 */
  if(f === "off"){
    let a = -1, b = -1;
    shown.forEach((s, i) => { if(s.kind === "lesson"){ if(a < 0) a = i; b = i; } });
    if(a >= 0){
      const ov = el("div", "dayoff", SLASH_SVG);
      ov.style.gridColumn = "1";
      ov.style.gridRow = (a + 1) + " / " + (b + 2);
      col.appendChild(ov);
    }
  }
  return col;
}

function cellEl(d, s){
  /* lesson は題名＋備考、note は**備考だけ**（放課後）、brk は題名だけ */
  const kls = s.kind === "lesson" ? "lesson" : s.kind === "note" ? "note row-break"
                                             : "brk row-break";
  const e = el("div", "cell " + kls,
    "<span class='tag' hidden></span>"
    + (s.kind === "note" ? "" : "<div class='t' contenteditable></div>")
    + (s.kind === "lesson" || s.kind === "note"
         ? "<div class='n' contenteditable></div>" : ""));
  e.dataset.d = d; e.dataset.s = s.id;
  /* **休みの日の授業には書かせない。** 斜め線を引いた欄に字が入ると、
     刷った紙で「休みなのか、授業があるのか」が読めなくなる */
  if(isDayOff(d) && s.kind === "lesson") e.classList.add("off");
  const t = e.querySelector(".t"), n = e.querySelector(".n");

  const focus = () => selectCell(d, s.id, e);
  if(t) t.addEventListener("focus", focus);
  if(n) n.addEventListener("focus", focus);

  if(t) t.addEventListener("input", () => {
    /* 打ち始めた1打目で聞く。**「変更しない」なら打った字ごと元に戻す。** */
    const put = () => {
      typing = t;
      const sub = SUB_BY_NAME[plain(t.innerHTML).trim()];
      writeCell(d, s.id, {title:t.innerHTML, subject:sub ? sub.code : null});
      paintSheet(e); fillPanel(); typing = null;
    };
    const undo = () => {
      t.innerHTML = (cellFor(d, s.id).title || "");
      typing = null; paintSheet(); fillPanel();
    };
    /* 専科の週では、打った字が「行き先のクラス」。潰す相手はその学級 */
    okToOverwrite(d, s.id, plain(t.innerHTML), put, undo,
                  view.kind === "special" ? normCls(plain(t.innerHTML)) : undefined);
  });
  if(n) n.addEventListener("input", () => {
    typing = n;
    writeCell(d, s.id, {note:n.innerHTML});
    paintSheet(e); fillPanel(); typing = null;
  });

  /* 教科を引っぱって入れる */
  e.addEventListener("dragover", ev => { ev.preventDefault(); e.classList.add("drop"); });
  e.addEventListener("dragleave", () => e.classList.remove("drop"));
  e.addEventListener("drop", ev => {
    ev.preventDefault(); e.classList.remove("drop");
    const v = ev.dataTransfer.getData("text/x-timetable");
    if(v) applyPalette(d, s.id, v, e);
  });
  return e;
}

/* ── 枠に合わせて字を縮める ────────────────────
   授業名は**枠いっぱいまで大きく**する。そのままでは「クラブ活動」のような
   長い名前がはみ出すので、はみ出すコマだけ、そのコマの中で縮める。

   全部を同じ大きさに合わせない。**いちばん長い名前に全部を合わせると、
   「国語」まで小さくなる。** 紙に載っているコマの大半は2文字で、
   そこが読めることのほうが、大きさがそろっていることより効く。

   測るのと書くのを分ける。1コマずつ「書いて測って」を繰り返すと、
   そのたびにブラウザが並べ直す（55コマで55回）。 */
const FIT_MIN = 0.45;      /* これ以上は縮めない。読めなくなる */

function fitTitles(els){
  if(!els.length) return;
  /* **刷ったときの列の幅で測る。** 画面の時程の列は時刻を出すぶん広く、
     刷るときは狭い（そのぶん曜日の列が広い）。画面の幅で決めると、
     刷ったときに入るはずの字まで小さくなる。紙が正本。 */
  const sh = $("sheet");
  const had = sh.style.getPropertyValue("--labw");
  sh.style.setProperty("--labw", getComputedStyle(sh).getPropertyValue("--labw-print"));

  for(let pass = 0; pass < 2; pass++){
    const want = [];
    for(const t of els){
      if(!t.firstChild) continue;                 /* 空のコマはそのまま */
      const cs = getComputedStyle(t);
      const availW = t.clientWidth
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = t.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if(availW <= 0 || availH <= 0) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      const box = r.getBoundingClientRect();
      if(!box.width || !box.height) continue;
      const cur = +(t.style.getPropertyValue("--fit") || 1);
      /* いまの大きさで、入るかどうか。入るなら1まで戻す（縮めっぱなしにしない） */
      const s = Math.min(1, cur * Math.min(availW / box.width, availH / box.height));
      want.push([t, Math.max(FIT_MIN, s)]);
    }
    let moved = false;
    for(const [t, s] of want){
      const cur = +(t.style.getPropertyValue("--fit") || 1);
      if(Math.abs(cur - s) > 0.01){ t.style.setProperty("--fit", s); moved = true; }
    }
    if(!moved) break;      /* 落ち着いたら、2度目は測らない */
  }
  if(had) sh.style.setProperty("--labw", had); else sh.style.removeProperty("--labw");
}

/* 中身を流し込む。el を渡すとそのコマだけ塗り直す。 */
/* root を渡すと、その紙の中だけを塗り直す。**月の面は紙が4枚ある。**
   渡さなければ、いつもの1枚（#sheet）。 */
function paintSheet(one, root){
  const list = one ? [one]
    : [...(root || document.getElementById("sheet")).querySelectorAll(".cell")];
  const mine = layerOf();

  for(const e of list){
    const d = +e.dataset.d, s = e.dataset.s;
    const c = cellFor(d, s);
    const t = e.querySelector(".t"), n = e.querySelector(".n");

    /* 中身が変わったときだけ書き換える。同じ字を入れ直すとカーソルが先頭へ跳ぶ */
    const wantT = c.title || "", wantN = c.note || "";
    if(t && t !== typing && t.innerHTML !== wantT) t.innerHTML = wantT;
    if(n && n !== typing && n.innerHTML !== wantN) n.innerHTML = wantN;

    e.dataset.layer = c.layer;
    e.classList.toggle("from-base", c.layer === "base");
    e.classList.toggle("upper", RANK[c.layer] > RANK[mine] && !c.clash);
    e.classList.toggle("clash", !!c.clash);

    const tag = e.querySelector(".tag");
    let name = c.clash ? "！重なり" : LAYER_NAME[c.layer];
    if(c.over && c.over.length) name = c.over.join("・") + " が変更";
    tag.hidden = !name;
    tag.textContent = name;

  }
  /* **書き終えてから、まとめて測る。** 1コマずつだと並べ直しが55回になる */
  fitTitles(list.map(e => e.querySelector(".t")).filter(Boolean));
  if(!one) warnOverwritten();
}

/* **自分の予定が上書きされていたら、開いたときに知らせる。**
   自分に関係のない層どうしの重なりは出さない（読まれない警告は機能しない）。
   同じ上書きについては1回だけ。中身が変わったら出し直す。 */
function warnOverwritten(){
  const list = overwrittenHere();
  if(!list.length) return;
  const w = week();
  const sig = x => [viewName(), x.d, x.s, x.cls, x.from, x.to].join("|");
  const fresh = list.filter(x => w.acked.indexOf(sig(x)) < 0);
  if(!fresh.length) return;

  $("owList").innerHTML = fresh.map(x => {
    const dt = addDays(monday, x.d), sl = SLOT_BY_ID[x.s];
    const when = md(dt) + "(" + DOW[x.d] + ") " + sl.name + (sl.kind === "lesson" ? "校時" : "");
    const who  = (view.kind === "class") ? "" : escText(x.cls) + " の ";
    return "<li>" + who + "<b>" + when + "</b> が "
      + "<s>" + (escText(x.from) || "（空）") + "</s> → <b>" + (escText(x.to) || "（空）")
      + "</b> に上書きされました<br><span class=\"who\">" + escText(x.by) + "が入れたもの</span></li>";
  }).join("");
  const dlg = $("owDlg");
  dlg.showModal();
  dlg.onclose = () => { fresh.forEach(x => w.acked.push(sig(x))); save(); };
}

/* ── 月の面 ──────────────────────────────────
   **4週ぶんを 2×2 に並べて、B4 に1枚で刷る。**

   週の紙は1枚ずつ見るためのもので、月のつながりが見えない。
   単元の配当・行事の重なり・専科の巡りは、4週を並べて初めて分かる。

   組み立ては週の紙と同じ buildSheet を使う（2つ持つと、片方だけ直した版が出る）。
   詰めるのは高さだけ ── 詳細と放課後と週メモを薄くして、授業名を残す。

   **転がさずに1画面へ収める。** 収まらなければ紙にもならない。
   4枠のうち1枠の大きさを測って、入るところまで --k を下げる。 */
const MONTH_WEEKS = 4;
let mMonday = null;               /* 月の面の左上の週。いま見ている週から始める */

const mWeeks = () => {
  const out = [];
  for(let i = 0; i < MONTH_WEEKS; i++) out.push(addDays(mMonday, i * 7));
  return out;
};

function openMonth(){
  if(view.kind !== "class" && view.kind !== "grade"
     && view.kind !== "school" && view.kind !== "special")
    return toast("クラスや学年を開いてから押す");
  mMonday = new Date(monday);
  showMonth(true);
  drawMonth();
}
function showMonth(on){
  $("monthView").hidden = !on;
  $("stage").hidden = on;
  document.querySelector(".panel").hidden = on;
  document.querySelector(".work").classList.toggle("no-panel", on);
  if(!on){ refreshWeek(); autoFit(); }
}
function drawMonth(){
  const ws = mWeeks();
  $("mTitle").textContent = viewName() + "　"
    + md(ws[0]) + " → " + md(addDays(ws[MONTH_WEEKS - 1], 5));
  $("mHint").innerHTML = "いま見ている週から <b>" + MONTH_WEEKS + "週間</b>。"
    + "左上から右へ、上の段・下の段の順に並びます。"
    + "<b>詳細と放課後は薄くしてあります</b>（4枚を1枚に収めるため）。"
    + "直すのは週の紙のほうで。ここは見るだけです。";
  for(let i = 0; i < MONTH_WEEKS; i++) buildSheet($("mS" + i), ws[i]);
  fitMonth();
  /* **まだ読んでいない週は、読んでから描き直す。** 先に描いておくのは、
     待っているあいだ何も出ない時間を作らないため（週の紙と同じ作り） */
  const w = Wait.begin("4週ぶんを読んでいます");
  Backend.readWeeks(ws.map(iso), () => {
    Wait.end(w);
    if($("monthView").hidden) return;
    for(let i = 0; i < MONTH_WEEKS; i++) buildSheet($("mS" + i), ws[i]);
    fitMonth();
  });
}

/* 1枠に入るところまで --k を下げる。**測って決める。**
   行の高さは mm で書いてあるが、字の回り込みまでは式で出せない。
   2〜3回測れば、たいてい 1% 以内に入る。

   cell を渡すと、その大きさの枠に合わせる（刷るときは mm で渡す）。
   **刷るときに画面の px で測らない。** 画面の広さと紙の広さは別もので、
   画面に合わせた倍率のまま刷ると、紙からはみ出すか、すかすかになる。 */
const M_GAP = 6;                 /* 枠と枠のすきま（画面は px・紙は mm） */
/* B4 のよこ。**CSS の B4 とは書かない**（週の紙の B5 と同じ理由）。
   364×257mm から余白と、まん中のすきまを引いた1枠 */
const M_PAGE = {w:364, h:257, mg:6};
function mCellMM(){
  return {w: (M_PAGE.w - M_PAGE.mg * 2 - M_GAP) / 2 + "mm",
          h: (M_PAGE.h - M_PAGE.mg * 2 - M_GAP) / 2 + "mm"};
}
function fitMonth(cell){
  const box = $("mPaper"), one = $("mS0");
  if(!box || !one) return;
  const c = cell || {w: ((box.clientWidth  - M_GAP) / 2) + "px",
                     h: ((box.clientHeight - M_GAP) / 2) + "px"};
  if(!cell && (box.clientWidth < 2 || box.clientHeight < 2)) return;
  /* **枠の大きさを、並べ方の側にも入れる。**
     1fr のままだと、刷るときに画面の広さで割った幅に押し戻される
     （紙は 352mm なのに、画面の 1500px を割った幅で組まれる）。 */
  if(cell){
    box.style.gridTemplateColumns = "repeat(2," + c.w + ")";
    box.style.gridTemplateRows    = "repeat(2," + c.h + ")";
    /* **入れものにも幅を持たせる。** 持たせないと画面の幅いっぱいに広がり、
       紙からはみ出したぶんが切られる（右半分が出ない） */
    box.style.width = "calc(" + c.w + "*2 + " + M_GAP + "mm)";
  }else{
    box.style.removeProperty("grid-template-columns");
    box.style.removeProperty("grid-template-rows");
    box.style.removeProperty("width");
  }
  let k = 1;
  for(let pass = 0; pass < 4; pass++){
    for(let i = 0; i < MONTH_WEEKS; i++){
      const s = $("mS" + i);
      s.style.setProperty("--pw", c.w);
      s.style.setProperty("--ph", c.h);
      s.style.setProperty("--pm", "0px");
      s.style.setProperty("--k", String(k));
    }
    /* **枠そのものの高さと比べる。** 紙のほうは枠が mm で決まっていて、
       中身がそれを超えても紙は伸びない（超えたぶんが次のページへ落ちる）。
       中身の高さどうしを比べると、超えていることに気づけない。 */
    const rows = getComputedStyle(box).gridTemplateRows.split(" ");
    const want = parseFloat(rows[0]) || one.clientHeight;
    const have = one.scrollHeight;
    if(want < 2) return;
    if(have <= want + 0.5) break;
    k = Math.max(.2, k * (want / have) * .99);
  }
}
