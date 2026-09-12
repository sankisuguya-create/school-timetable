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
/* 右の交流級を開いているか。**ふだんは畳む**（入れ替えは年度の初めだけ） */
let tpFromOpen = false;

/* 交流級の着手／未着手。**組の中のチップそのものに出す。**
   下に字でまとめて出していたころは、組の並びと読み合わせないと
   どのクラスのことか分からなかった。
   **色だけに頼らない。** 短い字と左端の太い線を必ず添える。 */
const TP_ST = {
  ok:   {mark:"済", why:"担任が「今週ぶんは書き終えた」と出している"},
  base: {mark:"未", why:"担任がまだ出していない"}
};
/* **1コマでも書いてあれば済、にはしない。**
   ちょっと触っただけの週と、出してよい週を、たんぽぽ担当が見分けられない。
   担任がクラスの画面で「たんぽぽに提出」を押したものだけを済にする。 */
const tpState = cls => tpSubmitted(cls) ? "ok" : "base";

/* ── 出す先 ──────────────────────────────────
   **1本とはかぎらない。** たんぽぽ時間割が学年で分かれている学校も、
   年度でファイルを作り直す学校もある。「たんぽぽ出力先」シートが正本で、
   1本も無いあいだは今までどおり「設定」の たんぽぽファイルID を見る。

   足す・消す・直すを別々の口にしない。**画面が持っている並びを、
   そのままシートへ書く。** 別々にすると、消したのに残っているつもりの
   行が出て、どちらに出たか分からなくなる。 */
let tpTargets = null;          /* 読めていないあいだは null（読み込み中と出す） */
let tpTgtEdit = false;         /* 直しているあいだは、出すボタンを止める */

function loadTargets(after){
  Backend.tpTargets(list => { tpTargets = list; if(after) after(); drawTanpopoView(); },
                    why => { tpTargets = []; toast(why); drawTanpopoView(); });
}
const tpTargetNow = () => (tpTargets || []).filter(x => x.def)[0] || (tpTargets || [])[0] || null;

