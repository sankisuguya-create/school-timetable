/* 右の入力パネル。パレット・中身・リンク・入れる先。 */

const cellAt = (d, s) =>
  document.querySelector("#sheet .cell[data-d='" + d + "'][data-s='" + s + "']");

/* ── パレット ────────────────────────────────
   コマへ引っぱって落とすと入る。選んでから押しても入る。
   打って変換して確定する3手が、つかんで落とす1手になる。 */
function drawPalette(){
  const items = (view.kind === "special")
    ? allClasses().map(c => ({v:c, t:c, off:false}))
    : SUBJECTS.map(s => ({v:s.code, t:s.name, off:!s.count}));

  $("pals").innerHTML = items.map(o =>
    "<button class='pal" + (o.off ? " off" : "") + "' draggable='true'"
    + " data-v='" + escText(o.v) + "'>" + escText(o.t) + "</button>").join("");

  $("palHint").innerHTML = (view.kind === "special")
    ? "コマへ<b>引っぱって入れる</b>。その時間に行くクラスを選ぶ。"
    : "コマへ<b>引っぱって入れる</b>。コマを選んでから押しても入る。";

  for(const b of $("pals").querySelectorAll(".pal")){
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-timetable", b.dataset.v);
      ev.dataTransfer.effectAllowed = "copy";
      b.classList.add("drag");
    });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.addEventListener("click", () => {
      if(!selCell) return toast("先にコマを選ぶ");
      applyPalette(selCell.d, selCell.s, b.dataset.v);
    });
  }
}

/* 書く前に一度だけ聞く。**別の人の予定を潰すときだけ。**
   基本時間割を直すのはふだんの作業なので聞かない。
   一度«はい»と答えたコマは、その画面を開いている間は聞き直さない。 */
const askedCells = {};
function okToOverwrite(d, sid, to){
  const hit = wouldOverwrite(d, sid);
  if(!hit.length) return true;
  const key = viewName() + "|" + ck(d, sid);
  if(askedCells[key]) return true;
  const dt = addDays(monday, d), sl = SLOT_BY_ID[sid];
  const when = md(dt) + "(" + DOW[d] + ") " + sl.name + (sl.kind === "lesson" ? "校時" : "");
  const lines = hit.map(h => "　" + h.cls + " の「" + h.from + "」（" + h.by + "）");
  const yes = confirm(
    when + "\n\n次の予定を「" + (plain(to) || "（空）") + "」に上書きします。\n\n"
    + lines.join("\n") + "\n\nつづけますか？");
  if(yes) askedCells[key] = true;
  return yes;
}

function applyPalette(d, sid, v, e){
  if(view.kind === "special"){
    writeCell(d, sid, {cls:v});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(escText(v) + " へ行く時間にした");
    return;
  }
  const sub = SUB_BY_CODE[v];
  if(!sub) return;
  if(!okToOverwrite(d, sid, sub.name)) return;
  writeCell(d, sid, {title:escText(sub.name), subject:sub.code});
  paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
  toast(sub.name + " を入れた");
}

/* ── 選ぶ ────────────────────────────────────── */

function selectCell(d, sid, e){
  for(const x of document.querySelectorAll("#sheet .cell.sel")) x.classList.remove("sel");
  if(e) e.classList.add("sel");
  selCell = {d, s:sid};
  scope = "self";        /* 選ぶたびに戻す。持ち越すと黙って全校へ広がる */
  fillPanel();
}
function clearSelection(){
  for(const x of document.querySelectorAll("#sheet .cell.sel")) x.classList.remove("sel");
  selCell = null;
  fillPanel();
}

/* ── パネルの中身 ────────────────────────────── */

