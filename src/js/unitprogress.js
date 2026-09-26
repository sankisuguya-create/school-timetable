/* ==================================================================
   unitprogress.js — 単元進捗（単元を作る・コマに割り付ける・番号を出す）

   **番号（1/5, 2/5 …）は保存しない。** コマが持つのは「どの単元か」の印だけ
   （セルの u。"u12"=この単元のコマと決めた／"-"=この単元から外す）。
   番号は出すたびに数える ── 起点からそのコマまでの、その単元のコマの数。
   だから1コマ抜けば後ろは勝手に繰り上がり、書き換える行は触った1行だけ。

   層（全校・学年・専科）をまたいでも壊れない ── 印は既存の1コマ1行の
   「単元」列に乗り、書き込み・競合・退避はそのまま効く。

   **同じクラス・同じ教科に単元が2本あるとき、1コマはどちらか片方のもの。**
   決まりは2つだけ：
     ・コマに印があれば、印の単元のもの（pin は「ここをこの単元にする」宣言）
     ・印がなければ、そのコマより前に起点を置いた単元のうち
       起点がいちばん新しいもののもの（前の単元のコマをあとから分ける形になる）
================================================================== */

const PAL_URESET = "__ureset";   /* パレットの「単元をリセット」チップ */

const UP = {
  key:"",              /* いまの面の持ち主の見分け（home/3-3/, special//rika） */
  units:[],            /* この面に関係する単元 */
  terms:[], termVersion:"[]",
  warns:{},            /* 単元ID -> 学期末に入りきらない旨の文 */
  loading:false, asked:{},   /* asked: 週を読みに行った記録（何度も投げない） */
  seq:{},              /* 番号の取り置き。dataTick で古くなる */
};

/* ── 持ち主 ────────────────────────────────────
   単元は「誰の単元か」を持つ：担任のクラス（home）か、専科の枠（special）。
   学級の面ではそのクラスの単元（担任の分も専科の分も）を出す ──
   紙に出る番号は、そのクラスの紙に出るコマの番号だから。 */
function upViewUnits_(){
  if(typeof view === "undefined" || !view) return [];
  if(view.kind === "class")
    return UP.units.filter(u => u.target === view.cls);
  if(view.kind === "special")
    return UP.units.filter(u => u.layer === "special" && u.sp === view.sp);
  return [];
}

/* 管理画面・作成先の持ち主 */
function upOwner_(){
  if(typeof view === "undefined" || !view) return null;
  if(view.kind === "class")   return {layer:"home",    target:view.cls, sp:""};
  if(view.kind === "special") return {layer:"special", target:"",       sp:view.sp};
  return null;
}

/* 起点の週から toISO の週までの月曜一覧 */
function upMons_(fromISO, toISO){
  const out = [];
  let m = mondayOf(parseISO(fromISO));
  const end = mondayOf(parseISO(toISO));
  for(let i = 0; i < 60 && m <= end; i++){ out.push(iso(m)); m = addDays(m, 7); }
  return out;
}

/* 単元の起点が属する学期（採番・警告の走査が止まる壁） */
function upTermFor_(dateISO){
  return (UP.terms || []).filter(t => t.start <= dateISO && dateISO <= t.end)[0] || null;
}
/* 走査のおわり：学期があれば学期末、なければ起点から8週先（単元は数週で終わる） */
function upRangeEnd_(unit){
  const st = (unit.start || {}).date;
  if(!st) return "";
  const t = upTermFor_(st);
  if(t) return t.end;
  return iso(addDays(parseISO(st), 8 * 7));
}

/* ── 番号（派生） ──────────────────────────────
   起点の週から数えて、「このコマはこの単元の何時間目か」の表を作る。
   重いのは走査ではなく週の読み込み ── 未読の週があるときは「仮」として
   薄く出し、裏で読みに行って、届いたら描き直す（時数集計と同じ流儀）。 */

const upSlotRank_ = sid => SLOTS.findIndex(s => s.id === sid);

/* そのコマが「単元のコマとして数えられる場所」か（授業の校時・休み日でない） */
function upCountable_(d, s){
  const sl = SLOT_BY_ID[s];
  return !!(sl && sl.kind === "lesson" && slotShown(d, sl) && !isDayOff(d));
}

/* コマの印（u）を、単元の持ち主の棚から読む。
   担任の単元は home 棚、専科の単元はその対象クラスの週案シートの special 棚 */
function upCellMark_(w, unit, d, s){
  const key = ck(d, s);
  const bank = unit.layer === "special" ? (w.special[unit.target] || {})
                                        : (w.home[unit.target] || {});
  return String((bank[key] || {}).u || "");
}

