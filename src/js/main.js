/* 起動と結線。ここだけが DOM のイベントを束ねる。 */

/* ── 合図 ────────────────────────────────────── */
let toastT = 0;
function toast(msg){
  clearTimeout(toastT);
  const t = $("toast");
  t.innerHTML = msg; t.hidden = false;
  toastT = setTimeout(() => { t.hidden = true; }, 4200);
}

/* ── 保存 ────────────────────────────────────
   **打つたびにシートへ書かない。** 1コマぶんの打鍵が何十件にもなる。
   書いたコマの「場所」だけを覚えておいて、ここで1コマ1件にまとめて送る。
   手元（この端末）には打つたびに残しているので、押し忘れても消えない。 */

let saveState = {n:0, err:"", busy:false};

function paintSave(){
  const b = $("saveBtn"), t = $("saveTxt");
  if(!b) return;
  const {n, err, busy} = saveState;
  document.body.classList.toggle('is-saved', !n && !err && !busy && Backend.saved());
  /* **書いたのに、まだシートに入っていない。** 面ぜんぶの地をくすませる合図。
     「開いただけ」はここに入らない（Backend.touched が、書いたかどうかを持つ）。
     前に閉じたとき送れなかったぶんは n が拾う。 */
  document.body.classList.toggle('is-unsaved', !!n || !!err || Backend.touched());
  paintTpSub();
  /* **効く先が広い面では、ボタンの字と色を変える。**
     押した人の学級ではなく、学年ぜんぶ・全校ぜんぶの紙に出る操作なので、
     同じ見た目の「保存」にしておかない（docs/spec.md 3節）。 */
  const wide = typeof broadScope === "function" && broadScope();
  b.classList.toggle("apply", wide);
  b.classList.toggle("dirty", !!n && !err);
  b.classList.toggle("bad", !!err);
  b.disabled = busy;
  /* **送っているあいだは「途中で閉じると送信されません」を付ける。**
     閉じても控えに残るので起き直しで再送は効くが、いまの表示が
     止まっている間に消えると、本人は届いたと思い込んだままになる */
  t.textContent = busy ? "保存中…"
                : err  ? "保存できていない"
                : n    ? (wide ? "保存・反映（" + n + "）" : "保存（" + n + "）")
                : wide ? "保存・反映"
                       : "保存ずみ";
  const sub = $("saveSub");
  if(sub) sub.textContent = busy ? "途中で閉じると送信されません" : "";
  b.title = busy ? "送っています。途中で閉じると送信されません"
          : err  ? "もう一度押す。閉じると消える"
          : n    ? n + " コマぶんがまだシートに入っていない"
                : "シートに入っている";
}

/* 「ここで直したものは◯◯の3クラスに出る」の1行は外した。
   **開いたものが、そのまま入る先**（入れる先の欄も外してある）で、
   左上の行き先の欄が同じことを言っている。保存ボタンも、効く先が広い面では
   「保存・反映」と字と色が変わる ── 同じことを3か所で言っていた。 */
/* ── たんぽぽへの提出 ────────────────────────
   **担任が「今週ぶんは書き終えた」と言う印。** 週ごとに立て直す。

   1コマでも書いてあれば済、にはしない。ちょっと触っただけの週と、
   出してよい週を、たんぽぽ担当が見分けられなくなる。
   たんぽぽ担当はこれを見て支援員を組むので、あとから変わるとやり直しになる。

   **たんぽぽの児童がいるクラスにだけ出す。** 全クラスに出すと、
   関係のない28人が「押すものなのか」を毎週考えることになる。 */
function paintTpSub(){
  const b = $("tpSubBtn"), tx = $("tpSubTxt");
  if(!b) return;
  const cls = view.kind === "class" ? view.cls : "";
  const show = !!cls && tpCount(cls) > 0;
  b.hidden = !show;
  $("tpChanged").hidden = true;
  if(!show) return;
  const on = tpSubmitted(cls);
  const info = tpSubmitInfo(cls);
  const changed = !!(info && info.dirty || (week().tpEdited || {})[cls]);
  $("tpChanged").hidden = !changed;
  $("tpChanged").textContent = "未提出の変更あり！　保存後に、たんぽぽへ" + (info ? "再提出" : "提出") + "してください。";
  b.classList.toggle("on", on && !changed);
  b.setAttribute("aria-pressed", String(on));
  tx.textContent = changed && info ? "たんぽぽに再提出" : on ? "たんぽぽに提出ずみ" : "たんぽぽに提出";
  b.title = on
    ? "提出ずみ" + (info && info.at ? "（" + info.at + "）" : "")
      + "　押すと取り消せる。週が変わればまた未に戻る"
    : "今週ぶんを書き終えたら押す。たんぽぽ担当の画面で「済」になる";
}
function toggleTpSub(){
  const cls = view.kind === "class" ? view.cls : "";
  if(!cls || !Wait.guard()) return;
  const on = !tpSubmitted(cls) || !!(week().tpEdited || {})[cls];
  const w = Wait.begin(on ? "たんぽぽへ提出しています" : "提出を取り消しています", true);
  Backend.flush(saved => {
    if(!saved){ Wait.end(w); return toast("保存・競合の解決を終えてから提出してください"); }
    Backend.tpSubmit(cls, on, () => {
    Wait.end(w); paintTpSub();
    if(view.kind === "tanpopo") drawTanpopoView();
    toast(on ? "<b>たんぽぽに提出した</b>　週が変わると、また未に戻る"
             : "提出を取り消した");
  }, why => { Wait.end(w); toast(why); });
  });
}

/* ── 学年・全学年からの保存は、押したときに1回聞く ──────
   効く先が押した人の学級ではないので、出る先と週を見せてから送る。
   **既定は「反映しない」**（ほかの窓とそろえる。Esc も ✕ も同じ）。

   聞くのは「保存ずみ」でないときだけ。押しても何も送るものが無いときに
   窓を出すと、読まずに閉じる癖がつく。
   **doSave そのものは聞かない。** 競合の入れ直しがコードから呼ぶので、
   そこで窓を出すと、返事をしないかぎり送られない。 */
let apAsk = null;
function askApply(yes){
  apAsk = {yes, done:false};
  const cs = writeClasses();
  $("apWhere").innerHTML = "<b>" + escText(viewName()) + " の " + cs.length + " クラス</b>"
    + (cs.length && cs.length <= 4 ? "（" + escText(cs.join("・")) + "）" : "")
    + " の週案に出ます。";
  $("apWeek").textContent = md(monday) + " → " + md(addDays(monday, 4)) + " の週";
  $("apDlg").showModal();
  $("apNo").focus();                 /* **既定は「反映しない」。** */
}
function apAnswer(ok){
  const a = apAsk;
  apAsk = null;
  if(!a || a.done) return;
  a.done = true;
  if(ok) a.yes();
}
/* ボタンと Ctrl+S だけがここを通る */
function requestSave(){
  if(!broadScope() || Backend.saved()) return doSave(true);
  askApply(() => doSave(true));
}

