/* 紙を描く。**ここで作った DOM だけが刷られる。** */

let selCell = null;   /* いま選んでいるコマ {d, s} */
/* いま打ち込んでいる欄。ここだけは塗り直しで上書きしない。
   「フォーカスされている欄は触らない」にすると、パレットやドラッグで値を変えても
   字が変わらず、入れた本人には反映されていないように見える。 */
let typing = null;

/* 行の高さ。**mm で決め打ちする。**
   `auto` にしてコマの高さから決めさせると、日ごとに別の格子（下の dayColEl）を
   敷いたときに、外の格子には高さを決める中身が無くなって行が潰れる。 */
const rowH = s => s.kind === "note"   ? "1fr"
                : s.kind === "lesson" ? "calc((var(--h-title) + var(--h-note))*var(--k))"
                                      : "calc(var(--h-break)*var(--k))";

/* 紙の組み方。**外は「見出し／本体／週メモ」の3行だけ。**
   本体の中は列ごとに別の格子で、そこで初めて時程の行が並ぶ。

   *行をまたぐ形にしなかった理由*：外の格子に11行を並べ、日の列でそれをまたぐと、
   **またいだ中身の高さが、またいだ先の `1fr`（放課後）の行に全部乗る。**
   実際に組んでみたら放課後が 200mm になり、紙が 412mm になった。
   列を1マスにすれば、またぐものが無くなる。

   *列ごとに格子を持たせる理由*：特別校時の日は朝学習の行が無い。
   外の行をずらす形にすると、朝学習の行に授業1コマが落ちてその行が
   6mm から 29mm に膨らみ、**ほかの5日ぶんも巻き添えで崩れる**
   （紙が 239.5mm → 295.2mm になり B5 に入らない。実測）。 */
/* 紙を1枚組む。**どこへ、どの週を、書けるかどうかを渡せる。**
   月の面は同じものを4枚並べるので、組み立てを2つ持たない
   （2つ持つと、片方だけ直した版が出る）。
   渡さなければ、いつもの1枚（#sheet ・いま見ている週・書ける）。

   `ro` を立てると**書ける仕掛けを付けない**。月の面は紙が4枚あるので、
   書けるままにしておくと、打った字が**いま見ている週**に入る
   （打った本人には、見ている紙に入ったように見える）。
   CSS だけで止めると、キーボードの移動で欄に入れてしまう。 */
function buildSheet(into, mon, ro){
  const sh = into || $("sheet");
  /* **いま見ている週を、一時だけ差し替える。** 層の重ね方・行事・メモは
     すべて monday から決まるので、ここを動かせば中身がそろって動く
     （`monday` と同じ流儀で `sheetRO` も待避する） */
  const keepM = monday, keepR = sheetRO;
  if(mon) monday = mon;
  if(ro) sheetRO = true;
  try{ buildSheet_(sh); }
  finally{ monday = keepM; sheetRO = keepR; }
}
function buildSheet_(sh){
  sh.textContent = "";
  sh.classList.toggle("ro", sheetRO);
  const cm = faceChipMode();
  sh.classList.toggle("chips-screen", cm !== "off");
  sh.classList.toggle("chips-output", cm === "output");
  sh.style.gridTemplateRows = "auto 1fr auto";      /* 見出し／本体／週メモ */

  const put = (node, col, row) => {
    node.style.gridColumn = String(col);
    node.style.gridRow = String(row);
    sh.appendChild(node); return node;
  };
  put(el("div", "lab corner"), 1, 1);                       /* 左上の角 */

  for(let d = 0; d < DAYS; d++) put(dayHeadEl(d, d === DAYS - 1 ? " sat lastcol" : ""), 2 + d, 1);

  /* 時程の列。**ここだけは、いつも全部の行を並べる。**
     特別校時の日はこの見出しと合わなくなるが、合わせて行を抜くと
     ほかの5日ぶんが読めなくなる（横に読む紙なので、多数派に合わせる） */
  const labs = put(el("div", "labcol"), 1, 2);
  labs.style.gridTemplateRows = SLOTS.map(rowH).join(" ");
  for(const s of SLOTS){
    /* **時刻（8:45〜9:30）は出さない。** 教務必携そのものに時刻は刷ってあり、
       ここでも出すと同じ情報が2か所に並ぶ。空いた高さは校時の数字へ回す
       （.lab .no）── 紙を離れた位置から読むときに、まず目に入るのはここ */
    const lab = el("div", "lab" + (s.kind === "brk" ? " row-break" : ""),
      s.kind === "lesson" ? "<span class='no'>" + s.name + "</span>"
                          : "<span>" + s.name + "</span>");
    labs.appendChild(lab);
  }

  for(let d = 0; d < DAYS; d++) put(dayColEl(d), 2 + d, 2);

  const foot = put(el("div", "foot",
    "<div class='lab'><span>週の</span><span>メモ</span></div>"
    + "<div class='t'" + (sheetRO ? "" : " contenteditable role='textbox'"
       + " aria-label='週のメモ' aria-multiline='true'") + "></div>"), "1 / 8", 3);
  const ft = foot.querySelector(".t");
  /* **週メモは画面（学級）ごとに持ち、シートへも送る**（compose.js の setMemo）。
     前は週にひとつしか無く、この端末にしか残らなかったので、
     3-1 で書いたメモが 3-2 の紙にも出て、ほかの先生には見えなかった */
  ft.innerHTML = memoOf() || "";
  if(!sheetRO) ft.addEventListener("input", () => {
    if(typeof isLocked === "function" && isLocked()) return;
    setMemo(ft.innerHTML);
  });

  paintSheet(null, sh);
  fitTripMarks(sh);
  if(typeof applyLock === "function") applyLock();
}

/* 日付の見出し。**週の紙と学年の面で同じものを出す。**
   日の形の印（特・休）は紙の上の情報なので刷っても残る。
   年間行事の印は**画面だけ**（どの校時か決まっていないものを版面に居座らせない）。

   日の形を入れる口は、**紙の上には置かない。** 右メニューへ移した
   （index.html の #dayWrap ・ panel.js の drawDayPanel）。
   紙に置いていたころは、押せることに気づかれず
   「休みの日を入れる口が無い」と言われた。押すものは、押すものが並ぶ場所に。 */
function dayHeadEl(d, extra){
  const dt = addDays(monday, d), f = dayForm(d);
  const hd = el("div", "hd" + (extra || ""),
    "<span>" + md(dt) + "</span><span class='dow'>" + DOW[d] + "</span>"
    + (f ? "<span class='mark'>" + DAY_FORM[f].mark + "</span>" : ""));
  hd.dataset.d = d;
  if(hasEvents(d)) hd.classList.add("hasev");
  return hd;
}

/* 1日ぶんの列。**この列だけの行の並びを持つ。**
   特別校時の日は朝学習を抜く。抜いたぶんの 6mm は、いちばん下の
   `1fr`（放課後）が受け取るので、紙の高さは変わらない。 */
function dayColEl(d){
  const f = dayForm(d);
  const shown = SLOTS.filter(s => slotShown(d, s));
  /* 校外行事に覆われている授業コマ。**休みより校外が勝つ。**
     休みで空にするのは「その日は授業が無い」を伝えるためで、行事があるなら
     「無い」は誤り。自然学校のように休日をまたぐ行事がある。
     見出しの「休」印は残す（日の形そのものは変わっていない）。 */
  const trip = {};
  for(const s of shown) if(s.kind === "lesson" && tripHere(d, s.id)) trip[s.id] = true;
  const anyTrip = Object.keys(trip).length > 0;
  const col = el("div", "daycol" + (d === DAYS - 1 ? " lastcol" : "")
                      + (f ? " form-" + f : ""));
  col.dataset.d = d;
  col.style.gridTemplateRows = shown.map(rowH).join(" ");
  /* **1つずつ置く場所を書く。** 下の斜め線が場所を先に取るので、
     自動で並べさせると、そこを避けたぶんだけ行が増える（実際に8行増えた） */
  /* 続けて覆った授業コマを1つのまとまりにする。**間の業間・昼休みもまたぐ。**
     1〜3限が校外なら、そのあいだの業間も校外にいる。またがないと、
     業間のところで透かしが切れて「1・2限」と「3限」の2つに見える。 */
  const runs = [];
  let run = null;
  shown.forEach((s, i) => {
    if(s.kind !== "lesson") return;              /* 休み時間はまとまりを切らない */
    if(trip[s.id]){ if(!run) runs.push(run = {a:i, b:i}); else run.b = i; }
    else run = null;
  });
  /* まとまりの中（端も含む）に入っている行 */
  const inRun = i => runs.some(r => i >= r.a && i <= r.b);

  shown.forEach((s, i) => {
    const c = cellEl(d, s);
    c.style.gridColumn = "1";
    c.style.gridRow = String(i + 1);
    /* **コマの枠はそのまま。** 校時の横線を消すと、どの校時のことか紙から
       読めなくなる。縦につながって見えるのは、右に立てるチップのほう */
    if(inRun(i)) c.classList.add("trip");
    col.appendChild(c);
  });

  /* まとまりごとに、チップを1本。**その日の右端に立てる。**
     半透明なので、下に書いてある予定（社会・理科）はそのまま読める。
     下の欄は触れる（pointer-events:none）。 */
  for(const r of runs){
    /* **1文字ずつ積む。** writing-mode の縦書きに頼ると、字を送るのに
       フォント側の縦組みの情報が要る。無い環境では4文字が同じ場所に重なって、
       小さな黒い塊になった（実測）。字を1つずつ並べれば、どのフォントでも同じに出る */
    /* 字は**行事ごと**（右メニューで直せる。既定は「校外学習」） */
    const ov = el("div", "tripmark", "<span>"
      + [...tripName(d, shown[r.a].id)].map(c => "<i>" + escText(c) + "</i>").join("")
      + "</span>");
    ov.style.gridColumn = "1";
    ov.style.gridRow = (r.a + 1) + " / " + (r.b + 2);
    col.appendChild(ov);
  }

  /* **休みの日は 1〜6 を1本の斜め線で消す。**
     コマごとに引くと、業間と昼休みの行で線が切れて「1〜4だけ休み」に見える。
     線は図形で描く（背景の色は、トナーを節約する設定のプリンタで消える）。 */
  /* **校外が覆っている日は、斜め線を引かない。** 授業が無いのではなく行事がある */
  if(f === "off" && !anyTrip){
    let a = -1, b = -1;
    shown.forEach((s, i) => { if(s.kind === "lesson"){ if(a < 0) a = i; b = i; } });
    if(a >= 0){
      const ov = el("div", "dayoff", SLASH_SVG);
      ov.style.gridColumn = "1";
      ov.style.gridRow = (a + 1) + " / " + (b + 2);
      col.appendChild(ov);
    }
  }
  return col;
}

