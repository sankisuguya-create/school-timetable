/* 窓（基本時間割・学級編成・用紙・時数コピー・たんぽぽ）。 */

/* ── 危ない操作の確認 ────────────────────────
   **ブラウザの confirm を使わない。** Enter で「はい」に落ちるので、
   打鍵の勢いのまま通ってしまう（docs/spec.md 3節・上書きの窓と同じ理由）。
   いちばん大きく壊せる操作が、いちばん弱い止め方になっていた。

   表を持つ確認には専用の窓がある（上書き swDlg・反映 apDlg・競合 cfDlg・
   出す先 tpDelDlg・たんぽぽ tpDlg）。ここが受けるのは**文だけの確認**。
   3か所に別々の窓を作ると、書き方がばらつく（足した窓で「既定はやめる」を
   付け忘れる）ので、1つにまとめてある。

     title   窓の見出し。**「…しますか」で終える**
     lines   段落の並び。中身は HTML なので、入れる字は escText を通す
     goLabel 進む側のボタンの字。**何が起きるかを動詞で書く**（「はい」にしない）
     onYes   進むと答えたときにすること
     onNo    やめると答えたとき。**閉じ方が何であれここに落ちる**（省略可）

   既定は「やめる」。✕ でも Esc でも外側でも、やめる側に落ちる。 */
let okAsk = null;
function askOk(o){
  okAsk = {yes:o.onYes || (() => {}), no:o.onNo || (() => {}), done:false};
  $("okTtl").textContent = o.title;   /* 字のまま入れる。escText は通さない（二重になる） */
  $("okBody").innerHTML = (o.lines || []).map(x => "<p>" + x + "</p>").join("");
  $("okNo").textContent  = o.noLabel || "やめる";
  $("okYes").textContent = o.goLabel || "続ける";
  $("okDlg").showModal();
  $("okNo").focus();                 /* **既定は「やめる」。** */
}
/* 窓の返事を1回だけ流す。閉じ方（ボタン・Esc・外側）で取りこぼさない */
function okAnswer(yes){
  const a = okAsk;
  okAsk = null;
  if(!a || a.done) return;
  a.done = true;
  (yes ? a.yes : a.no)();
}

/* ── 学級編成 ───────────────────────────────────
   本番では「クラス」シートが正本。ここはその写し。
   **年度ごとに持つ。** 直しても前の年度は変わらない。

   **直す途中は下書き（rsDraft）に入れ、「保存して閉じる」で一括反映。**
   打鍵のたびにシートへ書いていたころは、通信の切れたままの直しが
   画面には出るのにシートには無い形になり、誰にも分からなかった。
   閉じるとき直しが残っていれば「入れる／捨てる」を聞く。 */
let rsDraft = null;     /* 下書き。null のときは窓を開いていない */
let rsDirty = false;    /* 下書きに未反映の直しがある */
let rsCloseWired = false;

function openRosterDlg(){
  const Yr = Y();
  rsDraft = {classes: clone(Yr.classes || {}),
             specials: clone(Yr.specials || []),
             week1: Yr.week1 || ""};
  rsDirty = false;
  if(!rsCloseWired){
    rsCloseWired = true;
    /* 閉じ方が何であれ（✕・Esc・外側）ここへ来る。
       残っていれば聞く。既定は安全側（入れて閉じる） */
    $("rosterDlg").addEventListener("close", () => {
      if(!rsDirty) return;
      const d = rsDraft;
      rsDirty = false;
      askOk({title:"直したぶんを入れますか",
        lines:["閉じるだけでは、直したぶんはシートに入りません。",
               "入れないで閉じると、直したぶんは捨てられます。"],
        noLabel:"入れて閉じる", goLabel:"捨てる",
        onNo: () => applyRosterDraft_(d)});
    });
  }
  drawRoster();
  $("rosterDlg").showModal();
}
/* 下書きを本体へ入れてシートへ送る */
function applyRosterDraft_(d){
  if(!d) return;
  const Yr = Y();
  Yr.classes  = clone(d.classes);
  Yr.specials = clone(d.specials);
  if(d.week1) Yr.week1 = d.week1;
  save(); Backend.saveRoster();
  afterRosterChange();
}
/* 「まだ入れていません」を出す。未反映のときだけ保存を強調する */
function paintRsSave(){
  if(!$("rsSave")) return;
  $("rsStat").textContent = rsDirty ? "まだ入れていません" : "";
  $("rsSave").classList.toggle("go", rsDirty);
}
/* ── 教科の表し方 ────────────────────────────
   **紙の字・時数の1文字・たんぽぽの字を、1つの表で直す。**
   3つはシートの別々の列にあるので、並べて見せないと
   「どれを直せばどこが変わるか」が分からない。

   **コードは出さない。** 行の身元なので触らせない ── 直せると、
   週案のコマが指す先がどの行にも当たらなくなり、書いた予定の教科が消える。 */
