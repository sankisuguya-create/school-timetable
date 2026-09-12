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
  b.classList.toggle("dirty", !!n && !err);
  b.classList.toggle("bad", !!err);
  b.disabled = busy;
  t.textContent = busy ? "保存中…"
                : err  ? "保存できていない"
                : n    ? "保存（" + n + "）"
                       : "保存ずみ";
  b.title = err ? "もう一度押す。閉じると消える"
          : n   ? n + " コマぶんがまだシートに入っていない"
                : "シートに入っている";
}
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
  if(!show) return;
  const on = tpSubmitted(cls);
  const info = tpSubmitInfo(cls);
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  tx.textContent = on ? "たんぽぽに提出ずみ" : "たんぽぽに提出";
  b.title = on
    ? "提出ずみ" + (info && info.at ? "（" + info.at + "）" : "")
      + "　押すと取り消せる。週が変わればまた未に戻る"
    : "今週ぶんを書き終えたら押す。たんぽぽ担当の画面で「済」になる";
}
function toggleTpSub(){
  const cls = view.kind === "class" ? view.cls : "";
  if(!cls || !Wait.guard()) return;
  const on = !tpSubmitted(cls);
  const w = Wait.begin(on ? "たんぽぽへ提出しています" : "提出を取り消しています");
  Backend.tpSubmit(cls, on, () => {
    Wait.end(w); paintTpSub();
    if(view.kind === "tanpopo") drawTanpopoView();
    toast(on ? "<b>たんぽぽに提出した</b>　週が変わると、また未に戻る"
             : "提出を取り消した");
  }, why => { Wait.end(w); toast(why); });
}

