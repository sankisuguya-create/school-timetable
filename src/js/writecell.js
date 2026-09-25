/* ==================================================================
   writecell.js — コマへの書き込み（writeCell・上書きの見張り・1手戻す）

   compose.js が「出す面」を組み立てるのに対し、こちらは「入れる」側。
   どの層のどの枠に書くか・入っていい場所か・元に戻すための覚え書き。
================================================================== */

/* ── 書く ────────────────────────────────────── */

/* クラスを開いているときだけ、1コマを学年や全校へ広げられる。
   **コマを選ぶたびに「この学級のみ」へ戻す。**
   持ち越すと、次のコマを直したときに気づかないまま全校へ広がる。 */
let scope = "self";

function targetStore(){
  const w = week();
  if(view.kind === "school") return w.school;
  if(view.kind === "grade")  return (w.grade[view.grade] || (w.grade[view.grade] = {}));
  /* **専科は「自分の層」を1枚持たない。** コマはクラスごとの棚（w.special[c]）に
     散るので、ここで返せる棚が無い。view.cls が無いまま下へ流すと
     w.home["undefined"] という空っぽの棚が残って、端末の控えにゴミが入る。 */
  if(view.kind === "special") return {};
  if(scope === "school")     return w.school;
  if(scope === "grade"){
    const g = gradeOf(view.cls);
    return (w.grade[g] || (w.grade[g] = {}));
  }
  return (w.home[view.cls] || (w.home[view.cls] = {}));
}

/* ── 上書きの見張り ──────────────────────────────
   いま書こうとしているコマに、**別の人が入れた予定**が出ているか。
   基本時間割は数えない（それを直すのがふだんの作業で、毎回聞かれても困る）。
   戻すのは [{cls, from}]。空なら誰の予定も潰さない。 */
/* forCls = 専科のとき、これから入れる行き先のクラス。
   **専科もここを通す。** 前は専科だけ素通りしていたので、音楽専科が
   2-1 の担任の「国語」を潰しても、書く側には何も出なかった
   （された側の担任には次に開いたときに出るので、片肺になっていた）。 */
/* **いま書くと、どのクラスの紙に出るか。** 上書きの見張りと、
   保存の前の確認窓が、同じここを読む（判定を2か所に持たない）。
   上の scopeClasses（マスターの面が持つクラス）とは別もので、
   こちらは**学級を開いたまま入れる先を広げたとき**も入る。 */
function writeClasses(forCls){
  return view.kind === "special" ? (forCls ? [forCls] : [])
       : view.kind === "class" && scope === "self"  ? [view.cls]
       : view.kind === "class" && scope === "grade" ? classesOfGrade(gradeOf(view.cls))
       : view.kind === "class" ? allClasses()
       : view.kind === "grade" ? classesOfGrade(view.grade)
       : view.kind === "school" ? allClasses()
       : [];
}

/* **効く先が、自分の学級より広い面か。**
   学年・全学年を開いているときと、学級を開いたまま入れる先を
   学年・全校にしているときが当たる。ここが真のあいだは、
   保存が「保存・反映」になり、押したときに1回だけ聞く。 */
function broadScope(){
  const k = (typeof view === "object" && view && view.kind) || "";
  if(k === "grade" || k === "school") return true;
  return k === "class" && scope !== "self";
}

function wouldOverwrite(d, s, forCls){
  const hit = [], layer = layerOfStore(), target = targetOfStore();
  const list = writeClasses(forCls);
  for(const c of list){
    if(allClasses().indexOf(c) < 0) continue;          /* 編成に無いクラス */
    const cur = compose(c, d, s);
    if(cur.layer === "base") continue;                 /* 基本時間割は潰してよい */
    /* 自分の続き。専科は「自分が受け持っているコマか」で見る */
    if(view.kind === "special"){
      if(cur.layer === "special" && cur.sp === view.sp) continue;
    } else if(cur.layer === layer && sameTarget(cur.layer, c, target)) continue;
    const t = plain(cur.title).trim();
    /* **自分が入れたものは聞かない。** 自分の予定を自分で直すたびに
       窓が出ると、窓を読まずに閉じる癖がつく。それでは他人の予定も守れない */
    if(isMe(cur.by)) continue;
    if(t) hit.push({cls:c, from:t, layer:LAYER_FULL[cur.layer],
                    who:whoName(cur.by), by:LAYER_FULL[cur.layer]});
  }
  return hit;
}
function sameTarget(layer, cls, target){
  if(layer === "school") return target === "";
  if(layer === "grade")  return target === gradeOf(cls);
  return target === cls;
}

