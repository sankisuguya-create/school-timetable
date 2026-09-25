/* ==================================================================
   impevent.js — ��間行事計画表の取り込み（行事 → 全校・学年の層）

   行事計画の字をそのまま貼って読む（日付・曜日・h/AM/下校・学年）か、
   連携シートの表から読んで、全校・学年の層へ入れる。
================================================================== */

/* ══ ② 年間行事計画表 → 全校・学年 ══════════════════════

   年間行事計画表には**校時の列が無い**（日付にしか結びついていない）。
   だから雛形に「校時」と「対象」の列を足して、そこだけ手で埋めてもらう。

   **行事の入っている日だけ**を並べて出す。240日ぶん出すと、
   埋める行を探すだけで終わってしまう。 */

const IMP_EV_HEAD = ["日付", "校時", "対象", "行事名", "備考"];

/* 「3年」「3」「全校」「全学年」を、層と対象に直す */
function impTarget(v){
  const s = impNorm(v);
  if(!s) return null;
  if(/^(全校|全学年|学校全体|全)$/.test(s)) return {layer:"school", target:""};
  const m = s.match(/^([1-9])年?$/);
  if(m && gradesAll().indexOf(m[1]) >= 0) return {layer:"grade", target:m[1]};
  return null;
}
/* いまある学年。学級編成から引く（1〜6 を決め打ちにしない） */
function gradesAll(){
  const out = [];
  for(const c of allClasses()){
    const g = gradeOf(c);
    if(out.indexOf(g) < 0) out.push(g);
  }
  return out;
}

/* 「1」「1校時」「朝の会」を校時に直す。**授業以外の行にも入れられる**
   （全校朝会は朝の会の行、避難訓練は業間のこともある） */
function impSlot(v){
  const s = impNorm(v);
  if(!s) return null;
  const les = impTallySlots();
  const m = s.match(/^([0-9]+)(校時|限)?$/);
  if(m){ const i = +m[1] - 1; return les[i] ? les[i].id : null; }
  for(const sl of SLOTS) if(impNorm(sl.name) === s) return sl.id;
  return null;
}

/* 日付。雛形は YYYY-MM-DD で出すが、貼り直しで M/D になることがある。
   **年が無いときは、いま開いている年度の中で決める**（4月始まり） */
function impDate(v){
  if(v && typeof v === "object" && typeof v.getMonth === "function") return v;
  const s = impNorm(v);
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})$/);
  if(m){
    const mo = +m[1], y = fy() + (mo >= 4 ? 0 : 1);
    return new Date(y, mo - 1, +m[2]);
  }
  return null;
}

/* 読む。戻すのは {rows, warn}。rows は [{dt, slot, to, title, note}] */
function impEvRead(text){
  const grid = impSplit(text);
  if(grid.length < 2)
    return {warn:"<b>見出しと、少なくとも1行が要ります。</b>"
          + "雛形を見出しの行ごとコピーして貼ってください。"};
  const head = grid[0].map(impNorm);
  if(head[0].indexOf("日付") < 0)
    return {warn:"<b>1行目が見出しではありません。</b>"
          + "見出しは " + IMP_EV_HEAD.join("／") + " の5つです。"};

  const out = [], bad = [];
  for(let i = 1; i < grid.length; i++){
    const r = grid[i];
    const slotRaw = r[1], toRaw = r[2];
    /* **校時と対象の両方が空の行は、はじめから読まない。**
       雛形には行事のある日をぜんぶ並べてあるので、
       コマにしないものが残っているのがふつう（消させない） */
    if(!impNorm(slotRaw) && !impNorm(toRaw)) continue;
    const dt = impDate(r[0]), slot = impSlot(slotRaw), to = impTarget(toRaw);
    const title = String(r[3] == null ? "" : r[3]).trim();
    const note  = String(r[4] == null ? "" : r[4]).trim();
    /* **学級編成に無い学年は入れない。** 入れても、その学年のクラスが
       1つも無いので誰の紙にも出ない。打ち間違い（9年）をここで拾う */
    const why = !dt ? "日付が読めない"
              : !slot ? "校時が読めない"
              : !to ? (/^[1-9]年?$/.test(impNorm(toRaw))
                       ? "その学年のクラスが無い（今ある学年は "
                         + gradesAll().join("・") + "）"
                       : "対象が読めない（全校／◯年）")
              : !title ? "行事名が空" : "";
    if(why){ bad.push((i + 1) + "行目：" + why + "（" + (r.slice(0, 4).join(" ")) + "）"); continue; }
    /* 日曜は紙に無い。**入れる場所が無いので読まない** */
    if((dt.getDay() + 6) % 7 >= DAYS){
      bad.push((i + 1) + "行目：日曜は紙にありません（" + iso(dt) + "）");
      continue;
    }
    out.push({dt, slot, to, title, note});
  }
  return {rows:out,
    warn: bad.length ? "<b>入れない行が " + bad.length + " ありました。</b><br>"
                     + bad.slice(0, 8).map(escText).join("<br>")
                     + (bad.length > 8 ? "<br>他 " + (bad.length - 8) + " 行" : "") : ""};
}