function doSave(loud){
  if(!Backend.isGas()){ save(); if(loud) toast("この端末に保存した（本番ではシートへ）"); return; }
  saveState.busy = true; paintSave();
  const w = Wait.begin("シートに保存しています");
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
  const k = Math.min((st.clientWidth - 24) / w, (st.clientHeight - 20) / h);
  db.settings.vz = Math.max(30, Math.min(160, Math.round(k * 100)));
  applyZoom();
}
let fitT = 0;
addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(autoFit, 120); });

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
  $("weekLabel").textContent = md(monday) + " → " + md(addDays(monday, 4));
  const n = weekNo();
  $("weekNo").textContent = (n ? "第" + n + "週　" : "") + fy() + "年度";
  syncVariant();
  paintArchive();                 /* 週をまたぐと年度が変わる。**そのつど見る** */
  paintTpSub();                   /* 提出の印は週ごと。週をまたぐと未に戻る */
  if(view.kind === "tanpopo"){
    /* **待たせない。** 先に面を描いて、出す先は届いてから描き直す。
       出す先は1回だけ読む（週を繰るたびに読みに行かない） */
    drawTanpopoView();
    if(tpTargets === null) loadTargets();
    return;
  }
  buildSheet();
  autoFit();
}
function goWeek(n){
  Backend.flush();                /* 週を出る前に、書いたぶんを送る */
  monday = addDays(monday, n);
  const fresh = !db.years[String(fy())];
  clearSelection();
  /* **待たせない。** 手元の控えで先に描いて、シートが届いたら描き直す */
  const draw = () => {
    if(view.kind === "gate") drawGate(); else refreshWeek();
    if(fresh) save();             /* 新しい年度をその場で1回だけ書き出す */
  };
  let landed = false, drawn = false;
  Backend.ready(() => {
    landed = true;
    if(!drawn) return;
    setBusy(false);
    draw();
  });
  if(!landed) setBusy(true, "週をひらいています");
  draw();
  drawn = true;
  if(landed) setBusy(false);
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
  for(const id of ["pClear", "pRevert", "pAll", "pAddLink"]){
    const e = $(id); if(e) e.disabled = on;
  }
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
  const mod = ev.ctrlKey || ev.metaKey;
  if(!mod) return;
  const k = (ev.key || "").toLowerCase();
  /* 保存。**どの画面でも同じ。** ブラウザの「ページを保存」は横取りする
     （この画面で Ctrl+S に期待されるのは、そちらではない） */
  if(k === "s"){ ev.preventDefault(); if(Wait.guard()) doSave(true); return; }
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


  on("prevWk","click", () => goWeek(-7));
  on("nextWk","click", () => goWeek(7));

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

  on("swNo","click",  () => { $("swDlg").close(); });
  on("swYes","click", () => { owAnswer(true); $("swDlg").close(); });
  on("swDlg","close", () => owAnswer(false));
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
      if(a === "print")   return window.print();
      if(a === "settings")return openSettings();
      if(a === "outweek") return openWeekOutput();
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
  on("saveBtn","click", () => { if(Wait.guard()) doSave(true); });
  on("lockBtn","click", () => setLock(!isLocked()));
  on("tpLockBtn","click", () => { setLock(!isLocked()); drawTanpopoView(); });
  on("tpDelNo","click",  () => tpDelAnswer(false));
  on("tpDelYes","click", () => tpDelAnswer(true));
  /* ✕ や Esc で閉じたときも「外さない」。取りこぼさない */
  on("tpDelDlg","close", () => tpDelAnswer(false));
  on("tpSubBtn","click", toggleTpSub);

  /* 月の面。**見るだけ。** 直すのは週の紙のほうで */
  on("mPrev","click",  () => { mMonday = addDays(mMonday, -7 * MONTH_WEEKS); drawMonth(); });
  on("mNext","click",  () => { mMonday = addDays(mMonday,  7 * MONTH_WEEKS); drawMonth(); });
  on("mClose","click", () => showMonth(false));
  on("mPrint","click", printMonth);
  on("mImage","click", async () => {
    try{ await nodePng($("mPaper"), outputName("4週_B4")+".png"); toast("4週の画像を保存した"); }
    catch(e){ toast("画像を作れなかった（"+escText(e.message||e)+"）"); }
  });
  on("mSheet","click", exportMonthSheet);
  addEventListener("resize", () => { if(!$("monthView").hidden) fitMonth(); });
  /* 新年度の設定。**ふだんは管理・システムの中だけ。**
     未了のあいだだけ、左メニューにも出る（結線は dialogs.js） */
  on("nyOpen","click", () => { $("adminDlg").close(); openNewYearDlg(); });
  on("rsAb","click", openAbDlg);
  on("abSave","click", saveAb);
  on("evRead","click", evRead);
  on("evGo","click", evGo);
  on("setBase","click", () => { $("settingsDlg").close(); openBaseDlg(); });
  on("setRoster","click", () => { $("settingsDlg").close(); openRosterDlg(); });
  on("setTanpopo","click", () => { $("settingsDlg").close(); openView({kind:"tanpopo"}); });
  on("setPaper","click", () => { $("settingsDlg").close(); applyPaper(); $("setDlg").showModal(); });
  on("setNewYear","click", () => { $("settingsDlg").close(); openNewYearDlg(); });
  on("outPrint","click", () => { $("outDlg").close(); window.print(); });
  on("outImage","click", async () => {
    try{ await nodePng($("sheet"), outputName("B5")+".png"); $("outStat").textContent="画像を保存しました。Google Chatへ添付できます。"; }
    catch(e){ $("outStat").textContent="画像を作れませんでした（"+(e.message||e)+"）"; }
  });
  on("outSheet","click", exportWeekSheet);
  on("chipOpen","click", () => {
    if(view.kind!=="class") return;
    $("chipClass").textContent=view.cls;
    const mode=(Y().chipModes||{})[view.cls]||"screen";
    const radio=document.querySelector("input[name=chipMode][value='"+mode+"']"); if(radio) radio.checked=true;
    $("chipDlg").showModal();
  });
  on("chipSave","click", () => {
    if(view.kind!=="class") return;
    const radio=document.querySelector("input[name=chipMode]:checked");
    (Y().chipModes||(Y().chipModes={}))[view.cls]=radio?radio.value:"screen";
    save(); $("chipDlg").close(); buildSheet(); drawPalette();
    toast(view.cls+" の教科チップを変更した");
  });

  /* この日の形。**全学年の面で、日付の見出しを押すと開く**（結線は sheet.js） */
  on("dayDlg","close", () => { dayPick = 0; });

  /* たんぽぽ。**確認の窓は既定「出さない」。** 閉じ方が何であれ出さない側に落ちる */
  on("tpNo","click",  () => $("tpDlg").close());
  on("tpYes","click", () => { $("tpDlg").close(); doExportTanpopo(); });
  on("baseImp","click", openImpDlg);

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
  on("rsSp","change", e => {
    const seen = {}, out = [];
    for(const raw of String(e.target.value).split(/[,、\s]+/)){
      const label = raw.trim();
      if(!label || seen[label]) continue;
      seen[label] = 1;
      const known = SUB_BY_NAME[label];
      out.push({code: known ? known.code : "sp_" + out.length, label});
    }
    Y().specials = out; save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
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
  on("pRevert","click", () => {
    if(!selCell || view.kind !== "class") return;
    if(isLocked()) return toast("この画面はロック中");
    const key = ck(selCell.d, selCell.s);
    /* **消す前に、サーバの時刻を控える。** 消してからでは読めない。
       控えずに送ると expectedAt が 0 になり、サーバは
       「まだ無い行を消そうとしている」と見て競合で止める（消えない） */
    const was = ((week().home[view.cls] || {})[key] || {}).sat || 0;
    delete (week().home[view.cls] || {})[key];
    /* **シートにも伝える。** 前はここで手元から消すだけだったので、
       戻したように見えて、次に開くと戻ってきた。行はシートに残っていた */
    Backend.cellChanged("home", view.cls, selCell.d, selCell.s, was);
    save(); paintSheet(); fillPanel();
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
      for(const d of days) writeCell(d, sid, {title:c.title, note:c.note || ""});
      paintSheet(); fillPanel();
      toast("5日とも「" + (escText(plain(c.title)) || "（空）") + "」にした");
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
  if(!Backend.isGas()) save();
  applyPaper();
  showGate();

  /* 設定・時程・教科・その年度は、立ち上がりの1回でまとめてもらう。
     別々に取りに行くと、その回数だけ待つことになる。 */
  Backend.boot(() => {
    Backend.watch();              /* 開きっぱなしの画面も、たまに読み直す */
    applyPaper();
    /* **本番では、古い週の控えをここで間引く。** 溢れてから慌てない。
       捨てた週はシートに残っているので、開けば読み直される。 */
    if(pruneWeeks(KEEP_WEEKS)) save();
    if(view.kind === "gate") drawGate();
    /* 新年度の設定が未了なら、左メニューに出す。**4/1 から、済むまで。**
       立ち上がりの1回だけ見に行く（週を繰るたびに見に行かない） */
    pollNewYear();
  });
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
