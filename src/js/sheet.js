/* 紙を描く。**ここで作った DOM だけが刷られる。** */

let selCell = null;   /* いま選んでいるコマ {d, s} */
/* いま打ち込んでいる欄。ここだけは塗り直しで上書きしない。
   「フォーカスされている欄は触らない」にすると、パレットやドラッグで値を変えても
   字が変わらず、入れた本人には反映されていないように見える。 */
let typing = null;

function buildSheet(){
  const sh = $("sheet");
  sh.textContent = "";
  /* 紙の高さは決まっている。**余りをどの行に渡すかで、どこが広くなるかが決まる。**
     放課後（備考だけの行）があればそこに渡す。無ければ週のメモに渡す。
     どこにも渡さないと、紙の下端に隙間が残る。 */
  const after = SLOTS.filter(s => s.kind === "note").length > 0;
  sh.style.gridTemplateRows = "auto "
    + SLOTS.map(s => s.kind === "note" ? "1fr" : "auto").join(" ")
    + (after ? " auto" : " 1fr");

  const add = (node) => { sh.appendChild(node); return node; };
  add(el("div", "lab"));                                  /* 左上の角 */
  for(let d = 0; d < 5; d++){
    const dt = addDays(monday, d);
    add(el("div", "hd", "<span>" + md(dt) + "</span><span class='dow'>" + DOW[d] + "</span>"));
  }
  add(el("div", "hd sat lastcol", "<span class='dow'>土日</span>"));

  SLOTS.forEach((s, i) => {
    const lab = add(el("div", "lab" + (s.kind === "brk" ? " row-break" : ""),
      (s.kind === "lesson" ? "<span class='no'>" + s.name + "</span>"
                           : "<span>" + s.name + "</span>")
      + (s.time ? "<span class='tm'>" + s.time + "</span>" : "")));
    if(s.kind === "brk") lab.classList.add("row-break");
    for(let d = 0; d < 5; d++) add(cellEl(d, s));
    /* 土は上7行ぶん、日は下3行ぶん。日曜より土曜のほうが書くことが多い */
    if(i === 0) add(weekendEl("土", 2, 8));
    if(i === 7) add(weekendEl("日", 9, 11));
  });

  const foot = add(el("div", "foot lastcol",
    "<div class='lab'><span>週の</span><span>メモ</span></div>"
    + "<div class='t' contenteditable></div>"));
  const ft = foot.querySelector(".t");
  ft.innerHTML = week().memo || "";
  ft.addEventListener("input", () => {
    if(typeof isLocked === "function" && isLocked()) return;
    week().memo = clean(ft.innerHTML); save();
  });

  paintSheet();
  if(typeof applyLock === "function") applyLock();
}

function weekendEl(cap, r1, r2){
  const e = el("div", "wk lastcol",
    "<div class='cap'>" + cap + "</div><div class='t' contenteditable></div>");
  e.style.gridColumn = "7";
  e.style.gridRow = r1 + " / " + (r2 + 1);
  const t = e.querySelector(".t");
  t.innerHTML = (week().weekend || {})[cap] || "";
  t.addEventListener("input", () => {
    if(typeof isLocked === "function" && isLocked()) return;
    const w = week();
    (w.weekend || (w.weekend = {}))[cap] = clean(t.innerHTML);
    save();
  });
  return e;
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
    okToOverwrite(d, s.id, plain(t.innerHTML), put, undo);
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
function paintSheet(one){
  const list = one ? [one] : [...document.querySelectorAll("#sheet .cell")];
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