/* ══ 行事計画の字を、そのまま貼って読む ══════════════════

   学校の行事計画（月ごとの「日 曜 行事計画（児童）」の並びや、
   3ヶ月横並びの年間行事計画表）を、**雛形に直さずそのまま貼って**読む。

   文中の決まり字を拾って、校時と対象に直す:

     「3h」「34h」           → 3校時／3・4校時（数字の数だけ連続）
     「AM」「am」           → 1〜4校時
     「特4h」               → 特別校時。5・6校時は授業なし
     「12時台／13:40下校」   → その時刻以降に始まる校時は授業なし
                             （始まる時刻は設定の校時表から読む。
                               12時台→5・6校時、13:40→6校時のみ）
     「5校時後下校」         → 5校時のあとは授業なし
     「2-6年」「135年」「6年」 → その学年だけ（無ければ全校）

   **h・AM・下校のどれも無い予定は読まない**（日の行事＝日の形は
   べつの口から入れるもので、ここでは校時の話だけを扱う）。 */

/* 「◯日 ◯曜」の字。行頭か空白のあとに、日にち→曜日の並びで立つ */
const IMP_DOC_DAY = /(?:^|[\s　])(\d{1,2})\s+([月火水木金土日])(?=[\s　]|$)/g;

/* 下校の時刻 → 潰れる校時。**その時刻以降に始まる校時**を潰す
   （その時刻のまん中にある校時は、半分だけ教えて終わったことにする ──
   13:40下校は5校時の途中なので、潰すのは6校時だけ）。始まる時刻は
   設定の校時表（SLOTS.time）から読む */
function impDocOff(les, hhmm){
  const out = [];
  for(let i = 0; i < les.length; i++){
    const m = /(\d{1,2}):(\d{2})/.exec(les[i].time || "");
    if(m && (+m[1]) * 60 + (+m[2]) >= hhmm) out.push(i);
  }
  return out;
}

/* 「135年」「2-6年」「4年」→ 学年の並び。**無ければ全校。** */
function impDocGrades(t){
  const gs = [], unknown = [];
  t = t.replace(/全学年|全校|全員/g, "");
  const re = /(\d+(?:[-–~〜]\d+)?)年/g;
  let m;
  while((m = re.exec(t))){
    const seg = m[1], list = [];
    const rm = seg.match(/^(\d+)[-–~〜](\d+)$/);
    if(rm){ for(let g = +rm[1]; g <= +rm[2]; g++) list.push(String(g)); }
    else for(const c of seg) list.push(c);
    for(const g of list)
      if(gradesAll().indexOf(g) >= 0){ if(gs.indexOf(g) < 0) gs.push(g); }
      else unknown.push(g + "年");
  }
  return {grades: gs, unknown, rest: t.replace(re, "")};
}

/* 1件ぶんの字 → {evPeriods, offPeriods, grades, title, unknown}
   evPeriods は行事が入る校時、offPeriods は授業なしにする校時（ともに0起き） */
