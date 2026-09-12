/* 窓（基本時間割・学級編成・用紙・時数コピー・たんぽぽ）。 */

/* ── 基本時間割（A週・B週） ─────────────────────
   ここに入れたものが、週案を開いた時点で全部のコマに出る。
   担任は毎週30コマ埋めるのではなく、変えたところだけ直す。 */

let baseVar = "A";

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
        ? "<select data-k='" + ck(d, s.id) + "'><option value=''>—</option>"
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
  $("baseFy").textContent = fy() + "年度";
}

/* ── 固定時間割の取り込み ─────────────────────
   学校の固定時間割表を、そのままの形で読んで基本時間割にする。
   **読んですぐ入れない。** 何クラス読めたか・読めない字はどれかを先に見せる。
   入れ違いに気づかないまま20クラスぶんを入れ替えると、戻す手立てが無い。 */

let impRes = null;              /* いま読めている表 */
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
      v === "paste"   ? "学校の表を選んで写し、ここに貼る"
    : v === "sheet"   ? "<b>固定時間割取り込み</b>シートに貼ってあるものを読む（本番のみ）"
                      : escText(FIXED_NAME) + " を読む";
  impRes = null;
  drawImp();
}

/* 貼り付けた字を表にする。エクセルから写すと、
   タブ区切りで1行1行が改行になっている。 */
function tsvGrid(text){
  return String(text).replace(/\r/g, "").split("\n").map(line => line.split("\t"));
}

function readImp(){
  if(impSrc === "builtin"){ impRes = fixedBuiltin(); return drawImp(); }
  if(impSrc === "paste"){
    const t = $("impText").value;
    if(!t.trim()){ impRes = {error:"まだ何も貼っていない"}; return drawImp(); }
    impRes = parseFixed(tsvGrid(t));
    return drawImp();
  }
  $("impStat").textContent = "シートを読んでいる…";
  Backend.readPaste(
    g => { impRes = g.length ? parseFixed(g) : {error:"シートが空だった"}; drawImp(); },
    why => { impRes = {error:why}; drawImp(); });
}

function drawImp(){
  const boxes = [], r = impRes;
  const known = r && r.order ? r.order.filter(c => allClasses().indexOf(c) >= 0) : [];
  const miss  = r && r.order ? r.order.filter(c => allClasses().indexOf(c) < 0)  : [];
  const none  = r && r.order ? allClasses().filter(c => r.order.indexOf(c) < 0)   : [];

  if(!r){
    boxes.push("<div class='box ok'>まだ読んでいない。上で選んで「読む」を押す。</div>");
  } else if(r.error){
    boxes.push("<div class='box'><b>読めなかった。</b>" + escText(r.error) + "</div>");
  } else {
    if(r.unknown && r.unknown.length)
      boxes.push("<div class='box'><b>教科として読めない字：" + r.unknown.map(escText).join("・")
        + "</b><br>そのまま題名として入る。教科として数えたいときは、"
        + "「教科」シートに足してから読み直す。</div>");
    if(miss.length)
      boxes.push("<div class='box'><b>" + miss.map(escText).join("・")
        + "</b> は<b>いまの学級編成に無い</b>ので入れない。"
        + "編成が古いなら「学級編成」で直してから読み直す。</div>");
    if(none.length)
      boxes.push("<div class='box'><b>" + none.map(escText).join("・")
        + "</b> は表に無かった。<b>いまの基本時間割のまま</b>にする。</div>");
    for(const n of (r.notes || [])) boxes.push("<div class='box'>" + escText(n) + "</div>");
    if(!boxes.length)
      boxes.push("<div class='box ok'>" + known.length
        + " クラスぶんを読めた。気になるところは無い。</div>");
  }
  $("impWarn").innerHTML = boxes.join("");
  $("impStat").textContent = r && !r.error
    ? (r.name ? r.name + "／" : "") + known.length + " クラス・"
      + (r.periods || 0) + " 校時ぶん"
    : "";
  $("impGo").disabled = !known.length;
  $("impCount").innerHTML = known.length
    ? "<b>" + known.length + " クラス</b>の A週・B週を入れ替える" : "";

  /* 入れる前に、1クラスだけ表のとおりに見せる */
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
        + "<th>" + v + "週</th>"
        + slots.map(s => {
            const e = bank[ck(d, s.id)];
            const same = (got.A || {})[ck(d, s.id)], other = (got.B || {})[ck(d, s.id)];
            const diff = (same ? same.title : "") !== (other ? other.title : "");
            return "<td" + (diff ? " class='diff'" : "") + ">"
                 + (e ? escText(e.title) : "<i>—</i>") + "</td>";
          }).join("") + "</tr>");
    }
  $("impGrid").innerHTML = "<table class='tp imp'>" + head + body.join("") + "</table>";
}

/* 入れる。**いまの基本時間割は消える**ので、そこを先に言う。 */
function goImp(){
  if(!impRes || impRes.error) return;
  const known = impRes.order.filter(c => allClasses().indexOf(c) >= 0);
  if(!known.length) return;
  const yes = confirm(
    fy() + "年度の基本時間割を、読んだ表で入れ替えます。\n\n"
    + "・入れ替えるクラス：" + known.length + "（" + known.join("、") + "）\n"
    + "・A週とB週の両方が入れ替わります\n"
    + "・いま入っている基本時間割は消えます\n\n"
    + "週案に手で書いたものは消えません。つづけますか？");
  if(!yes) return;
  const done = applyFixed(impRes);
  toast("基本時間割に入れた（<b>" + done.length + " クラス</b>）");
  $("impDlg").close();
  if($("baseDlg").open) drawBaseGrid();
  refreshWeek();
}

/* ── 学級編成 ───────────────────────────────────
   本番では「クラス」シートが正本。ここはその写し。
   **年度ごとに持つ。** 直しても前の年度は変わらない。 */

