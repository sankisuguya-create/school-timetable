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
  const width = Math.max.apply(null, Object.keys(t.cols).map(k => t.cols[k])) + 1;
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
  $("tyCols").innerHTML = "<span>列のずれ</span>" + SLOTS.filter(s => s.id in t.cols)
    .map(s => "<label style='font-size:12px;color:var(--tx-sub)'>" + (s.tally || s.name)
      + " <input type='number' data-s='" + s.id + "' value='" + t.cols[s.id]
      + "' min='0' max='40' style='width:4.4em'></label>").join("");
  for(const e of $("tyCols").querySelectorAll("input")) e.oninput = () => {
    t.cols[e.dataset.s] = +e.value || 0; save(); drawTallyPreview();
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
  $("ckGo").disabled = true;
  $("ckStat").textContent = "検査しています…";
  Backend.checkYear(
    r => { $("ckGo").disabled = false; drawCheck(r); },
    why => { $("ckGo").disabled = false; $("ckStat").textContent = why; });
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
  const y = arYear();
  $("arStat").textContent = "数えています…";
  $("arStep2").hidden = true; $("arStep4").hidden = true; arChecked = null;
  Backend.archiveCount(y, r => {
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
  }, why => { $("arStat").textContent = why; });
}

/* ③ 照合する。**ここが通るまで、消すボタンは出さない。** */
function arRunVerify(){
  const y = arYear(), url = $("arUrl").value.trim();
  if(!url) return void ($("arWhy").textContent = "退避先のURLを貼る");
  $("arWhy").textContent = "照合しています…";
  $("arStep4").hidden = true; arChecked = null;
  Backend.archiveVerify(y, url, r => {
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
  }, why => { $("arWhy").textContent = why; });
}

/* ④ 消す。年度を打ち込ませる。**誤クリックで消えない。** */
function arRunPurge(){
  if(!arChecked) return;
  const typed = $("arTyped").value.trim();
  $("arGo").disabled = true;
  $("arWhy").textContent = "消しています…";
  Backend.archivePurge(arChecked.year, arChecked.url, typed, r => {
    $("arWhy").innerHTML = "<b>" + r.year + "年度を退避した。</b>"
      + r.rows + " 行（" + r.cells + " コマ・" + r.sheets + " シート）を本体から消した。"
      + "中身は保管庫に残っている。";
    $("arStep4").hidden = true;
    arChecked = null;
    paintArchive();
    toast(r.year + "年度を退避した。本体のURLは変わっていない");
  }, why => {
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