/* そのコマがこの単元の教科の授業か（紙に出ている教科で見る）。
   担任の単元：合成後の教科で見る（上の層に潰れていれば数えない）。
   専科の単元：そのクラスにこの枠（sp）の授業があるかで見る。
   専科棚に明示の割付があればそれに従い、無ければ基本時間割の当たりを見る */
function upSubjectHit_(w, unit, d, s){
  const key = ck(d, s);
  if(unit.layer === "special"){
    const e = (w.special[unit.target] || {})[key];
    if(e) return e.sp === unit.sp;          /* 別の枠へ動かしていれば false */
    return spBaseClasses(d, s, unit.sp).indexOf(unit.target) >= 0;
  }
  const c = compose(unit.target, d, s);
  return rootSubject(c.subject || "") === unit.subject;
}

/* コマの位置が起点以上か（起点のコマ自身を含む） */
function upAfterStart_(st, dt, s){
  if(dt < st.date) return false;
  if(dt === st.date) return upSlotRank_(s) >= upSlotRank_(st.slot);
  return true;
}
/* a が b より後に置かれた起点か（同じ位置は b のほうが先 = ここでは同時起点を区別しない） */
function upStartNewer_(a, b){
  if(a.date !== b.date) return a.date > b.date;
  return upSlotRank_(a.slot) > upSlotRank_(b.slot);
}

/* 同じクラス・同じ教科（専科は同じ枠）で、起点のあるほかの単元。
   1コマ1単元の争いの相手 ── 採番・移動の両方で使う */
function upOthers_(unit){
  return UP.units.filter(u =>
    u.id !== unit.id && u.subject === unit.subject
    && u.target === unit.target
    && u.layer === unit.layer
    && (unit.layer !== "special" || u.sp === unit.sp)
    && (u.start || {}).date);
}

/* そのコマがこの単元のものか。pin > 外す印 > ほかの単元のpin > 規定の所属 */
function upIsMine_(w, unit, others, d, s, dt){
  const mark = upCellMark_(w, unit, d, s);
  if(mark === unit.id) return true;    /* pin */
  if(mark === "-")     return false;   /* この単元から外す */
  if(mark)             return false;   /* ほかの単元の pin（u:"u9"） */
  /* 規定の所属：起点以降・授業の場所・同じ教科 */
  if(!upAfterStart_(unit.start, dt, s)) return false;
  if(!upCountable_(d, s)) return false;
  if(!upSubjectHit_(w, unit, d, s)) return false;
  /* あとから起点を置いた同教科の単元がいれば、そちらに譲る */
  for(const other of others){
    if(other === unit || !(other.start || {}).date) continue;
    if(!upStartNewer_(other.start, unit.start)) continue;   /* 自分より後の起点だけが奪う */
    if(!upAfterStart_(other.start, dt, s)) continue;         /* そのコマが相手の範囲内 */
    const om = upCellMark_(w, other, d, s);
    if(om === "-") continue;                                /* 相手から外しているコマは渡さない */
    return false;
  }
  return true;
}

/* 走査の本体。**monday を一時的に動かして week() をその週に向ける**
   （compose・isDayOff・slotShown が全部その週を見るようになる）
   読み終えていない週は空の棚で数える（基本時間割のコマは見えるので、
   印だけが抜ける = 仮の番号） */
function upScan_(unit, endISO, allWeeks){
  const st = unit.start || {};
  const map = {};                                   /* "date|slot" -> 番号 */
  const out = {map, count:0, partial:false};
  if(!st.date || !st.slot) return out;
  const now = wkKey();
  /* 画面に出すのは今の週まで。**確定（焼き付け）は範囲の終わりまで振る** ──
     翌週以降に置いたぶんも番号が無いと備考欄へ移せない */
  const to = allWeeks ? endISO : (endISO < now ? endISO : now);
  const mons = upMons_(st.date, to);
  out.partial = Backend.unread(mons, fy()) > 0;     /* まだ読んでいない週がある */
  const others = upOthers_(unit);                   /* 争いの相手 */
  let seq = 0;
  const keep = monday;
  try{
    for(const m of mons){
      monday = parseISO(m);                          /* week() がその週を指す */
      const w = week();
      for(let d = 0; d < DAYS; d++){
        const dt = iso(addDays(monday, d));
        for(const sl of SLOTS){
          if(sl.kind !== "lesson") continue;
          if(!upIsMine_(w, unit, others, d, sl.id, dt)) continue;
          seq++;
          /* 上限を越えた分には番号を出さない（授業数を減らすと末尾が消える） */
          if(seq <= unit.lessonCount + (unit.hasTest ? 1 : 0))
            map[dt + "|" + sl.id] = seq;
        }
      }
    }
  }finally{ monday = keep; }
  out.count = seq;
  return out;
}

