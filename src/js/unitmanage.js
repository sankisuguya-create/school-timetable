/* ==================================================================
   unitmanage.js — 単元の管理画面（作る・直す・消す・学期設定）

   単元の登録・名まえと教科の直し・消去・焼き付け（番号を備考欄へ）と、
   学期の区切り（学期設定）の窓を持つ。
   番号を数える・割り付ける側は unitprogress.js に。
================================================================== */

/* ── 管理画面（作る・直す・消す・学期設定） ── */

const unitState = {cls:"", gr:"", subject:"", editing:"", editIds:[], loading:false, units:[]};

function unitSubjects_(){
  return SUBJECTS.filter(s => s.count && !s.only);
}
function unitContext_(){
  if(typeof view === "undefined") return null;
  if(view.kind === "class")
    return {kind:"class", classes:[view.cls], subjects:unitSubjects_()};
  if(view.kind === "special"){
    const code = spSubjectOf(view.sp), sub = SUB_BY_CODE[code];
    /* **専科の単元は学年で持つ。** 教科は枠で決まっているので選ぶものはなく、
       「何年の単元か」でまとめて管理する ── 学年の各クラスに同じ名前の
       単元が1つずつある、という持ち方 */
    const classes = classesOfSpecial(view.sp);
    const grades = [...new Set(classes.map(gradeOf))];
    return {kind:"special", classes:classes, grades:grades,
            subjects:sub ? [sub] : []};
  }
  return null;
}
/* 選んだ学年に入る、この専科の担当クラス */
function unitGradeClasses_(){
  const ctx = unitContext_();
  if(!ctx || ctx.kind !== "special") return [];
  return ctx.classes.filter(c => gradeOf(c) === unitState.gr);
}
/* 学年の単元＝その学年の各クラスに同じ名前で1つずつある単元、をまとめて返す */
function unitGroupOf_(name){
  if(view.kind !== "special") return [];
  return UP.units.filter(u => u.layer === "special" && u.sp === view.sp
    && u.name === name && gradeOf(u.target) === unitState.gr);
}
function paintUnitManagerButton(){
  const wrap = $("unitEntry");
  if(!wrap) return;
  const ctx = unitContext_();
  wrap.hidden = !ctx;
  if(!ctx) return;
  $("unitOpenSub").textContent = ctx.kind === "special"
    ? "学年ごとの単元" : "教科ごとの単元と授業数";
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
  /* 持っている教科チップがあれば、その教科を開く */
  if(pickSub && ctx.subjects.some(s => s.code === pickSub)) return pickSub;
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
/* 専科の面：開く学年の既定。選んでいるコマのクラス → 前に見ていた学年 → 先頭 */
function unitDefaultGrade_(){
  const ctx = unitContext_();
  if(!ctx || !(ctx.grades || []).length) return "";
  if(selCell){
    const c = cellFor(selCell.d, selCell.s);
    const g = c.cls ? gradeOf(c.cls) : "";
    if(g && ctx.grades.indexOf(g) >= 0) return g;
  }
  if(unitState.gr && ctx.grades.indexOf(unitState.gr) >= 0) return unitState.gr;
  return ctx.grades[0];
}

function openUnitManager(){
  const ctx = unitContext_();
  if(!ctx) return toast("「単元を仮置きする」は<b>学級または専科の週案</b>で使います");
  unitState.cls = unitDefaultClass_();
  unitState.gr = unitDefaultGrade_();
  unitState.subject = unitDefaultSubject_();
  unitState.editing = "";
  unitState.editIds = [];
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
  /* 専科の面は学年で管理する。選ぶものは「何年の単元か」──
     教科は枠で決まっているので、教科の欄は値だけ見せて触れなくする */
  const sp = ctx.kind === "special";
  if($("unitClsLbl")) $("unitClsLbl").textContent = sp ? "学年" : "クラス";
  $("unitCls").innerHTML = sp
    ? unitSelectHtml_(ctx.grades, unitState.gr, x => x, x => x + "年")
    : unitSelectHtml_(ctx.classes, unitState.cls, x => x, x => x);
  $("unitSub").innerHTML = unitSelectHtml_(ctx.subjects, unitState.subject, x => x.code, x => x.name);
  $("unitCls").disabled = ctx.kind === "class";
  $("unitSub").disabled = sp;
}
function loadUnitManager(after){
  if(unitState.loading) return;
  unitState.loading = true;
  $("unitStat").textContent = "読み込んでいます…";
  const ctx = unitContext_();
  /* 専科は学年で持つので、クラスを絞らずこの枠の単元をぜんぶ読む */
  const owner = ctx.kind === "special"
    ? {layer:"special", target:"", sp:view.sp}
    : {layer:"home", target:unitState.cls, sp:""};
  Backend.unitManager(owner, unitState.subject, r => {
    unitState.loading = false;
    const got = (r && r.units) || [];
    /* この持ち主＋教科の分を新しくする（ほかの教科の分は残す） */
    UP.units = UP.units.filter(u => ctx.kind === "special"
      ? !(u.layer === "special" && u.sp === view.sp && u.subject === unitState.subject)
      : !(u.target === unitState.cls && u.subject === unitState.subject
          && u.layer === owner.layer))
      .concat(got);
    UP.terms = (r && r.terms) || UP.terms;
    UP.termVersion = (r && r.termVersion) || UP.termVersion;
    unitState.units = got;
    UP.seq = {};
    renderUnitManager_();
    if(after) after();
  }, why => {
    unitState.loading = false;
    $("unitStat").textContent = why;
  });
}
function shortDate_(s){
  const p = String(s || "").split("-");
  return p.length === 3 ? (+p[1]) + "/" + (+p[2]) : s;
}
function renderUnitTerm_(){
  const box = $("unitTermInfo");
  if(!UP.terms.length){
    box.className = "unitterm warn";
    box.innerHTML = "<span><b>学期の期間が未設定</b><small>単元登録はできます。番号づけと学期末警告には期間が必要です。</small></span>"
      + "<button class='btn' id='unitTermOpen'>学期を設定</button>";
  }else{
    box.className = "unitterm";
    box.innerHTML = "<span><b>学期</b><small>"
      + UP.terms.map(t => escText(t.name) + " " + shortDate_(t.start) + "〜" + shortDate_(t.end)).join("　")
      + "</small></span><button class='btn' id='unitTermOpen'>期間を直す</button>";
  }
  $("unitTermOpen").onclick = openUnitTerms;
}
function unitStatus_(u){
  if(!(u.start || {}).date) return "置いていない";
  const seq = upSeqFor_(u);
  const cap = u.lessonCount + (u.hasTest ? 1 : 0);
  if(seq.count > cap) return "仮置き " + cap + "（はみ出し " + (seq.count - cap) + "）";
  return "仮置き " + seq.count + "/" + cap;
}
function renderUnitList_(){
  const box = $("unitList");
  const ctx = unitContext_();
  let list = unitState.units || [];

  /* **専科の面は学年でまとめる。** 同じ名前の単元が学年の各クラスに1つずつ
     あるので、名前で束ねて1行にし、クラスごとの配置は小さい字で並べる */
  if(ctx && ctx.kind === "special"){
    list = list.filter(u => gradeOf(u.target) === unitState.gr);
    if(!list.length){
      box.innerHTML = "<div class='unitempty'>この学年の単元はまだありません。<br>"
        + "「新しい単元」で登録すると、学年の各クラスに同じものができます。</div>";
      return;
    }
    const order = [], byName = {};
    for(const u of list){
      if(!byName[u.name]){ byName[u.name] = []; order.push(u.name); }
      byName[u.name].push(u);
    }
    box.innerHTML = order.map(name => {
      const g = byName[name], rep = g[0];
      const per = unitGradeClasses_().map(cls => {
        const u = g.find(x => x.target === cls);
        return "<small>" + escText(cls) + " "
          + escText(u ? unitStatus_(u) : "置いていない") + "</small>";
      }).join("");
      return "<button class='unitrow' data-unit='" + escText(rep.id) + "'>"
        + "<span><b>" + escText(name) + "</b><small>"
        + rep.lessonCount + "時間" + (rep.hasTest ? "＋テスト" : "") + "</small></span>"
        + "<span class='unitcls'>" + per + "</span></button>";
    }).join("");
    for(const b of box.querySelectorAll("[data-unit]"))
      b.onclick = () => editUnit_(b.dataset.unit);
    return;
  }

  if(!list.length){
    box.innerHTML = "<div class='unitempty'>まだ単元がありません。<br>「新しい単元」から、単元名と授業数だけ登録します。</div>";
    return;
  }
  box.innerHTML = list.map(u =>
    "<button class='unitrow' data-unit='" + escText(u.id) + "'>"
    + "<span><b>" + escText(u.name) + "</b><small>"
    + u.lessonCount + "時間" + (u.hasTest ? "＋テスト" : "")
    + (u.start && u.start.date ? "・" + shortDate_(u.start.date) + "〜" : "") + "</small></span>"
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
  unitState.editIds = [];
  $("unitFormTitle").textContent = view.kind === "special" ? "新しい単元（学年の各クラスにできます）" : "新しい単元";
  $("unitName").value = "";
  $("unitCount").value = "1";
  $("unitTest").checked = false;
  $("unitDanger").hidden = true;
  $("unitWarn").hidden = true;
  $("unitForm").hidden = false;
  $("unitName").focus();
}
function editUnit_(id){
  const u = (unitState.units || []).find(x => x.id === id);
  if(!u) return;
  unitState.editing = id;
  /* 専科の学年の単元は、同じ名前のものが学年の各クラスに1つずつある。
     直す・消す・配置リセットは、まとめてそのぶん全部に効かせる */
  unitState.editIds = view.kind === "special"
    ? unitGroupOf_(u.name).map(x => x.id)
    : [id];
  $("unitFormTitle").textContent = view.kind === "special" ? "学年の単元を直す" : "単元を直す";
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
function saveUnitForm_(){
  const name = $("unitName").value.trim(), n = Math.floor(+$("unitCount").value || 0);
  if(!name) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "単元名を入れてください。");
  if(n < 1 || n > 99) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "授業数は1〜99時間です。");
  const ctx = unitContext_();

  /* **専科の面：学年の単元として保存。** 学年の各クラスに同じものを
     1つずつ作る（あるものは直し、無いものは作る）。まとめて同じものを
     持つので、ここではじめて同じ授業数が全クラスに入る */
  if(ctx.kind === "special"){
    const clsList = unitGradeClasses_();
    if(!clsList.length)
      return void ($("unitWarn").hidden = false,
                   $("unitWarn").textContent = "この学年のクラスがありません。");
    const olds = (unitState.editIds || []).length
      ? UP.units.filter(u => unitState.editIds.indexOf(u.id) >= 0)
      : UP.units.filter(u => u.layer === "special" && u.sp === view.sp
          && u.subject === unitState.subject && u.name === name
          && gradeOf(u.target) === unitState.gr);
    const inputs = clsList.map(cls => {
      const old = olds.find(u => u.target === cls);
      return {id: old ? old.id : "", expectedUpdatedAt: old ? old.updatedAt : "",
              layer:"special", target:cls, sp:view.sp, subject:unitState.subject,
              name:name, lessonCount:n, hasTest:$("unitTest").checked};
    });
    $("unitSave").disabled = true;
    $("unitStat").textContent = "学年の各クラスに保存しています…";
    saveUnitFanout_(inputs, 0, () => {
      $("unitSave").disabled = false;
      const grp = unitGroupOf_(name);
      unitState.editing = grp.length ? grp[0].id : "";
      unitState.editIds = grp.map(u => u.id);
      renderUnitList_();
      if(unitState.editing) editUnit_(unitState.editing);
      UP.seq = {}; paintSheet();
      if(typeof drawPalette === "function") drawPalette();
      for(const u of grp) upWarnOne_(u);
      $("unitStat").textContent = "保存しました。";
    }, why => {
      $("unitSave").disabled = false;
      $("unitStat").textContent = why;
    });
    return;
  }

  const old = (unitState.units || []).find(x => x.id === unitState.editing);
  const input = {
    id: old ? old.id : "",
    expectedUpdatedAt: old ? old.updatedAt : "",
    layer: "home",
    target: unitState.cls,
    sp: "",
    subject: unitState.subject,
    name:name, lessonCount:n, hasTest:$("unitTest").checked
  };
  $("unitSave").disabled = true;
  $("unitStat").textContent = "保存しています…";
  Backend.saveUnit(input, saved => {
    $("unitSave").disabled = false;
    if(saved){
      const list = unitState.units || (unitState.units = []);
      const i = list.findIndex(x => x.id === saved.id);
      if(i >= 0) list[i] = saved; else list.push(saved);
      const ui = UP.units.findIndex(x => x.id === saved.id);
      if(ui >= 0) UP.units[ui] = saved; else UP.units.push(saved);
      unitState.editing = saved.id;
      renderUnitList_();
      editUnit_(saved.id);
      UP.seq = {}; paintSheet();
      if(typeof drawPalette === "function") drawPalette();
      upWarnOne_(saved);
    }
    $("unitStat").textContent = "保存しました。";
  }, why => {
    $("unitSave").disabled = false;
    $("unitStat").textContent = why;
  });
}
/* 学年の単元：各クラスぶんを順に1本ずつ保存する
   （同時に送ると「単元」シートで同じ行を争う） */
function saveUnitFanout_(inputs, i, done, fail){
  if(i >= inputs.length) return done();
  Backend.saveUnit(inputs[i], saved => {
    if(saved){
      const ui = UP.units.findIndex(x => x.id === saved.id);
      if(ui >= 0) UP.units[ui] = saved; else UP.units.push(saved);
      const li = (unitState.units || []).findIndex(x => x.id === saved.id);
      if(li >= 0) unitState.units[li] = saved; else unitState.units.push(saved);
    }
    saveUnitFanout_(inputs, i + 1, done, fail);
  }, fail);
}
function resetUnit_(){
  const u = (unitState.units || []).find(x => x.id === unitState.editing);
  if(!u) return;
  const targets = view.kind === "special"
    ? (unitState.editIds || []).map(id => UP.units.find(x => x.id === id)).filter(Boolean)
    : [u];
  if(!targets.length) return;
  askOk({
    title:"「" + u.name + "」の仮置きを外しますか",
    lines:[(targets.length > 1
              ? "学年の各クラス分（" + targets.length + "クラス）まとめて外します。"
              : "") + "<b>単元そのものは残します。</b>",
           "時間割に仮置きした進捗だけを全部外し、後で起点から置き直せる状態に戻します。"],
    goLabel:"仮置きを外す",
    onYes:() => {
      const seq = i => {
        if(i >= targets.length){
          renderUnitList_();
          if(unitState.editing) editUnit_(unitState.editing);
          $("unitStat").textContent = "仮置きを外しました。";
          UP.seq = {}; paintSheet();
          return;
        }
        upResetAll_(targets[i], () => seq(i + 1));
      };
      seq(0);
    }
  });
}
function resetAllUnits_(){
  let list = unitState.units || [];
  /* 専科の面は学年の単元だけを対象にする（ほかの学年は動かない） */
  if(view.kind === "special")
    list = list.filter(u => gradeOf(u.target) === unitState.gr);
  if(!list.length) return toast("リセットする単元がありません");
  const sub = (SUB_BY_CODE[unitState.subject] || {}).name || unitState.subject;
  const scope = view.kind === "special"
    ? unitState.gr + "年・" + sub
    : unitState.cls + "・" + sub;
  askOk({
    title:scope + " の仮置きを全て外しますか",
    lines:["<b>この画面に並んで入る単元全て</b>の仮置きを外します。",
           "単元名・授業数・テスト設定は残ります。"],
    goLabel:"全て外す",
    onYes:() => {
      let left = list.length;
      for(const u of list) upResetAll_(u, () => {
        if(--left <= 0){
          renderUnitList_();
          $("unitStat").textContent = "この教科の単元の仮置きを全て外しました。";
          UP.seq = {}; paintSheet();
        }
      });
    }
  });
}
/* **いま出ている番号を備考欄に移して、単元を終わらせる（焼き付け）。**
   終わった単元はもう起点以降の週を読みに行かないので、コマ読みの待ちが
   消える。番号は場所で決まるので、まず週を全部読んでから数える
   （仮の番号のまま字にすると、ずれた番号が残ってしまう） */
function upBakeOne_(unit, done){
  const st = unit.start || {};
  if(!st.date){ if(done) done(); return; }
  const mons = upMons_(st.date, upRangeEnd_(unit));
  const wid = Wait.begin("「" + unit.name + "」の番号を備考欄に移しています");
  Backend.readWeeks(mons, () => {
    const r = upScan_(unit, upRangeEnd_(unit));
    const name4 = (unit.name || "").slice(0, 4) || "単元";
    const keep = monday;
    try{
      for(const m of mons){
        monday = mondayOf(parseISO(m));
        const w = week();
        for(let d = 0; d < DAYS; d++) for(const sl of SLOTS){
          if(sl.kind !== "lesson") continue;
          const dt = iso(addDays(monday, d));
          const n = r.map[dt + "|" + sl.id];
          if(n) upBakeNote_(unit, d, sl.id,
            unit.hasTest && n === unit.lessonCount + 1
              ? name4 + "テスト" : name4 + " " + n + "/" + unit.lessonCount, m);
          else if(upCellMark_(w, unit, d, sl.id))
            upMark_(unit, d, sl.id, "", m);      /* 番号の無い印は外すだけ */
        }
      }
    }finally{ monday = keep; }
    Backend.deleteUnit(unit.id, unit.updatedAt, () => {
      delete UP.warns[unit.id];
      UP.seq = {};
      Wait.end(wid);
      paintSheet();
      if(done) done();
    }, why => { Wait.end(wid); toast(why); });
  });
}

function upBakeUnit_(){
  const u = (unitState.units || []).find(x => x.id === unitState.editing);
  if(!u) return;
  /* 専科の学年の単元は、各クラスのぶんをまとめて移す */
  const targets = view.kind === "special"
    ? (unitState.editIds || []).map(id => UP.units.find(x => x.id === id)).filter(Boolean)
    : [u];
  if(!targets.length) return;
  if(!(u.start || {}).date)
    return toast("まだ置いていない単元は、移す番号がありません");
  askOk({
    title:"「" + u.name + "」の番号を備考欄に移しますか",
    lines:[(targets.length > 1
              ? "学年の各クラス分（" + targets.length + "クラス）まとめて行います。"
              : "")
           + "<b>いま出ている番号を、各コマの備考欄に字として入れます</b>"
           + "（「" + escText(u.name.slice(0, 4)) + " 3/" + u.lessonCount + "」のように）。",
           "仮置きの印は外れ、単元そのものも消えます。<b>この単元のコマ読みは、もう要りません。</b>",
           "戻せません。番号を数え続けたいときは、この操作をしないでください。"],
    goLabel:"備考欄に移す",
    onYes:() => {
      const ids = targets.map(x => x.id);
      const seq = i => {
        if(i >= targets.length){
          unitState.units = (unitState.units || []).filter(x => ids.indexOf(x.id) < 0);
          UP.units = UP.units.filter(x => ids.indexOf(x.id) < 0);
          unitState.editing = ""; unitState.editIds = [];
          $("unitForm").hidden = true; renderUnitList_();
          UP.seq = {}; paintSheet();
          if(typeof drawPalette === "function") drawPalette();
          $("unitStat").textContent = "番号を備考欄に移して、「" + u.name + "」を終わらせました。";
          return;
        }
        upBakeOne_(targets[i], () => seq(i + 1));
      };
      seq(0);
    }
  });
}

function deleteUnit_(){
  const u = (unitState.units || []).find(x => x.id === unitState.editing);
  if(!u) return;
  /* 専科の学年の単元は、各クラスのぶんをまとめて消す */
  const targets = view.kind === "special"
    ? (unitState.editIds || []).map(id => UP.units.find(x => x.id === id)).filter(Boolean)
    : [u];
  if(!targets.length) return;
  askOk({
    title:"「" + u.name + "」を削除しますか",
    lines:["<b>単元の登録そのものを削除します。</b>時間割への仮置きの印も消えます。"
           + (targets.length > 1
              ? "学年の各クラス分（" + targets.length + "クラス）をまとめて消します。" : ""),
           "仮置きの印だけを外したい場合は「仮置きを外す」を使ってください。"],
    goLabel:"単元を削除",
    onYes:() => {
      const ids = targets.map(x => x.id);
      const seq = i => {
        if(i >= targets.length){
          unitState.units = (unitState.units || []).filter(x => ids.indexOf(x.id) < 0);
          UP.units = UP.units.filter(x => ids.indexOf(x.id) < 0);
          unitState.editing = ""; unitState.editIds = [];
          $("unitForm").hidden = true; renderUnitList_();
          UP.seq = {}; paintSheet();
          if(typeof drawPalette === "function") drawPalette();
          $("unitStat").textContent = "単元を削除しました。";
          return;
        }
        const t = targets[i];
        /* 印を外してから単元を消す */
        upResetAll_(t, () => {
          Backend.deleteUnit(t.id, t.updatedAt, () => seq(i + 1),
            why => $("unitStat").textContent = why);
        });
      };
      seq(0);
    }
  });
}

/* ── 学期設定 ─────────────────────────────────── */
let termDraft = [];
function openUnitTerms(){
  termDraft = clone(UP.terms);
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
  Backend.saveUnitTerms(rows, UP.termVersion, r => {
    $("termSave").disabled = false;
    UP.terms = (r && r.terms) || [];
    UP.termVersion = (r && r.version) || JSON.stringify(UP.terms);
    renderUnitTerm_();
    $("termDlg").close();
    $("unitStat").textContent = "学期の期間を保存しました。";
    for(const u of upViewUnits_()) if((u.start || {}).date) upWarnOne_(u);
  }, why => {
    $("termSave").disabled = false;
    $("termStat").textContent = why;
  });
}

/* ── パレットのチップ ──────────────────────────
   単元は1画面4つだけで作る（教科 → 名前 → コマ数 → テスト）。
   チップの字は単元名の冒頭3文字。専科の面では「名前・クラス」。 */
function upChipLabel_(u){
  const t = (u.name || "").slice(0, 4) || u.name || "単元";
  return view.kind === "special" ? t + "・" + u.target : t;
}
function upPaletteUnits_(){
  let list = upViewUnits_();
  /* 持っている教科チップがあるときは、その教科の単元だけに絞る */
  if(view.kind === "class" && pickSub)
    list = list.filter(u => u.subject === pickSub);
  if(view.kind !== "special")
    return list.map(u => ({v:"unit:" + u.id, t:upChipLabel_(u), unit:u}));
  /* **専科の面の単元は学年で持つ。** 学年の各クラスに同じ名前の単元が
     1つずつあるので、チップは学年に1つだけ出す ── 落とす先のコマの
     クラスのぶんを、落とすときにこちらで選ぶ（upDropChip_） */
  const seen = {}, out = [];
  for(const u of list){
    const g = gradeOf(u.target), k = g + "|" + u.name;
    if(seen[k]) continue;
    seen[k] = u;
    const t = (u.name || "").slice(0, 4) || u.name || "単元";
    out.push({v:"unit:" + u.id, t:t + "・" + g + "年", unit:u});
  }
  return out;
}
function unitById_(id){
  return upViewUnits_().find(u => u.id === id) || null;
}

/* 結線 */
function wireUnitProgress(){
  const on = (id, ev, fn) => { const e = $(id); if(e) e.addEventListener(ev, fn); };
  on("unitOpen","click",openUnitManager);
  on("unitCls","change",e => {
    /* 専科の面ではこの欄は学年を選ぶ（欄の中身は drawUnitContext_ が入れ替える）。
       学年を変えても読み直すものはない ── 枠の単元は全部持っているので、
       並びを学年で絞り直すだけ */
    if(view.kind === "special"){
      unitState.gr = e.target.value;
      unitState.editing = ""; unitState.editIds = [];
      $("unitForm").hidden = true; renderUnitManager_();
      return;
    }
    unitState.cls = e.target.value;
    unitState.editing = ""; unitState.editIds = [];
    $("unitForm").hidden = true; loadUnitManager();
  });
  on("unitSub","change",e => { unitState.subject=e.target.value; unitState.editing=""; $("unitForm").hidden=true; loadUnitManager(); });
  on("unitNew","click",newUnit_);
  on("unitResetAll","click",resetAllUnits_);
  on("unitCancel","click",() => { unitState.editing=""; $("unitForm").hidden=true; $("unitWarn").hidden=true; });
  on("unitMinus","click",() => unitCountStep_(-1));
  on("unitPlus","click",() => unitCountStep_(1));
  on("unitSave","click",saveUnitForm_);
  on("unitBake","click",upBakeUnit_);
  on("unitReset","click",resetUnit_);
  on("unitDelete","click",deleteUnit_);
  on("termAdd","click",() => { termDraft.push({name:"",start:"",end:""}); drawTermRows_(); });
  on("termSave","click",saveTermRows_);
}
