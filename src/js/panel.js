/* 右の入力パネル。パレット・中身・リンク・入れる先。 */

const cellAt = (d, s) =>
  document.querySelector("#sheet .cell[data-d='" + d + "'][data-s='" + s + "']");

/* ── パレット ────────────────────────────────
   コマへ引っぱって落とすと入る。選んでから押しても入る。
   打って変換して確定する3手が、つかんで落とす1手になる。 */
/* 学年・全学年からコマを取り消すためのしるし。教科と同じように引っぱって落とせる */
const PAL_CLEAR = "__clear";

function drawPalette(){
  const items = (view.kind === "special")
    ? allClasses().map(c => ({v:c, t:c, off:false}))
    : SUBJECTS.map(s => ({v:s.code, t:s.name, off:!s.count}));

  /* **学年・全学年には「リセット」を出す。**
     ここで入れたコマは全クラスに降りる。入れるのと同じ手数で取り消せないと、
     間違えて降ろしたものを1コマずつ空にして回ることになる。
     担任の画面には出さない（そちらは「上位に戻す」が同じ役をする）。 */
  const canClear = (view.kind === "grade" || view.kind === "school");
  if(canClear) items.push({v:PAL_CLEAR, t:"リセット", clear:true});

  $("pals").innerHTML = items.map(o =>
    "<button class='pal" + (o.off ? " off" : "") + (o.clear ? " clear" : "")
    + "' draggable='true'"
    + " data-v='" + escText(o.v) + "'>" + escText(o.t) + "</button>").join("");

  if(typeof applyLock === "function") setTimeout(applyLock, 0);
  $("palHint").innerHTML = (view.kind === "special")
    ? "コマへ<b>引っぱって入れる</b>。その時間に行くクラスを選ぶ。"
    : "コマへ<b>引っぱって入れる</b>。コマを選んでから押しても入る。"
      + (canClear ? "<br><b>リセット</b>を落とすと、そのコマをここから取り消す"
                  + "（各クラスの予定が出るようになる）。" : "");

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
   基本時間割を直すのはふだんの作業なので聞かない（→ compose.js の wouldOverwrite）。
   自分が入れたコマも聞かない。一度«上書きする»と答えたコマは、
   その画面を開いている間は聞き直さない。

   **編集そのものは止めない。** 止めると、担任が直せないコマができて、
   直せる人を探して回ることになる。止めるのではなく、既定を安全側に置く。 */
const askedCells = {};

/* 窓の返事を待つあいだ、答えを受け取る先。**Enter や Esc は「変更しない」。** */
let owAsk = null;
function whenLabel(d, sid){
  const dt = addDays(monday, d), sl = SLOT_BY_ID[sid];
  return md(dt) + "(" + DOW[d] + ") " + sl.name + (sl.kind === "lesson" ? "校時" : "");
}
function askOverwrite(when, to, hits, yes, no){
  owAsk = {yes, no, done:false};
  $("swWhen").textContent = when;
  $("swTo").textContent   = plain(to) || "（空）";
  $("swList").innerHTML = hits.map(h =>
    "<li><b>" + escText(h.cls) + "</b> の「" + (escText(h.from) || "（空）") + "」"
    + "<br><span class=\"who\">" + escText(h.layer)
    + (h.who ? "・" + escText(h.who) : "") + " が入れたもの</span></li>").join("");
  const dlg = $("swDlg");
  dlg.showModal();
  $("swNo").focus();                 /* **既定は「変更しない」。** */
}
/* 窓の返事を1回だけ流す。閉じ方（ボタン・Esc・外側）で取りこぼさない */
function owAnswer(yes){
  const a = owAsk;
  owAsk = null;
  if(!a || a.done) return;
  a.done = true;
  (yes ? a.yes : a.no)();
}

/* 聞かずに済むときは、その場で yes を呼んで true を返す。
   聞くときは false を返し、返事が出たあとで yes / no のどちらかを呼ぶ。 */
function okToOverwrite(d, sid, to, yes, no){
  yes = yes || function(){}; no = no || function(){};
  const hit = wouldOverwrite(d, sid);
  const key = viewName() + "|" + ck(d, sid);
  if(!hit.length || askedCells[key]){ yes(); return true; }
  askOverwrite(whenLabel(d, sid), to, hit,
               () => { askedCells[key] = true; yes(); }, no);
  return false;
}

function applyPalette(d, sid, v, e){
  if(typeof isLocked === "function" && isLocked()) return toast("この画面はロック中");
  /* リセット。**ここで入れたものを取り消すだけ。** 各クラスが自分で入れたものは消さない */
  if(v === PAL_CLEAR){
    const had = !!targetStore()[ck(d, sid)];
    writeCell(d, sid, {title:"", note:"", subject:null});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(had ? "このコマを" + viewName() + "から取り消した"
              : viewName() + "には、もともと入っていない");
    return;
  }
  if(view.kind === "special"){
    writeCell(d, sid, {cls:v});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(escText(v) + " へ行く時間にした");
    return;
  }
  const sub = SUB_BY_CODE[v];
  if(!sub) return;
  okToOverwrite(d, sid, sub.name, () => {
    writeCell(d, sid, {title:escText(sub.name), subject:sub.code});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(sub.name + " を入れた");
  });
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
  /* **いま書くとどこへ入るか（層）と、いま入っているものを誰が入れたか（人）。**
     前は層の名前しか出していなかったので、他人の予定かどうかが分からなかった。 */
  const who = whoName(c.by);
  $("pWho").textContent = viewName()
    + (c.layer === "base" ? "　いまは基本時間割のまま"
      : "　いま入っているのは " + (LAYER_FULL[c.layer] || "")
        + (who ? "・" + who : "") + " が入れたもの"
        + (isMe(c.by) ? "（自分）" : ""));

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