/* 今の週の分だけ取り置く。dataTick で古くなる */
function upSeqFor_(unit){
  const key = unit.id + "|" + wkKey();
  const hit = UP.seq[key];
  if(hit && hit.tick === dataTick) return hit;
  const r = upScan_(unit, upRangeEnd_(unit));
  const out = {tick:dataTick, map:r.map, count:r.count, partial:r.partial};
  UP.seq[key] = out;
  return out;
}

/* 学期末までにこの単元のコマとして並ぶ数（警告の「もう入っている」側） */
function upPlaced_(unit){
  const st = unit.start || {};
  if(!st.date) return 0;
  const r = upScanTo_(unit, upRangeEnd_(unit));
  return r.count;
}

/* endISO を越えても数える走査（警告用。map は今の週までの分だけが要る） */
function upScanTo_(unit, endISO){
  const st = unit.start || {};
  const out = {count:0};
  if(!st.date || !st.slot) return out;
  const mons = upMons_(st.date, endISO);
  const others = upOthers_(unit);
  let seq = 0;
  const keep = monday;
  try{
    for(const m of mons){
      monday = parseISO(m);
      const w = week();
      for(let d = 0; d < DAYS; d++){
        const dt = iso(addDays(monday, d));
        for(const sl of SLOTS){
          if(sl.kind !== "lesson") continue;
          if(upIsMine_(w, unit, others, d, sl.id, dt)) seq++;
        }
      }
    }
  }finally{ monday = keep; }
  out.count = seq;
  return out;
}

/* 未読の週が混ざっていたら裏で読み、届いたら描き直す。
   **画面は止めない** ── 読むだけの処理を全面で止めると、番号が出るまで
   週案も触れなくなる。読んでいるあいだは番号を薄い「仮」で出し、
   届いたら確かな番号に入れ替わる（印はバッジの薄さが言う） */
function upEnsureRange_(unit){
  const st = (unit.start || {});
  if(!st.date || UP.loading) return;
  const mons = upMons_(st.date, wkKey());
  if(Backend.unread(mons, fy()) === 0) return;
  const want = mons.filter(m => !UP.asked[m]);
  if(!want.length) return;
  for(const m of want) UP.asked[m] = true;
  UP.loading = true;
  /* 番号が仮から確かな番号に入れ替わるわけを、一言だけ残す */
  toast("単元のコマを数えるため、起点からの週を読んでいます。"
      + "届くまで番号は薄い色の仮です");
  Backend.readWeeks(want, () => {
    UP.loading = false;
    UP.seq = {};                                    /* 数え直す */
    paintSheet();
  });
}

/* ── バッジ（紙に出す印） ──────────────────────
   題名・備考とは別の小さな帯で出す。**番号はここでだけ見える**
   （たんぽぽ・Sheet 出力には出さない ── 印刷・画像には紙ごと出るので入る）。 */
function upBadgeFor_(d, s, c){
  if(typeof view === "undefined") return null;
  if(view.kind !== "class" && view.kind !== "special") return null;
  const dt = iso(addDays(monday, d));

  for(const u of upViewUnits_()){
    /* このコマの持ち主クラス：学級の面はそのクラス、専科の面は各単元が判定する。
       明示の割付（cls あり）はそのクラスのコマ、無ければ基本時間割の当たりを見る。
       複数クラスのコマにも出す ── 番号はその単元の持ち主のもの */
    if(view.kind === "class"){
      if(u.target !== view.cls) continue;
    }else{
      if(u.layer !== "special" || u.sp !== view.sp) continue;
      if(c && c.cls){ if(c.cls !== u.target) continue; }
      else if(spBaseClasses(d, s, view.sp).indexOf(u.target) < 0) continue;
    }
    if(!(u.start || {}).date) continue;
    const r = upSeqFor_(u);
    const seq = r.map[dt + "|" + s];
    if(!seq) continue;
    const test = u.hasTest && seq === u.lessonCount + 1;
    if(seq > u.lessonCount && !test) continue;       /* 越えたぶんは出さない */
    /* 複数クラスのコマでは、どのクラスの番号かを先に添える */
    const pre = (view.kind === "special" && !(c && c.cls)) ? u.target + "・" : "";
    /* バッジの字は単元名の冒頭4文字（備考欄に出す小さな印） */
    const label = test ? (pre + u.name.slice(0, 4) + "テスト")
                       : (pre + u.name.slice(0, 4) + " " + seq + "/" + u.lessonCount);
    upEnsureRange_(u);
    return {t:label, uid:u.id, dim:r.partial, warn:!!UP.warns[u.id],
            start:u.start.date === dt && u.start.slot === s,
            title:"単元「" + u.name + "」の " + seq + " 時間目"
                  + (UP.warns[u.id] ? "　" + UP.warns[u.id] : "")
                  + (r.partial ? "（起点より前の週をまだ読んでいない。仮の番号）" : "")};
  }
  return null;                                     /* 1コマ1単元：最初に見つけたもの */
}