function doSave(loud){
  if(!Backend.isGas()){ saveNow(); Backend.flush(() => paintSave()); if(loud) toast("この端末に保存した（本番ではシートへ）"); return; }
  saveNow();                      /* 送る前に、この端末の控えを書き切る */
  saveState.busy = true; paintSave();
  const w = Wait.begin("シートに保存しています", true);
  Backend.flush(okAll => {
    saveState.busy = false; paintSave(); Wait.end(w);
    if(loud && okAll) toast("シートに保存した");
  });
}

/* ── 紙の大きさ ──────────────────────────────
   既定は「画面に合わせる」。週案がいちばん大きく出る。
   **印刷の倍率とは別**にしてある。1つにすると、読むために拡大した人が
   そのまま刷って寸法を外す。 */
function applyZoom(){
  const z = db.settings.vz || 100;
  $("paper").style.zoom = (z / 100);
  $("vz").value = z; $("vzV").textContent = z;
  $("fitChk").checked = !!db.settings.fit;
}
function autoFit(){
  if(!db.settings.fit) return applyZoom();
  const sh = $("sheet"), st = $("stage"), pa = $("paper");
  pa.style.zoom = 1;
  const w = sh.offsetWidth, h = sh.offsetHeight;
  if(!w || !h) return applyZoom();
  /* **紙は痩せない。** 左右の ‹ › が取る幅を、そのまま倍率の計算に入れる
     （入れないと、矢印のぶんだけ紙が枠からはみ出す）。隠れていれば 0 */
  const arrows = [...st.querySelectorAll(".wkarrow")]
    .reduce((n, e) => n + (e.hidden ? 0 : e.offsetWidth + 6), 0);
  const k = Math.min((st.clientWidth - 24 - arrows) / w, (st.clientHeight - 20) / h);
  db.settings.vz = Math.max(30, Math.min(160, Math.round(k * 100)));
  applyZoom();
}
let fitT = 0;
addEventListener("resize", () => {
  clearTimeout(fitT);
  fitT = setTimeout(() => {
    autoFit();
    /* 中央に出ている面（4週・学年・カレンダー）も測り直す。
       紙の大きさは枠の大きさで決まるので、窓を広げたら倍率も変わる */
    if(typeof refitCenter === "function") refitCenter();
  }, 120);
});

/* ── 週 ──────────────────────────────────────── */
function syncVariant(){
  const w = week(), v = w.variant, auto = autoVariant(wkKey());
  for(const [id, k] of [["abA","A"],["abB","B"]])
    $(id).setAttribute("aria-pressed", String(v === k));
  /* **ふだんは日付から決まる。** 手で変えた週だけ、戻す道を出す。
     出しっぱなしにすると、押す必要のないものが毎週目に入る */
  const b = $("abAuto");
  if(b){
    b.hidden = !w.vset;
    b.textContent = "自動に戻す（" + auto + "週）";
  }
}
function refreshWeek(){
  paintWeekLabel();
  const n = weekNo();
  $("weekNo").textContent = (n ? "第" + n + "週　" : "") + fy() + "年度";
  syncVariant();
  drawDayPanel();                 /* この週の日の形。週をまたぐと中身が変わる */
  drawTallyPanel();               /* 時数。週をまたぐと「今月」が変わる */
  paintArchive();                 /* 週をまたぐと年度が変わる。**そのつど見る** */
  paintTpSub();                   /* 提出の印は週ごと。週をまたぐと未に戻る */
  if(view.kind === "tanpopo"){
    /* **待たせない。** 先に面を描いて、出す先は届いてから描き直す。
       出す先は1回だけ読む（週を繰るたびに読みに行かない） */
    drawTanpopoView();
    if(tpTargets === null) loadTargets();
    return;
  }
  /* 中央に出ているものを組み直す。**かたちの分岐は redrawCenter が持つ**
     （ここにも分岐を置くと、かたちを1つ足したとき2か所に足すことになる）。
     週を繰ったのに、見ている面だけ前の週のまま、にしない */
  redrawCenter(true);
}
function goWeek(n){
  saveNow();                      /* 週を出る前に、この端末の控えを書き切る */
  Backend.flush();                /* 週を出る前に、書いたぶんを送る */
  monday = addDays(monday, n);
  const fresh = !db.years[String(fy())];
  clearSelection();
  /* **待たせない。** 手元の控えで先に描いて、シートが届いたら描き直す */
  const draw = () => {
    if(view.kind === "gate") drawGate(); else refreshWeek();
    if(fresh) saveNow();          /* 新しい年度をその場で1回だけ書き出す */
  };
  loadAndDraw(draw, "週を開いています", () => Backend.prefetchNeighbors());  /* 前後の週を先に読む */
}

/* ── 入力ロック ──────────────────────────────
   **押すまで、この画面からは直せない。**
   見るだけのつもりで開いたクラスに、うっかり字を入れてしまうのを止める。
   画面ごと（クラスごと）に持ち、この端末に残る。
   ロックは**この端末の中だけの話**で、シートには書かない。
   ほかの先生の画面を止めるものではない。 */
function lockKey(v){
  const x = v || view;
  return x.kind === "class"   ? "class:" + x.cls
       : x.kind === "grade"   ? "grade:" + x.grade
       : x.kind === "special" ? "special:" + x.sp
       : x.kind === "school"  ? "school:"
       /* たんぽぽの面も止められるようにする。**組の並びは出す列そのもの。**
          見るだけのつもりで開いて、うっかり1人入れると、出す列が1列ずれる */
       : x.kind === "tanpopo" ? "tanpopo:" : "";
}
const isLocked = () => {
  const k = lockKey();
  return !!k && !!(db.settings.locks || {})[k];
};
function setLock(on){
  const k = lockKey();
  if(!k) return;
  const l = db.settings.locks || (db.settings.locks = {});
  if(on) l[k] = true; else delete l[k];
  save();
  applyLock();
  toast(on ? "この画面をロックした。<b>直すには、もう一度押す</b>"
           : "ロックを外した");
}
/* かかっているかどうかを、押す前から見て分かる形にする。
   **止めるのは書き込みだけ。** 読むこと・刷ること・時数を写すことは止めない。 */
