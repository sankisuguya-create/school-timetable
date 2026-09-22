/* たんぽぽ時間割に書き入れるところ。

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

/* たんぽぽの1コマに出す字。**紙に出ているものと同じ順で決める。**

   ① 校外行事に覆われていれば、その行事の「たんぽぽに出す字」（既定「校外」。
      右メニューで行事ごとに直せる）。**休みより勝つ** ── 休みで空にするのは
      「その日は授業が無い」を伝えるためで、行事があるなら「無い」は誤り。
      たんぽぽ担当はその日も支援員を組む必要がある（自然学校など）
   ② 休みの日は空
   ③ 授業なしのコマは「なし」。**空にしない** ── 空は「担任がまだ書いていない」
      と見分けがつかず、たんぽぽ担当が催促に回ることになる。
      「授業なし」の4文字は児童の列（50px）に入らないので2文字にする
   ④ 教科に「たんぽぽ表記」があればそれ（児童の列は 50px。「合同体育」は入らない）
   ⑤ 無ければ題名をそのまま */
const TP_TRIP = "校外";
const TP_NONE = "なし";
function tpTitle(cls, d, s){
  if(tripOn(cls, d, s)) return tripTpIn_(tripEntry(cls, d, s));
  if(isDayOff(d)) return "";
  const c = compose(cls, d, s);
  if(noLessonIn_(c)) return TP_NONE;
  const sub = c.subject ? SUB_BY_CODE[c.subject] : null;
  const short = sub && String(sub.tp || "").trim();
  return short || plain(c.title).trim();
}

/* ── 提出を覆すかどうか ──────────────────────
   **たんぽぽへ渡る文字が変わったときだけ覆す。**

   提出は「担任が今週ぶんを書き終えた」という印。渡るものが変わっていないのに
   覆すと、押し直すだけの作業が毎週増える。押し直しが増えるほど、印そのものが
   「とりあえず押すもの」になって、たんぽぽ担当が見分けられなくなる。

   たんぽぽへ渡るのは **月〜金 × 授業6コマの題名**だけ（tanpopoTitles）。だから

     土曜・朝休み・朝学習・業間・昼休み・放課後・週メモ  渡らない → 覆さない
     備考だけ直した／同じ教科名で上書きした              文字が同じ → 覆さない
     休みにした／休みを解いた                            空で出るので → **覆る**
     特別校時にした                                      朝学習が消えるだけ → 覆さない
     校外行事を付けた／外した                            「校外」に変わる → **覆る**

   **同じ規則がサーバにもある**（gas/Domain.gs の affectsTanpopo）。
   画面はすぐ塗るために持ち、サーバは読み直したときの正本として持つ。
   片方だけ直すと、画面が「済」でシートが「未」になり、どちらが本当か
   分からなくなる。**必ず両方を直す**（gas/domaincheck.js が同じ表で見る）。

   *層の重なりは見ない*：学年のコマを直しても、その上に担任のコマが載っていれば
   渡る文字は変わらない。そこまではみずに覆す側へ倒す。見るにはクラスごとに
   層を重ね直すことになり、サーバ側では同じ判定が書けない（画面とずれる）。 */
function tpAffected(d, slot, wasTitle, nowTitle){
  if(d >= WEEKDAYS) return false;                /* 土曜はたんぽぽへ出さない */
  const was = String(wasTitle == null ? "" : wasTitle).trim();
  const now = String(nowTitle == null ? "" : nowTitle).trim();
  const OFF = DAY_FORM.off.label;
  if(slot === DAY_SLOT) return (was === OFF) !== (now === OFF);
  /* 校外行事の付け外し。**渡る字が「校外」に変わる**ので覆る。
     覆っている下の時程が、たんぽぽへ出す6コマのときだけ */
  if(String(slot).indexOf(TRIP_SLOT) === 0)
    return tpSlots().indexOf(String(slot).slice(TRIP_SLOT.length)) >= 0 && was !== now;
  if(tpSlots().indexOf(slot) < 0) return false;  /* 出力に入らないコマ */
  return was !== now;
}

/* シート名。**「9月1週」。** その月の何番目の月曜かで数える。
   日付をそのまま名前にすると、たんぽぽ担当が「何週目のぶんか」を毎回数えることになる。
   **サーバ側（Store.weekSheetName）と同じ数え方**にしてある。 */