/* コマのバッジを描く／消す。paintCell の最後に1か所だけ呼ぶ */
function upPaintBadge_(e, c, d, s){
  /* 学年ごとの面（gcell）では出さない ── クラスぶんに割った1コマの幅に
     単元の印は入らない。印を動かす仕掛けも、ここは「見るだけ」の面なので要らない */
  if(e.classList.contains("gcell")) return;
  let box = e.querySelector(".ub");
  const b = upBadgeFor_(d, s, c);
  if(!b){
    if(box) box.remove();
    delete e.dataset.unit;
    return;
  }
  if(!box){
    box = el("span", "ub");
    box.draggable = true;
    /* バッジをつかんで別のコマへ = その単元の起点を動かす（あれば交換） */
    box.addEventListener("dragstart", ev => {
      ev.dataTransfer.setData("text/x-unitmove",
        e.dataset.unit + "|" + d + "|" + s);
      ev.dataTransfer.effectAllowed = "move";
      ev.stopPropagation();
    });
    /* 印を押すと、単元と警告の理由を言う */
    box.addEventListener("click", ev => {
      ev.preventDefault(); ev.stopPropagation();
      const w = UP.warns[e.dataset.unit];
      if(w) toast(w); else toast(box.title);
    });
    /* **備考欄に出す。** 題名欄（.t）ではなく、コマのいちばん下 ──
       備考（.n）のあと。備考の字は n.innerHTML で上書きされるので
       バッジは n の中には入れず、なか下にぶら下げる */
    e.appendChild(box);
  }
  e.dataset.unit = b.uid;
  box.textContent = b.t + (b.warn ? "　！" : "");
  box.title = b.title;
  box.className = "ub" + (b.warn ? " warn" : "") + (b.start ? " start" : "")
                + (b.dim ? " dim" : "");
}

/* ── 印を書く ──────────────────────────────────
   コマの「単元」列を書く1本道。書く週が今の週でなくても動くように、
   monday を一時的に動かしてから棚を触る（buildSheet と同じ流儀）。
   writeCell は通さない ── 題名や備考を引き継いだり潰したりしない。
   印だけを書き、cellChanged で既存の保存経路に乗せる。 */
function upMark_(unit, d, s, v, monISO){
  const keep = monday;
  try{
    if(monISO) monday = mondayOf(parseISO(monISO));
    const w = week(), key = ck(d, s);
    const bank = unit.layer === "special" ? (w.special[unit.target] || (w.special[unit.target] = {}))
                                          : (w.home[unit.target]    || (w.home[unit.target] = {}));
    const e = bank[key];
    const was = (e || {}).sat || 0, wasT = plain((e || {}).title);
    if(!e && !v) return true;                      /* 消す先が無い */
    if(!e){
      if(unit.layer === "special"){
        /* 専科の行：紙に出す字は教科名。題名の無い空行を作ると、
           このクラスの紙から教科名が消える。
           sp は入れない ── 入れると「明示の割付」とみなされて、
           同じコマに載っているほかのクラスが専科の面から消える */
        const sub = SUB_BY_CODE[spSubjectOf(unit.sp)];
        bank[key] = {title: escText(sub ? sub.name : unit.subject || ""),
                     subject: spSubjectOf(unit.sp) || unit.subject || null,
                     sp:"", note:"", u:v, by:myEmail(), at:Date.now()};
      }else{
        /* 印だけの行でも、いま紙に出ているものを引き継ぐ（writeCell と同じ）。
           題名を空にすると、基本時間割の「算数」が紙から消えてしまう */
        const cur = compose(unit.target, d, s);
        bank[key] = {title: cur.title || "", note: cur.note || "",
                     subject: cur.subject || null,
                     u:v, by:myEmail(), at:Date.now()};
      }
    }else if(v){
      e.u = v;
    }else{
      delete e.u;
      /* 専科で印だけのために足した行（sp を持たない）は、印が消えたら行も消す。
         残しておくと、この行が載るだけで別のクラスの割付表示を変えてしまう */
      if(unit.layer === "special" && !e.sp && !plain(e.note)
         && !/<a\b/i.test(e.link || ""))
        delete bank[key];
      else if(isEmptyCell(e)) delete bank[key];
    }
    Backend.cellChanged(
      unit.layer === "special" ? "special" : "home",
      unit.target, d, s, was,
      monISO ? {year:fy(), monday:monISO} : undefined, wasT);
    return save();
  }finally{ monday = keep; }
}

