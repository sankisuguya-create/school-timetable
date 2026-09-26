/* ==================================================================
   basedlg.js — 基本時間割まわりの窓（A週・B週・直す範囲・取り込み・A週の起点）

   基本時間割を直す窓と、その中身を固定時間割から取り込む口、
   A週の起点の月曜を決める窓。
================================================================== */

/* ── 基本時間割（A週・B週） ─────────────────────
   ここに入れたものが、週案を開いた時点で全部のコマに出る。
   担任は毎週30コマ埋めるのではなく、変えたところだけ直す。 */

let baseVar = "A";
/* 基本時間割を直す範囲。**既定は「今週以降のみ」。**
   「今年度全体」は過ぎた週の紙・時数・たんぽぽまで変えるので、選んだときだけ */
let baseScope = "week";

/* **直す途中は下書き（bsDraft）に入れ、「保存して閉じる」で一括して送る。**
   コマを変えるたびにシートへ書いていたころは、迷って元へ戻しただけでも
   全部が流れ、提出ずみの週のたんぽぽが「未」に戻っていた。
   閉じるとき直しが残っていれば「入れる／捨てる」を聞く（学級編成と同じ型） */
let bsDraft = null;         /* {base, baseFrom} 下書き。null = 窓を開いていない */
let bsBefore = null;        /* 開いた時点の控え（たんぽぽ差分の照合に使う） */
let bsDirtyCls = new Set(); /* 下書きで直したクラス */
let bsCloseWired = false;
/* 下書きがあれば下書き、無ければ本体。表の取り込みなど窓の外からの
   baseEdit もこの口を通れば「開いているあいだは下書きへ」が貫ける */
function bsStore(){
  const Yr = Y();
  return bsDraft || {base: Yr.base || (Yr.base = {}), baseFrom: Yr.baseFrom || (Yr.baseFrom = {})};
}
const bsVersions = c => (bsStore().baseFrom[c]) || [];
/* 下書きを含めて「その週に効いている版」を返す（compose.baseSetAt の下書き版） */
function bsSetAt(c, monISO){
  const st = bsStore();
  let set = st.base[c] || {};
  for(const v of (st.baseFrom[c] || [])) if(v.from <= monISO) set = v;
  return set;
}

function openSettings(){
  $("settingsFy").textContent = fy() + "年度";
  $("setPaperNow").textContent = db.settings.paper + "・タイトル"
    + (+db.settings.titlePt || 16) + "pt・詳細" + (+db.settings.notePt || 12) + "pt";
  $("settingsDlg").showModal();
}

/* 「教務必携用（B5）」。**印刷・画像・Sheet は窓を挟まない。**
   4週・学年・カレンダーと同じく、紙のとなりの帯（#weekBar）から直に押す。
   ここでは週の紙そのものへ戻るだけでよい。 */
function openWeekView(){
  if(view.kind === "gate" || view.kind === "tanpopo") return toast("先に週案を開いてください");
  if(centerOk()) setCenter("week");
}

