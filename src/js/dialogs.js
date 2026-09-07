/* 窓（基本時間割・学級編成・用紙・時数コピー・たんぽぽ）。 */

/* ── 基本時間割（A週・B週） ─────────────────────
   ここに入れたものが、週案を開いた時点で全部のコマに出る。
   担任は毎週30コマ埋めるのではなく、変えたところだけ直す。 */

let baseVar = "A";

function openBaseDlg(){
  const list = allClasses();
  fillSelect($("baseCls"), list.map(c => ({v:c, t:c})),
             view.kind === "class" ? view.cls : list[0]);
  baseVar = week().variant;
  drawBaseGrid();
  $("baseDlg").showModal();
}
function drawBaseGrid(){
  const c = $("baseCls").value, B = Y().base;
  if(!B[c]) B[c] = {};
  if(!B[c][baseVar]) B[c][baseVar] = {};
  const bank = B[c][baseVar];

  const rows = ["<table class='grid2'><tr><th></th>"
    + DOW.map(d => "<th>" + d + "</th>").join("") + "</tr>"];
  for(const s of SLOTS){
    rows.push("<tr><th>" + s.name + "</th>");
    for(let d = 0; d < 5; d++){
      const v = bank[ck(d, s.id)] || {};
      rows.push("<td>" + (s.kind === "lesson"
        ? "<select data-k='" + ck(d, s.id) + "'><option value=''>—</option>"
          + SUBJECTS.map(x => "<option value='" + x.code + "'"
            + (v.subject === x.code ? " selected" : "") + ">" + x.name + "</option>").join("")
          + "</select>"
        : "<input data-k='" + ck(d, s.id) + "' value='" + escText(v.title || "") + "'>")
        + "</td>");
    }
    rows.push("</tr>");
  }
  $("baseGrid").innerHTML = rows.join("") + "</table>";

  for(const e of $("baseGrid").querySelectorAll("select")) e.onchange = () => {
    const s = SUB_BY_CODE[e.value];
    if(s) bank[e.dataset.k] = {title:s.name, subject:s.code};
    else delete bank[e.dataset.k];
    save(); Backend.saveBase(c, baseVar);
  };
  for(const e of $("baseGrid").querySelectorAll("input")) e.onchange = () => {
    if(e.value.trim()) bank[e.dataset.k] = {title:e.value.trim(), subject:null};
    else delete bank[e.dataset.k];
    save(); Backend.saveBase(c, baseVar);
  };
  $("bvA").setAttribute("aria-pressed", String(baseVar === "A"));
  $("bvB").setAttribute("aria-pressed", String(baseVar === "B"));
  $("baseFy").textContent = fy() + "年度";
}

/* ── 学級編成 ───────────────────────────────────
   本番では「クラス」シートが正本。ここはその写し。
   **年度ごとに持つ。** 直しても前の年度は変わらない。 */

