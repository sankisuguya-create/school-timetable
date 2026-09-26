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
const SPW_FLAGS = ["avoid", "am", "pair", "base", "spread", "off"];

/* **どの希望も、チェックを入れたときだけ効く。** 避ける日も同じ形にしてある
   ── 日付を押した時点で効く作りだと、この欄だけ「チェックを外して止める」が
   できず、一度選んだ日を消して回ることになる。日付は残したまま切れる。 */
const spwBlank = () => ({avoid:false, am:false, pair:false, base:false,
                         spread:false, off:false, days:[]});
/* その希望が、いま効いているか。**チェックと中身の両方を見る**
   （避ける日は、チェックが入っていても日付が1つも無ければ効きようがない） */
const spwOn = (w, k) => !!(w && w[k]) && (k !== "avoid" || (w.days || []).length > 0);

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

/* ── 計算に入る専科 ────────────────────────────
   **「組む」にチェックが入っていて、ほかの組む側と受け持ちが重なる人だけ。**
   受け持つクラスがほかの組む側と1つも重ならない専科には、この計算で
   動かせるものが何も無い ── 奪う枠も奪われる枠も無いので、入れても出る案は
   基本時間割のまま。希望を入れられなくなるぶんだけ損なので、
   画面にも計算にも入れず、名指しで断る（12図工 のような枠がこれに当たる）。

   **組む側のあいだで見る。** 重なりの相手が「組む」を外していれば、
   その専科どうしも干渉しない（相手のいない計算に希望は要らない）。 */
function spmRunSet(wishes){
  const cand = specials().filter(s => !(wishes[s.code] || spwBlank()).off);
  const sets = {};
  for(const s of cand) sets[s.code] = new Set(classesOfSpecial(s.code));
  const alone = {}, run = [];
  for(const s of cand){
    const mine = sets[s.code];
    const lonely = cand.every(t => t.code === s.code
                                || ![...mine].some(c => sets[t.code].has(c)));
    if(lonely) alone[s.code] = true; else run.push(s);
  }
  return {cand, alone, run};
}

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
   **チェックを入れた希望は、破らない。** 破るのは「そうしないとそのコマを
   どこにも置けない」ときだけで、そのときは**破ったことを画面で言う**。
   チェックを入れたのに黙って破られるのでは、チェック欄が飾りになる。

   順は上から。**1つ上を1回破るより、下を何回か破るほうが軽い**ように、
   段のあいだを大きく空けてある（1手で動くのは1〜2コマなので、
   下の段を全部足してもの上の段1つに届かない）。

     置けない            200000  そのコマがどこにも無くなる
     避ける日            100000  出張・年休。**学校に居ない日に授業を置く案は、
                                 実行できない案**。時数が動くことより悪い
     別の週へ動かす       50000  その週の時数が変わる。ほかの希望では釣り合わない額
     午前のみ              5000  居るけれど、その時間は受け持たないと言っている
     2コマくっつける       1200  図工・家庭のように2コマで1つの授業になるもの
     基本時間割に近づける   300  同じ週の中のずれ（チェックしないと 25）
     クラス分散             150  特定の週に同じクラスが固まらないようにする

   *避ける日を「別の週へ動かす」より重くした理由*：出張で1週まるごと空ける人に、
   その週の授業を割り当てた案は**そもそも実行できない**。時数がずれた案は
   人が直せるが、居ない人が教えている案は直しようがない。だから、避ける日を
   守るためなら週をまたいでよい（またいだぶんは「クラス分散」が均す）。

   *午前のみを「別の週へ動かす」より軽くした理由*：こちらは**学校には居る**。
   午後に入った案は実行できる。そのために週をまたいで時数を動かすのは高すぎる。

   *「別の週へ動かす」を 2コマくっつけるより重いままにした理由*：
   週をまたぐとそのクラスのその週の**時数が変わる**（時数は週ごとに数えるもので、
   時数集計表も週ごとのシート）。ここを軽くしていたときは、片割れが行事で
   つぶれた図工の2コマが、**そろって次の週へ飛んだ**（実測）。
   その週の図工が0になり、飛んだ先の週が4コマになる。
   「チェックしたら絶対」は、**その週の中で絶対**という意味にしてある。

   *「基本時間割に近づける」を絶対にしない理由*：あれは「近づける」であって
   「動かすな」ではない。絶対にすると、行事でつぶれたコマを振り替えられない。 */
