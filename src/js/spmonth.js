/* 専科どうしの月予定（仮）。

   **1ヶ月ぶんの専科の巡りを、干渉が起きないように計算して出す。**
   決めるのは「いつ・どの専科が・どのクラスへ行くか」だけで、
   担任が何をするかは決めない。

   絶対に守るもの（計算が破らない）
     ・全校の予定・学年の予定が入っているコマには置かない
     ・休み・特別校時・校外行事・授業なしのコマには置かない
     ・同じ時刻に、同じクラスへ2人の専科が行かない
     ・同じ時刻に、1人の専科が2クラスへ行かない

   最初の3つは**空き枠さがしと同じ判定**（compose.js の freeOne）をそのまま使う。
   判定を2か所に書くと、画面の ○△× と、この計算の出す案が食い違う。
   食い違ったことに気づけるのは、実際にその週になってからになる。

   希望（専科がチェックを入れる）は重みで効かせる。ぶつかったときの順は
     避ける日・午前のみ ＞ 2コマくっつける ＞ 基本時間割に近づける ＞ クラス分散
   上の2つは「本人がそこへ行けない」と言っているもの、下の2つは
   「そうなっていると良い」もの。**行けない日に置く案は出さない。** */

/* ── 希望の持ち方 ──────────────────────────────
   **専用の入れ物を作らない。** 日の形（day）・週メモ（memo）・校外行事（trip:）と
   同じ手で、全校層の1コマに入れる。時程のIDは `wish:<専科の身元>`、曜日は月曜（0）。
   送る・読む・競合・まだ送っていない数え方・年度の退避が、そのまま全部効く。
   **週案シートに列を足さない。**

   置く週は「その月の1日を含む週」。月ごとに1つ持つので、10月の出張を
   11月まで引きずらない。前の月の希望は、空のときの既定として読む
   （毎月チェックを入れ直させない）。 */
const SPW_SLOT = "wish:";
/* 保つ印。**中身は英字だけ**にしてある ── 題名は HTML として持つ欄なので、
   記号を入れると escape の往復で字が変わる */
const SPW_FLAGS = ["am", "pair", "base", "spread", "off"];

const spwBlank = () => ({am:false, pair:false, base:false, spread:false, off:false, days:[]});

function spwParse(s){
  const w = spwBlank();
  const t = String(s || "").trim();
  if(!t) return w;
  const cut = t.indexOf("/");
  const flags = cut < 0 ? t : t.slice(0, cut);
  const dates = cut < 0 ? "" : t.slice(cut + 1);
  for(const f of flags.split(/\s+/)) if(SPW_FLAGS.indexOf(f) >= 0) w[f] = true;
  w.days = dates.split(",").map(x => x.trim())
                .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
  return w;
}
/* **何も入っていない希望は、空文字にする。** 空文字にしておけば
   writeCell と同じ決まりでコマごと消える（消さないと、touch しただけの
   専科が「希望あり」として残る） */
function spwText(w){
  const flags = SPW_FLAGS.filter(k => w[k]);
  const days  = (w.days || []).slice().sort();
  if(!flags.length && !days.length) return "";
  return flags.join(" ") + "/" + days.join(",");
}

/* その月の希望を置く週の月曜。**月の1日を含む週。**
   4月の月予定では、この月曜が3月（前の年度）に落ちることがある。
   読みも書きもここ1つを通すので、落ちた先でもずれない。 */
const spwAnchor = (y, m) => mondayOf(new Date(y, m, 1));

/* いま入っている希望を読む。**無ければ前の月のぶんを既定にする。**
   戻り値の `carried` は「前の月から持ってきた」印で、画面がそう断る。 */
function spWishRead(y, m, code){
  const here = spwRaw_(spwAnchor(y, m), code);
  if(here !== null) return {wish: spwParse(here), carried:false};
  const prev = spwRaw_(spwAnchor(y, m - 1), code);
  return {wish: spwParse(prev === null ? "" : prev), carried: prev !== null};
}
/* その週の全校層から1コマ引く。**無ければ null**（空文字と区別する） */
function spwRaw_(mon, code){
  const keep = monday;
  monday = mon;
  try{
    const e = week().school[ck(0, SPW_SLOT + code)];
    return e ? plain(e.title) : null;
  } finally { monday = keep; }
}
/* 書く。**書き替える前にサーバの時刻を控える**（writeCell と同じ決まり）。
   変わっていないものは書かない ── 窓を開いて閉じるだけで、
   6人ぶんの未保存が出るのを避ける。 */
function spWishWrite(y, m, code, wish){
  const keep = monday;
  monday = spwAnchor(y, m);
  try{
    const w = week(), key = ck(0, SPW_SLOT + code), st = w.school;
    const t = spwText(wish);
    if(plain((st[key] || {}).title) === t && (t !== "" || !st[key])) return false;
    const was  = (st[key] || {}).sat || 0;
    const wasT = plain((st[key] || {}).title);
    if(!t) delete st[key];
    else st[key] = {title: escText(t), note:"", subject:null,
                    sat:(st[key] || {}).sat, by:myEmail(), at:Date.now()};
    Backend.cellChanged("school", "", 0, SPW_SLOT + code, was,
                        {year:fy(), monday:wkKey()}, wasT);
    return true;
  } finally { monday = keep; }
}

/* ── 対象の月 ──────────────────────────────────
   **カレンダーの月で取る**（「10月ぶん」と言われたものを、そのまま組む）。
   週は「1日を含む週」から「末日を含む週」まで。**境界の週は、その月に入る日だけ**を
   組み、月の外の日には手を触れない ── 触ると、翌月を組んだときに同じ日を
   二度組むことになり、あとから組んだほうが黙って前の案を潰す。 */
function spMonthWeeks(y, m){
  const last = new Date(y, m + 1, 0), out = [];
  for(let x = mondayOf(new Date(y, m, 1)); x <= last; x = addDays(x, 7)) out.push(x);
  return out;
}
const spMonthName = (y, m) => y + "年" + (m + 1) + "月";
/* 授業のコマ（休み時間を除く）。2コマくっつけるの組は、この並びで決まる */
const spLessons = () => SLOTS.filter(s => s.kind === "lesson");
/* **くっつけてよいのは 12・34・56 だけ。** 業間は2と3のあいだ、
   給食と昼休みは4と5のあいだに入るので、23 と 45 は続きにならない。
   並びの上から2つずつ数える（時程シートで校時を増やしても同じ規則で効く）。 */