function impDocToken(token, les){
  let t = String(token || "").normalize("NFKC").replace(/[\s　]+/g, "");
  if(!t) return null;
  const ev = new Set(), off = new Set();
  const eat = (re, fn) => { t = t.replace(re, fn); };

  /* **効き方の強いほうから消していく**（「特3h」の3hを、ふつうの3hとして
     読まないように先に取る。下校時刻を取ったあとに h を取ると、
     「11:25下校」の25を拾いそうになるので先に下校） */
  eat(/特(\d{1,2})[hHｈ]/g, (s, n) => {
    for(let i = +n; i < les.length; i++) off.add(i); return ""; });
  eat(/(\d{1,2})校時?後下校/g, (s, n) => {
    for(let i = +n; i < les.length; i++) off.add(i); return ""; });
  eat(/(\d{1,2})時(?:台|頃|すぎ|過ぎ)?下校/g, (s, h) => {
    for(const i of impDocOff(les, (+h) * 60)) off.add(i); return ""; });
  eat(/(\d{1,2}):(\d{1,2})(?:頃|台)?下校/g, (s, h, m) => {
    for(const i of impDocOff(les, (+h) * 60 + (+m))) off.add(i); return ""; });
  /* 学年。**時程の前に取る**（「23h6年」の6年は学年で、6校時ではない） */
  const g = impDocGrades(t); t = g.rest;
  eat(/(?:AM|am|ＡＭ)/g, () => {
    for(let i = 0; i < Math.min(4, les.length); i++) ev.add(i); return ""; });
  eat(/(\d{1,6})[hHｈ]/g, (s, ds) => {
    for(const c of ds){ const i = +c - 1; if(i >= 0 && i < les.length) ev.add(i); }
    return ""; });
  eat(/(\d)校時(?!後)/g, (s, n) => {
    const i = +n - 1; if(i >= 0 && i < les.length) ev.add(i); return ""; });

  /* 題名は残った字。時刻の字（15:20）や、行が切れて残った「下」の
     ひとかけらは題名から除く。注釈だけでできた件名（特4h12:15下校）は
     題名が要らない ── あとで「ひとつ前の題名」が入る */
  const title = t.replace(/\d{1,2}:\d{2}/g, "")
                 .replace(/[（(][）)]/g, "")
                 .replace(/^[、，,・。]+|[、，,・。]+$/g, "")
                 .replace(/下$/g, "");
  return {hit:!!(ev.size || off.size), ev:[...ev], off:[...off],
          grades:g.grades, title, unknown:g.unknown};
}

/* 行を日・欄に割る。**児童の欄は、欄の切れ目（2つ以上の空白）の
   集まりから見つける** ── 「行事計画（児童）」の見出しの位置と、
   実際の中身が始まる位置はずれる（PDFから取った字はだいたいずれる）ので、
   中身が何列目から始まるかを全行から数えて列を決め、
   見出しの位置にいちばん近い列を「児童の欄」とする。
   見出し自体が無いときは、いちばん手前の列を児童の欄と見なす。 */
