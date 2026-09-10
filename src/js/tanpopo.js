/* たんぽぽ時間割へ出すところ。

   **1週ぶんを、1枚の新しいシートとして出す。** シート名は「9月1週」。

   前は「向こうのシートの形を読んで、合う行を探して書き込む」やり方だった。
   そのために「いまの形をみる」「この形で作りなおす」という操作が2つ要り、
   形が合わない日は黙って飛ばされた。**出す先の形を、こちらが毎週作れば、
   読み違える余地そのものが消える。** 操作も1つに減る。

   同じ名前のシートがあれば、**消さずに名前を変えて残す**。
   たんぽぽ担当が担当者・場所に書き足したものを、こちらが消さないため。

   塗り分け（灰＝このサイトから入れたコマ／白＝たんぽぽの中で受ける授業）は、
   **こちらが塗らない。** シート側の条件付き書式が、すぐ下の「担当者・場所」を
   見て決める。こちらが塗ると、たんぽぽ担当が直したあとに色と中身が食い違う。 */

/* たんぽぽ時間割は1日6校時ぶんの行を持っている。
   **どの校時かは時程シートが決める**ので、授業の行の上から6つを使う
   （時程のIDを学校が変えていても合う）。 */
const tpSlots = () => SLOTS.filter(s => s.kind === "lesson").slice(0, 6).map(s => s.id);

/* シート名。**「9月1週」。** その月の何番目の月曜かで数える。
   日付をそのまま名前にすると、たんぽぽ担当が「何週目のぶんか」を毎回数えることになる。
   **サーバ側（Store.weekSheetName）と同じ数え方**にしてある。 */
function tpSheetName(mon){
  const d = mon || monday;
  return (d.getMonth() + 1) + "月" + (Math.floor((d.getDate() - 1) / 7) + 1) + "週";
}

/* ── たんぽぽの面 ────────────────────────────
   **たんぽぽの組へ、交流級を引っぱって入れる。**
   1回入れると児童1人＝出す先の1列。同じ組へ2回入れれば2人。
   引っぱれない端末のために、押しても入るようにしてある
   （右のクラスを押すと、いま選んでいる組へ入る）。 */
let tpPick = "1";              /* いま選んでいる組。押して入れるときの行き先 */