function openSubDlg(){
  $("subFy").textContent = fy() + "年度";
  $("subStat").textContent = "";
  drawSubTable();
  $("subDlg").showModal();
}
function drawSubTable(){
  const box = $("subRows");
  box.innerHTML =
    "<div class='subhead'><span>教科</span><span>紙の字</span>"
    + "<span>1文字</span><span>たんぽぽ</span></div>"
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
  /* **紙の字が空の行は送らない。** 空にすると、その教科が画面から消えて
     入れ直す口も無くなる（コードは出していないので、シートを開かないと戻せない） */
  const bad = rows.filter(r => !r.name);
  if(bad.length){
    $("subStat").textContent = "紙の字が空の行があります。空にはできません。";
    return drawSubTable();
  }
  /* 画面の側を先に入れ替える。**待たせない**（送るのは後ろで進む） */
  setSubjects(SUBJECTS.map(s => {
    const r = rows.find(x => x.code === s.code);
    return r ? Object.assign({}, s, {name:r.name, short:r.short, tp:r.tp}) : s;
  }));
  save();
  drawPalette();
  if(view.kind !== "gate") redrawCenter(true);
  $("subStat").textContent = "直しました。シートにも送っています。";
  Backend.saveSubjects(rows, ok => {
    $("subStat").textContent = ok ? "シートに入れました。"
                                  : "シートに送れませんでした。もう一度直すと送り直します。";
  });
}

