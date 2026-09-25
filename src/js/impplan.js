/* ── 表からコマを取り込む（時数表・年間行事計画表）────────────

   どちらも同じ運び方にしてある。

     ① サイトが**雛形を出す**（いまの中身が入った状態で）
     ② それをスプレッドシートへ貼り、手元の表から中身を貼り替える
     ③ 校時や対象など、足りない列だけ手で埋める（微修正）
     ④ 丸ごとコピーして、ここへ貼って取り込む

   *雛形を出す理由*：列の並びと意味を、こちらが決めて渡す。
   先生の手元の表は学校ごと・学年ごとに形が違うので、
   「その形を読む」側に回ると、形の数だけ読み方が要る。
   **こちらの形に合わせてもらうほうが、直すところが1か所で済む。**

   *いまの中身を入れて出す理由*：空の雛形だと、埋まっているべき欄が
   分からない。既に入っているものが見えていれば、**変えるところだけ**
   直せばよく、間違えても「元と違う」ことに気づける。

   取り込む先は2つで別々。
     時数表       → **いま開いているクラス**の、その週（担任の層）
     年間行事計画表 → **全校・学年**（雛形の「対象」列で決める）
*/

/* 表の1マスを、比べられる字にする。全角・空白・記号のゆれを吸収する */
function impNorm(v){
  return String(v == null ? "" : v).normalize("NFKC").replace(/[\s　]+/g, "").trim();
}
/* 貼られた字を表に直す。**タブ区切り**（Excel もスプレッドシートもこれで出る）。
   **途中の空行は残す** ── 表では「何行目か」が意味を持つので、空の行を
   捨てると、そのあとの行が全部ずれる（時数表で、その日に何も入っていない
   クラスの行が消えて木曜以降がずれる、という形で出た）。
   終わりの空行だけは捨てる（貼った字の終わりの改行が、空の1行に見えることがある） */
function impSplit(text){
  const ls = String(text || "").replace(/\r/g, "").split("\n");
  while(ls.length && ls[ls.length-1].trim() === "") ls.pop();
  return ls.map(ln => ln.split("\t"));
}
/* 1文字（または教科名）から教科を引く。**時数表に入っている字を正本にする。**
   時数表は1文字で書く決まりなので、まず1文字で引き、見つからなければ名前で引く
   （先生が雛形の上で「算数」と書き直すことがある）。 */
function impSubject(v){
  const s = impNorm(v);
  if(!s) return null;
  for(const sub of SUBJECTS) if(sub.short && sub.short === s) return sub;
  if(SUB_BY_NAME[s]) return SUB_BY_NAME[s];
  for(const sub of SUBJECTS) if(impNorm(sub.name) === s) return sub;
  return null;
}

/* ══ ① 時数表 → いま開いているクラスの週案 ══════════════

   **並びは「時数をコピー」と同じ矩形**にしてある（dialogs.js tallyGrid）。
   手元の時数集計表からその週の塊をそのままコピーして、窓の表へ1回で
   貼れるようにするため ── 形が違うと、貼る前に並べ替える手間が入る。

     行 … 月〜金 × 1日あたりの行数（設定の「1日の行数」）。
          先頭から順にクラス（設定の「クラスの並び」）。
     列 … 設定の「列のずれ」に従う。校時ごとに何列目かが決まっている。

   **取り込むのは、いま開いているクラスの行だけ。** ほかのクラスの行は
   貼ったまま置いておける（消させない ── 消させると、次に貼るとき
   また塊ごと持ってくることになる）。 */

/* ══ 窓 ══════════════════════════════════════════════ */

let impPlanKind = "tally", impPlanRows = null;