const spPairOf = si => Math.floor(si / 2);
const spPaired = (a, b) => a !== b && spPairOf(a) === spPairOf(b);

/* ── 重み ──────────────────────────────────────
   **順は、希望がぶつかったときに何を先に通すかで決めてある。**

     置けない            どんな希望よりも重い。置けないものを置いたと言わない
     避ける日・午前のみ  本人が行けないと言っているもの。ほとんど破らない
     別の週へ動かす      その週の時数が変わる。希望のために動かす幅ではない
     2コマくっつける     図工・家庭のように2コマで1つの授業になるもの
     基本時間割に近づける 担任の紙の書き直しを減らす（同じ週の中のずれ）
     クラス分散          特定の週に同じクラスが固まらないようにする

   「基本時間割に近づける」にチェックを入れると重みが上がるが、
   **2コマくっつけるは越えない** ── 行事で崩れた2コマ授業を、
   基本の位置に居座らせるために1コマずつに割るのでは、直した意味が無い。 */
const SPW_UNPLACED = 10000;
const SPW_AVOID    = 900;      /* 避ける日に置いた */
const SPW_AM       = 900;      /* 午前のみの人を5・6校時に置いた */
/* **別の週へ動かすのは、希望より重い。** そのクラスのその週の時数が変わる
   ── 時数は週ごとに数えるもの（時数集計表も週ごとのシート）で、
   「2コマにしたい」のために動かしてよい幅ではない。
   週をまたぐのは、その週に置く場所がもう無いときだけ（置けないは 10000）。

   ここを 2コマくっつけるより軽くしていたときは、片割れが行事でつぶれた
   図工の2コマが、**そろって次の週へ飛んだ**（実測）。その週の図工が0になり、
   飛んだ先の週が4コマになる。 */
const SPW_WEEK     = 400;
const SPW_PAIR     = 200;      /* 2コマにならなかった1コマぶん */
/* 同じ週の中でのずれ。左＝ふだん／右＝「近づける」にチェックしたとき */
const SPW_BASE = {slot:[10, 30], day:[25, 60]};
/* 同じクラスを同じ日に2回。**クラス分散にチェックを入れたときだけ効く。**
   いつでも効かせると、基本時間割がもともと持っている2コマ続き
   （図図・理理・家家）を割りにいく ── 希望を1つも入れていないのに
   基本から 158コマ動く案が出た（実測）。基本の並びは、動かす理由が
   無いかぎり動かさない。 */
const SPW_SAMEDAY  = 50;
const SPW_SPREAD   = 20;       /* その週に、基本より多く入れた1コマぶん（2乗で効く） */

/* ── 下ごしらえ ────────────────────────────────
   週ごとに `monday` を差し替えて読む（freeTally と同じ手）。
   **ここで読み切って、あとは記憶の上だけで解く。** 解いている途中に
   週案の棚を触ると、途中の案が画面に出る。 */

/* 1コマ置けるか。**空き枠さがしのレベル1と同じ判定。**
   休みの日だけは freeOne の外にあるので（freeCtx が持っている）、ここで見る。 */
function spHardBusy(d, sid, cls){
  if(isDayOff(d) && !tripOn(cls, d, sid)) return "休み";
  const r = freeOne(d, sid, cls, {level:1, avoid:[], sp:""});
  return (r && r.st === "busy") ? r.why : "";
}

/* 解くのに要るものを、ぜんぶ集める。
     weeks   月曜の並び（Date）
     days    weeks[wi] の中で、その月に入っている曜日の並び
     units   組むコマ。1つが「この専科が、このクラスへ1回行く」
     allow   クラスごとの、置いてよい場所の並び
     taken   ほかの専科（計算に入れていない人）が既に押さえている場所 */
function spBuild(y, m, wishes, move){
  const weeks = spMonthWeeks(y, m);
  const lessons = spLessons(), nS = lessons.length;
  const sps = specials().filter(s => !(wishes[s.code] || spwBlank()).off);
  const inRun = {};
  for(const s of sps) inRun[s.code] = true;
  /* **見るのは、参加した専科が受け持つクラスだけ。** 全クラスを judge に掛けると、
     1回の計算で compose が 20クラス×30コマ×週数ぶん走る。受け持たないクラスの
     空き具合は、この計算のどこにも効かない */
  const clsSet = {};
  for(const s of sps) for(const c of classesOfSpecial(s.code)) clsSet[c] = 1;
  const clsList = allClasses().filter(c => clsSet[c]);

  const pos = (wi, d, si) => (wi * WEEKDAYS + d) * nS + si;
  const posWi = p => Math.floor(p / (WEEKDAYS * nS));
  const posD  = p => Math.floor(p / nS) % WEEKDAYS;
  const posSi = p => p % nS;

  const days = [], hard = {}, taken = {}, units = [], notes = [];
  const allowByCls = {};
  const keep = monday;
  try{
    for(let wi = 0; wi < weeks.length; wi++){
      monday = weeks[wi];
      const dayList = [];
      for(let d = 0; d < WEEKDAYS; d++){
        const dt = addDays(weeks[wi], d);
        /* **その月の日だけを組む。** 月の外の日は、いまの週案のまま置く */
        if(dt.getFullYear() === y && dt.getMonth() === m) dayList.push(d);
      }
      days.push(dayList);
      const w = week();
      for(const cls of clsList){
        const allow = allowByCls[cls] || (allowByCls[cls] = []);
        for(const d of dayList) for(let si = 0; si < nS; si++){
          const sid = lessons[si].id, p = pos(wi, d, si);
          const why = spHardBusy(d, sid, cls);
          if(why){ hard[p + "|" + cls] = why; continue; }
          /* ほかの専科が既に入れているコマは、動かさずに避ける。
             **基本時間割のぶんも見る** ── 基本は教師を持っていないので、
             担当学年から引かないと「誰も居ない」と読めてしまう */
          const e = (w.special[cls] || {})[ck(d, sid)];
          if(e && e.sp && !inRun[e.sp]){ taken[p + "|" + cls] = e.sp; continue; }
          if(!e){
            const b = baseCell(cls, d, sid);
            const owner = b && b.subject ? spOwnerOf_(cls, b.subject) : null;
            if(owner && !inRun[owner]){ taken[p + "|" + cls] = owner; continue; }
          }
          allow.push(p);
        }
      }
      /* 組むコマを、基本時間割から数える。**新しい入力は無い。**
         基本の字で数える（合成したあとで見ると、行事で潰れたコマが
         最初から無かったことになり、振り替える相手が消える） */
      for(const sp of sps){
        const sub = spSubjectOf(sp.code);
        for(const cls of classesOfSpecial(sp.code))
          for(const d of dayList) for(let si = 0; si < nS; si++){
            const b = baseCell(cls, d, lessons[si].id);
            if(!b || b.subject !== sub) continue;
            const home = pos(wi, d, si);
            const blocked = hard[home + "|" + cls] || taken[home + "|" + cls] || "";
            /* 行事でつぶれたコマを振り替えないときは、そのコマを作らない
               （つぶれたまま、時数が落ちる） */
            if(blocked && !move){ notes.push({sp:sp.code, cls, wi, d, si, why:blocked}); continue; }
            units.push({sp:sp.code, cls, home, wi, d, si, at:-1});
          }
      }
    }
  } finally { monday = keep; }

  /* **並びを決めておく。** 決めないと、同じ入力でも人によって別の案が出る
     （オブジェクトの鍵の順に頼らない） */
  units.sort((a, b) => (a.sp < b.sp ? -1 : a.sp > b.sp ? 1 : 0)
                    || (a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : 0)
                    || (a.home - b.home));
  for(const cls in allowByCls) allowByCls[cls].sort((a, b) => a - b);

  /* **基本時間割そのものが、同じ専科を同じコマに2クラス置いていることがある。**
     そのときは、置いた時点でどちらか一方が必ず動く ── 希望を1つも入れなくても
     案が基本からずれる。ずれた理由が計算にあると読まれないよう、ここで数えて
     名指しする（画面の「！2クラス」と同じことを、月ぶんまとめて言う）。
     直すのは基本時間割の側で、この計算では直せない。 */
  const seen = {}, baseClash = [];
  for(const u of units){
    const k = u.sp + "|" + u.home;
    if(seen[k]) baseClash.push({sp:u.sp, cls:u.cls, wi:u.wi, d:u.d, si:u.si,
                                with:seen[k]});
    else seen[k] = u.cls;
  }

  return {y, m, weeks, days, lessons, nS, sps, inRun, units, hard, taken,
          allow:allowByCls, notes, baseClash, wishes, pos, posWi, posD, posSi};
}

