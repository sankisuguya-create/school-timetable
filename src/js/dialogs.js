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
    save();
  };
  for(const e of $("baseGrid").querySelectorAll("input")) e.onchange = () => {
    if(e.value.trim()) bank[e.dataset.k] = {title:e.value.trim(), subject:null};
    else delete bank[e.dataset.k];
    save();
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
      save(); drawRoster(); afterRosterChange();
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
  save(); drawRoster(); afterRosterChange();
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