function openImpPlan(kind){
  impPlanKind = kind;
  impPlanRows = null;
  const tally = kind === "tally";
  if(tally && view.kind !== "class")
    return toast("時数表は<b>クラスを開いてから</b>取り込む");
  $("ipTtl").textContent = tally ? "時数表から取り込む" : "年間行事計画表からコマを作る";
  $("ipLead").innerHTML = tally
    ? "<b>今開いている「" + escText(viewName()) + "」の学年の<b>各クラス</b>へ、この週に入ります。</b>"
      + "下の表は<b>時数表と同じ、1日ぶんにこの学年のクラスが上から並んだ形</b>です。"
      + "手元の時数集計表からその週の塊をコピーして、"
      + "<b>左上のマスを選んでそのまま貼る</b>と、クラスごとの行が1回で入ります。"
      + "入るのはふだんの書き込みと同じ未保存の形です（あとの保存で届きます）。"
      + "マスを直に打ち直しても構いません。"
    : "<b>全校・学年の層に入ります。</b>"
      + "行事計画は<b>連携シートに貼ってから読みます</b>"
      + "（「連携シートを開く」で出てくるシートに表を貼って、"
      + "「連携シートから読む」を押す）。"
      + "「3h」「34h」「AM」「特4h」「12時台／13:40下校」「2-6年」の字を拾って、"
      + "校時と対象に直します。";
  /* 時数表はマス目の表、年間行事は字の欄。**運び方は同じでも、形が違う。**
     時数表は矩形なので、表のほうが貼りやすい（列のずれを目で合わせられる）。
     年間行事は1行1件で、行を足し引きするので、字の欄のほうが直しやすい */
  $("ipTableWrap").hidden = !tally;
  $("ipSheetRow").hidden  = tally;   /* 連携シートは行事計画だけの口 */
  $("ipTplRow").hidden    = !tally;   /* 雛形の出し方は連携シートに統合 */
  $("ipRead").hidden      = !tally;   /* 「読む」は時数表（マス目）だけの口 */
  $("ipTpl").textContent  = tally ? "今の週案を表に入れる" : "雛形を出す（コピー）";
  $("ipStat").textContent = "";
  $("ipWarn").innerHTML = "";
  $("ipGrid").innerHTML = "";
  $("ipGo").disabled = true;
  $("ipGo").textContent = tally ? "学年の各クラスに入れる" : "全校・学年に入れる";
  if(tally){
    /* **1日ぶんの行の数** ── 学年の表で結合の行数が違うので、窓の中で選べる。
       既定はその学年のクラス数（日付セルはクラスのぶんだけ縦につながるのが普通）。
       手で変えたぶんは学年ごとに覚える */
    const g = gradeOf(view.cls), st = db.settings.tally.impBlock || {};
    $("ipBlock").value = Math.min(7, Math.max(1,
      +st[g] || classesOfGrade(g).length || 3));
    $("ipBlock").onchange = () => {
      const t = db.settings.tally;
      (t.impBlock || (t.impBlock = {}))[g] =
        Math.min(7, Math.max(1, +$("ipBlock").value || 3));
      markMine("時数_行の数"); save();
      /* 入れてある字は残す ── 行の組み方（どの行がどの日か）だけが変わる */
      const vals = {};
      for(const e of $("ipTable").querySelectorAll("input"))
        vals[e.dataset.n + "|" + e.dataset.c] = e.value;
      impTallyTable(impTallyTemplate());
      for(const e of $("ipTable").querySelectorAll("input")){
        const v = vals[e.dataset.n + "|" + e.dataset.c];
        if(v != null) e.value = v;
      }
      /* **変えたぶんでもう一度読み直す。** 行の数が足りない警告が残ったままだと、
         増やしたのにまだ止まっているように見える */
      impPlanRead();
    };
    impTallyTable(impTallyTemplate());
  }
  $("impPlanDlg").showModal();
}

function impPlanTemplate(){
  /* 「今の週案を表に入れる」は時数表だけの口
     （行事の雛形の出し方は連携シートに統合した） */
  impTallyTable(impTallyTemplate());
  $("ipStat").textContent = "今の週案を表に入れた";
}

/* 取り込まない行。**確認表の先頭のチェックを外した行は入れない。**
   読み直すたびに空に戻す（同じ表を読み直しても、外した覚えは残さない） */
let impSkip = new Set();

/* 確認表の数字とボタンを、チェックの状態に合わせる */
function impPlanCount_(){
  const total = (impPlanRows || []).length, n = total - impSkip.size;
  $("ipStat").textContent = n + " 件を入れます"
    + (impSkip.size ? "（" + impSkip.size + " 件は入れません）" : "");
  $("ipGo").disabled = !n;
}