function impDocLines(text){
  const raw = String(text || "").replace(/\r/g, "").split("\n");
  const markRe = /行事計画[\s　]*[（(](児童|職員)[）)]/g;
  const lines = [];                /* {anchs, chunks, pg} */
  let headPos = [];                /* 「行事計画（児童）」見出しの列位置 */
  const pages = [];                /* [{months:[{m,pos}]}] 見開きごとの月の見出し */
  let curPage = -1, year = 0;
  const dayRe = new RegExp(IMP_DOC_DAY.source, "g");

  for(const ln of raw){
    if(!ln.trim()) continue;
    const t = ln.normalize("NFKC");
    const ym = t.match(/(\d{4})\s*年度?/) || t.match(/令和\s*(\d+)年度?/);
    if(ym) year = ym[1].length === 4 ? +ym[1] : 2018 + +ym[1];
    /* 「◯月行事計画」は、その先の紙が全部その月の印（月ごとの計画表） */
    const ml = t.match(/(\d{1,2})\s*月\s*行事計画/);
    if(ml){ pages.push({months:[{m:+ml[1], pos:0}]}); curPage = pages.length - 1; }
    /* 「◯月」だけの行も月の印 ── 連携シートに貼ると、月の見出しが
       ひとつのセルに入って1列ぶんの行になる（「3月の予定」など
       文末につく形はここには来ない） */
    const solo = t.match(/^\s*(\d{1,2})\s*月\s*$/);
    if(solo && +solo[1] >= 1 && +solo[1] <= 12 && !ml){
      pages.push({months:[{m:+solo[1], pos:0}]}); curPage = pages.length - 1;
    }
    markRe.lastIndex = 0;
    const hp = []; let mm;
    while((mm = markRe.exec(t))) if(mm[1] === "児童") hp.push(mm.index);
    if(hp.length){ headPos = hp; continue; }          /* 欄の見出し行 */
    const mo = [...t.matchAll(/(\d{1,2})月/g)];

    dayRe.lastIndex = 0;
    const anchs = []; let am;
    while((am = dayRe.exec(t)))
      anchs.push({pos:am.index, end:dayRe.lastIndex, d:+am[1], dow:am[2]});
    /* 月の見出し行（「◯月」だけが並ぶ行。年間表は見開きごとに3つ並ぶ。
       **見開きごとに別の見出し**なので、行を見つけるたびに新しい頁として
       積む ── あとの日の字は、そのとき積んだいちばん新しい頁の月を使う。
       文中の「3月分」などは月だけの行にならないので当たらない） */
    if(!anchs.length && mo.length >= 2 && /^[\s\d月]+$/.test(t)){
      pages.push({months:mo.map(x => ({m:+x[1], pos:x.index}))});
      curPage = pages.length - 1;
    }

    /* 塊（2つ以上の空白・タブで切れる字のまとまり）を開始位置つきで取る。
       **「日 ◯曜」の字は空白に潰しておく** ── そのまま取ると、
       日の字と中身が1つの塊に繋がって中身ごと消えてしまう */
    let t2 = t;
    for(const a of anchs)
      t2 = t2.slice(0, a.pos) + " ".repeat(a.end - a.pos) + t2.slice(a.end);
    const chunks = [];
    let p = 0, n = t2.length;
    while(p < n){
      while(p < n && (t2[p] === " " || t2[p] === "\t")) p++;
      if(p >= n) break;
      let q = p;
      while(q < n && !(t2[q] === "\t" || (t2[q] === " " && t2[q + 1] === " "))) q++;
      chunks.push({pos:p, text:t2.slice(p, q).trim()});
      p = q;
    }
    lines.push({anchs, chunks, pg:curPage});
  }

  /* 塊の開始位置を全部集めて、近いものは同じ列と見なす（列の帯を作る） */
  const starts = [];
  for(const l of lines) for(const c of l.chunks) starts.push(c.pos);
  starts.sort((a, b) => a - b);
  const cols = [];                 /* {lo,hi} 列の帯 */
  for(const s of starts){
    const c = cols[cols.length - 1];
    if(c && s - c.hi <= 6) c.hi = s; else cols.push({lo:s, hi:s});
  }
  const colIndex = pos => {
    for(let i = 0; i < cols.length; i++)
      if(pos >= cols[i].lo - 4 && pos <= cols[i].hi + 4) return i;
    return -1;
  };
  /* 児童の欄：見出しの位置にいちばん近い列（見出しと中身はずれているので
     ±30字は許す）。見出しが無いときは、いちばん手前の列 */
  const childCols = [];
  if(headPos.length){
    for(let bi = 0; bi < headPos.length; bi++){
      let best = -1, bd = 1e9;
      for(let i = 0; i < cols.length; i++){
        const c = cols[i];
        const dd = Math.min(Math.abs(c.lo - headPos[bi]),
                            Math.abs((c.lo + c.hi) / 2 - headPos[bi]),
                            Math.abs(c.hi - headPos[bi]));
        if(dd < bd){ bd = dd; best = i; }
      }
      if(best >= 0 && bd <= 30) childCols.push({col:best, band:bi});
    }
  }
  if(!childCols.length && cols.length) childCols.push({col:0, band:0});
  const bandOf = ci => (childCols.find(x => x.col === ci) || {band:0}).band;

  /* 日の字に、児童の欄の塊を割り当てる（その日の字より右・次の日の字より左） */
  const days = [], lastByBand = {};
  for(const l of lines){
    const child = l.chunks.filter(c => childCols.some(x => x.col === colIndex(c.pos)));
    if(l.anchs.length){
      for(let i = 0; i < l.anchs.length; i++){
        const a = l.anchs[i], nx = l.anchs[i + 1];
        const mine = child.filter(c => c.pos > a.pos && (!nx || c.pos < nx.pos));
        const seg = mine.map(c => c.text).join("、");
        const band = mine.length ? bandOf(colIndex(mine[0].pos))
          : (() => { let b = 0, bd = 1e9;
              for(const cc of childCols){
                const dd2 = cols[cc.col].lo - a.end;
                if(dd2 >= 0 && dd2 < bd){ bd = dd2; b = cc.band; }
              } return b; })();
        days.push({band, d:a.d, dow:a.dow, text:seg, pg:l.pg});
        lastByBand[band] = days.length - 1;
      }
    }else{
      /* 日の字が無い行は、前の日の字のつづき（欄ごとに独立して継ぐ） */
      for(const c of child){
        const b = bandOf(colIndex(c.pos)), li = lastByBand[b];
        if(li != null && days[li])
          days[li].text += (days[li].text ? "、" : "") + c.text;
      }
    }
  }
  return {days, cols, childCols, pages, year};
}