function openRosterDlg(){
  drawRoster();
  $("rosterDlg").showModal();
}
function drawRoster(){
  const Yr = Y();
  $("rsFy").textContent = fy() + "年度";
  $("rsW1").value = Yr.week1 || firstMonday(fy());
  $("rsAbNow").textContent = "いまは " + (db.settings.abAnchor || AB_ANCHOR);
  $("rsSp").value = (Yr.specials || []).map(s => s.label).join(", ");

  $("rsRows").innerHTML = grades().map(g =>
    "<div class='row'><span>" + escText(g) + "年</span>"
    + "<input type='text' data-g='" + escText(g) + "' style='flex:1;min-width:16em' value='"
    + escText((Yr.classes[g] || []).join(", ")) + "'>"
    + "<button class='btn danger' data-del='" + escText(g) + "'>行を消す</button></div>").join("");

  for(const e of $("rsRows").querySelectorAll("input[data-g]"))
    e.onchange = () => setGradeClasses(e.dataset.g, e.value);
  for(const b of $("rsRows").querySelectorAll("button[data-del]"))
    b.onclick = () => {
      const g = b.dataset.del;
      const used = (Y().classes[g] || []).filter(hasAnyData);
      if(used.length && !confirm(g + "年を消します。\n"
        + used.join("・") + " には書き込みが残っています。\n"
        + "消しても中身は残りますが、画面からは開けなくなります。"))
        return;
      delete Y().classes[g];
      save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
    };
}
/* 「1-1, 1-2, 1-3」を配列にする。空と重複は落とす。 */
function setGradeClasses(g, text){
  const seen = {}, out = [];
  for(const raw of String(text).split(/[,、\s]+/)){
    const n = normCls(raw);
    if(!n || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  const gone = (Y().classes[g] || []).filter(c => out.indexOf(c) < 0 && hasAnyData(c));
  if(gone.length && !confirm(gone.join("・") + " を外します。\n"
    + "書き込みは残りますが、画面からは開けなくなります。")) { drawRoster(); return; }
  Y().classes[g] = out;
  save(); Backend.saveRoster(); drawRoster(); afterRosterChange();
}
/* そのクラスに何か入っているか（外す前に知らせるため） */
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
      autoFit();
      toast(md(addDays(monday, dayPick)) + "（" + DOW[dayPick] + "）を<b>"
          + escText(DAY_FORM[b.dataset.f].label) + "</b>にした");
    };
}

/* ── 用紙 ────────────────────────────────────── */

/* 月の面を刷る。**B4 のよこ（364×257mm）に1枚。**
   週の紙とは用紙が違うので、刷る直前に @page を書き替え、
   刷り終わったら元へ戻す（戻さないと、次に週の紙を刷るとき B4 で出る）。 */
function printMonth(){
  const st = $("pagecss");
  const had = st ? st.textContent : "";
  if(st) st.textContent = "@page{size:" + M_PAGE.w + "mm " + M_PAGE.h + "mm;margin:"
                        + M_PAGE.mg + "mm}";
  document.body.classList.add("printing-month");
  /* **紙の大きさで組み直してから刷る。** 画面の広さで合わせた倍率のまま
     刷ると、紙からはみ出すか、すかすかになる */
  fitMonth(mCellMM());
  const back = () => {
    document.body.classList.remove("printing-month");
    if(st) st.textContent = had;
    fitMonth();
  };
  /* 刷り終わり（またはやめた）を拾って戻す。拾えない環境のために保険も置く */
  const once = () => { removeEventListener("afterprint", once); back(); };
  addEventListener("afterprint", once);
  setTimeout(() => { if(document.body.classList.contains("printing-month")) back(); }, 4000);
  window.print();
}

