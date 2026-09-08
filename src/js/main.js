/* 起動と結線。ここだけが DOM のイベントを束ねる。 */

/* ── 合図 ────────────────────────────────────── */
let toastT = 0;
function toast(msg){
  clearTimeout(toastT);
  const t = $("toast");
  t.innerHTML = msg; t.hidden = false;
  toastT = setTimeout(() => { t.hidden = true; }, 4200);
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
  for(const [id, k] of [["abA","A"],["abB","B"],["gA","A"],["gB","B"]])
    $(id).setAttribute("aria-pressed", String(v === k));
}
function refreshWeek(){
  $("weekLabel").textContent = md(monday) + " → " + md(addDays(monday, 4));
  const n = weekNo();
  $("weekNo").textContent = (n ? "第" + n + "週　" : "") + fy() + "年度";
  syncVariant();
  if(view.kind === "tanpopo"){ drawTanpopoView(); return; }
  buildSheet();
  autoFit();
}
function goWeek(n){
  monday = addDays(monday, n);
  const fresh = !db.years[String(fy())];
  clearSelection();
  /* 本番では、その年度と週をシートから読んでから描く。手元では即その場で続く。 */
  Backend.ready(() => {
    if(view.kind === "gate") drawGate(); else refreshWeek();
    if(fresh) save();             /* 新しい年度をその場で1回だけ書き出す */
  });
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

  on("gPrev","click", () => goWeek(-7));
  on("gNext","click", () => goWeek(7));
  on("prevWk","click", () => goWeek(-7));
  on("nextWk","click", () => goWeek(7));
  on("gA","click", () => setVariant("A"));
  on("gB","click", () => setVariant("B"));
  on("abA","click", () => setVariant("A"));
  on("abB","click", () => setVariant("B"));
  on("toGate","click", showGate);
  on("target","change", e => onTargetChange(e.target.value));
  on("tpGo","click", reflectTanpopo);
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
  on("pAll","click", () => {
    if(!selCell) return;
    const c = cellFor(selCell.d, selCell.s);
    for(let d = 0; d < 5; d++){
      if(!okToOverwrite(d, selCell.s, plain(c.title))) continue;
      writeCell(d, selCell.s, {title:c.title, note:c.note || ""});
    }
    paintSheet(); fillPanel();
    toast("5日とも「" + (escText(plain(c.title)) || "（空）") + "」にした");
  });
  for(const id of ["pTitle", "pNote"]){
    $(id).addEventListener("input", () => {
      if(!selCell) return;
      const f = $(id);
      typing = f;
      if(id === "pTitle"){
        if(!okToOverwrite(selCell.d, selCell.s, plain(f.innerHTML))){
          f.innerHTML = (cellFor(selCell.d, selCell.s).title || ""); typing = null; return;
        }
        const sub = SUB_BY_NAME[plain(f.innerHTML).trim()];
        writeCell(selCell.d, selCell.s, {title:f.innerHTML, subject:sub ? sub.code : null});
      }else{
        writeCell(selCell.d, selCell.s, {note:f.innerHTML});
      }
      paintSheet(); typing = null;
    });
  }
}

/* ── 起動 ────────────────────────────────────── */
function start(){
  loadDb();
  onStoreError = why => toast("<b>保存できていない</b>　" + escText(why));
  Backend.setNotifier(why => toast("<b>" + escText(why) + "</b>"));
  wire();
  if(storeBroken) toast("<b>" + escText(storeBroken) + "</b>");

  /* 本番は「設定」「時程」「教科」シートを先に読み、続けてその年度と週を読む。
     手元（localStorage）ではどちらも素通りして、そのまま次へ進む。 */
  Backend.boot(() => Backend.ready(() => {
    /* 手元では、同梱の固定時間割を入れて見えるようにする。
       本番は基本時間割シートが正本で、空なら空のまま（取り込みで入れる） */
    if(!Backend.isGas() && !Object.keys(Y().base).length) seedBase();
    if(!Backend.isGas()) save();
    applyPaper();
    showGate();
  }));
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