function applyLock(){
  const on = isLocked(), has = !!lockKey();
  /* 週案の紙と、たんぽぽの面。**同じ押し心地にそろえる。**
     面ごとに別のボタンを作ると、片方だけ直した版が出る */
  for(const [bid, tid] of [["lockBtn", "lockTxt"], ["tpLockBtn", "tpLockTxt"]]){
    const b = $(bid);
    if(!b) continue;
    b.hidden = !has;
    b.setAttribute("aria-pressed", String(on));
    $(tid).textContent = on ? "ロック中" : "ロック";
  }
  $("lockMsg").hidden = !on;
  const sh = $("sheet");
  if(sh) sh.classList.toggle("locked", on);
  /* 紙とパネルの書ける欄を、まとめて開け閉めする */
  for(const e of document.querySelectorAll("#sheet [contenteditable], .panel .fld"))
    e.setAttribute("contenteditable", String(!on));
  for(const e of document.querySelectorAll(".pal")) e.disabled = on;
  for(const id of ["pClear", "pAll", "pAddLink"]){
    const e = $(id); if(e) e.disabled = on;
  }
  if($("pShort")) $("pShort").disabled = on;
}

/* ── 待っているあいだの印 ────────────────────
   **押したのに何も起きない時間を作らない。** 校内の回線ではシートを読むのに
   1秒前後かかる。黙っていると、押せていないのかと思ってもう一度押す。

   数えて出す（読み込みと保存が重なることがある）。
   画面は止めない。控えで描いた紙はそのあいだも読める。 */
let busyN = 0, busyWhat = "";
function setBusy(on, what){
  busyN = Math.max(0, busyN + (on ? 1 : -1));
  if(on && what) busyWhat = what;
  const e = $("busy"), t = $("busyTxt");
  if(t) t.textContent = busyWhat || "読み込み中";
  if(e) e.hidden = !busyN;
  document.querySelector(".app").classList.toggle("busy-on", !!busyN);
  if(!busyN) busyWhat = "";
}
/* 押したものそのものに、すぐ手ごたえを出す */
function markOpening(el){
  for(const x of document.querySelectorAll(".opening")) x.classList.remove("opening");
  if(el) el.classList.add("opening");
}
/* A週・B週。**ふだんは日付から決まる**（store.js の autoVariant）。
   ここで押したときだけ、その週にかぎって手で決めた印を付ける。
   印を付けないと、次に描き直したときに日付から決め直されて元へ戻る。 */
function setVariant(v){
  const w = week();
  if(v === null){ delete w.vset; w.variant = autoVariant(wkKey()); }
  else { w.vset = true; w.variant = v; }
  save();
  if(view.kind === "gate") drawGate(); else refreshWeek();
}

/* ── キーの近道 ──────────────────────────────
   **欄の中では、ブラウザに任せる。** 字を打っている最中の Ctrl+Z は
   「いま打った字を戻す」であって、「1コマ前の操作を戻す」ではない。
   ここで横取りすると、打ち間違いを1字だけ直せなくなる。

   欄の外で押したときだけ、こちらの1手戻すが効く。
   引っぱって入れたコマ・パレットで入れたコマは、押したあと欄の外にいる。 */
const inField = e => !!(e && (e.isContentEditable
  || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName || "")));

document.addEventListener("keydown", ev => {
  /* 持っている教科チップを手放す。窓が開いているときは、窓を閉じるほうに使う */
  if(ev.key === "Escape" && pickSub && !document.querySelector("dialog[open]")){
    pickRelease_();
    return;
  }
  const mod = ev.ctrlKey || ev.metaKey;
  if(!mod) return;
  const k = (ev.key || "").toLowerCase();
  /* 保存。**どの画面でも同じ。** ブラウザの「ページを保存」は横取りする
     （この画面で Ctrl+S に期待されるのは、そちらではない） */
  if(k === "s"){ ev.preventDefault(); if(Wait.guard()) requestSave(); return; }
  if(inField(document.activeElement)) return;
  if(k === "z" && !ev.shiftKey){ ev.preventDefault(); doUndo(); return; }
  if((k === "z" && ev.shiftKey) || k === "y"){ ev.preventDefault(); doRedo(); return; }
});

/* ── 画面ぜんぶに効くもの ─────────────────────── */

/* リンクは文字を押すと飛ぶ。contenteditable の中では、ふつうに押しても
   ブラウザは飛ばずカーソルを置くだけなので、こちらで開く。 */
document.addEventListener("click", ev => {
  const a = ev.target.closest && ev.target.closest("a[href]");
  if(!a || !a.closest("#sheet, .fld")) return;
  ev.preventDefault();
  const w = window.open(a.getAttribute("href"), "_blank");
  if(w) w.opener = null;          /* 開いた先から元の画面を触らせない */
});
/* **窓の外を押したら閉じる。** ×を探さなくても、窓の外を押せば消える。
   外を押したかは、クリックが窓（.dlg の四角）の外に出たかで見る。
   「読み込み中」(#wait) は閉じない ── 消すと待ちが終わったか分からない */
document.addEventListener("click", ev => {
  const d = ev.target;
  if(!(d instanceof HTMLDialogElement) || !d.open || d.id === "wait") return;
  const box = d.querySelector(".dlg");
  if(!box) return;
  const r = box.getBoundingClientRect();
  if(ev.clientX < r.left || ev.clientX > r.right ||
     ev.clientY < r.top  || ev.clientY > r.bottom) d.close();
});
/* 貼り付けは書式を捨てて文字だけ入れる */
document.addEventListener("paste", ev => {
  const ed = ev.target.closest && ev.target.closest("[contenteditable]");
  if(!ed) return;
  ev.preventDefault();
  const txt = (ev.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, String(txt).replace(/[\r\n]+/g, " "));
});
/* 選んだ範囲を覚えておく。リンクを付けるときに使う */
document.addEventListener("selectionchange", () => {
  const s = document.getSelection();
  if(!s || !s.rangeCount) return;
  const r = s.getRangeAt(0);
  const host = r.commonAncestorContainer;
  const box = (host.nodeType === 1 ? host : host.parentElement);
  if(box && box.closest && box.closest("#sheet .t, #sheet .n, .fld"))
    lastRange = r.cloneRange();
});