function drawTargets(){
  const box = $("tpTgt");
  if(!box) return;
  if(!Backend.isGas()){
    box.innerHTML = "<div class='tptline'><b>出す先</b>"
      + "<span class='hint'>手元では出す先を持てない（シートにつないでいない）</span></div>";
    return;
  }
  if(tpTargets === null){
    box.innerHTML = "<div class='tptline'><b>出す先</b><span class='hint'>読んでいます…</span></div>";
    return;
  }
  if(!tpTgtEdit){
    const now = tpTargetNow();
    box.innerHTML = "<div class='tptline'><b>出す先</b>"
      + (tpTargets.length
         ? "<select id='tpTgtSel' aria-label='出す先のファイル'>"
           + tpTargets.map((x, i) => "<option value='" + i + "'"
               + (x === now ? " selected" : "") + ">" + escText(x.name) + "</option>").join("")
           + "</select>"
           /* **出す先を、その場で開ける。** 出したあと「入ったか」を見るのに、
              毎回ドライブから探し直すことになっていた */
           + (now ? "<a class='tptopen' href='" + escText(now.url) + "'"
                  + " target='_blank' rel='noopener noreferrer'>"
                  + "たんぽぽ時間割をひらく</a>" : "")
         : "<span class='hint bad'>1つもありません。足さないと出せません</span>")
      + "<button class='btn' id='tpTgtEdit'>出す先を直す</button></div>";
    const sel = $("tpTgtSel");
    if(sel) sel.onchange = () => {
      const i = +sel.value;
      for(let k = 0; k < tpTargets.length; k++) tpTargets[k].def = (k === i);
      putTargets(() => toast("出す先を「" + tpTargets[i].name + "」にした"));
    };
    $("tpTgtEdit").onclick = () => {
      if(typeof isLocked === "function" && isLocked())
        return toast("この面はロックしてある。<b>直すには、上のロックを押す</b>");
      tpTgtEdit = true; drawTanpopoView();
    };
    return;
  }
  /* 直しているあいだ。**行ごとに、名前・URL・試す・消すを並べる。** */
  box.innerHTML = "<div class='tptedit'><b>出す先を直す</b>"
    + "<p class='hint'>たんぽぽ時間割のスプレッドシートのURLを、そのまま貼ってよい。"
    + "<b>◎を押したものが、既定の出す先</b>になる。</p>"
    + "<table class='tpttbl'><tr><th>既定</th><th>名前</th><th>URL</th><th></th><th></th></tr>"
    + tpTargets.map((x, i) =>
        "<tr><td><button class='tptdef" + (x.def ? " on" : "") + "' data-i='" + i + "'"
        + " aria-pressed='" + !!x.def + "' title='既定の出す先にする'>◎</button></td>"
        + "<td><input type='text' class='tptname' data-i='" + i + "' value='"
        + escText(x.name) + "' size='14'></td>"
        + "<td><input type='text' class='tpturl' data-i='" + i + "' value='"
        + escText(x.url) + "'></td>"
        + "<td><button class='btn tpttest' data-i='" + i + "'>開けるか試す</button></td>"
        + "<td><button class='btn danger tptdel' data-i='" + i + "'>消す</button></td></tr>"
      ).join("")
    + "</table>"
    + "<div id='tpTgtWhy' class='tpwarn'></div>"
    + "<div class='tptact'><button class='btn' id='tpTgtAdd'>出す先を足す</button>"
    + "<button class='btn go' id='tpTgtSave'>直したものを入れる</button>"
    + "<button class='btn' id='tpTgtCancel'>やめる</button></div></div>";

  const read = () => {
    for(const e of box.querySelectorAll(".tptname")) tpTargets[+e.dataset.i].name = e.value;
    for(const e of box.querySelectorAll(".tpturl"))  tpTargets[+e.dataset.i].url  = e.value;
  };
  for(const b of box.querySelectorAll(".tptdef"))
    b.onclick = () => { read(); tpTargets.forEach((x, k) => x.def = (k === +b.dataset.i));
                        drawTanpopoView(); };
  for(const b of box.querySelectorAll(".tptdel"))
    b.onclick = () => {
      read();
      /* **消すのはこの一覧の行だけ。** 向こうのシートには手を出さない。
         たんぽぽ担当が書いた担当者・場所を、こちらから消せる口を作らない。
         確認は専用の窓で、既定は「外さない」（confirm は Enter で「はい」に落ちる） */
      askTpDel(+b.dataset.i);
    };
  for(const b of box.querySelectorAll(".tpttest"))
    b.onclick = () => {
      read();
      const x = tpTargets[+b.dataset.i];
      $("tpTgtWhy").innerHTML = "<div class='box'>試しています…</div>";
      Backend.testTpTarget(x.url,
        r => $("tpTgtWhy").innerHTML = r.ok
          ? "<div class='box ok'><b>開けました。</b>" + escText(r.file)
            + "（シート " + r.sheets + " 枚）</div>"
          : "<div class='box'><b>" + escText(x.name) + "：</b>" + escText(r.why) + "</div>",
        why => $("tpTgtWhy").innerHTML = "<div class='box'>" + escText(why) + "</div>");
    };
  $("tpTgtAdd").onclick = () => {
    read();
    tpTargets.push({name:"たんぽぽ時間割", url:"", def:!tpTargets.length});
    drawTanpopoView();
  };
  $("tpTgtCancel").onclick = () => { tpTgtEdit = false; loadTargets(); };
  $("tpTgtSave").onclick = () => {
    read();
    const empty = tpTargets.filter(x => !String(x.url).trim());
    if(empty.length) return void ($("tpTgtWhy").innerHTML =
      "<div class='box'><b>URLが空の行があります。</b>入れるか、その行を消してください。</div>");
    const w = Wait.begin("出す先を入れています");
    Backend.saveTpTargets(tpTargets, () => {
      Wait.end(w); tpTgtEdit = false; loadTargets();
      toast("出す先を入れた");
    }, why => {
      Wait.end(w);
      $("tpTgtWhy").innerHTML = "<div class='box'>" + escText(why) + "</div>";
    });
  };
}
/* 出す先を一覧から外す確認。**既定は「外さない」。**
   ブラウザの confirm は Enter で「はい」に落ちる。 */