function drawTanpopoView(){
  const groups = tpGroups();
  if(groups.indexOf(tpPick) < 0) tpPick = groups[0];

  /* 左：たんぽぽの組。**出す列の並びがそのまま見えている。** */
  const left = groups.map(g =>
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

  /* 右：交流級。**どの組に入れてあるかを字で添える**（色だけに頼らない） */
  const right = grades().map(g =>
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

  $("tpSel").innerHTML =
    "<div class='tpplace'><div class='tpto'>" + left
    + "<button class='btn tpaddg' id='tpAddG'>組を足す</button></div>"
    + "<div class='tpfrom'>" + right + "</div></div>";

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

  $("tpWarn").innerHTML = tpWarnBoxes().join("");
  $("tpGo").disabled = !tpTotal();
  $("tpCount").innerHTML = tpTotal()
    ? "出すのは <b>" + tpTotal() + " 人</b>（" + tpTotal() + " 列）・"
      + "<b>" + tpChosenHere().length + " クラス</b>　シート名 <b>"
      + escText(tpSheetName()) + "</b>"
    : "";
}

const tpChosenHere = () => tpChosen().filter(c => allClasses().indexOf(c) >= 0);

/* **基本時間割から動いていないクラスを知らせる。**
   動いていない週をそのまま出すと、担任がまだ書いていない予定を本物のように配る。
   たんぽぽ担当はそれを見て支援員の配置を決めるので、あとから変わるとやり直しになる。
   止めはしない（金曜までに全担任が書き終わらない週はある）。 */
function tpWarnBoxes(){
  const chosen = tpChosenHere();
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
      + "右のクラスを、左のたんぽぽの組へ引っぱってください。</div>");
  else if(!boxes.length)
    boxes.push("<div class='box ok'>入れている " + chosen.length
      + " クラスは、いずれも今週の予定が入っています。</div>");
  return boxes;
}

/* 出す中身を組む。**層を重ねたあとの、紙に出ているとおりの授業名。**
   {クラス: {"0":{p1:"国語", …}, …}}（0〜4 は月〜金。たんぽぽ時間割は土曜を持たない） */
function tanpopoTitles(list){
  const out = {};
  for(const cls of list){
    const per = {};
    for(let d = 0; d < WEEKDAYS; d++){
      const one = {};
      /* **休みの日は空で出す。** 紙に斜め線を引いた日の授業をたんぽぽへ配ると、
         たんぽぽ担当がその日の支援員を組んでしまう */
      for(const s of tpSlots())
        one[s] = isDayOff(d) ? "" : plain(compose(cls, d, s).title).trim();
      per[String(d)] = one;
    }
    out[cls] = per;
  }
  return out;
}

/* ── 出す ──────────────────────────────────────
   **確認は専用の窓で、既定は「出さない」。**
   ブラウザの confirm は Enter で「はい」に落ちる。この面でいちばん大きく動く
   操作を、いちばん弱い止め方にしない（1コマの上書きと同じ作りにそろえる）。 */
function reflectTanpopo(){
  const chosen = tpChosenHere();
  if(!chosen.length) return toast("先に交流級を選ぶ");
  const name = tpSheetName();
  $("tpDlgName").textContent = name;
  $("tpDlgTbl").innerHTML =
      "<tr><th>週</th><td>" + md(monday) + " → " + md(addDays(monday, 4)) + "</td></tr>"
    + "<tr><th>シート名</th><td><b>" + escText(name) + "</b></td></tr>"
    + "<tr><th>出す児童</th><td>" + tpTotal() + " 人（" + tpTotal() + " 列）</td></tr>"
    + "<tr><th>交流級</th><td>"
      + chosen.map(c => escText(c) + "×" + tpCount(c)).join("、") + "</td></tr>";
  $("tpDlgWarn").innerHTML = tpWarnBoxes().filter(b => b.indexOf("box ok") < 0).join("");
  $("tpDlg").showModal();
  $("tpNo").focus();                    /* **既定は「出さない」。** */
}

function doExportTanpopo(){
  if(!Wait.guard()) return;             /* 2回押しで、同じ週を2回出させない */
  const chosen = tpChosenHere();
  if(!chosen.length) return;
  const cols = tpColumns().filter(x => allClasses().indexOf(x.cls) >= 0);
  const name = tpSheetName();
  if(!Backend.isGas()){
    $("tpWarn").innerHTML =
      "<div class='box'><b>いまは書き込まない。</b>実物のたんぽぽ時間割に"
      + "つないでいない（手元で開いている）。<br>本番では「" + escText(name)
      + "」というシートが1枚できて、" + cols.length + " 列ぶんが入る。</div>"
      + $("tpWarn").innerHTML;
    return;
  }
  /* 先に、書いたぶんをシートへ送る。送る前に出すと、出した紙と週案が食い違う */
  $("tpGo").disabled = true;
  $("tpCount").innerHTML = "たんぽぽ時間割へ書いている…";
  const w = Wait.begin("たんぽぽ時間割へ出しています");
  Backend.flush(() => {
    Backend.exportWeek(tanpopoTitles(chosen), cols, tpSlots(), name,
      r => {
        Wait.end(w);
        $("tpGo").disabled = false;
        drawTanpopoView();
        showTanpopoResult(r);
      },
      why => {
        Wait.end(w);
        $("tpGo").disabled = false;
        drawTanpopoView();
        $("tpWarn").innerHTML =
          "<div class='box'><b>たんぽぽ時間割へ出せませんでした。</b><br>"
          + escText(why) + "</div>" + $("tpWarn").innerHTML;
      });
  });
}

/* 出したあとに、何がどうなったかを出す。**数と、退けた前のシートを必ず見せる。**
   「出しました」だけだと、前のシートがどこへ行ったのか分からない。 */
function showTanpopoResult(r){
  const box = [];
  box.push("<div class='box ok'><b>たんぽぽ時間割に出した。</b>"
    + escText(r.file || "") + "／シート「" + escText(r.sheet || "") + "」<br>"
    + "児童 " + (r.cols || 0) + " 列"
    + (r.staff ? "＋支援員 " + r.staff + " 列" : "")
    + "・" + (r.days || 0) + "日ぶん・授業名 " + (r.wrote || 0) + " コマ"
    + (r.empty ? "（空のコマ " + r.empty + "）" : "")
    + (r.backup ? "<br>同じ名前のシートがあったので、前のぶんは「"
                + escText(r.backup) + "」に名前を変えて残した" : "")
    + "<br>シートは<b>週の順</b>（4月→翌3月）に並ぶ。"
    + "児童の列の幅は <b>" + (r.colW || 50) + "px</b>"
    + "（設定シートの「たんぽぽ列幅」で変えられる）</div>");
  $("tpWarn").innerHTML = box.join("") + $("tpWarn").innerHTML;
  toast("たんぽぽ時間割に <b>" + (r.wrote || 0) + " コマ</b>入れた");
}