/* **番号の字を備考欄に入れる（焼き付け）。** いま出ている番号をただの字に
   変えて残すので、終わった単元はもうコマを数えなくてよい。
   行が無いコマは、紙に出ているものを引き継いで備考だけの行を作る
   （upMark_ と同じ決まり）。専科で新しく足す行は sp を持たせない ──
   持たせると「明示の割付」扱いで、別のクラスの表示を変えてしまう */
function upBakeNote_(unit, d, s, label, monISO){
  const keep = monday;
  try{
    if(monISO) monday = mondayOf(parseISO(monISO));
    const w = week(), key = ck(d, s);
    const bank = unit.layer === "special" ? (w.special[unit.target] || (w.special[unit.target] = {}))
                                          : (w.home[unit.target]    || (w.home[unit.target] = {}));
    const e = bank[key];
    const was = (e || {}).sat || 0, wasT = plain((e || {}).title);
    if(!e){
      if(unit.layer === "special"){
        const sub = SUB_BY_CODE[spSubjectOf(unit.sp)];
        bank[key] = {title: escText(sub ? sub.name : unit.subject || ""),
                     subject: spSubjectOf(unit.sp) || unit.subject || null,
                     sp:"", note:escText(label), by:myEmail(), at:Date.now()};
      }else{
        const cur = compose(unit.target, d, s);
        bank[key] = {title: cur.title || "", note:escText(label),
                     subject: cur.subject || null,
                     by:myEmail(), at:Date.now()};
      }
    }else{
      e.note = clean((e.note ? e.note + " " : "") + escText(label));
      delete e.u;                         /* 番号が字になったので印は要らない */
    }
    Backend.cellChanged(
      unit.layer === "special" ? "special" : "home",
      unit.target, d, s, was,
      monISO ? {year:fy(), monday:monISO} : undefined, wasT);
    return save();
  }finally{ monday = keep; }
}

/* ── 割付・移動・リセット ────────────────────── */

/* 落とせる場所か。入らないときは理由を返す（toast 用の文） */
function upCanDrop_(unit, d, s){
  if(whyLocked()) return whyLocked();
  if(typeof view === "undefined") return "週案の面で落とします";
  const sl = SLOT_BY_ID[s];
  if(!sl || sl.kind !== "lesson") return "授業のコマに落とします";
  if(isDayOff(d)) return "この日は<b>休み</b>。授業のコマに落とします";
  if(!slotShown(d, sl)) return "この日はこの校時が無い";
  return "";
}

/* 単元チップをコマに落とした。
   起点がまだ無い → このコマを起点にして、その教科の後続コマへ連番が付く。
   起点に落とした → 全消滅（起点を消し、全部の印を外す）。
   それ以外のコマ → そのコマだけ単元から外す／外したのを戻す（番号は繰り上がる） */
/* 落としたコマのクラス（専科の面で）。明示の割付が無いときは
   基本時間割の当たりを見る ── クラスが1つに決まらなければ空を返す */
function upCellClass_(d, s){
  const c = cellFor(d, s);
  if(c && c.cls) return String(c.cls);
  const bs = spBaseClasses(d, s, view.sp);
  return bs.length === 1 ? bs[0] : "";
}

