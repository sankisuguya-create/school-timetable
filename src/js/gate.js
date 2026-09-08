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
        ? "<button class='tile cls' data-go='class' data-c='" + escText(cs[i]) + "'>"
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
  /* いちばん下にたんぽぽ。ここで交流級を選び、ここからだけ出す */
  out.push("<button class='master tp' data-go='tanpopo'><i></i>たんぽぽ</button>");
  const tpN = tpChosen().filter(c => allClasses().indexOf(c) >= 0).length;
  out.push("<span class='tile note' style='grid-column:span " + cols + "'>"
    + (tpN ? "交流級 " + tpN + " クラスを選んでいる" : "交流級をまだ選んでいない")
    + "</span>");
  g.innerHTML = out.join("");

  for(const b of g.querySelectorAll("[data-go]")){
    b.onclick = () => {
      const k = b.dataset.go;
      openView(k === "class"   ? {kind:"class",   cls:b.dataset.c}
             : k === "grade"   ? {kind:"grade",   grade:b.dataset.g}
             : k === "special" ? {kind:"special", sp:b.dataset.s}
             : k === "tanpopo" ? {kind:"tanpopo"}
             : {kind:"school"});
    };
  }
  $("gWeek").textContent = md(monday) + " → " + md(addDays(monday, 4));
  $("gFy").textContent   = fy() + "年度";
  const n = weekNo();
  $("gNo").textContent = n ? "第" + n + "週" : "";
  /* 左の週表示も合わせる。入口を開いている間だけ空になると、
     どの週を選んでいるのかが2か所で食い違って見える */
  $("weekLabel").textContent = $("gWeek").textContent;
  $("weekNo").textContent    = (n ? "第" + n + "週　" : "") + fy() + "年度";
  syncVariant();
  $("gClose").hidden = !lastTarget;   /* まだ何も開いていなければ戻る先が無い */
}

/* **待たせない。** シートが届くのを待ってから描くと、押してから紙が出るまで
   何も起きない時間ができる。先にこの端末の控えで描いて、届いたら描き直す。
   届くまでは「読み込み中」を出しておく（古いものを見ているかもしれないため）。 */
function openView(v){
  Backend.flush();                /* いまの画面を出る前に、書いたぶんを送る */
  /* **どこを開くかを先に決める。** そのあとで、その画面に要るシートだけを読む
     （読むものは view から決まるので、読む前に決まっていないといけない） */
  view = v;
  lastTarget = v;
  selCell = null;

  const tp = v.kind === "tanpopo";
  const draw = () => {
    if(view !== v) return;        /* もう別のところを開いている */
    $("gate").hidden = true;
    /* たんぽぽの面は週案の紙ではない。紙と入力パネルを引っこめて入れ替える */
    $("stage").hidden = tp;
    $("tpView").hidden = !tp;
    document.querySelector(".panel").hidden = tp;
    document.querySelector(".work").classList.toggle("no-panel", tp);
    /* たんぽぽの面には紙が無い。紙から出す操作（印刷・時数）は伏せる */
    for(const a of ["print", "tally"])
      document.querySelector("[data-act='" + a + "']").hidden = tp;
    paintHeader();
    if(!tp) drawPalette();
    refreshWeek();
    if(!tp) fillPanel();
  };

  let landed = false, drawn = false;
  Backend.ready(() => {
    landed = true;
    if(!drawn) return;            /* すぐ返った（手元・読み込みずみ）。下で1回描く */
    setBusy(false);
    draw();
  });
  if(!landed) setBusy(true);
  draw();
  drawn = true;
  if(landed) setBusy(false);
}
function showGate(){
  Backend.flush();
  view = {kind:"gate"};
  selCell = null;
  $("gate").hidden = false;
  for(const a of ["print", "tally"])
    document.querySelector("[data-act='" + a + "']").hidden = false;
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
    ["学校",  [["school:", "全学年"], ["tanpopo:", "たんぽぽ"]]]
  ];
  const cur = view.kind === "class"   ? "class:" + view.cls
            : view.kind === "grade"   ? "grade:" + view.grade
            : view.kind === "special" ? "special:" + view.sp
            : view.kind === "school"  ? "school:"
            : view.kind === "tanpopo" ? "tanpopo:" : "";
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
         : kind === "tanpopo" ? {kind:"tanpopo"}
         : {kind:"school"});
}