/* **自分が入れた予定が、あとから誰かに上書きされたコマ。**
   開いたときに知らせる。開いている面の持ちぶんだけを見る。 */
function overwrittenHere(){
  const out = [], mine = layerOfStore(), w = week();
  for(let d = 0; d < DAYS; d++) for(const sl of SLOTS){
    const key = ck(d, sl.id);
    if(view.kind === "class"){
      const cur = compose(view.cls, d, sl.id);
      if(!cur.clash) continue;
      for(const lost of cur.clash)
        if(lost.layer === "home")
          out.push({d, s:sl.id, cls:view.cls, from:plain(lost.title),
                    to:plain(cur.title), by:LAYER_FULL[cur.layer],
                    who:whoName(cur.by)});
    }else if(view.kind === "special"){
      const own = ownCell(d, sl.id);
      if(!own.cls) continue;
      const cur = compose(own.cls, d, sl.id);
      if(cur.layer !== "special")
        out.push({d, s:sl.id, cls:own.cls, from:plain(own.title || ""),
                  to:plain(cur.title), by:LAYER_FULL[cur.layer],
                  who:whoName(cur.by)});
    }else{
      const bank = masterBank(), me = bank && bank[key];
      if(!me) continue;
      for(const c of scopeClasses()){
        const cur = compose(c, d, sl.id);
        if(cur.layer === view.kind) continue;
        if((cur.at || 0) <= (me.at || 0)) continue;
        out.push({d, s:sl.id, cls:c, from:plain(me.title),
                  to:plain(cur.title), by:LAYER_FULL[cur.layer],
                  who:whoName(cur.by)});
      }
    }
  }
  return out;
}

/* ── 一手戻す ────────────────────────────────
   **書き込みは writeCell の1本道。** だから、ここで直前の中身を控えておけば、
   引っぱって入れたぶんも、パレットを押したぶんも、まとめて戻せる。

   控えるのは「書き込み先の棚に入っている、そのままの中身」。
   紙に出ているみかけ（上位から降りてきたもの）を控えると、
   戻したときに、自分の層へ降りてきたものを写して固めてしまう。

   戻すのは **いま見ている週・いま見ている画面のぶんだけ**。
   週やクラスをまたいで戻すと、いま出ていない紙が黙って書き換わる。

   専科の面では戻さない（1コマが20クラスに散るので、1手が1か所で終わらない）。
   欄の中の Ctrl+Z はブラウザに任せる（→ main.js のキー結線）。 */
const UNDO_MAX = 60;
let undoStack = [], redoStack = [], undoBusy = false, undoLast = 0, undoLastKey = "";
const canUndo = () => view.kind === "class" || view.kind === "grade" || view.kind === "school";
/* いま開いている週・層・行き先で、戻せるぶんが残っているか。
   面が合っていても棚が空なら戻せない ── 「戻せるものがありません」の
   答えを、押す前からボタンの薄さで教える */
const undoAvail = () => canUndo() && undoStack.some(e => e.scope === undoScope());
const undoScope = () => fy() + "/" + wkKey() + "/" + layerOfStore() + "/" + targetOfStore();

function pushUndo(d, s){
  if(undoBusy || !canUndo()) return;
  const key = undoScope() + "/" + ck(d, s);
  const now = Date.now();
  /* 同じコマを続けて直したときは1手にまとめる（打鍵ごとに1手にしない） */
  if(key === undoLastKey && now - undoLast < 1200){ undoLast = now; return; }
  undoLastKey = key; undoLast = now;
  const cur = targetStore()[ck(d, s)];
  undoStack.push({scope: undoScope(), d, s, prev: cur ? clone(cur) : null});
  if(undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];                 /* 新しく書いたら、やり直しの先は無くなる */
}
/* 控えた中身を、棚へそのまま戻す。**writeCell を通さない。**
   通すと「いま紙に出ているものを引き継ぐ」が働いて、戻したいものと違うものが入る */