let tpDelAt = -1;
function askTpDel(i){
  const x = tpTargets[i];
  if(!x) return;
  tpDelAt = i;
  $("tpDelTbl").innerHTML =
      "<tr><th>名前</th><td><b>" + escText(x.name) + "</b></td></tr>"
    + "<tr><th>URL</th><td>" + escText(String(x.url).slice(0, 70)) + "</td></tr>"
    + (x.def ? "<tr><th>いまの既定</th><td>これが既定の出す先です。"
             + "外すと、いちばん上のものが既定になります</td></tr>" : "");
  $("tpDelDlg").showModal();
  $("tpDelNo").focus();               /* **既定は「外さない」。** */
}
function tpDelAnswer(yes){
  const i = tpDelAt;
  tpDelAt = -1;
  $("tpDelDlg").close();
  if(!yes || i < 0 || !tpTargets[i]) return;
  tpTargets.splice(i, 1);
  if(tpTargets.length && !tpTargets.some(y => y.def)) tpTargets[0].def = true;
  drawTanpopoView();
}

function putTargets(after){
  const w = Wait.begin("出す先を入れています");
  Backend.saveTpTargets(tpTargets, () => { Wait.end(w); if(after) after(); drawTanpopoView(); },
                        why => { Wait.end(w); toast(why); loadTargets(); });
}