function impPlanRead(text){
  /* **学年の各クラスの週が要る。** 他クラスの行を読むので、
     まだ読んでいないクラスぶんは先に読んでから照合する */
  if(impPlanKind === "tally")
    return impTallyEnsureGrade_(() => impPlanRead_(text));
  impPlanRead_(text);
}
function impPlanRead_(text){
  let r;
  if(impPlanKind === "tally") r = impTallyRead(impTallyGrid());
  else{
    r = impEvRead(text);
    /* **雛形の形で貼っていなければ、行事計画の書き方として読む。**
       貼る手間は、雛形に直させるより、そのまま読むほうが軽い */
    if(!r.rows || !r.rows.length){
      const alt = impDocRead(text);
      if(alt.rows && alt.rows.length) r = alt;
      else if(!r.rows) r = {rows:[], warn:(r.warn || "")
        + (alt.warn ? "<br>" + alt.warn : "")};
    }
  }
  impPlanRows = null; impSkip = new Set();
  $("ipGrid").innerHTML = "";
  $("ipGo").disabled = true;
  $("ipWarn").innerHTML = r.warn ? "<div class='box'>" + r.warn + "</div>" : "";
  if(!r.rows) return void ($("ipStat").textContent = "");
  impPlanRows = r.rows;
  impPlanCount_();
  /* **入れる前に、入るものをぜんぶ見せる。** 貼った表そのままではなく、
     「どの日の何校時に、何が入るか」に直して出す ── 読み違えはここで分かる。
     件数が多くても表ごとスクロールして全部見える。
     先頭のチェックを外すと、その行は入れない（迷う行をあとから残せる） */
  const head = impPlanKind === "tally" ? ["クラス", "曜日", "校時", "入るもの"]
                                       : ["日付", "校時", "対象", "行事名"];
  const line = x => impPlanKind === "tally"
    ? [x.cls, DOW[x.d], (SLOT_BY_ID[x.slot] || {}).name || x.slot, x.mark]
    : [iso(x.dt), (SLOT_BY_ID[x.slot] || {}).name || x.slot,
       x.to.layer === "school" ? "全校" : x.to.target + "年", x.title];
  $("ipGrid").innerHTML = "<table class='tp'><tr><th title='入れるかどうか'>入</th>"
    + head.map(h => "<th>" + escText(h) + "</th>").join("") + "</tr>"
    + r.rows.map((x, i) => "<tr>"
        + "<td class='ck'><input type='checkbox' data-i='" + i + "' checked"
        + " aria-label='この行を入れる'></td>"
        + line(x).map(c => "<td>" + escText(c) + "</td>").join("") + "</tr>").join("")
    + "</table>";
  /* チェックの付け外しを1か所で受ける（行ごとに付けない） */
  $("ipGrid").onchange = ev => {
    const cb = ev.target.closest("input[data-i]");
    if(!cb) return;
    const i = +cb.dataset.i;
    if(cb.checked) impSkip.delete(i); else impSkip.add(i);
    cb.closest("tr").classList.toggle("skip", !cb.checked);
    impPlanCount_();
  };
}

function impPlanGo(){
  /* チェックを外した行を除いたぶんだけ入れる */
  const rows = (impPlanRows || []).filter((x, i) => !impSkip.has(i));
  if(!rows.length) return;
  if(typeof isLocked === "function" && isLocked())
    return toast("この面はロックしてある。<b>直すには、上のロックを押す</b>");
  const done = r => {
    $("impPlanDlg").close();
    toast("<b>" + r.n + "件</b>を入れた"
        + (r.skip ? "（" + r.skip + "件は入れられなかった）" : "")
        + (impSkip.size ? "（" + impSkip.size + "件は除いた）" : ""));
    if(typeof redrawCenter === "function") redrawCenter(true);
  };
  if(impPlanKind === "tally")
    return impTallyEnsureGrade_(() => done(impTallyApply(rows)));
  /* 全校・学年は、ほかの先生の紙にも出る。**押す前に、範囲を言う** */
  askOk({
    title: rows.length + "件を全校・学年に入れますか",
    lines: ["<b>ここで入れたものは、当たるクラス全部の紙に出ます。</b>",
            "同じ日・同じ校時に予定が入っているコマは、<b>これで上書きされます</b>"
            + "（前のものは、書いた人の画面に「上書きされました」と出ます）。",
            "入る先は、雛形の「対象」列のとおりです。"
            + (impSkip.size ? "<br>チェックを外した " + impSkip.size
                            + " 件は入りません。" : "")],
    goLabel: "入れる",
    onYes: () => impEvApply(rows, done)
  });
}