function cellEl(d, s){
  /* lesson は題名＋備考、note は**備考だけ**（放課後）、brk は題名だけ */
  const kls = s.kind === "lesson" ? "lesson" : s.kind === "note" ? "note row-break"
                                             : "brk row-break";
  const ce = sheetRO ? "" : " contenteditable role='textbox'";
  const e = el("div", "cell " + kls,
    "<span class='tag' hidden></span>"
    + (s.kind === "note" ? "" : "<div class='t'" + ce + "></div>")
    + (s.kind === "lesson" || s.kind === "note"
         ? "<div class='n'" + ce + (ce ? " aria-multiline='true'" : "") + "></div>" : ""));
  e.dataset.d = d; e.dataset.s = s.id;
  /* **休みの日の授業には書かせない。** 斜め線を引いた欄に字が入ると、
     刷った紙で「休みなのか、授業があるのか」が読めなくなる。
     校外が覆っていれば書ける（時数のために教科を入れる必要がある） */
  if(isDayOff(d) && s.kind === "lesson" && !tripHere(d, s.id)) e.classList.add("off");
  const t = e.querySelector(".t"), n = e.querySelector(".n");
  /* **見るだけの紙には、書く仕掛けを付けない。**（月の面・学年の面）
     ここで返さずに CSS だけで止めると、キーボードの移動で欄に入れてしまい、
     打った字が別のクラス・別の週へ入る */
  if(sheetRO) return e;

  /* contenteditable は、そのままでは支援技術に「どの欄か」を伝えない。
     **同じ形の66マス**を聞き分けられるよう、日付・曜日・校時・欄の種類まで付ける */
  const where = md(addDays(monday, d)) + "（" + DOW[d] + "） " + s.name
              + (s.kind === "lesson" ? "校時" : "");
  if(t) t.setAttribute("aria-label", where + " 教科名・行事名");
  if(n) n.setAttribute("aria-label", where + " 詳細・備考");

  const focus = () => {
    /* 教科チップを持っているあいだは、コマを押すとその教科が入る
       （つづけて入れるための「持ち歩き」）。
       同じ教科のコマは触っても何もしない ── ただ選ぶ */
    if(pickSub && view.kind !== "special"){
      const c = cellFor(d, s.id);
      if(rootSubject(c.subject || "") !== pickSub){
        selectCell(d, s.id, e);          /* 入らなくても見られるように、先に選ぶ */
        applyPalette(d, s.id, pickSub, e);
        return;
      }
    }
    selectCell(d, s.id, e);
  };
  if(t) t.addEventListener("focus", focus);
  if(n) n.addEventListener("focus", focus);

  if(t) t.addEventListener("input", () => {
    /* 打ち始めた1打目で聞く。**「変更しない」なら打った字ごと元に戻す。** */
    const put = () => {
      typing = t;
      const sub = SUB_BY_NAME[plain(t.innerHTML).trim()];
      writeCell(d, s.id, {title:t.innerHTML, subject:sub ? sub.code : null});
      paintSheet(e); fillPanel(); typing = null;
    };
    const undo = () => {
      t.innerHTML = (cellFor(d, s.id).title || "");
      typing = null; paintSheet(); fillPanel();
    };
    /* 専科の週では、打った字が「行き先のクラス」。潰す相手はその学級 */
    okToOverwrite(d, s.id, plain(t.innerHTML), put, undo,
                  view.kind === "special" ? normCls(plain(t.innerHTML)) : undefined);
  });
  if(n) n.addEventListener("input", () => {
    typing = n;
    writeCell(d, s.id, {note:n.innerHTML});
    paintSheet(e); fillPanel(); typing = null;
  });

  /* 教科を引っぱって入れる */
  e.addEventListener("dragover", ev => { ev.preventDefault(); e.classList.add("drop"); });
  e.addEventListener("dragleave", () => e.classList.remove("drop"));
  e.addEventListener("drop", ev => {
    ev.preventDefault(); e.classList.remove("drop");
    /* 単元のバッジをつかんできた = その単元のコマを動かす（交換） */
    const mv = ev.dataTransfer.getData("text/x-unitmove");
    if(mv) return upMoveStart_(mv, d, s.id);
    const v = ev.dataTransfer.getData("text/x-timetable");
    if(v) applyPalette(d, s.id, v, e);
  });
  return e;
}

/* ── 枠に合わせて字を縮める ────────────────────
   授業名は**枠いっぱいまで大きく**する。そのままでは「クラブ活動」のような
   長い名前がはみ出すので、はみ出すコマだけ、そのコマの中で縮める。

   全部を同じ大きさに合わせない。**いちばん長い名前に全部を合わせると、
   「国語」まで小さくなる。** 紙に載っているコマの大半は2文字で、
   そこが読めることのほうが、大きさがそろっていることより効く。

   測るのと書くのを分ける。1コマずつ「書いて測って」を繰り返すと、
   そのたびにブラウザが並べ直す（55コマで55回）。 */
const FIT_MIN = 0.45;      /* これ以上は縮めない。読めなくなる */

/* 校外行事のチップの字を、チップの高さに収める。
   **長い行事名でも全部読めるようにする**（「6年生を送る会」は7文字）。
   1コマだけの校外に長い名前を入れると小さくなるが、切って見えなくなるより
   読める。紙に入ってから測る（組んでいる途中の列はまだ高さを持たない）。 */
function fitTripMarks(root){
  const list = [...(root || $("sheet")).querySelectorAll(".tripmark span")];
  for(const sp of list){
    const gl = sp.querySelectorAll("i");
    if(!gl.length) continue;
    const cs = getComputedStyle(sp);
    const h = sp.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const w = sp.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if(h <= 0 || w <= 0) continue;
    const base = parseFloat(getComputedStyle(gl[0]).fontSize);
    /* 行の高さ 1.02 ぶんを見込む。横も、1字が枠に入る大きさまで */
    const fit = Math.min(base, h / (gl.length * 1.06), w);
    if(fit > 0 && fit < base)
      for(const g of gl) g.style.fontSize = fit.toFixed(2) + "px";
    else
      for(const g of gl) g.style.fontSize = "";
  }
}

function fitTitles(els){
  if(!els.length) return;
  /* **時程の列（--labw）は、いまは画面でも刷るときでも同じ幅。**
     前は画面のほうが広かった（時刻を出していたぶん）。時刻を消したので、
     ここで幅を入れ替える理由が無くなった。 */
  for(let pass = 0; pass < 2; pass++){
    const want = [];
    for(const t of els){
      if(!t.firstChild) continue;                 /* 空のコマはそのまま */
      const cs = getComputedStyle(t);
      const availW = t.clientWidth
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = t.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if(availW <= 0 || availH <= 0) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      const box = r.getBoundingClientRect();
      if(!box.width || !box.height) continue;
      const cur = +(t.style.getPropertyValue("--fit") || 1);
      /* いまの大きさで、入るかどうか。入るなら1まで戻す（縮めっぱなしにしない） */
      const s = Math.min(1, cur * Math.min(availW / box.width, availH / box.height));
      want.push([t, Math.max(FIT_MIN, s)]);
    }
    let moved = false;
    for(const [t, s] of want){
      const cur = +(t.style.getPropertyValue("--fit") || 1);
      if(Math.abs(cur - s) > 0.01){ t.style.setProperty("--fit", s); moved = true; }
    }
    if(!moved) break;      /* 落ち着いたら、2度目は測らない */
  }
}

