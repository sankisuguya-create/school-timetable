/* ���i��{���Ԋ��E�w���Ґ��E�p���E�����R�s�[�E����ۂہj�B */

/* ���� ��Ȃ�����̊m�F ������������������������������������������������
   **�u���E�U�� confirm ���g��Ȃ��B** Enter �Łu�͂��v�ɗ�����̂ŁA
   �Ō��̐����̂܂ܒʂ��Ă��܂��idocs/spec.md 3�߁E�㏑���̑��Ɠ������R�j�B
   �����΂�傫���󂹂鑀�삪�A�����΂�ア�~�ߕ��ɂȂ��Ă����B

   �\�����m�F�ɂ͐�p�̑�������i�㏑�� swDlg�E���f apDlg�E���� cfDlg�E
   �o���� tpDelDlg�E����ۂ� tpDlg�j�B�������󂯂�̂�**�������̊m�F**�B
   3�����ɕʁX�̑������ƁA���������΂���i���������Łu����͂�߂�v��
   �t���Y���j�̂ŁA1�ɂ܂Ƃ߂Ă���B

     title   ���̌��o���B**�u�c���܂����v�ŏI����**
     lines   �i���̕��сB���g�� HTML �Ȃ̂ŁA����鎚�� escText ��ʂ�
     goLabel �i�ޑ��̃{�^���̎��B**�����N���邩�𓮎��ŏ���**�i�u�͂��v�ɂ��Ȃ��j
     onYes   �i�ނƓ������Ƃ��ɂ��邱��
     onNo    ��߂�Ɠ������Ƃ��B**���������ł��ꂱ���ɗ�����**�i�ȗ��j

   ����́u��߂�v�B? �ł� Esc �ł��O���ł��A��߂鑤�ɗ�����B */
let okAsk = null;
function askOk(o){
  okAsk = {yes:o.onYes || (() => {}), no:o.onNo || (() => {}), done:false};
  $("okTtl").textContent = o.title;   /* ���̂܂ܓ����BescText �͒ʂ��Ȃ��i��d�ɂȂ�j */
  $("okBody").innerHTML = (o.lines || []).map(x => "<p>" + x + "</p>").join("");
  $("okNo").textContent  = o.noLabel || "��߂�";
  $("okYes").textContent = o.goLabel || "������";
  $("okDlg").showModal();
  $("okNo").focus();                 /* **����́u��߂�v�B** */
}
/* ���̕Ԏ���1�񂾂������B�����i�{�^���EEsc�E�O���j�Ŏ�肱�ڂ��Ȃ� */
function okAnswer(yes){
  const a = okAsk;
  okAsk = null;
  if(!a || a.done) return;
  a.done = true;
  (yes ? a.yes : a.no)();
}

/* ���� ��{���Ԋ��iA�T�EB�T�j ������������������������������������������
   �����ɓ��ꂽ���̂��A�T�Ă��J�������_�őS���̃R�}�ɏo��B
   �S�C�͖��T30�R�}���߂�̂ł͂Ȃ��A�ς����Ƃ��낾�������B */

let baseVar = "A";

function openSettings(){
  $("settingsFy").textContent = fy() + "�N�x";
  $("setPaperNow").textContent = db.settings.paper + "�E�^�C�g��"
    + (+db.settings.titlePt || 16) + "pt�E�ڍ�" + (+db.settings.notePt || 12) + "pt";
  $("settingsDlg").showModal();
}

function openWeekOutput(){
  if(view.kind === "gate" || view.kind === "tanpopo") return toast("��ɏT�Ă��J���Ă�������");
  $("outWho").innerHTML = "<b>" + escText(viewName()) + "</b>�@" + md(monday)
    + " �� " + md(addDays(monday, 4)) + " �̏T";
  $("outStat").textContent = "";
  $("outDlg").showModal();
}