function upDropChip_(unit, d, s){
  const why = upCanDrop_(unit, d, s);
  if(why) return toast(why);
  const dt = iso(addDays(monday, d)), wk = wkKey();

  /* **専科の面のチップは学年のもの。** 落とす先のクラスのぶんを取る。
     学年のクラスにまだ無ければ、ここで同じものを作る
     （学年の単元は全クラスに同じものがある持ち方） */
  if(view.kind === "special"){
    const cls = upCellClass_(d, s);
    if(!cls) return toast("このコマのクラスが分かりません");
    if(gradeOf(cls) !== gradeOf(unit.target))
      return toast("「" + escText(unit.name) + "」は " + escText(gradeOf(unit.target))
                   + "年の単元です。" + gradeOf(cls) + "年のコマには落とせません");
    const mine = UP.units.find(u => u.layer === "special" && u.sp === unit.sp
      && u.subject === unit.subject && u.name === unit.name && u.target === cls);
    if(mine) unit = mine;
    else{
      Backend.saveUnit({layer:"special", target:cls, sp:unit.sp,
                        subject:unit.subject, name:unit.name,
                        lessonCount:unit.lessonCount, hasTest:unit.hasTest},
        saved => {
          if(saved){
            UP.units.push(saved);
            upDropChip_(saved, d, s);
          }
        }, why2 => toast(why2));
      return;
    }
  }

  /* 起点が無い → ここを起点にする */
  if(!(unit.start || {}).date){
    if(!upSubjectHit_(week(), unit, d, s))
      return toast("この単元は<b>" + escText((SUB_BY_CODE[unit.subject] || {}).name || unit.subject)
                   + "</b>のコマに落とします");
    /* 楽観ロック用にいま持っている時刻を添える。保存が通ってから start を変える
       （先に変えると、弾かれたときに画面だけ動いたように見える） */
    const input = Object.assign({}, unit,
      {expectedUpdatedAt: unit.updatedAt || "", start: {date:dt, slot:s}});
    Backend.saveUnit(input, saved => {
      Object.assign(unit, saved || {});
      upMark_(unit, d, s, unit.id, wk);          /* 起点のコマに印を付ける */
      UP.seq = {};
      upWarnOne_(unit);
      paintSheet();
      toast("「" + escText(unit.name) + "」を " + md(addDays(monday, d))
            + " から始めた。この後の" + escText(unit.name.slice(0, 3))
            + "のコマに番号が付きます");
    }, why2 => toast(why2));
    return;
  }

  /* 起点に落とした → 全消滅 */
  const smon = mondayOf(parseISO(unit.start.date));
  if(iso(smon) === wk && unit.start.date === dt && unit.start.slot === s){
    askOk({
      title:"「" + unit.name + "」を全部取り消しますか",
      lines:["この単元の起点と、コマに付いている印を全部外します。",
             "単元そのものは残ります。後で別のコマに置き直せます。"],
      goLabel:"取り消す",
      onYes:() => upResetAll_(unit)
    });
    return;
  }

  /* ほかの単元の pin コマに落とした → 争いを避ける */
  const mark = upCellMark_(week(), unit, d, s);
  if(mark && mark !== "-" && mark !== unit.id)
    return toast("ここは別の単元のコマです。先にその単元を動かしてください");
  const other = upViewUnits_().find(u => u !== unit && u.start
    && u.target === unit.target            /* 専科の面：ほかのクラスの起点は関係ない */
    && u.start.date === dt && u.start.slot === s);
  if(other)
    return toast("ここは「" + escText(other.name) + "」の起点です。単元を変えるときは、"
                 + "その単元のチップを落とし直してください");

  /* そのコマだけ外す／外したのを戻す。関係ない教科のコマに印は付けない */
  if(!mark && !upSubjectHit_(week(), unit, d, s))
    return toast("この単元は<b>" + escText((SUB_BY_CODE[unit.subject] || {}).name || unit.subject)
                 + "</b>のコマに落とします");
  if(mark === "-"){
    upMark_(unit, d, s, "", wk);
    toast("このコマを「" + escText(unit.name) + "」に戻した");
  }else if(mark === unit.id && !(unit.start.date === dt && unit.start.slot === s)){
    upMark_(unit, d, s, "", wk);                 /* pin（外したのを戻した印）を解除 */
    toast("このコマの印を外した");
  }else{
    upMark_(unit, d, s, "-", wk);                /* このコマだけ外す */
    toast("このコマを「" + escText(unit.name) + "」から外した。後の番号が繰り上がります");
  }
  UP.seq = {};
  paintSheet();
}

/* バッジをつかんで別のコマへ。unit のコマ（起点なら起点ごと）を動かす。
   落とす先に別の単元の印があれば、2つの単元のコマを交換する */
