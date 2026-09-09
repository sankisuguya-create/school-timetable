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
function doSave(loud){
  if(!Backend.isGas()){ save(); if(loud) toast("この端末に保存した（本番ではシートへ）"); return; }
  saveState.busy = true; paintSave(); setBusy(true, "シートに保存しています");
  Backend.flush(okAll => {
    saveState.busy = false; paintSave(); setBusy(false);
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
  const v = week().variant;
  for(const [id, k] of [["abA","A"],["abB","B"]])
    $(id).setAttribute("aria-pressed", String(v === k));
}
function refreshWeek(){
  $("weekLabel").textContent = md(monday) + " → " + md(addDays(monday, 4));
  const n = weekNo();
  $("weekNo").textContent = (n ? "第" + n + "週　" : "") + fy() + "年度";
  syncVariant();
  paintArchive();                 /* 週をまたぐと年度が変わる。**そのつど見る** */
  if(view.kind === "tanpopo"){ drawTanpopoView(); return; }
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
       : x.kind === "school"  ? "school:" : "";
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
  const b = $("lockBtn");
  if(b){
    b.hidden = !has;
    b.setAttribute("aria-pressed", String(on));
    $("lockTxt").textContent = on ? "ロック中" : "ロック";
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
function setVariant(v){ week().variant = v; save();
  if(view.kind === "gate") drawGate(); else refreshWeek(); }

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
      if(a === "print")   return window.print();
    });
  for(const b of document.querySelectorAll("[data-close]"))
    b.addEventListener("click", () => $(b.dataset.close).close());

  /* 用紙 */
  on("stPaper","change", e => { db.settings.paper = e.target.value; save(); applyPaper(); });
  on("stMg","input",  e => { db.settings.margin = +e.target.value; save(); applyPaper(); });
  on("stK","input",   e => { db.settings.k = +e.target.value; save(); applyPaper(); });
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
  on("baseClose","click", () => { $("baseDlg").close(); if(view.kind !== "gate") buildSheet(); });

  /* 保存。**打つたびには送らない。** ここで1コマ1件にまとめて送る */
  on("saveBtn","click", () => doSave(true));
  on("lockBtn","click", () => setLock(!isLocked()));

  /* たんぽぽ時間割の形 */
  on("tpShape","click", showShape);
  on("tpBuild","click", buildShape);
  on("baseImp","click", openImpDlg);

  /* 固定時間割の取り込み */
  for(const b of $("impSrc").querySelectorAll("button"))
    b.onclick = () => setImpSrc(b.dataset.s);
  on("impRead","click", readImp);
  on("impCls","change", () => drawImpGrid($("impCls").value));
  on("impGo","click", goImp);
  on("impClose","click", () => $("impDlg").close());
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
  on("rsClose","click", () => $("rosterDlg").close());

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
    delete (week().home[view.cls] || {})[ck(selCell.d, selCell.s)];
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
        return okToOverwrite(at.d, at.s, plain(f.innerHTML), put, undo);
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
    applyPaper();
    /* **本番では、古い週の控えをここで間引く。** 溢れてから慌てない。
       捨てた週はシートに残っているので、開けば読み直される。 */
    if(pruneWeeks(KEEP_WEEKS)) save();
    if(view.kind === "gate") drawGate();
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