function planValues(mon){
  const keep = monday; monday = mon;
  try{
    const out = [[viewName(), md(mon) + " �� " + md(addDays(mon, 4))]
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
    out.push({name:(mon.getMonth()+1) + "��" + Math.ceil(mon.getDate()/7) + "�T", values:planValues(mon)});
  }
  return out;
}
function downloadBlob(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* ���ʂ����̂܂�PNG�ւ���B�O���T�[�r�X�֏T�Ă𑗂�Ȃ��B */
async function nodePng(node, name){
  const r = node.getBoundingClientRect(), css = [...document.styleSheets].map(s => {
    try{return [...s.cssRules].map(x => x.cssText).join("\n");}catch(_){return "";}
  }).join("\n");
  const xml = new XMLSerializer().serializeToString(node.cloneNode(true));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xml}</div></foreignObject></svg>`;
  /* Blob URL ��SVG�� foreignObject �ŕ`���ƁAChrome ��Canvas�� tainted �Ƃ݂Ȃ�
     toBlob �����ށBdata URL�Ȃ瓯�ꐶ�����̉摜�Ƃ��Ĉ�����B */
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image(); await new Promise((ok, ng) => { img.onload=ok; img.onerror=ng; img.src=url; });
  const scale=2, cv=document.createElement("canvas"); cv.width=Math.ceil(r.width*scale); cv.height=Math.ceil(r.height*scale);
  const cx=cv.getContext("2d"); cx.scale(scale,scale); cx.fillStyle="#fff"; cx.fillRect(0,0,r.width,r.height); cx.drawImage(img,0,0);
  const blob=await new Promise(ok => cv.toBlob(ok,"image/png")); downloadBlob(blob,name);
}
const outputName = suffix => viewName().replace(/[^\w\-��-��@-����-�]/g,"_") + "_" + iso(monday) + "_" + suffix;
function exportWeekSheet(){
  $("outStat").textContent="Google Sheet������Ă��܂��c";
  Backend.exportPlanSheet(outputName("�T��"), planParts(monday,1), r => {
    $("outStat").innerHTML="<b>Sheet�����܂����B</b> <a target='_blank' rel='noopener' href='"+escText(r.url)+"'>Google Sheet���J��</a>";
  }, why => $("outStat").textContent=why);
}
function exportMonthSheet(){
  Backend.exportPlanSheet(outputName("4�T"), planParts(mMonday,4), r => {
    toast("<a target='_blank' rel='noopener' href='"+escText(r.url)+"'>4�T��Google Sheet���J��</a>");
  }, why => toast(escText(why)));
}

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
    + DOW.slice(0, WEEKDAYS).map(d => "<th>" + d + "</th>").join("") + "</tr>"];
  for(const s of SLOTS){
    rows.push("<tr><th>" + s.name + "</th>");
    for(let d = 0; d < WEEKDAYS; d++){
      const v = bank[ck(d, s.id)] || {};
      rows.push("<td>" + (s.kind === "lesson"
        ? "<select class='basesub' data-subject='" + escText(v.subject || "") + "' data-k='" + ck(d, s.id) + "'><option value=''>?</option>"
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
    e.dataset.subject = s ? s.code : "";
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
  $("baseFy").textContent = fy() + "�N�x";
}

/* ���� �Œ莞�Ԋ��̎�荞�� ������������������������������������������
   �w�Z�̌Œ莞�Ԋ��\���A���̂܂܂̌`�œǂ�Ŋ�{���Ԋ��ɂ���B
   **�ǂ�ł�������Ȃ��B** ���N���X�ǂ߂����E�ǂ߂Ȃ����͂ǂꂩ���Ɍ�����B
   ����Ⴂ�ɋC�Â��Ȃ��܂�20�N���X�Ԃ�����ւ���ƁA�߂��藧�Ă������B */

let impRes = null;              /* ���ܓǂ߂Ă���\ */
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
      v === "paste"   ? "�w�Z�̕\��I��Ŏʂ��A�����ɓ\��"
    : v === "sheet"   ? "<b>�Œ莞�Ԋ���荞��</b>�V�[�g�ɓ\���Ă�����̂�ǂށi�{�Ԃ̂݁j"
                      : escText(FIXED_NAME) + " ��ǂ�";
  impRes = null;
  drawImp();
}

/* �\��t��������\�ɂ���B�G�N�Z������ʂ��ƁA
   �^�u��؂��1�s1�s�����s�ɂȂ��Ă���B */
function tsvGrid(text){
  return String(text).replace(/\r/g, "").split("\n").map(line => line.split("\t"));
}

function readImp(){
  if(impSrc === "builtin"){ impRes = fixedBuiltin(); return drawImp(); }
  if(impSrc === "paste"){
    const t = $("impText").value;
    if(!t.trim()){ impRes = {error:"�܂������\���Ă��Ȃ�"}; return drawImp(); }
    impRes = parseFixed(tsvGrid(t));
    return drawImp();
  }
  $("impStat").textContent = "�V�[�g��ǂ�ł���c";
  Backend.readPaste(
    g => { impRes = g.length ? parseFixed(g) : {error:"�V�[�g���󂾂���"}; drawImp(); },
    why => { impRes = {error:why}; drawImp(); });
}

function drawImp(){
  const boxes = [], r = impRes;
  const known = r && r.order ? r.order.filter(c => allClasses().indexOf(c) >= 0) : [];
  const miss  = r && r.order ? r.order.filter(c => allClasses().indexOf(c) < 0)  : [];
  const none  = r && r.order ? allClasses().filter(c => r.order.indexOf(c) < 0)   : [];

  if(!r){
    boxes.push("<div class='box ok'>�܂��ǂ�ł��Ȃ��B��őI��Łu�ǂށv�������B</div>");
  } else if(r.error){
    boxes.push("<div class='box'><b>�ǂ߂Ȃ������B</b>" + escText(r.error) + "</div>");
  } else {
    if(r.unknown && r.unknown.length)
      boxes.push("<div class='box'><b>���ȂƂ��ēǂ߂Ȃ����F" + r.unknown.map(escText).join("�E")
        + "</b><br>���̂܂ܑ薼�Ƃ��ē���B���ȂƂ��Đ��������Ƃ��́A"
        + "�u���ȁv�V�[�g�ɑ����Ă���ǂݒ����B</div>");
    if(miss.length)
      boxes.push("<div class='box'><b>" + miss.map(escText).join("�E")
        + "</b> ��<b>���܂̊w���Ґ��ɖ���</b>�̂œ���Ȃ��B"
        + "�Ґ����Â��Ȃ�u�w���Ґ��v�Œ����Ă���ǂݒ����B</div>");
    if(none.length)
      boxes.push("<div class='box'><b>" + none.map(escText).join("�E")
        + "</b> �͕\�ɖ��������B<b>���܂̊�{���Ԋ��̂܂�</b>�ɂ���B</div>");
    for(const n of (r.notes || [])) boxes.push("<div class='box'>" + escText(n) + "</div>");
    if(!boxes.length)
      boxes.push("<div class='box ok'>" + known.length
        + " �N���X�Ԃ��ǂ߂��B�C�ɂȂ�Ƃ���͖����B</div>");
  }
  $("impWarn").innerHTML = boxes.join("");
  $("impStat").textContent = r && !r.error
    ? (r.name ? r.name + "�^" : "") + known.length + " �N���X�E"
      + (r.periods || 0) + " �Z���Ԃ�"
    : "";
  $("impGo").disabled = !known.length;
  $("impCount").innerHTML = known.length
    ? "<b>" + known.length + " �N���X</b>�� A�T�EB�T�����ւ���" : "";

  /* �����O�ɁA1�N���X�����\�̂Ƃ���Ɍ����� */
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
        + "<th>" + v + "�T</th>"
        + slots.map(s => {
            const e = bank[ck(d, s.id)];
            const same = (got.A || {})[ck(d, s.id)], other = (got.B || {})[ck(d, s.id)];
            const diff = (same ? same.title : "") !== (other ? other.title : "");
            return "<td" + (diff ? " class='diff'" : "") + ">"
                 + (e ? escText(e.title) : "<i>?</i>") + "</td>";
          }).join("") + "</tr>");
    }
  $("impGrid").innerHTML = "<table class='tp imp'>" + head + body.join("") + "</table>";
}

/* �����B**���܂̊�{���Ԋ��͏�����**�̂ŁA�������Ɍ����B */
function goImp(){
  if(!impRes || impRes.error) return;
  const known = impRes.order.filter(c => allClasses().indexOf(c) >= 0);
  if(!known.length) return;
  askOk({
    title: fy() + "�N�x�̊�{���Ԋ����A�ǂ񂾕\�œ���ւ��܂���",
    lines: [
      "����ւ���̂� <b>" + known.length + " �N���X</b>�i"
        + escText(known.join("�A")) + "�j�B<b>A�T��B�T�̗���</b>������ւ��܂��B",
      "<b>���ܓ����Ă����{���Ԋ��͏����܂��B</b>"
        + "�߂��ɂ́A���Ƃ̕\��������x�ǂ܂��邱�ƂɂȂ�܂��B",
      "�T�ĂɎ�ŏ��������̂͏����܂���B"],
    goLabel: "����ւ���",
    onYes: () => {
      const done = applyFixed(impRes);
      toast("��{���Ԋ��ɓ��ꂽ�i<b>" + done.length + " �N���X</b>�j");
      $("impDlg").close();
      if($("baseDlg").open) drawBaseGrid();
      refreshWeek();
    }
  });
}

/* ���� �w���Ґ� ����������������������������������������������������������������������
   �{�Ԃł́u�N���X�v�V�[�g�����{�B�����͂��̎ʂ��B
   **�N�x���ƂɎ��B** �����Ă��O�̔N�x�͕ς��Ȃ��B */

function openRosterDlg(){
  drawRoster();
  $("rosterDlg").showModal();
}
/* ���� ���Ȃ̕\���� ��������������������������������������������������������
   **���̎��E������1�����E����ۂۂ̎����A1�̕\�Œ����B**
   3�̓V�[�g�̕ʁX�̗�ɂ���̂ŁA���ׂČ����Ȃ���
   �u�ǂ�𒼂��΂ǂ����ς�邩�v��������Ȃ��B

   **�R�[�h�͏o���Ȃ��B** �s�̐g���Ȃ̂ŐG�点�Ȃ� ���� ������ƁA
   �T�ẴR�}���w���悪�ǂ̍s�ɂ�������Ȃ��Ȃ�A�������\��̋��Ȃ�������B */
function openSubDlg(){
  $("subFy").textContent = fy() + "�N�x";
  $("subStat").textContent = "";
  drawSubTable();
  $("subDlg").showModal();
}
function drawSubTable(){
  const box = $("subRows");
  box.innerHTML =
    "<div class='subhead'><span>����</span><span>���̎�</span>"
    + "<span>1����</span><span>����ۂ�</span></div>"
    + SUBJECTS.map(s =>
      "<div class='subrow' data-code='" + escText(s.code) + "'>"
      + "<span class='subname'>" + escText(s.name) + "</span>"
      + "<input type='text' data-f='name'  value='" + escText(s.name) + "'>"
      + "<input type='text' data-f='short' maxlength='2' value='" + escText(s.short || "") + "'>"
      + "<input type='text' data-f='tp'    maxlength='4' value='" + escText(s.tp || "") + "'>"
      + "</div>").join("");
  for(const inp of box.querySelectorAll("input[data-f]"))
    inp.onchange = () => saveSubTable();
}
function saveSubTable(){
  const rows = [...$("subRows").querySelectorAll(".subrow")].map(r => ({
    code:  r.dataset.code,
    name:  r.querySelector("[data-f=name]").value.trim(),
    short: r.querySelector("[data-f=short]").value.trim(),
    tp:    r.querySelector("[data-f=tp]").value.trim()
  }));
  /* **���̎�����̍s�͑���Ȃ��B** ��ɂ���ƁA���̋��Ȃ���ʂ��������
     ���꒼�����������Ȃ�i�R�[�h�͏o���Ă��Ȃ��̂ŁA�V�[�g���J���Ȃ��Ɩ߂��Ȃ��j */
  const bad = rows.filter(r => !r.name);
  if(bad.length){
    $("subStat").textContent = "���̎�����̍s������܂��B��ɂ͂ł��܂���B";
    return drawSubTable();
  }
  /* ��ʂ̑����ɓ���ւ���B**�҂����Ȃ�**�i����̂͌��Ői�ށj */
  setSubjects(SUBJECTS.map(s => {
    const r = rows.find(x => x.code === s.code);
    return r ? Object.assign({}, s, {name:r.name, short:r.short, tp:r.tp}) : s;
  }));
  save();
  drawPalette();
  if(view.kind !== "gate") redrawCenter(true);
  $("subStat").textContent = "�����܂����B�V�[�g�ɂ������Ă��܂��B";
  Backend.saveSubjects(rows, ok => {
    $("subStat").textContent = ok ? "�V�[�g�ɓ���܂����B"
                                  : "�V�[�g�ɑ���܂���ł����B������x�����Ƒ��蒼���܂��B";
  });
}

function drawRoster(){
  const Yr = Y();
  $("rsFy").textContent = fy() + "�N�x";
  $("rsW1").value = Yr.week1 || firstMonday(fy());
  $("rsAbNow").textContent = "���܂� " + (db.settings.abAnchor || AB_ANCHOR);
  $("rsSp").value = (Yr.specials || []).map(s => s.label).join(", ");
  /* ��Ȃ��Ƃ̒S���w�N�B**�󗓂͑S�w�N�B** �����������ƁA��{���Ԋ���
     ���̋��Ȃ̃R�}���A���̊w�N�Ԃ񂾂���Ȃ̏T�ɏo��icompose.js spBaseClasses�j */
  $("rsSpRows").innerHTML = (Yr.specials || []).map(s =>
    "<div class='row'><span>" + escText(s.label) + " �̒S���w�N</span>"
    + "<input type='text' data-sp='" + escText(s.code) + "' style='flex:1;min-width:10em'"
    + " placeholder='�󗓁��S�w�N' value='" + escText((s.grades || []).join(",")) + "'>"
    + "</div>").join("");
  for(const e of $("rsSpRows").querySelectorAll("input[data-sp]"))
    e.onchange = () => {
      const t = (Y().specials || []).find(x => x.code === e.dataset.sp);
      if(!t) return;
      t.grades = spGrades_(e.value);
      save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
    };

  $("rsRows").innerHTML = grades().map(g =>
    "<div class='row'><span>" + escText(g) + "�N</span>"
    + "<input type='text' data-g='" + escText(g) + "' style='flex:1;min-width:16em' value='"
    + escText((Yr.classes[g] || []).join(", ")) + "'>"
    + "<button class='btn danger' data-del='" + escText(g) + "'>�s������</button></div>").join("");

  for(const e of $("rsRows").querySelectorAll("input[data-g]"))
    e.onchange = () => setGradeClasses(e.dataset.g, e.value);
  for(const b of $("rsRows").querySelectorAll("button[data-del]"))
    b.onclick = () => {
      const g = b.dataset.del;
      const used = (Y().classes[g] || []).filter(hasAnyData);
      const go = () => {
        delete Y().classes[g];
        save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
      };
      if(!used.length) return go();
      askOk({
        title: g + "�N���A���̔N�x�̕Ґ���������܂���",
        lines: ["<b>" + escText(used.join("�E")) + "</b> �ɂ͏������݂��c���Ă��܂��B",
                "�����Ă�<b>���g�͎c��܂�</b>���A��ʂ���͊J���Ȃ��Ȃ�܂��B"
                + "������x���̊w�N�𑫂��΁A�܂��J���܂��B"],
        goLabel: "����", onYes: go
      });
    };
}
/* �u1-1, 1-2, 1-3�v��z��ɂ���B��Əd���͗��Ƃ��B */
function setGradeClasses(g, text){
  const seen = {}, out = [];
  for(const raw of String(text).split(/[,�A\s]+/)){
    const n = normCls(raw);
    if(!n || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  const gone = (Y().classes[g] || []).filter(c => out.indexOf(c) < 0 && hasAnyData(c));
  const go = () => {
    Y().classes[g] = out;
    save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
  };
  if(!gone.length) return go();
  askOk({
    title: gone.join("�E") + " ���A���̔N�x�̕Ґ�����O���܂���",
    lines: ["���̃N���X�ɂ�<b>�������݂��c���Ă��܂�</b>�B",
            "�O���Ă�<b>���g�͎c��܂�</b>���A��ʂ���͊J���Ȃ��Ȃ�܂��B"
            + "������x���������΁A�܂��J���܂��B"],
    goLabel: "�O��",
    onYes: go,
    /* **��߂���A�ł����񂾎������̕��т֖߂��B**
       �߂��Ȃ��ƁA�O��Ă��Ȃ��̂ɊO�ꂽ�������Ɏc�� */
    onNo: () => drawRoster()
  });
}
/* ���̃N���X�ɉ��������Ă��邩�i�O���O�ɒm�点�邽�߁j */
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

/* ���� ���̓��̌`�i�ӂ��^���ʍZ���^�x�݁j ������������
   **�S�w�N�̖ʂ��炾���J���B** �����͈͂��S�N���X�Ȃ̂ŁA
   �S�C�̉�ʂ��牟����ƁA�����̊w���𒼂������łɑS�Z�������B */
let dayPick = 0;

function openDayDlg(d){
  dayPick = d;
  const dt = addDays(monday, d);
  $("dayWhen").textContent = md(dt) + "�i" + DOW[d] + "�j";
  drawDayForms();
  $("dayDlg").showModal();
}
function drawDayForms(){
  const now = dayForm(dayPick);
  /* **���̓��̍s�����o���B** �ǂނ����i�R�}�ɓ����͎̂��̃R�}��I��ł���j�B
     �����ɓ����{�^����u���ƁA�����J�����܂܃R�}��I�Ԃ��ƂɂȂ� */
  const evs = eventsOn(dayPick);
  $("dayEvWrap").hidden = !evs.length;
  if(evs.length)
    $("dayEvs").innerHTML = evs.map(x =>
      "<li><b>" + escText(x.text) + "</b>"
      + "<br><span class=\"who\">�s���v��i" + escText(x.who) + "�j</span></li>").join("");
  $("dayForms").innerHTML = ["", "special", "off"].map(f =>
    "<button class='dayform' data-f='" + f + "' aria-pressed='" + (f === now) + "'>"
    + "<b>" + escText(DAY_FORM[f].label)
    + (DAY_FORM[f].mark ? "<i>" + escText(DAY_FORM[f].mark) + "</i>" : "") + "</b>"
    + "<span>" + escText(DAY_FORM[f].why) + "</span></button>").join("");
  for(const b of $("dayForms").querySelectorAll(".dayform"))
    b.onclick = () => {
      if(isLocked()) return toast("���̉�ʂ̓��b�N��");
      setDayForm(dayPick, b.dataset.f);
      $("dayDlg").close();
      buildSheet();                 /* **�g�ݒ����B** �s�̕��т��ς�� */
      drawDayPanel();               /* �E���j���[�̕��т��A���܂̌`�ɂ��낦�� */
      autoFit();
      toast(md(addDays(monday, dayPick)) + "�i" + DOW[dayPick] + "�j��<b>"
          + escText(DAY_FORM[b.dataset.f].label) + "</b>�ɂ���");
    };
}

/* ���� �p�� ���������������������������������������������������������������������������� */

/* ���̖ʂ�����B**B4 �̂悱�i364�~257mm�j��1���B**
   �T�̎��Ƃ͗p�����Ⴄ�̂ŁA���钼�O�� @page �������ւ��A
   ����I������猳�֖߂��i�߂��Ȃ��ƁA���ɏT�̎�������Ƃ� B4 �ŏo��j�B */
/* ����������ׂ��ʂ�����B**���̖ʂƃJ�����_�[�̖ʂ�1�B**
   �Ⴄ�̂́u���̑傫���v�u�{���ɕt�����v�u�g�ݒ������v��3�����B
   2���ƁA�������ς����Ƃ��Е���������Ȃ��B

   **���̑傫���őg�ݒ����Ă������B** ��ʂ̍L���ō��킹���{���̂܂܍���ƁA
   ������͂ݏo�����A���������ɂȂ�B����I���i�܂��͂�߂��j���E���Ė߂�
   ���� �E���Ȃ����̂��߂ɕی����u���B */
function printSpread(page, mark, fit, cellMM){
  const st = $("pagecss");
  const had = st ? st.textContent : "";
  if(st) st.textContent = "@page{size:" + page.w + "mm " + page.h + "mm;margin:"
                        + page.mg + "mm}";
  document.body.classList.add(mark);
  fit(cellMM());
  const back = () => {
    document.body.classList.remove(mark);
    if(st) st.textContent = had;
    fit();
  };
  const once = () => { removeEventListener("afterprint", once); back(); };
  addEventListener("afterprint", once);
  setTimeout(() => { if(document.body.classList.contains(mark)) back(); }, 4000);
  window.print();
}
const printMonth = () => printSpread(M_PAGE,   "printing-month", fitMonth, mCellMM);
const printCal   = () => printSpread(CAL_PAGE, "printing-cal",   fitCal,   calCellMM);

function applyPaper(){
  const s = db.settings, sh = $("sheet");
  const [w, h] = s.paper === "A4" ? ["210mm", "297mm"] : ["182mm", "257mm"];
  sh.style.setProperty("--pw", w);
  sh.style.setProperty("--ph", h);
  sh.style.setProperty("--pm", s.margin + "mm");
  sh.style.setProperty("--k", s.k);
  sh.style.setProperty("--fs-t", (+s.titlePt || 16) + "pt");
  sh.style.setProperty("--fs-n", (+s.notePt || 12) + "pt");
  sh.style.setProperty("--fs-a", (+s.notePt || 12) * .92 + "pt");
  let st = $("pagecss");
  if(!st){ st = el("style"); st.id = "pagecss"; document.head.appendChild(st); }
  /* **`size:B5` �Ə����Ȃ��B** CSS �� B5 �� ISO B5�i176�~250mm�j�ŁA
     ���{�� B5�iJIS�E182�~257mm�j��� 6�~7mm �������B�L�[���[�h�ŏ����ƁA
     ���� 182�~257 �̂���őg�񂾔Ŗʂ� 176�~250 �̘g�ɓ��炸�A
     **�����͂ݏo����2�y�[�W�ڂ��o��**�i���ۂɏo���j�Bmm �Œ��ɏ����B */
  st.textContent = "@page{size:" + w + " " + h + ";margin:" + s.margin + "mm}";
  $("stPaper").value = s.paper;
  $("stMg").value = s.margin;  $("stMgV").textContent = s.margin;
  $("stK").value  = s.k;       $("stKV").textContent  = (+s.k).toFixed(2);
  $("stTitle").value = +s.titlePt || 16; $("stTitleV").textContent = +s.titlePt || 16;
  $("stNote").value = +s.notePt || 12; $("stNoteV").textContent = +s.notePt || 12;
  /* �E���j���[�� �{? �������l���o���B**2�����������I������**�̂ŁA
     �ǂ��炩�璼���Ă��A�����Е��̐����������� */
  if(typeof paintFontBtns === "function") paintFontBtns();
  autoFit();
}

/* ���� �����W�v�\�ւ̃R�s�[ ����������������������������������������������
   �T���Ƃ̃V�[�g��1��œ\����`�ɂ���B��̃Z�����܂߂�B
   �����Ȃ����Ȃ͋󗓂ɂ���i������ Excel ���̏o�����̏W�v��������j�B */

const tallyClasses = () =>
  String(db.settings.tally.classes || "").split(/[,�A\s]+/).filter(Boolean);

function tallyGrid(){
  const t = db.settings.tally;
  const list = tallyClasses(), block = Math.max(1, +t.block || 10);
  const used = Object.keys(t.cols).map(k => +t.cols[k] || 0);
  const width = (used.length ? Math.max.apply(null, used) : 0) + 1;
  const rows = [];
  for(let d = 0; d < WEEKDAYS; d++) for(let r = 0; r < block; r++){
    const line = new Array(width).fill("");
    /* **�x�݂̓��͐����Ȃ��B** �΂ߐ������������̎��Ƃ𐔂���ƁA
       Excel ���̎��������̏T���������Ȃ� */
    if(r < list.length && !isDayOff(d)){
      for(const s of SLOTS){
        if(!(s.id in t.cols)) continue;
        /* ���ʍZ���̓��͒��w�K�������B���ɏo�Ă��Ȃ����̂𐔂��Ȃ� */
        if(!slotShown(d, s)) continue;
        const sub = countSub(compose(list[r], d, s.id));
        line[t.cols[s.id]] = sub ? sub.short : "";
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
  /* **�����̍s��S���o���B** �O�́u������̂��ꂪ�����Ă�����́v������
     �o���Ă����̂ŁA�����V�[�g��ID�����肩��ς����w�Z�ł͈ꗗ�ɏo���A
     �����̃R�s�[����̂܂�**��ʂ���͒����Ȃ�����**�B
     �󗓁����̍Z���͎ʂ��Ȃ��B */
  $("tyCols").innerHTML = "<span>��̂���</span>" + SLOTS
    .map(s => "<label style='font-size:12px;color:var(--tx-sub)'>"
      + escText(s.tally || s.name)
      + " <input type='number' data-s='" + escText(s.id) + "' value='"
      + (s.id in t.cols ? t.cols[s.id] : "")
      + "' min='0' max='40' placeholder='?' style='width:4.4em'></label>").join("")
    + "<span class='hint' style='flex:1 0 100%;margin:2px 0 0'>"
    + "�󗓂ɂ���ƁA���̍Z���͎ʂ��Ȃ�</span>";
  for(const e of $("tyCols").querySelectorAll("input")) e.oninput = () => {
    if(String(e.value).trim() === "") delete t.cols[e.dataset.s];
    else t.cols[e.dataset.s] = Math.max(0, +e.value || 0);
    save(); drawTallyPreview();
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
    return who + "�� " + r.map(v => v || "�E").join(" ");
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

/* ���� ���̕��т́u�H�v ����������������������������������������������
   **���߂Ă��̉�ʂ��J�����l���A�����O�ɉ����N���邩������悤�ɂ���B**

   �͂��߂ɒ���������ǂ܂��Ȃ��B�����C�ɂȂ������̂����A���̏�œǂ߂�B
   1�̑��őS���܂��Ȃ��i���ڂ��Ƃɑ������ƁA���������΂���j�B

   �������̌��܂�
     �E1�s�ڂŁu����͉����v�������؂�
     �E���Ɂu�����Ɖ����N���邩�v
     �E�Ō�ɁA���߂Ă̐l���܂����Ƃ����1����
     �E������g��Ȃ��B�g���Ƃ��́A���̏�Ō��������� */
const HELP = {
  week: {t:"�T���s��������EA�TB�T",
    b:["<b>���܌��Ă���1�T�Ԃł��B</b>? ? �őO�̏T�E���̏T�ֈڂ�܂��B",
       "���̉��� <b>A�T / B�T</b> �́A��{���Ԋ���2��ނ̂��Ƃł��B"
       + "�ǂ���̏T����<b>���t���玩���Ō��܂�</b>�̂ŁA�ӂ���͉����܂���B",
       "�����΂񉺂̗��ŁA<b>�ǂ̃N���X�i�܂��͊w�N�E��ȁj�̏T�Ă����邩</b>��I�т܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>A�TB�T����ŉ����ƁA"
       + "���̏T�����E���̒[���������ς��܂��B�S�Z�œ���ւ������Ƃ��͉������ɁA"
       + "�Ǘ��̐l�ɓ`���Ă��������B"]},
  gate: {t:"�ق��̏T�Ă��Ђ炭",
    b:["<b>�N���X��w�N��I�ԁA�����̕\�ł��B</b>�����ƁA���̏T�Ă��J���܂��B",
       "<b>�J�������̂��A�������\��̓����ɂȂ�܂��B</b>"
       + "�u3-3�v���J���ď�����3�N3�g�����ɁA�u3�N�v���J���ď�����3�N�̑S�N���X�ɁA"
       + "�u�S�w�N�v���J���ď����ΑS�N���X�ɓ���܂��B",
       "������A<b>�u����Ƃ��ď������v��ʂɑI�ԕK�v�͂���܂���B</b>",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�����̃N���X���J���Ă��珑���Ă��������B"
       + "�u�S�w�N�v���J�����܂܏����ƁA�S�N���X�ɓ����\�肪����܂��B"]},
  now: {t:"���܁F����",
    b:["<b>���܊J���Ă�����̖̂��O�ł��B</b>�����ƁA�����֖߂�܂��B",
       "�����̕\���J�������ƂŁu����ς茳�̂Ƃ���ցv�Ǝv�����Ƃ��Ɏg���܂��B"]},
  print: {t:"����iB5�j",
    b:["<b>���܌��Ă���1�T�Ԃ��AB5�̎�1���ɍ���܂��B</b>�����K�g�ɓ\��傫���ł��B",
       "�����ƁA�u���E�U�̈���̑����o�܂��B",
       "<b>�������ɏo�Ă�����̂����������܂��B</b>�܂��̃{�^���⍶�̕��т͍����܂���B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>���̃T�C�Y��]����"
       + "�u�p���E����v�ŕς����܂��B�����Ă݂č���Ȃ���΁A������Œ����܂��B"]},
  tally2: {t:"�������W�v����",
    b:["<b>���܊J���Ă���N���X�̎��Ƃ��A���Ȃ��Ƃɐ��������̂ł��B</b>"
       + "�����u�����v�A�E���u�݌v�v�i�N�x�͂��� 4/1 ����̍��v�j�ł��B",
       "<b>�܂������Ă��Ȃ����́A��{���Ԋ��ǂ���Ƃ��Đ����܂��B</b>"
       + "�������̌��Ԃ���A���ʂ��̐��Ƃ��ē����Ă��܂��B",
       "<b>�u�������W�v����v�������ƁA���܊J���Ă���N���X�Ԃ�𐔂��āA"
       + "�X�v���b�h�V�[�g�́u�����W�v�v�V�[�g�ɒu���܂��B</b>"
       + "����������΁AExcel �֑ł��������Ɍ����Ƃ̎������ǂ߂܂��B",
       "<b>������̂́A�J���Ă���ʂ̂Ԃ񂾂��ł��B</b>"
       + "3-3 ���J���Ă���� 3-3 ��1�N���X�A�w�N���J���Ă���΂��̊w�N�̑S�N���X�B"
       + "�����̃N���X�Ԃ񂾂��Ȃ�A�����Ă����\�b�ŏI���܂�"
       + "�i�O�͑S27�N���X�𐔂��Ă��āA1?3���������Ă��܂����j�B",
       "<b>�N�x�̌㔼�قǒ���������܂�</b> ���� 3���ɂ�45�T�Ԃ��ǂ݂܂��B"
       + "�����E�w������1�񉟂��g�������l���Ă��܂��B",
       "<b>�u�������̂́A�������тɂ��̃N���X�̍s������蒼���܂��B</b>"
       + "�ق��̃N���X��A�ق��̔N�x�̂Ԃ�͎c��܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�����Ă��邠�����͑҂\�����o�܂��B"
       + "�r���ŉ�ʂ����ƁA�����I����Ă��Ȃ��W�v�͎c��܂���B"
       + "���̏ꍇ�́A������x�����Ă��������i���x�����Ă���蒼�������ł��j�B"]},
  tally: {t:"�������R�s�[",
    b:["<b>���܌��Ă���1�T�Ԃ̎��Ƃ��A�����W�v�\�ɓ\���`�ŃR�s�[���܂��B</b>",
       "�����ƃR�s�[�����̂ŁAExcel �̎����W�v�\���J����<b>�\��t��</b>�Ă��������B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�\��ꏊ�������Ƃ��́A"
       + "���̒��́u�\���v�������ɍ��킹�Ē����܂��B1�񍇂킹��΁A�����炻�̂܂܂ł��B"]},
  newyear: {t:"�V�N�x�ݒ�",
    b:["<b>�N�x�̏��߂ɂ�邱�Ƃ��A���ɕ��ׂ���ʂł��B</b>"
       + "����ԏI���܂ŁA�����ɏo�܂��B",
       "<b>�ォ��1�����ΏI���܂��B</b>�ł������ǂ����́A"
       + "�قƂ�ǂ��̉�ʂ������Ō��Ĕ��肵�܂��B",
       "<b>���ɖ߂��Ȃ�����́A����Ԃ�1�����ł��B</b>"
       + "����1�ɂ� ? ���t���Ă��āA�����O�ɕK���˂����킹������܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>��邱�Ƃ͎�ɊǗ���3�l�̎d���ł��B"
       + "�����̒S���łȂ���΁A�J���Č��邾���ō\���܂���B"]},
  tanpopo: {t:"����ۂ�",
    b:["<b>����ۂۊw���֓n�����Ԋ����A1�T�Ԃ�o����ʂł��B</b>"
       + "����ł���<b>����ۂۂ̑g</b>���A���̂܂܏o����̗�̕��тɂȂ�܂��B",
       "���̖ʂł��邱�Ƃ�2�B<b>�g�̕��т����邱�ƂƁA�o�����ƁB</b>"
       + "�ǂ̌𗬋������l�Ԃ����邩�́A�E���<b>�u�g�����𒼂��v</b>"
       + "�i�ݒ�́u����ۂۑg�����v�Ɠ������j�Œ����܂��B"
       + "�����͔̂N�x�̏��߂ƁA�]���E�]�o�̂Ƃ������ł��B",
       "�g�̒��̃N���X�ɕt�� <b>�ρ^��</b> �́A"
       + "���̒S�C���u����ۂۂɒ�o�v�����������ǂ����ł��B",
       "<b>���������ƁA����ۂێ��Ԋ��Ɂu9��1�T�v�Ƃ������O�̃V�[�g��1���ł��܂��B</b>"
       + "�������O�̃V�[�g������΁A�������ɖ��O��ς��Ďc���܂��B",
       "<b>���b�N�́A�o����Ƒg�����������~�߂܂��B</b>"
       + "�u����ۂێ��Ԋ��ɏ��������v�́A���b�N�����܂܂ł������܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>���ꂽ�g�́u�w���Ґ��v��"
       + "����ۂی𗬋��̗��Ɏc��܂��B�N�x�̏��߂ɒ����̂͂�����ł��B"]},
  cal: {t:"�J�����_�[�i2�����EA4�悱�j",
    b:["<b>2�����Ԃ���AA4 �悱1���ɕ��ׂČ����ʂł��B</b>���̂܂܍���܂��B",
       "<b>1���́A���t�̉��ɍZ�����ォ�珇�ɕ��т܂��B</b>"
       + "�������Ȃ�1�����i�����W�v�\�Ɏʂ��̂Ɠ������j�A"
       + "�E��<b>��ŏ������ޗ�</b>�ł��B",
       "<b>��Ȃ̖ʂł́A���ɍs����̃N���X��</b>�i4-3 �Ȃǁj���o�܂��B"
       + "��Ȃ̏T�̓R�}�̒��g���u�ǂ̃N���X�֍s�����v�Ȃ̂ŁA���Ȃ̎��͏o���܂���B",
       "<b>�w�N�E�S�Z����~��Ă����R�}�ɂ́A���[�ɐ�</b>���t���܂��B"
       + "�T�Ă̎��Ɠ����F�ł��i�S�Z���^�w�N����^��ȁ����j�B",
       "<b>�u���l�F�󗓁^�o���v</b>�ŁA�E�̗��̒��g��؂�ւ��܂��B"
       + "�󗓂Ȃ��ŏ������ގ��ɁA�o���Ȃ�T�Ăɏ��������l�����̂܂܍����܂��B",
       "<b>���̉��́A���̌��̃R�}���i���ʂ͔N�x�͂��� 4/1 ����̗݌v�j�B</b>"
       + "��Ȃ̖ʂł́A���Ȃł͂Ȃ�<b>�N���X����</b>�ɐ����܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�����͌��邾���ł��B"
       + "�����̂́A�����̏T�̎��̂ق��ŁB"
       + "4�����Ԃ񌩂����Ƃ��́u����2�����v�ŌJ���Ă��������B"]},
  pals: {t:"���ȁE�s��",
    b:["<b>�R�}�ֈ����ς��ē���܂��B</b>�R�}��I��ł��牟���Ă�����܂��B",
       "<b>�Z�O�s��</b>�𗎂Ƃ��ƁA���̃R�}�ɔ����u�Z�O�w�K�v���o�܂�"
       + "�i�薼�E���l�ɂ͓���܂���B�����Ēu���Ƙg���Ȃ���܂��j�B",
       "<b>���ƂȂ�</b>�𗎂Ƃ��ƁA���̃R�}�Ɏ΂ߐ��������܂�"
       + "�i���Ƃ͓���Ȃ��Ȃ�܂��B���l�͏����܂��B������x���Ƃ��ƊO��܂��j�B",
       "<b>���Z�b�g</b>�𗎂Ƃ��ƁA���̃R�}�����̖ʂ���������܂�"
       + "�i�e�N���X�̗\�肪�o��悤�ɂȂ�܂��j�B�w�N�E�S�w�N�̖ʂɂ����o�܂��B",
       "<b>��Ȃ̖ʂł́A���̎��Ԃɍs���N���X��I�т܂��B</b>"
       + "�R�}�̒��g�����Ȃł͂Ȃ��A�s����̃N���X������ł��B",
       "<b>���ȂɐF������</b>�́A���̉��Ő؂�ւ��܂��B"
       + "�u���ɂ��v��I�ԂƁA���m�N������ł�13�F���D�F�̔Z�W�ɂȂ�܂��B"]},
  fontsize: {t:"�t�H���g�T�C�Y",
    b:["<b>���ɏo�鎚�̑傫���ł��B</b>�薼�i���Ȗ��j�Ɣ��l��ʁX�ɕς����܂��B",
       "<b>�ݒ�́u����ƕ����v�Ɠ������̂ł��B</b>"
       + "�ǂ��炩�璼���Ă��A�����Е��̐������낢�܂��B",
       "�薼�� 12?20pt�A���l�� 8?14pt�B0.5pt �������܂��B"
       + "�[�܂ŗ���ƁA���̃{�^���͉����Ȃ��Ȃ�܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>"
       + "�薼���g�ɓ��肫��Ȃ��R�}�́A���̃R�}�̒����������ŏk�݂܂��B"
       + "�S��������������O�ɁA1�R�}�����̖�肩�ǂ������Ă��������B"]},
  tally3: {t:"����",
    b:["<b>���܊J���Ă���ʂ̎��Ƃ��A���Ȃ��Ƃɐ��������̂ł��B</b>"
       + "�����u�����v�A�E���u�݌v�v�i�N�x�͂��� 4/1 ����̍��v�j�ł��B",
       "<b>�܂������Ă��Ȃ����́A��{���Ԋ��ǂ���Ƃ��Đ����܂��B</b>"
       + "�������̌��Ԃ���A���ʂ��̐��Ƃ��ē����Ă��܂��B",
       "<b>�m���Ȑ��ɂ������Ƃ��́u�N�x�͂��߂���ǂݒ����v</b>�������܂��B"
       + "4������̏T������ԓǂݒ����Ă��琔�������܂��B",
       "<b>���ł����܂��B</b>���o���������ƊJ�������܂��B"
       + "����������̂ł͂Ȃ��̂ŁA���Ă����Ɖ��̓��͗����߂��Ȃ�܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>"
       + "������͎̂����W�v�\�ɏo�����Ȃ����ł��i�}���E���H�E�N���u�E�ψ���͐����܂���j�B"]},
  imptally: {t:"�����\����C���|�[�g",
    b:["<b>�����\�ɏ�����1�T�Ԃ�̋��Ȃ��A���܊J���Ă���N���X�̏T�Ăɓ���܂��B</b>"
       + "�ł���������߂邽�߂̌��ł��B",
       "<b>�^�ѕ���4�ł��B</b>"
       + "�@ ���́u���`���o���v�������i���܂̒��g���������`�ŃR�s�[����܂��j"
       + "�A �X�v���b�h�V�[�g�ɓ\�� �B ���Ȃ�1�������A�����\�̂��̂ɓ���ւ��� "
       + "�C ���o���̍s���ƃR�s�[���āA���ɓ\��߂��āu�ǂށv",
       "<b>����̂́A���܊J���Ă���N���X�́A���̏T�����ł��B</b>"
       + "�ق��̃N���X��A�ق��̏T�ɂ͓���܂���B",
       "<b>��̗��͐G��܂���B</b>���ꂽ���Ȃ��R�}�͋�ɂ��Ă����Ă��������B"
       + "�u�^�v�Ə����Ɓu���ƂȂ��v�i�΂ߐ��j�ɂȂ�܂��B",
       "<b>�����O�ɁA������̂��ꗗ�ŏo���܂��B</b>"
       + "�u�ǂ̗j���̉��Z���ɁA�������邩�v�ɒ����ďo���̂ŁA"
       + "1�񂸂�ē\���Ă��܂����Ƃ��́A�����ŋC�Â��܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�s����בւ���Ǝ�荞�߂܂���B"
       + "��?����5�s�̂܂܁A���g���������Ă��������B"
       + "�ǂ߂Ȃ��������������́A���ꂸ�ɖ��O���o���܂��B"]},
  impev: {t:"�N�ԍs������R�}�����",
    b:["<b>�N�ԍs���v��\�ɓ����Ă���s�����A�S�Z�E�w�N�̃R�}�ɂ��܂��B</b>",
       "<b>�N�ԍs���v��\�ɂ͍Z���̗񂪂���܂���</b>�i���t�ɂ������т��Ă��܂���j�B"
       + "�����琗�`�Ɂu�Z���v�Ɓu�Ώہv�̗�𑫂��Ă���܂��B"
       + "<b>�R�}�ɂ������s�����A����2�𖄂߂Ă��������B</b>",
       "�u�Ώہv�� <b>�S�Z</b> �� <b>���N</b>�i3�N �Ȃǁj�ł��B"
       + "�S�Z�Ə����ΑS�N���X�̎��ɁA3�N�Ə�����3�N�̑S�N���X�̎��ɏo�܂��B",
       "�u�Z���v�� <b>1?6</b> ���A�Z���̖��O�i���̉�E�Ɗ� �Ȃǁj�ł��B",
       "<b>���߂Ȃ������s�͓���܂���B</b>���`�ɂ͍s���̂����������ԕ��Ԃ̂ŁA"
       + "�R�}�ɂ��Ȃ����̂��c���Ă���̂��ӂ��ł��B�����Ȃ��č\���܂���B",
       "<b>���t�����T�ɂ��܂������Ă��\���܂���B</b>"
       + "�����O�ɁA������T������ԓǂ�ł��珑���܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>"
       + "�����œ��ꂽ���̂́A������N���X����Ԃ̎��ɏo�܂��B"
       + "�������E�����Z���ɗ\�肪�����Ă���΁A������㏑�����܂�"
       + "�i�㏑�����ꂽ�l�̉�ʂɂ́A�J�����Ƃ��ɒm�点���o�܂��j�B"]},
  month: {t:"���Ō���iB4�j",
    b:["<b>���܌��Ă���T����4�T�ԂԂ���A2�~2�ɕ��ׂČ����ʂł��B</b>"
       + "B4 �̎��悱1���ɁA���̂܂܍���܂��B",
       "�P���̔z���E�s���̏d�Ȃ�E��Ȃ̏���́A<b>4�T����ׂď��߂ĕ�����܂��B</b>",
       "<b>�����͌��邾���ł��B</b>�����̂́A�����̏T�̎��̂ق��ŁB",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>4����1���Ɏ��߂邽�߁A"
       + "�ڍׂƕ��ی�̗��͔������Ă���܂��B���Ɩ��͎c��܂��B"]},
  base: {t:"��{���Ԋ�",
    b:["<b>���T����Ԃ��A���Ƃ̎��Ԋ��ł��B</b>"
       + "�T�Ă��J�����Ƃ��A���߂ɏo�Ă���̂�����ł��B",
       "�����𒼂��ƁA<b>�܂����������Ă��Ȃ��T</b>�̌��������ς��܂��B"
       + "���łɏ������\��͕ς��܂���B",
       "A�T�EB�T��2��ނ����Ă܂��B�w�Z�̌Œ莞�Ԋ��\���A�\���Ɠ\���Ď�荞�ނ��Ƃ��ł��܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>1�T�����ς������Ƃ��́A�����ł͂Ȃ�"
       + "���̏T�̎��̏�Œ����Ă��������B"]},
  settings: {t:"�ݒ�",
    b:["<b>�w�Z�S�̂ƔN�x�̂��ƂɂȂ�ݒ���܂Ƃ߂���ʂł��B</b>",
       "��{���Ԋ��A�w�N�E�N���X�A����ۂۑg�����A����ƕ����A�V�N�x�̏�������������J���܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�T���Ƃ̈���E�摜�ESheet�́A���́u�T�Ă��o���v����s���܂��B"]},
  roster: {t:"�w���Ґ�",
    b:["<b>�w�N�ƃN���X�̕��сA��Ȃ̐搶�A����ۂۂ̌𗬋������߂܂��B</b>",
       "�����Ō��߂����̂��A���̂܂܁u�ق��̏T�Ă��Ђ炭�v�̕\�ɂȂ�܂��B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>�N�x�̏��߂ɒ����Ƃ���ł��B"
       + "�ӂ���͐G��܂���B"]},
  paper: {t:"�p���E���",
    b:["<b>����Ƃ��̎��̃T�C�Y�E�]���E�{�������߂܂��B</b>",
       "<b>��ʂ̑傫��</b>�������ŕς����܂��B"
       + "��ʂ�傫�����Ă��A�������Ƃ��̑傫���͕ς��܂���i�ʁX�Ɏ����Ă��܂��j�B",
       "<i>�͂��߂̐l���܂����Ƃ���F</i>1�x�����ċ����K�g�ɓ��ĂĂ��猈�߂�ƁA"
       + "��蒼�����v��܂���B"]},
  legend: {t:"���̏�̌�����",
    b:["<b>�R�}�̒n�̐F���A���̃R�}���ǂ����痈������\���܂��B</b>",
       "<b>��ʂ���~��Ă���</b>�F�w�N��S�w�N�œ��ꂽ�\�肪�A���̃N���X�ɂ��o�Ă�����́B",
       "<b>2�ȏ�����Ă���</b>�F�����R�}�ɗ\�肪�d�Ȃ��Ă�����́B"
       + "<b>���Ƃ��珑���ꂽ�ق����o�Ă��܂��B</b>",
       "<b>��{���Ԋ��̂܂�</b>�F�܂��N�������Ă��Ȃ��R�}�B",
       "<i>�F�����ŕ����Ă��܂���B</i>�N�����ꂽ���́A�R�}�������ƉE���Ɏ��ŏo�܂��B"]},
  admin: {t:"�Ǘ��E�V�X�e��",
    b:["<b>�S�C�̑���͂����ɂ���܂���B</b>"
       + "���܂ǂ̔ł��A�ǂ̃t�@�C���ɂȂ��œ����Ă��邩������Ƃ���ł��B",
       "�s���m�点��Ƃ��́A���̑��̉��ɂ���1�s�����̂܂ܓ`���Ă��������B"
       + "����������������܂��B",
       "�N�x�̏��߂ƏI���ɂ�邱�Ɓi�V�N�x�̏����E�O�̔N�x�̕ۊǁj���A��������J���܂��B"]}
};

/* �u�H�v���������ށB**1�����ł܂Ƃ߂ĕt����B**
   ���ڂ��Ƃ� HTML �֏����ƁA���������ڂŕt���Y���B */
function wireHelp(){
  for(const e of document.querySelectorAll("[data-help]")){
    if(e.querySelector(":scope > .helpq")) continue;
    const k = e.dataset.help;
    if(!HELP[k]) continue;
    const q = el("button", "helpq", "�H");
    q.type = "button";
    q.title = HELP[k].t + " �̐���";
    q.setAttribute("aria-label", HELP[k].t + " �̐������Ђ炭");
    /* **�e�̃{�^�������������Ƃɂ��Ȃ��B** �H�������ĉ�ʂ��؂�ւ��ƁA
       �ǂ����Ƃ��������̐l���A�J���C�̂Ȃ��T�Ă��J���Ă��܂� */
    q.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); openHelp(k); });
    e.appendChild(q);
  }
}
function openHelp(k){
  const h = HELP[k];
  if(!h) return;
  $("helpTtl").textContent = h.t;
  $("helpBody").innerHTML = h.b.map(x => "<p>" + x + "</p>").join("");
  $("helpDlg").showModal();
}

/* �ē��͉�ʐؑցE�ʐM�E�f�[�^�ҏW����؍s��Ȃ��B���s���Ă��N�����~�߂Ȃ��B */
const GUIDE_KEY = 'school-timetable/guide-v2';
function openGuide(automatic){
  try{
    if(automatic && localStorage.getItem(GUIDE_KEY) === 'done') return;
    if(automatic && document.querySelector('dialog[open]')) return;
    const d = $('guideDlg');
    if(d && !d.open) d.showModal();
  }catch(e){ console.warn('�ē����J���܂���ł���', e); }
}
function finishGuide(){
  try{ localStorage.setItem(GUIDE_KEY, 'done'); }catch(_){}
}


/* ���� �V�N�x�̐ݒ� ��������������������������������������������������������
   **4���ɊJ�����Ƃ��A�����A�ǂ̏��ł�邩��1��ʂŏo���B**

   �����icheckYear�j�́u����Ȃ����́v�𖼎w�����邪�A�����������Ȃ��B
   �N�x���߂ɂ�邱�Ƃ͏������v�� ���� �O�N�x�������O�ɕ�������A
   �N���X�𒼂��O�Ɋ�{���Ԋ������Ă��Ӗ��������B�����͎菇�̑��B

   **����̓T�[�o�����B** ��ʂ����肷��ƁA���肪2�����ɕ�����āA
   �Е������������Ƃ��ɉ�ʂƌ������H���Ⴄ�B */
let nySt = null;

/* �������ǂ����������A�Â��Ɍ��ɍs���B**�����オ���1��B**
   �����j���[�ɏo�����ǂ���������Ō��܂�i4/1 ����A�ςނ܂ŏo���j�B */
function pollNewYear(){
  if(!Backend.isGas()) return;
  Backend.yearSetup(r => { nySt = r; paintNewYear(); }, () => {});
}
function paintNewYear(){
  const b = $("navNewYear");
  /* off �� ���̉�ʂ��g���n�߂�O�̔N�x�B**�m�点���o���Ȃ��B**
     ���܂���u�����v�Əo���Ă��A��邱�Ƃ͖����̂ɞ�F�����������Ȃ� */
  if(b) b.hidden = !(nySt && !nySt.done && !nySt.off);
  const h = $("nyHint");
  if(h) h.textContent = !nySt ? ""
    : nySt.off  ? fy() + "�N�x�́A���̉�ʂ��g���n�߂�O�̔N�x�ł�"
    : nySt.done ? fy() + "�N�x�́A����ԍς�ł��܂�"
                : "�܂� " + nySt.ng + " ������܂�";
}

function openNewYearDlg(){
  $("nyYear").textContent = fy() + "�N�x";
  if(!Backend.isGas()){
    $("nyStat").textContent = "�茳�ł͔���ł��Ȃ��i�V�[�g�����Ȃ��ƕ�����Ȃ��j";
    $("nyOut").innerHTML = "";
    $("nyDlg").showModal();
    return;
  }
  $("nyStat").textContent = "�ǂ�ł��܂��c";
  $("nyOut").innerHTML = "";
  $("nyDlg").showModal();
  loadNewYear();
}
function loadNewYear(){
  Backend.yearSetup(r => { nySt = r; drawNewYear(); paintNewYear(); },
                    why => { $("nyStat").textContent = why; });
}

/* ������B**��ʂ̂ǂ̑����J�����B** ���ĊJ���������Ȃ�
   �i����ƁA�ǂ��܂ł������������Ȃ��Ȃ�j */
const NY_ACT = {
  admin:   {label:"�N�x�̑ޔ����Ђ炭", go: () => { $("nyDlg").close(); openAdminDlg(); }},
  roster:  {label:"�w���Ґ����Ђ炭",   go: () => { $("nyDlg").close(); openRosterDlg(); }},
  base:    {label:"��{���Ԋ����Ђ炭", go: () => { $("nyDlg").close(); openBaseDlg(); }},
  tanpopo: {label:"����ۂۂ��Ђ炭",   go: () => { $("nyDlg").close(); openView({kind:"tanpopo"}); }},
  ab:      {label:"A�T�̋N�_�𒼂�",   go: () => openAbDlg()},
  events:  {label:"�s���\��\��ւ���", go: () => openEventsDlg()},
  plan:    {label:"�T�ăV�[�g�����",   go: () => makePlanSheets()}
};
const NY_MARK = {ok:"�ł��Ă���", warn:"���Ă���", ng:"���ꂩ��"};

/* **�菇�́A���̈���1�����傫���o���B**
   �N�x���߂ɂ�������̂́A�����Ă����N���̊w�Z�֗����l�B
   12������ׂāu�ǂꂩ��ł��ǂ����v�Əo���ƁA�ǂ�������t���邩��
   �܂��~�܂�B�ォ�珇�ɁA���܉������̂������J���Ă����B */
function drawNewYear(){
  const r = nySt;
  $("nyStat").innerHTML = r.off
    ? "<b>" + r.year + "�N�x�́A���̉�ʂ��g���n�߂�O�̔N�x�ł��B</b>"
      + "�m�点�͏o���܂���i" + r.from + "�N�x����o���܂��j�B���͎Q�l�ł��B"
    : r.done
    ? "<b>����Ԃł��Ă��܂��B</b>�����j���[�̒m�点�͏����܂��B"
    : "<b>���� " + r.ng + " �ł��B</b>�ォ�珇�ɂ���Ă��������B"
      + "����Ԃł���܂ŁA�����j���[�ɏo�������܂��B";

  const box = [];
  /* ���܉���1�����A�����΂��ɑ傫���o�� */
  const nx = r.off ? null : r.items.filter(x => x.key === r.next)[0];
  if(nx){
    const act = NY_ACT[nx.act];
    box.push("<div class='nynext'>"
      + "<div class='nynhd'>���ɂ�邱��</div>"
      + "<div class='nynttl'>" + escText(nx.label) + "</div>"
      + "<p class='nynwhy'>" + escText(nx.why) + "</p>"
      + (nx.detail ? "<p class='nyndet'>" + escText(nx.detail) + "</p>" : "")
      + (nx.fix ? "<p class='nynfix'><b>�����F</b>" + escText(nx.fix) + "</p>" : "")
      + "<p class='nynundo'>" + nyUndo(nx.undo) + "</p>"
      + "<div class='nynact'>"
      + (nx.hand
         ? "<button class='btn go nyntick' data-k='" + escText(nx.key) + "'>"
           + "�ł����̂ŁA�ςɂ���</button>"
         : "")
      + (act ? "<button class='btn" + (nx.hand ? "" : " go") + " nygo' data-a='"
             + escText(nx.act) + "'>" + escText(act.label) + "</button>" : "")
      + "<span class='nynmin'>�ڈ� " + nx.mins + " ��</span>"
      + "</div></div>");
  }

  /* �c��͕\�ŁB**�ς񂾂��̂͏��ł����B** ������̂����炷 */
  let group = "";
  const rows = [];
  for(const x of r.items){
    if(x.group !== group){
      group = x.group;
      rows.push("<tr class='nygrp'><th colspan='4'>" + escText(group)
        + (x.wait ? "<i>" + escText(x.wait) + "���ς�ł���ł�</i>" : "")
        + "</th></tr>");
    }
    const act = NY_ACT[x.act];
    const now = x.key === r.next;
    rows.push("<tr class='" + x.level + (x.wait ? " later" : "") + (now ? " now" : "") + "'>"
      + "<td class='nybox'>"
      + (x.hand
         ? "<input type='checkbox' class='nytick' data-k='" + escText(x.key) + "'"
           + (x.level === "ok" ? " checked" : "") + (x.wait ? " disabled" : "")
           + " aria-label='" + escText(x.label) + "'>"
         : "<span class='nyauto'>" + (x.level === "ok" ? "?" : x.level === "warn" ? "��" : "?")
           + "</span>")
      + "</td>"
      + "<th>" + (now ? "<i class='nynow'>���܂���</i>" : "") + escText(x.label)
      + (x.hand ? "<i class='nyhand'>�����Ŋm���߂ĉ���</i>" : "")
      + "<i class='nywhy'>" + escText(x.why) + "</i></th>"
      + "<td class='nyd'><span class='lv'>" + NY_MARK[x.level] + "</span>"
      + escText(x.detail)
      + (x.fix ? "<span class='fix'>" + escText(x.fix) + "</span>" : "")
      + "<span class='undo'>" + nyUndo(x.undo) + "</span></td>"
      + "<td class='nyg'>"
      + (act ? "<button class='btn nygo' data-a='" + escText(x.act) + "'"
             + (x.wait ? " disabled" : "") + ">" + escText(act.label) + "</button>" : "")
      + "</td></tr>");
  }
  box.push("<table class='ny'>" + rows.join("") + "</table>");
  $("nyOut").innerHTML = box.join("");

  for(const b of $("nyOut").querySelectorAll(".nygo"))
    b.onclick = () => NY_ACT[b.dataset.a].go();
  for(const b of $("nyOut").querySelectorAll(".nyntick"))
    b.onclick = () => nyTick(b.dataset.k, true);
  for(const c of $("nyOut").querySelectorAll(".nytick"))
    c.onchange = () => nyTick(c.dataset.k, c.checked, c);
}
/* �߂��邩�B**�߂��Ȃ����̂����A�ԂŖ��w������B** */
function nyUndo(s){
  const no = String(s).indexOf("���ɖ߂��܂���") >= 0;
  return "<b class='" + (no ? "nyno" : "nyyes") + "'>"
       + (no ? "? ���ɖ߂��Ȃ�" : "�� ���ɖ߂���") + "</b>"
       + escText(String(s).replace(/\*\*/g, ""));
}
function nyTick(key, on, el){
  const w = Wait.begin("�L�^���Ă��܂�");
  if(el) el.disabled = true;
  Backend.tickYearSetup(key, on,
    r2 => { Wait.end(w); nySt = r2; drawNewYear(); paintNewYear(); },
    why => { Wait.end(w); if(el){ el.disabled = false; el.checked = !el.checked; } toast(why); });
}

/* �T�ăV�[�g�����B**����܂ł̓G�f�B�^���炵�����点���Ȃ������B**
   �菇�̍Ōオ�G�f�B�^���݂��ƁA�����Ŏ~�܂�B */
function makePlanSheets(){
  if(!Wait.guard()) return;
  const w = Wait.begin("�T�ăV�[�g������Ă��܂�");
  Backend.setupPlanSheets(r => {
    Wait.end(w);
    toast("�T�ăV�[�g�� " + ((r && r.made && r.made.length) || 0) + " �������");
    loadNewYear();
  }, why => { Wait.end(w); toast(why); });
}

/* ���� A�T�̋N�_�̌��j ��������������������������������������������������
   **�ݒ�V�[�g�̂���1�s��������ʂ��璼���B** ��ʂ���ݒ��S���������
   �悤�ɂ���ƁA�֖�̗�O���X�g�܂ŉ�ʂ��珑���邱�ƂɂȂ�B */
function openAbDlg(){
  const now = db.settings.abAnchor || AB_ANCHOR;
  $("abDate").value = now;
  $("abNow").textContent = "���܂� " + now;
  $("abWhy").innerHTML = "";
  $("abDlg").showModal();
}
function saveAb(){
  const v = $("abDate").value;
  const d = parseISO(v);
  if(!d) return void ($("abWhy").innerHTML = "<div class='box'>���t�����Ă�������</div>");
  if(d.getDay() !== 1) return void ($("abWhy").innerHTML =
    "<div class='box'><b>���j�����Ă��������B</b>���j�łȂ���������ƁA"
    + "�Ȍ�̏T�����ׂĔ��T����܂��B</div>");
  if(!Wait.guard()) return;
  const w = Wait.begin("�N�_�����Ă��܂�");
  Backend.saveVariantOrigin(v, () => {
    Wait.end(w); $("abDlg").close();
    refreshWeek();
    toast("A�T�̋N�_�� " + v + " �ɂ���");
    if($("nyDlg").open) loadNewYear(); else pollNewYear();
  }, why => { Wait.end(w); $("abWhy").innerHTML = "<div class='box'>" + escText(why) + "</div>"; });
}

/* ���� �N�ԍs���v��\��\��ւ��� ���������������������������������� */
let evRows = null;
function openEventsDlg(){
  evRows = null;
  $("evPaste").value = "";
  $("evStat").textContent = "";
  $("evWarn").innerHTML = "";
  $("evGrid").innerHTML = "";
  $("evGo").disabled = true;
  $("evDlg").showModal();
}
/* �\��ꂽ����\�ɒ����B**�^�u��؂�B** Excel ���X�v���b�h�V�[�g������ŏo�� */
function evParse(text){
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  for(const ln of lines){
    if(!ln.trim()) continue;
    out.push(ln.split("\t"));
  }
  return out;
}
function evRead(){
  const rows = evParse($("evPaste").value);
  $("evGrid").innerHTML = "";
  $("evGo").disabled = true;
  evRows = null;
  if(rows.length < 2)
    return void ($("evWarn").innerHTML =
      "<div class='box'><b>���o���ƁA���Ȃ��Ƃ�1�s���v��܂��B</b>"
      + "���o���̍s���ƃR�s�[���ē\���Ă��������B</div>");
  const head = rows[0].map(x => String(x).replace(/[\s�@]/g, ""));
  if(!head.some(x => x.indexOf("���t") >= 0))
    return void ($("evWarn").innerHTML =
      "<div class='box'><b>�u���t�v�̗񂪌�����܂���B</b>"
      + "���o���� ���t�^�T�^�s���v��i�����j�^�s���v��i�E���j��4�ł��B</div>");
  evRows = rows;
  $("evWarn").innerHTML = "";
  $("evStat").textContent = (rows.length - 1) + " �s��ǂ�";
  $("evGrid").innerHTML = "<table class='tp'>"
    + rows.slice(0, 12).map((r, i) => "<tr>"
        + r.map(c => "<" + (i ? "td" : "th") + ">" + escText(c)
                   + "</" + (i ? "td" : "th") + ">").join("") + "</tr>").join("")
    + "</table>"
    + (rows.length > 12 ? "<p class='hint'>�ق� " + (rows.length - 12) + " �s</p>" : "");
  $("evGo").disabled = false;
}
function evGo(){
  if(!evRows) return;
  if(!Wait.guard()) return;
  const w = Wait.begin("�N�ԍs���v��\��\��ւ��Ă��܂�");
  Backend.saveEvents(evRows, r => {
    Wait.end(w);
    $("evDlg").close();
    toast("�N�ԍs���v��\��\��ւ����i" + r.rows + " �s�j"
        + (r.kept ? "�@�O�̒��g�́u" + r.kept + "�v�Ɏc���Ă���" : ""));
    /* �\��ւ�����A���̔N�x��������x�ǂށB**��ʂ̍s��������ւ��** */
    location.reload();
  }, why => { Wait.end(w); $("evWarn").innerHTML = "<div class='box'>" + escText(why) + "</div>"; });
}

/* ���� �Ǘ��E�V�X�e�� ����������������������������������������������������
   **�S�C�̑���������ɑ��₳�Ȃ��B** ���₷�ƁA�S�C���u�����̑��삪
   �ǂ��ɂ��邩�v�𖈉�2��������I�Ԃ��ƂɂȂ�B������
   �u���܂ǂ̔ł��A�ǂ̃t�@�C���ɂȂ��œ����Ă��邩�v������Ƃ���B */
function openAdminDlg(){
  const b = Backend.info();
  const weeks = Object.keys(db.years).reduce(
    (n, y) => n + Object.keys(db.years[y].weeks || {}).length, 0);
  const rows = [
    ["��",         APP_VERSION],
    ["�ł̓��t",   BUILD_DATE || "�i�����j"],
    ["�Ȃ��ł����", b.gas ? "�X�v���b�h�V�[�g�i�{�ԁj" : "���̒[�������i�茳�j"],
    ["�t�@�C��",   b.file || (b.gas ? "�i�ǂ߂Ă��Ȃ��j" : "?")],
    ["����",       b.me   || "?"],
    ["�J���Ă���N�x", fy() + "�N�x"],
    ["���̒[���Ɏc���Ă���T", weeks + " �T�i" + KEEP_WEEKS + " �T�𒴂�����Â����Ɏ̂Ă�j"],
    ["�܂������Ă��Ȃ��R�}", Backend.unsaved() + " �R�}"]
  ];
  /* **�ۑ��ɂ����������ԁB�����΂�x�������Ԃ���o���B**
     ���ς́A���܂ɏo��x�����B���B����̂́u���܂�10�b�҂v�ق��B
     ������ 2 �b�𒴂�����A�V�[�g��N�x�ŕ�������łidocs/spec.md 13-2�j�B */
  const t = b.times;
  if(t){
    rows.push(["�ۑ��i����" + t.n + "��ōł��x���������́j",
               (t.round / 1000).toFixed(1) + " �b"
               + "�@���킯�F�҂� " + (t.wait / 1000).toFixed(1) + " �b"
               + "�^�������� " + (t.ms / 1000).toFixed(1) + " �b"]);
    rows.push(["���̂Ƃ��̗�", t.cells + " �R�}�E" + t.sheets + " �V�[�g"]);
    if(t.round >= 2000)
      rows.push(["�߂₷", "2 �b�𒴂��Ă���Bdocs/spec.md 13-2 �̎菇������"]);
  }else if(b.gas){
    rows.push(["�ۑ��̎���", "�܂�1����ۑ����Ă��Ȃ�"]);
  }
  $("sysTbl").innerHTML = rows
    .map(r => "<tr><th>" + r[0] + "</th><td>" + escText(String(r[1])) + "</td></tr>").join("");
  $("sysLine").textContent =
    "�T�� " + APP_VERSION + "�i" + (BUILD_DATE || "���t�Ȃ�") + "�j�^"
    + (b.gas ? "�{��" : "�茳") + "�^" + fy() + "�N�x";
  $("ckOut").innerHTML = "";
  drawArchive();
  $("ckStat").textContent = b.gas ? "" : "�茳�ł͌����ł��Ȃ��i�V�[�g��ǂ܂Ȃ��ƕ�����Ȃ��j";
  $("ckGo").disabled = !b.gas;
  $("adminDlg").showModal();
}

/* �����̌��ʁB**�����Ȃ��B���w�����邾���B**
   �����Ƃ���܂Ŏ����ł��ƁA���������g���N�ɂ������Ȃ��܂� year ���i�ށB */
const CK_MARK = {ng:"�v��", warn:"����", ok:"�悢"};
function drawCheck(r){
  $("ckStat").textContent = r.ng ? "����Ȃ����̂� " + r.ng + " ������"
                          : r.warn ? "���Ă������̂� " + r.warn + " ��"
                                   : "������Ă���";
  $("ckOut").innerHTML =
    "<table class=\"ck\">" + r.items.map(x =>
      "<tr class=\"" + x.level + "\">"
      + "<td class=\"lv\">" + CK_MARK[x.level] + "</td>"
      + "<th>" + escText(x.what) + "</th>"
      + "<td>" + escText(x.detail)
      + (x.fix ? "<span class=\"fix\">" + escText(x.fix) + "</span>" : "")
      + "</td></tr>").join("") + "</table>";
}
function runCheck(){
  if(!Wait.guard()) return;
  $("ckGo").disabled = true;
  $("ckStat").textContent = "�������Ă��܂��c";
  const w = Wait.begin("���̔N�x���������Ă��܂�");
  Backend.checkYear(
    r => { Wait.end(w); $("ckGo").disabled = false; drawCheck(r); },
    why => { Wait.end(w); $("ckGo").disabled = false; $("ckStat").textContent = why; });
}

/* ���� �N�x�̑ޔ� ������������������������������������������������������������
   **�N�x���ɁA�l���h���C�u�Ńt�@�C�����ۂ��ƕ�������B**
   ��ʂ͐�����E�ƍ�����E������3�����B�������R�[�h�ŏ����Ȃ��̂ŁA
   �R�s�[�R�ꂪ�����I�ɋN���Ȃ��B�{�̂�URL�͕ς��Ȃ��B

   �i���Ƃɕʂ̃{�^���ɂ��Ă���B**1�ɂ܂Ƃ߂Ȃ��B**
   �܂Ƃ߂�ƁA�m���߂��ɏ����Ă��܂��B */
let arChecked = null;          /* �ƍ��̒ʂ��� {year, url}�B���������܂�܂ŏ������Ȃ� */

function drawArchive(){
  const b = Backend.info();
  $("arYear").value = fy() - 1;             /* ����́u1�O�̔N�x�v */
  $("arYear").disabled = !b.gas;
  $("arCount").disabled = !b.gas;
  $("arStat").textContent = b.gas ? "" : "�茳�ł͑ޔ��ł��Ȃ�";
  $("arOut").innerHTML = "";
  $("arStep2").hidden = true;
  $("arStep4").hidden = true;
  $("arWhy").textContent = "";
  arChecked = null;
}
function arYear(){ return +$("arYear").value || fy() - 1; }

/* �@ ������ */
function arRunCount(){
  if(!Wait.guard()) return;
  const y = arYear();
  $("arStat").textContent = "�����Ă��܂��c";
  $("arStep2").hidden = true; $("arStep4").hidden = true; arChecked = null;
  const w = Wait.begin(y + "�N�x�𐔂��Ă��܂�");
  Backend.archiveCount(y, r => {
    Wait.end(w);
    const done = r.done;
    $("arStat").textContent = done ? y + "�N�x�͑ޔ�����" : "";
    $("arOut").innerHTML =
      "<table class=\"sys\">"
      + "<tr><th>�N�x</th><td>" + r.year + "�N�x</td></tr>"
      + "<tr><th>�T�Ă̍s</th><td>" + r.rows + " �s�i" + r.sheets.length + " �V�[�g�j</td></tr>"
      + "<tr><th>�����Ă���R�}</th><td>" + r.cells + " �R�}</td></tr>"
      + "<tr><th>���t�͈̔�</th><td>" + (r.from ? escText(r.from) + " ? " + escText(r.to) : "?")
      + "</td></tr>"
      + (r.sheets.length
         ? "<tr><th>���킯</th><td>" + r.sheets.map(s =>
             escText(s.name) + " " + s.rows + "�s").join("�@") + "</td></tr>" : "")
      + (done ? "<tr><th>�ޔ�����</th><td>" + escText(done.at) + "�@"
                + escText(whoName(done.by)) + "</td></tr>" : "")
      + "</table>";
    if(!r.rows){
      $("arStat").textContent = y + "�N�x�̏T�Ă�1�s���Ȃ��B�ޔ�������̂��Ȃ�";
      return;
    }
    $("arFile").textContent = r.file;
    $("arName").textContent = "�T�� �ۑ� " + r.year + "�N�x";
    $("arStep2").hidden = false;
  }, why => { Wait.end(w); $("arStat").textContent = why; });
}

/* �B �ƍ�����B**�������ʂ�܂ŁA�����{�^���͏o���Ȃ��B** */
function arRunVerify(){
  if(!Wait.guard()) return;
  const y = arYear(), url = $("arUrl").value.trim();
  if(!url) return void ($("arWhy").textContent = "�ޔ���URL��\��");
  $("arWhy").textContent = "�ƍ����Ă��܂��c";
  $("arStep4").hidden = true; arChecked = null;
  const w = Wait.begin("�ޔ��Əƍ����Ă��܂�");
  Backend.archiveVerify(y, url, r => {
    Wait.end(w);
    if(!r.ok){
      $("arWhy").innerHTML = "<b>�����Ă��Ȃ��B�����܂���B</b><ul>"
        + r.why.map(w => "<li>" + escText(w) + "</li>").join("") + "</ul>";
      return;
    }
    arChecked = {year:y, url};
    $("arWhy").innerHTML = "<b>�����Ă���B</b>"
      + escText(r.there.file) + " �� " + r.there.rows + " �s������Ă���B";
    $("arTyped").value = "";
    $("arGo").disabled = true;
    $("arStep4").hidden = false;
  }, why => { Wait.end(w); $("arWhy").textContent = why; });
}

/* �C �����B�N�x��ł����܂���B**��N���b�N�ŏ����Ȃ��B** */
function arRunPurge(){
  if(!Wait.guard()) return;
  if(!arChecked) return;
  const typed = $("arTyped").value.trim();
  $("arGo").disabled = true;
  $("arWhy").textContent = "�����Ă��܂��c";
  const w = Wait.begin("�{�̂�������Ă��܂�");
  Backend.archivePurge(arChecked.year, arChecked.url, typed, r => {
    Wait.end(w);
    $("arWhy").innerHTML = "<b>" + r.year + "�N�x��ޔ������B</b>"
      + r.rows + " �s�i" + r.cells + " �R�}�E" + r.sheets + " �V�[�g�j��{�̂���������B"
      + "���g�͕ۊǌɂɎc���Ă���B";
    $("arStep4").hidden = true;
    arChecked = null;
    paintArchive();
    toast(r.year + "�N�x��ޔ������B�{�̂�URL�͕ς���Ă��Ȃ�");
  }, why => {
    Wait.end(w);
    $("arWhy").innerHTML = "<b>�����Ȃ������B</b><br>" + escText(why).replace(/\n/g, "<br>");
    $("arGo").disabled = false;
  });
}

/* �ޔ����݂̔N�x���J���Ă��邠�����A���̏�ɏo���Ă����m�点�B
   **���ꂪ�����ƁA��{���Ԋ������̎������āu�T�Ă��S���������v�ƌ�����B** */
function paintArchive(){
  const bar = $("arcBar");
  if(!bar) return;
  const a = Backend.archivedYear ? Backend.archivedYear(fy()) : null;
  if(!a || view.kind === "gate" || view.kind === "tanpopo"){ bar.hidden = true; return; }
  bar.hidden = false;
  $("arcTitle").textContent = fy() + "�N�x�͑ޔ����݂ł�";
  $("arcNote").textContent =
    "���̔N�x�̏T�Ă͕ۊǌɂɈڂ��Ă���܂��B�����ɏo�Ă���̂͊�{���Ԋ��ł��B"
    + (a.at ? "�i" + a.at + "�@" + whoName(a.by) + "�j" : "");
  const link = $("arcLink");
  if(a.url){ link.href = a.url; link.hidden = false; }
  else link.hidden = true;
}

/* ���� �ۑ��̋��� ������������������������������������������������������������
   ��������ʂ��J�������ƂɁA�ʂ̐l�������R�}�𒼂��Ă����B
   ���̂܂ܑ���ƁA���̐l�̏��������̂�**�������{�l�ɂ������Ȃ��܂�**������B
   �T�[�o�̓R�}�P�ʂŎ~�߂� conflicts �ŕԂ��i�� gas/Store.gs writeCells�j�B

   **����́u�ŐV�̓��e������v�B** Esc ���A�O�����������Ƃ����A
   �Ԏ������Ȃ��܂܏������Ƃ��������B�㏑���́A�����������Ƃ������B

   �\�t�g���b�N���iswDlg�u�ق��̐l�����ꂽ�\��ł��v�j�Ƃ͕ʂ̑��ɂ���B
   �������**�����Ă���\��**��ׂ��Ƃ��̊m�F�ŁA�������
   **�����Ă��Ȃ��ύX**��ׂ��Ƃ��̊m�F�B�������Ⴄ�̂�1�ɂł��Ȃ��B
   ������A�㏑����I�񂾂Ƃ��́A�T��ǂݒ����Ă�����߂Ă������ʂ��B */

let cfAsk = null;

function cfWhen(h){
  const dt = parseISO(h.c.date), sl = SLOT_BY_ID[h.c.slot];
  if(!dt) return String(h.c.date);
  return md(dt) + "(" + (DOW[(dt.getDay() + 6) % 7] || "") + ") "
       + (sl ? sl.name + (sl.kind === "lesson" ? "�Z��" : "") : h.c.slot);
}
function cfWho(h){
  const t = h.c.target || "";
  return h.c.layer === "school" ? "�w�Z�S��"
       : h.c.layer === "grade"  ? t + "�N"
       : h.c.layer === "special"? t + "�i��ȁj" : t;
}

function showConflicts(list){
  if(!list || !list.length) return;
  cfAsk = list;
  $("cfList").innerHTML = list.map(h => {
    const mine = !h.q ? "�i������Ȃ��j"
               : h.q.remove ? "�i�����j" : (plain(h.q.title) || "�i��j");
    const now  = plain(h.c.currentTitle) || "�i��j";
    return "<li><b>" + escText(cfWhen(h)) + "</b>�@" + escText(cfWho(h))
      + "<br>���Ȃ�������悤�Ƃ������́F�u" + escText(mine) + "�v"
      + "<br><span class=\"who\">���ܓ����Ă���̂́u" + escText(now) + "�v"
      + (h.c.currentBy ? "�E" + escText(whoName(h.c.currentBy)) + " �����ꂽ����" : "")
      + "</span></li>";
  }).join("");
  $("cfDlg").showModal();
  $("cfSee").focus();               /* **����́u�ŐV�̓��e������v�B** */
}

/* ���̕Ԏ���1�񂾂������B�����i�{�^���EEsc�E�O���j�Ŏ�肱�ڂ��Ȃ� */
function cfAnswer(mine){
  const list = cfAsk;
  cfAsk = null;
  if(!list) return;
  if(!mine) Backend.dropHeld(list);  /* �ŐV���̗p�����Ƃ������A�����̍T����j������B */
  setBusy(true, "�ŐV�̓��e��ǂ�ł��܂�");
  Backend.reloadWeek(list, () => {
    setBusy(false);
    refreshWeek();
    if(!mine) return toast("<b>�ŐV�̓��e�ɂ���</b>�@���꒼���Ƃ��́A������x�ł�");
    applyHeld(list);
  });
}

/* �u����ł������̓��e�ŏ㏑������v�Ɠ������Ԃ����꒼���B
   **�ǂݒ��������Ƃɓ��꒼���B** �ǂݒ����O�ɑ���ƁA
   ���Ă��Ȃ��ύX��������x�ׂ��ɂ������ƂɂȂ�B */
function applyHeld(list){
  let i = 0, put = 0, miss = 0;
  const next = () => {
    if(i >= list.length){
      if(!miss) Backend.dropHeld(list);
      save(); refreshWeek();
      if(miss) toast("<b>" + miss + " �R�}�͓��꒼���Ȃ�����</b>�@���̏T���J���đł�����");
      if(put) doSave(true); else if(!miss) toast("���꒼���Ȃ�����");
      return;
    }
    const h = list[i++];
    if(!h.q){ miss++; return next(); }        /* ���������g��������Ȃ� */
    /* ���܊J���Ă���T�E���܏����Ă����̃R�}�����A�\�t�g���b�N����ʂ��B
       �ق��̏T�̃R�}�́A���̏T���o���Ă��Ȃ��̂ő��ɏo���Ă��ǂ߂Ȃ��B */
    if(!cfInView(h)){ if(restoreConflicted(h)) put++; else miss++; return next(); }
    forgetAsked(h.loc.d, h.c.slot);           /* �O�̓����͕ʂ̒��g�ւ̓��� */
    okToOverwrite(h.loc.d, h.c.slot, h.q.remove ? "" : plain(h.q.title),
                  () => { if(restoreConflicted(h)) put++; else miss++; next(); },
                  () => next());
  };
  next();
}

const cfInView = h =>
  String(h.loc.year) === String(fy()) && h.loc.monday === wkKey()
  && h.c.layer === layerOfStore() && (h.c.target || "") === (targetOfStore() || "");

/* ���낤�Ƃ������g���A���̏T�̍T���֖߂��B
   �������isat�j��**�T�[�o�����܎����Ă��鎞��**�ɂ���B
   ���������̒l�̂܂܂ɂ���ƁA���蒼���Ă��܂���������B */
function restoreConflicted(h){
  const q = h.q, c = h.c;
  const Yr = db.years[String(h.loc.year)];
  const wk = Yr && Yr.weeks && Yr.weeks[h.loc.monday];
  if(!wk) return false;                      /* ���̏T�̍T������������ */
  const bank = c.layer === "school" ? wk.school
             : c.layer === "grade"  ? (wk.grade[c.target]   || (wk.grade[c.target]   = {}))
             : c.layer === "special"? (wk.special[c.target] || (wk.special[c.target] = {}))
             :                        (wk.home[c.target]    || (wk.home[c.target]    = {}));
  const key = ck(h.loc.d, c.slot), sat = +c.currentAt || 0;
  if(q.remove) delete bank[key];
  else bank[key] = {title:q.title, note:q.note, subject:q.subject || null,
                    sp:q.sp || "", at:Date.now(), by:myEmail(), sat};
  Backend.cellChanged(c.layer, c.target, h.loc.d, c.slot, sat,
                      {year:h.loc.year, monday:h.loc.monday});
  return true;
}