function drawTanpopoView(){
  drawTargets();
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
       ? tpIn(g).map((c, i) => {
           /* **どのクラスが今週まだ書いていないかを、その場で見せる。**
              下に字でまとめて出していたころは、組の並びと読み合わせる必要があった */
           const st = tpState(c);
           return "<button class='tpin st-" + st + "' data-g='" + escText(g) + "'"
             + " data-i='" + i + "' title='" + escText(c + "：" + TP_ST[st].why)
             + "。押すと、この1人を外す'>"
             + escText(c) + "<em>" + TP_ST[st].mark + "</em><u>×</u></button>";
         }).join("")
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

  /* **右の交流級は畳んでおく。** 入れ替えるのは年度の初めだけで、
     ふだん見たいのは左の組の並び（出す列そのもの）。
     開いたままにすると、毎週その20個を越えないと組に手が届かない。 */
  const open = !!tpFromOpen;
  $("tpSel").innerHTML =
    "<div class='tpplace" + (open ? "" : " shut") + "'><div class='tpto'>"
    + "<div class='tpleg'><b>今週の提出</b>"
    + ["ok","base"].map(k =>
        "<span class='st-" + k + "'><i></i>" + TP_ST[k].mark + "</span>").join("")
    + "</div>"
    + left
    + "<button class='btn tpaddg' id='tpAddG'>組を足す</button></div>"
    + "<div class='tpfrom'>"
    + "<button class='tpfromq' id='tpFromQ' aria-expanded='" + open + "'>"
    + (open ? "▾" : "▸") + " 交流級から入れる"
    + "<span>" + allClasses().length + " クラス</span></button>"
    + "<div class='tpfromb'" + (open ? "" : " hidden") + ">" + right + "</div>"
    + "</div></div>";

  const q = $("tpFromQ");
  if(q) q.onclick = () => { tpFromOpen = !tpFromOpen; drawTanpopoView(); };

  /* 入れる／外す。**押しても引っぱっても同じことが起きる。**
     ロック中は入れない（見るだけのつもりで開いた面で、出す列がずれる） */
  const redraw = () => { save(); Backend.saveRoster(); drawTanpopoView(); };
  const locked = () => {
    if(typeof isLocked === "function" && isLocked()){
      toast("この面はロックしてある。<b>直すには、上のロックを押す</b>");
      return true;
    }
    return false;
  };
  for(const b of $("tpSel").querySelectorAll(".tpchip")){
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-tanpopo", b.dataset.c);
      ev.dataTransfer.effectAllowed = "copy";
      b.classList.add("drag");
    });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.onclick = () => { if(locked()) return; tpAdd(tpPick, b.dataset.c); redraw(); };
  }
  for(const h of $("tpSel").querySelectorAll(".tpghead"))
    h.onclick = () => { tpPick = h.dataset.g; drawTanpopoView(); };
  for(const x of $("tpSel").querySelectorAll(".tpin"))
    x.onclick = () => { if(locked()) return;
                        tpDrop(x.dataset.g, tpIn(x.dataset.g)[+x.dataset.i]); redraw(); };
  for(const box of $("tpSel").querySelectorAll(".tpgrp")){
    box.addEventListener("dragover", ev => {
      if(ev.dataTransfer.types.indexOf("text/x-tanpopo") < 0) return;
      ev.preventDefault(); box.classList.add("over");
    });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", ev => {
      ev.preventDefault(); box.classList.remove("over");
      const c = ev.dataTransfer.getData("text/x-tanpopo");
      if(c){ if(locked()) return; tpPick = box.dataset.g; tpAdd(box.dataset.g, c); redraw(); }
    });
  }
  const add = $("tpAddG");
  if(add) add.onclick = () => { if(locked()) return; tpAddGroup(); save(); drawTanpopoView(); };

  $("tpWarn").innerHTML = tpWarnBoxes().join("");
  /* 出す先が1つも無いあいだ、直している最中は出させない。
     **どこへ出るか分からないまま押させない。** */
  const tgt = tpTargetNow();
  const chosen = tpChosenHere();
  const lockedNow = typeof isLocked === "function" && isLocked();
  const noTarget = Backend.isGas() && !tgt;
  /* 複数の理由が重なったら、先に解消しなければ何も直せないものを出す。
     空のままロックした画面で「組へ入れて」と案内しても、その操作自体ができない。 */
  const why = lockedNow ? "ロックを外してください"
            : tpTgtEdit ? "出す先の編集を終えてください"
            : !tpTotal() ? "先に交流級を組へ入れてください"
            : noTarget ? "出す先を設定してください" : "";
  $("tpGo").disabled = !!why;
  $("tpGoWhy").hidden = !why;
  $("tpGoWhy").textContent = why;
  /* **全クラスが出していれば、出すボタンを緑にする。**
     ただし色だけに頼らない ── 緑と青は3型で ΔE 7.3（閾値18）と潰れるので、
     ✓ と字を必ず添える（色を外しても、出してよい週かが分かる）。 */
  const yet = chosen.filter(c => !tpSubmitted(c));
  /* 緑は「提出済み」に加えて、いま実際に押せるときだけ。 */
  const allIn = chosen.length > 0 && !yet.length;
  const ready = allIn && !why;
  $("tpGo").classList.toggle("ready", ready);
  $("tpGo").textContent = allIn ? "✓ たんぽぽ時間割へ出す" : "たんぽぽ時間割へ出す";
  $("tpGo").title = why || (!chosen.length ? "先に交流級を組へ入れる"
    : allIn ? "入れている " + chosen.length + " クラスは、ぜんぶ提出ずみ"
            : "まだ " + yet.length + " クラスが提出していない（" + yet.join("・") + "）");
  /* **出す週を、ボタンのとなりにもう一度出す。** 左メニューの週とは離れていて、
     組を並べているうちに「どの週を出すのか」が目から外れる */
  $("tpWeek").innerHTML = "<b>" + md(monday) + " → " + md(addDays(monday, 4)) + "</b>"
    + "<span>の週を出す</span>"
    + (chosen.length ? (allIn ? "<i class='ok'>ぜんぶ提出ずみ</i>"
                              : "<i class='yet'>未提出 " + yet.length + " クラス</i>") : "");
  $("tpCount").innerHTML = tpTotal()
    ? "出すのは <b>" + tpTotal() + " 人</b>（" + tpTotal() + " 列）・"
      + "<b>" + chosen.length + " クラス</b>　シート名 <b>"
      + escText(tpSheetName()) + "</b>"
      + (tgt ? "　出す先 <b>" + escText(tgt.name) + "</b>" : "")
    : "";
}

