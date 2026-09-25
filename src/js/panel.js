/* 右の入力パネル。パレット・中身・リンク・入れる先。 */

const cellAt = (d, s) =>
  document.querySelector("#sheet .cell[data-d='" + d + "'][data-s='" + s + "']");

/* ── パレット ────────────────────────────────
   コマへ引っぱって落とすと入る。選んでから押しても入る。
   打って変換して確定する3手が、つかんで落とす1手になる。 */
/* 学年・全学年からコマを取り消すためのしるし。教科と同じように引っぱって落とせる */
const PAL_CLEAR = "__clear";

/* 校外行事。**教科ではないので SUBJECTS には入れない。**
   「リセット」と同じ別枠のチップで、押すとそのコマの被覆を付け外しする。 */
const PAL_TRIP = "__trip";

/* 授業なし（コマ1つ）。**教科ではないので SUBJECTS には入れない。**
   押すと、そのコマの題名を「授業なし」にして斜め線を引く。もう一度押すと外す。
   休みの日（1日ぶん）は右メニューの「この週の日の形」。ここは1コマぶん。 */
const PAL_NONE = "__none";

/* そのチップをこの面に出すか。**教科の「出す面」が空ならどの面にも出す。**
   「学年」と書いてあるものは、学年と全学年の面にだけ出す ── 合同体育・
   合同音楽・学年集会は複数学級でやるものなので、担任の面に出すと、
   名前と実態がずれたまま自分の学級だけに入る。 */
function chipHere_(sub){
  const only = String((sub || {}).only || "").trim();
  if(!only) return true;
  return only === "学年" ? (view.kind === "grade" || view.kind === "school") : true;
}

/* **持っている教科チップ。** 教科チップを押すと持ち上がる（=選択）。
   持っているあいだ：
     ・紙の中でその教科のコマだけが目立つ（ほかは薄く）
     ・単元チップはその教科のものだけに絞られる
     ・コマを押すとその教科が入る（つづけて入れられる）
   コマを選んでいないときにもう一度チップを押すか、Esc・別の面へ行くと手放す。
   コマを選んでいるときは、何度押してもそのコマに入る。 */
let pickSub = "";

/* 持っている教科をチップに出す */
function paintPickState_(){
  for(const b of document.querySelectorAll("#pals .pal"))
    b.setAttribute("aria-pressed", String(!!pickSub && b.dataset.v === pickSub));
}

/* 持ち替え・手放しのあとの塗り直し一式 */
function pickRepaint_(){
  paintPickState_();
  if(typeof drawPalette === "function") drawPalette();  /* 単元チップの絞り込みが変わる */
  paintSheet();
}
function pickRelease_(){
  if(!pickSub) return;
  pickSub = "";
  pickRepaint_();
}

/* チップ1つぶんの HTML。**どの面でも同じ作り**（引っぱれる・押せる） */
function palHtml(o){
  return "<button class='pal" + (o.off ? " off" : "") + (o.clear ? " clear" : "")
    + (o.trip ? " trip" : "") + (o.none ? " none" : "")
    + (o.unit ? " unit" : "") + (o.ureset ? " ureset" : "") + "' draggable='true'"
    + (o.g ? " data-g='" + escText(o.g) + "'" : "")
    + " data-v='" + escText(o.v) + "'>" + escText(o.t) + "</button>";
}

/* 単元のチップ。**「単元管理」の畳み口（#unitPals）に並べる。**
   作る・直す・消すは「単元進捗管理」の窓 ── ここには落とすもの（チップ）と
   起点が付いているときの「単元リセット」だけ出す。
   学級・専科の面にだけ出る（単元は「クラス×教科」の持ちもの） */
function upalsHtml_(){
  if(typeof upPaletteUnits_ !== "function") return "";
  if(view.kind !== "class" && view.kind !== "special") return "";
  const chips = upPaletteUnits_();
  if(!chips.length) return "";
  /* 専科の面のチップは学年に1つだけ（各クラスぶんの代表）。
     リセットを出すかは、束ねた中身まで見ないと分からない */
  const anyStarted = (view.kind === "special"
      ? (typeof upViewUnits_ === "function" ? upViewUnits_() : chips.map(x => x.unit))
      : chips.map(x => x.unit))
    .some(u => (u.start || {}).date);
  return chips.map(u => palHtml({v:u.v, t:u.t, unit:true})).join("")
    + (anyStarted ? palHtml({v:PAL_URESET, t:"単元リセット", ureset:true}) : "");
}