const SPW_UNPLACED = 200000;
/* **避ける日は、週をまたいででも守る。** 出張・年休で学校に居ない日に
   授業を置いた案は、そもそも実行できない。時数がずれた案は人が直せるが、
   居ない人が教えている案は直しようがない。
   破るのは、どの週にも置く場所が無いときだけ（置けないは 200000）。 */
const SPW_AVOID    = 100000;   /* 避ける日に置いた */
/* **午前のみは、週をまたいでまでは守らない。** こちらは学校には居るので、
   午後に入った案は実行できる。そのために時数を動かすのは高すぎる。 */
const SPW_AM       = 5000;     /* 午前のみの人を5・6校時に置いた */
/* **別の週へ動かすのは、避ける日を除くどの希望を何回破るよりも重い。**
   残りの希望を全部足しても届かない額にしてある ── 週をまたぐ値打ちがあるのは
   「その週にはもう置く場所が無い」ときと、避ける日を守るときだけ。

   ここを希望と釣り合う額（2000）にしていたときは、片割れが行事でつぶれた
   図工の2コマが**そろって次の週へ飛んだ**（実測）。2コマの減点は1コマごとに
   付くので、2コマぶん（2400）が週またぎ（2000）を超えていた。
   避ける日を除けば、「チェックしたら破らない」は**その週の中で破らない**の意味。 */
const SPW_WEEK     = 50000;
const SPW_PAIR     = 1200;     /* 2コマにならなかった1コマぶん */
/* 同じ週の中でのずれ。左＝ふだん／右＝「近づける」にチェックしたとき */
const SPW_BASE = {slot:[10, 150], day:[25, 300]};
/* 同じクラスを同じ日に2回。**クラス分散にチェックを入れたときだけ効く。**
   いつでも効かせると、基本時間割がもともと持っている2コマ続き
   （図図・理理・家家）を割りにいく ── 希望を1つも入れていないのに
   基本から 158コマ動く案が出た（実測）。基本の並びは、動かす理由が
   無いかぎり動かさない。 */
const SPW_SAMEDAY  = 150;
const SPW_SPREAD   = 150;      /* その週に、基本より多く入れた1コマぶん（2乗で効く） */

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
  /* **干渉しない専科は入れない**（→ spmRunSet）。彼らのコマは、
     いま入っているまま残るので、計算に入れても案は変わらない */
  const rs = spmRunSet(wishes), sps = rs.run, alone = rs.alone;
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

  return {y, m, weeks, days, lessons, nS, sps, alone, inRun, units, hard, taken,
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
  if(spwOn(w, "avoid") && w.days.indexOf(iso(addDays(cx.weeks[wi], d))) >= 0)
    c += SPW_AVOID;
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
    /* **動かす前の減点は、候補ごとに数え直さない。** 動かしていないのだから
       どの候補から見ても同じ値で、ここが候補の数だけ走っていた */
    const cU0 = spUnitCost(cx, u), gU0 = gcost(u.sp, u.cls);
    /* **別の週の候補は、いつも見るわけではない。**
       週をまたぐのは 50000 で、同じ週の中のずれ（最大 300）では釣り合わない。
       避ける日（100000）と置けない（200000）だけが、またぐ値打ちを持つ。
       またぐ値打ちがあるのは、いま高い減点を払っているコマ
       （置けていない・希望を破っている・2コマが割れている）だけなので、
       そのときだけ全部の週を見る。6人が希望を全部入れた月で
       **3.0秒 → 1.8秒。破った希望の数は変わらない。** */
    const wideWeek = from < 0 || cU0 + gU0 >= SPW_PAIR;
    const homeWi = cx.posWi(u.home);
    let bestP = -1, bestSwap = -1, bestGain = 0;
    for(const p of list){
      if(p === from) continue;
      if(!wideWeek && cx.posWi(p) !== homeWi) continue;
      const b = blocker(i, p);
      if(b === null) continue;
      let gain;
      if(b === -1){
        lift(i); put(i, p);
        gain = (cU0 + gU0) - (spUnitCost(cx, u) + gcost(u.sp, u.cls));
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
        const gWas = same ? gU0 : gU0 + gcost(v.sp, v.cls);
        const cWas = cU0 + spUnitCost(cx, v);
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
                                 ? "他の専科が入っている" : "空いているコマが無い")});
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
    if(spwOn(w, "avoid") && w.days.indexOf(iso(addDays(cx.weeks[wi], d))) >= 0) n.avoid++;
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
/* `tent` を立てると**仮採用**。基本時間割と同じ薄さ・同じ低さで入る
   （時程のIDが `tent:時程` になるだけで、置き方も消し方も本採用と同じ）。
   どけるほうは**いつも両方**どける ── 本採用と仮採用が同じコマに二重に残ると、
   どちらが生きているのか紙からは読めない。 */
