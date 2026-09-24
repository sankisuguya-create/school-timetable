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

/* ── 基本時間割（A週・B週） ─────────────────────
   ここに入れたものが、週案を開いた時点で全部のコマに出る。
   担任は毎週30コマ埋めるのではなく、変えたところだけ直す。 */

let baseVar = "A";

function openSettings(){
  $("settingsFy").textContent = fy() + "年度";
  $("setPaperNow").textContent = db.settings.paper + "・タイトル"
    + (+db.settings.titlePt || 16) + "pt・詳細" + (+db.settings.notePt || 12) + "pt";
  $("settingsDlg").showModal();
}

/* 「教務必携用（B5）」。**印刷・画像・Sheet は窓を挟まない。**
   4週・学年・カレンダーと同じく、紙のとなりの帯（#weekBar）から直に押す。
   ここでは週の紙そのものへ戻るだけでよい。 */
function openWeekView(){
  if(view.kind === "gate" || view.kind === "tanpopo") return toast("先に週案を開いてください");
  if(centerOk()) setCenter("week");
}

function planValues(mon){
  const keep = monday; monday = mon;
  try{
    const out = [[viewName(), md(mon) + " → " + md(addDays(mon, 4))]
      .concat(DOW.slice(0, WEEKDAYS))];
    for(const s of SLOTS){
      const row = [s.name, s.time || ""];
      for(let d=0; d<WEEKDAYS; d++){
        const c = cellFor(d, s.id), title = plain(c.title || ""), note = plain(c.note || "");
        row.push(title + (note ? "\n" + note : ""));
      }
      out.push(row);
    }
    return out;
  } finally { monday = keep; }
}
function planParts(start, count){
  const out = [];
  for(let i=0; i<count; i++){
    const mon = addDays(start, i*7);
    out.push({name:(mon.getMonth()+1) + "月" + Math.ceil(mon.getDate()/7) + "週", values:planValues(mon)});
  }
  return out;
}
function downloadBlob(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* 紙面をそのままPNGへする。外部サービスへ週案を送らない。 */
async function nodePngBlob(node){
  /* **縮めて見せている紙は、元の大きさで測る。** 画面に合わせる zoom は
     .paper に掛かっていて、getBoundingClientRect は縮んだ大きさを返す。
     一方、画像の中の紙は zoom を引き継がず元の大きさで組まれる ──
     幅が足りず右が見切れる（実測：教務必携用を狭い窓で画像に出すと、
     右の列が途中で切れた）。測るあいだだけ zoom を 1 に戻す。 */
  const pa = node.closest(".paper"), z = pa && pa.style.zoom;
  if(pa && z) pa.style.zoom = 1;
  const r = node.getBoundingClientRect();
  if(pa && z) pa.style.zoom = z;
  /* **見えていない面は画像にできない。** 隠れた要素は幅も高さも 0 になり、
     0×0 の canvas は toBlob が null を返す ── これをそのまま downloadBlob へ
     渡すと "createObjectURL: Overload resolution failed" という、原因の
     分からない失敗になる（実測：中央のかたちを切り替えたまま「教務必携用」の
     画像を押むと、ここで空の PNG を作ろうとしていた）。
     ここで止めて、分かる理由を返す。 */
  if(r.width < 1 || r.height < 1)
    throw new Error("今見えていない面は画像にできない。その面を開いてから押す");
  const css = [...document.styleSheets].map(s => {
    try{return [...s.cssRules].map(x => x.cssText).join("\n");}catch(_){return "";}
  }).join("\n");
  const xml = new XMLSerializer().serializeToString(node.cloneNode(true));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xml}</div></foreignObject></svg>`;
  /* Blob URL の SVG は Chrome で canvas を汚染し、PNG にできない。data URL なら同一生成元として描画できる。 */
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image(); await new Promise((ok, ng) => { img.onload=ok; img.onerror=ng; img.src=url; });
  const scale=2, cv=document.createElement("canvas"); cv.width=Math.ceil(r.width*scale); cv.height=Math.ceil(r.height*scale);
  const cx=cv.getContext("2d"); cx.scale(scale,scale); cx.fillStyle="#fff"; cx.fillRect(0,0,r.width,r.height); cx.drawImage(img,0,0);
  return await new Promise(ok => cv.toBlob(ok,"image/png"));
}
async function nodePng(node, name){
  downloadBlob(await nodePngBlob(node), name);
}
/* 別窓・別タブに結果を出すときの共通の窓。
   **窓は押した瞬間に開く** ── 生成を待ってから開くと、クリックから遅れた
   window.open をブラウザがポップアップとして弾く。先に開いておき、
   中身ができたら中を差し替える（location を移す）。
   窓が弾かれたときは null で返るので、呼び元はその場合だけ従来どおりの
   報せ（リンクや保存）に退ける。 */
function openOutWindow(kind){
  const w = window.open("", "_blank");
  if(w){
    w.document.write("<body style='font-family:sans-serif;color:#666;padding:2em'>"
      + (kind || "作っています") + "…</body>");
    w.document.close();
  }
  return w;
}
const outputName = suffix => viewName().replace(/[^\w\-ぁ-んァ-ヶ一-龠]/g,"_") + "_" + iso(monday) + "_" + suffix;
/* 別窓が開けなかったときの退避（ポップアップをブロックされたとき）。
   帯に字を書くと版面がずれるので、いつもの確認窓にリンクだけを出す ──
   自分で閉じるまで残る。トーストは数秒で消えるのでリンクには向かない */
function showOutLink(title, url, label){
  askOk({title:title,
    lines:["<a target='_blank' rel='noopener' href='" + escText(url) + "'>" + escText(label) + "</a>"],
    noLabel:"閉じる", goLabel:"開く", onYes(){ window.open(url, "_blank"); }});
}
function exportWeekSheet(){
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("週案"), planParts(monday,1), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "Google Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
function exportMonthSheet(){
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("4週"), planParts(mMonday,4), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "4週のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
/* カレンダーの面。**見えている2ヶ月を、週ごとの週案で出す。**
   カレンダー形の表は Sheet では潰れる（1コマ数行を2ヶ月分並べられない）ので、
   範囲内の週案を1週1シートで出す ── 中身は週案と同じ、枚数だけ違う */
function exportCalSheet(){
  if(!calFrom) return toast("先に2ヶ月の面を開いてください");
  const start = mondayOf(calFrom);
  const lastM = new Date(calFrom.getFullYear(), calFrom.getMonth() + CAL_MONTHS, 0);
  const count = Math.ceil((addDays(lastM, 1) - start) / (7 * 864e5));
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(outputName("2ヶ月"), planParts(start, count), r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, "2ヶ月のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}
/* 学年の面。**開いている学年のクラスぶんを、クラスごとに1シートずつ。**
   planValues が読む「いまの面」をクラスに差し替えて組み立て、終わったら戻す */
function exportGradeSheet(){
  const list = gClasses();
  if(!list.length) return toast("この学年にクラスがありません");
  const keep = view, sheets = [];
  try{
    for(const c of list){
      view = {kind:"class", cls:c};
      sheets.push({name:c, values:planValues(monday)});
    }
  }finally{ view = keep; }
  /* 名づけに outputName は使わない ── 先頭に「いま開いている面の名前」が
     入るので、学年のまとめが「1-1 の学年ごと」になってしまう */
  const w = openOutWindow("Google Sheetを作っています");
  Backend.exportPlanSheet(escText(gGrade) + "年_学年ごと_" + iso(monday), sheets, r => {
    if(w){ w.location.href = r.url; return; }
    showOutLink("Sheetを作りました", r.url, gGrade + "年のGoogle Sheetを開く");
  }, why => { if(w) w.close(); toast(escText(why)); });
}

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
        ? "<select class='basesub' data-subject='" + escText(v.subject || "") + "' data-k='" + ck(d, s.id) + "'><option value=''>—</option>"
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
    e.dataset.subject = s ? s.code : "";
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
  $("impStat").textContent = "シートを読んで入る…";
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
        + "</b><br>そのまま題名としている。教科として数えたいときは、"
        + "「教科」シートに足してから読み直す。</div>");
    if(miss.length)
      boxes.push("<div class='box'><b>" + miss.map(escText).join("・")
        + "</b> は<b>今の学級編成に無い</b>ので入れない。"
        + "編成が古いなら「学級編成」で直してから読み直す。</div>");
    if(none.length)
      boxes.push("<div class='box'><b>" + none.map(escText).join("・")
        + "</b> は表に無かった。<b>今の基本時間割のまま</b>にする。</div>");
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
  askOk({
    title: fy() + "年度の基本時間割を、読んだ表で入れ替えますか",
    lines: [
      "入れ替えるのは <b>" + known.length + " クラス</b>（"
        + escText(known.join("、")) + "）。<b>A週とB週の両方</b>が入れ替わります。",
      "<b>今入っている基本時間割は消えます。</b>"
        + "戻すには、もとの表をもう一度読ませることになります。",
      "週案に手で書いたものは消えません。"],
    goLabel: "入れ替える",
    onYes: () => {
      const done = applyFixed(impRes);
      toast("基本時間割に入れた（<b>" + done.length + " クラス</b>）");
      $("impDlg").close();
      if($("baseDlg").open) drawBaseGrid();
      refreshWeek();
    }
  });
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
    + "<span class='splab'>" + escText(spLabel(sp)) + "</span>"
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
        title: (t ? spLabel(t) : "この枠") + " を消しますか",
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
  for(const raw of String(text).split(/[,、\s]+/)){
    const n = normCls(raw);
    if(!n || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  const gone = (dr.classes[g] || []).filter(c => out.indexOf(c) < 0 && hasAnyData(c));
  const go = () => {
    dr.classes[g] = out;
    rsDirty = true; drawRoster();
  };
  if(!gone.length) return go();
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
        const sub = countSub(compose(list[r], d, s.id));
        line[t.cols[s.id]] = sub ? sub.short : "";
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
     ・専門語を使わない。使うときは、その場で言い換える

   **「はじめの人がつまずくところ」は置かない。** つまずきどころを1つだけ
   書き足すやり方は、結局どの項目も5〜8行に膨らみ、読む前に閉じられた。
   迷う余地を残さない言い方を1〜2行目に詰めるほうが、実際には読まれる。 */
const HELP = {
  week: {t:"週を行き来する・A週B週",
    b:["<b>カレンダーの印では日を選んでその週へ飛びます。</b>",
       "A週・B週は日付から自動で決まるので、ふだんは押しません。",
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
       "クラスの「済／未」は、その担任が「たんぽぽに提出」を押したかどうかです。",
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
       + "1文字の字は「時数名」で決め直せます。"]},
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
       "「年度始めから読み直す」で、確かな数に直せます。"]},
  imptally: {t:"時数表からインポート",
    b:["<b>時数表の1週ぶんを、今のクラスの週案に入れます。</b>",
       "表の左上のマスを選んで貼ると、1回で入ります。",
       "入るのは、今のクラスの行だけ・この週だけ・変えた欄だけです。",
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

/* 案内は画面切替・通信・データ編集を一切行わない。失敗しても起動を止めない。 */
const GUIDE_KEY = 'school-timetable/guide-v2';
function openGuide(automatic){
  try{
    if(automatic && localStorage.getItem(GUIDE_KEY) === 'done') return;
    if(automatic && document.querySelector('dialog[open]')) return;
    const d = $('guideDlg');
    if(d && !d.open) d.showModal();
  }catch(e){ console.warn('案内を開けませんでした', e); }
}
function finishGuide(){
  try{ localStorage.setItem(GUIDE_KEY, 'done'); }catch(_){}
}


/* ── 新年度の設定 ────────────────────────────
   **4月に開いたとき、何を、どの順でやるかを1画面で出す。**

   検査（checkYear）は「足りないもの」を名指しするが、順序を持たない。
   年度初めにやることは順序が要る ── 前年度を消す前に複製する、
   クラスを直す前に基本時間割を入れても意味が無い。ここは手順の側。

   **判定はサーバが持つ。** 画面が判定すると、判定が2か所に分かれて、
   片方だけ直したときに画面と検査が食い違う。 */
let nySt = null;

/* 未了かどうかだけを、静かにみに行く。**立ち上がりで1回。**
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
    : nySt.done ? fy() + "年度は、全部済んでいます"
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
  admin:   {label:"年度の退避を開く", go: () => { $("nyDlg").close(); openAdminDlg(); }},
  roster:  {label:"学級編成を開く",   go: () => { $("nyDlg").close(); openRosterDlg(); }},
  base:    {label:"基本時間割を開く", go: () => { $("nyDlg").close(); openBaseDlg(); }},
  tanpopo: {label:"たんぽぽを開く",   go: () => { $("nyDlg").close(); openView({kind:"tanpopo"}); }},
  ab:      {label:"A週の起点を直す",   go: () => openAbDlg()},
  events:  {label:"行事表を貼り替える", go: () => openEventsDlg()},
  plan:    {label:"週案シートを作る",   go: () => makePlanSheets()}
};
const NY_MARK = {ok:"できている", warn:"見て置く", ng:"これから"};

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
    ? "<b>全部できています。</b>左メニューの知らせは消えます。"
    : "<b>後 " + r.ng + " つです。</b>上から順にやってください。"
      + "全部できるまで、左メニューに出し続けます。";

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
      + "<th>" + (now ? "<i class='nynow'>今ここ</i>" : "") + escText(x.label)
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
  const w = Wait.begin("記録しています", true);
  if(el) el.disabled = true;
  Backend.tickYearSetup(key, on,
    r2 => { Wait.end(w); nySt = r2; drawNewYear(); paintNewYear(); },
    why => { Wait.end(w); if(el){ el.disabled = false; el.checked = !el.checked; } toast(why); });
}

/* 週案シートを作る。**これまではエディタからしか走らせられなかった。**
   手順の最後がエディタ頼みだと、そこで止まる。 */
function makePlanSheets(){
  if(!Wait.guard()) return;
  const w = Wait.begin("週案シートを作っています", true);
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
  $("abNow").textContent = "今は " + now;
  $("abWhy").innerHTML = "";
  $("abDlg").showModal();
}
function saveAb(){
  const v = $("abDate").value;
  const d = parseISO(v);
  if(!d) return void ($("abWhy").innerHTML = "<div class='box'>日付を入れてください</div>");
  if(d.getDay() !== 1) return void ($("abWhy").innerHTML =
    "<div class='box'><b>月曜を入れてください。</b>月曜でない日を入れると、"
    + "以後の週が全て半週ずれます。</div>");
  if(!Wait.guard()) return;
  const w = Wait.begin("起点を入れています", true);
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
    + (rows.length > 12 ? "<p class='hint'>他 " + (rows.length - 12) + " 行</p>" : "");
  $("evGo").disabled = false;
}
function evGo(){
  if(!evRows) return;
  if(!Wait.guard()) return;
  const w = Wait.begin("年間行事計画表を貼り替えています", true);
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
    ["つないで入る先", b.gas ? "スプレッドシート（本番）" : "この端末だけ（手元）"],
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
    rows.push(["その時の量", t.cells + " コマ・" + t.sheets + " シート"]);
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
                          : r.warn ? "見て置組ものが " + r.warn + " 件"
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
  const w = Wait.begin("本体から消しています", true);
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
      + "<br><span class=\"who\">今入っているのは「" + escText(now) + "」"
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
  if(!mine) Backend.dropHeld(list);  /* 最新を採用したときだけ、自分の控えを破棄する。 */
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
      if(!miss) Backend.dropHeld(list);
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
                    short:q.short || "", u:q.u || "",
                    sp:q.sp || "", at:Date.now(), by:myEmail(), sat};
  Backend.cellChanged(c.layer, c.target, h.loc.d, c.slot, sat,
                      {year:h.loc.year, monday:h.loc.monday});
  return true;
}