function drawPalette(){
  const sp = view.kind === "special";

  /* **専科の面は、クラスを学年ごとに束ねて並べる。**
     20クラスを1列に流すと「4-2 はどこか」を毎回端から探すことになる。
     2列×3段（左上1年・右上2年・左下3年…）に固めると、
     **学年の位置がいつも同じ**なので、目的の組まで一手で届く。
     区切りの線は引かない ── 束が6つ見えていれば、線は何も足さない。 */
  if(sp){
    const groups = gradesAll().map(g => ({
      g, list: classesOfSpecial(view.sp).filter(c => gradeOf(c) === g)
    })).filter(x => x.list.length);
    /* **リセットは専科にも出す。** 専科が入れたコマも全クラスの紙に降りるので、
       入れるのと同じ手数で取り消せないと、1コマずつ空にして回ることになる */
    /* **束に見出しは付けない。** チップの字（3-2）の頭がその学年で、
       束の位置も学年の順に固定してある。「3年」と書き足しても何も増えない */
    /* 出すのは**担当学年のクラスだけ**（classesOfSpecial が絞っている）。
       担当学年が決まっていない枠は、全クラスが出る ── 書いていない学校を
       「どの学年も受け持たない専科」にしないための逃げ道。
       **黙って全部出さない。** そうと分からないと、20クラスの中から
       自分の行き先を毎回さがすことになる。直す場所まで1手で行けるようにする。 */
    const unset = !spGradesOf(view.sp);
    $("pals").innerHTML =
      (unset
        ? "<p class='hint spunset'>担当学年が決まっていないので、"
          + "<b>全クラス</b>を出しています。"
          + "<button type='button' class='sbtn' id='palSpFix'>学級編成で決める</button></p>"
        : "")
      + "<div class='palg'>"
      + groups.map(x => "<div class='palgg' data-g='" + escText(x.g) + "'>"
          + x.list.map(c => palHtml({v:c, t:c, g:x.g})).join("")
          + "</div>").join("")
      + "</div>"
      + palHtml({v:PAL_CLEAR, t:"リセット", clear:true});
    const up = $("unitPals");
    if(up) up.innerHTML = upalsHtml_();
    const fix = $("palSpFix");
    if(fix) fix.onclick = () => openRosterDlg();
    wirePalette();
    return;
  }

  const items = SUBJECTS.filter(chipHere_).map(s => ({v:s.code, t:s.name, off:!s.count}));

  /* **校外行事はどの面にも出す。** 学級だけの校外学習も、学年の自然学校もある */
  items.push({v:PAL_TRIP, t:"校外行事", trip:true});
  /* **授業なしもどの面にも出す。** 1学級だけ潰れる日も、学年で潰れる日もある */
  items.push({v:PAL_NONE, t:"授業なし", none:true});

  /* **学年・全学年には「リセット」を出す。**
     ここで入れたコマは全クラスに降りる。入れるのと同じ手数で取り消せないと、
     間違えて降ろしたものを1コマずつ空にして回ることになる。
     担任の画面には出さない（そちらは「上位に戻す」が同じ役をする）。 */
  const canClear = (view.kind === "grade" || view.kind === "school");
  if(canClear) items.push({v:PAL_CLEAR, t:"リセット", clear:true});

  $("pals").innerHTML = items.map(palHtml).join("");
  const up = $("unitPals");
  if(up) up.innerHTML = upalsHtml_();
  wirePalette();
}

/* 押す・引っぱるの結線。**チップを組み直すたびに呼ぶ** */
function wirePalette(){

  if(typeof applyLock === "function") setTimeout(applyLock, 0);
  /* 使い方は ？ の中（HELP.pals）。押す口のとなりに5行の説明を置くと、
     教科の並びより説明のほうが高くなり、毎回それを越えて押すことになる */
  paintChipSeg();
  drawTallyPanel();               /* 面が変われば数も変わる */
  /* 単元進捗の入口は、学級・専科の面にだけ出す（学年・全校には単元が無い） */
  if(typeof paintUnitManagerButton === "function") paintUnitManagerButton();

  for(const b of document.querySelectorAll("#pals .pal, #unitPals .pal")){
    b.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-timetable", b.dataset.v);
      ev.dataTransfer.effectAllowed = "copy";
      b.classList.add("drag");
    });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.addEventListener("click", () => {
      const v = b.dataset.v;
      /* 教科チップは「持つ／手放す」でもある。持つと、紙の中でその教科の
         コマだけが目立ち、単元チップがその教科に絞られる。
         コマが選んであるなら、いままでどおりそのコマに入る */
      if(SUB_BY_CODE[v]){
        /* **コマを選んでいるときは、押せば必ずそのコマに入る。**
           同じチップの2度目を「手放す」にしていると、上書きの確認を Esc で
           閉じたあと、もう一度押しても何も入らず「効かない」ように見えた。
           手放すのは、コマを選んでいないとき（と Esc・別の面へ出たとき）だけ */
        if(pickSub === v && !selCell){ pickRelease_(); return; }
        pickSub = v;
        pickRepaint_();
        if(!selCell)
          return toast("<b>" + escText(SUB_BY_CODE[v].name) + "</b>を強調しています。"
                     + "コマを押すと入ります（もう一度チップを押すと解除）");
        applyPalette(selCell.d, selCell.s, v);
        return;
      }
      if(!selCell) return toast("先にコマを選ぶ");
      applyPalette(selCell.d, selCell.s, v);
    });
  }
  paintPickState_();
}

/* 教科の色。**クラスごとに持つ**（学級によって使いたい人と使わない人がいる）。
   紙にも出すかまで、ここで選ぶ ── 紙に出すと、モノクロ印刷では13色が
   灰色の濃淡になる。選んだ人の紙にだけ出す。 */