function spApply(res, tent){
  const cx = res.cx, keep = monday;
  let wrote = 0, cleared = 0;
  const stale = [];
  const put = (sid) => tent ? TENT_SLOT + sid : sid;
  try{
    /* 1. どける（本採用のぶんも、仮採用のぶんも） */
    for(let wi = 0; wi < cx.weeks.length; wi++){
      monday = cx.weeks[wi];
      const w = week();
      for(const cls of allClasses()){
        const bank = w.special[cls];
        if(!bank) continue;
        for(const d of cx.days[wi]) for(let si = 0; si < cx.nS; si++)
          for(const slot of [cx.lessons[si].id, TENT_SLOT + cx.lessons[si].id]){
            const key = ck(d, slot), e = bank[key];
            if(!e || !e.sp || !cx.inRun[e.sp]) continue;
            const was = e.sat || 0, wasT = plain(e.title);
            delete bank[key];
            Backend.cellChanged("special", cls, d, slot, was,
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
      const w = week(), key = ck(d, put(sid));
      const bank = w.special[u.cls] || (w.special[u.cls] = {});
      const was = (bank[key] || {}).sat || 0, wasT = plain((bank[key] || {}).title);
      bank[key] = {title: escText(sub ? sub.name : spLabel(spOf(u.sp))),
                   subject: spSubjectOf(u.sp), sp: u.sp, note: (bank[key] || {}).note || "",
                   sat: was, by: myEmail(), at: Date.now()};
      Backend.cellChanged("special", u.cls, d, put(sid), was,
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
let spmAdoptedAs = "";           /* ""／"real"／"tent"。入れたあとの印 */
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
  /* **組んである案は捨てない。** 左のメニューをもう一度押しただけで
     案が消えると、押した本人には何が起きたのか分からない */
  if(spmRes){ setCenter("spm"); return; }
  const now = new Date(monday);
  spmY = now.getFullYear(); spmM = now.getMonth();
  spmRes = null; spmPreview = null; spmStale = {}; spmAdoptedAs = "";
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
  spmRes = null; spmPreview = null; spmStale = {}; spmAdoptedAs = "";
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

/* いまの案を捨てる。**希望を1つでも触ったら、組み直しが要る** ──
   古い案が紙に残ったままだと、入れられない案が入れられるように見える。 */
function spmInvalidate(){
  spmRes = null; spmPreview = null; spmStale = {}; spmAdoptedAs = "";
  spmDrawOut();
  if(spmFace()) drawSpMonthView();
}

/* 希望の表。**1行が1人ぶんの枠。** 列は効き方の強い順に左から並べる。
   受け持ちがほかの組む側と重ならない専科は、干渉しようがないので表から外す
   （→ spmRunSet。外した人は下に名指しで断る） */
function spmDrawWish(){
  const box = $("spmWish");
  const head = "<tr><th>組む</th><th>専科</th><th>避ける日</th>"
    + "<th>午前のみ</th><th>2コマ<br>くっつける</th><th>基本に<br>近づける</th>"
    + "<th>クラス<br>分散</th></tr>";
  const rs = spmRunSet(spmWish);
  const rows = rs.run.map(s => {
    const w = spmWish[s.code] || (spmWish[s.code] = spwBlank());
    const cb = (k, on) => "<input type='checkbox' data-sp='" + escText(s.code)
      + "' data-w='" + k + "'" + (on ? " checked" : "") + ">";
    return "<tr><td>" + cb("on", !w.off) + "</td>"
      + "<td class='spmname'>" + escText(spLabel(s))
      + (spmCarried[s.code] ? "<i class='spmcar'>先月から</i>" : "") + "</td>"
      /* **チェックと日付を並べる。** ほかの希望と同じ形にしておく ──
         日付を押した時点で効く作りだと、この欄だけ「チェックを外して止める」が
         できず、一度選んだ日を消して回ることになる */
      + "<td class='spmdcell'>" + cb("avoid", w.avoid)
      + "<button class='btn spmdays' data-sp='" + escText(s.code) + "'>"
      + (w.days.length ? w.days.length + "日" : "選ぶ") + "</button></td>"
      + "<td>" + cb("am", w.am) + "</td><td>" + cb("pair", w.pair) + "</td>"
      + "<td>" + cb("base", w.base) + "</td><td>" + cb("spread", w.spread) + "</td></tr>";
  }).join("");
  /* **外した人は名指しで断る。** 表から消えるだけだと、
     いるはずの人がいない画面になる */
  const skip = rs.cand.filter(s => rs.alone[s.code]);
  const foot = skip.length
    ? "<tr><td></td><td colspan='6' class='spmskip'>受け持ちが他の専科と"
      + "重ならないので計算に入れない："
      + skip.map(s => escText(spLabel(s))).join("・") + "</td></tr>"
    : "";
  box.innerHTML = head + rows + foot;
  for(const c of box.querySelectorAll("input[type=checkbox]"))
    c.onchange = () => {
      const w = spmWish[c.dataset.sp];
      if(c.dataset.w === "on") w.off = !c.checked;
      else w[c.dataset.w] = c.checked;
      /* **組むを外すと、干渉の網目も変わる**（相手のいなくなった専科が
         外れ、逆も起きる）ので、表を描き直す */
      spmDirty = true; spmInvalidate(); spmDrawWish();
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
      /* **選んだら、チェックも入れる。** 選んだのに効かない状態を作らない。
         止めたいときはチェックを外す（日付は残る） */
      if(w.days.length) w.avoid = true;
      spmDirty = true; spmInvalidate();
      spmDrawDays(); spmDrawWish();
    };
}

/* ── くむ ────────────────────────────────────── */
function spmRun(){
  const rs = spmRunSet(spmWish);
  if(!rs.run.length) return toast(rs.cand.length
    ? "<b>受け持ちの重なる専科がいません</b>。干渉しようがないので、組むものがありません"
    : "<b>組む専科を1人以上選ぶ</b>");
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
      spmSetPreview(spmRes);
      spmAdoptedAs = "";
    } finally { Wait.end(w); }
    $("spmDlg").close();
    /* **案は紙で見る。** 窓の中に小さな表で出していたころは、
       ふだん読んでいる週案の形と別物で、読み方をもう一度覚えることになった */
    setCenter("spm");
  }, 30);
}

/* チェックを入れたのに破った数の合計。**破るのは、そうしないと
   そのコマをどこにも置けないときだけ。** それでも黙っては済ませない */
function spmBroke(r){
  let n = 0;
  for(const s of r.cx.sps){
    const w = r.cx.wishes[s.code] || spwBlank(), g = r.wishNg[s.code] || {};
    for(const k of ["avoid", "am", "pair", "spread"]) if(spwOn(w, k)) n += g[k] || 0;
  }
  return n;
}

const spmWhen = (cx, wi, d, si) =>
  md(addDays(cx.weeks[wi], d)) + "（" + DOW[d] + "）" + cx.lessons[si].name + "校時";
const spmSpName = code => { const s = spOf(code); return s ? spLabel(s) : code; };
/* 週の表に出す名前。**教科名の1文字。** 1コマに何人も並ぶので、
   ここが長いとクラス名のほうが切れる。同じ教科の枠が2つあっても
   （理科3・4年／理科5・6年）、**段が決まっているのでどちらか分かる**
   ── となりのクラス名が学年を言う。 */
function spmShort(code){
  const sub = SUB_BY_CODE[spSubjectOf(code)];
  return (sub ? sub.name : spmSpName(code)).slice(0, 1);
}

/* 紙の下に出す、数えたもの。**紙に出ないことだけを字で言う。**
   置けなかったコマ・基本から動かしたコマ・希望を破った数は、
   紙の上では「そこに何も無い」としか見えない。 */
function spmDrawOut(){
  const box = $("spmOut");
  if(!box) return;
  if(!spmRes){ box.innerHTML = ""; return; }
  const r = spmRes, cx = r.cx;
  const n = r.placed.length + r.unplaced.length;
  let html = "<div class='spmsum'>"
    + (spmAdoptedAs === "tent" ? "<b class='ok'>仮採用ずみ</b>　"
     : spmAdoptedAs === "real" ? "<b class='ok'>採用ずみ</b>　" : "")
    + "<b>" + n + "コマ</b>を組んだ"
    + "　置けなかった <b class='" + (r.unplaced.length ? "ng" : "") + "'>"
    + r.unplaced.length + "</b>"
    + "　<b class='" + (spmBroke(r) ? "ng" : "") + "'>希望を破った " + spmBroke(r) + "</b>"
    + "　基本から動かした <b>" + r.moved.length + "</b>"
    /* **潰すのは本採用だけ。** 仮採用は本物の校時とは別の行に入るので、
       誰の予定も潰さない（→ TENT_SLOT） */
    + "　採用すると潰す <b class='" + (r.over.length ? "ng" : "") + "'>"
    + r.over.length + "</b>"
    + "<span class='spmlegend'>⇄ 基本から動いた　⚠ チェックした希望を破った</span></div>";
  /* **外した人は名指しで断る**（窓の表と同じ） */
  const rs = spmRunSet(spmWish);
  const skip = rs.cand.filter(s => rs.alone[s.code]);
  if(skip.length) html += "<p class='spmlead'>受け持ちが他の専科と重ならないので"
    + "<b>計算に入れていない</b>："
    + skip.map(s => escText(spLabel(s))).join("・") + "</p>";
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
    html += "<h3>他の人の予定を潰すコマ（" + r.over.length + "）</h3><ul class='spmlist'>";
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
    /* **破った希望は立てる。** チェックを入れたのに破ったところが、
       この窓でいちばん先に読まれないといけない */
    const one = (k, name, n) => { if(!spwOn(w, k)) return;
      part.push(n ? "<b class='ng'>" + name + " " + n + "</b>" : name + " 0"); };
    one("avoid",  "避ける日",   g.avoid  || 0);
    one("am",     "午前のみ",   g.am     || 0);
    one("pair",   "2コマ",      g.pair   || 0);
    one("spread", "クラス分散", g.spread || 0);
    part.push("<span class='spmdim'>基本から動いた " + (g.base || 0) + "</span>");
    html += "<tr><th>" + escText(spLabel(s)) + "</th><td>" + part.join("　") + "</td></tr>";
  }
  html += "</table>";
  box.innerHTML = html;
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

/* ── 採用・仮採用 ──────────────────────────────
   **ここまで週案には1文字も書いていない。** 押したときだけ書く。
   既定は「やめる」（askOk の決まり）。

   採用   … ふつうの専科のコマとしている。紙では専科の層の字
   仮採用 … **基本時間割と同じ薄さ・同じ低さ**で入る。誰かがその校時へ
            本物の予定を書いた瞬間に負ける（→ config.js の TENT_SLOT） */
function spmAdopt(tent){
  if(!spmRes) return;
  const locked = whyLocked();
  if(locked) return toast(locked);
  const r = spmRes;
  if(!r.placed.length) return toast("入れるコマがありません");
  const what = tent ? "仮採用" : "採用";
  const lines = ["<b>" + r.placed.length + "コマ</b>ぶんの専科の予定を、"
    + escText(spMonthName(spmY, spmM)) + "の週案に入れる。"
    + "<b>基本時間割がそのまま出しているコマは書かない</b>"
    + "（書いても紙は変わらないので、行だけが増える）。"];
  if(tent) lines.push("<b>仮採用は、基本時間割と同じ薄さで入る。</b>"
    + "誰かがその校時へ予定を書いたら、そちらが出る"
    + "（仮のほうは黙って引っ込む）。紙に出ているあいだは、"
    + "時数にもたんぽぽにも基本時間割と同じように数える。");
  else if(r.over.length) lines.push("<b>他の人の予定を " + r.over.length
    + "コマ潰す。</b>潰された人には、次にその週を開いたときに知らせが出る。");
  if(r.moved.length) lines.push("基本時間割から動かした <b>" + r.moved.length
    + "コマ</b>は、<b>元の場所に基本時間割の字が残る。</b>"
    + "そこは担任が入れ直すところなので、下の一覧をそのまま渡す。");
  lines.push("入れたあとは<b>保存を押す</b>。押すまでシートには送らない。");
  askOk({
    title: spMonthName(spmY, spmM) + "の専科の予定を、" + what + "しますか",
    lines, goLabel: what + "する",
    onYes: () => {
      const w = Wait.begin("週案に入れています");
      let out;
      try{
        spmSaveWish();
        out = spApply(r, tent);
        /* **案を消して、紙を週案そのものに戻す。** 入れたあとの紙が
           案のままだと、入ったのかどうかが紙から読めない */
        spmPreview = null;
        spmAdoptedAs = tent ? "tent" : "real";
      } finally { Wait.end(w); }
      drawSpMonthView();
      toast("<b>" + out.wrote + "コマ</b>を" + what + "した"
        + (out.cleared ? "（前の案を " + out.cleared + "コマ どけた）" : "")
        + (out.stale.length ? "　基本の字が残るコマ " + out.stale.length : "")
        + "　<b>保存を押す</b>");
    }
  });
}

/* 希望を書き出す。**触っていなければ書かない**（上の spmDirty の理由）。
   入れるときと、窓を閉じるときの両方から呼ぶ ── 案を入れずに閉じた人の
   希望も残す（希望はその人の持ちもので、案とは別のもの）。 */
function spmSaveWish(){
  if(!spmDirty) return 0;
  let n = 0;
  for(const s of specials())
    if(spWishWrite(spmY, spmM, s.code, spmWish[s.code] || spwBlank())) n++;
  spmDirty = false;
  if(n) save();
  return n;
}

/* ══ 案の面 ══════════════════════════════════════════
   **4週の面と同じ紙で出す。** 組み立ては週の紙と同じ buildSheet を使う
   （紙を2つ持つと、片方だけ直した版が出る）。違うのは中身の読み方だけで、
   それは cellFor → spmCellFor の1か所にある。

   出すのは**全学年の紙に、専科の巡りを重ねたもの**。1コマに
   「音楽 2-2 ／ 理科 4-1 ／ 図工 5-2」と並び、**それぞれを教科の色で塗る**。
   専科ごとに分けて出すと、干渉が起きていないことがその画面では分からない。

   全校の予定・休み・特別校時・校外行事は、全学年の紙がそのまま持っている
   ── 専科がそこへ行けない理由が、同じ紙の上に見える。

   **画面だけ。刷らない。** 週は4〜6枚あり、B4 の 2×2 には収まらない
   （刷る「4週まとめて（B4）」は今までどおり別にある）。 */
const spmFace = () => typeof centerMode !== "undefined" && centerMode === "spm";

/* 案（まだ週案に入れていないもの）。**入れたら消す。**
   消したあとは週案そのものを読むので、同じ紙が実物になる。 */
let spmPreview = null;           /* "月曜|曜日|時程" → [{sp, cls, moved, broke}] */
/* **元の場所に基本の字が残るコマ。** 「月曜|曜日|時程|クラス|身元」→ 1。
   案の面では、その段を薄くして「ここに残るのは基本の字」と分かるようにする */
let spmStale = {};

function spmSetPreview(res){
  const cx = res.cx, map = {}, stale = {};
  for(const u of res.placed){
    const wi = cx.posWi(u.at), d = cx.posD(u.at), si = cx.posSi(u.at);
    const w = cx.wishes[u.sp] || spwBlank();
    /* **希望ずれ。** 避ける日と午前のみを破ったコマは、行の右端に ⚠ が出る
       （数だけでなく、どのコマかが紙から読めるように） */
    const broke = (spwOn(w, "avoid")
                   && w.days.indexOf(iso(addDays(cx.weeks[wi], d))) >= 0)
               || (w.am && si >= cx.amCut);
    const k = iso(cx.weeks[wi]) + "|" + d + "|" + cx.lessons[si].id;
    (map[k] || (map[k] = [])).push({sp:u.sp, cls:u.cls,
                                   moved:u.at !== u.home, broke});
    if(u.at !== u.home)
      stale[iso(cx.weeks[u.wi]) + "|" + u.d + "|" + cx.lessons[u.si].id
            + "|" + u.cls + "|" + u.sp] = 1;
  }
  spmPreview = map;
  spmStale = stale;
}

/* いま週案に入っている、そのコマの専科。**合成したあとで見る。**
   基本時間割のぶんも拾う（基本は教師を持っていないので、担当学年から引く）。
   学年や全校が上から潰していれば、そこに専科は行かない ── だから出さない。 */
function spmStoreEntries(d, sid){
  const out = [];
  for(const cls of allClasses()){
    const cur = compose(cls, d, sid);
    if(cur.layer === "special"){ if(cur.sp) out.push({sp:cur.sp, cls}); continue; }
    if(cur.layer === "tent"){ if(cur.sp) out.push({sp:cur.sp, cls, tent:true}); continue; }
    if(cur.layer !== "base" || !cur.subject) continue;
    const owner = spOwnerOf_(cls, cur.subject);
    if(owner) out.push({sp:owner, cls, base:true});
  }
  return out;
}

/* 案の面の1コマ。**紙の下敷きは全学年の紙。**
   授業のコマだけ、専科の並びに差し替える。全校の予定が入っているコマは
   そのまま出す ── そこは全クラスが塞がっていて、専科は行けない。

   **案に行が無いコマは、実物を出す。** 案は「計算に入れた専科の行き先」
   だけを持つので、そのまま出すと、組む側ではない専科の予定や、動いたコマの
   元の場所が「空き」に見える。入れたあとの姿に近いのは ──
     ・基本時間割が出しているコマ（動いたコマの元の場所にも残る）
     ・組む側ではない専科のコマ（計算が触れないので、そのまま残る）
   組む側の専科がいま入れているコマは、入れるときに消えるので出さない。 */
function spmCellFor(d, s){
  const sl = SLOT_BY_ID[s] || {}, w = week();
  const sc = w.school[ck(d, s)];
  const asIs = () => sc ? Object.assign({}, sc, {layer:"school", clash:null, over:[]})
                        : {title:"", note:"", subject:null, layer:"base", clash:null};
  if(sl.kind !== "lesson") return asIs();
  if(sc && plain(sc.title).trim()) return asIs();
  const key = wkKey() + "|" + d + "|" + s;
  let list;
  if(spmPreview){
    const plan = spmPreview[key] || [];
    if(plan.length) list = plan;
    else list = spmStoreEntries(d, s)
      .filter(e => e.base || !spmInRun(e.sp))
      .map(e => spmStale[key + "|" + e.cls + "|" + e.sp]
              ? Object.assign({}, e, {stale:true}) : e);
  }else{
    list = spmStoreEntries(d, s);
  }
  if(!list.length) return {title:"", note:"", subject:null, layer:"base", clash:null};
  return {title: spmRowsHtml(list), note:"", subject:null, layer:"base", clash:null};
}

const spmInRun = code => !!(spmRes && spmRes.cx.inRun[code]);

/* **コマの中の1行は、専科ごとに決まった段。** どのコマでも同じ高さに
   同じ専科が並ぶので、上から順に読めばすぐ見つけられる。
   居ないところは空の段を置く ── 上に詰めると、コマごとに段がずれて
   目で追えなくなる（段は教科の並び順で固定） */
function spmLanes(){
  const ord = SUBJECTS.map(x => x.code), out = {};
  specials().slice().sort((a, b) => {
    const x = ord.indexOf(spSubjectOf(a.code)), y = ord.indexOf(spSubjectOf(b.code));
    return ((x < 0 ? 99 : x) - (y < 0 ? 99 : y))
         || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  }).forEach((s, i) => out[s.code] = i);
  return out;                            /* 身元 → 段（0起き） */
}
function spmRowsHtml(list){
  const laneOf = spmLanes(), rows = [], extra = [];
  for(const e of list){
    const i = laneOf[e.sp];
    if(i === undefined) extra.push(e);
    else (rows[i] || (rows[i] = [])).push(e);
  }
  let html = "";
  const emit = row => {
    row.sort((a, b) => clsRank_(a.cls, b.cls));
    for(const e of row) html += spmRowHtml(e);
  };
  for(let i = 0; i < specials().length; i++){
    if(!rows[i]){ html += "<span class='spxemp'></span>"; continue; }
    emit(rows[i]);
  }
  /* 枠に無い身元（退いた専科の残り）は、いちばん下に出す */
  emit(extra);
  return html;
}
function spmRowHtml(e){
  /* **ずれは行の右端の印が言う。** ⇄ は基本時間割から動いた、
     ⚠ はチェックを入れた希望を破った。字を足すとクラス名が切れるので記号 */
  const marks = (e.moved ? "⇄" : "") + (e.broke ? "⚠" : "");
  return "<span class='spx" + (e.tent ? " tent" : "") + (e.moved ? " mv" : "")
    + (e.broke ? " ng" : "") + (e.stale ? " st" : "")
    + "' data-subject='" + escText(spSubjectOf(e.sp)) + "'>"
    + "<span class='spxtxt'>" + escText(spmShort(e.sp)) + " " + escText(e.cls)
    + "</span>"
    + (marks ? "<i class='spxmark'>" + marks + "</i>" : "")
    + "</span>";
}

/* 面を描く。**週の数だけ紙を作る**（4〜6枚）。 */
function drawSpMonthView(){
  const box = $("spmPaper");
  if(!box) return;
  const weeks = spmRes ? spmRes.cx.weeks : spMonthWeeks(spmY, spmM);
  $("spmTtl").textContent = spMonthName(spmY, spmM) + "　専科の月予定"
    + (spmPreview ? "（案）" : spmAdoptedAs === "tent" ? "（仮採用ずみ）"
     : spmAdoptedAs === "real" ? "（採用ずみ）" : "");
  /* 押せるのは、まだ入れていない案があるときだけ */
  for(const id of ["spmTake", "spmTakeTent"]){
    const b = $(id);
    if(b) b.disabled = !spmPreview || !spmRes || !spmRes.placed.length;
  }
  box.textContent = "";
  for(const mon of weeks){
    const wrap = el("div", "spmwk");
    wrap.appendChild(el("div", "spmwklab", escText(md(mon)) + " の週"));
    const sh = el("div", "sheet mini spmsheet");
    wrap.appendChild(sh);
    box.appendChild(wrap);
    buildSheet(sh, mon, true);
  }
  fitSpm();
  spmDrawOut();
}

/* 紙の大きさ。**2列に並べ、列の幅に合わせて縮める。**
   4週の面（fitMonth）は B4 に刷るので1画面へ収めるが、こちらは画面だけで
   週が6枚になることもあるので、**縦は転がす**（無理に収めると字が読めない）。
   刷るときも同じ2列 ── B4よこに週を2枚ずつ置いて、ページを送る。 */
const SPM_COLS = 2;
/* B4 よこ。**4週の面の M_PAGE と同じ寸法だが別に書く** ──
   このファイルは sheet.js より先に読まれるので、`const X = M_PAGE` は
   まだ無い名前を読んで全体を止める（TDZ） */
const SPM_PAGE = {w:364, h:257, mg:6};
function spmCellMM(){
  /* **横幅は高さから逆算する。** 紙は横幅≈1.41倍の高さになるので、
     余白と週の見出しを引いた高さに収まる幅を取る ── 1まとまりが
     1頁を越えると、刷りで紙の途中が切れる */
  const w = Math.min((SPM_PAGE.w - SPM_PAGE.mg * 2 - M_GAP) / 2,
                     (SPM_PAGE.h - SPM_PAGE.mg * 2 - 7) / 1.42);
  return {w: w.toFixed(1) + "mm"};
}
function fitSpm(cell){
  const box = $("spmPaper");
  if(!box) return;
  const sheets = [...box.querySelectorAll(".sheet")];
  if(!sheets.length) return;
  /* **刷るときは枠の大きさを mm で入れる**（fitMonth と同じ仕組み。
     画面の広さで組んだまま刷ると、紙からはみ出す） */
  if(cell){
    box.style.gridTemplateColumns = "repeat(2," + cell.w + ")";
    box.style.width = "calc(" + cell.w + "*2 + " + M_GAP + "mm)";
    const k = parseFloat(cell.w) / 182;
    for(const sh of sheets){
      sh.style.setProperty("--pw", cell.w);
      sh.style.setProperty("--pm", "0mm");
      sh.style.setProperty("--k", String(k));
    }
    return;
  }
  box.style.removeProperty("grid-template-columns");
  box.style.removeProperty("width");
  /* **刷っているあいだは画面の採寸をしない。** プレビューの開閉で resize が
     走ると、.stage を隠したままの全幅を測って過大な --pw が残る
     （実測: 641px の紙が 755px に）。戻るのは printSpread の back() だけ */
  if(document.body.classList.contains("printing-spm")) return;
  const w = (box.clientWidth - M_GAP * (SPM_COLS - 1)) / SPM_COLS - 2;
  if(w < 40) return;
  /* 1mm が何 px か。**測って出す**（決め打ちにすると、拡大表示でずれる） */
  const probe = el("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:100mm";
  document.body.appendChild(probe);
  const mm = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const k = Math.max(.3, Math.min(1, w / (182 * mm)));
  for(const sh of sheets){
    sh.style.setProperty("--pw", w + "px");
    sh.style.setProperty("--pm", "0px");
    sh.style.setProperty("--k", String(k));
  }
}

/* 月を繰る。**案は持ち越さない**（別の月の案を、その月の紙に出さない） */
function spmFaceStep(n){
  const d = new Date(spmY, spmM + n, 1);
  spmY = d.getFullYear(); spmM = d.getMonth();
  spmRes = null; spmPreview = null; spmStale = {}; spmAdoptedAs = "";
  spmLoad(() => drawSpMonthView());
}