/* その教科のそのコマは、どの専科の枠のものか。**担当学年から引く。**
   同じ教科の枠が2つある学校（理科3・4年／理科5・6年）があるので、
   教科コードだけでは決まらない。どの枠にも当たらなければ null
   （担任が持つ音楽・図工は、専科のコマではない）。 */
function spOwnerOf_(cls, subject){
  const root = rootSubject(subject), g = gradeOf(cls);
  for(const s of specials()){
    if(spSubjectOf(s.code) !== root) continue;
    const gs = s.grades || [];
    if(!gs.length || gs.indexOf(g) >= 0) return s.code;
  }
  return null;
}

/* ── 減点 ──────────────────────────────────────
   1コマだけで決まるぶん（unitCost）と、専科×クラスのまとまりで決まるぶん
   （spGroupCost）に分ける。動かしたときに数え直すのは、動いたコマの
   まとまりだけで済む ── 全部を数え直すと、1回の評価が全体の大きさに比例する。 */
function spUnitCost(cx, u){
  if(u.at < 0) return SPW_UNPLACED;
  const w = cx.wishes[u.sp] || spwBlank();
  let c = 0;
  const wi = cx.posWi(u.at), d = cx.posD(u.at), si = cx.posSi(u.at);
  if(w.days.length){
    const iso_ = iso(addDays(cx.weeks[wi], d));
    if(w.days.indexOf(iso_) >= 0) c += SPW_AVOID;
  }
  /* 午前のみ。**「午前」は時程で決める**（校時の数が学校で違う）。
     昼休みより前の授業のコマを午前とみなす */
  if(w.am && si >= cx.amCut) c += SPW_AM;
  const k = w.base ? 1 : 0;
  if(u.at !== u.home){
    if(wi !== u.wi)      c += SPW_WEEK + SPW_BASE.day[k];
    else if(d !== u.d)   c += SPW_BASE.day[k];
    else                 c += SPW_BASE.slot[k];
  }
  return c;
}
/* その専科×そのクラスの、まとまりで決まる減点。
   2コマくっつける・同じ日の重なり・週ごとの偏りを、ここでまとめて見る。 */
function spGroupCost(cx, sp, cls){
  const w = cx.wishes[sp] || spwBlank();
  const list = cx.byPair[sp + "|" + cls] || [];
  const perWeek = {}, perDay = {}, ideal = {};
  for(const i of list){
    const u = cx.units[i];
    ideal[u.wi] = (ideal[u.wi] || 0) + 1;
    if(u.at < 0) continue;
    const wi = cx.posWi(u.at), d = cx.posD(u.at);
    perWeek[wi] = (perWeek[wi] || 0) + 1;
    (perDay[wi + "|" + d] || (perDay[wi + "|" + d] = [])).push(cx.posSi(u.at));
  }
  let c = 0;
  /* 同じ日に2回。**2コマくっつけるの組になっているときは重ならない** */
  if(w.spread) for(const k in perDay){
    const sis = perDay[k].slice().sort((a, b) => a - b);
    let n = sis.length;
    if(w.pair) for(let i = 0; i + 1 < sis.length; i += 2)
      if(spPaired(sis[i], sis[i + 1])) n--;         /* 組んだ2つで1つと数える */
    c += (n - 1 > 0 ? n - 1 : 0) * SPW_SAMEDAY;
  }
  /* 2コマくっつける。**その週に2コマ以上あるときだけ効く。**
     週に1コマしかないクラスに「くっつけろ」は成り立たない */
  if(w.pair) for(const wi in perWeek){
    const n = perWeek[wi];
    if(n < 2) continue;
    let paired = 0;
    for(const k in perDay){
      if(k.indexOf(wi + "|") !== 0) continue;
      const sis = perDay[k].slice().sort((a, b) => a - b);
      for(let i = 0; i + 1 < sis.length; i += 2) if(spPaired(sis[i], sis[i + 1])) paired += 2;
    }
    c += (n - paired) * SPW_PAIR;
  }
  /* クラス分散。**その週に、基本より多く入れたぶん**を2乗で見る。
     多いほうだけを見る（少ないぶんは「置けなかった」で既に重く出ている） */
  if(w.spread) for(const wi in perWeek){
    const over = perWeek[wi] - (ideal[wi] || 0);
    if(over > 0) c += over * over * SPW_SPREAD;
  }
  return c;
}