function chipMode(){
  return view.kind === "class" ? ((Y().chipModes || {})[view.cls] || "off") : "off";
}
/* その面で色を出すか。**クラスの面だけが本人の設定で、ほかは既定で出す。**

   *クラスの面*：担任の紙。既定は出さない ── 毎週の紙に13色が乗ると、
   その週に何が起きるかより色のほうが目に立つ。出したい人が出す。

   *専科の面*：コマの中身が「行き先のクラス」なので、色は**学年の目印**。
   1・2年をまとめて回した日が、紙の上でひと塊に見える。

   *学年・全学年の面*：入れたものが全クラスに降りる面で、見るのは
   「同じ教科がどの曜日に並んでいるか」。色があると塊が先に見える。

   **どちらも「紙にも」で出す。** これらの面を刷るのは、担任の紙ではなく
   組み替えのための下敷きで、色が飛ぶと見るために出した意味が無くなる。
   （クラスの面の「画面だけ／紙にも」は、そのままそのクラスの設定） */
function faceChipMode(){
  if(typeof view === "undefined" || !view) return "off";
  /* 案の面は**コマごとではなく、コマの中の1行ずつ**を教科の色で塗る
     （1コマに何人も並ぶ。→ spmonth.js の spmCellFor）。
     ここで面ぜんたいに色を付けると、教科を持たないコマまで地が付く */
  if(typeof spmFace === "function" && spmFace()) return "off";
  if(view.kind === "class") return (Y().chipModes || {})[view.cls] || "off";
  return "output";
}
function paintChipSeg(){
  const w = $("chipWrap");
  if(!w) return;
  w.hidden = view.kind !== "class";
  const m = chipMode();
  for(const b of document.querySelectorAll("#chipSeg [data-chip]"))
    b.setAttribute("aria-pressed", String(b.dataset.chip === m));
}

/* 紙の字の大きさ。**題名 12〜20pt・備考 8〜14pt**（設定のスライダーと同じ幅）。
   0.5pt 刻み。端では押せなくする ── 押しても何も起きない状態にすると、
   壊れているのか端なのかが分からない。 */
const FONT_PT = {titlePt:{min:12, max:20, def:16}, notePt:{min:8, max:14, def:12}};
const fontPt = k => {
  const r = FONT_PT[k];
  return Math.min(r.max, Math.max(r.min, +db.settings[k] || r.def));
};
function paintFontBtns(){
  const w = $("fontWrap");
  if(!w) return;
  const v = {titlePt:fontPt("titlePt"), notePt:fontPt("notePt")};
  $("fsTitleV").textContent = v.titlePt;
  $("fsNoteV").textContent  = v.notePt;
  for(const b of w.querySelectorAll(".fsb")){
    const k = b.dataset.fs, r = FONT_PT[k];
    const next = v[k] + (+b.dataset.step);
    b.disabled = next < r.min || next > r.max;
  }
}

/* ── この週の日の形（全学年の面だけ） ──────────
   **紙の上ではなく、押すものが並ぶここに置く。**
   紙の日付の見出しに置いていたころは、押せることに気づかれず
   「休みの日を入れる口が無い」と言われた。紙に残すのは印（特・休）だけで、
   あれは刷って残る情報。押す口は、ほかの押す口と同じ場所にある。

   **出すのは全学年の面だけ。** 効く範囲が全クラスなので、担任の画面から
   押せると、自分の学級を直したついでに全校が動く。 */
function drawDayPanel(){
  const wrap = $("dayWrap");
  if(!wrap) return;
  wrap.hidden = (typeof view === "undefined") || view.kind !== "school";
  if(wrap.hidden) return;
  const row = $("dayRow");
  row.textContent = "";
  for(let d = 0; d < DAYS; d++){
    const f = dayForm(d), dt = addDays(monday, d);
    const b = el("button", "dayb" + (f ? " form-" + f : ""),
      "<b>" + md(dt) + "（" + DOW[d] + "）</b>"
      + "<span>" + escText(DAY_FORM[f].label) + "</span>");
    b.type = "button";
    b.title = DAY_FORM[f].why + "　押すと変えられる（全クラスに入る）";
    b.onclick = () => openDayDlg(d);
    row.appendChild(b);
  }
  /* 畳んだままでも「ふつうでない日があるか」だけは見える。
     **開き閉じは覚えておく**（既定は畳む。週に0〜1回しか直さない） */
  const fold = $("dayFold");
  if(fold){
    if(fold.open !== !!db.settings.dayOpen) fold.open = !!db.settings.dayOpen;
    const odd = [];
    for(let d = 0; d < DAYS; d++){
      const f = dayForm(d);
      if(f) odd.push(DOW[d] + DAY_FORM[f].label);
    }
    $("dayPeek").textContent = odd.length ? odd.join("・") : "全部ふつう";
  }
}

/* 書く前に一度だけ聞く。**別の人の予定を潰すときだけ。**
   基本時間割を直すのはふだんの作業なので聞かない（→ compose.js の wouldOverwrite）。
   自分が入れたコマも聞かない。一度«上書きする»と答えたコマは、
   その画面を開いている間は聞き直さない。

   **編集そのものは止めない。** 止めると、担任が直せないコマができて、
   直せる人を探して回ることになる。止めるのではなく、既定を安全側に置く。 */
const askedCells = {};

/* 窓の返事を待つあいだ、答えを受け取る先。**Enter や Esc は「変更しない」。** */
let owAsk = null;
/* 窓が閉じた直後、閲覧器が押していたコマへ指を戻す → 持ち歩きの教科が
   もう一度落ちて、同じ窓がすぐ出直してしまう（どう閉じても閉じられない）。
   その一瞬だけ、コマへの教科の付け落としを止める時刻 */