function openRosterDlg(){
  drawRoster();
  $("rosterDlg").showModal();
}
function drawRoster(){
  const Yr = Y();
  $("rsFy").textContent = fy() + "年度";
  $("rsW1").value = Yr.week1 || firstMonday(fy());
  $("rsSp").value = (Yr.specials || []).map(s => s.label).join(", ");

  $("rsRows").innerHTML = grades().map(g =>
    "<div class='row'><span>" + escText(g) + "年</span>"
    + "<input type='text' data-g='" + escText(g) + "' style='flex:1;min-width:16em' value='"
    + escText((Yr.classes[g] || []).join(", ")) + "'>"
    + "<button class='btn danger' data-del='" + escText(g) + "'>行を消す</button></div>").join("");

  for(const e of $("rsRows").querySelectorAll("input[data-g]"))
    e.onchange = () => setGradeClasses(e.dataset.g, e.value);
  for(const b of $("rsRows").querySelectorAll("button[data-del]"))
    b.onclick = () => {
      const g = b.dataset.del;
      const used = (Y().classes[g] || []).filter(hasAnyData);
      if(used.length && !confirm(g + "年を消します。\n"
        + used.join("・") + " には書き込みが残っています。\n"
        + "消しても中身は残りますが、画面からは開けなくなります。"))
        return;
      delete Y().classes[g];
      save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
    };
}
/* 「1-1, 1-2, 1-3」を配列にする。空と重複は落とす。 */
function setGradeClasses(g, text){
  const seen = {}, out = [];
  for(const raw of String(text).split(/[,、\s]+/)){
    const n = normCls(raw);
    if(!n || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  const gone = (Y().classes[g] || []).filter(c => out.indexOf(c) < 0 && hasAnyData(c));
  if(gone.length && !confirm(gone.join("・") + " を外します。\n"
    + "書き込みは残りますが、画面からは開けなくなります。")) { drawRoster(); return; }
  Y().classes[g] = out;
  save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
}
/* そのクラスに何か入っているか（外す前に知らせるため） */
function hasAnyData(c){
  const Yr = Y();
  if(Yr.base[c]) return true;
  for(const k in Yr.weeks){
    const w = Yr.weeks[k];
    if((w.home && w.home[c] && Object.keys(w.home[c]).length)
    || (w.special && w.special[c] && Object.keys(w.special[c]).length)) return true;
  }
  return false;
}
function afterRosterChange(){
  if(view.kind === "class" && allClasses().indexOf(view.cls) < 0) showGate();
  else if(view.kind === "grade" && grades().indexOf(view.grade) < 0) showGate();
  else { drawPalette(); if(view.kind !== "gate") paintSheet(); else drawGate(); }
}

/* ── 用紙 ────────────────────────────────────── */

function applyPaper(){
  const s = db.settings, sh = $("sheet");
  const [w, h] = s.paper === "A4" ? ["210mm", "297mm"] : ["182mm", "257mm"];
  sh.style.setProperty("--pw", w);
  sh.style.setProperty("--ph", h);
  sh.style.setProperty("--pm", s.margin + "mm");
  sh.style.setProperty("--k", s.k);
  let st = $("pagecss");
  if(!st){ st = el("style"); st.id = "pagecss"; document.head.appendChild(st); }
  st.textContent = "@page{size:" + s.paper + " portrait;margin:" + s.margin + "mm}";
  $("stPaper").value = s.paper;
  $("stMg").value = s.margin;  $("stMgV").textContent = s.margin;
  $("stK").value  = s.k;       $("stKV").textContent  = (+s.k).toFixed(2);
  autoFit();
}

/* ── 時数集計表へのコピー ───────────────────────
   週ごとのシートに1回で貼れる矩形にする。空のセルも含める。
   数えない教科は空欄にする（書くと Excel 側の出現数の集計が増える）。 */

const tallyClasses = () =>
  String(db.settings.tally.classes || "").split(/[,、\s]+/).filter(Boolean);

function tallyGrid(){
  const t = db.settings.tally;
  const list = tallyClasses(), block = Math.max(1, +t.block || 10);
  const width = Math.max.apply(null, Object.keys(t.cols).map(k => t.cols[k])) + 1;
  const rows = [];
  for(let d = 0; d < 5; d++) for(let r = 0; r < block; r++){
    const line = new Array(width).fill("");
    if(r < list.length){
      for(const s of SLOTS){
        if(!(s.id in t.cols)) continue;
        const c = compose(list[r], d, s.id);
        const sub = c.subject ? SUB_BY_CODE[c.subject] : SUB_BY_NAME[plain(c.title).trim()];
        line[t.cols[s.id]] = (sub && sub.count) ? sub.short : "";
      }
    }
    rows.push(line);
  }
  return rows;
}
const tallyTsv = () => tallyGrid().map(r => r.join("\t")).join("\n");

function openTallyDlg(){
  const t = db.settings.tally;
  $("tyAnchor").value = t.anchor;
  $("tyCls").value    = t.classes;
  $("tyBlock").value  = t.block;
  $("tyCols").innerHTML = "<span>列のずれ</span>" + SLOTS.filter(s => s.id in t.cols)
    .map(s => "<label style='font-size:12px;color:var(--tx-sub)'>" + (s.tally || s.name)
      + " <input type='number' data-s='" + s.id + "' value='" + t.cols[s.id]
      + "' min='0' max='40' style='width:4.4em'></label>").join("");
  for(const e of $("tyCols").querySelectorAll("input")) e.oninput = () => {
    t.cols[e.dataset.s] = +e.value || 0; save(); drawTallyPreview();
  };
  drawTallyPreview();
  $("tallyDlg").showModal();
}
function drawTallyPreview(){
  const g = tallyGrid(), list = tallyClasses();
  const block = Math.max(1, +db.settings.tally.block || 10);
  $("tyPrev").textContent = g.map((r, i) => {
    const d = Math.floor(i / block), r0 = i % block;
    let who = r0 < list.length ? (r0 === 0 ? DOW[d] + "  " + list[r0] : "   " + list[r0]) : "";
    while(who.length < 10) who += " ";
    return who + "│ " + r.map(v => v || "·").join(" ");
  }).join("\n");
}
async function copyText(text, msg){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){
    const ta = el("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); }catch(_){}
    ta.remove();
  }
  toast(msg);
}

function fillSelect(sel, arr, val){
  sel.innerHTML = arr.map(o => "<option value='" + escText(o.v) + "'"
    + (o.v === val ? " selected" : "") + ">" + escText(o.t) + "</option>").join("");
}

/* ── たんぽぽ時間割のプレビュー ─────────────────
   実物（たんぽぽ時間割 週案シート）の列構成をそのまま使う。
   B〜AA が児童ごとの列（見出しはその日の交流学級）、AB 以降は支援員・ボランティア。
   **担当の行（交：／た：／支：）が、書くか書かないかを決める**（docs/spec.md 7節）。 */

const TANPOPO_COLS = [
  {col:"B", cls:"1-3"}, {col:"C", cls:"2-3"}, {col:"D", cls:"3-2"}, {col:"E", cls:"4-1"},
  {col:"F", cls:"4-4"}, {col:"G", cls:"5-4"}, {col:"H", cls:"1-1"}, {col:"I", cls:"1-3"},
  {col:"J", cls:"1-2"}, {col:"K", cls:"1-2"}, {col:"L", cls:"4-2"}, {col:"M", cls:"4-3"},
  {col:"N", cls:"4-4"}, {col:"O", cls:"5-2"}, {col:"P", cls:"5-3"}, {col:"Q", cls:"5-3"},
  {col:"R", cls:"5-4"}, {col:"S", cls:"6-3"}, {col:"T", cls:"6-3"}, {col:"U", cls:"2-1"},
  {col:"V", cls:"2-2"}, {col:"W", cls:"3-1"}, {col:"X", cls:"3-1"}, {col:"Y", cls:"3-3"},
  {col:"Z", cls:"3-3"}, {col:"AA", cls:"6-1"},
  {col:"AB", cls:"大屋", staff:true},   {col:"AC", cls:"丸山", staff:true},
  {col:"AD", cls:"日外", staff:true},   {col:"AE", cls:"喜田", staff:true},
  {col:"AF", cls:"星川", staff:true},   {col:"AG", cls:"秋山", staff:true},
  {col:"AH", cls:"内田", staff:true},   {col:"AI", cls:"ボランティア", staff:true}
];
/* 担当の見本。**実物ではシートの担当行を読む。** ここは見え方を確かめるための仮置き */
const TANPOPO_DUTY = ["交：丸山", "た：桝村", "交：星川", "た：西本",
                      "", "交：朝倉", "支：大屋", "た：安部"];
const TANPOPO_SLOTS = ["p1", "p2", "p3", "p4", "p5", "p6"];
let tpDay = 0;

/* 1セルぶんの判定。docs/spec.md 7節の規則そのまま */
function tanpopoCell(colIdx, col, slotId){
  if(col.staff) return {skip:"支援員の列"};
  const duty = TANPOPO_DUTY[(colIdx * 3 + TANPOPO_SLOTS.indexOf(slotId) * 5) % TANPOPO_DUTY.length];
  if(duty.indexOf("た：") === 0) return {skip:"たんぽぽで受ける", duty};
  if(duty.indexOf("支：") === 0) return {skip:"支援員が付く",     duty};
  if(allClasses().indexOf(col.cls) < 0) return {skip:"編成に無いクラス", duty};
  const c = compose(col.cls, tpDay, slotId);
  const t = plain(c.title).trim();
  if(!t) return {skip:"こちらが空", duty};
  return {write:t, duty};
}

function openTanpopoDlg(){
  drawTanpopo();
  $("tpDlg").showModal();
}
function drawTanpopo(){
  $("tpDays").innerHTML = DOW.map((d, i) =>
    "<button" + (i === tpDay ? " aria-pressed='true'" : "") + " data-d='" + i + "'>"
    + d + "</button>").join("");
  for(const b of $("tpDays").querySelectorAll("button"))
    b.onclick = () => { tpDay = +b.dataset.d; drawTanpopo(); };

  let write = 0, skip = 0;
  const head = "<tr><th>列</th><th>交流学級</th>"
    + TANPOPO_SLOTS.map(s => "<th>" + SLOT_BY_ID[s].name + "</th>").join("") + "</tr>";
  const body = TANPOPO_COLS.map((col, i) => {
    const cells = TANPOPO_SLOTS.map(s => {
      const r = tanpopoCell(i, col, s);
      if(r.write){ write++; return "<td class='w'><b>" + escText(r.write) + "</b></td>"; }
      skip++;
      return "<td class='s'>" + escText(r.skip) + "</td>";
    }).join("");
    return "<tr" + (col.staff ? " class='staff'" : "") + "><th>" + col.col + "</th>"
         + "<th>" + escText(col.cls) + "</th>" + cells + "</tr>";
  }).join("");
  $("tpGrid").innerHTML = "<table class='tp'>" + head + body + "</table>";
  $("tpSum").innerHTML = "この曜日は <b>" + write + " セル</b>を書き換え、"
    + "<b>" + skip + " セル</b>は触らない。";
}
