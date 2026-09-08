/* たんぽぽ時間割へ出すところ。

   **出したものはたんぽぽ時間割へ全部入る。** そのあとは、たんぽぽ担当が
   たんぽぽ時間割の側を直していく。こちらは下書きを配る役。

   塗り分け（灰＝このサイトから入れたコマ／白＝たんぽぽの中で受ける授業）は、
   **こちらが塗らない。** たんぽぽ時間割の側の条件付き書式が、
   すぐ下の「担当者・場所」を見て決める。
   こちらが塗ると、たんぽぽ担当が直したあとに色と中身が食い違う。 */

/* 実物（たんぽぽ時間割 週案シート）の列構成。
   B〜AA が児童ごとの列（見出しはその日の交流学級）、AB 以降は支援員・ボランティア。 */
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
/* 担当者・場所の見本。**実物ではシートのその行を読む。**
   ここは、塗りがどう決まるかを見せるための仮置き。 */
const TANPOPO_DUTY = ["交：丸山", "た：桝村", "交：星川", "た：西本",
                      "", "交：朝倉", "支：大屋", "た：安部"];
/* たんぽぽ時間割は1日6校時ぶんの行を持っている。
   **どの校時かは時程シートが決める**ので、授業の行の上から6つを使う
   （時程のIDを学校が変えていても合う）。 */
const tpSlots = () => SLOTS.filter(s => s.kind === "lesson").slice(0, 6).map(s => s.id);
let tpDay = 0;

const tpChosen  = () => Y().tanpopo || [];
const tpHasCls  = c => tpChosen().indexOf(c) >= 0;

/* ── たんぽぽの面 ────────────────────────────── */

function drawTanpopoView(){
  /* 交流級を選ぶ。**選んだクラスだけを出す。** */
  $("tpSel").innerHTML = grades().map(g =>
    "<div class='tprow'><span>" + escText(g) + "年</span><div class='tpchips'>"
    + classesOfGrade(g).map(c => {
        const st = planState(c), on = tpHasCls(c);
        return "<button class='tpchip" + (on && st !== "ok" ? " warn" : "") + "'"
             + " aria-pressed='" + on + "' data-c='" + escText(c) + "'><i></i>"
             + escText(c) + "</button>";
      }).join("")
    + "</div></div>").join("");
  for(const b of $("tpSel").querySelectorAll(".tpchip")) b.onclick = () => {
    const c = b.dataset.c, list = Y().tanpopo;
    const i = list.indexOf(c);
    if(i >= 0) list.splice(i, 1); else list.push(c);
    save(); Backend.saveRoster(); drawTanpopoView();
  };

  /* **基本時間割から動いていないクラスを知らせる。**
     動いていない週をそのまま出すと、担任がまだ書いていない予定を本物のように配る。 */
  const chosen = tpChosen().filter(c => allClasses().indexOf(c) >= 0);
  const base  = chosen.filter(c => planState(c) === "base");
  const upper = chosen.filter(c => planState(c) === "upper");
  const boxes = [];
  if(base.length)
    boxes.push("<div class='box'><b>" + base.map(escText).join("・")
      + "</b> は今週まだ<b>基本時間割のまま</b>です。<br>"
      + "このまま出すと、担任がまだ書いていない予定をたんぽぽへ配ることになります。</div>");
  if(upper.length)
    boxes.push("<div class='box'><b>" + upper.map(escText).join("・")
      + "</b> は<b>上位（全校・学年）の予定しか入っていません</b>。担任は未着手です。</div>");
  if(!chosen.length)
    boxes.push("<div class='box ok'>交流級をまだ選んでいません。上から選んでください。</div>");
  else if(!boxes.length)
    boxes.push("<div class='box ok'>選んだ " + chosen.length
      + " クラスは、いずれも今週の予定が入っています。</div>");
  $("tpWarn").innerHTML = boxes.join("");

  $("tpGo").disabled = !chosen.length;
  $("tpCount").innerHTML = chosen.length
    ? "選んでいるのは <b>" + chosen.length + " クラス</b>"
    : "";
}

/* ── 出す前のプレビュー ────────────────────────
   1コマは2行で1組。上がタイトル（授業）、下が担当者・場所。 */