/* ── 解く ──────────────────────────────────────
   **乱数を使わない。** 同じ入力なら、誰の画面でも同じ案が出る。
   人によって違う案が出ると、「どちらが本物か」を決める話が毎回いる。

   初めは基本時間割のまま置く → 置けなかったものを入れる →
   1コマずつ、いちばん良くなる場所へ動かす（良くならなくなるまで）。 */
const SPW_PASS = 8;              /* 動かし直す回数の上限 */
const SPW_MS   = 4000;           /* これを過ぎたら、その時点の案で止める */

function spSolve(cx){
  const U = cx.units;
  /* 午前の境目。**昼休みより前**（時程シートで校時が増えても同じ規則） */
  const lun = SLOTS.findIndex(s => s.kind === "brk" && s.id === "lun");
  cx.amCut = lun < 0 ? 4 : cx.lessons.filter((s, i) => SLOTS.indexOf(s) < lun).length;

  cx.byPair = {};
  for(let i = 0; i < U.length; i++){
    const u = U[i];
    (cx.byPair[u.sp + "|" + u.cls] || (cx.byPair[u.sp + "|" + u.cls] = [])).push(i);
  }
  /* いま誰がどこを押さえているか。クラス側と専科側の両方で見る */
  const byCls = {}, bySp = {};
  const kc = (p, cls) => p + "|" + cls, ks = (p, sp) => p + "|" + sp;
  const put = (i, p) => {
    const u = U[i];
    u.at = p;
    if(p >= 0){ byCls[kc(p, u.cls)] = i; bySp[ks(p, u.sp)] = i; }
  };
  const lift = i => {
    const u = U[i];
    if(u.at >= 0){ delete byCls[kc(u.at, u.cls)]; delete bySp[ks(u.at, u.sp)]; }
    u.at = -1;
  };
  /* そこへ置けるか。置けないなら、どのコマがどいてくれれば置けるかを返す。
       null      置けない（ふさがっている／2人ぶんどかす必要がある）
       -1        そのまま置ける
       >=0       このコマが別の場所へ動けば置ける */
  const blocker = (i, p) => {
    const u = U[i];
    if(cx.hard[kc(p, u.cls)] !== undefined || cx.taken[kc(p, u.cls)] !== undefined) return null;
    const a = byCls[kc(p, u.cls)], b = bySp[ks(p, u.sp)];
    const ax = a === undefined || a === i, bx = b === undefined || b === i;
    if(ax && bx) return -1;
    if(!ax && !bx && a !== b) return null;          /* 2人ぶんは動かさない */
    return ax ? b : a;
  };

  /* まとまりの減点を、いま数え直す */
  const gcost = (sp, cls) => spGroupCost(cx, sp, cls);

  /* 1. 基本時間割のまま置く */
  for(let i = 0; i < U.length; i++){
    const u = U[i];
    if(blocker(i, u.home) === -1) put(i, u.home);
  }
  /* 2. 置けなかったものを先に入れる（置けないの減点がいちばん重い） */
  for(let i = 0; i < U.length; i++) if(U[i].at < 0) bestMove(i);
  /* 3. 良くならなくなるまで動かす。

     **減点が 0 のコマは飛ばす。** 動かしても良くならない（減点は
     そのコマとそのまとまりだけで決まるので、0 より下は無い）。
     入れ替えで相手が得をする手は、**相手の番に同じ入れ替えとして出る**
     ので、こちらで拾わなくても落ちない。
     希望を1つも入れない月では、これで大半のコマが最初の1回で片付く。 */
  const t0 = Date.now();
  for(let pass = 0; pass < SPW_PASS; pass++){
    let moved = 0;
    for(let i = 0; i < U.length; i++){
      const u = U[i];
      if(u.at >= 0 && !spUnitCost(cx, u) && !gcost(u.sp, u.cls)) continue;
      if(bestMove(i)) moved++;
      if(Date.now() - t0 > SPW_MS) return finish(true);
    }
    if(!moved) break;
  }
  return finish(false);

  /* そのコマを動かして、いちばん良くなる場所を探す。動かしたら true。

     **減点の差は、動かす前と動かしたあとを両方その場で数えて引く。**
     片方を外で数えて使い回すと、同じ専科・同じクラスのコマどうしを
     入れ替えたときに、まとまりの減点を二重に数える（数えた案のほうが
     良く見えるので、実際には悪い案が採られる）。 */
  function bestMove(i){
    const u = U[i], list = cx.allow[u.cls] || [];
    const from = u.at;
    let bestP = -1, bestSwap = -1, bestGain = 0;
    for(const p of list){
      if(p === from) continue;
      const b = blocker(i, p);
      if(b === null) continue;
      let gain;
      if(b === -1){
        const was = spUnitCost(cx, u) + gcost(u.sp, u.cls);
        lift(i); put(i, p);
        gain = was - (spUnitCost(cx, u) + gcost(u.sp, u.cls));
        lift(i); if(from >= 0) put(i, from);
      }else{
        /* 入れ替える。**相手が、自分のいた場所へ入れるときだけ。**
           入れなければ入れ替えは成り立たない（相手が宙に浮く） */
        if(from < 0) continue;
        const v = U[b];
        if(cx.hard[kc(from, v.cls)] !== undefined
           || cx.taken[kc(from, v.cls)] !== undefined) continue;
        lift(i);
        const can = blocker(b, from) === -1;
        put(i, from);
        if(!can) continue;
        /* 同じ専科×同じクラスのときは、まとまりが1つしかない。2回数えない */
        const same = (u.sp === v.sp && u.cls === v.cls);
        const gWas = same ? gcost(u.sp, u.cls)
                          : gcost(u.sp, u.cls) + gcost(v.sp, v.cls);
        const cWas = spUnitCost(cx, u) + spUnitCost(cx, v);
        lift(i); lift(b); put(i, p); put(b, from);
        const gNow = same ? gcost(u.sp, u.cls)
                          : gcost(u.sp, u.cls) + gcost(v.sp, v.cls);
        gain = (gWas + cWas) - (gNow + spUnitCost(cx, u) + spUnitCost(cx, v));
        lift(i); lift(b); put(b, p); put(i, from);
      }
      /* **良くならない手は採らない。** 同点でも動かさない ──
         同点の手を採ると、2つの案のあいだを行き来して止まらなくなる */
      if(gain > bestGain + 1e-9){ bestGain = gain; bestP = p; bestSwap = b; }
    }
    if(bestP < 0) return false;
    if(bestSwap === -1){ lift(i); put(i, bestP); }
    else { lift(i); lift(bestSwap); put(i, bestP); put(bestSwap, from); }
    return true;
  }

  function finish(cut){
    const out = {cx, cut, placed:[], unplaced:[], moved:[], score:0};
    for(const u of U){
      out.score += spUnitCost(cx, u);
      if(u.at < 0){
        out.unplaced.push({sp:u.sp, cls:u.cls, wi:u.wi, d:u.d, si:u.si,
                           why: cx.hard[kc(u.home, u.cls)]
                             || (cx.taken[kc(u.home, u.cls)]
                                 ? "ほかの専科が入っている" : "空いているコマが無い")});
        continue;
      }
      out.placed.push(u);
      if(u.at !== u.home) out.moved.push(u);
    }
    const seen = {};
    for(const u of U) if(!seen[u.sp + "|" + u.cls]){
      seen[u.sp + "|" + u.cls] = 1;
      out.score += gcost(u.sp, u.cls);
    }
    out.wishNg = spWishNg(cx, out);
    return out;
  }
}

