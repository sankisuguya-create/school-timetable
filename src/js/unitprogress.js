/* ==================================================================
   unitprogress.js — 単元進捗の管理画面（Phase 2）

   ここでは「単元を作る・直す・消す」と学期設定だけを扱う。
   時間割セルへの表示・起点配置・ドラッグ移動は次の段階。
================================================================== */

const unitState = {
  cls:"", subject:"", terms:[], termVersion:"[]", units:[], editing:"", loading:false
};

/* 時間割に出す単元は、通常の週読込と分離して後から読む。
   同じ学級/専科を見ているあいだは2分キャッシュし、週送りのたびに読まない。 */
const unitViewState = {
  key:"", units:[], terms:[], loading:false, loadedAt:0, placing:"", error:""
};
const UNIT_VIEW_CACHE_MS = 120000;

function unitViewScope_(){
  if(typeof view === "undefined") return null;
  if(view.kind === "class")
    return {key:fy()+"|class|"+view.cls, cls:view.cls, subject:""};
  if(view.kind === "special")
    return {key:fy()+"|special|"+view.sp, cls:"", subject:spSubjectOf(view.sp)};
  return null;
}
function invalidateUnitView_(){
  unitViewState.loadedAt = 0;
}
function ensureUnitView_(force){
  const sc = unitViewScope_();
  if(!sc){
    unitViewState.key=""; unitViewState.units=[]; unitViewState.terms=[];
    unitViewState.loading=false; unitViewState.loadedAt=0; unitViewState.error="";
    return;
  }
  if(unitViewState.key !== sc.key){
    unitViewState.key=sc.key; unitViewState.units=[]; unitViewState.terms=[];
    unitViewState.loading=false; unitViewState.loadedAt=0; unitViewState.error="";
  }
  if(unitViewState.loading) return;
  if(!force && unitViewState.loadedAt
     && Date.now() - unitViewState.loadedAt < UNIT_VIEW_CACHE_MS) return;
  unitViewState.loading = true;
  unitViewState.error = "";
  paintUnitQuick();
  Backend.unitManager(sc.cls, sc.subject, r => {
    /* 返事が来る間に別の面へ移ったら、その面へ混ぜない */
    const now = unitViewScope_();
    if(!now || now.key !== sc.key) return;
    unitViewState.loading=false;
    unitViewState.loadedAt=Date.now();
    unitViewState.units=(r && r.units) || [];
    unitViewState.terms=(r && r.terms) || [];
    paintUnitQuick();
    if(document.getElementById("sheet")) paintSheet();
  }, why => {
    const now = unitViewScope_();
    if(!now || now.key !== sc.key) return;
    unitViewState.loading=false;
    unitViewState.error=String(why || "単元を読めませんでした");
    paintUnitQuick();
  });
}
function refreshUnitView_(){
  invalidateUnitView_();
  ensureUnitView_(true);
}
function unitCellContext_(d, s, c){
  const sl = SLOT_BY_ID[s];
  if(!sl || sl.kind !== "lesson") return null;
  c = c || cellFor(d, s);
  if(view.kind === "class"){
    const counted = countSub(c);
    const sub = rootSubject(c.subject || (counted && counted.code) || "");
    return sub ? {cls:view.cls, subject:sub} : null;
  }
  if(view.kind === "special"){
    const cls = c.cls || normCls(plain(c.title || ""));
    return cls ? {cls:cls, subject:spSubjectOf(view.sp)} : null;
  }
  return null;
}
function unitShortName_(name){
  return Array.from(String(name || "")).slice(0,3).join("");
}
function unitAtCell(d, s, c){
  const cx = unitCellContext_(d, s, c);
  if(!cx || !unitViewState.loadedAt) return null;
  const key = iso(addDays(monday, d)) + "|" + s;
  for(const u of unitViewState.units){
    if(u.className !== cx.cls || u.subject !== cx.subject) continue;
    const n = (u.assignments || []).indexOf(key);
    if(n >= 0) return {unit:u, index:n, test:false, key:key};
    if(u.testAssignment === key) return {unit:u, index:-1, test:true, key:key};
  }
  return null;
}
function unitMarkForCell(d, s, c){
  const hit = unitAtCell(d, s, c);
  if(!hit) return null;
  const u = hit.unit, head = unitShortName_(u.name);
  return {
    unit:u,
    label: hit.test ? head + "テスト" : head + (hit.index + 1) + "/" + u.lessonCount,
    full: hit.test ? u.name + " テスト"
                   : u.name + " " + (hit.index + 1) + "/" + u.lessonCount,
    test:hit.test
  };
}
function paintUnitMark(e, c, d, s){
  const mark = unitMarkForCell(d, s, c);
  let box = e.querySelector(".unitmark");
  if(!mark){
    if(box) box.remove();
    e.classList.remove("has-unit");
    delete e.dataset.unit;
    return;
  }
  if(!box){
    box = el("span", "unitmark");
    const n = e.querySelector(".n");
    if(n) e.insertBefore(box, n); else e.appendChild(box);
  }
  if(box.textContent !== mark.label) box.textContent = mark.label;
  box.title = mark.full;
  box.setAttribute("aria-label", mark.full);
  e.dataset.unit = mark.unit.id;
  e.classList.add("has-unit");
}
function unitQuickStatus_(u){
  const n=(u.assignments || []).length;
  if(!n && !u.testAssignment) return "未配置";
  return n + "/" + u.lessonCount + (u.hasTest ? (u.testAssignment ? "＋テスト" : "＋テスト未") : "");
}
function paintUnitQuick(){
  const wrap=$("unitQuick"), box=$("unitPals"), hint=$("unitQuickHint");
  if(!wrap || !box || !hint) return;
  const sc=unitViewScope_();
  if(!sc){ wrap.hidden=true; return; }
  wrap.hidden=false;
  if(unitViewState.key !== sc.key || unitViewState.loading){
    hint.hidden=false; hint.textContent="単元を読み込んでいます…"; box.innerHTML=""; return;
  }
  if(unitViewState.error){
    hint.hidden=false; hint.textContent=unitViewState.error; box.innerHTML=""; return;
  }
  if(!unitViewState.loadedAt){
    hint.hidden=false; hint.textContent="単元を読み込んでいます…"; box.innerHTML="";
    ensureUnitView_(); return;
  }
  if(!selCell){
    hint.hidden=false; hint.textContent="コマを選ぶと、その教科の単元が出ます。"; box.innerHTML=""; return;
  }
  const cx=unitCellContext_(selCell.d, selCell.s);
  if(!cx){
    hint.hidden=false; hint.textContent="授業のコマを選ぶと単元チップが出ます。"; box.innerHTML=""; return;
  }
  const list=unitViewState.units.filter(u => u.className===cx.cls && u.subject===cx.subject);
  if(!list.length){
    hint.hidden=false; hint.textContent="この教科の単元はまだ登録されていません。"; box.innerHTML=""; return;
  }
  hint.hidden=true;
  box.innerHTML=list.map(u =>
    "<button class='unitpal' type='button' draggable='true' data-unit='"+escText(u.id)
    +"' data-subject='"+escText(u.subject)+"'"+(unitViewState.placing ? " disabled" : "")+">"
    +"<b>"+escText(u.name)+"</b><small>"+escText(unitQuickStatus_(u))+"</small></button>"
  ).join("");
  for(const b of box.querySelectorAll(".unitpal")){
    b.onclick=()=>placeUnitAt(b.dataset.unit, selCell.d, selCell.s);
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-unit-progress", b.dataset.unit);
      ev.dataTransfer.effectAllowed="copy";
    });
  }
}
function placeUnitAt(id, d, s){
  if(unitViewState.placing) return;
  const u=unitViewState.units.find(x => x.id===id);
  if(!u) return toast("単元情報を読み直してください");
  const c=cellFor(d,s), cx=unitCellContext_(d,s,c);
  if(!cx || cx.cls!==u.className || cx.subject!==u.subject)
    return toast("この単元は、このコマの教科・クラスには置けません");
  const date=iso(addDays(monday,d));
  unitViewState.placing=id; paintUnitQuick();
  Backend.placeUnitProgress(u.id, u.updatedAt, date, s, r => {
    unitViewState.placing="";
    const saved=r && r.unit;
    if(saved){
      const i=unitViewState.units.findIndex(x=>x.id===saved.id);
      if(i>=0) unitViewState.units[i]=saved;
      unitViewState.loadedAt=Date.now();
    }
    paintSheet(); paintUnitQuick();
    const warn=unitWarningText_(r && r.warning);
    const act=(r && r.action)==="reset" ? "配置をすべて外しました"
             :(r && r.action)==="excluded" ? "このコマを外し、後ろを詰めました"
             :"起点から自動配置しました";
    toast("<b>"+escText(u.name)+"</b>："+act+(warn ? "<br>"+escText(warn) : ""));
  }, why => {
    unitViewState.placing="";
    invalidateUnitView_(); ensureUnitView_(true);
    toast("<b>単元を配置できませんでした。</b><br>"+escText(String(why || "")));
  });
}