let owGuardUntil = 0;
function whenLabel(d, sid){
  const dt = addDays(monday, d), sl = SLOT_BY_ID[sid];
  return md(dt) + "(" + DOW[d] + ") " + sl.name + (sl.kind === "lesson" ? "校時" : "");
}
function askOverwrite(when, to, hits, yes, no){
  owAsk = {yes, no, done:false};
  $("swWhen").textContent = when;
  $("swTo").textContent   = plain(to) || "（空）";
  $("swList").innerHTML = hits.map(h =>
    "<li><b>" + escText(h.cls) + "</b> の「" + (escText(h.from) || "（空）") + "」"
    + "<br><span class=\"who\">" + escText(h.layer)
    + (h.who ? "・" + escText(h.who) : "") + " が入れたもの</span></li>").join("");
  const dlg = $("swDlg");
  dlg.showModal();
  $("swNo").focus();                 /* **既定は「変更しない」。** */
}
/* 窓の返事を1回だけ流す。閉じ方（ボタン・Esc・外側）で取りこぼさない */
function owAnswer(yes){
  const a = owAsk;
  owAsk = null;
  if(!a || a.done) return;
  a.done = true;
  (yes ? a.yes : a.no)();
}

/* 一度「上書きする」と答えたコマを、**もう一度聞く状態に戻す。**
   競合で週を読み直したあとに要る。読み直すと中身が入れ替わっているので、
   前の答えは別のものについての答えになっている。 */
function forgetAsked(d, sid){ delete askedCells[viewName() + "|" + ck(d, sid)]; }

/* 聞かずに済むときは、その場で yes を呼んで true を返す。
   聞くときは false を返し、返事が出たあとで yes / no のどちらかを呼ぶ。 */
function okToOverwrite(d, sid, to, yes, no, forCls){
  yes = yes || function(){}; no = no || function(){};
  const hit = wouldOverwrite(d, sid, forCls);
  /* **鍵に「入れる先」も入れる。** 前は画面とコマだけだったので、
     «この学級のみ» で1回「上書きする」と答えると、同じコマを
     «全校に反映» で入れるときには聞かれなかった。
     効く範囲が1クラスから20クラスへ変わっているのに、無言で通っていた。 */
  const key = [viewName(), layerOfStore(), targetOfStore(), forCls || "",
               ck(d, sid)].join("|");
  if(!hit.length || askedCells[key]){ yes(); return true; }
  askOverwrite(whenLabel(d, sid), to, hit,
               () => { askedCells[key] = true; yes(); }, no);
  return false;
}

function applyPalette(d, sid, v, e){
  /* 単元。**チップと同じ手つき**（引っぱって落とす／選んで押す）。
     何が起きるかは落とす先で決まる：起点の無い単元はここを起点に、
     起点に落とせば全消滅、ほかのコマならそのコマだけ外す ──
     ぜんぶ unitprogress.js の中。教科の教科名ではないので、
     下の教科チップの道には流さない */
  if(v === PAL_URESET) return upResetChip_(d, sid);
  if(v.slice(0, 5) === "unit:"){
    const u = unitById_(v.slice(5));
    if(u) upDropChip_(u, d, sid);
    return;
  }
  /* 校外行事。**押すたびに付け外し。** 続けて置けば、描くときに1つの縦長にまとまる。
     **休みの日にも置けるので、下の whyCantWrite より先に見る**
     （自然学校のように休日・祝日をまたぐ行事がある） */
  if(v === PAL_TRIP){
    const on = !tripIn_(targetStore(), d, sid);
    const why = setTrip(d, sid, on);
    if(why) return toast(why);
    buildSheet(); autoFit(); selectCell(d, sid, cellAt(d, sid));
    return void toast(on ? "このコマを<b>校外行事</b>にした（題名・備考はそのまま）"
                         : "校外行事を外した");
  }
  /* 授業なし。**押すたびに付け外し。** 題名そのものを印にしているので、
     入れたあとは下の「授業なしのコマには入れない」で守られる */
  if(v === PAL_NONE){
    const on = !noLessonHere(d, sid);
    const why = setNoLesson(d, sid, on);
    if(why) return toast(why);
    paintSheet(); fillPanel(); selectCell(d, sid, e || cellAt(d, sid));
    return void toast(on ? "このコマを<b>授業なし</b>にした（備考は書ける）"
                         : "授業なしを外した");
  }
  /* **入らないなら、入る前に理由を言う。** 通してしまうと writeCell が
     黙って弾き、下の toast だけが「入れた」と言う */
  const no = whyCantWrite(d, sid);
  if(no) return toast(no);
  /* リセット。**ここで入れたものを取り消すだけ。** 各クラスが自分で入れたものは消さない */
  if(v === PAL_CLEAR){
    /* 専科は「自分の層」の棚を1枚持たないので、入っていたかは
       行き先を束ねた中身（ownCell）で見る。そうしないと、消せたあとでも
       「もともと入っていない」と出てしまう */
    const had = view.kind === "special" ? ownCell(d, sid).layer === "special"
                                        : !!targetStore()[ck(d, sid)];
    writeCell(d, sid, {title:"", note:"", subject:null});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(had ? "このコマを" + viewName() + "から取り消した"
              : viewName() + "には、もともと入っていない");
    return;
  }
  /* **授業なしのコマには、授業を入れない。** 斜め線を引いた欄に字が入ると、
     刷った紙で「授業があるのか、無いのか」が読めなくなる（休みの日と同じ理由）。
     リセットはここより上で通す ── 学年から降りた「授業なし」を取り消せなくなる */
  if(noLessonHere(d, sid))
    return toast("このコマは<b>授業なし</b>にしてある。"
               + "授業を入れるには、もう一度<b>授業なし</b>を落として外す");

  if(view.kind === "special"){
    /* **専科も、他人の予定を潰すときは聞く。** 行き先のクラスの
       そのコマに、担任や別の専科の予定が入っていることがある */
    const target = normCls(plain(v));
    /* **行き先が授業なしなら入れない。** 専科の面からは相手の紙が見えないので、
       止めないと、潰れたコマに専科だけが入ったまま気づかれない */
    if(target && noLessonOn(target, d, sid))
      return toast(escText(target) + " のこのコマは<b>授業なし</b>にしてある");
    okToOverwrite(d, sid, v, () => {
      writeCell(d, sid, {cls:v});
      paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
      toast(escText(v) + " へ行く時間にした");
    }, undefined, target);
    return;
  }
  const sub = SUB_BY_CODE[v];
  if(!sub) return;
  okToOverwrite(d, sid, sub.name, () => {
    writeCell(d, sid, {title:escText(sub.name), subject:sub.code});
    paintSheet(); selectCell(d, sid, e || cellAt(d, sid));
    toast(sub.name + " を入れた");
  });
}

