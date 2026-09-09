/* 層の合成と書き込み。**この画面のいちばん大事な決まりがここにある。**

   勝つのは「最後に書かれたもの」。層は勝ち負けを決めない。
   時刻で決めないと、上位があとから入れた予定が、先に入っていた担任の予定に負ける。
   それでは学年主任が学年体育を入れても反映されず、入れた本人にも見えない。
   （層の順で組んだ初版を実際に動かして見つけた欠陥） */

/* いま何を開いているか。**開いたものが層を決める。**
   「だれとして書くか」を別に選ばせない。 */
let view = {kind:"gate"};
const LAYER_OF = {class:"home", grade:"grade", school:"school", special:"special"};
const layerOf = () => LAYER_OF[view.kind];

function viewName(){
  if(view.kind === "class")   return view.cls;
  if(view.kind === "grade")   return view.grade + "年";
  if(view.kind === "school")  return "全学年";
  if(view.kind === "special"){
    const x = specials().find(s => s.code === view.sp);
    return x ? x.label : "専科";
  }
  if(view.kind === "tanpopo") return "たんぽぽ";
  return "";
}
function viewWhere(){
  if(view.kind === "class")   return "書いたものは " + view.cls + " だけに入る";
  if(view.kind === "grade")   return "書いたものは " + view.grade + "年の全クラスに入る";
  if(view.kind === "school")  return "書いたものは全クラスに入る";
  if(view.kind === "special") return "コマにクラスを入れると、そのクラスに「"
                                   + viewName() + "」として入る";
  if(view.kind === "tanpopo") return "交流級を選んで、たんぽぽ時間割へ出す";
  return "";
}

/* ── 誰が入れたか ────────────────────────────
   **層（担任・学年・全体）と、人（メール）は別のもの。**
   前は同じ欄に層の名前を入れていたので、「自分が入れたコマかどうか」を
   判定する材料が画面に無かった。シートの「更新者」はメールなので、
   手元でもメールを入れて、形をそろえる。 */
function myEmail(){
  const b = (typeof Backend !== "undefined" && Backend.info) ? Backend.info() : null;
  return (b && b.me) || "";
}
/* **手元では自分が誰か分からない。** 分からないときは「自分ではない」に倒す。
   自分だと決めつけると、他人の予定を黙って上書きする側に転ぶ。 */
function isMe(by){
  const me = myEmail();
  return !!me && !!by && String(by).toLowerCase() === me.toLowerCase();
}
/* 画面に出す名前。**@より前だけ。** 職員室で読めればよく、全部は要らない */
function whoName(by){
  const t = String(by || "").trim();
  if(!t) return "";
  const at = t.lastIndexOf("@");
  return at > 0 ? t.slice(0, at) : t;
}

/* ── 合成 ────────────────────────────────────── */

function baseCell(cls, d, s){
  const v = ((Y().base[cls] || {})[week().variant] || {})[ck(d, s)];
  if(!v) return null;
  return {title:escText(v.title || ""), note:"", subject:v.subject || null, layer:"base", at:0};
}

/* クラスの1コマ。基本時間割・全体・学年・専科・担任 を時刻順に重ねる。 */
function compose(cls, d, s){
  const w = week(), key = ck(d, s), g = gradeOf(cls);
  const cand = [];
  const b = baseCell(cls, d, s);
  if(b) cand.push(b);
  const push = (e, layer) => { if(e) cand.push(Object.assign({}, e, {layer, at:e.at || 0})); };
  push(w.school[key], "school");
  push((w.grade[g] || {})[key], "grade");
  push((w.special[cls] || {})[key], "special");
  push((w.home[cls] || {})[key], "home");

  if(!cand.length) return {title:"", note:"", subject:null, layer:"base", clash:null};
  if(cand.length > 1)
    cand.sort((x, y) => (x.at - y.at) || (RANK[x.layer] - RANK[y.layer]));

  const cur  = Object.assign({}, cand[cand.length - 1]);
  const lost = cand.slice(0, -1)
    .filter(e => e.layer !== "base" && (plain(e.title) || plain(e.note)));
  cur.clash = lost.length ? lost : null;
  return cur;
}

/* マスターを開いているときは、**その層が入れたものだけ**を出す。
   下の層まで混ぜると、どのクラスのものを見ているのか分からなくなる。 */
function masterBank(){
  const w = week();
  if(view.kind === "school") return w.school;
  if(view.kind === "grade")  return (w.grade[view.grade] || (w.grade[view.grade] = {}));
  return null;
}
const scopeClasses = () => view.kind === "school" ? allClasses()
                         : view.kind === "grade"  ? classesOfGrade(view.grade) : [];