function fillPanel(){
  $("noSel").hidden  = !!selCell;
  $("hasSel").hidden = !selCell;
  if(!selCell) return;

  const slot = SLOT_BY_ID[selCell.s], dt = addDays(monday, selCell.d);
  const c = cellFor(selCell.d, selCell.s);

  $("pWhere").textContent = md(dt) + "(" + DOW[selCell.d] + ") "
    + slot.name + (slot.kind === "lesson" ? "校時" : "")
    + (slot.time ? "　" + slot.time : "");
  $("pWho").textContent = viewName();

  const t = $("pTitle"), n = $("pNote");
  if(t !== typing && t.innerHTML !== (c.title || "")) t.innerHTML = c.title || "";
  if(n !== typing && n.innerHTML !== (c.note  || "")) n.innerHTML = c.note  || "";
  /* lesson は題名＋備考、note（放課後）は**備考だけ**、brk は題名だけ */
  $("pNoteWrap").hidden   = slot.kind === "brk";
  $("pTitleWrap").hidden  = slot.kind === "note";
  $("pTitleLabel").textContent =
    view.kind === "special" ? "行き先のクラス" : "教科名・行事名";

  /* リンクは1コマにいくつでも */
  const ls = linksIn(c.title).map(x => Object.assign({f:"title"}, x))
       .concat(linksIn(c.note ).map(x => Object.assign({f:"note" }, x)));
  $("pLinks").innerHTML = ls.map((x, i) =>
    "<div class='lrow'><b>" + escText(x.text) + "</b>"
    + "<span>" + escText(x.href) + "</span>"
    + "<button data-i='" + i + "' title='リンクを外す'>外す</button></div>").join("");
  $("pLinkHint").innerHTML = ls.length
    ? "紙の上でも<b>その文字を押すと開く</b>。刷ると下線だけが残る。"
    : "欄の中で<b>文字を選んでから</b>下のボタンを押す。1つのコマにいくつでも付く。";
  for(const b of $("pLinks").querySelectorAll("button")){
    b.onclick = () => {
      const x = ls[+b.dataset.i];
      writeCell(selCell.d, selCell.s, x.f === "title"
        ? {title: dropLink(c.title, x.href, x.text)}
        : {note:  dropLink(c.note,  x.href, x.text)});
      paintSheet(); fillPanel();
    };
  }

  /* 入れる先。クラスを開いているときだけ選べる */
  const isClass = view.kind === "class";
  $("pScopeWrap").hidden = !isClass;
  if(isClass){
    const g = gradeOf(view.cls);
    $("pScope").innerHTML = [
      ["self",  "この学級のみ（" + view.cls + "）"],
      ["grade", "この学年に反映（" + g + "年の全クラス）"],
      ["school","全校に反映（全クラス）"]
    ].map(([v, label]) =>
      "<label><input type='radio' name='sc' value='" + v + "'"
      + (scope === v ? " checked" : "") + "> " + escText(label) + "</label>").join("");
    for(const r of $("pScope").querySelectorAll("input")) r.onchange = () => { scope = r.value; };
  }

  $("pAll").hidden    = slot.kind !== "brk";
  $("pRevert").hidden = !(isClass && (week().home[view.cls] || {})[ck(selCell.d, selCell.s)]);
}

/* ── リンクを付ける ─────────────────────────── */

let lastRange = null;   /* 直前に選んだ文字の範囲。ボタンを押すときに使う */

function addLinkToSelection(){
  if(!selCell) return;
  if(!lastRange || lastRange.collapsed)
    return toast("先に<b>リンクにしたい文字を選ぶ</b>。選んでからここを押す");

  const host = lastRange.commonAncestorContainer;
  const box  = (host.nodeType === 1 ? host : host.parentElement);
  const fld  = box && box.closest && box.closest("#sheet .t, #sheet .n, .fld");
  if(!fld) return toast("題名か詳細の欄の中で文字を選ぶ");

  const url = prompt("リンク先のURL", "https://");
  if(!url) return;
  if(!/^https?:\/\//i.test(url.trim())) return toast("URL は https:// から始める");

  const sel = document.getSelection();
  sel.removeAllRanges(); sel.addRange(lastRange);
  document.execCommand("createLink", false, url.trim());

  const isNote = fld.id === "pNote" || fld.classList.contains("n");
  writeCell(selCell.d, selCell.s, isNote ? {note:fld.innerHTML} : {title:fld.innerHTML});
  paintSheet(); fillPanel();
  toast("リンクを付けた。<b>その文字を押すと開く</b>");
}
