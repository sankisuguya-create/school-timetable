/* 入口と行き来。**この表がそのまま層になっている。**
     全学年 → 学校全体のマスター ／ ◯年 → 学年のマスター
     ◯-◯   → そのクラスの週案     ／ 音楽… → 専科の自分の週
   開いたものが「どこに入るか」を決めるので、
   「だれとして書くか」を別に選ばせない。 */

let lastTarget = null;   /* 直前に開いていたもの。「今週の週案」で戻る先 */

function drawGate(){
  const cols = Math.max.apply(null,
    grades().map(g => classesOfGrade(g).length).concat([specials().length, 1]));
  const g = $("grid");
  g.style.setProperty("--cols", cols);

  const out = [];
  for(const gr of grades()){
    const cs = classesOfGrade(gr);
    out.push("<button class='master' data-go='grade' data-g='" + escText(gr) + "'>"
           + "<i></i>" + escText(gr) + "年</button>");
    for(let i = 0; i < cols; i++)
      out.push(cs[i]
        ? "<button class='tile' data-go='class' data-c='" + escText(cs[i]) + "'>"
          + escText(cs[i]) + "</button>"
        : "<span class='tile none'></span>");
  }
  out.push("<button class='master all' data-go='school'><i></i>全学年</button>");
  const sp = specials();
  for(let i = 0; i < cols; i++)
    out.push(sp[i]
      ? "<button class='tile sp' data-go='special' data-s='" + escText(sp[i].code) + "'>"
        + "<i></i>" + escText(sp[i].label) + "</button>"
      : "<span class='tile none'></span>");
  g.innerHTML = out.join("");

  for(const b of g.querySelectorAll("[data-go]")){
    b.onclick = () => {
      const k = b.dataset.go;
      openView(k === "class"   ? {kind:"class",   cls:b.dataset.c}
             : k === "grade"   ? {kind:"grade",   grade:b.dataset.g}
             : k === "special" ? {kind:"special", sp:b.dataset.s}
             : {kind:"school"});
    };
  }
  $("gWeek").textContent = md(monday) + " → " + md(addDays(monday, 4));
  $("gFy").textContent   = fy() + "年度";
  const n = weekNo();
  $("gNo").textContent = n ? "第" + n + "週" : "";
  syncVariant();
  $("gClose").hidden = !lastTarget;   /* まだ何も開いていなければ戻る先が無い */
}

function openView(v){
  view = v;
  lastTarget = v;
  selCell = null;
  $("gate").hidden = true;
  paintHeader();
  drawPalette();
  refreshWeek();
  fillPanel();
}
function showGate(){
  view = {kind:"gate"};
  selCell = null;
  $("gate").hidden = false;
  drawGate();
  paintHeader();
}

/* 上の帯・左の並び・中央のセレクトの「いま」を合わせる */
function paintHeader(){
  const open = view.kind !== "gate";
  $("navOpen").hidden = !open;
  $("navOpenName").textContent = open ? viewName() : "";
  for(const b of document.querySelectorAll(".nav[data-screen]"))
    b.setAttribute("aria-current", String(b.dataset.screen === (open ? "plan" : "gate")));
  $("whoName").textContent = open ? viewName() : "週案";
  $("whoRole").textContent = open ? "（" + viewWhere() + "）" : "";
  drawTargetSelect();
}

/* 中央のセレクト。入口へ戻らずに行き先を変えられる。
   並びは入口の表と同じ順（学級 → 学年 → 専科 → 全学年）。 */
function drawTargetSelect(){
  const sel = $("target");
  const groups = [
    ["学級",  allClasses().map(c => ["class:" + c, c])],
    ["学年",  grades().map(g => ["grade:" + g, g + "年"])],
    ["専科",  specials().map(s => ["special:" + s.code, s.label])],
    ["学校",  [["school:", "全学年"]]]
  ];
  const cur = view.kind === "class"   ? "class:" + view.cls
            : view.kind === "grade"   ? "grade:" + view.grade
            : view.kind === "special" ? "special:" + view.sp
            : view.kind === "school"  ? "school:" : "";
  sel.innerHTML = groups.map(([label, items]) =>
    "<optgroup label='" + label + "'>" + items.map(([v, t]) =>
      "<option value='" + escText(v) + "'" + (v === cur ? " selected" : "") + ">"
      + escText(t) + "</option>").join("") + "</optgroup>").join("");
  sel.disabled = !cur;
}
function onTargetChange(v){
  const [kind, rest] = String(v).split(":");
  openView(kind === "class"   ? {kind:"class",   cls:rest}
         : kind === "grade"   ? {kind:"grade",   grade:rest}
         : kind === "special" ? {kind:"special", sp:rest}
         : {kind:"school"});
}