/* 中身を流し込む。el を渡すとそのコマだけ塗り直す。 */
/* root を渡すと、その紙の中だけを塗り直す。**月の面は紙が4枚ある。**
   渡さなければ、いつもの1枚（#sheet）。 */
function paintSheet(one, root){
  const list = one ? [one]
    : [...(root || document.getElementById("sheet")).querySelectorAll(".cell")];
  const mine = layerOf();

  for(const e of list){
    const d = +e.dataset.d, s = e.dataset.s;
    /* 中身が変わったときだけ書き換える（同じ字を入れ直すとカーソルが先頭へ跳ぶ）
       ── その判定も含めて paintCell が持つ */
    paintCell(e, cellFor(d, s), d, s, mine);
  }
  /* **書き終えてから、まとめて測る。** 1コマずつだと並べ直しが55回になる */
  fitTitles(list.map(e => e.querySelector(".t")).filter(Boolean));
  /* **上書きの知らせは、週の紙からだけ出す。**
     月の面は同じ窓を4回開こうとする。2回目からの showModal は無視されるので、
     一覧だけが後の週のものに入れ替わり、**先に出ていたぶんが読まれないまま消える。**
     しかも消えたぶんは acked に積まれないので、次に開くとまた出る。
     月の面は見るだけの面でもあるので、ここからは出さない
     （その週を開けば、そこで出る）。 */
  if(!one && (!root || root === $("sheet"))) warnOverwritten();
}

/* ── コマ1つの意味づけ ────────────────────────
   **版面は2つあるが、コマの読み方は1つ。**（週の紙と学年の面）
   版面を分けたのは spec 9節が別構造を決めたから（日ごとの入れ子格子と、
   日×クラスの平らな1枚）。だが `data-layer` / `授業なし` の斜線 / 重なり /
   空き枠の印は**同じ意味**なので、ここ1か所で付ける。
   分けて書いていたころ、学年の面には「授業なし」の斜線が出ていなかった。

   `mine` は、いま開いている層。省くと「上位から降りてきた」を塗らない
   （学年の面は層の淡い塗りを使わない）。 */
function paintCell(e, c, d, s, mine){
  const t = e.querySelector(".t"), n = e.querySelector(".n");
  /* **1文字で出す面**（学年・カレンダー）。時数表と同じ字を使うので、
     設定で直せばどちらも変わる。休み時間の行はそのまま（朝学習など） */
  const one = e.dataset.one === "1" && (SLOT_BY_ID[s] || {}).kind === "lesson";
  const wantT = one ? escText(shortOf(c.subject, c.title, c.short)) : (c.title || "");
  const wantN = c.note || "";
  if(t && t !== typing && t.innerHTML !== wantT) t.innerHTML = wantT;
  if(n && n !== typing && n.innerHTML !== wantN) n.innerHTML = wantN;

  /* **授業なしのコマは、題名の欄を斜め線で消す。** 備考は書ける。
     ここで付け外しするのは、**他の端末から降りてきたときにも効かせる**ため。
     線は図形で描く（背景の色はトナーを節約する設定のプリンタで消える）。
     まとめて1本にはしない ── 3限と4限が授業なしなら短い線が2本並ぶ。
     つないでしまうと、何限から何限までかが紙から読めなくなる。 */
  const none = t && (SLOT_BY_ID[s] || {}).kind === "lesson"
            && plain(c.title).trim() === NO_LESSON;
  e.classList.toggle("nolesson", !!none);
  const had = e.querySelector(".noneslash");
  if(none && !had) e.insertBefore(el("div", "noneslash", SLASH_SVG), e.firstChild);
  if(!none && had) had.remove();

  e.dataset.layer = c.layer;
  e.dataset.subject = c.subject || "";
  /* **専科の面は、コマの中身が「行き先のクラス」。** 教科ではないので、
     色は学年で付ける（→ sheet.css の [data-cg]）。教科で塗ると、
     音楽専科の紙はぜんぶ音楽の色になり、何も言わない印になる。
     色そのものは右メニューのクラスチップと同じもの。 */
  /* **案の面はコマに何人も並ぶ**ので、コマ全体を1つの学年で塗らない
     （塗る相手は中の1行ずつ。→ spmonth.js の spmCellFor） */
  const cg = (view.kind === "special" && !(typeof spmFace === "function" && spmFace())
              && (SLOT_BY_ID[s] || {}).kind === "lesson")
    ? gradeOf(normCls(plain(c.title || ""))) : "";
  if(cg) e.dataset.cg = cg; else delete e.dataset.cg;
  e.classList.toggle("has-sub", !!c.subject);
  /* **持っている教科チップの強調。** その教科のコマだけが目立つように、
     ちがう教科のコマは薄くする（pickSub。panel.js） */
  const hit = !!pickSub && rootSubject(c.subject || "") === pickSub;
  e.classList.toggle("subhot", hit);
  e.classList.toggle("subdim", !!pickSub && !hit);
  /* 仮採用は**基本時間割と同じ薄さ**で出す（→ config.js の TENT_SLOT）。
     どちらから来たかは、右上の札の字（仮）が言う */
  e.classList.toggle("from-base", c.layer === "base" || c.layer === "tent");
  if(mine) e.classList.toggle("upper", RANK[c.layer] > RANK[mine] && !c.clash);
  e.classList.toggle("clash", !!c.clash);

  /* 出どころの四角。**週案の紙だけ**（4週・学年・カレンダーには出さない）。
     あちらは見るための面で、1コマが小さく、札を置く場所がもう無い。 */
  const src = (!sheetRO && !e.dataset.one) ? srcLabel(c, mine) : "";
  let box = e.querySelector(".src");
  if(src && !box){ box = el("span", "src"); e.insertBefore(box, e.firstChild); }
  if(box){
    box.hidden = !src;
    /* **字は1つずつ積む。** writing-mode の縦書きは、フォント側に縦組みの
       情報が無い環境で字が同じ場所に重なる（校外行事のチップで実測済み） */
    const want = [...src].map(ch => "<i>" + escText(ch) + "</i>").join("");
    if(box.innerHTML !== want) box.innerHTML = want;
  }
  e.classList.toggle("has-src", !!src);

  const tag = e.querySelector(".tag");
  if(tag){
    /* **同じことを2か所に置かない。** 層そのものは左上の四角が言うので、
       右上の札は四角が言えないものだけを出す（重なり・誰が変えたか・2クラス） */
    let name = c.clash ? "！重なり" : (src ? "" : LAYER_NAME[c.layer]);
    if(c.over && c.over.length) name = c.over.join("・") + " が変更";
    /* 専科の面で、基本時間割が2クラス以上に当たったとき。**隠さずに言う。**
       「専科」シートの担当学年を書けば消える */
    if(c.multi) name = "！" + (c.nsp || 2) + "クラス";
    tag.hidden = !name;
    tag.textContent = name;
  }

  /* ── 空き枠さがしの印 ────────────────────
     **色は情報を運ばない。** 記号（△ ×）と斜線の密度が運ぶ。
     塗りは使わない ── 紙の塗り2色は「降ってきた」「重なっている」で
     もう埋まっていて、3色目を足すと淡色どうしが潰れる。 */
  const fr = (typeof spmFace === "function" && spmFace()) ? null
           : e.dataset.cls ? freeAtClass(d, s, e.dataset.cls) : freeAt(d, s, c);
  const want = fr ? (e.dataset.cls ? e.dataset.cls + "　" : "")
                    + FREE_WHY[fr.st] + (fr.why ? "：" + fr.why : "")
                  : (e.dataset.cls || "");
  if(fr) e.dataset.free = fr.st; else delete e.dataset.free;
  /* **変わっていないときは書かない。** 空き枠さがしを使わない人の面でも
     66コマぶんの属性書きが毎回走っていた */
  if(e.title !== want){ if(want) e.title = want; else e.removeAttribute("title"); }

  /* 単元の印。**番号はここでだけ見える** ── 保存するのは「どの単元か」だけ。
     描くたびに数えるので、1コマ抜けば後ろの番号は勝手に繰り上がる */
  if(typeof upPaintBadge_ === "function") upPaintBadge_(e, c, d, s);
}

/* **自分の予定が上書きされていたら、開いたときに知らせる。**
   自分に関係のない層どうしの重なりは出さない（読まれない警告は機能しない）。
   同じ上書きについては1回だけ。中身が変わったら出し直す。 */