/* ── 選ぶ ────────────────────────────────────── */

function selectCell(d, sid, e){
  for(const x of document.querySelectorAll("#sheet .cell.sel")) x.classList.remove("sel");
  if(e) e.classList.add("sel");
  selCell = {d, s:sid};
  scope = "self";        /* 選ぶたびに戻す。持ち越すと黙って全校へ広がる */
  paintHeader();
  fillPanel();
}
function clearSelection(){
  for(const x of document.querySelectorAll("#sheet .cell.sel")) x.classList.remove("sel");
  selCell = null;
  fillPanel();
}

/* ── パネルの中身 ────────────────────────────── */

function fillPanel(){
  $("noSel").hidden  = !!selCell;
  $("hasSel").hidden = !selCell;
  if(!selCell) return;

  const slot = SLOT_BY_ID[selCell.s];
  const c = cellFor(selCell.d, selCell.s);
  /* **選んでいるコマの日付・校時・誰が入れたかは、ここでは文にしない。**
     紙の上の選択枠（.cell.sel）が「どれを選んでいるか」を言い、
     左端の色と右上の札（.tag）が「誰が・どの層から」を言う。
     ここで同じことをもう一度書くと、コマを選び直すたびに読み直しが増える。 */

  const t = $("pTitle"), n = $("pNote");
  if(t !== typing && t.innerHTML !== (c.title || "")) t.innerHTML = c.title || "";
  if(n !== typing && n.innerHTML !== (c.note  || "")) n.innerHTML = c.note  || "";
  /* lesson は題名＋備考、note（放課後）は**備考だけ**、brk は題名だけ */
  $("pNoteWrap").hidden   = slot.kind === "brk";
  $("pTitleWrap").hidden  = slot.kind === "note";
  $("pTitleLabel").textContent =
    view.kind === "special" ? "行き先のクラス" : "教科名・行事名";
  /* 時数名。**専科の面には無い**（コマの中身が行き先のクラスで、教科ではない）。
     lesson 以外の行（朝学習・放課後）も、学年の面・カレンダーでは
     1文字に詰めないので出さない。 */
  const shortWrap = $("pShortWrap");
  if(shortWrap){
    shortWrap.hidden = view.kind === "special" || slot.kind !== "lesson";
    const sh = $("pShort");
    if(sh && sh !== document.activeElement) sh.value = c.short || "";
  }

  /* 校外行事の名前。**覆っているコマを選んでいるときだけ出す。**
     続けて置いた1本ぶんに同じ字が入る。**打っている欄は書き替えない**
     （書き替えるとカーソルが先頭へ跳ぶ）。 */
  const tw = $("pTripWrap");
  const onTrip = slot.kind === "lesson" && typeof tripHere === "function"
              && tripHere(selCell.d, selCell.s);
  tw.hidden = !onTrip;
  if(onTrip){
    const nm = $("pTripName"), tp = $("pTripTp"), who = tripLockedBy(selCell.d, selCell.s);
    if(nm !== document.activeElement) nm.value = tripName(selCell.d, selCell.s);
    if(tp !== document.activeElement) tp.value = tripTp(selCell.d, selCell.s);
    nm.disabled = tp.disabled = !!who;
    /* **残すのは「いまの状態」だけ。** 決まりごと（1本ぶんに同じ字が入る・
       たんぽぽは2文字まで）は ？ の中（HELP.trip）へ移した */
    $("pTripHint").innerHTML = who
      ? "この行事は<b>" + escText(who) + "</b>が入れたもの。名前もその面から直す。"
      : "";
    $("pTripHint").hidden = !who;
  }

  /* **この日の行事。** 年間行事計画表から読んだもの。
     押すと、選んでいるコマに入る（何校時かは表に書いていないので、決めるのは人）。
     教科は「行事」にする——時数に数えない教科なので、Excel 側の集計が増えない。 */
  const evs = eventsOn(selCell.d);
  $("pEvWrap").hidden = !evs.length;
  if(evs.length){
    $("pEvs").innerHTML = evs.map((x, i) =>
      "<button class='ev' data-i='" + i + "'><i>" + escText(x.who) + "</i>"
      + "<span>" + escText(x.text) + "</span></button>").join("");
    for(const b of $("pEvs").querySelectorAll(".ev"))
      b.onclick = () => {
        const no = whyCantWrite(selCell.d, selCell.s);
        if(no) return toast(no);
        const x = evs[+b.dataset.i], at = {d:selCell.d, s:selCell.s};
        okToOverwrite(at.d, at.s, x.text, () => {
          writeCell(at.d, at.s, {title:escText(x.text),
                                 subject: SUB_BY_CODE["gyoji"] ? "gyoji" : null});
          paintSheet(); selectCell(at.d, at.s, cellAt(at.d, at.s));
          toast("「" + escText(x.text) + "」を入れた");
        });
      };
  }

  /* リンクは1コマにいくつでも */
  const ls = linksIn(c.title).map(x => Object.assign({f:"title"}, x))
       .concat(linksIn(c.note ).map(x => Object.assign({f:"note" }, x)));
  $("pLinks").innerHTML = ls.map((x, i) =>
    "<div class='lrow'><b>" + escText(x.text) + "</b>"
    + "<span>" + escText(x.href) + "</span>"
    + "<button data-i='" + i + "' title='リンクを外す'>外す</button></div>").join("");
  /* 使い方は ？ の中（HELP.links）。押す口のとなりに置くと、
     リンクが1つも無いコマでも毎回2行の説明を越えて押すことになる */
  for(const b of $("pLinks").querySelectorAll("button")){
    b.onclick = () => {
      const x = ls[+b.dataset.i];
      writeCell(selCell.d, selCell.s, x.f === "title"
        ? {title: dropLink(c.title, x.href, x.text)}
        : {note:  dropLink(c.note,  x.href, x.text)});
      paintSheet(); fillPanel();
    };
  }

  /* 入れる先。クラスを開いているときだけ選べる */
  /* 「入れる先」の欄は外した。**開いたものが、そのまま入る先。**
     もう1か所で選べると、開いているものと食い違い、学級を開いたまま
     全校へ広がることが起きていた（→ src/index.html の右メニュー）。
     scope は自分の学級に固定する ── 変数そのものは残してある
     （学年・全校の面を開いたときの行き先を、同じ言葉で書くため）。 */
  const isClass = view.kind === "class";
  if(isClass) scope = "self";

  $("pAllWrap").hidden = slot.kind !== "brk";
}