function restoreCell(d, s, prev){
  const st = targetStore(), key = ck(d, s);
  const was = (st[key] || {}).sat || 0;
  const wasT = plain((st[key] || {}).title);
  if(prev){ const e = clone(prev); e.sat = was; st[key] = e; }
  else delete st[key];
  Backend.cellChanged(layerOfStore(), targetOfStore(), d, s, was, undefined, wasT);
  save();
}
function stepUndo(from, to){
  const sc = undoScope();
  for(let i = from.length - 1; i >= 0; i--){
    if(from[i].scope !== sc) continue;
    const e = from.splice(i, 1)[0];
    const back = targetStore()[ck(e.d, e.s)];
    undoBusy = true;
    try{ restoreCell(e.d, e.s, e.prev); } finally{ undoBusy = false; }
    to.push({scope: sc, d: e.d, s: e.s, prev: back ? clone(back) : null});
    undoLastKey = "";
    return e;
  }
  return null;
}
function doUndo(){
  if(!canUndo()) return toast("この面では戻せません");
  if(typeof isLocked === "function" && isLocked())
    return toast("この画面はロックしてある。<b>直すには、ロックを押す</b>");
  if(archivedYearNow()) return toast(ARCHIVED_WHY);
  if(!stepUndo(undoStack, redoStack)) return toast("戻せるものがありません");
  refreshWeek();
  toast("1手戻した　<b>やり直しは Ctrl+Shift+Z</b>");
}
function doRedo(){
  if(!canUndo() || (typeof isLocked === "function" && isLocked())) return;
  if(archivedYearNow()) return toast(ARCHIVED_WHY);
  if(!stepUndo(redoStack, undoStack)) return toast("やり直せるものがありません");
  refreshWeek();
  toast("やり直した");
}

/* ── 書けない理由 ────────────────────────────
   **理由は弾く側が持つ。** 前は writeCell が黙って false を返すだけで、
   呼ぶ側はどこも戻り値を見ていなかった。だから休みの日にパレットを押すと、
   コマは何も変わらないのに「国語 を入れた」と出た（実測）。
   入っていないものを入ったと言う合図は、そこだけの間違いでは済まない
   ── 次から合図そのものが読まれなくなる。

   書けるなら空文字。書けないなら、そのまま画面に出せる1行を返す。 */
/* **ロック中は書かない。** 見るだけのつもりで開いた画面を守る。
   校外行事もここだけは通さないので、理由を1か所に置く */
function whyLocked(){
  return (typeof isLocked === "function" && isLocked())
    ? "この画面はロックしてある。<b>直すには、ロックを押す</b>" : "";
}
function whyCantWrite(d, s){
  const locked = whyLocked();
  if(locked) return locked;
  if(archivedYearNow()) return ARCHIVED_WHY;
  /* **休みの日の授業には書かない。** 斜め線を引いた欄に字が入ると、
     刷った紙で「休みなのか、授業があるのか」が読めなくなる。
     朝学習と放課後は書ける（休業日でも出勤・部活・行事の準備が入る） */
  /* **校外が覆っていれば書ける。** 自然学校のように休日・祝日をまたぐ行事がある。
     覆っている日は斜め線を引かず、時数のために教科を入れる必要がある */
  if(isDayOff(d) && (SLOT_BY_ID[s] || {}).kind === "lesson"
     && !(typeof tripHere === "function" && tripHere(d, s)))
    return "この日は<b>休み</b>にしてある。授業のコマには書けない"
         + "（右の「この週の日の形」から戻せる。校外行事を置けば書ける）";
  return "";
}