function warnOverwritten(){
  const list = overwrittenHere();
  if(!list.length) return;
  const w = week();
  const sig = x => [viewName(), x.d, x.s, x.cls, x.from, x.to].join("|");
  const fresh = list.filter(x => w.acked.indexOf(sig(x)) < 0);
  if(!fresh.length) return;

  $("owList").innerHTML = fresh.map(x => {
    const dt = addDays(monday, x.d), sl = SLOT_BY_ID[x.s];
    const when = md(dt) + "(" + DOW[x.d] + ") " + sl.name + (sl.kind === "lesson" ? "校時" : "");
    const who  = (view.kind === "class") ? "" : escText(x.cls) + " の ";
    return "<li>" + who + "<b>" + when + "</b> が "
      + "<s>" + (escText(x.from) || "（空）") + "</s> → <b>" + (escText(x.to) || "（空）")
      + "</b> に上書きされました<br><span class=\"who\">" + escText(x.by) + "が入れたもの</span></li>";
  }).join("");
  const dlg = $("owDlg");
  if(dlg.open) return;          /* 開いている最中の再描画で落ちない。閉じたあとの塗り直しで出直す */
  try{ dlg.showModal(); }
  catch(e){ return; }          /* ほかのモーダルが開いているあいだは出せない */
  dlg.onclose = () => { fresh.forEach(x => w.acked.push(sig(x))); save(); };
}

/* ── 月の面 ──────────────────────────────────
   **4週ぶんを 2×2 に並べて、B4 に1枚で刷る。**

   週の紙は1枚ずつ見るためのもので、月のつながりが見えない。
   単元の配当・行事の重なり・専科の巡りは、4週を並べて初めて分かる。

   組み立ては週の紙と同じ buildSheet を使う（2つ持つと、片方だけ直した版が出る）。
   詰めるのは高さだけ ── 詳細と放課後と週メモを薄くして、授業名を残す。

   **転がさずに1画面へ収める。** 収まらなければ紙にもならない。
   4枠のうち1枠の大きさを測って、入るところまで --k を下げる。 */
const MONTH_WEEKS = 4;
let mMonday = null;               /* 月の面の左上の週。いま見ている週から始める */

const mWeeks = () => {
  const out = [];
  for(let i = 0; i < MONTH_WEEKS; i++) out.push(addDays(mMonday, i * 7));
  return out;
};

function openMonth(){
  if(!centerOk()) return toast("クラスや学年を開いてから押す");
  setCenter("month");
}
function drawMonth(){
  const ws = mWeeks();
  $("mTitle").textContent = viewName() + "　"
    + md(ws[0]) + " → " + md(addDays(ws[MONTH_WEEKS - 1], 5));
  /* 説明は ？ の中（HELP.month） */
  /* **見るだけの紙として組む。** 紙が4枚あるので、書けるままにしておくと
     打った字が「いま見ている週」に入る（打った本人には、見ている紙に入って見える）。
     面は変えない ── 見ているのは同じクラスの4週ぶん */
  for(let i = 0; i < MONTH_WEEKS; i++) buildSheet($("mS" + i), ws[i], true);
  fitMonth();
  /* **まだ読んでいない週は、読んでから描き直す。** 先に描いておくのは、
     待っているあいだ何も出ない時間を作らないため（週の紙と同じ作り） */
  /* **同期で返ったら、組み直さない。** 全部読みずみのときは `after` がその場で
     呼ばれるので、2回目は新しい中身を1つも持たないまま 264コマを組み直すことになる */
  let sync = true;
  const w = Wait.begin("4週ぶんを読んでいます");
  Backend.readWeeks(ws.map(iso), () => {
    Wait.end(w);
    if(sync || $("monthView").hidden) return;
    for(let i = 0; i < MONTH_WEEKS; i++) buildSheet($("mS" + i), ws[i], true);
    fitMonth();
    paintFreeTally();
  });
  sync = false;
}

/* ── 学年の面 ────────────────────────────────
   **同じ週を、その学年のクラスぶん横に並べる。**

   学年で揃えるもの（合同体育・テストの日・行事の準備）を決めるとき、
   見たいのは1クラスの中身ではなく**クラスどうしのずれ**で、
   週の紙を1枚ずつ繰っていては、ずれは頭の中にしか出てこない。

   **見るだけの面。** 直すのは週の紙のほう。
   紙が1枚ではないので、書けるままにしておくと、打った字が
   「いま開いているクラス」に入る（打った本人には、見ている紙に入って見える）。

   組み立ては週の紙と同じ buildSheet を使う（2つ持つと、片方だけ直した版が出る）。 */
let gGrade = null;                /* 学年の面で見ている学年 */

/* いまの面から、いちばん近い学年を決める。**選ばせる前に当てる。** */
function gradeGuess(){
  if(view.kind === "class") return gradeOf(view.cls);
  if(view.kind === "grade") return view.grade;
  if(view.kind === "special"){
    const gs = spGradesOf(view.sp);
    if(gs) return gs[0];
  }
  return grades()[0] || "";
}
const gClasses = () => classesOfGrade(gGrade || "");

/* ── 中央に何を出すか ──────────────────────────
   **週の紙・4週・学年を、1か所で入れ替える。**

   *紙の上下に置かない*（版面が痩せる）ので、帯は紙の外・中央の上に置く。
   *左のメニューにも「4週まとめて（B4）」を残す*理由：あちらは「出す」操作
   （刷る・画像・Sheet）の並びで、こちらは「見る」操作。同じ面へ行くが、
   探しに行く動機が違う。行き先が1つなので、どちらから入っても同じものが出る。

   **入れ替えられるのは、見るだけの面だけ。** 書けるのは週の紙1枚に限る。
   どの紙に書いているかを、いつでも1つに保つ（→ spec 9節「開いたものが層を決める」）。 */
let centerMode = "week";
const centerOk = () => view.kind === "class" || view.kind === "grade"
                    || view.kind === "school" || view.kind === "special";

/* 出し入れだけ。**描かない。** 面を開く途中からも呼ぶので、
   ここで描くと、そのあとの refreshWeek と二重に読みに行く */
function applyCenter(kind){
  if(view.kind === "tanpopo" || view.kind === "gate") return;
  if(!centerOk()) kind = "week";
  centerMode = kind;
  const wk = kind === "week";
  $("stage").hidden     = !wk;
  $("weekBar").hidden   = !wk;
  $("monthBar").hidden  = kind !== "month";
  $("gradeBar").hidden  = kind !== "grade";
  $("calBar").hidden    = kind !== "cal";
  $("monthView").hidden = kind !== "month";
  $("gradeView").hidden = kind !== "grade";
  $("calView").hidden   = kind !== "cal";
  $("spmView").hidden   = kind !== "spm";
  document.querySelector(".panel").hidden = !wk;
  document.querySelector(".work").classList.toggle("no-panel", !wk);
  paintNavLocation();
}
function setCenter(kind){
  if(view.kind === "tanpopo" || view.kind === "gate") return;
  if(kind === "grade") gGrade = gGrade || gradeGuess();
  /* いま見ている週の月から4ヶ月。**年度の区切りでは切らない**
     （学期をまたいで単元を見たいので、見ている場所から前後に繰る） */
  if(kind === "cal" && !calFrom) calFrom = new Date(monday.getFullYear(), monday.getMonth(), 1);
  applyCenter(kind);
  refreshWeek();                  /* 中身は、いまのかたちに合わせて refreshWeek が描く */
  if(centerMode === "week") autoFit();
}
/* いまどれを見ているかを、押すものの側に出す。
   **専用の帯は置かない。** 左メニューの「週案を出す」の並びが、
   押す場所と現在地の両方を1つで言う（→ index.html の data-center）。
   「ほかの週案を開く」の aria-current と同じ仕組み（gate.js paintHeader）。 */
function paintNavLocation(){
  for(const b of document.querySelectorAll(".nav[data-center]"))
    b.setAttribute("aria-current", String(b.dataset.center === centerMode));
  paintFree();
  paintSpMonthNav();
}

/* 専科の月予定への口。**専科と全学年の面にだけ出す。**
   担任の面に出しても押すものが無い（担任は専科の巡りを決めない）。
   学年の面にも出さない ── 決まるのは学校ぜんたいの専科の巡りで、
   1つの学年だけを見て決められるものではない。 */
function paintSpMonthNav(){
  const b = $("navSpMonth");
  if(!b) return;
  b.hidden = !(view.kind === "special" || view.kind === "school");
}

/* ── 空き枠さがしの操作 ────────────────────────
   **いま何段で見ているかを、押すものの側に出す。** */