/* 月を引く。**その日の字が属する頁の月見出し**から、欄の分を取る。
   頁の月が1つ（月ごとの計画表）なら全部その月。3つ（3ヶ月横並び）なら
   欄の順に宛てる。数が合わないときは、欄の位置にいちばん近い月。 */
function impDocMonth(L, d){
  /* **直前の頁に勝手に押し込まない。** 月の行がまだ無いうちの日の字に
     いちばん手前の頁の月をあてると、別の月の日付が静かに混ざる */
  const pg = d.pg >= 0 ? L.pages[d.pg] : null;
  if(!pg || !pg.months.length) return 0;
  const ms = pg.months;
  if(ms.length === L.childCols.length && ms[d.band]) return ms[d.band].m;
  const cc = L.childCols[d.band];
  const at = cc ? L.cols[cc.col].lo : d.band * 60;
  let m = 0;
  for(const x of ms) if(x.pos <= at + 30) m = x.m;
  return m || ms[0].m;
}

/* 読む。戻すのは impEvRead と同じ {rows, warn} */
function impDocRead(text){
  const les = impTallySlots();
  const L = impDocLines(text);
  if(!L.days.length)
    return {warn:"<b>日にちと曜日の並びが見つかりません。</b>"};
  const year = L.year || fy();
  const rows = [], bad = [], map = {};
  let daysHit = 0, sunday = 0, monthBad = 0;
  for(const d of L.days){
    const m = impDocMonth(L, d);
    if(!m){ monthBad++; continue; }   /* 月が決められない日の字 */
    const dt = new Date(year, m - 1, d.d);
    if(dt.getMonth() !== m - 1){ bad.push(m + "月" + d.d + "日：日付が変"); continue; }
    if((dt.getDay() + 6) % 7 >= DAYS){ sunday++; continue; }  /* 日曜は紙に無い */
    if(!d.text) continue;
    daysHit++;
    let lastT = "";   /* ひとつ前の題名 ── 「参観懇談、12h」のような
                        題名の無い校時メモに、直前の題名をあてる */
    for(const token of d.text.split(/[、，,]|・(?!\S)/)){
      const r = impDocToken(token, les);
      if(!r) continue;
      if(r.title && r.title.length >= 2) lastT = r.title;
      for(const x of r.unknown)
        bad.push(m + "月" + d.d + "日：" + x + " は、いまある学年に無い");
      if(!r.hit) continue;
      const title = r.title && r.title.length >= 2 ? r.title
        : (lastT || String(token).trim().slice(0, 20));
      const tos = r.grades.length ? r.grades.map(g => ({layer:"grade", target:g}))
                                  : [{layer:"school", target:""}];
      for(const to of tos){
        for(const i of r.ev){
          const k = iso(dt) + "|" + les[i].id + "|" + to.layer + "|" + to.target;
          /* **授業なしが先に入っていれば、行事では上書かない** */
          if(map[k] == null) map[k] = rows.push({dt, slot:les[i].id, to,
            title, note:String(token).trim()}) - 1;
        }
        for(const i of r.off){
          const k = iso(dt) + "|" + les[i].id + "|" + to.layer + "|" + to.target;
          /* **授業なしは行事より強い。** 同じコマに両方あれば、
             潰れるほうを残す（下校のほうが手堅い判断） */
          const row = {dt, slot:les[i].id, to, title:NO_LESSON,
                       note:String(token).trim()};
          if(map[k] != null) rows[map[k]] = row;
          else map[k] = rows.push(row) - 1;
        }
      }
    }
  }
  /* **月が決められない日の字があるなら、丸ごと受け付けない。**
     手前の頁の月に押し込んで混ぜるより、「◯月」の行を足して
     もらうほうが手堅い */
  if(monthBad)
    return {warn:"<b>「◯月」の行が見つからない日付が " + monthBad + " あります。</b>"
          + "どの月か決められないので、読むのをやめました。"
          + "表の見出しに月の行（「4月」など）を入れてから読んでください。"};
  const headInfo = "<b>読んだ形：</b>"
    + (L.pages.length === 1 && L.pages[0].months.length === 1
        ? L.pages[0].months[0].m + "月行事計画"
        : year + "年の年間行事計画")
    + "　" + daysHit + "日ぶん";
  let warn = headInfo;
  if(!rows.length)
    warn += "<br><b>校時が読めた予定がありません。</b>"
      + "入るのは「3h」「34h」「AM」「特4h」「◯◯下校」のある予定だけです"
      + "（日の行事は、日の形から入れます）。";
  if(sunday) warn += "<br>日曜の " + sunday + " 行は紙に無いので入れません。";
  if(bad.length) warn += "<br><b>入れない行が " + bad.length + " ありました。</b><br>"
    + bad.slice(0, 8).map(escText).join("<br>")
    + (bad.length > 8 ? "<br>ほか " + (bad.length - 8) + " 行" : "");
  return {rows, warn};
}