function unitSubjects_(){
  return SUBJECTS.filter(s => s.count && !s.only);
}
function unitContext_(){
  if(typeof view === "undefined") return null;
  if(view.kind === "class")
    return {kind:"class", classes:[view.cls], subjects:unitSubjects_()};
  if(view.kind === "special"){
    const code = spSubjectOf(view.sp), sub = SUB_BY_CODE[code];
    return {kind:"special", classes:classesOfSpecial(view.sp),
            subjects:sub ? [sub] : []};
  }
  return null;
}
function paintUnitManagerButton(){
  const wrap = $("unitEntry");
  if(!wrap) return;
  const ctx = unitContext_();
  wrap.hidden = !ctx;
  if(!ctx) return;
  const sub = ctx.kind === "special" ? (ctx.subjects[0] || {}).name
             : unitState.subject && SUB_BY_CODE[unitState.subject]
               ? SUB_BY_CODE[unitState.subject].name : "";
  $("unitOpenSub").textContent = ctx.kind === "special"
    ? ((sub || "専科") + "・クラスごと")
    : "教科ごとの単元と授業数";
  ensureUnitView_();
  paintUnitQuick();
}

function unitSelectHtml_(list, value, valueOf, labelOf){
  return list.map(x => {
    const v = valueOf(x), t = labelOf(x);
    return "<option value='" + escText(v) + "'" + (v === value ? " selected" : "") + ">"
      + escText(t) + "</option>";
  }).join("");
}
function unitDefaultSubject_(){
  const ctx = unitContext_();
  if(!ctx || !ctx.subjects.length) return "";
  if(ctx.kind === "special") return ctx.subjects[0].code;
  if(selCell){
    const c = cellFor(selCell.d, selCell.s);
    const code = rootSubject(c.subject || "");
    if(ctx.subjects.some(s => s.code === code)) return code;
  }
  if(unitState.subject && ctx.subjects.some(s => s.code === unitState.subject))
    return unitState.subject;
  return ctx.subjects[0].code;
}
function unitDefaultClass_(){
  const ctx = unitContext_();
  if(!ctx || !ctx.classes.length) return "";
  if(ctx.kind === "class") return ctx.classes[0];
  if(selCell){
    const c = cellFor(selCell.d, selCell.s);
    if(c.cls && ctx.classes.indexOf(c.cls) >= 0) return c.cls;
  }
  if(unitState.cls && ctx.classes.indexOf(unitState.cls) >= 0) return unitState.cls;
  return ctx.classes[0];
}