/* ── 結線 ────────────────────────────────────── */
function wire(){
  const on = (id, ev, fn) => { const e = $(id); if(e) e.addEventListener(ev, fn); };

  /* **画面が消える前に、この端末の控えを書き切る。**
     打鍵は 400ms 遅らせて書いている（store.js の save）ので、
     そのあいだに閉じられたぶんを取りこぼさない。
     beforeunload は Chromebook の蓋を閉じたときなど、来ないことがある。 */
  addEventListener("pagehide", saveNow);
  addEventListener("visibilitychange", () => { if(document.hidden) saveNow(); });
  on('guideOpen', 'click', () => openGuide(false));
  on('guideDlg', 'close', finishGuide);


  /* 単元進捗の窓と学期設定の結線（→ unitprogress.js） */
  if(typeof wireUnitProgress === "function") wireUnitProgress();

  on("prevWk","click", () => goWeek(-7));
  on("nextWk","click", () => goWeek(7));
  /* 紙の左右の ‹ › 。**左メニューの ◀ ▶ と同じことをする**
     （行き先を2つ持たない。片方だけ直した版が出る） */
  on("wkPrev","click", () => goWeek(-7));
  on("wkNext","click", () => goWeek(7));

  on("abA","click", () => setVariant("A"));
  on("abB","click", () => setVariant("B"));
  on("abAuto","click", () => { setVariant(null); toast("日付から決まる週に戻した"); });
  on("toGate","click", showGate);
  on("target","change", e => onTargetChange(e.target.value));
  on("tpGo","click", reflectTanpopo);
  on("ckGo","click", runCheck);
  on("arCount","click",  arRunCount);
  on("arVerify","click", arRunVerify);
  on("arGo","click",     arRunPurge);
  /* 年度を打ち込むまで押せない。**誤クリックで消えない。** */
  on("arTyped","input", () => {
    $("arGo").disabled = !arChecked || $("arTyped").value.trim() !== String(arChecked.year);
  });

  /* 上書きの窓。**閉じ方が何であれ「変更しない」に落ちる。**
     Esc も、外側を押したときも、返事をしないまま消えたときも同じ */
  /* 保存の競合。**閉じ方が何であれ「最新の内容を見る」に落ちる。**
     上書きは、そう答えたときだけ */
  on("cfSee","click",  () => { $("cfDlg").close(); });
  on("cfMine","click", () => { cfAnswer(true); $("cfDlg").close(); });
  on("cfDlg","close",  () => cfAnswer(false));

  /* 反映の窓。**閉じ方が何であれ「反映しない」に落ちる。** */
  on("apNo","click",  () => { $("apDlg").close(); });
  on("apYes","click", () => { apAnswer(true); $("apDlg").close(); });
  on("apDlg","close", () => apAnswer(false));

  on("swNo","click",  () => { $("swDlg").close(); });
  on("swYes","click", () => { owAnswer(true); $("swDlg").close(); });
  on("swDlg","close", () => owAnswer(false));

  /* 文だけの確認。**閉じ方が何であれ「やめる」に落ちる。**
     ここが confirm の代わり（→ dialogs.js askOk） */
  on("okNo","click",  () => { $("okDlg").close(); });
  on("okYes","click", () => { okAnswer(true); $("okDlg").close(); });
  on("okDlg","close", () => okAnswer(false));

  /* リンクを付ける窓。**Enter でも押せる**（URL を打ち終えた手のまま進める） */
  on("linkGo","click", doAddLink);
  on("linkUrl","keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); doAddLink(); } });
  on("linkDlg","close", () => { linkAt = null; });
  on("gClose","click", () => { if(lastTarget) openView(lastTarget); });

  for(const b of document.querySelectorAll("[data-act]"))
    b.addEventListener("click", () => {
      const a = b.dataset.act;
      if(a === "gate")    return showGate();
      if(a === "open")    return lastTarget ? openView(lastTarget) : showGate();
      if(a === "base")    return openBaseDlg();
      if(a === "roster")  return openRosterDlg();
      if(a === "tally")   return openTallyDlg();
      if(a === "tanpopo") return openView({kind:"tanpopo"});
      if(a === "paper")   return $("setDlg").showModal();
      if(a === "admin")   return openAdminDlg();
      if(a === "newyear") return openNewYearDlg();
      if(a === "month")   return openMonth();
      if(a === "spmonth") return openSpMonth();
      /* 学年・カレンダーも「週案を出す」から開ける。**この並びが現在地も言う。**
         刷るものを探している人は、左の「出す」の並びをみにいく */
      if(a === "grade")   return centerOk() ? setCenter("grade")
                                            : toast("クラスや学年を開いてから押す");
      if(a === "cal")     return openCal();
      if(a === "print")   return window.print();
      if(a === "settings")return openSettings();
      /* 「教務必携用（B5）」。**週の紙そのものへ戻る。**
         印刷・画像・Google Sheet は紙のとなりの帯（#weekBar）から直に押す
         ── 前は窓を1つ挟んでいたが、4週・学年・カレンダーと同じ形にそろえた */
      if(a === "outweek") return openWeekView();
      /* 連絡帳（A4よこ）。面ではなく、日付を選ぶ窓を開く */
      if(a === "renraku") return openRenrakuDlg();
    });
  for(const b of document.querySelectorAll("[data-close]"))
    b.addEventListener("click", () => $(b.dataset.close).close());

  /* ── 窓を閉じるところ ──────────────────────
     **窓枠の右上に ✕ を1つ置く。** 下の隅に「閉じる」を置いていたころは、
     そこまで読み進めないと閉じ方が見つからなかった。窓は上から読むので、
     閉じ方も上に無いと探すことになる。
     ここで1回だけ差し込む（窓ごとに HTML へ書くと、足した窓で付け忘れる）。 */
  for(const d of document.querySelectorAll("dialog")){
    const box = d.querySelector(".dlg");
    if(!box || d.querySelector(".dlgx")) continue;
    const x = el("button", "dlgx", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "閉じる");
    x.title = "閉じる（Esc）";
    x.addEventListener("click", () => d.close());
    /* **窓の中ではなく、窓枠の右上に出す。** 中に置くと、中身の1行目と
       同じ高さに並んで、読むものと閉じるものが混ざる。
       枠に付けておけば、どの窓でも同じ場所にある。 */
    d.insertBefore(x, d.firstChild);
  }

  /* 左の並びの「？」。**1か所でまとめて付ける**（項目ごとに書くと付け忘れる） */
  wireHelp();

  /* 用紙 */
  on("stPaper","change", e => { db.settings.paper = e.target.value; save(); applyPaper(); });
  on("stMg","input",  e => { db.settings.margin = +e.target.value; save(); applyPaper(); });
  on("stK","input",   e => { db.settings.k = +e.target.value; save(); applyPaper(); });
  on("stTitle","input", e => { db.settings.titlePt=+e.target.value; save(); applyPaper(); buildSheet(); });
  on("stNote","input", e => { db.settings.notePt=+e.target.value; save(); applyPaper(); buildSheet(); });
  on("fitChk","change", e => { db.settings.fit = e.target.checked; save(); autoFit(); });
  on("vz","input", e => {
    db.settings.fit = false; db.settings.vz = +e.target.value; save(); applyZoom();
  });

  /* 基本時間割 */
  on("baseCls","change", drawBaseGrid);
  on("bvA","click", () => { baseVar = "A"; drawBaseGrid(); });
  on("bvB","click", () => { baseVar = "B"; drawBaseGrid(); });
  on("baseCopy","click", () => {
    const c = $("baseCls").value, B = Y().base;
    if(!B[c]) B[c] = {};
    B[c].B = clone(B[c].A || {});
    save(); Backend.saveBase(c, "B"); baseVar = "B"; drawBaseGrid();
    toast(c + " のA週をB週へ写した。違うところだけ直す");
  });
  on("basePrev","click", () => {
    const c = $("baseCls").value, prev = db.years[String(fy() - 1)];
    if(!prev || !prev.base[c]) return toast("前年度に " + escText(c) + " の基本時間割が無い");
    Y().base[c] = clone(prev.base[c]);
    save(); Backend.saveBase(c, "A"); Backend.saveBase(c, "B"); drawBaseGrid();
    toast("前年度の " + escText(c) + " を写した");
  });
  /* 窓を閉じたら紙を組み直す。**ボタンではなく窓の close に付ける。**
     ✕ で閉じても、Esc で閉じても、同じことが起きないと直したものが紙に出ない */
  on("baseDlg","close", () => { if(view.kind !== "gate") buildSheet(); });

  /* 保存。**打つたびには送らない。** ここで1コマ1件にまとめて送る */
  /* 押した瞬間から2回目を受けない。窓が出る 200ms のあいだも、ここが受ける。
     doSave 自体は弾かない（重なりの入れ直しがコードから呼ぶ。弾くと黙って送られない） */
  on("saveBtn","click", () => { if(Wait.guard()) requestSave(); });
  /* 変更を破棄。**まだシートに入っていない自分のぶんを捨てて読み直す。**
     競合の窓が開いていたら先に閉じる（残しておくと、捨てたぶんを
     その窓から入れ直せてしまう） */
  on("discardBtn","click", () => {
    if(!Wait.guard()) return;
    if(cfAsk && $("cfDlg").open) $("cfDlg").close();
    setBusy(true, "シートの状態に戻しています");
    Backend.discardChanges(had => {
      setBusy(false);
      if(view.kind === "tanpopo") drawTanpopoView();
      else paintSheet();
      toast(had ? "<b>破棄しました</b>　シートの状態に戻しました"
                : "破棄する変更はありません");
    });
  });
  on("lockBtn","click", () => setLock(!isLocked()));
  on("tpLockBtn","click", () => { setLock(!isLocked()); drawTanpopoView(); });
  on("tpDelNo","click",  () => tpDelAnswer(false));
  on("tpDelYes","click", () => tpDelAnswer(true));
  /* ✕ や Esc で閉じたときも「外さない」。取りこぼさない */
  on("tpDelDlg","close", () => tpDelAnswer(false));
  on("tpSubBtn","click", toggleTpSub);

  /* 空き枠さがし */
  for(const b of document.querySelectorAll("#freeSeg [data-free]"))
    b.addEventListener("click", () => {
      freeOpt().level = +b.dataset.free;
      save(); redrawCenter();
    });
  on("freeAvoid","toggle", () => { if($("freeAvoid").open) drawAvoidList(); });

  /* 学年の面。**見るだけ。** */
  on("gvGrade","change", e => { gGrade = e.target.value; redrawCenter(); });
  on("gvClose","click",  () => setCenter("week"));
  on("gvImage","click", async () => {
    const w = openOutWindow("画像を作っています");
    try{ const b = await nodePngBlob($("gvPaper"));
         if(w){ w.location.href = URL.createObjectURL(b); return; }
         downloadBlob(b, outputName(gGrade + "年_" + "学年") + ".png"); }
    catch(e){ if(w) w.close(); toast("画像を作れなかった（" + escText(e.message || e) + "）"); }
  });
  /* **測り直しは間引く。** 掴んで動かすあいだ、1秒に何十回も強制リフローになる
     （週の紙の autoFit と同じ 120ms） */
  let gvT = 0;
  addEventListener("resize", () => {
    clearTimeout(gvT);
    gvT = setTimeout(() => { if(!$("gradeView").hidden) fitGrade(); }, 120);
  });

  /* カレンダーの面。**見るだけ。** 4ヶ月ずつ繰る */
  on("cvPrev","click",  () => { calFrom = new Date(calFrom.getFullYear(), calFrom.getMonth() - CAL_MONTHS, 1); redrawCenter(); });
  on("cvNext","click",  () => { calFrom = new Date(calFrom.getFullYear(), calFrom.getMonth() + CAL_MONTHS, 1); redrawCenter(); });
  on("cvClose","click", () => setCenter("week"));
  on("cvPrint","click", printCal);
  on("gvPrint","click", printGrade);
  on("cvImage","click", async () => {
    const w = openOutWindow("画像を作っています");
    try{ const b = await nodePngBlob($("cvPaper"));
         if(w){ w.location.href = URL.createObjectURL(b); return; }
         downloadBlob(b, outputName("カレンダー") + ".png"); }
    catch(e){ if(w) w.close(); toast("画像を作れなかった（" + escText(e.message || e) + "）"); }
  });
  let cvT = 0;
  addEventListener("resize", () => {
    clearTimeout(cvT);
    cvT = setTimeout(() => { if(!$("calView").hidden) fitCal(); }, 120);
  });

  /* 月の面。**見るだけ。** 直すのは週の紙のほうで */
  on("mPrev","click",  () => { mMonday = addDays(mMonday, -7 * MONTH_WEEKS); redrawCenter(); });
  on("mNext","click",  () => { mMonday = addDays(mMonday,  7 * MONTH_WEEKS); redrawCenter(); });
  on("mClose","click", () => setCenter("week"));
  on("mPrint","click", printMonth);
  on("mImage","click", async () => {
    const w = openOutWindow("画像を作っています");
    try{ const b = await nodePngBlob($("mPaper"));
         if(w){ w.location.href = URL.createObjectURL(b); return; }
         downloadBlob(b, outputName("4週_B4")+".png"); }
    catch(e){ if(w) w.close(); toast("画像を作れなかった（"+escText(e.message||e)+"）"); }
  });
  on("mSheet","click", exportMonthSheet);
  addEventListener("resize", () => { if(!$("monthView").hidden) fitMonth(); });

  /* 専科どうしの月予定（仮）。**「入れる」を押すまで週案には書かない** */
  on("spmPrev","click", () => spmStep(-1));
  on("spmNext","click", () => spmStep(1));
  on("spmRun","click",  spmRun);
  on("spmMove","change", ev => { spmMoveBroken = ev.target.checked; spmInvalidate(); });
  /* 案の面。**押すまで週案には1文字も書かない** */
  on("spmFPrev","click", () => spmFaceStep(-1));
  on("spmFNext","click", () => spmFaceStep(1));
  on("spmWishOpen","click", () => $("spmDlg").showModal());
  on("spmTake","click",     () => spmAdopt(false));
  on("spmTakeTent","click", () => spmAdopt(true));
  on("spmClose","click", () => setCenter("week"));
  addEventListener("resize", () => { if(!$("spmView").hidden) fitSpm(); });
  /* **案を入れずに閉じても、希望は残す。** 希望はその人の持ちもので、
     案とは別のもの（触っていなければ1コマも書かない） */
  on("spmDlg","close", () => { if(spmSaveWish()) toast("<b>専科の希望を控えた。</b>保存を押す"); });
  /* 新年度の設定。**ふだんは管理・システムの中だけ。**
     未了のあいだだけ、左メニューにも出る（結線は dialogs.js） */
  on("nyOpen","click", () => { $("adminDlg").close(); openNewYearDlg(); });
  on("rsAb","click", openAbDlg);
  on("abSave","click", saveAb);
  on("evRead","click", evRead);
  on("evGo","click", evGo);
  on("setSub","click",  () => { $("settingsDlg").close(); openSubDlg(); });
  on("setBase","click", () => { $("settingsDlg").close(); openBaseDlg(); });
  on("setRoster","click", () => { $("settingsDlg").close(); openRosterDlg(); });
  on("setTanpopo","click", () => { $("settingsDlg").close(); openTpGroupDlg(); });
  on("setPaper","click", () => { $("settingsDlg").close(); applyPaper(); $("setDlg").showModal(); });
  on("setNewYear","click", () => { $("settingsDlg").close(); openNewYearDlg(); });
  on("weekPrint","click", () => { if(centerOk()) setCenter("week"); window.print(); });
  on("weekImage","click", async () => {
    const w = openOutWindow("画像を作っています");
    try{ const b = await nodePngBlob($("sheet"));
         if(w){ w.location.href = URL.createObjectURL(b); return; }
         downloadBlob(b, outputName("B5")+".png"); }
    catch(e){ if(w) w.close(); toast("画像を作れませんでした（"+escText(e.message||e)+"）"); }
  });
  on("weekSheet","click", exportWeekSheet);
  /* 連絡帳。クラス・日付・宿題・持ち物が変わるたびに焼き直す。
     **打鍵のたびには焼かない。** 1回の焼き直しは絵を組むのに時間がかかる
     （実測で10msほど。児童機ではその数倍）。打つのをやめてからまとめて焼く */
  let renT = 0;
  const renrakuLater = () => { clearTimeout(renT); renT = setTimeout(renrakuRender, 250); };
  on("renCls",  "change", renrakuRender);
  on("renDate", "change", renrakuRender);
  on("renHw",   "input",  renrakuLater);
  on("renItem", "input",  renrakuLater);
  on("renImage","click", () => {
    const cv = renrakuCanvas(); if(!cv) return;
    const w = openOutWindow("画像を作っています");
    cv.toBlob(b => {
      if(w){ w.location.href = URL.createObjectURL(b); return; }
      downloadBlob(b, renrakuName() + ".png");
    }, "image/png");
  });
  on("renPrint","click", () => {
    const cv = renrakuCanvas(); if(!cv) return;
    const w = window.open("", "_blank");
    if(!w){ toast("窓が開けませんでした（ポップアップを許可してください）"); return; }
    const src = cv.toDataURL("image/png");
    w.document.write("<html><head><title>" + escText(renrakuName()) + "</title>"
      + "<style>@page{size:A4 landscape;margin:0}body{margin:0}img{display:block;width:100vw;height:100vh}</style>"
      + "</head><body><img src='" + src + "' onload='setTimeout(function(){print()},60)'></body></html>");
    w.document.close();
  });
  on("renSlide","click", () => {
    const cv = renrakuCanvas(); if(!cv) return;
    const w = openOutWindow("Google Slideを作っています");
    Backend.exportSlide(renrakuName(), cv.toDataURL("image/png"), r => {
      if(w){ w.location.href = r.url; return; }
      $("renStat").innerHTML = "作りました → <a href='" + escText(r.url) + "' target='_blank' rel='noopener'>" + escText(r.name) + "</a>";
    }, e => { if(w) w.close(); toast(escText(e)); });
  });
  /* 左メニューの三つ組み。**その面の中にある口と同じ動き**にする ──
     ここで別の動きを書くと、帯と面の中で結果がずれる。
     sb* は対応する面のボタンを押すだけ（sbCSheet/sbGSheet は
     カレンダー・学年の面の中に口が無いので、ここが唯一の入口） */
  on("sbMPrint","click", () => $("mPrint").click());
  on("sbMImage","click", () => $("mImage").click());
  on("sbMSheet","click", exportMonthSheet);
  on("sbCPrint","click", () => $("cvPrint").click());
  on("sbCImage","click", () => $("cvImage").click());
  on("sbCSheet","click", exportCalSheet);
  on("sbGPrint","click", () => $("gvPrint").click());
  on("sbGImage","click", () => $("gvImage").click());
  on("sbGSheet","click", exportGradeSheet);
  /* 教科の色。**窓を開かせない。** 紙を見ているときに、そのとなりで切り替える */
  for(const b of document.querySelectorAll("#chipSeg [data-chip]"))
    b.addEventListener("click", () => {
      if(view.kind !== "class") return;
      (Y().chipModes || (Y().chipModes = {}))[view.cls] = b.dataset.chip;
      save(); paintChipSeg(); redrawCenter(true);
    });

  /* 紙の字の大きさ。**設定と同じ棚を直す**（db.settings.titlePt / notePt）。
     窓の中のスライダーと、ここの ＋− は、同じ値の別の触り方。 */
  for(const b of document.querySelectorAll("#fontWrap .fsb"))
    b.addEventListener("click", () => {
      const k = b.dataset.fs, r = FONT_PT[k];
      const next = fontPt(k) + (+b.dataset.step);
      if(next < r.min || next > r.max) return;
      db.settings[k] = next;
      save(); applyPaper(); buildSheet();
    });

  /* 時数。**年度はじめからの週を読み直してから数え直す。**
     見込みで出していた数を、確かな数に入れ替える口 */
  on("tlyRead", "click", tallyReadAll);
  /* 時数集計シート。**時間がかかるので、押す前に言う。**
     押し間違いで待たせない（やめる側に落ちる窓で受ける） */
  on("tlySheet", "click", () => {
    const cs = tallyScope(), one = cs.length === 1;
    askOk({
      title: one ? cs[0] + " の時数を数えますか"
                 : cs.length + "クラスぶんの時数を数えますか",
      lines: ["4月からこの月までを、<b>" + (one ? cs[0] : cs.length + "クラスぶん")
              + "</b>数えて、スプレッドシートの<b>「時数集計」シート</b>に置きます。",
              one ? "<b>たいてい数十秒で終わります。</b>年度の後半ほど長くかかります"
                    + "（読む週が増えるため）。"
                  : "<b>少し時間がかかります。</b>年度の後半ほど長くかかります"
                    + "（読む週が増えるため）。",
              "置いたものは、押すたびに<b>そのぶんの行だけ</b>作り直します。"
              + "他のクラスや、他の年度のぶんは残ります。"],
      goLabel: "数える",
      onYes: tallySheetAll
    });
  });

  /* カレンダーの備考。**空欄で刷るか、週案の備考を出すか。** */
  on("cvNote", "click", () => {
    db.settings.calNote = !db.settings.calNote;
    save(); redrawCenter();
  });

  /* 畳みの開き閉じは覚えておく（毎回たたみ直させない） */
  on("tallyFold", "toggle", () => { db.settings.tallyOpen = $("tallyFold").open; save(); });
  on("dayFold",   "toggle", () => { db.settings.dayOpen   = $("dayFold").open;   save(); });
  on("freeFold",  "toggle", () => { db.settings.freeOpen  = $("freeFold").open;  save(); });

  /* この日の形。**全学年の面で、日付の見出しを押すと開く**（結線は sheet.js） */
  on("dayDlg","close", () => { dayPick = 0; });

  /* たんぽぽ。**確認の窓は既定「出さない」。** 閉じ方が何であれ出さない側に落ちる */
  /* 組分けの窓。**面のロック中は開かない。** ロックが守るのは出す先と組分けで、
     「たんぽぽ時間割に書き入れる」だけはロックしたままでも押せる */
  /* 閉じたら中身を捨てる。**開くたびに組み直す。**
     残しておくと、閉じた窓の写しが DOM に残って、面の並びと二重に見つかる */
  /* close は非同期に届く。閉じてすぐ開き直したとき（設定からの開き直し）は、
     もう開いているので捨てない ── 捨てると、開いた窓が空になる */
  on("tpGrpDlg","close", () => { if(!$("tpGrpDlg").open) $("tpGrpBody").innerHTML = ""; });

  on("tpGrpOpen","click", () => {
    if(typeof isLocked === "function" && isLocked())
      return toast("この面はロックしてある。<b>直すには、上のロックを押す</b>");
    openTpGroupDlg();
  });

  on("tpNo","click",  () => $("tpDlg").close());
  on("tpYes","click", () => { $("tpDlg").close(); doExportTanpopo(); });
  on("baseImp","click", openImpDlg);

  /* 表からコマを取り込む。**押す口は3つ、窓は1つ。**
     右メニュー（時数表）と、設定のカード2枚。運び方は同じ */
  on("tlyImp",     "click", () => openImpPlan("tally"));
  on("setImpTally","click", () => { $("settingsDlg").close(); openImpPlan("tally"); });
  on("setImpEv",   "click", () => { $("settingsDlg").close(); openImpPlan("events"); });
  on("ipTpl",  "click", impPlanTemplate);
  on("ipRead", "click", impPlanRead);
  on("ipGo",   "click", impPlanGo);

  /* 固定時間割の取り込み */
  for(const b of $("impSrc").querySelectorAll("button"))
    b.onclick = () => setImpSrc(b.dataset.s);
  on("impRead","click", readImp);
  on("impCls","change", () => drawImpGrid($("impCls").value));
  on("impGo","click", goImp);
  on("impText","paste", () => setTimeout(readImp, 0));   /* 貼ったらすぐ読む */

  /* 学級編成 */
  on("rsAddG","click", () => {
    const g = String($("rsNewG").value || "").trim();
    if(!g) return;
    if(Y().classes[g]) return toast("その学年はもうある");
    Y().classes[g] = [];
    $("rsNewG").value = "";
    save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
  });
  /* 専科の枠を足す。**身元は重ならないように付ける**（週案の棚に入る字）。
     1人目は教科コードのまま、2人目からは「rika_2」と連番を足す。 */
  on("rsSpAdd","click", () => {
    const list = Y().specials || (Y().specials = []);
    const sub = (SUBJECTS.find(x => x.count && !x.only) || {code:"ongaku"}).code;
    let code = sub, n = 2;
    while(list.some(x => x.code === code)) code = sub + "_" + (n++);
    list.push({code, subject:sub, grades:[]});
    save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
  });
  on("rsW1","change", e => {
    const v = String(e.target.value).trim();
    if(!parseISO(v)) return toast("日付は 2026-04-06 の形で書く");
    Y().week1 = v; save(); Backend.saveRoster();
    if(view.kind === "gate") drawGate(); else refreshWeek();
  });
  on("rsPrev","click", () => {
    const prev = db.years[String(fy() - 1)];
    if(!prev) return toast("前年度のデータがまだ無い");
    Y().classes  = clone(prev.classes);
    Y().specials = clone(prev.specials);
    save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
    toast("前年度の編成を写した");
  });

  /* 時数 */
  on("tyAnchor","change", e => { db.settings.tally.anchor = e.target.value.trim(); save(); });
  on("tyCls","change", e => { db.settings.tally.classes = e.target.value; save(); drawTallyPreview(); });
  on("tyBlock","input", e => { db.settings.tally.block = +e.target.value || 10; save(); drawTallyPreview(); });
  on("tyCopy","click", () => {
    const n = weekNo();
    copyText(tallyTsv(), "コピーした。時数集計表の第" + (n || "?") + "週シートで <b>"
      + escText(db.settings.tally.anchor) + "</b> を選んで貼る");
    $("tallyDlg").close();
  });

  /* パネル */
  on("pAddLink","click", addLinkToSelection);
  on("pClear","click", () => {
    if(!selCell) return;
    writeCell(selCell.d, selCell.s, {title:"", note:"", subject:null, cls:""});
    paintSheet(); fillPanel();
  });
  /* 5日ぶんを1日ずつ聞くと、窓が最大5回出る。**まとめて1回だけ聞く。** */
  on("pAll","click", () => {
    if(!selCell) return;
    const c = cellFor(selCell.d, selCell.s), sid = selCell.s;
    const days = [0,1,2,3,4];
    const hits = [];
    for(const d of days)
      for(const h of wouldOverwrite(d, sid))
        hits.push(Object.assign({}, h, {cls:h.cls + "（" + DOW[d] + "）"}));
    const put = () => {
      /* **入った日だけを数えて言う。** 休みの日・ロック中の日は writeCell が
         弾くので、5日と言い切ると、入っていない日まで入ったことになる */
      const done = [], skip = [];
      for(const d of days)
        (writeCell(d, sid, {title:c.title, note:c.note || ""}) ? done : skip).push(DOW[d]);
      paintSheet(); fillPanel();
      const what = escText(plain(c.title)) || "（空）";
      toast(!done.length
          ? whyCantWrite(days[0], sid) || "書けなかった"
          : done.length + "日を「" + what + "」にした"
            + (skip.length ? "　<b>" + skip.join("・") + "には書けなかった</b>" : ""));
    };
    if(!hits.length) return put();
    askOverwrite("この週の " + SLOT_BY_ID[sid].name
                 + (SLOT_BY_ID[sid].kind === "lesson" ? "校時" : "") + "（5日ぶん）",
                 c.title, hits, put, () => {});
  });
  for(const id of ["pTitle", "pNote"]){
    $(id).addEventListener("input", () => {
      if(!selCell) return;
      const f = $(id);
      typing = f;
      if(id === "pTitle"){
        const at = {d:selCell.d, s:selCell.s};
        const put = () => {
          const sub = SUB_BY_NAME[plain(f.innerHTML).trim()];
          writeCell(at.d, at.s, {title:f.innerHTML, subject:sub ? sub.code : null});
          paintSheet(); typing = null;
        };
        const undo = () => {
          f.innerHTML = (cellFor(at.d, at.s).title || "");
          typing = null; paintSheet();
        };
        return okToOverwrite(at.d, at.s, plain(f.innerHTML), put, undo,
                             view.kind === "special" ? normCls(plain(f.innerHTML)) : undefined);
      }
      writeCell(selCell.d, selCell.s, {note:f.innerHTML});
      paintSheet(); typing = null;
    });
  }
  /* 時数名。**手で決めた1文字の控え。** 教科コードに無い行事名の頭文字が
     紛らわしいときだけ直す。打つたびではなく、書き終えて欄を離れたときに送る
     ── 1文字だけの入力に、打ち終わっていない字を送っても意味が無い */
  on("pShort","change", () => {
    if(!selCell) return;
    writeCell(selCell.d, selCell.s, {short: $("pShort").value});
    paintSheet(); fillPanel();
  });
  /* 校外行事の名前。**紙に出す字**と**たんぽぽに出す字**を別に持つ。
     続けて置いた1本ぶんに同じ字が入る（→ compose.js setTripName）。 */
  for(const id of ["pTripName", "pTripTp"]){
    $(id).addEventListener("input", () => {
      if(!selCell) return;
      const v = $(id).value;
      const why = setTripName(selCell.d, selCell.s,
                              id === "pTripName" ? v : undefined,
                              id === "pTripTp"   ? v : undefined);
      if(why){ fillPanel(); return toast(why); }
      /* 紙の字が変わるので組み直す。**行事ごとに1回ぶんの打鍵**なので、
         ここは組み直しでよい（毎コマの打鍵とは回数が違う） */
      buildSheet();
      selectCell(selCell.d, selCell.s, cellAt(selCell.d, selCell.s));
    });
  }
}

/* ── 起動 ────────────────────────────────────── */
function start(){
  loadDb();
  onStoreError = why => toast("<b>保存できていない</b>　" + escText(why));
  Backend.setNotifier(why => toast("<b>" + why + "</b>"));
  Backend.setDirtyWatcher((n, err) => {
    saveState.n = n; saveState.err = err; paintSave();
  });
  /* **競合したことを黙って飲み込まない。** 出さないと、教師は書けたつもりで
     書けていないまま週を進める（→ dialogs.js showConflicts） */
  Backend.setConflictWatcher(list => showConflicts(list));
  wire();
  if(storeBroken) toast("<b>" + escText(storeBroken) + "</b>");

  /* **入口はすぐ出す。** シートを読み終わるまで待たない。
     入口に要るのは学級編成だけで、それはこの端末に前回ぶんが残っている。
     読み終わったら、その場で描き直す（クラスが増減していれば、そこで直る）。 */
  if(!Backend.isGas() && !Object.keys(Y().base).length) seedBase();
  if(!Backend.isGas()) saveNow();
  applyPaper();
  showGate();

  /* 設定・時程・教科・その年度は、立ち上がりの1回でまとめてもらう。
     別々に取りに行くと、その回数だけ待つことになる。 */
  Backend.boot(() => {
    /* **設定は、教職員なら誰でも触れる。**（サーバ側も同じ ── gas/Gate.gs）
       前は管理者以外から設定・管理・新年度を伏せていた。学校で3人しか
       直せないと、基本時間割や学級編成を直したい人が、その3人の手が空くのを
       待つことになる。止めるのは児童と外の人だけにした。 */
    Backend.watch();              /* 開きっぱなしの画面も、たまに読み直す */
    applyPaper();
    /* **本番では、古い週の控えをここで間引く。** 溢れてから慌てない。
       捨てた週はシートに残っているので、開けば読み直される。 */
    if(pruneWeeks(KEEP_WEEKS)) saveNow();
    if(view.kind === "gate") drawGate();
    /* 新年度の設定が未了なら、左メニューに出す。**4/1 から、済むまで。**
       立ち上がりの1回だけみに行く（週を繰るたびにみに行かない） */
    if(!Backend.isGas() || Backend.info().isAdmin) pollNewYear();
  });
  // 案内の有無でデータ初期化の成否を変えない。
  setTimeout(() => openGuide(true), 250);
}

/* 手元で見せる基本時間割。**同梱の固定時間割の写しを入れる。**
   本番では基本時間割シートから来るので、ここは通らない。 */
function seedBase(){
  const res = fixedBuiltin(), B = Y().base;
  for(const cls of res.order)
    if(allClasses().indexOf(cls) >= 0)
      B[cls] = {A:clone(res.classes[cls].A), B:clone(res.classes[cls].B)};
}

start();