/* 希望が通らなかった件数。**数えたものを出す**（一覧を目で数え直させない） */
function spWishNg(cx, res){
  const out = {};
  for(const s of cx.sps) out[s.code] = {avoid:0, am:0, pair:0, base:0, spread:0};
  for(const u of res.placed){
    const w = cx.wishes[u.sp] || spwBlank(), n = out[u.sp];
    if(!n) continue;
    const wi = cx.posWi(u.at), d = cx.posD(u.at), si = cx.posSi(u.at);
    if(w.days.length && w.days.indexOf(iso(addDays(cx.weeks[wi], d))) >= 0) n.avoid++;
    if(w.am && si >= cx.amCut) n.am++;
    if(u.at !== u.home) n.base++;
  }
  /* 2コマ・分散は、まとまりを見ないと数えられない */
  for(const key in cx.byPair){
    const [sp, cls] = key.split("|");
    const w = cx.wishes[sp] || spwBlank(), n = out[sp];
    if(!n || (!w.pair && !w.spread)) continue;
    const perWeek = {}, perDay = {}, ideal = {};
    for(const i of cx.byPair[key]){
      const u = cx.units[i];
      ideal[u.wi] = (ideal[u.wi] || 0) + 1;
      if(u.at < 0) continue;
      const wi = cx.posWi(u.at);
      perWeek[wi] = (perWeek[wi] || 0) + 1;
      (perDay[wi + "|" + cx.posD(u.at)] || (perDay[wi + "|" + cx.posD(u.at)] = []))
        .push(cx.posSi(u.at));
    }
    for(const wi in perWeek){
      if(w.pair && perWeek[wi] >= 2){
        let paired = 0;
        for(const k in perDay){
          if(k.indexOf(wi + "|") !== 0) continue;
          const sis = perDay[k].slice().sort((a, b) => a - b);
          for(let i = 0; i + 1 < sis.length; i += 2) if(spPaired(sis[i], sis[i + 1])) paired += 2;
        }
        n.pair += perWeek[wi] - paired;
      }
      if(w.spread && perWeek[wi] > (ideal[wi] || 0)) n.spread += perWeek[wi] - (ideal[wi] || 0);
    }
  }
  return out;
}

/* ── 入れる ────────────────────────────────────
   **基本時間割がそのまま出すコマは、書かない。** 書くと、20クラス×4週ぶんの
   行が週案シートに増えるだけで、紙に出る中身は1つも変わらない。
   書くのは「基本と違う場所へ動いたコマ」と「基本の字が別のもので潰れているコマ」。

   まず、参加した専科がその月に入れてある専科コマをどける。どけないと、
   前に組んだ案の残りが新しい案と混ざり、どちらの案でもない月になる。 */
function spApply(res){
  const cx = res.cx, keep = monday;
  let wrote = 0, cleared = 0;
  const stale = [];
  try{
    /* 1. どける */
    for(let wi = 0; wi < cx.weeks.length; wi++){
      monday = cx.weeks[wi];
      const w = week();
      for(const cls of allClasses()){
        const bank = w.special[cls];
        if(!bank) continue;
        for(const d of cx.days[wi]) for(let si = 0; si < cx.nS; si++){
          const key = ck(d, cx.lessons[si].id), e = bank[key];
          if(!e || !e.sp || !cx.inRun[e.sp]) continue;
          const was = e.sat || 0, wasT = plain(e.title);
          delete bank[key];
          Backend.cellChanged("special", cls, d, cx.lessons[si].id, was,
                              {year:fy(), monday:wkKey()}, wasT);
          cleared++;
        }
      }
    }
    /* 2. 書く。**基本がそのまま出しているコマは書かない** */
    for(const u of res.placed){
      const wi = cx.posWi(u.at), d = cx.posD(u.at), si = cx.posSi(u.at);
      monday = cx.weeks[wi];
      const sid = cx.lessons[si].id, sub = SUB_BY_CODE[spSubjectOf(u.sp)];
      const cur = compose(u.cls, d, sid);
      if(cur.layer === "base" && rootSubject(cur.subject) === spSubjectOf(u.sp)) continue;
      const w = week(), key = ck(d, sid);
      const bank = w.special[u.cls] || (w.special[u.cls] = {});
      const was = (bank[key] || {}).sat || 0, wasT = plain((bank[key] || {}).title);
      bank[key] = {title: escText(sub ? sub.name : spLabel(spOf(u.sp))),
                   subject: spSubjectOf(u.sp), sp: u.sp, note: (bank[key] || {}).note || "",
                   sat: was, by: myEmail(), at: Date.now()};
      Backend.cellChanged("special", u.cls, d, sid, was,
                          {year:fy(), monday:wkKey()}, wasT);
      wrote++;
    }
    /* 3. 基本から動かしたコマのうち、**元の場所に基本の字が残るもの**を数える。
       そこは担任が入れ直すところ ── 専科の層には「このコマはもう無い」を
       書く手が無いので、黙っていると紙に古い授業が残る */
    for(const u of res.moved){
      monday = cx.weeks[u.wi];
      const sid = cx.lessons[u.si].id;
      const cur = compose(u.cls, u.d, sid);
      if(cur.layer === "base" && rootSubject(cur.subject) === spSubjectOf(u.sp))
        stale.push({sp:u.sp, cls:u.cls, wi:u.wi, d:u.d, si:u.si});
    }
  } finally { monday = keep; }
  save();
  return {wrote, cleared, stale};
}