function openUnitManager(){
  const ctx = unitContext_();
  if(!ctx) return toast("単元進捗管理は<b>学級または専科の週案</b>で使います");
  unitState.cls = unitDefaultClass_();
  unitState.subject = unitDefaultSubject_();
  unitState.editing = "";
  drawUnitContext_();
  $("unitForm").hidden = true;
  $("unitStat").textContent = "読み込んでいます…";
  $("unitList").innerHTML = "";
  $("unitDlg").showModal();
  loadUnitManager();
}
function drawUnitContext_(){
  const ctx = unitContext_();
  if(!ctx) return;
  $("unitFy").textContent = fy() + "年度";
  $("unitCls").innerHTML = unitSelectHtml_(ctx.classes, unitState.cls, x => x, x => x);
  $("unitSub").innerHTML = unitSelectHtml_(ctx.subjects, unitState.subject, x => x.code, x => x.name);
  $("unitCls").disabled = ctx.kind === "class";
  $("unitSub").disabled = ctx.kind === "special";
}
function loadUnitManager(after){
  if(unitState.loading) return;
  unitState.loading = true;
  $("unitStat").textContent = "読み込んでいます…";
  Backend.unitManager(unitState.cls, unitState.subject, r => {
    unitState.loading = false;
    unitState.terms = (r && r.terms) || [];
    unitState.termVersion = (r && r.termVersion) || "[]";
    unitState.units = (r && r.units) || [];
    renderUnitManager_();
    if(after) after();
  }, why => {
    unitState.loading = false;
    $("unitStat").textContent = why;
  });
}
function shortDate_(iso){
  const p = String(iso || "").split("-");
  return p.length === 3 ? (+p[1]) + "/" + (+p[2]) : iso;
}
function renderUnitTerm_(){
  const box = $("unitTermInfo");
  if(!unitState.terms.length){
    box.className = "unitterm warn";
    box.innerHTML = "<span><b>学期の期間が未設定</b><small>単元登録はできます。自動配置と学期末警告には期間が必要です。</small></span>"
      + "<button class='btn' id='unitTermOpen'>学期を設定</button>";
  }else{
    box.className = "unitterm";
    box.innerHTML = "<span><b>学期</b><small>"
      + unitState.terms.map(t => escText(t.name) + " " + shortDate_(t.start) + "〜" + shortDate_(t.end)).join("　")
      + "</small></span><button class='btn' id='unitTermOpen'>期間を直す</button>";
  }
  $("unitTermOpen").onclick = openUnitTerms;
}
function unitStatus_(u){
  const n = (u.assignments || []).length;
  if(!n && !u.testAssignment) return "未配置";
  let s = n + "/" + u.lessonCount + " 配置";
  if(u.hasTest) s += u.testAssignment ? "・テスト配置" : "・テスト未配置";
  return s;
}
function renderUnitList_(){
  const box = $("unitList");
  if(!unitState.units.length){
    box.innerHTML = "<div class='unitempty'>まだ単元がありません。<br>「新しい単元」から、単元名と授業数だけ登録します。</div>";
    return;
  }
  box.innerHTML = unitState.units.map(u =>
    "<button class='unitrow' data-unit='" + escText(u.id) + "'>"
    + "<span><b>" + escText(u.name) + "</b><small>"
    + u.lessonCount + "時間" + (u.hasTest ? "＋テスト" : "") + "</small></span>"
    + "<em>" + escText(unitStatus_(u)) + "</em></button>").join("");
  for(const b of box.querySelectorAll("[data-unit]"))
    b.onclick = () => editUnit_(b.dataset.unit);
}
function renderUnitManager_(){
  drawUnitContext_();
  renderUnitTerm_();
  renderUnitList_();
  $("unitStat").textContent = "";
}
function newUnit_(){
  unitState.editing = "";
  $("unitFormTitle").textContent = "新しい単元";
  $("unitName").value = "";
  $("unitCount").value = "1";
  $("unitTest").checked = false;
  $("unitDanger").hidden = true;
  $("unitWarn").hidden = true;
  $("unitForm").hidden = false;
  $("unitName").focus();
}
function editUnit_(id){
  const u = unitState.units.find(x => x.id === id);
  if(!u) return;
  unitState.editing = id;
  $("unitFormTitle").textContent = "単元を直す";
  $("unitName").value = u.name || "";
  $("unitCount").value = String(u.lessonCount || 1);
  $("unitTest").checked = !!u.hasTest;
  $("unitDanger").hidden = false;
  $("unitWarn").hidden = true;
  $("unitForm").hidden = false;
  $("unitName").focus();
}
function unitCountStep_(n){
  const e = $("unitCount");
  e.value = String(Math.max(1, Math.min(99, (+e.value || 1) + n)));
}
function unitWarningText_(w){
  if(!w) return "";
  const bits = [];
  if(w.missingLessons) bits.push("授業 " + w.missingLessons + "時間");
  if(w.missingTest) bits.push("テスト");
  return "学期末までに " + bits.join("・") + " が入りきりません。配置済みの分は残しています。";
}
function saveUnitForm_(){
  const name = $("unitName").value.trim(), n = Math.floor(+$("unitCount").value || 0);
  if(!name) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "単元名を入れてください。");
  if(n < 1 || n > 99) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "授業数は1〜99時間です。");
  const old = unitState.units.find(x => x.id === unitState.editing);
  const input = {
    id: old ? old.id : "",
    expectedUpdatedAt: old ? old.updatedAt : "",
    className: unitState.cls,
    subject: unitState.subject,
    name:name, lessonCount:n, hasTest:$("unitTest").checked
  };
  $("unitSave").disabled = true;
  $("unitStat").textContent = "保存しています…";
  Backend.saveUnitProgress(input, r => {
    $("unitSave").disabled = false;
    const saved = r && r.unit;
    if(saved){
      const i = unitState.units.findIndex(x => x.id === saved.id);
      if(i >= 0) unitState.units[i] = saved; else unitState.units.push(saved);
      unitState.editing = saved.id;
      renderUnitList_();
      editUnit_(saved.id);
    }
    const msg = unitWarningText_(r && r.warning);
    $("unitWarn").hidden = !msg;
    $("unitWarn").textContent = msg;
    $("unitStat").textContent = msg ? "保存しました。学期末の不足があります。" : "保存しました。";
    refreshUnitView_();
  }, why => {
    $("unitSave").disabled = false;
    $("unitStat").textContent = why;
  });
}
function unitListVersion_(){
  return (unitState.units || []).map(u => u.id + "@" + String(u.updatedAt || "")).sort().join("|");
}
function resetAllUnits_(){
  if(!unitState.units.length) return toast("リセットする単元がありません");
  const sub = (SUB_BY_CODE[unitState.subject] || {}).name || unitState.subject;
  askOk({
    title:unitState.cls + "・" + sub + " の配置をすべてリセットしますか",
    lines:["<b>この画面に並んでいる単元すべて</b>の進捗配置を外します。",
           "単元名・授業数・テスト設定は残ります。ほかの教科には影響しません。"],
    goLabel:"この教科の配置を全リセット",
    onYes:() => Backend.resetUnitProgressAll(
      unitState.cls, unitState.subject, unitListVersion_(),
      list => {
        unitState.units = list || [];
        const id = unitState.editing;
        renderUnitList_();
        if(id && unitState.units.some(x => x.id === id)) editUnit_(id);
        $("unitStat").textContent = "この教科の単元配置をすべてリセットしました。";
        refreshUnitView_();
      },
      why => $("unitStat").textContent = why)
  });
}