function planValues(mon){
  const keep = monday; monday = mon;
  try{
    const out = [[viewName(), md(mon) + " → " + md(addDays(mon, 4))]
      .concat(DOW.slice(0, WEEKDAYS))];
    for(const s of SLOTS){
      const row = [s.name, s.time || ""];
      for(let d=0; d<WEEKDAYS; d++){
        const c = cellFor(d, s.id), title = plain(c.title || ""), note = plain(c.note || "");
        row.push(title + (note ? "\n" + note : ""));
      }
      out.push(row);
    }
    return out;
  } finally { monday = keep; }
}
function planParts(start, count){
  const out = [];
  for(let i=0; i<count; i++){
    const mon = addDays(start, i*7);
    out.push({name:(mon.getMonth()+1) + "月" + Math.ceil(mon.getDate()/7) + "週", values:planValues(mon)});
  }
  return out;
}
function downloadBlob(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* 紙面をそのままPNGへする。外部サービスへ週案を送らない。 */
async function nodePngBlob(node){
  /* **縮めて見せている紙は、元の大きさで測る。** 画面に合わせる zoom は
     .paper に掛かっていて、getBoundingClientRect は縮んだ大きさを返す。
     一方、画像の中の紙は zoom を引き継がず元の大きさで組まれる ──
     幅が足りず右が見切れる（実測：教務必携用を狭い窓で画像に出すと、
     右の列が途中で切れた）。測るあいだだけ zoom を 1 に戻す。 */
  const pa = node.closest(".paper"), z = pa && pa.style.zoom;
  if(pa && z) pa.style.zoom = 1;
  const r = node.getBoundingClientRect();
  if(pa && z) pa.style.zoom = z;
  /* **見えていない面は画像にできない。** 隠れた要素は幅も高さも 0 になり、
     0×0 の canvas は toBlob が null を返す ── これをそのまま downloadBlob へ
     渡すと "createObjectURL: Overload resolution failed" という、原因の
     分からない失敗になる（実測：中央のかたちを切り替えたまま「教務必携用」の
     画像を押むと、ここで空の PNG を作ろうとしていた）。
     ここで止めて、分かる理由を返す。 */
  if(r.width < 1 || r.height < 1)
    throw new Error("今見えていない面は画像にできない。その面を開いてから押す");
  const css = [...document.styleSheets].map(s => {
    try{return [...s.cssRules].map(x => x.cssText).join("\n");}catch(_){return "";}
  }).join("\n");
  const xml = new XMLSerializer().serializeToString(node.cloneNode(true));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xml}</div></foreignObject></svg>`;
  /* Blob URL の SVG は Chrome で canvas を汚染し、PNG にできない。data URL なら同一生成元として描画できる。 */
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image(); await new Promise((ok, ng) => { img.onload=ok; img.onerror=ng; img.src=url; });
  const scale=2, cv=document.createElement("canvas"); cv.width=Math.ceil(r.width*scale); cv.height=Math.ceil(r.height*scale);
  const cx=cv.getContext("2d"); cx.scale(scale,scale); cx.fillStyle="#fff"; cx.fillRect(0,0,r.width,r.height); cx.drawImage(img,0,0);
  return await new Promise(ok => cv.toBlob(ok,"image/png"));
}
async function nodePng(node, name){
  downloadBlob(await nodePngBlob(node), name);
}
/* 別窓・別タブに結果を出すときの共通の窓。
   **窓は押した瞬間に開く** ── 生成を待ってから開くと、クリックから遅れた
   window.open をブラウザがポップアップとして弾く。先に開いておき、
   中身ができたら中を差し替える（location を移す）。
   窓が弾かれたときは null で返るので、呼び元はその場合だけ従来どおりの
   報せ（リンクや保存）に退ける。 */
function openOutWindow(kind){
  const w = window.open("", "_blank");
  if(w){
    w.document.write("<body style='font-family:sans-serif;color:#666;padding:2em'>"
      + (kind || "作っています") + "…</body>");
    w.document.close();
  }
  return w;
}
const outputName = suffix => viewName().replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g,"_") + "_" + iso(monday) + "_" + suffix;
/* 別窓が開けなかったときの退避（ポップアップをブロックされたとき）。
   帯に字を書くと版面がずれるので、いつもの確認窓にリンクだけを出す ──
   自分で閉じるまで残る。トーストは数秒で消えるのでリンクには向かない */
function showOutLink(title, url, label){
  askOk({title:title,
    lines:["<a target='_blank' rel='noopener' href='" + escText(url) + "'>" + escText(label) + "</a>"],
    noLabel:"閉じる", goLabel:"開く", onYes(){ window.open(url, "_blank"); }});
}
function exportWeekSheet(){
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("週案"), planParts(monday,1), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "Google Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
function exportMonthSheet(){
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("4週"), planParts(mMonday,4), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "4週のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
/* カレンダーの面。**見えている2ヶ月を、週ごとの週案で出す。**
   カレンダー形の表は Sheet では潰れる（1コマ数行を2ヶ月分並べられない）ので、
   範囲内の週案を1週1シートで出す ── 中身は週案と同じ、枚数だけ違う */
function exportCalSheet(){
  if(!calFrom) return toast("先に2ヶ月の面を開いてください");
  const start = mondayOf(calFrom);
  const lastM = new Date(calFrom.getFullYear(), calFrom.getMonth() + CAL_MONTHS, 0);
  const count = Math.ceil((addDays(lastM, 1) - start) / (7 * 864e5));
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("2ヶ月"), planParts(start, count), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "2ヶ月のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
/* 学年の面。**開いている学年のクラスぶんを、クラスごとに1シートずつ。**
   planValues が読む「いまの面」をクラスに差し替えて組み立て、終わったら戻す */
function exportGradeSheet(){
  const list = gClasses();
  if(!list.length) return toast("この学年にクラスがありません");
  const keep = view, sheets = [];
  try{
    for(const c of list){
      view = {kind:"class", cls:c};
      sheets.push({name:c, values:planValues(monday)});
    }
  }finally{ view = keep; }
  /* 名づけに outputName は使わない ── 先頭に「いま開いている面の名前」が
     入るので、学年のまとめが「1-1 の学年ごと」になってしまう */
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(escText(gGrade) + "年_学年ごと_" + iso(monday), sheets, r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, gGrade + "年のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}

function openBaseDlg(){
  const list = allClasses();
  fillSelect($("baseCls"), list.map(c => ({v:c, t:c})),
             view.kind === "class" ? view.cls : list[0]);
  baseVar = week().variant;
  baseScope = "week";
  bsDraft  = {base: clone(Y().base || {}), baseFrom: clone(Y().baseFrom || {})};
  bsBefore = {base: clone(Y().base || {}), baseFrom: clone(Y().baseFrom || {})};
  bsDirtyCls = new Set();
  if(!bsCloseWired){
    bsCloseWired = true;
    /* 閉じ方が何であれ（✕・Esc・外側）ここへ来る。
       残っていれば聞く。既定は安全側（入れて閉じる） */
    $("baseDlg").addEventListener("close", () => {
      if(!bsDirtyCls.size){ bsDraft = null; return; }
      const cs = [...bsDirtyCls], d = bsDraft, b = bsBefore;
      bsDraft = null; bsDirtyCls = new Set();
      askOk({title:"基本時間割の直しを入れますか",
        lines:["閉じるだけでは、直したぶんはシートに入りません。",
               "入れないで閉じると、直したぶんは捨てられます。"],
        noLabel:"入れて閉じる", goLabel:"捨てる",
        onNo: () => applyBaseDraft_(d, b, cs)});
    });
  }
  drawBaseGrid();
  $("baseDlg").showModal();
}
/* 下書きを本体へ入れてシートへ送る */
function applyBaseDraft_(d, before, classes){
  if(!d) return;
  const Yr = Y();
  Yr.base = d.base; Yr.baseFrom = d.baseFrom;
  for(const c of classes)
    baseMarkTp(c, {base:(before.base || {})[c] || {},
                   from:(before.baseFrom || {})[c] || []});
  save();
  Backend.saveBaseAll(classes);
  if(view.kind !== "gate") buildSheet();
}
/* 「保存して閉じる」。直しが無ければ閉じるだけ */
function commitBaseDraft(){
  const cs = [...bsDirtyCls], d = bsDraft, b = bsBefore;
  bsDirtyCls = new Set();
  if(d && cs.length) applyBaseDraft_(d, b, cs);
  bsDraft = null;
  $("baseDlg").close();
}
/* 「まだ入れていません」を出す。未反映のときだけ保存を強調する */
function paintBaseSave(){
  if(!$("baseSave")) return;
  $("baseStat").textContent = bsDirtyCls.size ? "まだ入れていません" : "";
  $("baseSave").classList.toggle("go", bsDirtyCls.size > 0);
}

/* ── 基本時間割を直す範囲 ────────────────────────
   **今年度全体を変更**：年度はじめの版と、途中からの版の全部を同じに直す。
                         過ぎた週の紙・時数も変わる。
   **今週以降のみ変更**：開いている週の月曜から使う版を作って（無ければ、
                         いま効いている版の写しから）、その版とそれより後の版を直す。
                         それより前の週は1コマも変わらない。
   開いている週が年度はじめの週なら、2つは同じ（年度はじめの版を直す）。
   **コマ単位で直す。** 「今年度全体」で1コマ直しても、途中からの版の
   ほかのコマは残る（2学期に改めたところまで年度はじめに戻さない）。 */
const baseStartMon = () => Y().week1 || firstMonday(fy());
/* 「今週以降」の起点。年度はじめの週（とそれより前）なら ""＝年度はじめの版 */
function baseFromHere(){
  const m = wkKey();
  return m <= baseStartMon() ? "" : m;
}
/* 直す先の版を返す。**「今週以降」の版が無ければ、ここで作る。** */
function baseTargets(c){
  const st = bsStore();
  if(!st.base[c]) st.base[c] = {};
  const vers = st.baseFrom[c] || (st.baseFrom[c] = []);
  const from = baseScope === "week" ? baseFromHere() : "";
  if(!from) return [st.base[c]].concat(vers);
  if(!vers.some(v => v.from === from)){
    const cur = bsSetAt(c, from) || {};
    let at = vers.findIndex(v => v.from > from);
    if(at < 0) at = vers.length;
    vers.splice(at, 0, {from, A:clone(cur.A || {}), B:clone(cur.B || {})});
  }
  return vers.filter(v => v.from >= from);
}
/* 1週種の中身が同じか。**キーの並びに依らずに比べる。** */
function baseBankEq(a, b){
  a = a || {}; b = b || {};
  const ka = Object.keys(a), kb = Object.keys(b);
  if(ka.length !== kb.length) return false;
  for(const k of ka){
    const x = a[k], y = b[k];
    if(!y || String(x.title || "") !== String(y.title || "")
       || String(x.subject || "") !== String(y.subject || "")) return false;
  }
  return true;
}
/* **前の版と同じになった版は捨てる。** 「今週以降」で直して元へ戻したとき、
   中身の同じ版が残ると、どこで時間割が変わったのかが一覧で読めなくなる */
function baseCompact(c){
  const st = bsStore();
  let prev = st.base[c] || {};
  const keep = [];
  for(const v of (st.baseFrom[c] || [])){
    if(baseBankEq(v.A, prev.A) && baseBankEq(v.B, prev.B)) continue;
    keep.push(v); prev = v;
  }
  if(keep.length) st.baseFrom[c] = keep; else delete st.baseFrom[c];
}
/* 基本時間割を直す入口。**直す・版を片づける・提出を戻す・保存 を1本で。**
   下書きのあいだは本体を触らず、直したクラスだけ覚える ──
   本体へ入れて送るのは applyBaseDraft_（保存して閉じる／入れて閉じる）。
   たんぽぽ差分もそのとき、開いた時点の控え（bsBefore）と照らす。
   send=false は、呼ぶ側がまとめて送るとき（固定時間割の取り込み） */
function baseEdit(c, fn, send){
  const before = bsDraft ? null
    : {base: clone(Y().base[c] || {}), from: clone(baseVersions(c))};
  for(const t of baseTargets(c)) fn(t);
  baseCompact(c);
  if(bsDraft){ bsDirtyCls.add(c); paintBaseSave(); return; }
  baseMarkTp(c, before);
  save();
  if(send !== false) Backend.saveBase(c);
}
/* **提出ずみの週で、たんぽぽへ渡る字が変わったら「未」に戻す。**
   基本時間割は、担任が書いていないコマにそのまま出る。直しても「済」の
   ままだと、たんぽぽ担当は古い時間割のまま支援員を組む。
   ここで見るのは**この端末にある週**だけ。正本はサーバ（gas/Store.gs markTpBase_）で、
   ほかの週は開いたときにサーバの印で「未」になる */
function baseMarkTp(c, before){
  const Yr = Y(), slots = typeof tpSlots === "function" ? tpSlots()
        : SLOTS.filter(s => s.kind === "lesson").slice(0, 6).map(s => s.id);
  const setOf = (snap, mon) => {
    let set = snap.base || {};
    for(const v of (snap.from || [])) if(v.from <= mon) set = v;
    return set;
  };
  const now = {base: Yr.base[c] || {}, from: baseVersions(c)};
  let hit = false;
  for(const k in (Yr.weeks || {})){
    const w = Yr.weeks[k];
    if(!w || !w.tpSub || !w.tpSub[c] || w.tpSub[c].dirty) continue;
    const v = autoVariant(k);
    const a = setOf(before, k)[v] || {}, b = setOf(now, k)[v] || {};
    let diff = false;
    for(let d = 0; d < WEEKDAYS && !diff; d++)
      for(const sl of slots){
        const x = a[ck(d, sl)], y = b[ck(d, sl)];
        if(String((x || {}).title || "") !== String((y || {}).title || "")
           || String((x || {}).subject || "") !== String((y || {}).subject || "")){ diff = true; break; }
      }
    if(!diff) continue;
    w.tpSub[c].dirty = true;
    (w.tpEdited || (w.tpEdited = {}))[c] = true;
    const seq = w.tpEditSeq || (w.tpEditSeq = {});
    seq[c] = (seq[c] || 0) + 1;
    hit = true;
  }
  if(hit && typeof paintTpSub === "function") paintTpSub();
}
/* 範囲の選び方と、いまどの版を見ているかを出す */
function paintBaseScope(c){
  const from = baseFromHere(), mon = wkKey();
  $("bsWeek").textContent = "今週以降のみ変更（" + md(monday) + "の週から）";
  $("bsWeek").setAttribute("aria-pressed", String(baseScope === "week"));
  $("bsYear").setAttribute("aria-pressed", String(baseScope === "year"));
  const vers = bsVersions(c);
  const lines = [];
  if(baseScope === "year")
    lines.push("<b>4月からの全部の週が変わります。</b>過ぎた週の紙と時数も変わり、"
             + "提出ずみの週は「未」に戻ることがあります。");
  else if(!from)
    lines.push("<b>年度はじめの週なので、今年度全体と同じです。</b>");
  else
    lines.push("<b>" + md(monday) + "の週から先だけが変わります。</b>"
             + md(addDays(monday, -7)) + "の週までの紙・時数・たんぽぽはそのままです。");
  if(vers.length){
    const cur = bsSetAt(c, mon);
    const names = ["年度はじめ"].concat(vers.map(v => md(parseISO(v.from)) + "の週から"));
    const at = cur && cur.from ? names[vers.indexOf(cur) + 1] : names[0];
    lines.push(escText(c) + " の基本時間割は <b>" + names.length + " 通り</b>（"
             + names.join("／") + "）。いま出しているのは「" + at + "」のもの。");
  }
  $("baseScopeHint").innerHTML = lines.join("<br>");
}
function drawBaseGrid(){
  const c = $("baseCls").value;
  /* **その週に効いている版を出す。** 描くだけで版を作らない（作るのは直したとき） */
  const bank = ((bsSetAt(c, wkKey()) || {})[baseVar]) || {};

  const rows = ["<table class='grid2'><tr><th></th>"
    + DOW.slice(0, WEEKDAYS).map(d => "<th>" + d + "</th>").join("") + "</tr>"];
  for(const s of SLOTS){
    rows.push("<tr><th>" + s.name + "</th>");
    for(let d = 0; d < WEEKDAYS; d++){
      const v = bank[ck(d, s.id)] || {};
      rows.push("<td>" + (s.kind === "lesson"
        ? "<select class='basesub' data-subject='" + escText(v.subject || "") + "' data-k='" + ck(d, s.id) + "'><option value=''>—</option>"
          + SUBJECTS.map(x => "<option value='" + x.code + "'"
            + (v.subject === x.code ? " selected" : "") + ">" + x.name + "</option>").join("")
          + "</select>"
        : "<input data-k='" + ck(d, s.id) + "' value='" + escText(v.title || "") + "'>")
        + "</td>");
    }
    rows.push("</tr>");
  }
  $("baseGrid").innerHTML = rows.join("") + "</table>";

  const put = (k, cell) => baseEdit(c, t => {
    const b = t[baseVar] || (t[baseVar] = {});
    if(cell) b[k] = clone(cell); else delete b[k];
  });
  for(const e of $("baseGrid").querySelectorAll("select")) e.onchange = () => {
    const s = SUB_BY_CODE[e.value];
    e.dataset.subject = s ? s.code : "";
    put(e.dataset.k, s ? {title:s.name, subject:s.code} : null);
    paintBaseScope(c);
  };
  for(const e of $("baseGrid").querySelectorAll("input")) e.onchange = () => {
    put(e.dataset.k, e.value.trim() ? {title:e.value.trim(), subject:null} : null);
    paintBaseScope(c);
  };
  $("bvA").setAttribute("aria-pressed", String(baseVar === "A"));
  $("bvB").setAttribute("aria-pressed", String(baseVar === "B"));
  $("baseFy").textContent = fy() + "年度";
  paintBaseScope(c);
  paintBaseSave();
}

/* ── 固定時間割の取り込み ─────────────────────
   学校の固定時間割表を、そのままの形で読んで基本時間割にする。
   **読んですぐ入れない。** 何クラス読めたか・読めない字はどれかを先に見せる。
   入れ違いに気づかないまま20クラスぶんを入れ替えると、戻す手立てが無い。 */

let impRes = null;              /* いま読めている表 */
let impSrc = "paste";

function openImpDlg(){
  impRes = null;
  $("impText").value = "";
  drawImp();
  $("impDlg").showModal();
}
function setImpSrc(v){
  impSrc = v;
  for(const b of $("impSrc").querySelectorAll("button"))
    b.setAttribute("aria-pressed", String(b.dataset.s === v));
  $("impPasteBox").hidden = v !== "paste";
  $("impSrcNote").innerHTML =
      v === "paste"   ? "学校の表を選んで写し、ここに貼る"
    : v === "sheet"   ? "<b>固定時間割取り込み</b>シートに貼ってあるものを読む（本番のみ）"
                      : escText(FIXED_NAME) + " を読む";
  impRes = null;
  drawImp();
}

/* 貼り付けた字を表にする。エクセルから写すと、
   タブ区切りで1行1行が改行になっている。 */
function tsvGrid(text){
  return String(text).replace(/\r/g, "").split("\n").map(line => line.split("\t"));
}

function readImp(){
  if(impSrc === "builtin"){ impRes = fixedBuiltin(); return drawImp(); }
  if(impSrc === "paste"){
    const t = $("impText").value;
    if(!t.trim()){ impRes = {error:"まだ何も貼っていない"}; return drawImp(); }
    impRes = parseFixed(tsvGrid(t));
    return drawImp();
  }
  $("impStat").textContent = "シートを読んで入る…";
  Backend.readPaste(
    g => { impRes = g.length ? parseFixed(g) : {error:"シートが空だった"}; drawImp(); },
    why => { impRes = {error:why}; drawImp(); });
}

function drawImp(){
  const boxes = [], r = impRes;
  const known = r && r.order ? r.order.filter(c => allClasses().indexOf(c) >= 0) : [];
  const miss  = r && r.order ? r.order.filter(c => allClasses().indexOf(c) < 0)  : [];
  const none  = r && r.order ? allClasses().filter(c => r.order.indexOf(c) < 0)   : [];

  if(!r){
    boxes.push("<div class='box ok'>まだ読んでいない。上で選んで「読む」を押す。</div>");
  } else if(r.error){
    boxes.push("<div class='box'><b>読めなかった。</b>" + escText(r.error) + "</div>");
  } else {
    if(r.unknown && r.unknown.length)
      boxes.push("<div class='box'><b>教科として読めない字：" + r.unknown.map(escText).join("・")
        + "</b><br>そのまま題名としている。教科として数えたいときは、"
        + "「教科」シートに足してから読み直す。</div>");
    if(miss.length)
      boxes.push("<div class='box'><b>" + miss.map(escText).join("・")
        + "</b> は<b>今の学級編成に無い</b>ので入れない。"
        + "編成が古いなら「学級編成」で直してから読み直す。</div>");
    if(none.length)
      boxes.push("<div class='box'><b>" + none.map(escText).join("・")
        + "</b> は表に無かった。<b>今の基本時間割のまま</b>にする。</div>");
    for(const n of (r.notes || [])) boxes.push("<div class='box'>" + escText(n) + "</div>");
    if(!boxes.length)
      boxes.push("<div class='box ok'>" + known.length
        + " クラスぶんを読めた。気になるところは無い。</div>");
  }
  $("impWarn").innerHTML = boxes.join("");
  $("impStat").textContent = r && !r.error
    ? (r.name ? r.name + "／" : "") + known.length + " クラス・"
      + (r.periods || 0) + " 校時ぶん"
    : "";
  $("impGo").disabled = !known.length;
  /* **どこから入れ替わるかも言う**（基本時間割の窓で選んだ範囲） */
  $("impCount").innerHTML = known.length
    ? "<b>" + known.length + " クラス</b>の A週・B週を"
      + (baseScope === "week" && baseFromHere()
          ? "<b>" + md(monday) + "の週から</b>" : "<b>今年度全体で</b>")
      + "入れ替える" : "";

  /* 入れる前に、1クラスだけ表のとおりに見せる */
  $("impPickRow").hidden = !known.length;
  if(!known.length){ $("impGrid").innerHTML = ""; return; }
  const cur = known.indexOf($("impCls").value) >= 0 ? $("impCls").value : known[0];
  fillSelect($("impCls"), known.map(c => ({v:c, t:c})), cur);
  drawImpGrid(cur);
}

function drawImpGrid(cls){
  const got = impRes.classes[cls] || {A:{}, B:{}};
  const slots = lessonSlots();
  const head = "<tr><th></th><th></th>"
    + slots.map(s => "<th>" + escText(s.name) + "</th>").join("") + "</tr>";
  const body = [];
  for(let d = 0; d < WEEKDAYS; d++)
    for(const v of ["A", "B"]){
      const bank = got[v] || {};
      body.push("<tr" + (v === "B" ? " class='b'" : "") + ">"
        + (v === "A" ? "<th rowspan='2'>" + DOW[d] + "</th>" : "")
        + "<th>" + v + "週</th>"
        + slots.map(s => {
            const e = bank[ck(d, s.id)];
            const same = (got.A || {})[ck(d, s.id)], other = (got.B || {})[ck(d, s.id)];
            const diff = (same ? same.title : "") !== (other ? other.title : "");
            return "<td" + (diff ? " class='diff'" : "") + ">"
                 + (e ? escText(e.title) : "<i>—</i>") + "</td>";
          }).join("") + "</tr>");
    }
  $("impGrid").innerHTML = "<table class='tp imp'>" + head + body.join("") + "</table>";
}

/* 入れる。**いまの基本時間割は消える**ので、そこを先に言う。 */
function goImp(){
  if(!impRes || impRes.error) return;
  const known = impRes.order.filter(c => allClasses().indexOf(c) >= 0);
  if(!known.length) return;
  askOk({
    title: fy() + "年度の基本時間割を、読んだ表で入れ替えますか",
    lines: [
      "入れ替えるのは <b>" + known.length + " クラス</b>（"
        + escText(known.join("、")) + "）。<b>A週とB週の両方</b>が入れ替わります。",
      "<b>今入っている基本時間割は消えます。</b>"
        + "戻すには、もとの表をもう一度読ませることになります。",
      "週案に手で書いたものは消えません。"],
    goLabel: "入れ替える",
    onYes: () => {
      const done = applyFixed(impRes);
      toast("基本時間割に入れた（<b>" + done.length + " クラス</b>）"
        + (bsDraft ? "。<b>まだシートには入っていない</b> ── 「保存して閉じる」で送る" : ""));
      $("impDlg").close();
      if($("baseDlg").open) drawBaseGrid();
      refreshWeek();
    }
  });
}

/* ── A週の起点の月曜 ─────────────────────────
   **設定シートのこの1行だけを画面から直す。** 画面から設定を全部いじれる
   ようにすると、関門の例外リストまで画面から書けることになる。 */
function openAbDlg(){
  const now = db.settings.abAnchor || AB_ANCHOR;
  $("abDate").value = now;
  $("abNow").textContent = "今は " + now;
  $("abWhy").innerHTML = "";
  $("abDlg").showModal();
}
function saveAb(){
  const v = $("abDate").value;
  const d = parseISO(v);
  if(!d) return void ($("abWhy").innerHTML = "<div class='box'>日付を入れてください</div>");
  if(d.getDay() !== 1) return void ($("abWhy").innerHTML =
    "<div class='box'><b>月曜を入れてください。</b>月曜でない日を入れると、"
    + "以後の週が全て半週ずれます。</div>");
  if(!Wait.guard()) return;
  const w = Wait.begin("起点を入れています", true);
  Backend.saveVariantOrigin(v, () => {
    Wait.end(w); $("abDlg").close();
    refreshWeek();
    toast("A週の起点を " + v + " にした");
    if($("nyDlg").open) loadNewYear(); else pollNewYear();
  }, why => { Wait.end(w); $("abWhy").innerHTML = "<div class='box'>" + escText(why) + "</div>"; });
}