/* 入れると、誰の予定を潰すか。**書く前に数える**（窓に出す）。 */
function spWouldOverwrite(res){
  const cx = res.cx, keep = monday, hit = [];
  try{
    for(const u of res.placed){
      const wi = cx.posWi(u.at), d = cx.posD(u.at), si = cx.posSi(u.at);
      monday = cx.weeks[wi];
      const cur = compose(u.cls, d, cx.lessons[si].id);
      if(cur.layer === "base" || cur.layer === "special") continue;
      const t = plain(cur.title).trim();
      if(!t || isMe(cur.by)) continue;
      hit.push({cls:u.cls, wi, d, si, from:t, who:whoName(cur.by)});
    }
  } finally { monday = keep; }
  return hit;
}

/* ══ 窓 ══════════════════════════════════════════════
   **画面だけのもの。紙には出さない。** 枠を決めている最中の作業であって、
   刷って残す情報ではない（空き枠さがし・年間行事の印と同じ扱い）。

   流れは1本道にしてある ── 月を決める → 希望を入れる → くむ → 見る → 入れる。
   途中で分かれ道を作ると、どこまで済んだのかが画面から読めなくなる。 */
let spmY = 0, spmM = 0;          /* 組む月 */
let spmWish = {};                /* 専科の身元 → 希望 */
let spmCarried = {};             /* 前の月から持ってきた印 */
let spmRes = null;               /* いまの案。入れるまで週案には触らない */
let spmMoveBroken = true;        /* 行事でつぶれたコマを別の枠へ移すか */
/* **この窓で希望を触ったか。** 触っていないのに書き出すと、窓を開いて
   閉じただけで6人ぶんの未保存が出る（先月から引き継いだ希望が、
   見ただけで今月のものとして書き込まれる）。 */
let spmDirty = false;

function openSpMonth(){
  if(view.kind === "gate" || view.kind === "tanpopo")
    return toast("専科か全学年の週案を開いてから押す");
  if(!specials().length)
    return toast("専科の枠がありません。<b>学級編成の「専科」</b>で足す");
  const now = new Date(monday);
  spmY = now.getFullYear(); spmM = now.getMonth();
  spmRes = null;
  spmLoad(() => { $("spmDlg").showModal(); });
}

/* その月ぶんの週を読んでから描く。**読めていない週を「空いている」と読まない。**
   読めていない週は、全校・学年の予定が1つも入っていないように見えるので、
   そこへ専科を並べた案が出てしまう（いちばん避けたい間違え方）。 */
function spmLoad(after){
  const mons = spMonthWeeks(spmY, spmM).slice();
  mons.push(spwAnchor(spmY, spmM - 1));            /* 先月の希望を引き継ぐため */
  const byFy = {};
  for(const m of mons) (byFy[fyOf(m)] || (byFy[fyOf(m)] = {}))[iso(m)] = true;
  const w = Wait.begin(spMonthName(spmY, spmM) + "ぶんの週を読んでいます");
  readByFy(byFy, () => {
    Wait.end(w);
    spmWish = {}; spmCarried = {}; spmDirty = false;
    for(const s of specials()){
      const r = spWishRead(spmY, spmM, s.code);
      spmWish[s.code] = r.wish;
      spmCarried[s.code] = r.carried;
    }
    spmDraw();
    after && after();
  });
}

function spmStep(n){
  const d = new Date(spmY, spmM + n, 1);
  spmY = d.getFullYear(); spmM = d.getMonth();
  spmRes = null;
  spmLoad();
}

function spmDraw(){
  $("spmMonth").textContent = spMonthName(spmY, spmM);
  const weeks = spMonthWeeks(spmY, spmM);
  $("spmRange").textContent = md(weeks[0]) + "の週 → "
    + md(addDays(weeks[weeks.length - 1], 5)) + "の週（" + weeks.length + "週）";
  spmDrawWish();
  spmDrawOut();
}

/* 希望の表。**1行が1人ぶんの枠。** 列は効き方の強い順に左から並べる */
function spmDrawWish(){
  const box = $("spmWish");
  const head = "<tr><th>組む</th><th>専科</th><th>避ける日</th>"
    + "<th>午前のみ</th><th>2コマ<br>くっつける</th><th>基本に<br>近づける</th>"
    + "<th>クラス<br>分散</th></tr>";
  const rows = specials().map(s => {
    const w = spmWish[s.code] || (spmWish[s.code] = spwBlank());
    const cb = (k, on) => "<input type='checkbox' data-sp='" + escText(s.code)
      + "' data-w='" + k + "'" + (on ? " checked" : "") + ">";
    return "<tr><td>" + cb("on", !w.off) + "</td>"
      + "<td class='spmname'>" + escText(spLabel(s))
      + (spmCarried[s.code] ? "<i class='spmcar'>先月から</i>" : "") + "</td>"
      + "<td><button class='btn spmdays' data-sp='" + escText(s.code) + "'>"
      + (w.days.length ? w.days.length + "日" : "選ぶ") + "</button></td>"
      + "<td>" + cb("am", w.am) + "</td><td>" + cb("pair", w.pair) + "</td>"
      + "<td>" + cb("base", w.base) + "</td><td>" + cb("spread", w.spread) + "</td></tr>";
  }).join("");
  box.innerHTML = head + rows;
  for(const c of box.querySelectorAll("input[type=checkbox]"))
    c.onchange = () => {
      const w = spmWish[c.dataset.sp];
      if(c.dataset.w === "on") w.off = !c.checked;
      else w[c.dataset.w] = c.checked;
      spmDirty = true; spmRes = null; spmDrawOut();
    };
  for(const b of box.querySelectorAll(".spmdays"))
    b.onclick = () => spmOpenDays(b.dataset.sp);
}

/* 避ける日。**その月のカレンダーから押して選ぶ。**
   打ち込ませると、書き方（10/15・10月15日・2026-10-15）が人ごとに割れる */