function tpSheetName(mon){
  const d = mon || monday;
  return (d.getMonth() + 1) + "月" + (Math.floor((d.getDate() - 1) / 7) + 1) + "週";
}

/* ── たんぽぽの面 ────────────────────────────
   **面ですることは2つ。組の並びを見ることと、出すこと。**

   組分け（どの交流級を、どの組へ、何人ぶん入れるか）はここに置かない。
   直すのは年度の初めと転入・転出のときだけなのに、毎週の面に置くと、
   出しに来た人が毎回その20クラスを越えないと組に手が届かない。
   「組分けを直す」の窓（設定からも開く）へ移してある。 */
let tpPick = "1";              /* 窓でいま選んでいる組。押して入れるときの行き先 */

/* 交流級の着手／未着手。**組の中のチップそのものに出す。**
   下に字でまとめて出していたころは、組の並びと読み合わせないと
   どのクラスのことか分からなかった。
   **色だけに頼らない。** 短い字と左端の太い線を必ず添える。 */
const TP_ST = {
  ok:   {mark:"済", why:"担任が「今週ぶんは書き終えた」と出している"},
  changed: {mark:"変", why:"この出力先へ出したあとに変わっている。出し直しが要る"},
  base: {mark:"未", why:"担任がまだ出していない"}
};
/* **1コマでも書いてあれば済、にはしない。**
   ちょっと触っただけの週と、出してよい週を、たんぽぽ担当が見分けられない。
   担任がクラスの画面で「たんぽぽに提出」を押したものだけを済にする。 */
/* **一度出したあとに変わったものを「未」に落とさない。**
   「未」は「担任がまだ書き終えていない。待てばよい」という意味で、
   たんぽぽ担当はそれを見て待つ。出したあとに変わったものは**待っても直らない**
   ── 出し直さないと、配った時間割が古いままになる。取るべき手が違うので、
   同じ印にしない。前は次の順で見ていて、④が「未」に落ちていた。

     ① まだ何もしていない      未
     ② 担任が提出した          済
     ③ たんぽぽへ出力した      済
     ④ そのあと担任が直した    未 ←ここが「①と同じ」に見えていた
     ⑤ 担任が再提出した        変
     ⑥ もう一度出力した        済

   ④と⑤は印で分けない（どちらも「出し直しが要る」）。分かれるのはそのあとの
   手順で、④は担任の再提出を待つ必要がある（出力はサーバが止める）。
   そこは出す前の窓が名指しで言う（tpNotYetBox）。 */
const tpState = cls => {
  const s = tpSubmitInfo(cls);
  if(!s) return 'base';                       /* 一度も提出していない */
  const target = tpTargetNow();
  const key = target ? (String(target.url).match(/[-\w]{25,}/) || [target.url])[0] : '';
  const done = (s.exports || {})[key];
  /* この出力先へ出したあとに変わった。直しの途中（dirty）でも、再提出後でも */
  if(done && (s.dirty || done !== s.at)) return 'changed';
  if(s.dirty) return 'base';                  /* 直しているが、まだ一度も出していない */
  return 'ok';
};

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
                  + "たんぽぽ時間割を開く</a>" : "")
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
    + (x.def ? "<tr><th>今の既定</th><td>これが既定の出す先です。"
             + "外すと、一番上のものが既定になります</td></tr>" : "");
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

/* 組の並び。**面と窓で同じものを出す**（片方だけ直した版が出ないように）。
   edit=false のときは読むだけ ── ×も、引っぱって入れる案内も出さない。 */
function tpGroupList(edit){
  const groups = tpGroups();
  if(groups.indexOf(tpPick) < 0) tpPick = groups[0];
  return groups.map(g =>
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
           return "<" + (edit ? "button" : "span") + " class='tpin st-" + st + "'"
             + " data-g='" + escText(g) + "' data-i='" + i + "'"
             + " title='" + escText(c + "：" + TP_ST[st].why)
             + (edit ? "。押すと、この1人を外す" : "") + "'>"
             + escText(c) + "<em>" + TP_ST[st].mark + "</em>"
             + (edit ? "<u>×</u>" : "")
             + "</" + (edit ? "button" : "span") + ">";
         }).join("")
       : "<i>" + (edit ? "ここへ引っぱって入れる" : "まだ入れていない") + "</i>")
    + "</div></div>").join("");
}