const tpChosenHere = () => tpChosen().filter(c => allClasses().indexOf(c) >= 0);

/* **基本時間割から動いていないクラスを知らせる。**
   動いていない週をそのまま出すと、担任がまだ書いていない予定を本物のように配る。
   たんぽぽ担当はそれを見て支援員の配置を決めるので、あとから変わるとやり直しになる。
   止めはしない（金曜までに全担任が書き終わらない週はある）。 */
function tpWarnBoxes(){
  const chosen = tpChosenHere();
  if(Backend.isGas() && tpTargets !== null && !tpTargets.length)
    return ["<div class='box'><b>出す先が1つもありません。</b>"
          + "「出す先を直す」から、たんぽぽ時間割のURLを1つ入れてください。</div>"];
  const gone  = tpChosen().filter(c => allClasses().indexOf(c) < 0);
  const boxes = [];
  /* **着手／未着手は、ここに字で書かない。** 組の中のチップそのものに出す
     （下にまとめて書くと、組の並びと読み合わせないと、どのクラスのことか
     分からない）。ここに残すのは、組から外さないと直らないものだけ。 */
  if(gone.length)
    boxes.push("<div class='box'><b>" + gone.map(escText).join("・")
      + "</b> は<b>いまの学級編成にありません</b>。組から外してください。</div>");
  if(!chosen.length)
    boxes.push("<div class='box ok'>まだ誰も入れていません。"
      + "右のクラスを、左のたんぽぽの組へ引っぱってください。</div>");
  return boxes;
}

/* **出す前だけの知らせ。** たんぽぽの面には出さない（組のチップが言う）。
   出したものを見てたんぽぽ担当が支援員を組むので、まだ書き終えていない
   週を配ると、あとでやり直しになる。 */
function tpNotYetBox(){
  const yet = tpChosenHere().filter(c => !tpSubmitted(c));
  if(!yet.length) return "";
  return "<div class='box'><b>" + yet.map(escText).join("・")
       + "</b> は、担任がまだ<b>「たんぽぽに提出」を押していません</b>。<br>"
       + "このまま出すと、書き終えていない週をたんぽぽへ配ることになります。</div>";
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
    + "<tr><th>出す先</th><td><b>"
      + escText((tpTargetNow() || {}).name || "（未設定）") + "</b></td></tr>"
    + "<tr><th>シート名</th><td><b>" + escText(name) + "</b></td></tr>"
    + "<tr><th>出す児童</th><td>" + tpTotal() + " 人（" + tpTotal() + " 列）</td></tr>"
    + "<tr><th>交流級</th><td>"
      + chosen.map(c => escText(c) + "×" + tpCount(c)).join("、") + "</td></tr>";
  /* **出す前だけは、まだ出していないクラスを名指しする。**
     たんぽぽの面そのものには字で書かない（組のチップが言う）が、
     出すのは週に1回の大きな操作で、出したものを見てたんぽぽ担当が
     支援員を組む。まだ書き終えていない週を配ると、あとでやり直しになる。
     止めはしない（金曜までに全担任が書き終わらない週はある）。 */
  $("tpDlgWarn").innerHTML =
    tpWarnBoxes().filter(b => b.indexOf("box ok") < 0).join("") + tpNotYetBox();
  $("tpDlg").showModal();
  $("tpNo").focus();                    /* **既定は「出さない」。** */
}

function doExportTanpopo(){
  if(!Wait.guard()) return;             /* 2回押しで、同じ週を2回出させない */
  const chosen = tpChosenHere();
  if(!chosen.length) return;
  const cols = tpColumns().filter(x => allClasses().indexOf(x.cls) >= 0);
  const name = tpSheetName();
  const tgt = tpTargetNow();
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
      tgt ? tgt.url : "",
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