/* ── リンクを付ける ─────────────────────────── */

let lastRange = null;   /* 直前に選んだ文字の範囲。ボタンを押すときに使う */

/* いま窓で聞いている最中のリンク。**欄と範囲を控える。**
   窓を開くと選択が外れるので、閉じてから入れ直す。 */
let linkAt = null;

function addLinkToSelection(){
  if(!selCell) return;
  if(!lastRange || lastRange.collapsed)
    return toast("先に<b>リンクにしたい文字を選ぶ</b>。選んでからここを押す");

  const host = lastRange.commonAncestorContainer;
  const box  = (host.nodeType === 1 ? host : host.parentElement);
  const fld  = box && box.closest && box.closest("#sheet .t, #sheet .n, .fld");
  if(!fld) return toast("題名か詳細の欄の中で文字を選ぶ");

  /* **ブラウザの prompt を使わない。** ほかの窓と閉じ方をそろえる
     （prompt だけ Esc の落ち先が別で、字の大きさも画面と合わない）。 */
  linkAt = {fld, range: lastRange.cloneRange(), at:{d:selCell.d, s:selCell.s}};
  $("linkText").textContent = linkAt.range.toString();
  $("linkUrl").value = "";
  $("linkWhy").innerHTML = "";
  $("linkDlg").showModal();
  $("linkUrl").focus();              /* ここは入力窓。打つところへ落とす */
}

