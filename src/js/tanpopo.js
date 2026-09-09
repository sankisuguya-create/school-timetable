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

const tpHasCls  = c => tpCount(c) > 0;

/* ── たんぽぽの面 ────────────────────────────
   **たんぽぽの組へ、交流級を引っぱって入れる。**
   1回入れると児童1人＝出す先の1列。同じ組へ2回入れれば2人。
   引っぱれない端末のために、押しても入るようにしてある
   （左のクラスを押すと、いま選んでいる組へ入る）。 */
let tpPick = "1";              /* いま選んでいる組。押して入れるときの行き先 */

function drawTanpopoView(){
  const groups = tpGroups();
  if(groups.indexOf(tpPick) < 0) tpPick = groups[0];

  /* 左：交流級。**どの組に入れてあるかを字で添える**（色だけに頼らない） */
  const left = grades().map(g =>
    "<div class='tprow'><span>" + escText(g) + "年</span><div class='tpchips'>"
    + classesOfGrade(g).map(c => {
        const gs = tpGroupsOf(c), n = tpCount(c), st = planState(c);
        return "<button class='tpchip" + (n ? " on" : "") + (n && st !== "ok" ? " warn" : "")
             + "' draggable='true' aria-pressed='" + (n > 0) + "'"
             + " title='引っぱって組へ入れる。押すと " + escText(tpPick) + "組へ入る'"
             + " data-c='" + escText(c) + "'><i></i>" + escText(c)
             + (gs.length ? "<b>" + gs.map(x => x + "組").join("・") + "</b>" : "")
             + "</button>";
      }).join("")
    + "</div></div>").join("");

  /* 右：たんぽぽの組。**出す列の並びがそのまま見えている。** */
  const right = groups.map(g =>
    "<div class='tpgrp" + (g === tpPick ? " pick" : "") + (+g % 2 === 0 ? " even" : "")
    + "' data-g='" + escText(g) + "'>"
    + "<button class='tpghead' data-g='" + escText(g) + "'>"
    + "たんぽぽ" + escText(g) + "組<span>" + tpIn(g).length + "人</span></button>"
    + "<div class='tpgbody'>"
    + (tpIn(g).length
       ? tpIn(g).map((c, i) =>
           "<button class='tpin' data-g='" + escText(g) + "' data-i='" + i + "'"
           + " title='押すと、この1人を外す'>" + escText(c) + "<u>×</u></button>").join("")
       : "<i>ここへ引っぱって入れる</i>")
    + "</div></div>").join("");

  $("tpSel").innerHTML =
    "<div class='tpplace'><div class='tpfrom'>" + left + "</div>"
    + "<div class='tpto'>" + right
    + "<button class='btn tpaddg' id='tpAddG'>組を足す</button></div></div>";

  /* 入れる／外す。**押しても引っぱっても同じことが起きる。** */
  const redraw = () => { save(); Backend.saveRoster(); drawTanpopoView(); };
  for(const b of $("tpSel").querySelectorAll(".tpchip")){
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-tanpopo", b.dataset.c);
      ev.dataTransfer.effectAllowed = "copy";
      b.classList.add("drag");
    });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.onclick = () => { tpAdd(tpPick, b.dataset.c); redraw(); };
  }
  for(const h of $("tpSel").querySelectorAll(".tpghead"))
    h.onclick = () => { tpPick = h.dataset.g; drawTanpopoView(); };
  for(const x of $("tpSel").querySelectorAll(".tpin"))
    x.onclick = () => { tpDrop(x.dataset.g, tpIn(x.dataset.g)[+x.dataset.i]); redraw(); };
  for(const box of $("tpSel").querySelectorAll(".tpgrp")){
    box.addEventListener("dragover", ev => {
      if(ev.dataTransfer.types.indexOf("text/x-tanpopo") < 0) return;
      ev.preventDefault(); box.classList.add("over");
    });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", ev => {
      ev.preventDefault(); box.classList.remove("over");
      const c = ev.dataTransfer.getData("text/x-tanpopo");
      if(c){ tpPick = box.dataset.g; tpAdd(box.dataset.g, c); redraw(); }
    });
  }
  const add = $("tpAddG");
  if(add) add.onclick = () => { tpAddGroup(); save(); drawTanpopoView(); };

  /* **基本時間割から動いていないクラスを知らせる。**
     動いていない週をそのまま出すと、担任がまだ書いていない予定を本物のように配る。 */
  const chosen = tpChosen().filter(c => allClasses().indexOf(c) >= 0);
  const base  = chosen.filter(c => planState(c) === "base");
  const upper = chosen.filter(c => planState(c) === "upper");
  const gone  = tpChosen().filter(c => allClasses().indexOf(c) < 0);
  const boxes = [];
  if(base.length)
    boxes.push("<div class='box'><b>" + base.map(escText).join("・")
      + "</b> は今週まだ<b>基本時間割のまま</b>です。<br>"
      + "このまま出すと、担任がまだ書いていない予定をたんぽぽへ配ることになります。</div>");
  if(upper.length)
    boxes.push("<div class='box'><b>" + upper.map(escText).join("・")
      + "</b> は<b>上位（全校・学年）の予定しか入っていません</b>。担任は未着手です。</div>");
  if(gone.length)
    boxes.push("<div class='box'><b>" + gone.map(escText).join("・")
      + "</b> は<b>いまの学級編成にありません</b>。組から外してください。</div>");
  if(!chosen.length)
    boxes.push("<div class='box ok'>まだ誰も入れていません。"
      + "左のクラスを、右のたんぽぽの組へ引っぱってください。</div>");
  else if(!boxes.length)
    boxes.push("<div class='box ok'>入れている " + chosen.length
      + " クラスは、いずれも今週の予定が入っています。</div>");
  $("tpWarn").innerHTML = boxes.join("");

  $("tpGo").disabled = !tpTotal();
  $("tpCount").innerHTML = tpTotal()
    ? "出すのは <b>" + tpTotal() + " 人</b>（" + tpTotal() + " 列）・"
      + "<b>" + chosen.length + " クラス</b>"
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
    + "・出す児童：" + tpTotal() + "人（" + chosen.map(c => c + "×" + tpCount(c)).join("、") + "）\n"
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
    /* **人数のまま渡す。** たんぽぽ側の列の数と合っているかを、あちらで見る
       （どの組かは列の並びの話で、中身は交流級だけで決まる） */
    const nums = {};
    for(const c of chosen) nums[c] = tpCount(c);
    Backend.exportTanpopo(tanpopoTitles(chosen), nums, tpSlots(),
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

/* ── 出す先の形 ────────────────────────────────
   出せないときは、たいてい**出す先の形**が合っていない。
   何がどう違うのかを見せる。推し量って直すより、そのまま出したほうが早い。 */
function showShape(){
  $("tpShapeOut").innerHTML = "<div class='box ok'>見ています…</div>";
  Backend.shapeTanpopo(
    r => {
      const b = [];
      b.push("<div class='box " + (r.note.length ? "" : "ok") + "'>"
        + "<b>" + escText(r.file) + "／シート「" + escText(r.sheet) + "」</b>"
        + "<div class='tpshape'>"
        + r.rows + "行 × " + r.cols + "列\n"
        + "日付の行：" + (r.days.length ? r.days.map(x => x.date + "(" + x.row + "行目)").join("　") : "無し") + "\n"
        + "骨（中休み・給食・昼休み）：" + (r.marks.length ? r.marks.length + "つ" : "無し") + "\n"
        + "交流学級の見出し：" + (r.classCols || 0) + "列"
        + (r.head ? "\n" + r.headRow + "行目：" + r.head.slice(0, 14).join(" | ") : "")
        + "</div></div>");
      for(const n of r.note)
        b.push("<div class='box'><b>" + escText(n) + "</b></div>");
      if(r.sheets && r.sheets.length > 1)
        b.push("<div class='box'>このファイルのシート：<b>" + r.sheets.map(escText).join("・")
          + "</b>　ちがうシートを見ているなら、設定の「たんぽぽシート名」を直す</div>");
      $("tpShapeOut").innerHTML = b.join("");
    },
    why => { $("tpShapeOut").innerHTML =
      "<div class='box'><b>見られませんでした。</b><br>" + escText(why) + "</div>"; });
}

/* **形を作りなおす。** いまのシートは名前を変えて残す（消さない）。 */
function buildShape(){
  /* **組ごとの並びをそのまま渡す。** 出す先も 1組の全員 → 2組の全員 … と並ぶ */
  const cols = tpColumns().filter(x => allClasses().indexOf(x.cls) >= 0);
  if(!cols.length) return toast("先に、たんぽぽの組へ交流級を入れる");
  const n = cols.length;
  const byG = {};
  for(const x of cols) (byG[x.group] || (byG[x.group] = [])).push(x.cls);
  const yes = confirm(
    "たんぽぽ時間割のシートを、この形で作りなおします。\n\n"
    + "・左から たんぽぽ1組・2組… の順、組の中はクラス順\n"
    + Object.keys(byG).sort((a, b) => a - b)
        .map(g => "　" + g + "組：" + byG[g].join("、")).join("\n") + "\n"
    + "（合わせて " + n + " 列）\n"
    + "・偶数の組の列には地の色を敷き、組の境目に太い縦線を引きます\n"
    + "・1日16行 × 5日。各コマは 授業名 と 担当者・場所 の2行\n"
    + "・授業名の行は灰色。担当者・場所が「た」で始まると白に戻る書式も入れます\n\n"
    + "いまのシートは<消しません>。名前を変えて残します。\n\nつづけますか？");
  if(!yes) return;
  $("tpShapeOut").innerHTML = "<div class='box ok'>作っています…</div>";
  Backend.buildTanpopo(cols, tpSlots(),
    r => {
      $("tpShapeOut").innerHTML =
        "<div class='box ok'><b>作りなおした。</b>"
        + escText(r.file) + "／シート「" + escText(r.sheet) + "」<br>"
        + "児童 " + r.cols + " 列"
        + (r.staff ? "＋支援員 " + r.staff + " 列" : "")
        + "・" + r.rows + " 行"
        + (r.backup ? "<br>前の形は「" + escText(r.backup) + "」に残した" : "")
        + "<br>列の幅は、B4 1枚に収まるようたんぽぽ担当が調える</div>";
      toast("たんぽぽ時間割の形を作りなおした");
    },
    why => { $("tpShapeOut").innerHTML =
      "<div class='box'><b>作れませんでした。</b><br>" + escText(why) + "</div>"; });
}

/* 出したあとに、何がどうなったかを出す。**数と、飛ばした日を必ず見せる。**
   「出しました」だけだと、形が合わずに飛ばした日に気づけない。 */
function showTanpopoResult(r){
  const box = [];
  box.push("<div class='box ok'><b>たんぽぽ時間割に出した。</b>"
    + escText(r.file || "") + "／" + (r.days || 0) + "日ぶん・"
    + (r.wrote || 0) + "コマ</div>");
  if(r.short && r.short.length)
    box.push("<div class='box'><b>人数と、たんぽぽ時間割の列の数が合っていない。</b><br>"
      + r.short.slice(0, 8).map(escText).join("<br>")
      + (r.short.length > 8 ? "<br>ほか " + (r.short.length - 8) + "件" : "")
      + "<br>たんぽぽ時間割は<b>児童ごとに1列</b>。2人いる交流級は2列いる。"
      + "列を足すか、こちらの人数を直す</div>");
  if(r.redated)
    box.push("<div class='box ok'>この週の日付が入っていなかったので、"
      + "<b>日付を入れ直して</b>書いた（同じシートを毎週使い回せる）</div>");
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