let spmDaysSp = "";
function spmOpenDays(code){
  spmDaysSp = code;
  const sp = spOf(code);
  $("spmDaysTtl").textContent = (sp ? spLabel(sp) : code) + "　避ける日";
  spmDrawDays();
  $("spmDaysDlg").showModal();
}
function spmDrawDays(){
  const w = spmWish[spmDaysSp] || spwBlank();
  const weeks = spMonthWeeks(spmY, spmM);
  let html = "<table class='grid2'><tr><th></th>"
    + DOW.slice(0, WEEKDAYS).map(x => "<th>" + x + "</th>").join("") + "</tr>";
  for(const mon of weeks){
    html += "<tr><th>" + md(mon) + "</th>";
    for(let d = 0; d < WEEKDAYS; d++){
      const dt = addDays(mon, d);
      if(dt.getFullYear() !== spmY || dt.getMonth() !== spmM){ html += "<td></td>"; continue; }
      const k = iso(dt), on = w.days.indexOf(k) >= 0;
      html += "<td><button class='btn spmd" + (on ? " on" : "") + "' data-d='" + k + "'"
        + " aria-pressed='" + on + "'>" + dt.getDate() + "</button></td>";
    }
    html += "</tr>";
  }
  html += "</table>";
  const box = $("spmDaysBody");
  box.innerHTML = html;
  for(const b of box.querySelectorAll(".spmd"))
    b.onclick = () => {
      const i = w.days.indexOf(b.dataset.d);
      if(i < 0) w.days.push(b.dataset.d); else w.days.splice(i, 1);
      spmDirty = true; spmRes = null;
      spmDrawDays(); spmDrawWish(); spmDrawOut();
    };
}

/* ── くむ ────────────────────────────────────── */
function spmRun(){
  const on = specials().filter(s => !(spmWish[s.code] || spwBlank()).off);
  if(!on.length) return toast("<b>組む専科を1人以上えらぶ</b>");
  const w = Wait.begin("専科の月予定をくんでいます");
  /* 待ちの表示を1回出させてから解く。**解いているあいだは画面が止まる**ので、
     止まる前に「いま計算している」と出しておく（そうしないと、押したのに
     何も起きない時間ができる） */
  setTimeout(() => {
    try{
      const cx = spBuild(spmY, spmM, spmWish, spmMoveBroken);
      spmRes = cx.units.length ? spSolve(cx) : {cx, cut:false, placed:[], unplaced:[],
                                                moved:[], score:0, wishNg:{}};
      spmRes.over = spWouldOverwrite(spmRes);
    } finally { Wait.end(w); }
    spmDrawOut();
  }, 30);
}

const spmWhen = (cx, wi, d, si) =>
  md(addDays(cx.weeks[wi], d)) + "（" + DOW[d] + "）" + cx.lessons[si].name + "校時";
const spmSpName = code => { const s = spOf(code); return s ? spLabel(s) : code; };
/* 週の表に出す名前。**教科名だけ。**
   同じ教科の枠が2つある学校（理科3・4年／理科5・6年）でも、
   となりに出るクラス名が学年を言うので、枠の学年まで書かなくても見分けられる。
   1つのコマに何人も並ぶので、ここが長いとクラス名のほうが切れる。 */
function spmShort(code){
  const sub = SUB_BY_CODE[spSubjectOf(code)];
  return sub ? sub.name : spmSpName(code);
}

function spmDrawOut(){
  const box = $("spmOut");
  const btn = $("spmApply");
  if(!spmRes){
    box.innerHTML = "<p class='spmlead'>希望を入れてから<b>「くむ」</b>を押す。"
      + "押すまで週案には何も書かない。</p>";
    btn.disabled = true;
    return;
  }
  const r = spmRes, cx = r.cx;
  const n = r.placed.length + r.unplaced.length;
  let html = "<div class='spmsum'>"
    + "<b>" + n + "コマ</b>を組んだ"
    + "　置けなかった <b class='" + (r.unplaced.length ? "ng" : "") + "'>"
    + r.unplaced.length + "</b>"
    + "　基本から動かした <b>" + r.moved.length + "</b>"
    + "　ほかの人の予定を潰す <b class='" + (r.over.length ? "ng" : "") + "'>"
    + r.over.length + "</b></div>";
  if(r.cut) html += "<p class='spmlead'>計算に時間がかかったので、"
    + "<b>途中の案で止めた</b>。希望を減らすと、もう少し良い案が出ることがある。</p>";
  if(cx.notes.length) html += "<p class='spmlead'>行事でつぶれた <b>"
    + cx.notes.length + "コマ</b>は、移さずにそのままにした"
    + "（上の「別の枠へ移す」を入れると振り替える）。</p>";
  /* **基本から動いた理由が、基本の側にあることを言う。**
     言わないと、計算が勝手に動かしたと読まれる */
  if(cx.baseClash.length) html += "<p class='spmlead'><b>基本時間割そのものが、"
    + "同じ専科を同じコマに2クラス以上置いているところが " + cx.baseClash.length
    + "コマぶんある。</b>そこは希望を入れなくても必ず動く"
    + "（直すのは基本時間割の側で、この計算では直せない）。"
    + "下の「基本時間割から動かしたコマ」に入っている。</p>";

  /* 週ごとの表。**「いつ・誰が・どこへ」を1枚で読む。**
     専科ごとに分けて出すと、干渉していないことがその画面では分からない */
  for(let wi = 0; wi < cx.weeks.length; wi++){
    const at = {};
    for(const u of r.placed){
      if(cx.posWi(u.at) !== wi) continue;
      const k = cx.posD(u.at) + "|" + cx.posSi(u.at);
      (at[k] || (at[k] = [])).push(u);
    }
    html += "<h3>" + md(cx.weeks[wi]) + " の週</h3>"
      + "<table class='grid2 spmwk'><tr><th></th>"
      + DOW.slice(0, WEEKDAYS).map((x, d) =>
          "<th>" + x + (cx.days[wi].indexOf(d) < 0 ? "<i>月外</i>" : "") + "</th>").join("")
      + "</tr>";
    for(let si = 0; si < cx.nS; si++){
      html += "<tr><th>" + escText(cx.lessons[si].name) + "</th>";
      for(let d = 0; d < WEEKDAYS; d++){
        if(cx.days[wi].indexOf(d) < 0){ html += "<td class='spmoff'></td>"; continue; }
        const list = (at[d + "|" + si] || []).slice()
          .sort((a, b) => a.sp < b.sp ? -1 : a.sp > b.sp ? 1 : 0);
        html += "<td>" + list.map(u =>
            "<span class='spmcell" + (u.at === u.home ? "" : " mv") + "'>"
            + escText(spmShort(u.sp)) + " " + escText(u.cls) + "</span>").join("")
          + "</td>";
      }
      html += "</tr>";
    }
    html += "</table>";
  }

  /* **置けなかったものを、黙って落とさない。** 入らなかったものを入れたと言わない */
  if(r.unplaced.length){
    html += "<h3>置けなかったコマ（" + r.unplaced.length + "）</h3><ul class='spmlist'>";
    for(const u of r.unplaced)
      html += "<li><b>" + escText(spmSpName(u.sp)) + " " + escText(u.cls) + "</b>　"
        + escText(spmWhen(cx, u.wi, u.d, u.si)) + "　" + escText(u.why) + "</li>";
    html += "</ul>";
  }
  /* **基本から動かしたコマは、元の場所に基本の字が残る。**
     そこは担任が入れ直すところなので、名指しで出す */
  if(r.moved.length){
    /* **クラス順に並べる。** 読むのは担任なので、自分のクラスのぶんが
       続けて出ていないと、66件の中から目で拾うことになる */
    html += "<h3>基本時間割から動かしたコマ（" + r.moved.length + "）"
      + "<i class='spmnote'>元の場所には基本時間割の字が残る。担任が入れ直すところ。"
      + "下の「文字でコピー」でそのまま渡せる</i></h3>"
      + "<ul class='spmlist spmscroll'>";
    for(const u of spmMovedRows(r))
      html += "<li><b>" + escText(u.cls) + "　" + escText(spmSpName(u.sp)) + "</b>　"
        + escText(u.from) + " → " + escText(u.to) + "</li>";
    html += "</ul><div class='spmcopy'><button class='btn' id='spmCopy'>"
      + "この一覧を文字でコピー</button></div>";
  }
  if(r.over.length){
    html += "<h3>ほかの人の予定を潰すコマ（" + r.over.length + "）</h3><ul class='spmlist'>";
    for(const o of r.over)
      html += "<li><b>" + escText(o.cls) + "</b>　"
        + escText(spmWhen(cx, o.wi, o.d, o.si)) + "　"
        + escText(o.from) + (o.who ? "（" + escText(o.who) + "）" : "") + "</li>";
    html += "</ul>";
  }
  /* 希望の通り具合。**通った数ではなく、通らなかった数を出す。**
     通った数は分母が要るので、読むのに一手いる */
  html += "<h3>専科ごとの結果<i class='spmnote'>チェックを入れた希望の"
    + "「通らなかった数」と、基本時間割から動いた数</i></h3><table class='sys spmng'>";
  for(const s of cx.sps){
    const g = r.wishNg[s.code] || {};
    const w = spmWish[s.code] || spwBlank();
    const part = [];
    if(w.days.length) part.push("避ける日 " + (g.avoid || 0));
    if(w.am)     part.push("午前のみ " + (g.am || 0));
    if(w.pair)   part.push("2コマ " + (g.pair || 0));
    if(w.spread) part.push("クラス分散 " + (g.spread || 0));
    part.push("基本から動いた " + (g.base || 0));
    html += "<tr><th>" + escText(spLabel(s)) + "</th><td>" + part.join("　") + "</td></tr>";
  }
  html += "</table>";
  box.innerHTML = html;
  btn.disabled = !r.placed.length;
  const cp = $("spmCopy");
  if(cp) cp.onclick = () => copyText(
    spMonthName(spmY, spmM) + "　専科の月予定で、基本時間割から動かしたコマ\n"
    + "（元の場所には基本時間割の字が残ります。入れ直してください）\n"
    + spmMovedRows(r).map(u => u.cls + "\t" + spmSpName(u.sp) + "\t"
                              + u.from + "\t→\t" + u.to).join("\n"),
    "<b>動かしたコマの一覧をコピーした。</b>そのまま貼って渡せる");
}