function doAddLink(){
  const a = linkAt;
  if(!a) return;
  const url = String($("linkUrl").value || "").trim();
  if(!/^https?:\/\//i.test(url))
    return void ($("linkWhy").innerHTML = "<div class='box'><b>URL は https:// から始めます。</b>"
      + "ブラウザのアドレス欄からそのまま貼れます。</div>");
  $("linkDlg").close();
  linkAt = null;

  /* **窓を閉じてから、控えた欄と範囲を入れ直す。**
     execCommand は、その欄に focus が戻っていないと何もしない。
     focus のあいだ typing を立てて、塗り直しにこの欄を書き替えさせない */
  typing = a.fld;
  a.fld.focus();
  const sel = document.getSelection();
  sel.removeAllRanges(); sel.addRange(a.range);
  document.execCommand("createLink", false, url);
  typing = null;

  const isNote = a.fld.id === "pNote" || a.fld.classList.contains("n");
  writeCell(a.at.d, a.at.s, isNote ? {note:a.fld.innerHTML} : {title:a.fld.innerHTML});
  paintSheet(); fillPanel();
  toast("リンクを付けた。<b>その文字を押すと開く</b>");
}

/* ── 右メニューの時数 ───────────────────────────
   **カレンダーの面と同じ数。** 数え方は compose.js の countSub 1つで、
   時数集計表へのコピーとも揃う。別々に数えると、見る場所で数が違う。

   *ここにも置く理由*：カレンダーの面は4ヶ月を見るための面で、
   紙を書いているあいだは開いていない。「あと何時間で終わるか」は
   **書きながら**見たい数なので、書く手の隣にも出す。

   *出す数*：今月と、年度はじめ（4/1）からの累計。
   カレンダーの月の下と同じ並び（教科シートの順）。

   *読めていない週*：累計は4月からの週をぜんぶ読まないと確かにならない。
   読んでいない週は「基本時間割どおり」として数える（書いていない日と同じ扱い）。
   **見込みで数えているぶんを字で言う** ── 黙って出すと、
   出張で潰したコマが数に残ったまま「足りている」と読める。 */
function tallyOn(){
  return view.kind === "class" || view.kind === "grade" || view.kind === "special";
}

/* 4月からこの月までの月。週の並べ方と年度分けは sheet.js の fyWeeks が持つ
   （カレンダーの面と同じ決まりで読む。2つ持つと片方だけ直した版が出る） */
function tallyMonths(m){
  const y = fyOf(m), upto = (m.getMonth() - 3 + 12) % 12, out = [];
  for(let i = 0; i <= upto; i++) out.push(new Date(y, 3 + i, 1));
  return out;
}
const tallyWeeks = m => fyWeeks(tallyMonths(m));
const tallyMons  = m => {
  const g = tallyWeeks(m), out = [];
  for(const y in g) for(const k in g[y]) out.push(k);
  return out;
};

function drawTallyPanel(){
  const wrap = $("tallyWrap");
  if(!wrap) return;
  wrap.hidden = !tallyOn();
  if(wrap.hidden) return;
  const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const now = calCount(m), sum = calSum(m);
  const subs = calSubs([now, sum]);
  $("tlyBox").innerHTML = subs.length
    ? "<div class='tlyhd'><span>教科</span><span>" + (m.getMonth() + 1)
      + "月</span><span>累計</span></div>"
      + subs.map(k => "<div class='tlyrow'><span>" + escText(k) + "</span>"
        + "<span>" + fmtCount(now[k]) + "</span>"
        + "<span>" + fmtCount(sum[k]) + "</span></div>").join("")
    : "<p class='hint'>時数に数えるコマがありません</p>";
  /* まだ読んでいない週。**数でなく、確かさの話として書く。**
     手元だけで使っているときは読む先が無い（この端末が正本）ので、
     読み込みの話はしない ── 無い仕組みのことを書くと、探しに行かせてしまう。

     年度ごとに数える ── readWeeks は年度ごとに見るので、
     1つの塊で数えると、年度をまたぐ週を数え落とす。 */
  let left = 0;
  if(Backend.isGas() && Backend.unread){
    const g = tallyWeeks(m), keep = monday;
    for(const y in g){
      const list = Object.keys(g[y]).sort();
      monday = parseISO(list[0]);
      left += Backend.unread(list);
    }
    monday = keep;
  }
  /* **ここに残すのは「いまの状態」だけ。** 決まりごと（累計は4/1から・
     書いていない日は基本時間割で数える）は ？ の中（HELP.tally3）へ移した。
     毎回同じ字が数の下に居座ると、変わったところが埋もれる。 */
  $("tlyNote").innerHTML = !Backend.isGas() ? ""
    : left ? "<b>" + left + "週ぶんをまだ読んでいません。</b>"
           + "そのぶんは基本時間割どおりとして数えています。"
           : "4月からの週は読み込み済みです。";
  $("tlyNote").hidden = !$("tlyNote").innerHTML;
  $("tlyRead").hidden = !left;

  /* 畳んだときも、開かずに分かるように見出しへ一言。
     **開き閉じは覚えておく**（既定は畳む。毎日見るものではない） */
  const fold = $("tallyFold");
  if(fold){
    if(fold.open !== !!db.settings.tallyOpen) fold.open = !!db.settings.tallyOpen;
    $("tlyPeek").textContent = subs.length
      ? (m.getMonth() + 1) + "月 " + fmtCount(subs.reduce((n, k) => n + (now[k] || 0), 0)) + "コマ"
      : "";
  }
}

/* 4月からの週を読み直してから、数え直す。読む段取りは
   sheet.js の readByFy（カレンダーの面と同じもの）。 */
function tallyReadAll(){
  const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const w = Wait.begin("年度始めからの週を読んでいます");
  readByFy(tallyWeeks(m), () => {
    Wait.end(w);
    drawTallyPanel();
    redrawCenter(true);
  });
}

/* ── 時数集計シートへ書き出す ─────────────────────
   **押したときだけ動く。** 全クラス × 4月からこの月まで を数えて、
   スプレッドシートの「時数集計」シートへ置く。

   *押したときだけにした理由*：保存のたびに書くと、全校・学年の層を直したときに
   27クラスぶんを数え直すことになる。時数は月末・学期末に見る数なので、
   **見るときに1回**で足りる。

   *時間がかかる*：3月に押すと、全クラス（27枚）× 45週ぶんを読む。
   apiReadWeeks が各シートを1回だけ読んで週ごとに振り分けるので、
   待つ時間はおおむねシート数（+回線）ぶんだけ。それでも数十秒かかることはある。
   ？の説明にもそう書いてある。

   *ここで数える理由*：合成（どの層が勝つか・休み・校外・特別校時・合同体育の
   元教科・時数に数えるか）は compose.js の1か所にある。GAS 側で数え直すと
   2つ目の実装ができ、画面の数とシートの数が食い違う。
   **数えるのは画面、置くのはシート。** */

/* 1クラス・1ヶ月ぶんを数える。**時数集計表へのコピー（tallyGrid）と同じ決まり。**
   休みの日は数えない。紙に出ていない校時も数えない。 */
function tallyClassMonth(cls, m){
  const out = {}, keep = monday;
  try{
    for(const dt of calDates(m)){
      monday = mondayOf(dt);
      const d = Math.round((dt - monday) / 86400000);
      if(d < 0 || d >= DAYS) continue;
      if(isDayOff(d)) continue;
      /* **朝学習は3ぶんで1コマ**（countWeight。授業の行は1、教科を選べる
         休みの行は1/3、ほかの休みの行は数えない） */
      for(const s of SLOTS){
        const w = countWeight(s);
        if(!w || !slotShown(d, s)) continue;
        const sub = countSub(compose(cls, d, s.id));
        if(sub) out[sub.short] = (out[sub.short] || 0) + w;
      }
    }
  } finally{ monday = keep; }
  return out;
}

/* 見出しに出す教科。**教科シートの順**（1文字が同じものは1つにまとめる）。
   0 のものも列としては置く ── 表として読むので、月によって列がずれない */
function tallyHeadSubs(){
  const out = [], seen = {};
  for(const sub of SUBJECTS){
    if(!sub.count || !sub.short || seen[sub.short]) continue;
    seen[sub.short] = 1;
    out.push(sub.short);
  }
  return out;
}

/* 集計するクラス。**開いている面のぶんだけ。**
   前は allClasses()（27クラス）を数えていて、担任が自分のクラスの時数を
   見たいだけでも全クラスぶん待たされた。**そのほとんどは他人のクラスの計算。**
   開いた面が層を決めるのと同じ決まりで、数える範囲も面が決める。 */
function tallyScope(){
  if(view.kind === "class") return [view.cls];
  if(view.kind === "grade") return classesOfGrade(view.grade);
  /* 専科は行き先が全学年に散る。全学年の面も、面そのものが全クラス */
  return allClasses();
}

function tallySheetAll(){
  const m0 = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const months = tallyMonths(m0);
  const classes = tallyScope();
  if(!classes.length) return toast("クラスがありません");
  const one = classes.length === 1;
  const w = Wait.begin(one ? classes[0] + " の週を読んでいます"
                           : classes.length + "クラスぶんの週を読んでいます（時間がかかります）");
  const g = tallyWeeks(m0);
  const ys = Object.keys(g);
  let left = ys.length;
  if(!left){ Wait.end(w); return; }
  const keep = monday;
  const done = () => {
    if(--left > 0) return;
    Wait.end(w);
    tallyWriteRows(months, classes);
  };
  for(const y of ys){
    const list = Object.keys(g[y]).sort();
    monday = parseISO(list[0]);
    /* **1クラスだけなら、その面のぶんだけ読む。** readWeeks は
       いま開いている面（全校・学年・そのクラス）を読む ── 1クラスの時数は
       その3枚で決まる。readWeeksAll は27クラス全部を読むので、
       1クラスのために使うと、読む量が20倍以上になる。 */
    if(one) Backend.readWeeks(list, done);
    else    Backend.readWeeksAll(list, done);
  }
  monday = keep;
}

function tallyWriteRows(months, classes){
  const subs = tallyHeadSubs();
  const head = ["年度", "クラス", "月"].concat(subs).concat(["合計", "集計日時", "集計者"]);
  const when = new Date().toLocaleString("ja-JP");
  const who = (Backend.info() || {}).me || "";
  const rows = [];
  const w = Wait.begin("数えています");
  const keep = monday;
  try{
    for(const cls of classes) for(const m of months){
      monday = mondayOf(new Date(m.getFullYear(), m.getMonth(), 15));
      const n = tallyClassMonth(cls, m);
      let sum = 0;
      const line = [String(fyOf(m)), cls, (m.getMonth() + 1) + "月"];
      for(const k of subs){ line.push(fmtCount(n[k])); sum += (n[k] || 0); }
      line.push(fmtCount(sum), when, who);
      rows.push(line);
    }
  } finally{ monday = keep; Wait.end(w); }
  const w2 = Wait.begin("時数集計シートへ書いています", true);
  Backend.saveTally(fy(), head, rows, r => {
    Wait.end(w2);
    drawTallyPanel();
    if(r) toast("「" + r.name + "」シートに "
                + classes.length + "クラス × " + months.length + "ヶ月ぶんを置きました");
  });
}