function applyPaper(){
  const s = db.settings, sh = $("sheet");
  const [w, h] = s.paper === "A4" ? ["210mm", "297mm"] : ["182mm", "257mm"];
  sh.style.setProperty("--pw", w);
  sh.style.setProperty("--ph", h);
  sh.style.setProperty("--pm", s.margin + "mm");
  sh.style.setProperty("--k", s.k);
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
        const c = compose(list[r], d, s.id);
        const sub = c.subject ? SUB_BY_CODE[c.subject] : SUB_BY_NAME[plain(c.title).trim()];
        line[t.cols[s.id]] = (sub && sub.count) ? sub.short : "";
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
     ・補足を定型で足さず、本文そのものを短くする
     ・専門語を使わない。使うときは、その場で言い換える */
const HELP = {
  week: {t:"週を行き来する・A週B週",
    b:["<b>いま開いている1週間です。</b>◀ と ▶ で、前後の週へ移れます。",
       "<b>A週 / B週</b> は、2種類ある基本時間割のどちらを使うかを表します。"
       + "日付に合わせて自動で決まるので、いつもはそのままで大丈夫です。",
       "下の欄では、週案を見たいクラス・学年・専科を選べます。"]},
  gate: {t:"ほかの週案をひらく",
    b:["<b>開きたい週案を選ぶ入口です。</b>クラスや学年を押すと、週案が開きます。",
       "開いた場所が、そのまま予定の入る先です。たとえば「3-3」なら3年3組だけ、"
       + "「3年」なら3年の全クラス、「全学年」なら全クラスに入ります。",
       "そのため、書く人を別に選ぶ必要はありません。"]},
  now: {t:"いま：◯◯",
    b:["<b>いま開いている週案の名前です。</b>押すと、その週案へ戻れます。",
       "入口の表を見たあとに、元の週案へ戻りたいときにお使いください。"]},
  print: {t:"印刷（B5）",
    b:["<b>いま見ている1週間を、B5用紙1枚に印刷します。</b>"
       + "教務必携に貼りやすい大きさです。",
       "押すと、ブラウザの印刷画面が開きます。白い紙の内側だけが印刷され、"
       + "周りのボタンや左のメニューは印刷されません。"]},
  tally: {t:"時数をコピー",
    b:["<b>この1週間の授業を、時数集計表へ貼れる形でコピーします。</b>",
       "押したあと、Excelの時数集計表を開いて貼り付けてください。"]},
  newyear: {t:"新年度設定",
    b:["<b>新年度を始めるための準備を、順番に案内します。</b>"
       + "準備が終わるまで、メニューに表示されます。",
       "上から一つずつ進めれば大丈夫です。終わった項目の多くは、"
       + "この画面が自動で確認します。",
       "元に戻せない操作は一つだけです。⚠ の付いた項目では、"
       + "消す前に内容が合っているかを必ず確認します。"]},
  tanpopo: {t:"たんぽぽ",
    b:["<b>たんぽぽ学級へ渡す時間割を作る画面です。</b>左の「たんぽぽの組」が、"
       + "出した時間割の列順になります。",
       "「交流級から入れる」を開き、クラスを組へドラッグするか、押して入れます。"
       + "1回入れると児童1人分です。同じ組へ2回入れると、2人分になります。",
       "クラスに付く「済 / 未」は、担任が「たんぽぽに提出」を押したかどうかです。",
       "「たんぽぽ時間割へ出す」を押すと、「9月1週」のような名前でシートを作ります。"
       + "同じ名前のシートがあっても消さず、名前を変えて残します。"]},
  month: {t:"月で見る（B4）",
    b:["<b>いまの週から4週間分を、2×2に並べて見られます。</b>"
       + "そのままB4横の用紙1枚に印刷できます。",
       "単元の進み方や行事の重なり、専科の巡りをまとめて確認したいときに便利です。",
       "ここは見るための画面です。予定を直すときは、いつもの週案へ戻ってください。"]},
  base: {t:"基本時間割",
    b:["<b>毎週くり返す、もとの時間割です。</b>週案を開いたときに、"
       + "最初から見えている授業を決めます。",
       "ここを直すと、まだ予定を書いていない週に反映されます。"
       + "すでに書いた予定は変わらないので、ご安心ください。",
       "A週とB週の2種類を登録できます。学校の固定時間割表を、"
       + "まとめて貼り付けて取り込むこともできます。"]},
  roster: {t:"学級編成",
    b:["<b>学年とクラスの並び、専科の先生、たんぽぽの交流級を設定します。</b>",
       "ここで設定した内容が、「ほかの週案をひらく」の一覧に反映されます。"]},
  paper: {t:"用紙・印刷",
    b:["<b>印刷する用紙の大きさ・余白・倍率を設定します。</b>",
       "画面上の大きさも、ここで変えられます。画面を拡大しても、"
       + "印刷の大きさは変わりません。別々に調整できます。"]},
  legend: {t:"紙の上の見え方",
    b:["<b>コマの背景は、予定がどこから来たかを表しています。</b>",
       "<b>上位から降りてきた</b>：学年や全学年で入れた予定が、"
       + "このクラスにも表示されています。",
       "<b>2つ以上入っている</b>：同じコマに予定が重なっています。"
       + "画面には、あとから書かれた予定が表示されます。",
       "<b>基本時間割のまま</b>：まだ予定を書き替えていないコマです。",
       "色だけで見分けなくても大丈夫です。コマを押すと、"
       + "誰が入れた予定かを右側で確認できます。"]},
  admin: {t:"管理・システム",
    b:["<b>このサイトの接続先や版を確認する、管理担当向けの画面です。</b>"
       + "担任が日々使う操作はありません。",
       "不具合を伝えるときは、窓の下にある1行をそのままお知らせください。"
       + "状況を確認しやすくなります。",
       "新年度の準備や、前年度データの保管もここから始められます。"]}
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
    q.setAttribute("aria-label", HELP[k].t + " の説明をひらく");
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

/* ── 初めて開いた人への案内 ───────────────────
   左メニューを一周してから 1-1 を開き、入力パネルへ進む。
   長い説明を先に読ませず、いま見る場所だけを1〜2行で伝える。 */
const TOUR_KEY = "school-timetable/tour-v1";
const TOUR_STEPS = [
  [".side .wk", "週を選ぶ", "矢印で週を移動できます。見る週案も、下の欄で選べます。"],
  [".nav[data-act='gate']", "週案を開く", "クラス・学年・専科から、書きたい週案を開きます。"],
  [".nav[data-act='print']", "印刷する", "いまの週案を、教務必携に貼りやすいB5で印刷します。"],
  [".nav[data-act='tally']", "時数をコピー", "この週の授業を、Excelへ貼れる形でコピーします。"],
  [".nav[data-act='month']", "4週を見渡す", "4週間分を並べて確認し、B4横1枚に印刷できます。"],
  [".nav[data-act='base']", "基本時間割", "毎週くり返す、もとの時間割を設定します。"],
  [".nav[data-act='roster']", "学級編成", "クラスの並びや、専科・たんぽぽの交流級を設定します。"],
  [".nav[data-act='paper']", "用紙・印刷", "印刷の大きさや余白と、画面の表示倍率を調整します。"],
  [".legend", "色と印の意味", "予定がどこから来たか、重なっているかを見分けられます。"],
  [".admin", "管理・システム", "新年度の準備や接続先の確認など、管理担当が使う場所です。"],
  [".phead", "1年1組を開きました", "ここからは、右側の「時間割の入力」を見ていきます。", "panel"],
  [".phead .pbtns", "ロックと保存", "見るだけならロックできます。変更内容は自動で保存されます。"],
  ["#pals", "教科・行事", "紙のコマを選び、ここから教科や行事を入れます。"],
  ["#pTitleWrap", "教科名・行事名", "選んだコマの名前を、直接入力して直すこともできます。"],
  ["#pNoteWrap", "詳細・備考", "持ち物や場所など、授業名に添える内容を書けます。"],
  ["#pAddLink", "リンク", "文字を選んでから押すと、資料へのリンクを付けられます。"],
  ["#pScopeWrap", "入れる先", "予定を、このクラスだけに入れるかどうかを選べます。"],
  ["#hasSel .row-btn", "取り消しとまとめ入力", "空に戻したり、同じ予定を5日分まとめて入れたりできます。"]
];
let tourAt = 0, tourStarted = false, tourPanelReady = false;

function tourSeen(){
  try{ return localStorage.getItem(TOUR_KEY) === "done"; }catch(_){ return true; }
}
function finishTour(){
  $("tour").hidden = true;
  document.removeEventListener("keydown", tourKey);
  try{ localStorage.setItem(TOUR_KEY, "done"); }catch(_){}
}
function tourKey(ev){
  if(ev.key === "Escape") finishTour();
  if(ev.key === "Enter" && !ev.target.closest("button")) nextTour();
}
function prepareTourPanel(done){
  const cls = allClasses().indexOf("1-1") >= 0 ? "1-1" : allClasses()[0];
  if(!cls){ finishTour(); return; }
  openView({kind:"class", cls});
  setTimeout(() => {
    const slot = SLOTS.find(s => s.kind === "lesson");
    if(slot) selectCell(0, slot.id, cellAt(0, slot.id));
    tourPanelReady = true;
    done();
  }, 250);
}
function positionTour(target){
  target.scrollIntoView({block:"center", inline:"nearest"});
  requestAnimationFrame(() => {
    const r = target.getBoundingClientRect(), pad = 5;
    const f = $("tourFocus"), bubble = $("tourBubble");
    f.style.left = Math.max(2, r.left - pad) + "px";
    f.style.top = Math.max(2, r.top - pad) + "px";
    f.style.width = Math.max(1, r.width + pad * 2) + "px";
    f.style.height = Math.max(1, r.height + pad * 2) + "px";
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight, gap = 17;
    let side, left, top;
    if(r.right + gap + bw <= innerWidth){
      side = "right"; left = r.right + gap; top = r.top;
    }else if(r.left - gap - bw >= 0){
      side = "left"; left = r.left - gap - bw; top = r.top;
    }else{
      side = "bottom"; left = r.left; top = r.bottom + gap;
    }
    bubble.dataset.side = side;
    bubble.style.left = Math.max(14, Math.min(left, innerWidth - bw - 14)) + "px";
    bubble.style.top = Math.max(14, Math.min(top, innerHeight - bh - 14)) + "px";
  });
}
function showTourStep(){
  if(tourAt >= TOUR_STEPS.length) return finishTour();
  const step = TOUR_STEPS[tourAt];
  if(step[3] === "panel" && !tourPanelReady)
    return prepareTourPanel(showTourStep);
  const target = document.querySelector(step[0]);
  if(!target || target.hidden || !target.getClientRects().length){
    tourAt++; return showTourStep();
  }
  $("tourStep").textContent = (tourAt + 1) + " / " + TOUR_STEPS.length;
  $("tourTitle").textContent = step[1];
  $("tourText").textContent = step[2];
  $("tourNext").textContent = tourAt === TOUR_STEPS.length - 1 ? "わかった" : "次へ";
  positionTour(target);
  $("tourNext").focus();
}
function nextTour(){ tourAt++; showTourStep(); }
function startFirstTour(force){
  if(tourStarted || (!force && tourSeen())) return;
  tourStarted = true;
  $("tour").hidden = false;
  $("tourNext").onclick = nextTour;
  $("tourSkip").onclick = finishTour;
  $("tourBubble").onclick = ev => {
    if(!ev.target.closest("button")) nextTour();
  };
  document.addEventListener("keydown", tourKey);
  addEventListener("resize", () => {
    if(!$("tour").hidden) showTourStep();
  });
  showTourStep();
}

/* ── 新年度の設定 ────────────────────────────
   **4月に開いたとき、何を、どの順でやるかを1画面で出す。**

   検査（checkYear）は「足りないもの」を名指しするが、順序を持たない。
   年度初めにやることは順序が要る ── 前年度を消す前に複製する、
   クラスを直す前に基本時間割を入れても意味が無い。ここは手順の側。

   **判定はサーバが持つ。** 画面が判定すると、判定が2か所に分かれて、
   片方だけ直したときに画面と検査が食い違う。 */
let nySt = null;

/* 未了かどうかだけを、静かに見に行く。**立ち上がりで1回。**
   左メニューに出すかどうかがこれで決まる（4/1 から、済むまで出す）。 */
function pollNewYear(){
  if(!Backend.isGas()) return;
  Backend.yearSetup(r => { nySt = r; paintNewYear(); }, () => {});
}
function paintNewYear(){
  const b = $("navNewYear");
  /* off ＝ この画面を使い始める前の年度。**知らせを出さない。**
     いまさら「未了」と出しても、やることは無いのに橙色だけが消えない */
  if(b) b.hidden = !(nySt && !nySt.done && !nySt.off);
  const h = $("nyHint");
  if(h) h.textContent = !nySt ? ""
    : nySt.off  ? fy() + "年度は、この画面を使い始める前の年度です"
    : nySt.done ? fy() + "年度は、ぜんぶ済んでいます"
                : "まだ " + nySt.ng + " 件あります";
}

function openNewYearDlg(){
  $("nyYear").textContent = fy() + "年度";
  if(!Backend.isGas()){
    $("nyStat").textContent = "手元では判定できない（シートを見ないと分からない）";
    $("nyOut").innerHTML = "";
    $("nyDlg").showModal();
    return;
  }
  $("nyStat").textContent = "読んでいます…";
  $("nyOut").innerHTML = "";
  $("nyDlg").showModal();
  loadNewYear();
}
function loadNewYear(){
  Backend.yearSetup(r => { nySt = r; drawNewYear(); paintNewYear(); },
                    why => { $("nyStat").textContent = why; });
}

/* 押す先。**画面のどの窓を開くか。** 閉じて開き直させない
   （閉じると、どこまでやったか分からなくなる） */
const NY_ACT = {
  admin:   {label:"年度の退避をひらく", go: () => { $("nyDlg").close(); openAdminDlg(); }},
  roster:  {label:"学級編成をひらく",   go: () => { $("nyDlg").close(); openRosterDlg(); }},
  base:    {label:"基本時間割をひらく", go: () => { $("nyDlg").close(); openBaseDlg(); }},
  tanpopo: {label:"たんぽぽをひらく",   go: () => { $("nyDlg").close(); openView({kind:"tanpopo"}); }},
  ab:      {label:"A週の起点を直す",   go: () => openAbDlg()},
  events:  {label:"行事表を貼り替える", go: () => openEventsDlg()},
  plan:    {label:"週案シートを作る",   go: () => makePlanSheets()}
};
const NY_MARK = {ok:"できている", warn:"見ておく", ng:"これから"};

/* **手順は、次の一手を1つだけ大きく出す。**
   年度初めにこれをやるのは、たいてい今年その学校へ来た人。
   12件を並べて「どれからでもどうぞ」と出すと、どこから手を付けるかで
   まず止まる。上から順に、いま押すものだけを開いておく。 */
function drawNewYear(){
  const r = nySt;
  $("nyStat").innerHTML = r.off
    ? "<b>" + r.year + "年度は、この画面を使い始める前の年度です。</b>"
      + "知らせは出しません（" + r.from + "年度から出します）。下は参考です。"
    : r.done
    ? "<b>ぜんぶできています。</b>左メニューの知らせは消えます。"
    : "<b>あと " + r.ng + " つです。</b>上から順にやってください。"
      + "ぜんぶできるまで、左メニューに出し続けます。";

  const box = [];
  /* いま押す1件を、いちばん上に大きく出す */
  const nx = r.off ? null : r.items.filter(x => x.key === r.next)[0];
  if(nx){
    const act = NY_ACT[nx.act];
    box.push("<div class='nynext'>"
      + "<div class='nynhd'>つぎにやること</div>"
      + "<div class='nynttl'>" + escText(nx.label) + "</div>"
      + "<p class='nynwhy'>" + escText(nx.why) + "</p>"
      + (nx.detail ? "<p class='nyndet'>" + escText(nx.detail) + "</p>" : "")
      + (nx.fix ? "<p class='nynfix'><b>やり方：</b>" + escText(nx.fix) + "</p>" : "")
      + "<p class='nynundo'>" + nyUndo(nx.undo) + "</p>"
      + "<div class='nynact'>"
      + (nx.hand
         ? "<button class='btn go nyntick' data-k='" + escText(nx.key) + "'>"
           + "できたので、済にする</button>"
         : "")
      + (act ? "<button class='btn" + (nx.hand ? "" : " go") + " nygo' data-a='"
             + escText(nx.act) + "'>" + escText(act.label) + "</button>" : "")
      + "<span class='nynmin'>目安 " + nx.mins + " 分</span>"
      + "</div></div>");
  }

  /* 残りは表で。**済んだものは畳んでおく。** 見るものを減らす */
  let group = "";
  const rows = [];
  for(const x of r.items){
    if(x.group !== group){
      group = x.group;
      rows.push("<tr class='nygrp'><th colspan='4'>" + escText(group)
        + (x.wait ? "<i>" + escText(x.wait) + "が済んでからです</i>" : "")
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
         : "<span class='nyauto'>" + (x.level === "ok" ? "✓" : x.level === "warn" ? "△" : "—")
           + "</span>")
      + "</td>"
      + "<th>" + (now ? "<i class='nynow'>いまここ</i>" : "") + escText(x.label)
      + (x.hand ? "<i class='nyhand'>自分で確かめて押す</i>" : "")
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
/* 戻せるか。**戻せないものだけ、赤で名指しする。** */
function nyUndo(s){
  const no = String(s).indexOf("元に戻せません") >= 0;
  return "<b class='" + (no ? "nyno" : "nyyes") + "'>"
       + (no ? "⚠ 元に戻せない" : "◯ 元に戻せる") + "</b>"
       + escText(String(s).replace(/\*\*/g, ""));
}
function nyTick(key, on, el){
  const w = Wait.begin("記録しています");
  if(el) el.disabled = true;
  Backend.tickYearSetup(key, on,
    r2 => { Wait.end(w); nySt = r2; drawNewYear(); paintNewYear(); },
    why => { Wait.end(w); if(el){ el.disabled = false; el.checked = !el.checked; } toast(why); });
}

/* 週案シートを作る。**これまではエディタからしか走らせられなかった。**
   手順の最後がエディタ頼みだと、そこで止まる。 */
function makePlanSheets(){
  if(!Wait.guard()) return;
  const w = Wait.begin("週案シートを作っています");
  Backend.setupPlanSheets(r => {
    Wait.end(w);
    toast("週案シートを " + ((r && r.made && r.made.length) || 0) + " 枚作った");
    loadNewYear();
  }, why => { Wait.end(w); toast(why); });
}

/* ── A週の起点の月曜 ─────────────────────────
   **設定シートのこの1行だけを画面から直す。** 画面から設定を全部いじれる
   ようにすると、関門の例外リストまで画面から書けることになる。 */
function openAbDlg(){
  const now = db.settings.abAnchor || AB_ANCHOR;
  $("abDate").value = now;
  $("abNow").textContent = "いまは " + now;
  $("abWhy").innerHTML = "";
  $("abDlg").showModal();
}
function saveAb(){
  const v = $("abDate").value;
  const d = parseISO(v);
  if(!d) return void ($("abWhy").innerHTML = "<div class='box'>日付を入れてください</div>");
  if(d.getDay() !== 1) return void ($("abWhy").innerHTML =
    "<div class='box'><b>月曜を入れてください。</b>月曜でない日を入れると、"
    + "以後の週がすべて半週ずれます。</div>");
  if(!Wait.guard()) return;
  const w = Wait.begin("起点を入れています");
  Backend.saveVariantOrigin(v, () => {
    Wait.end(w); $("abDlg").close();
    refreshWeek();
    toast("A週の起点を " + v + " にした");
    if($("nyDlg").open) loadNewYear(); else pollNewYear();
  }, why => { Wait.end(w); $("abWhy").innerHTML = "<div class='box'>" + escText(why) + "</div>"; });
}

/* ── 年間行事計画表を貼り替える ───────────────── */
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
/* 貼られた字を表に直す。**タブ区切り。** Excel もスプレッドシートもこれで出る */
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
      "<div class='box'><b>見出しと、少なくとも1行が要ります。</b>"
      + "見出しの行ごとコピーして貼ってください。</div>");
  const head = rows[0].map(x => String(x).replace(/[\s　]/g, ""));
  if(!head.some(x => x.indexOf("日付") >= 0))
    return void ($("evWarn").innerHTML =
      "<div class='box'><b>「日付」の列が見つかりません。</b>"
      + "見出しは 日付／週／行事計画（児童）／行事計画（職員）の4つです。</div>");
  evRows = rows;
  $("evWarn").innerHTML = "";
  $("evStat").textContent = (rows.length - 1) + " 行を読んだ";
  $("evGrid").innerHTML = "<table class='tp'>"
    + rows.slice(0, 12).map((r, i) => "<tr>"
        + r.map(c => "<" + (i ? "td" : "th") + ">" + escText(c)
                   + "</" + (i ? "td" : "th") + ">").join("") + "</tr>").join("")
    + "</table>"
    + (rows.length > 12 ? "<p class='hint'>ほか " + (rows.length - 12) + " 行</p>" : "");
  $("evGo").disabled = false;
}
function evGo(){
  if(!evRows) return;
  if(!Wait.guard()) return;
  const w = Wait.begin("年間行事計画表を貼り替えています");
  Backend.saveEvents(evRows, r => {
    Wait.end(w);
    $("evDlg").close();
    toast("年間行事計画表を貼り替えた（" + r.rows + " 行）"
        + (r.kept ? "　前の中身は「" + r.kept + "」に残してある" : ""));
    /* 貼り替えたら、その年度をもう一度読む。**画面の行事も入れ替わる** */
    location.reload();
  }, why => { Wait.end(w); $("evWarn").innerHTML = "<div class='box'>" + escText(why) + "</div>"; });
}

/* ── 管理・システム ──────────────────────────
   **担任の操作をここに増やさない。** 増やすと、担任が「自分の操作が
   どこにあるか」を毎回2か所から選ぶことになる。ここは
   「いまどの版が、どのファイルにつないで動いているか」を見るところ。 */
function openAdminDlg(){
  const b = Backend.info();
  const weeks = Object.keys(db.years).reduce(
    (n, y) => n + Object.keys(db.years[y].weeks || {}).length, 0);
  const rows = [
    ["版",         APP_VERSION],
    ["版の日付",   BUILD_DATE || "（無し）"],
    ["つないでいる先", b.gas ? "スプレッドシート（本番）" : "この端末だけ（手元）"],
    ["ファイル",   b.file || (b.gas ? "（読めていない）" : "—")],
    ["自分",       b.me   || "—"],
    ["開いている年度", fy() + "年度"],
    ["この端末に残っている週", weeks + " 週（" + KEEP_WEEKS + " 週を超えたら古い順に捨てる）"],
    ["まだ送っていないコマ", Backend.unsaved() + " コマ"]
  ];
  /* **保存にかかった時間。いちばん遅かったぶんを出す。**
     平均は、たまに出る遅さを隠す。困るのは「たまに10秒待つ」ほう。
     ここが 2 秒を超えたら、シートを年度で分ける手を打つ（docs/spec.md 13-2）。 */
  const t = b.times;
  if(t){
    rows.push(["保存（直近" + t.n + "回で最も遅かったもの）",
               (t.round / 1000).toFixed(1) + " 秒"
               + "　内わけ：待ち " + (t.wait / 1000).toFixed(1) + " 秒"
               + "／書き込み " + (t.ms / 1000).toFixed(1) + " 秒"]);
    rows.push(["そのときの量", t.cells + " コマ・" + t.sheets + " シート"]);
    if(t.round >= 2000)
      rows.push(["めやす", "2 秒を超えている。docs/spec.md 13-2 の手順を見る"]);
  }else if(b.gas){
    rows.push(["保存の時間", "まだ1回も保存していない"]);
  }
  $("sysTbl").innerHTML = rows
    .map(r => "<tr><th>" + r[0] + "</th><td>" + escText(String(r[1])) + "</td></tr>").join("");
  $("sysLine").textContent =
    "週案 " + APP_VERSION + "（" + (BUILD_DATE || "日付なし") + "）／"
    + (b.gas ? "本番" : "手元") + "／" + fy() + "年度";
  $("ckOut").innerHTML = "";
  drawArchive();
  $("ckStat").textContent = b.gas ? "" : "手元では検査できない（シートを読まないと分からない）";
  $("ckGo").disabled = !b.gas;
  $("adminDlg").showModal();
}

/* 検査の結果。**直さない。名指しするだけ。**
   直すところまで自動でやると、直した中身が誰にも見えないまま year が進む。 */
const CK_MARK = {ng:"要る", warn:"見る", ok:"よい"};
function drawCheck(r){
  $("ckStat").textContent = r.ng ? "足りないものが " + r.ng + " 件ある"
                          : r.warn ? "見ておくものが " + r.warn + " 件"
                                   : "そろっている";
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
  $("ckStat").textContent = "検査しています…";
  const w = Wait.begin("この年度を検査しています");
  Backend.checkYear(
    r => { Wait.end(w); $("ckGo").disabled = false; drawCheck(r); },
    why => { Wait.end(w); $("ckGo").disabled = false; $("ckStat").textContent = why; });
}

/* ── 年度の退避 ──────────────────────────────
   **年度末に、人がドライブでファイルを丸ごと複製する。**
   画面は数える・照合する・消すの3つだけ。複製をコードで書かないので、
   コピー漏れが原理的に起きない。本体のURLは変わらない。

   段ごとに別のボタンにしてある。**1つにまとめない。**
   まとめると、確かめずに消せてしまう。 */
let arChecked = null;          /* 照合の通った {year, url}。ここが埋まるまで消させない */

function drawArchive(){
  const b = Backend.info();
  $("arYear").value = fy() - 1;             /* 既定は「1つ前の年度」 */
  $("arYear").disabled = !b.gas;
  $("arCount").disabled = !b.gas;
  $("arStat").textContent = b.gas ? "" : "手元では退避できない";
  $("arOut").innerHTML = "";
  $("arStep2").hidden = true;
  $("arStep4").hidden = true;
  $("arWhy").textContent = "";
  arChecked = null;
}
function arYear(){ return +$("arYear").value || fy() - 1; }

/* ① 数える */
function arRunCount(){
  if(!Wait.guard()) return;
  const y = arYear();
  $("arStat").textContent = "数えています…";
  $("arStep2").hidden = true; $("arStep4").hidden = true; arChecked = null;
  const w = Wait.begin(y + "年度を数えています");
  Backend.archiveCount(y, r => {
    Wait.end(w);
    const done = r.done;
    $("arStat").textContent = done ? y + "年度は退避ずみ" : "";
    $("arOut").innerHTML =
      "<table class=\"sys\">"
      + "<tr><th>年度</th><td>" + r.year + "年度</td></tr>"
      + "<tr><th>週案の行</th><td>" + r.rows + " 行（" + r.sheets.length + " シート）</td></tr>"
      + "<tr><th>入っているコマ</th><td>" + r.cells + " コマ</td></tr>"
      + "<tr><th>日付の範囲</th><td>" + (r.from ? escText(r.from) + " 〜 " + escText(r.to) : "—")
      + "</td></tr>"
      + (r.sheets.length
         ? "<tr><th>内わけ</th><td>" + r.sheets.map(s =>
             escText(s.name) + " " + s.rows + "行").join("　") + "</td></tr>" : "")
      + (done ? "<tr><th>退避ずみ</th><td>" + escText(done.at) + "　"
                + escText(whoName(done.by)) + "</td></tr>" : "")
      + "</table>";
    if(!r.rows){
      $("arStat").textContent = y + "年度の週案は1行もない。退避するものがない";
      return;
    }
    $("arFile").textContent = r.file;
    $("arName").textContent = "週案 保存 " + r.year + "年度";
    $("arStep2").hidden = false;
  }, why => { Wait.end(w); $("arStat").textContent = why; });
}

/* ③ 照合する。**ここが通るまで、消すボタンは出さない。** */
function arRunVerify(){
  if(!Wait.guard()) return;
  const y = arYear(), url = $("arUrl").value.trim();
  if(!url) return void ($("arWhy").textContent = "退避先のURLを貼る");
  $("arWhy").textContent = "照合しています…";
  $("arStep4").hidden = true; arChecked = null;
  const w = Wait.begin("退避先と照合しています");
  Backend.archiveVerify(y, url, r => {
    Wait.end(w);
    if(!r.ok){
      $("arWhy").innerHTML = "<b>合っていない。消せません。</b><ul>"
        + r.why.map(w => "<li>" + escText(w) + "</li>").join("") + "</ul>";
      return;
    }
    arChecked = {year:y, url};
    $("arWhy").innerHTML = "<b>合っている。</b>"
      + escText(r.there.file) + " に " + r.there.rows + " 行そろっている。";
    $("arTyped").value = "";
    $("arGo").disabled = true;
    $("arStep4").hidden = false;
  }, why => { Wait.end(w); $("arWhy").textContent = why; });
}

/* ④ 消す。年度を打ち込ませる。**誤クリックで消えない。** */
function arRunPurge(){
  if(!Wait.guard()) return;
  if(!arChecked) return;
  const typed = $("arTyped").value.trim();
  $("arGo").disabled = true;
  $("arWhy").textContent = "消しています…";
  const w = Wait.begin("本体から消しています");
  Backend.archivePurge(arChecked.year, arChecked.url, typed, r => {
    Wait.end(w);
    $("arWhy").innerHTML = "<b>" + r.year + "年度を退避した。</b>"
      + r.rows + " 行（" + r.cells + " コマ・" + r.sheets + " シート）を本体から消した。"
      + "中身は保管庫に残っている。";
    $("arStep4").hidden = true;
    arChecked = null;
    paintArchive();
    toast(r.year + "年度を退避した。本体のURLは変わっていない");
  }, why => {
    Wait.end(w);
    $("arWhy").innerHTML = "<b>消さなかった。</b><br>" + escText(why).replace(/\n/g, "<br>");
    $("arGo").disabled = false;
  });
}

/* 退避ずみの年度を開いているあいだ、紙の上に出しておく知らせ。
   **これが無いと、基本時間割だけの紙を見て「週案が全部消えた」と言われる。** */
function paintArchive(){
  const bar = $("arcBar");
  if(!bar) return;
  const a = Backend.archivedYear ? Backend.archivedYear(fy()) : null;
  if(!a || view.kind === "gate" || view.kind === "tanpopo"){ bar.hidden = true; return; }
  bar.hidden = false;
  $("arcTitle").textContent = fy() + "年度は退避ずみです";
  $("arcNote").textContent =
    "この年度の週案は保管庫に移してあります。ここに出ているのは基本時間割です。"
    + (a.at ? "（" + a.at + "　" + whoName(a.by) + "）" : "");
  const link = $("arcLink");
  if(a.url){ link.href = a.url; link.hidden = false; }
  else link.hidden = true;
}

/* ── 保存の競合 ──────────────────────────────
   自分が画面を開いたあとに、別の人が同じコマを直していた。
   そのまま送ると、その人の書いたものが**書いた本人にも見えないまま**消える。
   サーバはコマ単位で止めて conflicts で返す（→ gas/Store.gs writeCells）。

   **既定は「最新の内容を見る」。** Esc も、外側を押したときも、
   返事をしないまま消えたときも同じ。上書きは、そう答えたときだけ。

   ソフトロック窓（swDlg「ほかの人が入れた予定です」）とは別の窓にする。
   あちらは**見えている予定**を潰すときの確認で、こちらは
   **見えていない変更**を潰すときの確認。原因が違うので1つにできない。
   だから、上書きを選んだときは、週を読み直してから改めてあちらを通す。 */

let cfAsk = null;

function cfWhen(h){
  const dt = parseISO(h.c.date), sl = SLOT_BY_ID[h.c.slot];
  if(!dt) return String(h.c.date);
  return md(dt) + "(" + (DOW[(dt.getDay() + 6) % 7] || "") + ") "
       + (sl ? sl.name + (sl.kind === "lesson" ? "校時" : "") : h.c.slot);
}
function cfWho(h){
  const t = h.c.target || "";
  return h.c.layer === "school" ? "学校全体"
       : h.c.layer === "grade"  ? t + "年"
       : h.c.layer === "special"? t + "（専科）" : t;
}

function showConflicts(list){
  if(!list || !list.length) return;
  cfAsk = list;
  $("cfList").innerHTML = list.map(h => {
    const mine = !h.q ? "（分からない）"
               : h.q.remove ? "（消す）" : (plain(h.q.title) || "（空）");
    const now  = plain(h.c.currentTitle) || "（空）";
    return "<li><b>" + escText(cfWhen(h)) + "</b>　" + escText(cfWho(h))
      + "<br>あなたが入れようとしたもの：「" + escText(mine) + "」"
      + "<br><span class=\"who\">いま入っているのは「" + escText(now) + "」"
      + (h.c.currentBy ? "・" + escText(whoName(h.c.currentBy)) + " が入れたもの" : "")
      + "</span></li>";
  }).join("");
  $("cfDlg").showModal();
  $("cfSee").focus();               /* **既定は「最新の内容を見る」。** */
}

/* 窓の返事を1回だけ流す。閉じ方（ボタン・Esc・外側）で取りこぼさない */
function cfAnswer(mine){
  const list = cfAsk;
  cfAsk = null;
  if(!list) return;
  Backend.dropHeld();               /* 控えはここで引き取る。二重に出さない */
  setBusy(true, "最新の内容を読んでいます");
  Backend.reloadWeek(list, () => {
    setBusy(false);
    refreshWeek();
    if(!mine) return toast("<b>最新の内容にした</b>　入れ直すときは、もう一度打つ");
    applyHeld(list);
  });
}

/* 「それでも自分の内容で上書きする」と答えたぶんを入れ直す。
   **読み直したあとに入れ直す。** 読み直す前に送ると、
   見ていない変更をもう一度潰しにいくことになる。 */
function applyHeld(list){
  let i = 0, put = 0, miss = 0;
  const next = () => {
    if(i >= list.length){
      save(); refreshWeek();
      if(miss) toast("<b>" + miss + " コマは入れ直せなかった</b>　その週を開いて打ち直す");
      if(put) doSave(true); else if(!miss) toast("入れ直さなかった");
      return;
    }
    const h = list[i++];
    if(!h.q){ miss++; return next(); }        /* 送った中身が分からない */
    /* いま開いている週・いま書いている先のコマだけ、ソフトロック窓を通す。
       ほかの週のコマは、その週を出していないので窓に出しても読めない。 */
    if(!cfInView(h)){ if(restoreConflicted(h)) put++; else miss++; return next(); }
    forgetAsked(h.loc.d, h.c.slot);           /* 前の答えは別の中身への答え */
    okToOverwrite(h.loc.d, h.c.slot, h.q.remove ? "" : plain(h.q.title),
                  () => { if(restoreConflicted(h)) put++; else miss++; next(); },
                  () => next());
  };
  next();
}

const cfInView = h =>
  String(h.loc.year) === String(fy()) && h.loc.monday === wkKey()
  && h.c.layer === layerOfStore() && (h.c.target || "") === (targetOfStore() || "");

/* 送ろうとした中身を、その週の控えへ戻す。
   物差し（sat）は**サーバがいま持っている時刻**にする。
   ここを元の値のままにすると、送り直してもまた競合する。 */
function restoreConflicted(h){
  const q = h.q, c = h.c;
  const Yr = db.years[String(h.loc.year)];
  const wk = Yr && Yr.weeks && Yr.weeks[h.loc.monday];
  if(!wk) return false;                      /* その週の控えがもう無い */
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