function paintFree(){
  const box = $("freeBox");
  if(!box) return;
  box.hidden = !freeScope();
  const o = freeOpt();
  for(const b of document.querySelectorAll("#freeSeg [data-free]"))
    b.setAttribute("aria-pressed", String(+b.dataset.free === o.level));
  const sum = $("freeAvoidSum");
  if(sum) sum.textContent = o.avoid.length ? "避ける教科（" + o.avoid.length + "）"
                                           : "避ける教科";
  /* 畳んだままでも、いま何を出しているかは見出しに出す。
     **開き閉じは覚えておく**（既定は畳む。組み替えるときだけ使う道具） */
  const fold = $("freeFold");
  if(fold){
    if(fold.open !== !!db.settings.freeOpen) fold.open = !!db.settings.freeOpen;
    const now = document.querySelector("#freeSeg [data-free='" + o.level + "']");
    $("freePeek").textContent = now ? now.textContent : "";
  }
  paintFreeTally();
}
/* 数えたものを出す。**一覧を目で数え直させない**（それがこの道具の役目そのもの） */
function paintFreeTally(){
  const e = $("freeTally");
  if(!e) return;
  if(!freeOn()){ e.textContent = ""; return; }
  const n = freeTally(centerMode === "month" ? mMonday : monday);
  e.innerHTML = "<b>" + FREE_MARK.free + " " + n.free + "</b>"
    + "　" + FREE_MARK.avoid + " " + n.avoid
    + "　" + FREE_MARK.busy  + " " + n.busy
    + (centerMode === "month" ? "<span class='fw'>（1週目）</span>" : "");
}
/* 避ける教科。**チップで選ぶ。** 教科の並びは右パネルと同じ順にそろえる */
function drawAvoidList(){
  const box = $("freeAvoidBody");
  if(!box) return;
  const o = freeOpt();
  box.innerHTML = SUBJECTS.filter(s => !s.only).map(s =>
    "<label><input type='checkbox' value='" + escText(s.code) + "'"
    + (o.avoid.indexOf(s.code) >= 0 ? " checked" : "") + "><span>"
    + escText(s.name) + "</span></label>").join("")
    + "<button class='btn' id='freeAvoidClear'>全部外す</button>";
  for(const c of box.querySelectorAll("input[type=checkbox]"))
    c.onchange = () => {
      const o2 = freeOpt(), i = o2.avoid.indexOf(c.value);
      if(c.checked && i < 0) o2.avoid.push(c.value);
      if(!c.checked && i >= 0) o2.avoid.splice(i, 1);
      save(); paintFree(); redrawCenter();
    };
  const clr = $("freeAvoidClear");
  if(clr) clr.onclick = () => {
    freeOpt().avoid = [];
    save(); drawAvoidList(); paintFree(); redrawCenter();
  };
}
/* いま中央に出ているものを描き直す。**かたちの分岐はここ1か所。**
   前は refreshWeek 側にも同じ3分岐があり、かたちを1つ足すと2か所に足すことになった。

   `rebuild` は組み直し（週を繰った・面が変わった）。省くと塗り直しだけ
   （空き枠の段を変えた、避ける教科を選んだ）。 */
/* 枠の大きさが変わったら、いま出ている面を測り直す。**紙の大きさは枠で決まる。**
   組み直しはしない（中身は変わっていない）ので、測って倍率を入れるだけ。
   前はここが無く、窓を広げても学年の面は開いたときの倍率のままだった。 */
function refitCenter(){
  if(centerMode === "grade") fitGrade();
  else if(centerMode === "month") fitMonth();
  else if(centerMode === "cal") fitCal();
  else if(centerMode === "spm") fitSpm();
}
function redrawCenter(rebuild){
  if(centerMode === "month"){
    if(rebuild) mMonday = new Date(monday);
    drawMonth();
  }else if(centerMode === "grade"){
    drawGradeView();
  }else if(centerMode === "cal"){
    if(rebuild) calFrom = new Date(monday.getFullYear(), monday.getMonth(), 1);
    drawCalView();
  }else if(centerMode === "spm"){
    drawSpMonthView();
  }else if(rebuild){
    buildSheet();
    autoFit();
  }else{
    paintSheet();
  }
  paintFree();
}
function drawGradeView(){
  const cs = gClasses();
  $("gvTitle").textContent = (gGrade || "") + "年　"
    + md(monday) + " → " + md(addDays(monday, 5));
  /* 説明は ？ の中（HELP.gradeview） */
  const sel = $("gvGrade");
  sel.innerHTML = grades().map(g =>
    "<option value='" + escText(g) + "'" + (g === gGrade ? " selected" : "") + ">"
    + escText(g) + "年</option>").join("");

  const box = $("gvPaper");
  box.textContent = "";
  const sh = el("div", "gsheet");
  box.appendChild(sh);
  buildGradeSheet(sh);
  fitGrade();
  /* **まだ読んでいない週は、読んでから組み直す。** 先に描いておくのは、
     待っているあいだ何も出ない時間を作らないため（月の面と同じ作り）。
     ここで drawGradeView を呼び直すと読みに行きつづけるので、紙だけ組み直す。
     **同期で返ったら組み直さない** ── 読むのは、いま週の紙で見ている週そのもの。 */
  let sync = true;
  const w = Wait.begin((gGrade || "") + "年を読んでいます");
  Backend.readWeeks([iso(monday)], () => {
    Wait.end(w);
    if(sync || $("gradeView").hidden) return;
    buildGradeSheet(sh);
    fitGrade();
    paintFreeTally();
  });
  sync = false;
}

/* 学年の面の紙。**1日をクラス数で縦に割り、備考を置かない。**

   *紙を並べない理由*：クラスどうしのずれは、1枚ずつ並べて目を往復させるより、
   **同じコマの隣に並べたほうが一度に読める。** 4枚の紙を見比べるときは
   「月曜3限」を4回さがす手が要る。割ってしまえば、さがす手はゼロになる。

   *備考と放課後を置かない理由*：ここで読むのは**どの時間に何をやるか**のずれで、
   持ち物や連絡ではない。1コマが 1/4 の幅しか無いので、備考を置くと教科名まで潰れる。
   **書くための面ではないので、書く欄も要らない。**

   *土を細くする理由*：土は行事しか入らない。クラス数ぶん割ると、
   ほとんど空の列が月〜金と同じ幅を取る。 */
function buildGradeSheet(sh){
  sh.textContent = "";
  const cs = gClasses(), n = Math.max(1, cs.length);
  const slots = SLOTS.filter(s => s.kind !== "note");   /* 放課後は置かない */
  const colw = [];
  for(let d = 0; d < DAYS; d++)
    for(let i = 0; i < n; i++) colw.push(d === DAYS - 1 ? ".6fr" : "1fr");
  /* **1文字なので、列はうんと細くてよい。** 紙そのものの幅も、
     入る幅まで詰める（画面いっぱいに伸ばすと、字だけが離れて読みにくい） */
  sh.style.gridTemplateColumns = "calc(var(--labw)*var(--k)) " + colw.join(" ");
  sh.style.gridTemplateRows = "auto auto " + slots.map(s =>
    "calc(var(--h-" + (s.kind === "brk" ? "break" : "title") + ")*var(--k))").join(" ");

  const put = (node, col, row, span) => {
    node.style.gridColumn = span > 1 ? (col + " / span " + span) : String(col);
    node.style.gridRow = String(row);
    sh.appendChild(node);
    return node;
  };
  put(el("div", "lab corner"), 1, 1);
  put(el("div", "lab corner"), 1, 2);

  for(let d = 0; d < DAYS; d++){
    put(dayHeadEl(d, " gday" + (d === DAYS - 1 ? " sat" : "")), 2 + d * n, 1, n);
    /* 組の見出しは**組の数字だけ。** 1/4 の幅に「5-1」は入らない。
       学年は面の見出しが言っている（同じことを2か所に置かない） */
    cs.forEach((c, i) => {
      const g = put(el("div", "gcls", escText(String(c).split("-")[1] || c)),
                    2 + d * n + i, 2);
      g.title = c;
      if(i === n - 1) g.classList.add("gend");
    });
  }

  slots.forEach((s, ri) => {
    put(el("div", "lab glab" + (s.kind === "brk" ? " row-break" : ""),
      "<span class='no'>" + escText(s.name) + "</span>"), 1, 3 + ri);
    for(let d = 0; d < DAYS; d++) cs.forEach((c, i) => {
      const cell = gCellEl(d, s, c);
      if(i === n - 1) cell.classList.add("gend");
      put(cell, 2 + d * n + i, 3 + ri);
    });
  });
  /* **1コマが 1/4 の幅しか無い。** 「全校朝会」のような長い名前は、
     そのコマの中で縮めないと折り返して枠から溢れる（週の紙と同じ手当て） */
  fitTitles([...sh.querySelectorAll(".gcell .t")]);
}

/* 学年の面の1コマ。**題名だけ。書く仕掛けは付けない。**
   中身の意味づけ（層・授業なし・重なり・空き枠）は `paintCell` が持つ
   ── 週の紙と2つに分けて書いていたころ、こちらだけ古くなった。 */
function gCellEl(d, s, c){
  const e = el("div", "cell gcell " + (s.kind === "brk" ? "brk row-break" : "lesson"),
    "<div class='t'></div>");
  e.dataset.one = "1";            /* 題名は1文字。paintCell がそこを見る */
  e.dataset.d = d; e.dataset.s = s.id;
  e.dataset.cls = c;              /* これがあると paintCell はクラス単位で判定する */
  if(isDayOff(d) && s.kind === "lesson" && !tripOn(c, d, s.id)) e.classList.add("off");
  /* **特別校時の日は、その日に朝学習が無い。** 1枚の平らな格子なので行は抜けない。
     週の紙（列ごとに行を持つ）と違い、ここは空欄にして「無い」を示す */
  if(!slotShown(d, s)) e.classList.add("off");
  paintCell(e, compose(c, d, s.id), d, s.id);
  return e;
}