/* 入れる。**日付が何週にもまたがる。**
   書く前に、当たる週をぜんぶ読む ── 読まずに書くと、そのコマの
   サーバ側の時刻（sat）が 0 のまま送られる。0 は「その行はまだ無い」の意味
   なので、既にある行を書こうとしていると見なされて競合で止まる
   （→ gas/Domain.gs expectedVersionMatches）。 */
function impEvApply(rows, then){
  const byFy = {};
  for(const r of rows){
    const mon = mondayOf(r.dt);
    (byFy[fyOf(mon)] || (byFy[fyOf(mon)] = {}))[iso(mon)] = true;
  }
  const w = Wait.begin("入れる先の週を読んでいます");
  readByFy(byFy, () => {
    Wait.end(w);
    then(impEvWrite(rows));
  });
}

function impEvWrite(rows){
  const keep = monday;
  let n = 0, skip = 0;
  try{
    for(const r of rows){
      monday = mondayOf(r.dt);
      const d = Math.round((r.dt - monday) / 86400000);
      if(d < 0 || d >= DAYS){ skip++; continue; }
      const wk = week();
      const st = r.to.layer === "school"
        ? wk.school
        : (wk.grade[r.to.target] || (wk.grade[r.to.target] = {}));
      const key = ck(d, r.slot);
      /* **書き替える前に、サーバの時刻を控える**（writeCell と同じ決まり） */
      const was  = (st[key] || {}).sat || 0;
      const wasT = plain((st[key] || {}).title);
      const e = st[key] || {title:"", note:"", subject:null};
      e.title = escText(r.title);
      if(r.note) e.note = escText(r.note);
      /* 教科は付けない。**行事は時数に数えない**（数えるものは教科で決まる）。
         行事の教科コードを当てにいくと、名前の似た教科に吸われる */
      e.subject = e.subject || null;
      e.by = myEmail();
      e.at = Date.now();
      e.sat = was;
      st[key] = e;
      /* **どの週のコマかを渡す。** 渡さないと「いま開いている週」として
         送られ、別の週のコマを書き替えることになる */
      Backend.cellChanged(r.to.layer, r.to.target, d, r.slot, was,
                          {year:fy(), monday:wkKey()}, wasT);
      n++;
    }
  } finally{ monday = keep; }
  save();
  return {n, skip};
}

/* ── 連携シート ──────────────────────────────
   行事計画を貼るスプレッドシートを、**サイトが作って紐づける**。
   担当者はそこへ表をセルごと貼り付け、こちらはセルの字を読む。
   貼った形は学校ごとに違うので、セルを区切りでつないで
   **いつもの貼り付け読みと同じ経路**に乗せる（雛形→行事計画の字の順で試す）。 */
function impSheetOpen(){
  const w = Wait.begin("連携シートを開いています");
  Backend.eventSheetEnsure(r => {
    Wait.end(w);
    if(r && r.url) window.open(r.url, "_blank");
    if(r && r.fresh)
      $("ipStat").textContent =
        "連携シートを作りました。行事計画を貼ってから「連携シートから読む」を押します";
  }, e => { Wait.end(w); toast("<b>連携シートを開けません</b>　" + escText(String(e))); });
}
function impSheetRead(){
  const w = Wait.begin("連携シートを読んでいます");
  Backend.eventSheetRead(r => {
    Wait.end(w);
    const rows = (r && r.rows) || [];
    const text = rows.map(line => line.join("\t")).join("\n");
    if(!text.trim()){
      $("ipStat").textContent =
        "連携シートに字がありません。行事計画を貼ってから押します";
      return;
    }
    impPlanRead(text);
    const st = $("ipStat").textContent;
    if(impPlanRows) $("ipStat").textContent = "連携シートから読みました" + (st ? "（" + st + "）" : "");
  }, e => { Wait.end(w); toast("<b>連携シートを読めません</b>　" + escText(String(e))); });
}