function drawRoster(){
  const Yr = Y();
  /* 下書きを描く。窓の外から呼ばれたとき（保存直後の組み直しなど）は本体を見る */
  const dr = rsDraft || {classes: Yr.classes || {}, specials: Yr.specials || [],
                         week1: Yr.week1 || ""};
  $("rsFy").textContent = fy() + "年度";
  $("rsW1").value = dr.week1 || firstMonday(fy());
  $("rsAbNow").textContent = "今は " + (db.settings.abAnchor || AB_ANCHOR);
  /* 専科の枠。**1行が1人ぶん。** 教科 ＋ 担当学年 ＋ 消す。
     同じ教科の行が2つあってよい（図工1・2年／図工3〜6年）。
     身元（code）は行には出さない ── 週案の棚に入っている字なので、
     見せても直させない（直すと、入れたコマの持ち主が変わる）。 */
  /* 専科が持つのは、時数に数える教科だけ（図書・給食・クラブは専科にしない） */
  const spSubs = SUBJECTS.filter(x => x.count && !x.only);
  $("rsSpRows").innerHTML = (dr.specials || []).map(sp =>
    "<div class='row sprow'>"
    + "<select data-spsub='" + escText(sp.code) + "'>"
    + spSubs.map(x => "<option value='" + escText(x.code) + "'"
        + (x.code === (sp.subject || sp.code) ? " selected" : "") + ">"
        + escText(x.name) + "</option>").join("")
    + "</select>"
    + "<input type='text' data-sp='" + escText(sp.code) + "' style='flex:1;min-width:8em'"
    + " placeholder='担当学年（空欄＝全学年）' value='"
    + escText((sp.grades || []).join(",")) + "'>"
    + "<span class='splab'>" + escText(spLabel(sp, dr.specials)) + "</span>"
    + "<button class='btn danger' data-spdel='" + escText(sp.code) + "'>消す</button>"
    + "</div>").join("")
    || "<p class='hint'>専科の枠がありません。「枠を足す」から作ります。</p>";

  /* **下書きだけを直す。** シートには「保存して閉じる」まで書かない */
  const spSave = () => { rsDirty = true; drawRoster(); };
  for(const e of $("rsSpRows").querySelectorAll("input[data-sp]"))
    e.onchange = () => {
      const t = (dr.specials || []).find(x => x.code === e.dataset.sp);
      if(!t) return;
      t.grades = spGrades_(e.value);
      spSave();
    };
  for(const e of $("rsSpRows").querySelectorAll("select[data-spsub]"))
    e.onchange = () => {
      const t = (dr.specials || []).find(x => x.code === e.dataset.spsub);
      if(!t) return;
      t.subject = e.value;
      /* **まだ誰にも書かれていない行は、身元も教科に合わせる。** 身元は
         週案の棚に入っている字なので、中身のある行を動かすとコマの持ち主が
         行方不明になる ── だがこの年の編成にまだ無い行は、どこにも
         書かれていないので動かせる。動かさないと、教科を直しても身元が
         前の教科のまま残り、「教科」列の無い古いシートでは保存したあと
         前の教科に戻ってしまう。 */
      if(!(Yr.specials || []).some(x => x.code === t.code)){
        let code = t.subject, n = 2;
        while((dr.specials || []).some(x => x !== t && x.code === code))
          code = t.subject + "_" + (n++);
        t.code = code;
      }
      spSave();
    };
  for(const b of $("rsSpRows").querySelectorAll("button[data-spdel]"))
    b.onclick = () => {
      const code = b.dataset.spdel;
      const t = (dr.specials || []).find(x => x.code === code);
      askOk({
        title: (t ? spLabel(t, dr.specials) : "この枠") + " を消しますか",
        lines:["<b>その枠で入れたコマは消えません。</b>枠が無くなるので、"
              + "入口からその面を開けなくなります。",
               "学年を直したいだけなら、消さずに<b>担当学年の欄</b>を直してください。"],
        goLabel:"消す",
        onYes: () => {
          dr.specials = (dr.specials || []).filter(x => x.code !== code);
          spSave();
        }
      });
    };

  $("rsRows").innerHTML = Object.keys(dr.classes).sort().map(g =>
    "<div class='row'><span>" + escText(g) + "年</span>"
    + "<input type='text' data-g='" + escText(g) + "' style='flex:1;min-width:16em' value='"
    + escText((dr.classes[g] || []).join(", ")) + "'>"
    + "<button class='btn danger' data-del='" + escText(g) + "'>行を消す</button></div>").join("");

  for(const e of $("rsRows").querySelectorAll("input[data-g]"))
    e.onchange = () => setGradeClasses(e.dataset.g, e.value);
  for(const b of $("rsRows").querySelectorAll("button[data-del]"))
    b.onclick = () => {
      const g = b.dataset.del;
      const used = (dr.classes[g] || []).filter(hasAnyData);
      const go = () => {
        delete dr.classes[g];
        rsDirty = true; drawRoster();
      };
      if(!used.length) return go();
      askOk({
        title: g + "年を、この年度の編成から消しますか",
        lines: ["<b>" + escText(used.join("・")) + "</b> には書き込みが残っています。",
                "消しても<b>中身は残ります</b>が、画面からは開けなくなります。"
                + "もう一度この学年を足せば、また開けます。"],
        goLabel: "消す", onYes: go
      });
    };
  paintRsSave();
}
/* 「1-1, 1-2, 1-3」を配列にする。空と重複は落とす。下書きへ入れる。 */
function setGradeClasses(g, text){
  const dr = rsDraft || {classes: Y().classes || {}};
  const seen = {}, out = [];
  /* **全角の数字・ー・，も決まった形で読む**（normCls と同じ揺れ） */
  for(const raw of String(text).normalize("NFKC").split(/[,、，\s]+/)){
    const n = normCls(raw);
    if(!n || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  /* **学年をまたいだ同名は置かせない。** クラス名は週案・基本時間割・
     単元・たんぽぽの身元なので、2つの学年に同じ名があると、
     あとのぶんが全部手前の学年扱いになる（gradeOf は先勝ち） */
  for(const g2 in dr.classes){
    if(g2 === g) continue;
    const dup = out.filter(c => (dr.classes[g2] || []).indexOf(c) >= 0);
    if(dup.length){
      toast("「" + escText(dup.join("・")) + "」は <b>" + escText(g2)
          + "年</b> にあります ── 2つの学年に同じ名は置けません");
      return drawRoster();
    }
  }
  const cur = dr.classes[g] || [];
  const gone = cur.filter(c => out.indexOf(c) < 0 && hasAnyData(c));
  const added = out.filter(c => cur.indexOf(c) < 0);
  const go = () => {
    dr.classes[g] = out;
    rsDirty = true; drawRoster();
  };
  if(!gone.length) return go();
  /* **消える名と増える名がそろうときは「名前の打ち替え」。**
     クラス名はどこでも身元なので、打ち替えるといまの中身は
     古い名のまま残り、新しい面は空から始まる ── 先に断る */
  if(added.length){
    askOk({
      title: gone.join("・") + " の名を " + added.join("・") + " に替えますか",
      lines: ["いま入っている<b>コマ・基本時間割・単元は「"
              + escText(gone.join("・")) + "」のまま残ります</b>。",
              escText(added.join("・")) + " の面は<b>空から</b>始まります。"],
      goLabel: "替える",
      onYes: go,
      /* **やめたら、打ち込んだ字を元の並びへ戻す** */
      onNo: () => drawRoster()
    });
    return;
  }
  askOk({
    title: gone.join("・") + " を、この年度の編成から外しますか",
    lines: ["このクラスには<b>書き込みが残っています</b>。",
            "外しても<b>中身は残ります</b>が、画面からは開けなくなります。"
            + "もう一度書き足せば、また開けます。"],
    goLabel: "外す",
    onYes: go,
    /* **やめたら、打ち込んだ字を元の並びへ戻す。**
       戻さないと、外れていないのに外れた字が欄に残る */
    onNo: () => drawRoster()
  });
}
/* そのクラスに何か入っているか（外す前に知らせるため） */
function hasAnyData(c){
  const Yr = Y();
  if(Yr.base[c] || (Yr.baseFrom || {})[c]) return true;
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

/* ── この日の形（ふつう／特別校時／休み） ──────
   **全学年の面からだけ開く。** 効く範囲が全クラスなので、
   担任の画面から押せると、自分の学級を直したついでに全校が動く。 */
let dayPick = 0;

function openDayDlg(d){
  dayPick = d;
  const dt = addDays(monday, d);
  $("dayWhen").textContent = md(dt) + "（" + DOW[d] + "）";
  drawDayForms();
  $("dayDlg").showModal();
}
function drawDayForms(){
  const now = dayForm(dayPick);
  /* **この日の行事も出す。** 読むだけ（コマに入れるのは紙のコマを選んでから）。
     ここに入れるボタンを置くと、窓を開けたままコマを選ぶことになる */
  const evs = eventsOn(dayPick);
  $("dayEvWrap").hidden = !evs.length;
  if(evs.length)
    $("dayEvs").innerHTML = evs.map(x =>
      "<li><b>" + escText(x.text) + "</b>"
      + "<br><span class=\"who\">行事計画（" + escText(x.who) + "）</span></li>").join("");
  $("dayForms").innerHTML = ["", "special", "off"].map(f =>
    "<button class='dayform' data-f='" + f + "' aria-pressed='" + (f === now) + "'>"
    + "<b>" + escText(DAY_FORM[f].label)
    + (DAY_FORM[f].mark ? "<i>" + escText(DAY_FORM[f].mark) + "</i>" : "") + "</b>"
    + "<span>" + escText(DAY_FORM[f].why) + "</span></button>").join("");
  for(const b of $("dayForms").querySelectorAll(".dayform"))
    b.onclick = () => {
      if(isLocked()) return toast("この画面はロック中");
      setDayForm(dayPick, b.dataset.f);
      $("dayDlg").close();
      buildSheet();                 /* **組み直す。** 行の並びが変わる */
      drawDayPanel();               /* 右メニューの並びも、いまの形にそろえる */
      autoFit();
      toast(md(addDays(monday, dayPick)) + "（" + DOW[dayPick] + "）を<b>"
          + escText(DAY_FORM[b.dataset.f].label) + "</b>にした");
    };
}

/* ── 用紙 ────────────────────────────────────── */

/* 月の面を刷る。**B4 のよこ（364×257mm）に1枚。**
   週の紙とは用紙が違うので、刷る直前に @page を書き替え、
   刷り終わったら元へ戻す（戻さないと、次に週の紙を刷るとき B4 で出る）。 */
/* 複数枚を並べた面を刷る。**月の面とカレンダーの面で1つ。**
   違うのは「紙の大きさ」「本文に付ける印」「組み直し方」の3つだけ。
   2つ持つと、当たりを変えたとき片方しか直らない。

   **紙の大きさで組み直してから刷る。** 画面の広さで合わせた倍率のまま刷ると、
   紙からはみ出すか、すかすかになる。刷り終わり（またはやめた）を拾って戻す
   ── 拾えない環境のために保険も置く。 */
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
/* 学年の面。**紙は1枚**なので、枠の大きさを渡す代わりに
   刷るとき用の組み方（fitGradePrint）へ切り替えるだけ */
const printGrade = () => printSpread(GV_PAGE, "printing-grade",
                                     c => (c ? fitGradePrint() : fitGrade()), () => 1);

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
  /* **`size:B5` と書かない。** CSS の B5 は ISO B5（176×250mm）で、
     日本の B5（JIS・182×257mm）より 6×7mm 小さい。キーワードで書くと、
     紙は 182×257 のつもりで組んだ版面が 176×250 の枠に入らず、
     **下がはみ出して2ページ目が出る**（実際に出た）。mm で直に書く。 */
  st.textContent = "@page{size:" + w + " " + h + ";margin:" + s.margin + "mm}";
  $("stPaper").value = s.paper;
  $("stMg").value = s.margin;  $("stMgV").textContent = s.margin;
  $("stK").value  = s.k;       $("stKV").textContent  = (+s.k).toFixed(2);
  $("stTitle").value = +s.titlePt || 16; $("stTitleV").textContent = +s.titlePt || 16;
  $("stNote").value = +s.notePt || 12; $("stNoteV").textContent = +s.notePt || 12;
  /* 右メニューの ＋− も同じ値を出す。**2か所が同じ棚を見る**ので、
     どちらから直しても、もう片方の数がすぐ合う */
  if(typeof paintFontBtns === "function") paintFontBtns();
  autoFit();
}

/* ── 時数集計表へのコピー ───────────────────────
   週ごとのシートに1回で貼れる矩形にする。空のセルも含める。
   数えない教科は空欄にする（書くと Excel 側の出現数の集計が増える）。 */

const tallyClasses = () =>
  String(db.settings.tally.classes || "").split(/[,、\s]+/).filter(Boolean);

function tallyGrid(){
  const t = db.settings.tally;
  const list = tallyClasses(), block = Math.max(1, +t.block || 10);
  const used = Object.keys(t.cols).map(k => +t.cols[k] || 0);
  const width = (used.length ? Math.max.apply(null, used) : 0) + 1;
  const rows = [];
  for(let d = 0; d < WEEKDAYS; d++) for(let r = 0; r < block; r++){
    const line = new Array(width).fill("");
    /* **休みの日は数えない。** 斜め線を引いた日の授業を数えると、
       Excel 側の時数がその週だけ多くなる */
    if(r < list.length && !isDayOff(d)){
      for(const s of SLOTS){
        if(!(s.id in t.cols)) continue;
        /* 特別校時の日は朝学習が無い。紙に出ていないものを数えない */
        if(!slotShown(d, s)) continue;
        /* 欄に出ている字をそのまま写す（コマの時数欄で直した字が
           そのまま表に出る。「と」は図書、数えるのは Excel 側で国語として） */
        line[t.cols[s.id]] = tallyCharOf(compose(list[r], d, s.id));
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
  /* **時程の行を全部出す。** 前は「もう列のずれが入っているもの」だけを
     出していたので、時程シートのIDを既定から変えた学校では一覧に出ず、
     時数のコピーが空のまま**画面からは直せなかった**。
     空欄＝その校時は写さない。 */
  $("tyCols").innerHTML = "<span>列のずれ</span>" + SLOTS
    .map(s => "<label style='font-size:12px;color:var(--tx-sub)'>"
      + escText(s.tally || s.name)
      + " <input type='number' data-s='" + escText(s.id) + "' value='"
      + (s.id in t.cols ? t.cols[s.id] : "")
      + "' min='0' max='40' placeholder='—' style='width:4.4em'></label>").join("")
    + "<span class='hint' style='flex:1 0 100%;margin:2px 0 0'>"
    + "空欄にすると、その校時は写さない</span>";
  for(const e of $("tyCols").querySelectorAll("input")) e.oninput = () => {
    if(String(e.value).trim() === "") delete t.cols[e.dataset.s];
    else t.cols[e.dataset.s] = Math.max(0, +e.value || 0);
    markMine("時数_列のずれ");
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
    return who + "│ " + r.map(v => v || "·").join(" ");
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

/* ── 左の並びの「？」 ───────────────────────
   **初めてこの画面を開いた人が、押す前に何が起きるか分かるようにする。**

   はじめに長い説明を読ませない。押す気になったものだけ、その場で読める。
   1つの窓で全部まかなう（項目ごとに窓を作ると、書き方がばらつく）。

   書き方の決まり
     ・1行目で「これは何か」を言い切る
     ・次に「押すと何が起きるか」
     ・専門語を使わない。使うときは、その場で言い換える

   **「はじめの人がつまずくところ」は置かない。** つまずきどころを1つだけ
   書き足すやり方は、結局どの項目も5〜8行に膨らみ、読む前に閉じられた。
   迷う余地を残さない言い方を1〜2行目に詰めるほうが、実際には読まれる。 */
const HELP = {
  week: {t:"週を行き来する・A週B週",
    b:["<b>カレンダーの印では日を選んでその週へ飛びます。</b>",
       "A週・B週は日付から自動で決まります（ここでは切り替えません）。",
       "一番下の欄で、見るクラス・学年・専科を選びます。"]},
  now: {t:"今：◯◯",
    b:["<b>押すと、いま開いているものへ戻ります。</b>"]},
  print: {t:"印刷（B5）",
    b:["<b>刷られるのは白い紙の部分だけで、</b>まわりのボタン類は入りません。"]},
  tally2: {t:"時数を集計する",
    b:["<b>今開いているクラスの授業を教科ごとに数え、「時数集計」シートに置きます。</b>",
       "まだ書いていない日は基本時間割どおりとして数えます。",
       "学年の面から入れるとその学年の全クラスを数えます。"
       + "置いたものは、押すたびにそのクラスの行だけ作り直します。"
       + "年度の後半は読む週が増えるので、月末・学期末に1回押す使い方です。"]},
  tally: {t:"時数をコピー",
    b:["<b>今の1週間を、Excel の時数集計表に貼れる形でコピーします。</b>"]},
  newyear: {t:"新年度設定",
    b:["<b>年度の初めの作業を順に並べた画面です。</b>",
       "元に戻せない操作は ⚠ が付いた1つだけで、押す前に必ず確認が入ります。"]},
  tanpopo: {t:"たんぽぽ",
    b:["<b>組の並びや人数は右上の「組分けを直す」で変えます</b>（年度の初めと転入出のときだけ）。",
       "クラスの「済／未」は、その担任が「たんぽぽに提出」を押したかどうかです。<b>チップを押すと、そのクラスの面を開きます。</b>",
       "書き入れると「◯月◯週」のシートができます。同じ名前があれば名前を変えて残します。"]},
  specials: {t:"専科の枠",
    b:["<b>1行が1人ぶんです。</b>同じ教科を学年で分けても構いません（理科3・4年と理科5・6年 など）。",
       "担当学年に合うコマだけがその人の週に出ます。空欄なら全学年です。",
       "書き方は 3,4 でも 3〜6 でも通ります。"]},
  free: {t:"空き枠あり/なし表示",
    b:["<b>全校・学年枠</b>＝動かせない予定（全校・学年の予定・校外・授業なし）に印を付けます。",
       "<b>全校・学年・他専科枠</b>＝それに、他の専科と避ける教科を足します。",
       "色ではなく斜線と記号（△ ×）で分けます。"]},
  spmonth: {t:"専科の月予定を組む",
    b:["<b>「組む」を押すまで、そして「入れる」を押すまで、週案には何も書きません。</b>",
       "各専科の持ちコマ数は基本時間割から数えます。",
       "<b>絶対に守るもの</b>：全校・学年の予定があるコマ、休み・校外・授業なしのコマ、"
       + "同じ時刻への重複には置きません。",
       "希望にチェックを入れると、どうしても無理なときだけ破ります（破った数は出ます）。"
       + "日付を押すと「その日は避ける」のチェックも入ります。",
       "<b>採用</b>＝ふつうのコマとして入ります。<b>仮採用</b>＝薄い仮のコマとして入り、"
       + "本物の予定が来ると引っ込みます。",
       "基本から動いたコマは元の場所に字が残ります。窓の下の一覧を担任へ渡してください。"]},
  dayform: {t:"この週の日の形",
    b:["<b>全学年の面からだけ直せます。</b>",
       "特別校時＝朝学習の行が消えて、下が上へ詰まります。",
       "休み＝1〜6校時に斜め線。中身は消えず、戻せばそのまま出ます。"]},
  gradeview: {t:"学年でならべる",
    b:["<b>合同体育や専科の巡りがそろっているか分かります。</b>",
       "ここは見るだけで、直すのは週の紙で。"]},
  cal: {t:"カレンダー（2ヶ月・A4横）",
    b:["<b>左が教科の1文字、右が書き込み欄</b>（専科の面では左に行き先のクラス名）。",
       "上位から降りたコマは左端に線が付きます（全校＝青・学年＝橙・専科＝茶）。",
       "「備考：空欄／出す」で右の欄を切り替えます。月の下の数字はその月のコマ数です。"]},
  renraku: {t:"連絡帳用（A4横）",
    b:["<b>右から 日付曜日・つぎの日の時間割・宿題・持ち物。</b>宿題と持ち物は窓の中で書きます。",
       "「漢字（かな）」と書くと、かながルビになります。",
       "印刷・画像・Google Slide から選べます。"]},
  pals: {t:"教科・行事",
    b:["<b>コマへ引っぱって入れます。</b>コマを選んでから押しても入ります。",
       "チップを押すと持ち上がり、その教科だけが目立ち、押したコマに続けて入ります"
       + "（同じチップをもう一度押すか Esc で手放します）。",
       "校外行事＝薄い「校外学習」が出ます。授業なし＝斜め線が引かれます。",
       "リセット＝そのコマのこの面からの予定を消します（学年・全学年の面だけ）。",
       "専科の面では、行き先のクラスを選びます。",
       "教科の色はこの下で切り替えます（切り替えられるのはクラスの面だけです）。"
       + "1文字の字は「時数名」で決め直せます。",
       "見出し右の「時数」スイッチで、題名の右の小さい時数欄をまとめて出せます"
       + "（消しても集計は変わりません。印刷にも効きます。既定は消しています）。"]},
  trip: {t:"この校外行事の名前",
    b:["<b>続けて置いた1本ぶんに同じ字が入ります。</b>紙では12文字まで、たんぽぽでは2文字までです。"]},
  events: {t:"この日の行事",
    b:["<b>年間行事計画表から読んだ、その日の行事です。</b>",
       "コマを選んでから押すと入ります。何校時に入れるかは、押す人が決めます。"]},
  links: {t:"リンク",
    b:["<b>文字を選んでから下のボタンを押します。</b>画面ではその文字を押すと開きます。"]},
  pall: {t:"5日とも同じにする",
    b:["<b>朝学習・業間・昼休みの行にだけ出ます。</b>",
       "上書きになる日は先に聞きます。休み・ロック中の日には書きません。"]},
  fontsize: {t:"フォントサイズ",
    b:["<b>設定の「印刷と文字」と同じものです。</b>"]},
  tally3: {t:"時数",
    b:["<b>書いていない日は基本時間割どおりとして数えます。</b>",
       "朝学習は3回ぶんで1コマとして数えます。",
       "数えるのは題名の右の小さい欄（時数欄）の字です。図書の「と」は国語に、"
       + "教科に載っていないものは「特」に入ります。欄の字は直せます。",
       "「年度始めから読み直す」で、確かな数に直せます。"]},
  tallyCol: {t:"題名の右の小さい欄（時数欄）",
    b:["<b>時数表・集計に出る1文字です。</b>教科は自動で出ます。",
       "直した字がそのまま集計の列になります。",
       "教科に載っていないもの（行事名など）には「特」が入ります。"]},
  imptally: {t:"時数表から取り込む",
    b:["<b>時数表の1週ぶんを、今のクラスの週案に入れます。</b>",
       "表の左上のマスを選んで貼ると、1回で入ります。",
       "入るのは、表に載っている学年の各クラスの行・この週だけ・変えた欄だけです。",
       "入れる前に一覧で確認できます。「／」は授業なしになります。"]},
  impev: {t:"年間行事からコマを作る",
    b:["<b>「連携シートを開く」で専用シートを開き、行事計画をそのまま貼ります。</b>",
       "「連携シートから読む」で読み取り、入れない行のチェックを外して「入れる」を押します。",
       "校時・対象は字から読みます（4h→4校時、AM→1〜4校時、12時台下校→5・6校時授業なし、"
       + "2-6年→2〜6年）。読めない行は飛ばします。"]},
  month: {t:"月で見る（B4）",
    b:["<b>ここは見るだけです。直すのは週の紙で。</b>"]},
  base: {t:"基本時間割",
    b:["<b>直すと、まだ書いていない週の見え方が変わります</b>（書いた予定は変わりません）。",
       "<b>「今週以降のみ変更」（既定）</b>は、開いている週から先だけが変わります。"
       + "<b>「今年度全体を変更」</b>は、過ぎた週の紙と時数も変わります。",
       "提出ずみの週で、たんぽぽへ渡る字が変わったら「未」に戻ります。",
       "A週・B週の2種類を持てます。表ごと貼って取り込めます。"]},
  roster: {t:"学級編成",
    b:["<b>ここで決めたものが入口の表になります。</b>"]},
  paper: {t:"用紙・印刷",
    b:["<b>画面の大きさもここで変えられます。</b>"]},
  legend: {t:"紙の上の見え方",
    b:["<b>コマの地の色が、その予定がどこから来たかを表します。</b>",
       "上位から降りてきた＝学年・全学年で入れた予定。2つ以上入っている＝重なり"
       + "（後から書かれたほうが出ます）。基本時間割のまま＝まだ直していないコマ。",
       "誰が入れたかは、コマを押すと右側に字で出ます。"]},
  admin: {t:"管理・システム",
    b:["<b>不具合の連絡には、この窓の下の1行をそのまま伝えてください。</b>",
       "新年度の準備・前の年度の保管もここから開きます。"]}
};

/* 「？」を差し込む。**1か所でまとめて付ける。**
   項目ごとに HTML へ書くと、足した項目で付け忘れる。 */
function wireHelp(){
  for(const e of document.querySelectorAll("[data-help]")){
    if(e.querySelector(":scope > .helpq")) continue;
    const k = e.dataset.help;
    if(!HELP[k]) continue;
    const q = el("button", "helpq", "？");
    q.type = "button";
    q.title = HELP[k].t + " の説明";
    q.setAttribute("aria-label", HELP[k].t + " の説明を開く");
    /* **親のボタンを押したことにしない。** ？を押して画面が切り替わると、
       読もうとしただけの人が、開く気のない週案を開いてしまう */
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

/* 案内は「使い方」を押したときだけ開く。自動では開かない（→ main.js start）。
   画面切替・通信・データ編集を一切行わない。失敗しても起動を止めない。 */
function openGuide(){
  try{
    const d = $('guideDlg');
    if(d && !d.open) d.showModal();
  }catch(e){ console.warn('案内を開けませんでした', e); }
}