function resetUnit_(){
  const u = unitState.units.find(x => x.id === unitState.editing);
  if(!u) return;
  askOk({
    title:"「" + u.name + "」の配置をリセットしますか",
    lines:["<b>単元そのものは残します。</b>",
           "時間割に置いた進捗だけを全部外し、あとで起点から置き直せる状態に戻します。"],
    goLabel:"配置をリセット",
    onYes:() => Backend.resetUnitProgress(u.id, u.updatedAt, saved => {
      const i = unitState.units.findIndex(x => x.id === saved.id);
      if(i >= 0) unitState.units[i] = saved;
      renderUnitList_(); editUnit_(saved.id); $("unitStat").textContent = "配置をリセットしました。";
      refreshUnitView_();
    }, why => $("unitStat").textContent = why)
  });
}
function deleteUnit_(){
  const u = unitState.units.find(x => x.id === unitState.editing);
  if(!u) return;
  askOk({
    title:"「" + u.name + "」を削除しますか",
    lines:["<b>単元の登録そのものを削除します。</b>時間割への配置情報も消えます。",
           "配置だけを外したい場合は「配置をリセット」を使ってください。"],
    goLabel:"単元を削除",
    onYes:() => Backend.deleteUnitProgress(u.id, u.updatedAt, () => {
      unitState.units = unitState.units.filter(x => x.id !== u.id);
      unitState.editing = ""; $("unitForm").hidden = true; renderUnitList_();
      $("unitStat").textContent = "単元を削除しました。";
      refreshUnitView_();
    }, why => $("unitStat").textContent = why)
  });
}