/* このマスターのコマを、あとから直したクラスを拾う。
   compose を回さず、その週の表を直に引く（クラス数×コマ数の掛け算を避ける）。 */
function overriders(d, s){
  const bank = masterBank();
  const mine = bank && bank[ck(d, s)];
  if(!mine) return [];
  const w = week(), key = ck(d, s), t = mine.at || 0;
  const out = [];
  for(const c of scopeClasses()){
    const h  = (w.home[c]    || {})[key];
    const sp = (w.special[c] || {})[key];
    if((h && (h.at || 0) > t) || (sp && (sp.at || 0) > t)){ out.push(c); continue; }
    if(view.kind === "school"){
      const g = (w.grade[gradeOf(c)] || {})[key];
      if(g && (g.at || 0) > t) out.push(c);
    }
  }
  return out;
}

/* 専科の自分の週。同じデータを、教科名ではなくクラス名で見る。 */
function ownCell(d, s){
  const w = week(), key = ck(d, s);
  for(const c of allClasses()){
    const e = (w.special[c] || {})[key];
    if(e && e.sp === view.sp)
      return {title:escText(c), note:e.note || "", layer:"special", cls:c, clash:null};
  }
  return {title:"", note:"", layer:"base", clash:null};
}

/* いま開いている面から見た1コマ。画面はこれだけを見る。 */
function cellFor(d, s){
  if(view.kind === "class")   return compose(view.cls, d, s);
  if(view.kind === "special") return ownCell(d, s);
  const e = (masterBank() || {})[ck(d, s)];
  const c = e ? Object.assign({}, e, {layer:view.kind})
              : {title:"", note:"", layer:"base"};
  c.over  = e ? overriders(d, s) : [];
  c.clash = null;
  return c;
}

/* そのクラスの今週が、基本時間割から動いているか。
   **動いていないクラスをたんぽぽへ出すと、担任がまだ書いていない予定を
   本物のように配ることになる。** 出す前に知らせる。 */
/* ── その画面に要る週案シート ────────────────
   週案はクラスごとに1枚。**開いた画面に要るものだけを読む。**
   担任が自分の週案を開くのに、ほかの19クラスを読む理由が無い。 */
function targetsForView(){
  const school = [{layer:"school", target:""}];
  const clsT = c => ({layer:"home", target:c});
  const grdT = g => ({layer:"grade", target:g});
  const v = (typeof view === "undefined") ? {kind:"gate"} : view;

  if(v.kind === "class")
    return school.concat([grdT(gradeOf(v.cls)), clsT(v.cls)]);

  if(v.kind === "grade")
    return school.concat([grdT(v.grade)], classesOfGrade(v.grade).map(clsT));

  if(v.kind === "tanpopo"){
    const cs = tpChosen().filter(c => allClasses().indexOf(c) >= 0);
    const gs = {};
    for(const c of cs) gs[gradeOf(c)] = true;
    return school.concat(Object.keys(gs).map(grdT), cs.map(clsT));
  }
  /* 全学年・専科は、どのクラスを潰すかを見せるために全部が要る */
  if(v.kind === "school" || v.kind === "special")
    return school.concat(grades().map(grdT), allClasses().map(clsT));

  return [];                    /* 入口。まだ何も開いていない */
}

function planState(cls){
  const w = week(), g = gradeOf(cls);
  let upper = false, own = false;
  for(let d = 0; d < WEEKDAYS; d++) for(const sl of SLOTS){
    const key = ck(d, sl.id);
    if(w.school[key] || (w.grade[g] || {})[key]) upper = true;
    if((w.home[cls] || {})[key] || (w.special[cls] || {})[key]) own = true;
    if(upper && own) return "ok";
  }
  if(own)   return "ok";
  if(upper) return "upper";        /* 上位だけ入っている。担任は未着手 */
  return "base";                   /* どの層からも1つも入っていない */
}

/* ── その日の形（ふつう／特別校時／休み） ──────
   **学校全体で決まるもの**なので、全学年の面からだけ入れられる。
   持ち方はふつうのコマと同じ（週案 全校 シートの1行・時程は `day`）。
   専用の入れ物を作らないので、送る・読む・退避する仕組みがそのまま効く。 */
function dayForm(d){
  const e = week().school[ck(d, DAY_SLOT)];
  const t = e ? plain(e.title).trim() : "";
  return (t === "特別校時") ? "special" : (t === "休み") ? "off" : "";
}
const isDayOff     = d => dayForm(d) === "off";
const isDaySpecial = d => dayForm(d) === "special";
/* その日に、この校時の欄が紙に出るか。
   特別校時の日は朝学習の欄が無い（その分だけ下が上へ詰まる） */