/* 入るところまで --k を下げる。**測って決める。**
   行の高さは mm で書いてあるが、字の回り込みまでは式で出せない。
   `nodes` に倍率を入れて `probe` の高さを測り、`want` に収まるまで繰り返す。
   **月の面と学年の面で1つ。** 2つ持つと、当たりを変えたとき片方しか直らない。 */
function fitK(nodes, probe, want, setVars){
  let k = 1;
  for(let pass = 0; pass < 4; pass++){
    for(const n of nodes){ setVars(n); n.style.setProperty("--k", String(k)); }
    const have = probe.scrollHeight;
    if(want < 2) return k;
    if(have <= want + 0.5) break;
    k = Math.max(.2, k * (want / have) * .99);
  }
  return k;
}

/* 1mm ぶんの px。**mm で書いた版面を px で測るため**（CSS の 1mm は 96dpi 換算） */
const MMPX = 96 / 25.4;
/* 学年の面の紙。**幅はいつも枠いっぱい。高さで倍率を決める。**

   前は「幅 ＝ 26px × 列数 × 倍率」として、幅と高さを同じ倍率で動かしていた。
   紙の縦横比が固定されるので、**横に広い枠では下が余り、余ったぶんは
   字に回らなかった**（実測：1240×874 の枠で、紙は 1240×704 まで。
   高さの 2割が空いたまま、1文字は 12pt×2.5 で止まっていた）。

   いまは幅を枠いっぱいに置いてから、**高さが枠に当たるまで倍率を上げる。**
   列の幅は fr で分けるので倍率について動かず、倍率は行の高さと字だけを動かす。
   上の例なら 2.5 → 3.2 まで上がり、1文字が 50px 近くになる。

   *上限*：時程の列だけは mm 固定（--labw × 倍率）なので、上げ続けると
   クラスの列から幅を取る。紙の 1/4 を越えないところで止める。
   縦に長い枠でも字が親指ほどにならないよう、素の上限も置く。 */
const G_LABW = 12.5;          /* .gsheet の --labw と同じ（mm） */
const G_MAX_K = 6;
function fitGradeK(sh, availH, availW){
  const capW = availW * .25 / (G_LABW * MMPX);
  let k = 1;
  for(let pass = 0; pass < 5; pass++){
    sh.style.setProperty("--k", String(k));
    const have = sh.offsetHeight;
    if(have < 2) break;
    const next = Math.max(.3, Math.min(G_MAX_K, capW, k * availH / have));
    const done = Math.abs(next - k) < .01;
    k = next;
    if(done) break;
  }
  sh.style.setProperty("--k", String(k));
  return k;
}
function fitGrade(){
  const box = $("gvPaper"), sh = box && box.querySelector(".gsheet");
  if(!box || !sh) return;
  const availW = box.clientWidth, availH = box.clientHeight;
  if(availW < 2 || availH < 2) return;
  sh.style.setProperty("--pw", availW + "px");
  return fitGradeK(sh, availH, availW);
}

/* 学年の面を刷る。**A4 よこ1枚。** 月の面・カレンダーと同じ運び方
   （紙の大きさで組み直してから刷り、刷り終わりで画面の大きさへ戻す）。
   紙は横に長い ── 5日 × クラス数の列が並ぶので、よこ向きでないと入らない。

   **紙でも下を余らせない。** 倍率1で刷っていたころは、A4 よこ（194mm）に
   70mm ぶんしか組まれず、紙の 2/3 が白かった。画面と同じ決め方で、
   紙の高さに当たるまで倍率を上げる。 */
const GV_PAGE = {w:297, h:210, mg:8};
function fitGradePrint(){
  const sh = $("gvPaper") && $("gvPaper").querySelector(".gsheet");
  if(!sh) return;
  const w = GV_PAGE.w - GV_PAGE.mg * 2, h = GV_PAGE.h - GV_PAGE.mg * 2;
  sh.style.setProperty("--pw", w + "mm");
  return fitGradeK(sh, h * MMPX, w * MMPX);
}

/* 1枠に入るところまで --k を下げる。**測って決める。**
   行の高さは mm で書いてあるが、字の回り込みまでは式で出せない。
   2〜3回測れば、たいてい 1% 以内に入る。

   cell を渡すと、その大きさの枠に合わせる（刷るときは mm で渡す）。
   **刷るときに画面の px で測らない。** 画面の広さと紙の広さは別もので、
   画面に合わせた倍率のまま刷ると、紙からはみ出すか、すかすかになる。 */
const M_GAP = 6;                 /* 枠と枠のすきま（画面は px・紙は mm） */
/* B4 のよこ。**CSS の B4 とは書かない**（週の紙の B5 と同じ理由）。
   364×257mm から余白と、まん中のすきまを引いた1枠 */
const M_PAGE = {w:364, h:257, mg:6};
function mCellMM(){
  return {w: (M_PAGE.w - M_PAGE.mg * 2 - M_GAP) / 2 + "mm",
          h: (M_PAGE.h - M_PAGE.mg * 2 - M_GAP) / 2 + "mm"};
}
function fitMonth(cell){
  const box = $("mPaper"), one = $("mS0");
  if(!box || !one) return;
  const c = cell || {w: ((box.clientWidth  - M_GAP) / 2) + "px",
                     h: ((box.clientHeight - M_GAP) / 2) + "px"};
  if(!cell && (box.clientWidth < 2 || box.clientHeight < 2)) return;
  /* **枠の大きさを、並べ方の側にも入れる。**
     1fr のままだと、刷るときに画面の広さで割った幅に押し戻される
     （紙は 352mm なのに、画面の 1500px を割った幅で組まれる）。 */
  if(cell){
    box.style.gridTemplateColumns = "repeat(2," + c.w + ")";
    box.style.gridTemplateRows    = "repeat(2," + c.h + ")";
    /* **入れものにも幅を持たせる。** 持たせないと画面の幅いっぱいに広がり、
       紙からはみ出したぶんが切られる（右半分が出ない） */
    box.style.width = "calc(" + c.w + "*2 + " + M_GAP + "mm)";
  }else{
    box.style.removeProperty("grid-template-columns");
    box.style.removeProperty("grid-template-rows");
    box.style.removeProperty("width");
  }
  let k = 1;
  for(let pass = 0; pass < 4; pass++){
    for(let i = 0; i < MONTH_WEEKS; i++){
      const s = $("mS" + i);
      s.style.setProperty("--pw", c.w);
      s.style.setProperty("--ph", c.h);
      s.style.setProperty("--pm", "0px");
      s.style.setProperty("--k", String(k));
    }
    /* **枠そのものの高さと比べる。** 紙のほうは枠が mm で決まっていて、
       中身がそれを超えても紙は伸びない（超えたぶんが次のページへ落ちる）。
       中身の高さどうしを比べると、超えていることに気づけない。 */
    const rows = getComputedStyle(box).gridTemplateRows.split(" ");
    const want = parseFloat(rows[0]) || one.clientHeight;
    const have = one.scrollHeight;
    if(want < 2) return;
    if(have <= want + 0.5) break;
    k = Math.max(.2, k * (want / have) * .99);
  }
}

/* ── カレンダーの面 ──────────────────────────────
   **4ヶ月を A4 1枚に。** 1日が1コマで、題名は**その日の教科を1文字ずつ**、
   下が備考。単元の配当・行事の重なりは、4週では足りず月をまたいで見たい。

   *1文字で並べる理由*：1日 15.7mm に教科名は入らない。時数表と同じ字を使うので、
   「教科の表し方」で直せば、時数・学年の面・ここが同時に変わる。

   *日曜を置かない理由*：週の紙と同じ。この学校の年間行事計画表に日曜登校は無い。
   月〜土の6列なので、1列 15.7mm 取れる（7列なら 13.4mm）。

   *1日の作り*：上から **①日付（中央ぞろえ）／②時間割／③備考** の3段。
   ②と③は、どちらも**横幅を6等分した枠**で、上下がそろう。
   ②に教科の1文字が入り、③は**空のまま刷る** ── 手で書き込む欄。

   *③を空にした理由*：前はここに放課後の備考を出していた。**紙に刷って手で
   書き足す使い方**を優先する。画面の備考は週の紙で読める（同じことを2か所に
   置かない）。1枠は 2.6mm × 約5mm ── 丸や「テ」1文字ぶん。文は入らない。

   *月の下の時数集計*：教科ごとに **その月のコマ数（年度はじめからの累計）**。
   数え方は時数集計表へのコピーと同じ（compose.js countSub）。
   **まだ書いていない日は基本時間割で数える** ── cellFor が固定時間割まで
   面倒を見るので、先の月はみ通しの数として出る。

   **見るだけの面。** 直すのは週の紙のほうで。 */
/* **A4 よこ1枚に2ヶ月。** 前は4ヶ月を 2×2 で並べ、1日は 12.8mm 角だった。
   1日の時間割を縦に積むには、6校時ぶんの行が要る。12.8mm から日付を引くと
   1校時 1.63mm で、7.5pt の字（2.6mm）が入らない（実測ではなく版面の計算）。
   横に2枚だけにすると1日が 22.9×29.5mm になり、1校時 3.9mm ── 字と
   書き込み欄が並ぶ。**4ヶ月を見たいときは2枚繰る。** */