/* 交流級の並び（窓だけ）。**どの組に入れてあるかを字で添える**（色だけに頼らない） */
function tpFromList(){
  return grades().map(g =>
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
}

/* ── 組分けの窓 ──────────────────────────────
   **設定の「たんぽぽ組分け」と、面の「組分けを直す」から開く。**
   ここにロックは効かない（面のロックは、見るだけのつもりで開いた面を守るもので、
   自分から組分けを開いた人を止める理由が無い）。 */
function openTpGroupDlg(){
  $("tpGrpFy").textContent = fy() + "年度";
  drawTpGroupDlg();
  $("tpGrpDlg").showModal();
}

function drawTpGroupDlg(){
  const box = $("tpGrpBody");
  if(!box) return;
  box.innerHTML =
    "<div class='tpplace'><div class='tpto'>"
    + "<div class='tpleg'><b>今週の提出</b>"
    + ["ok","base","changed"].map(k =>
        "<span class='st-" + k + "'><i></i>" + TP_ST[k].mark + "</span>").join("")
    + "</div>"
    + tpGroupList(true)
    + "<button class='btn tpaddg' id='tpAddG'>組を足す</button></div>"
    + "<div class='tpfrom'>"
    + "<div class='tpfromh'><b>交流級から入れる</b><span>"
    + allClasses().length + " クラス</span></div>"
    + "<div class='tpfromb'>" + tpFromList() + "</div>"
    + "</div></div>";

  /* 入れる／外す。**押しても引っぱっても同じことが起きる。** */
  const redraw = () => {
    save(); Backend.saveRoster(); drawTpGroupDlg();
    if(view.kind === "tanpopo") drawTanpopoView();   /* 後ろの面も合わせる */
  };
  for(const b of box.querySelectorAll(".tpchip")){
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-tanpopo", b.dataset.c);
      ev.dataTransfer.effectAllowed = "copy";
      b.classList.add("drag");
    });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.onclick = () => { tpAdd(tpPick, b.dataset.c); redraw(); };
  }
  for(const h of box.querySelectorAll(".tpghead"))
    h.onclick = () => { tpPick = h.dataset.g; drawTpGroupDlg(); };
  for(const x of box.querySelectorAll(".tpin"))
    x.onclick = () => { tpDrop(x.dataset.g, tpIn(x.dataset.g)[+x.dataset.i]); redraw(); };
  for(const grp of box.querySelectorAll(".tpgrp")){
    grp.addEventListener("dragover", ev => {
      if(ev.dataTransfer.types.indexOf("text/x-tanpopo") < 0) return;
      ev.preventDefault(); grp.classList.add("over");
    });
    grp.addEventListener("dragleave", () => grp.classList.remove("over"));
    grp.addEventListener("drop", ev => {
      ev.preventDefault(); grp.classList.remove("over");
      const c = ev.dataTransfer.getData("text/x-tanpopo");
      if(c){ tpPick = grp.dataset.g; tpAdd(grp.dataset.g, c); redraw(); }
    });
  }
  const add = $("tpAddG");
  if(add) add.onclick = () => { tpAddGroup(); save(); drawTpGroupDlg(); };
  $("tpGrpCount").innerHTML = tpTotal()
    ? "今 <b>" + tpTotal() + " 人</b>（" + tpTotal() + " 列）・<b>"
      + tpChosenHere().length + " クラス</b>を入れている"
    : "まだ1人も入れていない";
}