/* 動かしたコマを、担任が読む順（クラス → 日付）に並べて字にする */
function spmMovedRows(r){
  const cx = r.cx;
  return r.moved.map(u => ({
      sp:u.sp, cls:u.cls,
      from: spmWhen(cx, u.wi, u.d, u.si),
      to:   spmWhen(cx, cx.posWi(u.at), cx.posD(u.at), cx.posSi(u.at)),
      k: u.at
    }))
    .sort((a, b) => clsRank_(a.cls, b.cls) || (a.k - b.k)
                 || (a.sp < b.sp ? -1 : a.sp > b.sp ? 1 : 0));
}

/* ── 入れる ────────────────────────────────────
   **ここまで週案には1文字も書いていない。** 押したときだけ書く。
   既定は「やめる」（askOk の決まり）。 */
function spmApply(){
  if(!spmRes) return;
  const locked = whyLocked();
  if(locked) return toast(locked);
  const r = spmRes;
  const lines = ["<b>" + r.placed.length + "コマ</b>ぶんの専科の予定を、"
    + escText(spMonthName(spmY, spmM)) + "の週案に入れる。"
    + "<b>基本時間割がそのまま出しているコマは書かない</b>"
    + "（書いても紙は変わらないので、行だけが増える）。"];
  if(r.over.length) lines.push("<b>ほかの人の予定を " + r.over.length
    + "コマ潰す。</b>潰された人には、次にその週を開いたときに知らせが出る。");
  if(r.moved.length) lines.push("基本時間割から動かした <b>" + r.moved.length
    + "コマ</b>は、<b>元の場所に基本時間割の字が残る。</b>"
    + "そこは担任が入れ直すところなので、上の一覧をそのまま渡す。");
  lines.push("入れたあとは<b>保存を押す</b>。押すまでシートには送らない。");
  askOk({
    title: spMonthName(spmY, spmM) + "の専科の予定を、週案に入れますか",
    lines, goLabel:"入れる",
    onYes: () => {
      const w = Wait.begin("週案に入れています");
      try{
        spmSaveWish();
        const out = spApply(r);
        $("spmDlg").close();
        refreshWeek();
        toast("<b>" + out.wrote + "コマ</b>を入れた"
          + (out.cleared ? "（前の案を " + out.cleared + "コマ どけた）" : "")
          + (out.stale.length ? "　基本の字が残るコマ " + out.stale.length : "")
          + "　<b>保存を押す</b>");
      } finally { Wait.end(w); }
    }
  });
}

/* 希望を書き出す。**触っていなければ書かない**（上の spmDirty の理由）。
   入れるときと、窓を閉じるときの両方から呼ぶ ── 案を入れずに閉じた人の
   希望も残す（希望はその人の持ちもので、案とは別のもの）。 */
function spmSaveWish(){
  if(!spmDirty) return 0;
  let n = 0;
  for(const s of specials()) if(spWishWrite(spmY, spmM, s.code, spmWish[s.code])) n++;
  spmDirty = false;
  if(n) save();
  return n;
}