function upMoveStart_(data, d, s){
  const parts = String(data || "").split("|");
  const uid = parts[0], srcD = +parts[1], srcS = parts[2];
  const unit = upViewUnits_().find(u => u.id === uid);
  if(!unit || !(unit.start || {}).date) return;
  const why = upCanDrop_(unit, d, s);
  if(why) return toast(why);
  /* **専科の面では、自分のクラスのコマにしか動かせない。**
     別のクラスのコマに落とすと、そのクラスが載っていない棚に印が付き、
     起点や並びが静かに壊れる */
  if(view.kind === "special"){
    const dest = upCellClass_(d, s);
    if(dest !== unit.target)
      return toast(dest
        ? "このコマは " + escText(dest) + " のものです"
        : "このコマのクラスが分かりません");
  }
  const wk = wkKey(), w = week();
  const srcDt = iso(addDays(monday, srcD));
  const dstDt = iso(addDays(monday, d));
  if(srcDt === dstDt && srcS === s) return;

  /* **落とす先が、すでにこの単元のコマ** → 単元の中での動き。
     番号は場所で決まるので、印だけ動かしても並びは変わらない。
     ここで出発コマを外す（"-"）と、単元のコマが1つ減ってしまい、
     あとに取れるコマが無ければ最後の「テスト」が消える。
     両方ともこの単元のコマのままにして、順番は変えない */
  const mark2 = upCellMark_(w, unit, d, s);
  if(mark2 === unit.id
     || (!mark2 && upIsMine_(w, unit, upOthers_(unit), d, s, dstDt))){
    upMark_(unit, d, s, unit.id, wk);            /* pin で置き直す（残るだけ） */
    UP.seq = {};
    paintSheet();
    return toast("番号は場所で決まるので、「" + escText(unit.name)
                 + "」の中では順番は変わりません。"
                 + "このコマを外すときは、単元チップを落とします");
  }

  /* ほかの単元のコマに落とした → 交換。pin だけでなく、
     印が無くても相手のコマとして数えられている場所も相手のもの */
  const other = upViewUnits_().find(u => u !== unit
    && u.target === unit.target            /* 交換の相手は同じクラスの単元だけ */
    && (upCellMark_(w, u, d, s) === u.id
        || (!upCellMark_(w, u, d, s)
            && upIsMine_(w, u, upOthers_(u), d, s, dstDt))));
  if(other){
    /* 交換：着いたコマを unit のものに、出発したコマを other のものにする。
       どちらかが起点なら、起点どうしも入れ替える（交換は教科をまたいでよい：
       pin で入れ替わるので、コマの教科は問わない） */
    upMark_(unit, d, s, unit.id, wk);
    upMark_(other, srcD, srcS, other.id, wk);
    if(unit.start.date === srcDt && unit.start.slot === srcS)
      Backend.saveUnit(Object.assign({}, unit,
        {expectedUpdatedAt: unit.updatedAt || "",
         start: {date:dstDt, slot:s}}),
        saved => Object.assign(unit, saved || {}), why2 => toast(why2));
    if(other.start.date === dstDt && other.start.slot === s)
      Backend.saveUnit(Object.assign({}, other,
        {expectedUpdatedAt: other.updatedAt || "",
         start: {date:srcDt, slot:srcS}}),
        saved => Object.assign(other, saved || {}), why2 => toast(why2));
    UP.seq = {};
    toast("「" + escText(unit.name) + "」と「" + escText(other.name) + "」のコマを入れ替えた");
    paintSheet();
    return;
  }

  /* ふつうの移動：起点なら起点ごと動かす、途中のコマなら外して先へ pin */
  const wasStart = unit.start.date === srcDt && unit.start.slot === srcS;
  if(wasStart && !upSubjectHit_(w, unit, d, s)){
    const subName = (SUB_BY_CODE[unit.subject] || {}).name || unit.subject;
    return toast("起点は<b>" + escText(subName) + "</b>のコマに置きます");
  }
  if(wasStart){
    Backend.saveUnit(Object.assign({}, unit,
      {expectedUpdatedAt: unit.updatedAt || "",
       start: {date:dstDt, slot:s}}), saved => {
      Object.assign(unit, saved || {});
      upMark_(unit, srcD, srcS, "", wk);
      upMark_(unit, d, s, unit.id, wk);
      UP.seq = {};
      upWarnOne_(unit);
      paintSheet();
      toast("「" + escText(unit.name) + "」の起点を " + md(addDays(monday, d)) + " に動かした");
    }, why2 => toast(why2));
  }else{
    /* 途中のコマを動かす = 出発コマを外し、着いたコマに pin を付ける */
    upMark_(unit, srcD, srcS, "-", wk);
    upMark_(unit, d, s, unit.id, wk);
    UP.seq = {};
    paintSheet();
    toast("「" + escText(unit.name) + "」のコマを動かした。番号は順番のままです");
  }
}