/* ── 学期設定 ─────────────────────────────────── */
let termDraft = [];
function openUnitTerms(){
  termDraft = clone(unitState.terms);
  if(!termDraft.length) termDraft.push({name:"", start:"", end:""});
  drawTermRows_();
  $("termStat").textContent = "";
  $("termDlg").showModal();
}
function drawTermRows_(){
  const box = $("termRows");
  box.innerHTML = termDraft.map((t,i) =>
    "<div class='termrow' data-ti='" + i + "'>"
    + "<input data-tf='name' value='" + escText(t.name || "") + "' placeholder='学期名（例：1学期）' aria-label='学期名'>"
    + "<input data-tf='start' type='date' value='" + escText(t.start || "") + "' aria-label='開始日'>"
    + "<span>〜</span><input data-tf='end' type='date' value='" + escText(t.end || "") + "' aria-label='終了日'>"
    + "<button class='btn danger' data-tdel='" + i + "'>消す</button></div>").join("");
  for(const inp of box.querySelectorAll("[data-tf]"))
    inp.oninput = () => {
      const i = +inp.closest(".termrow").dataset.ti;
      termDraft[i][inp.dataset.tf] = inp.value;
    };
  for(const b of box.querySelectorAll("[data-tdel]"))
    b.onclick = () => { termDraft.splice(+b.dataset.tdel, 1); drawTermRows_(); };
}
function saveTermRows_(){
  const rows = termDraft.filter(t => t.name || t.start || t.end);
  $("termSave").disabled = true;
  $("termStat").textContent = "保存しています…";
  Backend.saveUnitTerms(rows, unitState.termVersion, r => {
    $("termSave").disabled = false;
    unitState.terms = (r && r.terms) || [];
    unitState.termVersion = (r && r.version) || JSON.stringify(unitState.terms);
    renderUnitTerm_();
    $("termDlg").close();
    $("unitStat").textContent = "学期の期間を保存しました。";
    refreshUnitView_();
  }, why => {
    $("termSave").disabled = false;
    $("termStat").textContent = why;
  });
}

function wireUnitProgress(){
  const on = (id, ev, fn) => { const e=$(id); if(e) e.addEventListener(ev, fn); };
  on("unitOpen","click",openUnitManager);
  on("unitCls","change",e => { unitState.cls=e.target.value; unitState.editing=""; $("unitForm").hidden=true; loadUnitManager(); });
  on("unitSub","change",e => { unitState.subject=e.target.value; unitState.editing=""; $("unitForm").hidden=true; loadUnitManager(); });
  on("unitNew","click",newUnit_);
  on("unitResetAll","click",resetAllUnits_);
  on("unitCancel","click",() => { unitState.editing=""; $("unitForm").hidden=true; $("unitWarn").hidden=true; });
  on("unitMinus","click",() => unitCountStep_(-1));
  on("unitPlus","click",() => unitCountStep_(1));
  on("unitSave","click",saveUnitForm_);
  on("unitReset","click",resetUnit_);
  on("unitDelete","click",deleteUnit_);
  on("termAdd","click",() => { termDraft.push({name:"",start:"",end:""}); drawTermRows_(); });
  on("termSave","click",saveTermRows_);
}