/* ── 面 ──────────────────────────────────── */
function drawTanpopoView(){
  drawTargets();

  /* 組の並びだけを出す。**読むだけ。** 直すのは「組分けを直す」の窓 */
  $("tpSel").innerHTML =
    "<div class='tpleg'><b>今週の提出</b>"
    + ["ok","base","changed"].map(k =>
        "<span class='st-" + k + "'><i></i>" + TP_ST[k].mark + "</span>").join("")
    + "</div><div class='tponly'>" + tpGroupList(false) + "</div>";

  $("tpWarn").innerHTML = tpWarnBoxes().join("");
  /* 出す先が1つも無いあいだ、直している最中は出させない。
     **どこへ出るか分からないまま押させない。** */
  const tgt = tpTargetNow();
  const chosen = tpChosenHere();
  const noTarget = Backend.isGas() && !tgt;
  /* **ロックでは止めない。** ロックが守るのは出す先と組分けで、
     毎週の出力はロックしたまま押してよい（むしろ、触らずに出したい人の面）。
     複数の理由が重なったら、先に解消しないと先へ進めないものを出す。 */
  const why = tpTgtEdit ? "出す先の編集を終えてください"
            : !tpTotal() ? "先に組分けで交流級を入れてください"
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
  /* **「出す」ではなく「書き入れる」。** 左メニューの「週案を出す」（紙・画像・
     Sheet）と同じ語だと、どこへ何が出るのか読み手が毎回考えることになる。
     こちらは向こうのファイルに書き込む操作なので、語を分ける */
  $("tpGo").textContent = allIn ? "✓ たんぽぽ時間割に書き入れる"
                                : "たんぽぽ時間割に書き入れる";
  $("tpGo").title = why || (!chosen.length ? "先に「組分けを直す」から交流級を入れる"
    : allIn ? "入れている " + chosen.length + " クラスは、全部提出ずみ"
            : "まだ " + yet.length + " クラスが提出していない（" + yet.join("・") + "）");
  /* **出す週を、ボタンのとなりにもう一度出す。** 左メニューの週とは離れていて、
     組を並べているうちに「どの週を出すのか」が目から外れる */
  $("tpWeek").innerHTML = "<b>" + md(monday) + " → " + md(addDays(monday, 4)) + "</b>"
    + "<span>の週を書き入れる</span>"
    + (chosen.length ? (allIn ? "<i class='ok'>全部提出ずみ</i>"
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
      + "</b> は<b>今の学級編成にありません</b>。"
      + "「組分けを直す」から組の外へ出してください。</div>");
  if(!chosen.length)
    boxes.push("<div class='box ok'>まだ誰も入れていません。"
      + "右上の<b>「組分けを直す」</b>から、交流級を組へ入れてください。</div>");
  return boxes;
}

/* **出す前だけの知らせ。** たんぽぽの面には出さない（組のチップが言う）。
   出したものを見てたんぽぽ担当が支援員を組むので、まだ書き終えていない
   週を配ると、あとでやり直しになる。 */
function tpNotYetBox(){
  const here = tpChosenHere();
  /* **「まだ押していない」と「押したあとに直した」を分ける。**
     取るべき手が違う ── 前者は待てばよく、後者は担任に再提出を頼む。
     前は両方まとめて「まだ押していません」と出していたので、
     押した覚えのある担任のクラスがそこに並んで、話が止まっていた。 */
  const never = here.filter(c => !tpSubmitInfo(c));
  const dirty = here.filter(c => { const s = tpSubmitInfo(c); return !!s && !!s.dirty; });
  const box = [];
  if(never.length)
    box.push("<div class='box'><b>" + never.map(escText).join("・")
      + "</b> は、担任がまだ<b>「たんぽぽに提出」を押していません</b>。<br>"
      + "このまま出すと、書き終えていない週をたんぽぽへ配ることになります。</div>");
  /* **止まることを、押す前に言う。** 提出したあとに直したクラスが1つでもあると、
     サーバが出力そのものを止める（gas/Store.gs exportWeek_ ・ 変更ありなら通さない）。
     押してからエラーで知ると、何をすればよいのかが画面に無い。 */
  if(dirty.length)
    box.push("<div class='box'><b>" + dirty.map(escText).join("・")
      + "</b> は、<b>提出したあとに直しています</b>。<br>"
      + "このままでは<b>出力が止まります</b>。担任に「たんぽぽに再提出」を押してもらってください。</div>");
  return box.join("");
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
      for(const s of tpSlots()) one[s] = tpTitle(cls, d, s);
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
  if(!chosen.length) return toast("先に<b>「組分けを直す」</b>から交流級を入れる");
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
      "<div class='box'><b>今は書き込まない。</b>実物のたんぽぽ時間割に"
      + "つないでいない（手元で開いている）。<br>本番では「" + escText(name)
      + "」というシートが1枚できて、" + cols.length + " 列ぶんが入る。</div>"
      + $("tpWarn").innerHTML;
    return;
  }
  /* 先に、書いたぶんをシートへ送る。送る前に出すと、出した紙と週案が食い違う */
  $("tpGo").disabled = true;
  $("tpCount").innerHTML = "たんぽぽ時間割へ書いている…";
  const w = Wait.begin("たんぽぽ時間割へ出しています");
  Backend.flush(saved => {
    if(!saved){
      Wait.end(w); $("tpGo").disabled = false;
      $("tpCount").textContent = "保存・競合の解決を終えてから出力してください";
      return;
    }
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

/* 出したあとに、何がどうなったかを出す。**数と、退けた前のシートを必ずみせる。**
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