function tanpopoCell(colIdx, col, slotId){
  if(col.staff) return {fill:"none", why:"支援員の列"};
  const duty = TANPOPO_DUTY[(colIdx * 3 + tpSlots().indexOf(slotId) * 5) % TANPOPO_DUTY.length];
  if(allClasses().indexOf(col.cls) < 0) return {fill:"none", duty, why:"編成に無いクラス"};
  if(!tpHasCls(col.cls))                return {fill:"none", duty, why:"選んでいない交流級"};
  const t = plain(compose(col.cls, tpDay, slotId).title).trim();
  /* **全部入れる。** 塗りはシート側の条件付き書式が担当者・場所を見て決める */
  return {fill: duty.charAt(0) === "た" ? "own" : "imported",
          title: t, empty: !t, duty};
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

  let imported = 0, own = 0, none = 0;
  const head = "<tr><th>列</th><th>交流学級</th>"
    + tpSlots().map(s => "<th>" + escText(SLOT_BY_ID[s].name) + "</th>").join("") + "</tr>";
  const body = TANPOPO_COLS.map((col, i) => {
    const cells = tpSlots().map(s => {
      const r = tanpopoCell(i, col, s);
      if(r.fill === "imported") imported++; else if(r.fill === "own") own++; else none++;
      const top = r.fill === "none" ? "<i>" + escText(r.why) + "</i>"
                : r.empty          ? "<i>（空）</i>"
                                   : "<b>" + escText(r.title) + "</b>";
      const bot = r.duty ? "<u>" + escText(r.duty) + "</u>" : "<u>&nbsp;</u>";
      return "<td class='f-" + r.fill + "'>" + top + bot + "</td>";
    }).join("");
    return "<tr" + (col.staff ? " class='staff'" : "") + "><th>" + col.col + "</th>"
         + "<th>" + escText(col.cls) + "</th>" + cells + "</tr>";
  }).join("");
  $("tpGrid").innerHTML = "<table class='tp'>" + head + body + "</table>";
  $("tpSum").innerHTML =
      "<span class='k f-imported'></span>入れる（灰） <b>" + imported + "</b>　"
    + "<span class='k f-own'></span>入れる（担当が「た」なので白） <b>" + own + "</b>　"
    + "<span class='k f-none'></span>書かない <b>" + none + "</b>";
}

/* 出す中身を組む。**層を重ねたあとの、紙に出ているとおりの授業名。**
   {クラス: {"0":{p1:"国語", …}, …}}（0〜4 は月〜金） */
function tanpopoTitles(list){
  const out = {};
  for(const cls of list){
    const per = {};
    for(let d = 0; d < 5; d++){
      const one = {};
      for(const s of tpSlots()) one[s] = plain(compose(cls, d, s).title).trim();
      per[String(d)] = one;
    }
    out[cls] = per;
  }
  return out;
}

/* 出す。**たんぽぽ側の直しは消える**ので、そこを先に言う。 *//* 出す。**たんぽぽ側の直しは消える**ので、そこを先に言う。 */
function reflectTanpopo(){
  const chosen = tpChosen().filter(c => allClasses().indexOf(c) >= 0);
  if(!chosen.length) return toast("先に交流級を選ぶ");
  const bad = chosen.filter(c => planState(c) !== "ok");
  const yes = confirm(
    md(monday) + " → " + md(addDays(monday, 4)) + " の週を、たんぽぽ時間割へ出します。\n\n"
    + "・選んだ交流級：" + chosen.join("、") + "\n"
    + (bad.length ? "・まだ基本時間割のまま：" + bad.join("、") + "\n" : "")
    + "\nたんぽぽ時間割の授業名は、この週のぶんが全部入れ替わります。\n"
    + "たんぽぽ側で直した内容は消えます。\n\nつづけますか？");
  if(!yes) return;

  if(!Backend.isGas()){
    openTanpopoDlg();
    toast("いまは<b>書き込まない</b>。実物のたんぽぽ時間割につないでいないため、"
        + "入るところをプレビューで見せている");
    return;
  }
  /* 先に、書いたぶんをシートへ送る。送る前に出すと、出した紙と週案が食い違う */
  $("tpGo").disabled = true;
  $("tpCount").innerHTML = "たんぽぽ時間割へ書いている…";
  Backend.flush(() => {
    Backend.exportTanpopo(tanpopoTitles(chosen), chosen, tpSlots(),
      r => {
        $("tpGo").disabled = false;
        drawTanpopoView();
        showTanpopoResult(r);
      },
      why => {
        $("tpGo").disabled = false;
        drawTanpopoView();
        $("tpWarn").innerHTML =
          "<div class='box'><b>たんぽぽ時間割へ出せませんでした。</b><br>"
          + escText(why) + "</div>" + $("tpWarn").innerHTML;
      });
  });
}

/* 出したあとに、何がどうなったかを出す。**数と、飛ばした日を必ず見せる。**
   「出しました」だけだと、形が合わずに飛ばした日に気づけない。 */
function showTanpopoResult(r){
  const box = [];
  box.push("<div class='box ok'><b>たんぽぽ時間割に出した。</b>"
    + escText(r.file || "") + "／" + (r.days || 0) + "日ぶん・"
    + (r.wrote || 0) + "コマ</div>");
  if(r.skipped && r.skipped.length)
    box.push("<div class='box'><b>書かなかった日がある。</b><br>"
      + r.skipped.map(escText).join("<br>")
      + "<br>たんぽぽ時間割の日ブロックの形（+5 中休み・+10 給食・+11 昼休み）を"
      + "確かめる（docs/setup.md Step 8）</div>");
  if(r.unknown && r.unknown.length)
    box.push("<div class='box'>たんぽぽ時間割の列見出しにあるが、こちらで選んでいない"
      + "クラス：<b>" + r.unknown.map(escText).join("・") + "</b></div>");
  $("tpWarn").innerHTML = box.join("") + $("tpWarn").innerHTML;
  toast("たんぽぽ時間割に <b>" + (r.wrote || 0) + " コマ</b>入れた");
}
