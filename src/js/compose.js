/* 層の合成と書き込み。**この画面のいちばん大事な決まりがここにある。**

   勝つのは「最新の状態を見たうえで、最後に書いたもの」。層は勝ち負けを決めない。
   最新を見ていない保存はサーバが止める（→ gas/Store.gs writeCells の expectedAt）。
   時刻で決めないと、上位があとから入れた予定が、先に入っていた担任の予定に負ける。
   それでは学年主任が学年体育を入れても反映されず、入れた本人にも見えない。
   （層の順で組んだ初版を実際に動かして見つけた欠陥） */

/* いま何を開いているか。**開いたものが層を決める。**
   「だれとして書くか」を別に選ばせない。 */
let view = {kind:"gate"};
/* **見るだけの紙を組んでいるあいだ true。**（月の面）
   書ける欄も、教科を落とす先も作らない。 */
let sheetRO = false;
const LAYER_OF = {class:"home", grade:"grade", school:"school", special:"special"};
const layerOf = () => LAYER_OF[view.kind];

function viewName(){
  if(view.kind === "class")   return view.cls;
  if(view.kind === "grade")   return view.grade + "年";
  if(view.kind === "school")  return "全学年";
  if(view.kind === "special"){
    const x = spOf(view.sp);
    return x ? spLabel(x) : "専科";
  }
  if(view.kind === "tanpopo") return "たんぽぽ";
  return "";
}
function viewWhere(){
  if(view.kind === "class")   return "書いたものは " + view.cls + " だけに入る";
  if(view.kind === "grade")   return "書いたものは " + view.grade + "年の全クラスに入る";
  if(view.kind === "school")  return "書いたものは全クラスに入る。"
                                   + "右の「この週の日の形」から、休みや特別校時にできる";
  if(view.kind === "special") return "コマにクラスを入れると、そのクラスに「"
                                   + viewName() + "」としている";
  if(view.kind === "tanpopo") return "交流級を選んで、たんぽぽ時間割に書き入れる";
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

/* ── 基本時間割の版 ─────────────────────────────
   **年度の途中で改めた時間割は、改めた週から先にだけ効かせる。**
   版が1つしか無いと、2学期に改めた時点で1学期の紙と時数まで
   新しい時間割で数え直される（担任が書いていないコマには基本時間割が出るため）。

     Y().base[cls]      = {A, B}                   年度はじめから使う版
     Y().baseFrom[cls]  = [{from:"2026-09-14", A, B}, …]   その月曜から使う版（from の順）

   その週に使うのは、**月曜より前に始まった版のうち、いちばん新しいもの。**
   サーバの baseSetAt_（gas/Store.gs）と同じ決まり。 */
const baseVersions = cls => ((Y().baseFrom || {})[cls]) || [];
function baseSetAt(cls, monISO){
  let set = Y().base[cls] || null;
  for(const v of baseVersions(cls)) if(v.from <= monISO) set = v;
  return set;
}

function baseCell(cls, d, s){
  const v = (((baseSetAt(cls, wkKey()) || {})[week().variant]) || {})[ck(d, s)];
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
  /* **専科の備考は、学級の紙へ降ろさない。**
     あれは専科が自分の週のために書くもの（持ち物・教室・進度）で、
     学級の紙に出すと、担任が書いていない詳細が担任の紙に載る。
     担任にはそれが自分の書いたものか専科のものか見分けられず、
     消してよいのかも分からない。時数・たんぽぽ・Sheet出力も紙に従う。

     題名（教科名）は降ろす ── それは学級の予定そのものだから。
     専科自身の面では ownCell がこの棚を直に読むので、備考は消えない。 */
  const sp = (w.special[cls] || {})[key];
  if(sp) cand.push(Object.assign({}, sp, {layer:"special", at:sp.at || 0, note:""}));
  push((w.home[cls] || {})[key], "home");

  /* **仮採用は、本物のコマが1つも無いときだけ出る。**
     誰かがこの校時へ書いた瞬間に負ける ── それが「優先度がいちばん低い」の中身。
     基本時間割より上に出すのは、行事で崩れた基本を置き換えるための案だから
     （→ config.js の TENT_SLOT）。 */
  if(!cand.length || (cand.length === 1 && cand[0].layer === "base")){
    const tv = (w.special[cls] || {})[ck(d, TENT_SLOT + s)];
    if(tv) return Object.assign({}, tv, {layer:"tent", clash:null});
  }
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
   compose を回さず、その週の表を直に引く（クラス数×コマ数の掛け算を避ける）。

   **同じコマを週・面・中身が同じうちは2度数えない。** 塗り直しのたびに
   全コマ×全クラスを通ると、枚数ぶんだけ掛け算になる */
let ovMark = "", ovCache = {};
function overriders(d, s){
  const mark = [view.kind, view.grade || "", wkKey(), dataTick].join("|");
  if(mark !== ovMark){ ovMark = mark; ovCache = {}; }
  const k = ck(d, s);
  if(k in ovCache) return ovCache[k];
  const out = overridersRaw_(d, s);
  return ovCache[k] = out;
}
function overridersRaw_(d, s){
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

/* ── 教科の「元」────────────────────────────────
   合同体育＝体育、合同音楽＝音楽。**時数表の1文字が同じものを元とみなす。**
   教科シートに列を足さずに済む（時数の数え方と同じ決まりをそのまま使う）。
   学年でだけ使う教科（only が入っているもの）だけが写しなので、そこだけ見る。 */
function rootSubject(code){
  const s = SUB_BY_CODE[code];
  if(!s || !s.only || !s.short) return code || "";
  const root = SUBJECTS.find(x => !x.only && x.short === s.short);
  return root ? root.code : code;
}

/* ── 出どころの四角 ────────────────────────────
   **どこから降りてきたコマか**を、題名の欄の左上に小さく出す。

   *「学年」ではなく「3年」と出す理由*：担任の面で「学年」とだけ出ても、
   自分の学年だと分かっているので何も足さない。**学年の数字**まで出せば、
   ほかの学年の予定が混ざったときに気づける（専科の面では実際に混ざる）。

   *降りてきたコマにだけ出す理由*：全学年の面では全部が「全校」、学年の面では
   全部が「◯年」になる ── 面ぜんぶが同じ札で埋まり、**何も区別しない印**になる。
   自分の面より上から来たものだけに出せば、そこだけが目に入る。 */
function srcLabel(c, mine){
  if(!c || !mine || !c.layer) return "";
  if(!(RANK[c.layer] > RANK[mine])) return "";
  if(c.layer === "school")  return "全校";
  if(c.layer === "special") return "専科";
  if(c.layer === "grade"){
    /* いま出している紙のクラスから学年を引く。**マスターの面では view から** */
    const g = view.kind === "class" ? gradeOf(view.cls)
            : view.kind === "grade" ? view.grade : "";
    return g ? g + "年" : "学年";
  }
  return "";
}

/* 教科の1文字。**「時数表の1文字」を正本にする。**
   学年の面とカレンダーの面が同じ字を出すので、設定でそこを直せば両方が変わる。
   別に持つと、片方だけ直した版が出る。

   **空のときは表示名の1文字目に落とす。** 時数に数えない教科（行事・給食・
   クラブ・委員会）は1文字を空にしてある ── あれは「時数表に書くな」の意味で、
   「画面にも出すな」ではない。空のまま出すと、予定が入っているコマが空欄に見える。
   図書は「と」を出す（時数は国語に入る）。 */
/* own ＝ そのコマに手で決めた1文字（パネルの「時数名」欄）。**あれば最優先。**
   教科コードに無い自由記述の行事名は題名の頭文字が出るが、同じ頭文字の
   行事が並ぶと学年の面・カレンダーで見分けがつかない。そのときだけ人が決める。 */
function shortOf(code, title, own){
  const o = plain(own || "").trim();
  if(o) return o.slice(0, 2);
  const s = SUB_BY_CODE[code];
  if(s && s.short) return s.short;
  const t = plain((s && s.name) || title || "").trim();
  return t ? t.slice(0, 1) : "";
}

/* そのコマの時数の字。**時数集計表に出る字で、題名の右の欄に出る字。**
   手で決めた字（コマの時数欄・パネルの「時数名」）があれば最優先。
   教科の字が無ければ、教科に載っていない自由記述は「特」にする ──
   特別活動の枠なので、運動会や読み聞かせがどこにも数えられないまま消えない。
   「授業なし」と空欄は字を出さない。 */
function tallyCharOf(c){
  if(!c) return "";
  const own = plain(c.short || "").trim();
  if(own) return own.slice(0, 1);
  const t = plain(c.title || "").trim();
  const sub = c.subject ? SUB_BY_CODE[c.subject] : SUB_BY_NAME[t];
  if(sub) return sub.short || "";
  return t && t !== NO_LESSON ? "特" : "";
}

/* そのコマを時数に数えるか。数えるなら教科を返す。**数え方はここ1か所。**
   時数集計表へのコピー（dialogs.js tallyGrid）と、カレンダーの月ごとの集計が、
   同じ決まりで数える。別々に書くと、Excel に貼った数と紙の数が食い違う。

   **字から教科を引く** ── コマの時数欄で書き替えた字も、その字の教科として
   数える。「と」は図書だが国語として数える（教科シートの countAs）。
   どの教科の字にもならない字と空欄は数えない。 */
function countSub(c){
  const sub = SUB_BY_SHORT[tallyCharOf(c)];
  if(!sub) return null;
  return sub.countAs ? SUB_BY_CODE[sub.countAs] : sub;
}

/* その行のコマを、時数の何ぶんとして数えるか。**朝学習は3ぶんで1コマ**
   （15分×3 = 授業45分と同じ決まり）。授業の行は1、
   教科を選べる休みの行（朝学習）は1/3、ほかの休みの行は数えない。 */
function countWeight(s){
  if(!s) return 0;
  if(s.kind === "lesson") return 1;
  return s.kind === "brk" && s.chips ? 1/3 : 0;
}

/* 出す数の書き方。1/3のぶんがあると小数になるので、1/3の刻みにそろえてから
   整数なら整数で、そうでなければ小数1桁で出す（0.333→0.3、13.5→13.5、4→4） */
function fmtCount(x){
  const r = Math.round((x || 0) * 3) / 3;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/* 専科の枠1つ。無ければ null */
const spOf = code => specials().find(x => x.code === code) || null;

/* その枠の**教科コード**。身元（code）とは別もの ──
   同じ教科に専科が2人いる形（理科3・4年／理科5・6年）があるので、
   身元は「rika」「rika_2」と分かれ、教科はどちらも「rika」。
   古い控えには subject が無い（身元＝教科コードだった）ので、code に落とす。 */
function spSubjectOf(code){
  const me = spOf(code);
  const sub = me && me.subject;
  /* **仮の身元（sp_数字）を教科にしない。** 基本時間割の持ちコマ照合が
     教科で比べるので、sp_33 のままだと1コマも当たらない。ラベルからもう一度引く */
  if(sub && !/^sp_\d+$/.test(sub)) return sub;
  const parsed = me && (spParseLabel_(me.label) || spParseLabel_(me.code));
  return (parsed && parsed.subject) || sub || code;
}

/* 画面に出す名前。**同じ教科の枠が2つ以上あるときだけ、学年の数字を
   詰めて教科名の前に置く** ── 「34理科」「3456図工」。「理科3・4年」
   では長すぎるし、「理科」「理科」と並んでもどちらか分からない。
   1つしか無い教科は、担当学年によらず教科名だけ ── 「3456外国語」
   ではなく「外国語」（どの学年かは開けば分かる）。
   第2引数 within は、編成を直している最中の下書き一覧を渡す口。 */
function spLabel(sp, within){
  if(!sp) return "";
  const sub = SUB_BY_CODE[sp.subject || sp.code];
  /* **教科が分かるなら、その名前。** 表示名（シートの人の手の欄）を先に見ていたころは、
     枠の教科を「図工 → 理科」に変えても、名前が「図工」のまま残っていた */
  let name = sub ? sub.name : (sp.label || sp.subject || sp.code);
  /* **仮の身元（sp_数字）は画面に出さない。** 教科が読めない枠でも、
     先生に見せるのは内部の字ではなく「専科」である */
  if(/^sp_\d+$/.test(name)) name = "専科";
  /* **学年を付けるのは、同じ教科の枠が2つ以上あるときだけ。** */
  const subject = sp.subject || sp.code;
  const siblings = (within || specials()).filter(x => (x.subject || x.code) === subject);
  if(siblings.length <= 1) return name;
  const gs = sp.grades || [];
  if(!gs.length) return name;                 /* 空欄＝全学年 */
  return gs.join("") + name;
}

/* その専科が受け持つ学年。**空なら null＝全学年。**
   書いていない学校を、どの学年も受け持たない専科にしない。 */
function spGradesOf(code){
  const me = spOf(code);
  return (me && me.grades && me.grades.length) ? me.grades : null;
}
/* その専科が受け持つクラス */
function classesOfSpecial(code){
  const gs = spGradesOf(code);
  return gs ? allClasses().filter(c => gs.indexOf(gradeOf(c)) >= 0) : allClasses();
}

/* ── 専科の基本時間割 ──────────────────────────
   **基本時間割は、教師を持っていない。** クラス×校時×教科があるだけで、
   そのコマに誰が行くかは書いていない。だから専科が自分の面を開いても、
   自分で入れたコマしか出ていなかった（基本の持ちコマが1つも出ない）。

   持ち主は「専科」シートから引く ── 教科コードが自分の教科で、
   担当学年に入っていれば、そのクラスのそのコマは自分のもの。
   **新しく入れてもらう入力は無い。** 担当学年だけが年に1回、数行。

   *合成したあとの教科で見る理由*：基本時間割では音楽でも、担任や学年が
   別の予定を入れていれば、その時間に専科は行かない。基本の字だけを見ると、
   もう無くなった授業が専科の週に残る。 */
function spBaseClasses(d, s, sp){
  /* **身元ではなく教科で比べる。** 基本時間割には「rika」としか
     書いていない。どの理科の先生が行くかは、担当学年（classesOfSpecial）
     のほうが決める ── 理科3・4年の先生には3年と4年のコマだけが出る。 */
  const sub = spSubjectOf(sp), out = [];
  for(const c of classesOfSpecial(sp)){
    const b = baseCell(c, d, s);
    if(!b || b.subject !== sub) continue;
    const cur = compose(c, d, s);
    if(rootSubject(cur.subject) !== sub) continue;
    out.push(c);
  }
  return out;
}

/* 専科の自分の週。同じデータを、教科名ではなくクラス名で見る。 */
function ownCell(d, s, sp){
  const me = sp || view.sp;
  const w = week(), key = ck(d, s);
  /* 1. 自分で入れたコマ。**こちらが勝つ**（基本から動かした結果だから） */
  for(const c of allClasses()){
    const e = (w.special[c] || {})[key];
    if(e && e.sp === me)
      return {title:escText(c), note:e.note || "", layer:"special", cls:c,
              u:e.u || "", clash:null};
  }
  /* 2. 自分が仮採用で入れたコマ。**淡く出る**（layer が tent）。
     本物のコマが先に見つかればそちらが出るので、ここでも順は同じ */
  for(const c of allClasses()){
    const e = (w.special[c] || {})[ck(d, TENT_SLOT + s)];
    if(e && e.sp === me)
      return {title:escText(c), note:e.note || "", layer:"tent", cls:c, clash:null};
  }
  /* 3. 基本時間割が割り当てているコマ。**淡く出る**（layer が base なので） */
  const hit = spBaseClasses(d, s, me);
  if(hit.length)
    /* **2クラス以上に当たったら、隠さずに言う。** 同じ教科の専科が2人いて
       担当学年を書いていないときに起きる。黙って片方だけ出すと、
       出なかったほうのクラスに誰も行かない週ができる。
       **全部は並べない** ── 1コマの欄に入らず、字が潰れて読めなくなる */
    return {title:escText(hit.length > 2 ? hit[0] + " 他" + (hit.length - 1)
                                         : hit.join("・")),
            note:"", layer:"base",
            cls:hit.length === 1 ? hit[0] : "",
            multi:hit.length > 1, nsp:hit.length, clash:null};
  return {title:"", note:"", layer:"base", clash:null};
}

/* いま開いている面から見た1コマ。画面はこれだけを見る。 */
function cellFor(d, s){
  /* 専科の月予定の面。**1コマに全専科を並べる**（→ spmonth.js の spmCellFor）。
     面が「誰の紙か」を決めるのはここ1か所なので、あちらに紙を組み直させない */
  if(typeof spmFace === "function" && spmFace()) return spmCellFor(d, s);
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

/* ── 空き枠さがし ────────────────────────────────
   **一覧して目で探すのではなく、コマ1つずつを判定して出す。**
   学年・全校・専科の面で、行事や合同の授業を入れられる枠を探すための道具。

   *3段で返す理由*：「空いている／埋まっている」の2値にすると、
   埋まった週には候補が1つも出ず、使う側には壊れた画面と区別がつかない。
   **使えないのか、空いているが避けたいのか**を分けておけば、
   候補ゼロの週でも「どこが、なぜ、埋まっているか」は読める。

     "busy"   使えない  … 休み・授業なし・校外行事・全校の予定・学年の予定
     "avoid"  避けたい  … 場所を取る教科・学年でやる活動・ほかの専科・指定した教科
     "free"   自由

   *レベル1で担任の予定を避けない理由*：担任が入れた国語は、学年や全校が
   あとから上書きできる（そう決めてある。上書きは両側に知らせる）。
   避ける対象にすると、ほとんどのコマが埋まって使いものにならない。
   避けるのは**上位が既に約束しているもの**だけ。

   **画面だけのもの。紙には出さない。** 枠を探している最中の作業であって、
   刷って残す情報ではない（行事の印と同じ扱い）。 */

/* いまの設定。**この端末の持ちもの**（人によって探し方が違う）。 */
function freeOpt(){
  const s = db.settings.free || (db.settings.free = {level:FREE_OFF, avoid:[]});
  if(typeof s.level !== "number") s.level = FREE_OFF;
  if(!Array.isArray(s.avoid))     s.avoid = [];
  return s;
}
const freeOn = () => freeOpt().level > FREE_OFF && !!freeScope();

/* 探す範囲。**紙ではなく、人が開いている面で決める。**
   学年の面は紙を1枚ずつ別のクラスとして組むので、紙のほうを見ると
   「学級の面」に見えて、空き枠の印が1つも出なくなる。

   **学級の面には出さない。** 自分1クラスの中に「空き枠」は無く、
   担任が探しているのは自分の空き時間のほうで、それは別のもの。 */
function freeScope(){
  /* 学年の面は、紙をクラス単位で組む。**紙ではなく、出している学年で決める。**
     紙のほうを見ると「学級の面」に見えて、印が1つも出なくなる */
  if(centerMode === "grade" && gGrade)
    return {kind:"grade", classes:classesOfGrade(gGrade)};
  if(view.kind === "grade")  return {kind:"grade",  classes:classesOfGrade(view.grade)};
  if(view.kind === "school") return {kind:"school", classes:allClasses()};
  if(view.kind === "special")
    return {kind:"special", sp:view.sp, classes:classesOfSpecial(view.sp)};
  return null;
}

/* 1クラス・1コマの判定 */
function freeOne(d, sid, c, opt){
  /* **安い判定を先に。** 棚を1つ引くだけで決まるものを、
     層を重ねる compose より前に置く（大半のコマはここで抜ける） */
  if(tripOn(c, d, sid)) return {st:"busy", why:"校外行事"};
  const w = week(), key = ck(d, sid);
  const sc = w.school[key];
  if(sc && plain(sc.title).trim()) return {st:"busy", why:"全校の予定"};
  const gr = (w.grade[gradeOf(c)] || {})[key];
  if(gr && plain(gr.title).trim()) return {st:"busy", why:"学年の予定"};

  /* **重ねるのは1回だけ。** 前は noLessonOn が中で compose を回し、
     下でもう一度同じ引数で回していた（1クラス1コマにつき2回） */
  const cur  = compose(c, d, sid);
  if(noLessonIn_(cur)) return {st:"busy", why:"授業なし"};
  const code = cur.subject || "";
  if(!code) return {st:"free", why:""};
  const root = rootSubject(code);
  const name = (SUB_BY_CODE[code] || {}).name || plain(cur.title).trim() || code;
  /* 指定した教科は、**どの段でも**避ける（段の指定に足すもの） */
  if(opt.avoid.indexOf(code) >= 0 || opt.avoid.indexOf(root) >= 0)
    return {st:"avoid", why:name};
  if(opt.level < FREE_L2) return {st:"free", why:""};
  if(PLACE_SUBJECTS.indexOf(root) >= 0) return {st:"avoid", why:name + "（場所）"};
  if((SUB_BY_CODE[code] || {}).only)    return {st:"avoid", why:name};
  /* ほかの専科が入っているコマ。**教科で見る**（身元ではない）。
     自分の教科なら「ほかの専科」ではない ── 理科3・4年の先生にとって
     3年の理科は自分のコマで、避けるものではない */
  if(specials().some(x => spSubjectOf(x.code) === root)
     && root !== spSubjectOf(opt.sp))
    return {st:"avoid", why:name + "（専科）"};
  return {st:"free", why:""};
}

/* そのコマで、**学校のどこかが場所を取っているか。**

   *面の範囲で見ない理由*：体育館も図書室も**学校ぜんたいで1つ**。
   開いている面のクラスだけを見ると、3年が合同体育の枠を探しているときに
   5年が体育館を押さえていても「自由」と出る ── 教科を場所の代わりに使う
   ねらい（同じ時間に1クラスしか入れない）が、いちばん効いてほしい場面で効かない。
   **入力は1つも増えない。** 見る範囲を、場所という資源の広さに合わせるだけ。 */
function placeTakenBy(d, sid, skip){
  for(const c of allClasses()){
    if(skip.indexOf(c) >= 0) continue;
    const cur = compose(c, d, sid);
    if(!cur.subject) continue;
    if(PLACE_SUBJECTS.indexOf(rootSubject(cur.subject)) >= 0)
      return {cls:c, name:(SUB_BY_CODE[cur.subject] || {}).name || cur.subject};
  }
  return null;
}

/* 1コマの判定。**面によって、まとめ方が違う。**

   学年・全校 … そのコマに全クラスが空いていないと使えない（いちばん悪いほうを取る）
   専科       … 自分が空いていて、**どれか1クラス**が空いていれば行ける（いちばん良いほう）
                自分の週が埋まっていれば、その時点で使えない */
/* 下ごしらえ。**freeAt と freeAtClass で同じ前置きを2度書かない。**
   戻り値は null（出さない）／`{busy}`（その場で決まる）／`{sc, opt}`。
   `freeOn()` を挟むと freeScope が1コマにつき2回走るので、ここで1回だけ引く。 */
function freeCtx(d, sid, c){
  /* **安い門を先に。** 休み時間のコマで allClasses() の配列を作らない */
  const s = SLOT_BY_ID[sid];
  if(!s || s.kind !== "lesson") return null;
  if(freeOpt().level === FREE_OFF) return null;
  const sc = freeScope();
  if(!sc || !sc.classes.length) return null;
  /* 休みの日でも、校外行事があるなら「授業が無い」は誤り */
  if(isDayOff(d) && !(c ? tripOn(c, d, sid) : tripHere(d, sid)))
    return {busy:{st:"busy", why:"休み"}};
  const o = freeOpt();
  return {sc, opt:{level:o.level, avoid:o.avoid, sp:sc.sp || ""}};
}

/* `own` は、専科の面で画面が既に組んだ1コマ。**渡せば二度組まない**
   （paintSheet は cellFor で同じ ownCell を組んでいる）。 */
function freeAt(d, sid, own){
  const cx = freeCtx(d, sid);
  if(!cx) return null;
  if(cx.busy) return cx.busy;
  const sc = cx.sc, opt = cx.opt;

  if(sc.kind === "special"){
    /* 自分の週が埋まっていたら、その時点で行けない。
       **専科として引く**（学年の面から見ていても同じ結果になるように） */
    const mine = (own && view.kind === "special" && view.sp === sc.sp)
               ? own : ownCell(d, sid, sc.sp);
    if(plain(mine.title).trim())
      return {st:"busy", why:plain(mine.title).trim() + " を受け持っている"};
    let best = null;
    for(const c of sc.classes){
      const r = freeOne(d, sid, c, opt);
      if(r.st === "free"){
        const e = placeElsewhere(d, sid, sc, opt);
        return e.st === "free" ? {st:"free", why:c, cls:c}
                               : Object.assign({cls:c}, e);
      }
      if(!best || (best.st === "busy" && r.st === "avoid"))
        best = {st:r.st, why:c + "：" + r.why, cls:c};
    }
    return best;
  }

  let worst = {st:"free", why:""};
  for(const c of sc.classes){
    const r = freeOne(d, sid, c, opt);
    if(r.st === "busy") return {st:"busy", why:c + "：" + r.why};
    if(r.st === "avoid" && worst.st === "free") worst = {st:"avoid", why:c + "：" + r.why};
  }
  return worst.st === "free" ? placeElsewhere(d, sid, sc, opt) : worst;
}

/* **面の外で場所が取られていないか。** 体育館も図書室も学校で1つなので、
   自分の学年が空いていても、ほかの学年が押さえていれば入れない。 */
function placeElsewhere(d, sid, sc, opt){
  if(opt.level < FREE_L2) return {st:"free", why:""};
  const t = placeTakenBy(d, sid, sc.classes);
  return t ? {st:"avoid", why:t.cls + "：" + t.name + "（場所）"}
           : {st:"free", why:""};
}

/* 1クラス・1コマの空き。**学年の面は、どのクラスが塞いでいるかまで出す。**
   曜日をクラス数で割って並べるので、まとめてしまうと割った意味が無くなる。 */
function freeAtClass(d, sid, c){
  const cx = freeCtx(d, sid, c);
  if(!cx) return null;
  return cx.busy || freeOne(d, sid, c, cx.opt);
}

/* その週に何コマあるか。**数えたものを出す。**
   一覧を目で数え直させない（それがこの道具の役目そのもの）。 */
function freeTally(mon){
  const keep = monday;
  if(mon) monday = mon;
  try{
    const n = {free:0, avoid:0, busy:0};
    for(let d = 0; d < WEEKDAYS; d++) for(const s of SLOTS){
      if(s.kind !== "lesson" || !slotShown(d, s)) continue;
      const r = freeAt(d, s.id);
      if(r && n[r.st] !== undefined) n[r.st]++;
    }
    return n;
  } finally{ monday = keep; }
}

/* ── 年間行事計画表 ────────────────────────────
   **行事は日付にしか結びついていない。** 何校時かは表に書いていないので、
   自動でコマに入れない（外れたものを毎週打ち消す作業のほうが多くなる）。
   紙の日付ごとに候補として出し、押した人がコマを決める（docs/spec.md 6節）。 */
function eventsOn(d){
  const key = iso(addDays(monday, d));
  const e = (Y().events || {})[key];
  if(!e) return [];
  const out = [];
  if(e.c) out.push({text:e.c, who:"児童"});
  if(e.s) out.push({text:e.s, who:"職員"});
  return out;
}
const hasEvents = d => eventsOn(d).length > 0;
/* 年間行事計画表が持っている、その週の A週／B週。**参考として出すだけ。**
   どちらの週かは日付から決めている（3節）ので、こちらが勝つことはない。 */
function eventVariant(){
  for(let d = 0; d < DAYS; d++){
    const e = (Y().events || {})[iso(addDays(monday, d))];
    if(e && e.w) return e.w;
  }
  return "";
}

/* ── 週メモ ────────────────────────────────────
   **刷る紙は学級ごとなので、メモも学級ごとに持つ。**
   前は週にひとつしか無かったので、3-1 で書いたメモが 3-2 の紙にも出た。
   しかもこの端末にしか残らず、ほかの先生には見えなかった。

   持ち方はふつうのコマと同じ（時程のIDに `memo` を使い、月曜の行に置く）。
   専用の入れ物を作らないので、送る・読む・年度の退避が、そのまま全部効く。
   専科の週だけは置き場が無いので、全校のシートに `memo:教科コード` で置く。 */
function memoAt(){
  if(view.kind === "class")   return {layer:"home",   target:view.cls,   slot:"memo"};
  if(view.kind === "grade")   return {layer:"grade",  target:view.grade, slot:"memo"};
  if(view.kind === "school")  return {layer:"school", target:"",         slot:"memo"};
  if(view.kind === "special") return {layer:"school", target:"",         slot:"memo:" + view.sp};
  return null;
}
function memoBank(a){
  const w = week();
  if(a.layer === "school") return w.school;
  if(a.layer === "grade")  return (w.grade[a.target] || (w.grade[a.target] = {}));
  return (w.home[a.target] || (w.home[a.target] = {}));
}
function memoOf(){
  const a = memoAt();
  if(!a) return "";
  const e = memoBank(a)[ck(0, a.slot)];
  if(e && e.title) return e.title;
  /* 前の版はこの端末に `memos` として持っていた。捨てずに読む */
  return (week().memos || {})[viewName()] || "";
}
function setMemo(html){
  const a = memoAt();
  if(!a) return false;
  if(archivedYearNow()){ toast(ARCHIVED_WHY); return false; }
  const bank = memoBank(a), key = ck(0, a.slot), t = clean(html);
  /* 書き替える前に、サーバの時刻を控える（競合の物差し） */
  const was = (bank[key] || {}).sat || 0;
  const wasT = plain((bank[key] || {}).title);   /* たんぽぽ提出の判定に使う */
  if(!plain(t).trim() && !/<a\b/i.test(t)) delete bank[key];
  else bank[key] = {title:t, note:"", subject:null, sat:(bank[key] || {}).sat,
                    by:myEmail(), at:Date.now()};
  if((week().memos || {})[viewName()] !== undefined) delete week().memos[viewName()];
  Backend.cellChanged(a.layer, a.target, 0, a.slot, was, undefined, wasT);
  return save();
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
  if(archivedYearNow()){ toast(ARCHIVED_WHY); return false; }
  const w = week(), key = ck(d, DAY_SLOT);
  const was = (w.school[key] || {}).sat || 0;   /* 消す前に物差しを控える */
  const wasT = plain((w.school[key] || {}).title);
  if(!form) delete w.school[key];
  else w.school[key] = {title: escText(DAY_FORM[form].label), note:"", subject:null,
                        sat: (w.school[key] || {}).sat,
                        by: myEmail(), at: Date.now()};
  /* **学校全体の層として送る。** 全クラスの紙に効く */
  Backend.cellChanged("school", "", d, DAY_SLOT, was, undefined, wasT);
  return save();
}

/* ── 校外行事（被覆） ────────────────────────
   **題名にも備考にも入らない。** コマの上に薄く縦書きで「校外学習」と出る印で、
   連続して置けば枠がつながって1つの縦長になる。題名欄はコマごとに残るので、
   時数は今までどおり各コマの教科で数えられる（1限社会・2限理科もそのまま）。

   持ち方は**ふつうのコマと同じ**（時程のIDに `trip:時程` を使う）。
   `day`（日の形）・`memo`（週メモ）と同じ手で、専用の入れ物を作らない。
   だから書き込み・読み込み・競合・まだ送っていない数え方・年度の退避が、
   そのまま全部効く。**週案シートに列を足さない**（列を足すと、見出しの無い
   既存ファイルで黙って読み捨てられる ── writePlan は見出しを書き直さない）。 */
/* その層の棚に、このコマの被覆があるか */
const tripIn_ = (bank, d, slot) => !!(bank || {})[ck(d, TRIP_SLOT + slot)];

/* **どれか1つの層に印があれば被覆。**
   校外学習や自然学校は学年・全校で決まる行事なので、担任が自分の面から
   消せると、学年が入れた行事が担任ごとにまだらに消える。
   担任が外せるのは自分の層に入れたぶんだけ（tripOff の理由を見る）。 */
function tripOn(cls, d, slot){
  const w = week();
  return tripIn_(w.school, d, slot)
      || tripIn_(w.grade[gradeOf(cls)], d, slot)
      || tripIn_(w.special[cls], d, slot)
      || tripIn_(w.home[cls], d, slot);
}
/* いま開いている面から見た被覆。学級は層を重ねて見る。
   学年・全学年の面は、その面が持つぶんと全校のぶんだけ見る
   （担任が入れたぶんまで出すと、どの学級のものか分からなくなる）。 */
function tripHere(d, slot){
  const w = week();
  if(view.kind === "class")   return tripOn(view.cls, d, slot);
  if(view.kind === "special") return tripIn_(w.school, d, slot);
  if(view.kind === "grade")
    return tripIn_(w.school, d, slot) || tripIn_(w.grade[view.grade], d, slot);
  if(view.kind === "school")  return tripIn_(w.school, d, slot);
  return false;
}
/* この面から外せるか。外せないなら、どこから外すのかを返す。 */
function tripLockedBy(d, slot){
  if(tripIn_(targetStore(), d, slot)) return "";        /* 自分の層のぶん。外せる */
  const w = week();
  if(tripIn_(w.school, d, slot)) return "全学年";
  if(view.kind === "class" && tripIn_(w.grade[gradeOf(view.cls)], d, slot))
    return gradeOf(view.cls) + "年";
  return "";
}
/* 校外に覆われている授業コマの並び（その日ぶん）。紙もたんぽぽもここを見る */
function tripSlotsOn(cls, d){
  return SLOTS.filter(s => s.kind === "lesson" && tripOn(cls, d, s.id)).map(s => s.id);
}

/* ── 校外行事の名前 ────────────────────────────
   **行事ごとに違う。** 自然学校・社会見学・修学旅行を、学校ひとつの設定で
   持たせると、置くたびに設定を直して回ることになる。だから名前は
   **置いた行事**（trip: の行）が持つ。シートに列は足さない。

   題名 ＝ 紙に出す字（既定「校外学習」）
   詳細 ＝ たんぽぽに出す字（既定「校外」）

   **たんぽぽへ渡るのは詳細のほう。** 提出を覆すかどうかもこの字で決める
   （→ store.js tpTitleIn_ ・ gas/Store.gs の trip: の分岐）。
   紙の字を直しただけでは覆らず、たんぽぽの字を直せば覆る。 */
const tripNameIn_ = e => plain((e || {}).title).trim() || TRIP_NAME;
const tripTpIn_   = e => plain((e || {}).note).trim()  || TP_TRIP;
/* いちばん上の層の印を返す（tripOn と同じ順で見る） */
function tripEntry(cls, d, slot){
  const w = week(), k = ck(d, TRIP_SLOT + slot);
  return (w.school || {})[k] || ((w.grade[gradeOf(cls)] || {})[k])
      || ((w.special[cls] || {})[k]) || ((w.home[cls] || {})[k]) || null;
}
function tripEntryHere(d, slot){
  const w = week(), k = ck(d, TRIP_SLOT + slot);
  if(view.kind === "class")  return tripEntry(view.cls, d, slot);
  if(view.kind === "grade")  return (w.school || {})[k] || ((w.grade[view.grade] || {})[k]) || null;
  return (w.school || {})[k] || null;
}
const tripName = (d, slot) => tripNameIn_(tripEntryHere(d, slot));
const tripTp   = (d, slot) => tripTpIn_(tripEntryHere(d, slot));

/* 続けて置いたコマ（＝紙の上で1本のチップになるまとまり）。
   **業間・昼休みはまたぐ**（描くときと同じ数え方）。名前はこのまとまり単位で持つ。 */
function tripRun(d, slot){
  const ids = SLOTS.filter(s => s.kind === "lesson").map(s => s.id);
  const i = ids.indexOf(slot);
  if(i < 0 || !tripHere(d, slot)) return [];
  let a = i, b = i;
  while(a > 0 && tripHere(d, ids[a - 1])) a--;
  while(b < ids.length - 1 && tripHere(d, ids[b + 1])) b++;
  return ids.slice(a, b + 1);
}

/* 名前を直す。**1本のチップは同じ名前。** まとまりの全部のコマに同じ字を書く。
   直せるのは自分の層に入れたぶんだけ（外すのと同じ規則）。 */
function setTripName(d, slot, name, tp){
  const locked = whyLocked();
  if(locked) return locked;
  if(archivedYearNow()) return ARCHIVED_WHY;
  const who = tripLockedBy(d, slot);
  if(who) return "この校外行事は<b>" + escText(who) + "</b>が入れたもの。名前もその面から";
  const st = targetStore();
  for(const id of tripRun(d, slot)){
    const key = ck(d, TRIP_SLOT + id), e = st[key];
    if(!e) continue;                       /* その層に無いコマは飛ばす */
    const was = e.sat || 0, wasTp = tripTpIn_(e);
    if(name !== undefined) e.title = escText(String(name).trim());
    if(tp   !== undefined) e.note  = escText(String(tp).trim());
    e.by = myEmail(); e.at = Date.now();
    Backend.cellChanged(layerOfStore(), targetOfStore(), d, TRIP_SLOT + id, was,
                        undefined, wasTp);
  }
  save();
  return "";
}

/* 付け外し。**1コマずつ。** 続けて置けば、描くときに1つの縦長にまとまる。 */
function setTrip(d, slot, on){
  /* **休みの日にも置ける。** 自然学校のように休日・祝日をまたぐ行事がある。
     だから whyCantWrite は通さず、ロックだけを見る */
  const locked = whyLocked();
  if(locked) return locked;
  if(archivedYearNow()) return ARCHIVED_WHY;
  const st = targetStore(), key = ck(d, TRIP_SLOT + slot);
  if(!on && !st[key]){
    const who = tripLockedBy(d, slot);
    if(who) return "この校外学習は<b>" + escText(who) + "</b>が入れたもの。外すにはその面から";
    return "";
  }
  const was = (st[key] || {}).sat || 0;
  /* **たんぽぽへ渡る字で見る。** 題名（紙の字）で見ると、紙の字を直しただけで
     提出が覆り、たんぽぽの字を直しても覆らない（逆になる） */
  const wasTp = st[key] ? tripTpIn_(st[key]) : "";
  if(on){
    /* **隣から名前を引き継ぐ。** あとから1コマ足したときに、そこだけ
       「校外学習」に戻ると、1本のチップの中で名前が食い違う */
    const near = neighborTrip_(st, d, slot);
    st[key] = {title: near ? near.title : escText(TRIP_NAME),
               note:  near ? near.note  : "",
               subject:null, sat:(st[key] || {}).sat,
               by:myEmail(), at:Date.now()};
  }
  else delete st[key];
  Backend.cellChanged(layerOfStore(), targetOfStore(), d, TRIP_SLOT + slot, was,
                      undefined, wasTp);
  save();
  return "";
}
/* 同じ日の、前後に続く同じ層の印。名前を引き継ぐ相手を探す */
function neighborTrip_(st, d, slot){
  const ids = SLOTS.filter(s => s.kind === "lesson").map(s => s.id);
  const i = ids.indexOf(slot);
  if(i < 0) return null;
  for(let j = i - 1; j >= 0; j--){
    const e = st[ck(d, TRIP_SLOT + ids[j])];
    if(!e) break;
    return e;
  }
  for(let j = i + 1; j < ids.length; j++){
    const e = st[ck(d, TRIP_SLOT + ids[j])];
    if(!e) break;
    return e;
  }
  return null;
}

/* ── 授業なし（コマ1つ） ────────────────────────
   **題名そのものが印。** 専用の入れ物を作らないので、層の重なり・競合・
   取り消し・年度の退避が、そのまま全部効く（→ src/js/config.js NO_LESSON）。

   見るときは**紙に出ているコマ**（合成したあと）で見る。学年から降りてきた
   「授業なし」も、担任の面で斜め線になっていなければ意味が無い。 */
const noLessonIn_ = c => plain((c || {}).title).trim() === NO_LESSON;
/* そのクラスの紙で、このコマが授業なしか */
const noLessonOn = (cls, d, slot) => noLessonIn_(compose(cls, d, slot));
/* いま開いている面で、このコマが授業なしか */
const noLessonHere = (d, slot) => noLessonIn_(cellFor(d, slot));

/* 入れる・外す。**授業のコマにだけ入れられる。**
   朝休みや業間に入れても「授業がない」は情報にならない（もともと無い）。
   休みの日とロックは今までどおり止める（whyCantWrite をそのまま通す）。
   外すときは**題名だけ空にする。備考は消さない** ── 「学年行事のため」と
   書いたものを、授業を入れ直すたびに打ち直させない。 */
function setNoLesson(d, slot, on){
  if((SLOT_BY_ID[slot] || {}).kind !== "lesson")
    return "<b>授業のコマ</b>にだけ入れられる";
  const no = whyCantWrite(d, slot);
  if(no) return no;
  writeCell(d, slot, {title: on ? escText(NO_LESSON) : "", subject: null});
  return "";
}