const CAL_MONTHS = 2;
let calFrom = null;              /* 左上の月の1日 */

const calMonths = () => {
  const out = [];
  for(let i = 0; i < CAL_MONTHS; i++)
    out.push(new Date(calFrom.getFullYear(), calFrom.getMonth() + i, 1));
  return out;
};

/* 1日に置く枠の数。**時程の「授業」の数**（既定は6）。
   6と決め打ちにすると、5校時までの学校で枠が1つ余る。 */
const calCols = () => SLOTS.filter(s => s.kind === "lesson");

/* その日の1コマ。**週の紙と同じ `cellFor` を通す。**
   日付から月曜を出して `monday` を差し替えれば、層の重ね方も行事も揃って動く。
   `fy()` も `monday` から決まるので、**年度をまたいでも正しい年の週を読む**。

   枠の数ぶん必ず返す（出ない校時は空文字）。**位置で校時が分かる**ように
   詰めない ── 詰めると、4校時までの日の「算」が5校時の位置に来る。 */
function calDay(dt){
  const keep = monday;
  monday = mondayOf(dt);
  try{
    const d = Math.round((dt - monday) / 86400000);
    if(d < 0 || d >= DAYS) return null;
    const off = isDayOff(d);
    /* subs ＝ 左の欄に出す字、note ＝ 週案の備考、from ＝ 出どころ（層）。

       **専科の面では、コマの中身は「どのクラスへ行くか」。**
       教科の1文字に落とすと、クラス名（4-3）の頭の「4」だけが出て読めない
       ── 音楽専科のカレンダーが「6 6 2 5 2 …」と並んでいた。
       専科のときはクラス名をそのまま出す（左の欄はそのために2倍の幅がある）。

       **出どころも持つ。** 週案の紙と同じ線をここでも引くため
       （学年・全校から降りてきたコマを、カレンダーの上でも見つけられる） */
    const sp = view.kind === "special";
    /* **色のもとも持つ。** 週案の紙と同じ淡い色をここでも敷くため
       （sub ＝ 教科・cg ＝ 行き先のクラスの学年）。専科の面は教科がぜんぶ
       同じなので、色は学年で付ける（→ sheet.css の [data-cg]）。 */
    const out = {d, form:dayForm(d), ev:hasEvents(d),
                 subs:[], note:[], from:[], sub:[], cg:[], count:{}};
    for(const s of calCols()){
      if(!slotShown(d, s)){
        out.subs.push(""); out.note.push(""); out.from.push("");
        out.sub.push(""); out.cg.push(""); continue;
      }
      const c = cellFor(d, s.id);
      const t = plain(c.title).trim();
      out.subs.push(!t ? "" : t === NO_LESSON ? "／"
                            : sp ? calCls(t) : shortOf(c.subject, c.title, c.short));
      out.sub.push(sp ? "" : (c.subject || ""));
      out.cg.push(sp ? gradeOf(normCls(t)) : "");
      out.note.push(plain(c.note || "").trim());
      /* 線を引くのは**自分の面より上から降りてきたコマ**だけ。
         全学年の面では全部が「全校」になり、何も区別しない印になる
         （週案の紙の出どころの帯と同じ決まり ── compose.js srcLabel）。 */
      out.from.push(RANK[c.layer] > RANK[layerOf()] ? c.layer : "");
      /* **休みの日は数えない。** 斜め線を引いた日の授業を数えると、
         その月の時数だけが多くなる（時数集計表へのコピーと同じ決まり） */
      if(off) continue;
      /* **専科は、クラスごとに数える。** 教科はぜんぶ同じ（音楽なら音楽）なので、
         教科で数えても月の合計ひとつにしかならない。知りたいのは
         「どのクラスへ何コマ行ったか」のほう */
      if(sp){ if(t && t !== NO_LESSON) out.count[t] = (out.count[t] || 0) + 1; continue; }
      const sub = countSub(c);
      if(sub) out.count[sub.short] = (out.count[sub.short] || 0) + 1;
    }
    return out;
  } finally{ monday = keep; }
}

/* ── 数えたものを取り置く ────────────────────────
   **日ごと**（calCache）と**月ごと**（calMonthCache）の2段。

   *月ごとを持つ理由*：累計は4月からの足し算なので、4ヶ月ぶんの累計を出すと
   4月を4回、5月を3回…と同じ月を何度も通る。月の合計を1度だけ出して
   **足し算だけにする**と、2回目からは数え直しが消える
   （実測：4ヶ月ぶんの累計 13.4ms → 0.3ms）。

   *日ごとも残す理由*：月の枠を組むときは日ごとの中身（教科の1文字）が要る。
   月の合計だけでは紙が組めない。

   **捨てるのは、面が変わったときと、中身が変わったとき。**
   面（開いているクラス・学年）が違えば数も違う。中身は `dataTick` で見る
   ── 書き込みと、シートから読んだぶんの取り込みで上がる。
   描き直しのたびに捨てると、4ヶ月を繰り戻すたび数え直しになる。 */
let calCache = {}, calMonthCache = {}, calMark = "";

/* いま数えている面。クラス・学年・専科で数が変わる */
const calFace = () => [view.kind, view.cls || "", view.grade || "",
                       view.sp || ""].join("|");

function calFreshen(){
  const mark = calFace() + "|" + dataTick;
  if(mark === calMark) return;
  calMark = mark;
  calCache = {};
  calMonthCache = {};
}
function calDayC(dt){
  calFreshen();
  const k = iso(dt);
  if(!(k in calCache)) calCache[k] = calDay(dt);
  return calCache[k];
}

/* その月の、月〜土の日を順に。日曜は置かない（週の紙と同じ） */
function calDates(m){
  const out = [], last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for(let n = 1; n <= last; n++){
    const dt = new Date(m.getFullYear(), m.getMonth(), n);
    if((dt.getDay() + 6) % 7 < DAYS) out.push(dt);
  }
  return out;
}

/* その月の教科ごとのコマ数。{1文字: 数}。**月ごとに取り置く** */
function calCount(m){
  calFreshen();
  const key = m.getFullYear() + "-" + m.getMonth();
  if(key in calMonthCache) return calMonthCache[key];
  const out = {};
  for(const dt of calDates(m)){
    const info = calDayC(dt);
    if(!info) continue;
    for(const k in info.count) out[k] = (out[k] || 0) + info.count[k];
  }
  return calMonthCache[key] = out;
}

/* 年度はじめ（4/1）からその月の終わりまでの累計。**月の合計を足すだけ**
   （calCount が月ごとに取り置いてある）。**年度で切る** ──
   3月と4月をつなげて数えると、標準授業時数と比べられない数になる。 */
function calSum(m){
  const out = {}, y = fyOf(m);
  const upto = (m.getMonth() - 3 + 12) % 12;        /* 4月=0 … 3月=11 */
  for(let i = 0; i <= upto; i++){
    /* Date は月の繰り上がりを見てくれる（3+11 = 翌年の3月） */
    const one = calCount(new Date(y, 3 + i, 1));
    for(const k in one) out[k] = (out[k] || 0) + one[k];
  }
  return out;
}

/* 4月からその月までの週の月曜を、**年度ごとに分ける**。

   *週の年度は、その週の月曜で決まる*。週案はシート1枚が1週なので、
   4月1日を含む週の月曜が3月にあるとき、**その週は前の年度のシートに入っている**。
   月の年度でまとめると、そこがずれる。

   *年度ごとに分ける理由*：`Backend.readWeeks` は「いま開いている週の年度」で読む。
   渡すときに `monday` をその年度の月曜へ差し替えるので、group の中の月曜を
   そのまま使えるようにしておく（4月1日の月曜を使うと、それが3月30日だったときに
   前の年度として読みに行ってしまう）。 */
function fyWeeks(months){
  const out = {};
  for(const m of months){
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    for(let x = mondayOf(m); x <= last; x = addDays(x, 7))
      (out[fyOf(x)] || (out[fyOf(x)] = {}))[iso(x)] = true;
  }
  return out;
}

/* 年度ごとに分けた週を読む。**その年度に入っている月曜へ差し替えてから呼ぶ。**
   読み終えたら after（ぜんぶの年度ぶんが終わってから1回）。 */
function readByFy(byFy, after, want){
  const ys = Object.keys(byFy);
  let left = ys.length;
  if(!left) return after();
  const done = () => { if(--left <= 0) after(); };
  const keep = monday;
  for(const y of ys){
    const list = Object.keys(byFy[y]).sort();
    monday = parseISO(list[0]);      /* この年度の月曜（fy() をそろえる） */
    Backend.readWeeks(list, done, want);
  }
  monday = keep;
}

/* 集計に出す教科の並び。**教科シートの順**（時数集計表と同じ並び）。
   1文字が同じもの（体育と合同体育）は1つにまとめる。
   その4ヶ月と累計のどちらにも出てこない教科は出さない ──
   0 ばかりの行で、月の枠の下が埋まる。 */