/* 起点・印をぜんぶ外す（全消滅）。週をまたいで書くので、先に読んでから書く */
function upResetAll_(unit, done){
  const st = (unit.start || {});
  if(!st.date){ if(done) done(); return; }
  const mons = upMons_(st.date, upRangeEnd_(unit));
  const wid = Wait.begin("「" + unit.name + "」の印を外しています");
  Backend.readWeeks(mons, () => {
    /* 読み終えてから印を外す（読まずに書くと競合になる） */
    const keep = monday;
    try{
      for(const m of mons){
        monday = mondayOf(parseISO(m));
        const w = week();
        for(let d = 0; d < DAYS; d++) for(const sl of SLOTS){
          if(sl.kind !== "lesson") continue;
          if(upCellMark_(w, unit, d, sl.id))
            upMark_(unit, d, sl.id, "", m);
        }
      }
    }finally{ monday = keep; }
    Backend.clearUnitStart(unit.id, unit.updatedAt, saved => {
      unit.start = {date:"", slot:""};
      if(saved && saved.updatedAt) unit.updatedAt = saved.updatedAt;
      delete UP.warns[unit.id];
      UP.seq = {};
      Wait.end(wid);
      paintSheet();
      if(done) done();
    }, why => { Wait.end(wid); toast(why); });
  });
}

/* 「単元リセット」チップをコマに落とす → そのコマの単元を全部外す。
   **起点のコマでなくてもよい** ── 印（pin）だけでなく、
   その単元のコマとして数えられている場所（番号が出ているコマ）でも効く */
function upResetChip_(d, s){
  const w = week(), dt = iso(addDays(monday, d));
  const unit = upViewUnits_().find(u =>
    upCellMark_(w, u, d, s) === u.id
    || (!upCellMark_(w, u, d, s) && upIsMine_(w, u, upOthers_(u), d, s, dt)));
  if(!unit) return toast("ここに単元の印はありません");
  askOk({
    title:"「" + unit.name + "」を全部取り消しますか",
    lines:["この単元の起点と、コマに付いている印を全部外します。",
           "単元そのものは残ります。"],
    goLabel:"取り消す",
    onYes:() => upResetAll_(unit)
  });
}

/* ── 学期末の警告 ──────────────────────────────
   押したときだけ数える（開くたびに全週を読みに行かない）。
   入れる数 = すでに単元のコマになっている数 + まだ取れる空きコマ数。 */
function upWarnOne_(unit){
  if(!(unit.start || {}).date){ delete UP.warns[unit.id]; return; }
  const placed = upPlaced_(unit);                   /* 学期末までに並ぶ数 */
  Backend.unitCapacity(unit.target, unit.subject,
    unit.start.date, unit.start.slot, r => {
      if(!r || r.count === undefined) return;
      const need = unit.lessonCount + (unit.hasTest ? 1 : 0);
      /* 自分の領域の広さ = placed（後発の同教科単元に切られてよい）。
         シート側の同教科コマ総数 = r.count。小さいほうが実際に使える上限 */
      const short = need - Math.min(placed, r.count);
      if(short > 0)
        UP.warns[unit.id] = "学期末までに " + short + "コマ足りません。"
          + "空きコマに置き直すか、授業数を見直してください。";
      else delete UP.warns[unit.id];
      paintSheet();
    }, () => {});
}

/* ── この面の単元を読む ──────────────────────── */
function upLoadView_(after){
  const owner = upOwner_();
  if(!owner){
    UP.units = []; UP.terms = []; UP.warns = {}; UP.seq = {};
    if(after) after();
    return;
  }
  UP.loading = true;
  /* 学級の面は「そのクラスの単元全部」（担任の分も専科の分も）。
     専科の面は「その枠の単元全部」（対象クラスは問わない） */
  Backend.unitManager(
    view.kind === "class" ? {layer:"",        target:view.cls, sp:""}
                          : {layer:"special", target:"",       sp:view.sp},
    "", r => {
      UP.loading = false;
      UP.units = (r && r.units) || [];
      UP.terms = (r && r.terms) || [];
      UP.termVersion = (r && r.termVersion) || "[]";
      UP.seq = {};
      UP.asked = {};
      if(after) after();
      for(const u of upViewUnits_()) if((u.start || {}).date) upWarnOne_(u);
    }, () => {
      UP.loading = false;
      UP.units = [];
      if(after) after();
    });
}

/* 面（画面）が変わるたびに呼ぶ。同じ面なら何もしない */
function upViewChanged_(){
  const owner = upOwner_();
  const key = owner ? owner.layer + "/" + owner.target + "/" + (owner.sp || "") : "";
  if(key === UP.key) return;
  UP.key = key;
  upLoadView_(() => {
    paintSheet();
    if(typeof drawPalette === "function") drawPalette();
  });
}