function writeCell(d, s, patch){
  /* ここが書き込みの1本道。ここで止めれば、引っぱって入れても、
     打っても、パレットを押しても入らない */
  if(whyCantWrite(d, s)) return false;
  pushUndo(d, s);                 /* 書く前の中身を控える。戻せるようにする */
  const w = week(), key = ck(d, s);

  /* 専科の週では、コマの中身は「どのクラスへ行くか」 */
  if(view.kind === "special"){
    const cur = ownCell(d, s);
    let target = ("cls" in patch) ? patch.cls : cur.cls;
    if("title" in patch && !("cls" in patch)){
      target = normCls(plain(patch.title));
      /* **編成に無いクラス名は打ち違い。** 先に全クラスから外してしまうと、
         行き先が見つからず、自分が入れたコマがそっくり消える。字はそのまま残し、
         何もしないで返す（塗り直しで欄はもとのクラス名に戻る）。 */
      if(target && allClasses().indexOf(target) < 0) return false;
    }
    /* **どける前に、行き先のコマの物差しを控える。**
       下のループで消してから読むと、いつも 0 になる。0 は「その行がまだ無い」
       の意味なので、サーバは「無いはずの行を書こうとしている」と見て
       競合で止める（→ gas/Domain.gs expectedVersionMatches）。
       クラスを変えずに備考だけ直したときが、必ずこれに当たっていた
       ── 専科が自分で入れたコマを自分で直すたび、競合の窓が出ていた。 */
    const wasTarget = ((w.special[target] || {})[key] || {}).sat || 0;
    /* 行き先の題名も、どける前に控える（たんぽぽ提出の判定に使う）。
       備考だけ直したときは前後で同じ字になるので、提出は覆らない */
    const wasTargetT = plain(((w.special[target] || {})[key] || {}).title);
    /* 行き先が変わるので一度どける。**どけたクラスだけをサーバに伝える。**
       全クラスに伝えると、1コマ直すたびに20枚のシートを読み書きすることになる
       （週案はクラスごとに1枚。触っていないクラスのシートは開かない） */
    for(const c of allClasses()){
      const e = (w.special[c] || {})[key];
      if(e && e.sp === view.sp){
        const was = e.sat || 0;          /* 消す前に、サーバの時刻を控える */
        const wasT = plain(e.title);
        delete w.special[c][key];
        if(c !== target) Backend.cellChanged("special", c, d, s, was, undefined, wasT);
      }
    }
    if(target && allClasses().indexOf(target) >= 0){
      /* **紙に出す字と教科は教科コードのほう。** 身元（sp）は枠を指すだけで、
         紙には「理科」と出し、時数も理科として数える */
      const sub = SUB_BY_CODE[spSubjectOf(view.sp)];
      (w.special[target] || (w.special[target] = {}))[key] = {
        title: escText(sub ? sub.name : viewName()),
        subject: spSubjectOf(view.sp), sp: view.sp,
        note: ("note" in patch) ? clean(patch.note) : (cur.note || ""),
        /* 単元進捗の印。専科の面でつける/外すのは行き先のクラスのコマ */
        u: ("u" in patch) ? String(patch.u || "") : (cur.u || ""),
        /* **物差しも控えに持たせる。** 持たせないと、サーバの返事が
           戻るまでのあいだに続けて直したぶんが、また 0 を送ることになる */
        sat: wasTarget,
        at: Date.now(), by: myEmail()
      };
      Backend.cellChanged("special", target, d, s, wasTarget, undefined, wasTargetT);
    }
    return save();
  }

  const st  = targetStore();
  const cur = cellFor(d, s);
  /* **書き替える前に、サーバの時刻を控える。**
     空にする操作ではコマごと消えるので、あとからでは読めない */
  const was = (st[key] || {}).sat || 0;
  /* 題名も控える。**e は st[key] と同じものを指すことがある**ので、
     書き替えたあとでは前の字が読めない（たんぽぽ提出の判定に使う） */
  const wasT = plain((st[key] || {}).title);
  /* **いま紙に出ているものを引き継いでから直す。**
     前は基本時間割から来たときだけ引き継いでいたので、全校や学年から
     降りてきたコマに詳細を1字書くと、題名が空のまま「担任」として入り、
     **紙から「全校朝会」が消えた**。書いた本人には、消したつもりが無い。 */
  const e   = st[key] || {
    title:   cur.title || "",
    note:    cur.note  || "",
    subject: cur.subject || null,
    short:   cur.short || "",
    u:       cur.u || ""
  };
  if("title"   in patch) e.title   = clean(patch.title);
  if("note"    in patch) e.note    = clean(patch.note);
  if("subject" in patch) e.subject = patch.subject;
  /* 単元進捗の印（"u12"＝所属／"-"＝外す／""＝規定）。題名や備考の直しでは触らない。
     印だけ変わるときも pushUndo・cellChanged が既にここを通っている。 */
  if("u"       in patch) e.u       = String(patch.u || "");
  /* 時数名。**手で決めた1文字の控え。** 教科コードに無い自由記述の行事名は、
     いまは題名の頭文字がそのまま出るので、紛らわしいときだけここで決め直す */
  if("short"   in patch) e.short   = clean(patch.short);
  e.by = myEmail();          /* 層ではなく人。層は開いている面から分かる */
  e.at = Date.now();
  if(isEmptyCell(e)) delete st[key]; else { e.sat = was; st[key] = e; }
  Backend.cellChanged(layerOfStore(), targetOfStore(), d, s, was, undefined, wasT);
  return save();
}

/* いまの書き込み先を、サーバの言葉（層・対象）に直す */
function layerOfStore(){
  if(view.kind === "school") return "school";
  if(view.kind === "grade")  return "grade";
  return scope === "school" ? "school" : scope === "grade" ? "grade" : "home";
}
function targetOfStore(){
  if(view.kind === "school") return "";
  if(view.kind === "grade")  return view.grade;
  return scope === "school" ? "" : scope === "grade" ? gradeOf(view.cls) : view.cls;
}