function calSubs(rows){
  /* **専科はクラスごとに数えている**（教科はぜんぶ同じなので）。
     並べる順は SUBJECTS ではなく、クラスの並び（学年・組の順）。 */
  if(view.kind === "special"){
    const seen = {};
    for(const r of rows) for(const k in r) seen[k] = 1;
    return allClasses().filter(c => seen[c]);
  }
  const out = [], seen = {};
  for(const sub of SUBJECTS){
    if(!sub.count || !sub.short || seen[sub.short]) continue;
    if(!rows.some(r => r[sub.short])) continue;
    seen[sub.short] = 1;
    out.push(sub.short);
  }
  return out;
}

/* 専科の1コマを、カレンダーの枠に収まる字にする。
   **1コマに2クラス以上入ることがある**（合同・２クラス同時）。
   「2-3・5-1」は 6.8mm の欄に入らず切れるので、
   **先頭のクラス＋残りの数**にする（2-3+1）。何クラスあるかは残る。 */
function calCls(t){
  const list = String(t).split(/[・,、\s]+/).filter(Boolean);
  if(list.length <= 1) return list[0] || "";
  return list[0] + "+" + (list.length - 1);
}

/* 備考を出すか。**既定は出さない**（手で書き込む欄として刷るのが元の形）。
   週案に書いた備考をそのまま出したい週もあるので、押して切り替えられるようにした。
   学校で1つの設定にする（db.settings）── 紙は職員室で見せ合うもの。 */
const calShowNote = () => !!db.settings.calNote;

function openCal(){
  if(!centerOk()) return toast("クラスや学年を開いてから押す");
  setCenter("cal");
}
function drawCalView(){
  const ms = calMonths();
  $("cvTitle").textContent = viewName() + "　"
    + ms[0].getFullYear() + "年" + (ms[0].getMonth() + 1) + "月 → "
    + (ms[CAL_MONTHS - 1].getMonth() + 1) + "月";
  /* 説明は ？ に入れてある（HELP.cal）。ここに置くと、毎回読み飛ばす字が
     紙の上に居座る ── 4ヶ月ぶんの枠より説明のほうが高い、ということが起きた */
  $("cvNote").setAttribute("aria-pressed", String(calShowNote()));
  $("cvNote").textContent = calShowNote() ? "備考：出す" : "備考：空欄";
  const box = $("cvPaper");
  /* 専科の面かどうかを紙の側に渡す。クラス名（4-3）は1文字より広いので、
     そこだけ字を落として枠に収める（→ src/css/app.css .cvpaper[data-face]） */
  box.dataset.face = view.kind;
  /* **描き直しのたびには捨てない。** 中身が変わっていなければ取り置きを使う
     （4ヶ月を繰り戻すたびに数え直さない）── calFreshen が要否を見る */
  calFreshen();
  box.textContent = "";
  for(const m of ms) box.appendChild(calMonthEl(m));
  fitCal();
  /* **年度はじめから読む。** 括弧の累計は 4/1 からなので、見えている4ヶ月だけ
     読んでも数が足りない（読めていない月は基本時間割の数になる）。

     **年度ごとに分けて渡す** ── Backend.readWeeks は「いま開いている週の年度」で
     読むので、3月と4月をまたぐときに違う年の箱へ入ってしまう。
     monday を差し替えてから呼び、すぐ戻す（readWeeks は年度をその場で控える）。 */
  const need = {};
  for(const m of ms){
    const y = fyOf(m), upto = (m.getMonth() - 3 + 12) % 12;
    for(let i = 0; i <= upto; i++) need[y + "/" + (3 + i)] = new Date(y, 3 + i, 1);
  }
  let sync = true;
  const w = Wait.begin("年度始めからの週を読んでいます");
  readByFy(fyWeeks(Object.keys(need).map(k => need[k])), () => {
    Wait.end(w);
    if(sync || $("calView").hidden) return;
    /* 週を取り込んだぶん dataTick が上がっているので、ここで捨てられる */
    calFreshen();
    box.textContent = "";
    for(const m of ms) box.appendChild(calMonthEl(m));
    fitCal();
  });
  sync = false;
}

function calMonthEl(m){
  const wrap = el("div", "cmonth",
    "<div class='cmhd'>" + (m.getMonth() + 1) + "月</div>");
  wrap.style.setProperty("--np", calCols().length);
  const grid = el("div", "cgrid");
  for(let d = 0; d < DAYS; d++)
    grid.appendChild(el("div", "cdow" + (d === DAYS - 1 ? " sat" : ""), DOW[d]));
  /* 1日の曜日まで空ける。**月曜はじまり**（週の紙と同じ並び） */
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  for(let i = 0; i < lead && i < DAYS; i++) grid.appendChild(el("div", "cday none"));
  for(const dt of calDates(m)){
    const info = calDayC(dt);
    /* ①日付（枠いっぱい）／②校時を**上から順に1行ずつ**。
       1行は「教科の1文字｜書き込み欄」。**書き込み欄は空のまま刷る。**

       *横に並べない理由*：横並びだと1校時ぶんが 2.6mm 幅の升になり、
       何校時のことか位置でしか分からない。縦に積めば上から1・2・3…と
       読めて、週案の紙（校時が行）と目の動きがそろう。

       *出どころの線*：降りてきたコマの左端に、週案の紙と同じ色の線を引く。 */
    const subs = info ? info.subs : [], from = (info && info.from) || [];
    const notes = (info && info.note) || [], showN = calShowNote();
    /* 教科（または行き先のクラスの学年）。**色を敷くためだけの印** */
    const sub = (info && info.sub) || [], cg = (info && info.cg) || [];
    const cell = el("div", "cday" + (info && info.form ? " form-" + info.form : ""),
      "<span class='cnum'>" + dt.getDate() + "</span>"
      + "<span class='cper'>"
      + subs.map((x, i) => "<i" + (from[i] ? " data-from='" + escText(from[i]) + "'" : "")
          + (sub[i] ? " data-subject='" + escText(sub[i]) + "'" : "")
          + (cg[i]  ? " data-cg='"      + escText(cg[i])  + "'" : "")
          + "><b>" + escText(x) + "</b><u>"
          + (showN ? escText(notes[i] || "") : "") + "</u></i>").join("")
      + "</span>");
    if(info && info.ev) cell.classList.add("hasev");
    if(info && info.form) cell.title = DAY_FORM[info.form].label;
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  wrap.appendChild(calFootEl(m));
  return wrap;
}

/* 月の下の時数集計。**その月のコマ数（年度はじめからの累計）**。
   数えるのは時数表に出す教科だけ（compose.js countSub）。
   まだ書いていない日は基本時間割で数えるので、先の月もみ通しとして出る。 */
function calFootEl(m){
  const now = calCount(m), sum = calSum(m);
  const subs = calSubs([now, sum]);
  const foot = el("div", "ctally");
  if(!subs.length){
    foot.appendChild(el("span", "ctnone", "時数に数えるコマがありません"));
    return foot;
  }
  /* 1文字と数を2つの枠に分けて、列の中でかたまりごと置く
     （→ src/css/app.css .ct）。分けないと、行をまたいで数の位置がずれる */
  for(const k of subs)
    foot.appendChild(el("span", "ct",
      "<b>" + escText(k) + "</b>"
      + "<span>" + (now[k] || 0) + "<i>(" + (sum[k] || 0) + ")</i></span>"));
  return foot;
}

/* A4 よこ1枚。**枠の大きさは mm で決め、刷るときはそれをそのまま使う。**
   画面の px で測った倍率のまま刷ると、紙からはみ出すか、すかすかになる。 */
const CAL_PAGE = {w:297, h:210, mg:8};
function calCellMM(){
  /* **横に2枚、縦は1枚。** 縦を割らないぶん、1日が倍の高さになる */
  return {w:(CAL_PAGE.w - CAL_PAGE.mg * 2 - 6) / 2 + "mm",
          h:(CAL_PAGE.h - CAL_PAGE.mg * 2) + "mm"};
}
function fitCal(cell){
  const box = $("cvPaper"), one = box && box.querySelector(".cmonth");
  if(!box || !one) return;
  const c = cell || {w:((box.clientWidth - 6) / 2) + "px",
                     h:box.clientHeight + "px"};
  if(!cell && (box.clientWidth < 2 || box.clientHeight < 2)) return;
  if(cell){
    box.style.gridTemplateColumns = "repeat(2," + c.w + ")";
    box.style.gridTemplateRows    = c.h;
    box.style.width = "calc(" + c.w + "*2 + 6mm)";
  }else{
    box.style.removeProperty("grid-template-columns");
    box.style.removeProperty("grid-template-rows");
    box.style.removeProperty("width");
  }
  const rows = getComputedStyle(box).gridTemplateRows.split(" ");
  const want = parseFloat(rows[0]) || one.clientHeight;
  fitK([...box.querySelectorAll(".cmonth")], one, want,
       n => { n.style.setProperty("--cw", c.w); n.style.setProperty("--ch", c.h); });
}