const slotShown = (d, s) => !(isDaySpecial(d) && s.id === "am2");

function setDayForm(d, form){
  if(typeof isLocked === "function" && isLocked()) return false;
  const w = week(), key = ck(d, DAY_SLOT);
  if(!form) delete w.school[key];
  else w.school[key] = {title: escText(DAY_FORM[form].label), note:"", subject:null,
                        by: myEmail(), at: Date.now()};
  /* **学校全体の層として送る。** 全クラスの紙に効く */
  Backend.cellChanged("school", "", d, DAY_SLOT);
  return save();
}

/* ── 書く ────────────────────────────────────── */

/* クラスを開いているときだけ、1コマを学年や全校へ広げられる。
   **コマを選ぶたびに「この学級のみ」へ戻す。**
   持ち越すと、次のコマを直したときに気づかないまま全校へ広がる。 */
let scope = "self";

function targetStore(){
  const w = week();
  if(view.kind === "school") return w.school;
  if(view.kind === "grade")  return (w.grade[view.grade] || (w.grade[view.grade] = {}));
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
function wouldOverwrite(d, s){
  const hit = [], layer = layerOfStore(), target = targetOfStore();
  const list = view.kind === "special" ? []
             : view.kind === "class" && scope === "self" ? [view.cls]
             : view.kind === "class" && scope === "grade" ? classesOfGrade(gradeOf(view.cls))
             : view.kind === "class" ? allClasses()
             : view.kind === "grade" ? classesOfGrade(view.grade)
             : allClasses();
  for(const c of list){
    const cur = compose(c, d, s);
    if(cur.layer === "base") continue;                 /* 基本時間割は潰してよい */
    if(cur.layer === layer && sameTarget(cur.layer, c, target)) continue;  /* 自分の続き */
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

function writeCell(d, s, patch){
  /* **ロック中は書かない。** ここが書き込みの1本道なので、ここで止めれば
     引っぱって入れても、打っても、パレットを押しても入らない */
  if(typeof isLocked === "function" && isLocked()) return false;
  /* **休みの日の授業には書かない。** 斜め線を引いた欄に字が入ると、
     刷った紙で「休みなのか、授業があるのか」が読めなくなる。
     朝学習と放課後は書ける（休業日でも出勤・部活・行事の準備が入る） */
  if(isDayOff(d) && (SLOT_BY_ID[s] || {}).kind === "lesson") return false;
  const w = week(), key = ck(d, s);

  /* 専科の週では、コマの中身は「どのクラスへ行くか」 */
  if(view.kind === "special"){
    const cur = ownCell(d, s);
    let target = ("cls" in patch) ? patch.cls : cur.cls;
    if("title" in patch && !("cls" in patch)) target = normCls(plain(patch.title));
    /* 行き先が変わるので一度どける。**どけたクラスだけをサーバに伝える。**
       全クラスに伝えると、1コマ直すたびに20枚のシートを読み書きすることになる
       （週案はクラスごとに1枚。触っていないクラスのシートは開かない） */
    for(const c of allClasses()){
      const e = (w.special[c] || {})[key];
      if(e && e.sp === view.sp){
        delete w.special[c][key];
        if(c !== target) Backend.cellChanged("special", c, d, s);
      }
    }
    if(target && allClasses().indexOf(target) >= 0){
      const sub = SUB_BY_CODE[view.sp];
      (w.special[target] || (w.special[target] = {}))[key] = {
        title: escText(sub ? sub.name : viewName()),
        subject: view.sp, sp: view.sp,
        note: ("note" in patch) ? clean(patch.note) : (cur.note || ""),
        at: Date.now(), by: myEmail()
      };
      Backend.cellChanged("special", target, d, s);
    }
    return save();
  }

  const st  = targetStore();
  const cur = cellFor(d, s);
  /* **いま紙に出ているものを引き継いでから直す。**
     前は基本時間割から来たときだけ引き継いでいたので、全校や学年から
     降りてきたコマに詳細を1字書くと、題名が空のまま「担任」として入り、
     **紙から「全校朝会」が消えた**。書いた本人には、消したつもりが無い。 */
  const e   = st[key] || {
    title:   cur.title || "",
    note:    cur.note  || "",
    subject: cur.subject || null
  };
  if("title"   in patch) e.title   = clean(patch.title);
  if("note"    in patch) e.note    = clean(patch.note);
  if("subject" in patch) e.subject = patch.subject;
  e.by = myEmail();          /* 層ではなく人。層は開いている面から分かる */
  e.at = Date.now();
  if(isEmptyCell(e)) delete st[key]; else st[key] = e;
  Backend.cellChanged(layerOfStore(), targetOfStore(), d, s);
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
