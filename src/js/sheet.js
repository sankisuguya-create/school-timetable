/* 紙を描く。**ここで作った DOM だけが刷られる。** */

let selCell = null;   /* いま選んでいるコマ {d, s} */
/* いま打ち込んでいる欄。ここだけは塗り直しで上書きしない。
   「フォーカスされている欄は触らない」にすると、パレットやドラッグで値を変えても
   字が変わらず、入れた本人には反映されていないように見える。 */
let typing = null;

function buildSheet(){
  const sh = $("sheet");
  sh.textContent = "";
  /* 最後の行（週のメモ）に余りを渡す。渡さないと紙の下端に隙間が残る */
  sh.style.gridTemplateRows = "auto repeat(" + SLOTS.length + ",auto) 1fr";

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
  ft.addEventListener("input", () => { week().memo = clean(ft.innerHTML); save(); });

  paintSheet();
}

function weekendEl(cap, r1, r2){
  const e = el("div", "wk lastcol",
    "<div class='cap'>" + cap + "</div><div class='t' contenteditable></div>");
  e.style.gridColumn = "7";
  e.style.gridRow = r1 + " / " + (r2 + 1);
  const t = e.querySelector(".t");
  t.innerHTML = (week().weekend || {})[cap] || "";
  t.addEventListener("input", () => {
    const w = week();
    (w.weekend || (w.weekend = {}))[cap] = clean(t.innerHTML);
    save();
  });
  return e;
}

function cellEl(d, s){
  const e = el("div", "cell " + (s.kind === "lesson" ? "lesson" : "brk row-break"),
    "<span class='tag' hidden></span><div class='t' contenteditable></div>"
    + (s.kind === "lesson" ? "<div class='n' contenteditable></div>" : ""));
  e.dataset.d = d; e.dataset.s = s.id;
  const t = e.querySelector(".t"), n = e.querySelector(".n");

  const focus = () => selectCell(d, s.id, e);
  t.addEventListener("focus", focus);
  if(n) n.addEventListener("focus", focus);

  t.addEventListener("input", () => {
    typing = t;
    const sub = SUB_BY_NAME[plain(t.innerHTML).trim()];
    writeCell(d, s.id, {title:t.innerHTML, subject:sub ? sub.code : null});
    paintSheet(e); fillPanel(); typing = null;
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

/* 中身を流し込む。el を渡すとそのコマだけ塗り直す。 */
function paintSheet(one){
  const list = one ? [one] : [...document.querySelectorAll("#sheet .cell")];
  const mine = layerOf(), clashes = [];

  for(const e of list){
    const d = +e.dataset.d, s = e.dataset.s;
    const c = cellFor(d, s);
    const t = e.querySelector(".t"), n = e.querySelector(".n");

    /* 中身が変わったときだけ書き換える。同じ字を入れ直すとカーソルが先頭へ跳ぶ */
    const wantT = c.title || "", wantN = c.note || "";
    if(t !== typing && t.innerHTML !== wantT) t.innerHTML = wantT;
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

    if(c.clash) clashes.push({d, s, c});
  }
  if(!one) warnClashes(clashes);
}

/* 重なりの警告。**開いたとき1回だけ。** 毎回出る警告は読まれなくなる。 */
function warnClashes(list){
  if(!list.length) return;
  const w = week();
  const sig = c => viewName() + "|" + ck(c.d, c.s) + "|" + plain(c.c.title) + "|"
                 + c.c.clash.map(p => p.layer + ":" + plain(p.title)).join(",");
  const fresh = list.filter(c => w.acked.indexOf(sig(c)) < 0);
  if(!fresh.length) return;

  $("warnList").innerHTML = fresh.map(c => {
    const dt = addDays(monday, c.d), sl = SLOT_BY_ID[c.s];
    const prev = c.c.clash
      .map(p => LAYER_FULL[p.layer] + "「" + (escText(plain(p.title)) || "（空）") + "」")
      .join(" / ");
    return "<li>" + md(dt) + "(" + DOW[c.d] + ") " + sl.name
      + (sl.kind === "lesson" ? "校時" : "") + "　" + escText(viewName()) + "<br>"
      + "　出ていない予定：<b>" + prev + "</b><br>"
      + "　いま出ている：" + LAYER_FULL[c.c.layer]
      + "「" + (escText(plain(c.c.title)) || "（空）") + "」</li>";
  }).join("");
  const dlg = $("warnDlg");
  dlg.showModal();
  dlg.onclose = () => { fresh.forEach(c => w.acked.push(sig(c))); save(); };
}
