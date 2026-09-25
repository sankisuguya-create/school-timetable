/* ==================================================================
   admindlg.js — 管理まわりの窓（新年度・年間行事の貼り替え・年度の退避・保存の競合）

   年度の変わり目の段取りと、管理・システムの設定、保存が競合したときの窓。
================================================================== */

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
  admin:   {label:"過去年度の保管を開く", go: () => { $("nyDlg").close(); openAdminDlg(); }},
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
  $("arStat").textContent = b.gas ? "" : "手元では保管できない";
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
    $("arStat").textContent = done ? y + "年度は保管ずみ" : "";
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
      + (done ? "<tr><th>保管ずみ</th><td>" + escText(done.at) + "　"
                + escText(whoName(done.by)) + "</td></tr>" : "")
      + "</table>";
    if(!r.rows){
      $("arStat").textContent = y + "年度の週案は1行もない。保管するものがない";
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
  if(!url) return void ($("arWhy").textContent = "保管先のURLを貼る");
  $("arWhy").textContent = "照合しています…";
  $("arStep4").hidden = true; arChecked = null;
  const w = Wait.begin("保管先と照合しています");
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
    $("arWhy").innerHTML = "<b>" + r.year + "年度を保管した。</b>"
      + r.rows + " 行（" + r.cells + " コマ・" + r.sheets + " シート）を本体から消した。"
      + "中身は保管庫に残っている。";
    $("arStep4").hidden = true;
    arChecked = null;
    paintArchive();
    toast(r.year + "年度を保管した。本体のURLは変わっていない");
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
  $("arcTitle").textContent = fy() + "年度は保管ずみです";
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
