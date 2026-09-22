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
function upScan_(unit, endISO){
  const st = unit.start || {};
  const map = {};                                   /* "date|slot" -> 番号 */
  const out = {map, count:0, partial:false};
  if(!st.date || !st.slot) return out;
  const now = wkKey();
  const to = endISO < now ? endISO : now;           /* 画面に出すのは今の週まで */
  const mons = upMons_(st.date, to);
  out.partial = Backend.unread(mons, fy()) > 0;     /* まだ読んでいない週がある */
  /* 同じクラス・同じ教科のほかの単元（1コマ1単元の争いの相手） */
  const others = UP.units.filter(u =>
    u.id !== unit.id && u.subject === unit.subject
    && u.target === unit.target
    && u.layer === unit.layer
    && (unit.layer !== "special" || u.sp === unit.sp)
    && (u.start || {}).date);
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
  const others = UP.units.filter(u =>
    u.id !== unit.id && u.subject === unit.subject
    && u.target === unit.target
    && u.layer === unit.layer
    && (unit.layer !== "special" || u.sp === unit.sp)
    && (u.start || {}).date);
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

/* 未読の週が混ざっていたら裏で読み、届いたら描き直す */
function upEnsureRange_(unit){
  const st = (unit.start || {});
  if(!st.date || UP.loading) return;
  const mons = upMons_(st.date, wkKey());
  if(Backend.unread(mons, fy()) === 0) return;
  const want = mons.filter(m => !UP.asked[m]);
  if(!want.length) return;
  for(const m of want) UP.asked[m] = true;
  UP.loading = true;
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
    const label = test ? (pre + u.name.slice(0, 3) + "テスト")
                       : (pre + u.name.slice(0, 3) + " " + seq + "/" + u.lessonCount);
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
function upDropChip_(unit, d, s){
  const why = upCanDrop_(unit, d, s);
  if(why) return toast(why);
  const dt = iso(addDays(monday, d)), wk = wkKey();

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
            + " から始めた。このあとの" + escText(unit.name.slice(0, 3))
            + "のコマに番号が付きます");
    }, why2 => toast(why2));
    return;
  }

  /* 起点に落とした → 全消滅 */
  const smon = mondayOf(parseISO(unit.start.date));
  if(iso(smon) === wk && unit.start.date === dt && unit.start.slot === s){
    askOk({
      title:"「" + unit.name + "」を全部取り消しますか",
      lines:["この単元の起点と、コマに付いている印をぜんぶ外します。",
             "単元そのものは残ります。あとで別のコマに置き直せます。"],
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
    toast("このコマを「" + escText(unit.name) + "」から外した。あとの番号が繰り上がります");
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
  const wk = wkKey(), w = week();
  const srcDt = iso(addDays(monday, srcD));
  const dstDt = iso(addDays(monday, d));
  if(srcDt === dstDt && srcS === s) return;

  const other = upViewUnits_().find(u => u !== unit
    && upCellMark_(w, u, d, s) === u.id);          /* 落とす先に pin のある単元 */
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

/* 「単元リセット」チップをコマに落とす → そのコマの単元を全部外す */
function upResetChip_(d, s){
  const w = week();
  const unit = upViewUnits_().find(u => upCellMark_(w, u, d, s));
  if(!unit) return toast("ここに単元の印はありません");
  askOk({
    title:"「" + unit.name + "」を全部取り消しますか",
    lines:["この単元の起点と、コマに付いている印をぜんぶ外します。",
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

/* ── 管理画面（作る・直す・消す・学期設定） ── */

const unitState = {cls:"", subject:"", editing:"", loading:false, units:[]};

function unitSubjects_(){
  return SUBJECTS.filter(s => s.count && !s.only);
}
function unitContext_(){
  if(typeof view === "undefined") return null;
  if(view.kind === "class")
    return {kind:"class", classes:[view.cls], subjects:unitSubjects_()};
  if(view.kind === "special"){
    const code = spSubjectOf(view.sp), sub = SUB_BY_CODE[code];
    return {kind:"special", classes:classesOfSpecial(view.sp),
            subjects:sub ? [sub] : []};
  }
  return null;
}
function paintUnitManagerButton(){
  const wrap = $("unitEntry");
  if(!wrap) return;
  const ctx = unitContext_();
  wrap.hidden = !ctx;
  if(!ctx) return;
  $("unitOpenSub").textContent = ctx.kind === "special"
    ? "クラスごとの単元" : "教科ごとの単元と授業数";
}

function unitSelectHtml_(list, value, valueOf, labelOf){
  return list.map(x => {
    const v = valueOf(x), t = labelOf(x);
    return "<option value='" + escText(v) + "'" + (v === value ? " selected" : "") + ">"
      + escText(t) + "</option>";
  }).join("");
}
function unitDefaultSubject_(){
  const ctx = unitContext_();
  if(!ctx || !ctx.subjects.length) return "";
  if(ctx.kind === "special") return ctx.subjects[0].code;
  if(selCell){
    const c = cellFor(selCell.d, selCell.s);
    const code = rootSubject(c.subject || "");
    if(ctx.subjects.some(s => s.code === code)) return code;
  }
  if(unitState.subject && ctx.subjects.some(s => s.code === unitState.subject))
    return unitState.subject;
  return ctx.subjects[0].code;
}
function unitDefaultClass_(){
  const ctx = unitContext_();
  if(!ctx || !ctx.classes.length) return "";
  if(ctx.kind === "class") return ctx.classes[0];
  if(selCell){
    const c = cellFor(selCell.d, selCell.s);
    if(c.cls && ctx.classes.indexOf(c.cls) >= 0) return c.cls;
  }
  if(unitState.cls && ctx.classes.indexOf(unitState.cls) >= 0) return unitState.cls;
  return ctx.classes[0];
}

function openUnitManager(){
  const ctx = unitContext_();
  if(!ctx) return toast("単元進捗管理は<b>学級または専科の週案</b>で使います");
  unitState.cls = unitDefaultClass_();
  unitState.subject = unitDefaultSubject_();
  unitState.editing = "";
  drawUnitContext_();
  $("unitForm").hidden = true;
  $("unitStat").textContent = "読み込んでいます…";
  $("unitList").innerHTML = "";
  $("unitDlg").showModal();
  loadUnitManager();
}
function drawUnitContext_(){
  const ctx = unitContext_();
  if(!ctx) return;
  $("unitFy").textContent = fy() + "年度";
  $("unitCls").innerHTML = unitSelectHtml_(ctx.classes, unitState.cls, x => x, x => x);
  $("unitSub").innerHTML = unitSelectHtml_(ctx.subjects, unitState.subject, x => x.code, x => x.name);
  $("unitCls").disabled = ctx.kind === "class";
  $("unitSub").disabled = ctx.kind === "special";
}
function loadUnitManager(after){
  if(unitState.loading) return;
  unitState.loading = true;
  $("unitStat").textContent = "読み込んでいます…";
  const ctx = unitContext_();
  const owner = ctx.kind === "special"
    ? {layer:"special", target:unitState.cls, sp:view.sp}
    : {layer:"home", target:unitState.cls, sp:""};
  Backend.unitManager(owner, unitState.subject, r => {
    unitState.loading = false;
    const got = (r && r.units) || [];
    /* この持ち主＋教科の分を新しくする（ほかの教科の分は残す） */
    UP.units = UP.units.filter(u =>
      !(u.target === unitState.cls && u.subject === unitState.subject
        && u.layer === owner.layer && (owner.layer !== "special" || u.sp === owner.sp)))
      .concat(got);
    UP.terms = (r && r.terms) || UP.terms;
    UP.termVersion = (r && r.termVersion) || UP.termVersion;
    unitState.units = got;
    UP.seq = {};
    renderUnitManager_();
    if(after) after();
  }, why => {
    unitState.loading = false;
    $("unitStat").textContent = why;
  });
}
function shortDate_(s){
  const p = String(s || "").split("-");
  return p.length === 3 ? (+p[1]) + "/" + (+p[2]) : s;
}
function renderUnitTerm_(){
  const box = $("unitTermInfo");
  if(!UP.terms.length){
    box.className = "unitterm warn";
    box.innerHTML = "<span><b>学期の期間が未設定</b><small>単元登録はできます。自動配置と学期末警告には期間が必要です。</small></span>"
      + "<button class='btn' id='unitTermOpen'>学期を設定</button>";
  }else{
    box.className = "unitterm";
    box.innerHTML = "<span><b>学期</b><small>"
      + UP.terms.map(t => escText(t.name) + " " + shortDate_(t.start) + "〜" + shortDate_(t.end)).join("　")
      + "</small></span><button class='btn' id='unitTermOpen'>期間を直す</button>";
  }
  $("unitTermOpen").onclick = openUnitTerms;
}
function unitStatus_(u){
  if(!(u.start || {}).date) return "未配置";
  const seq = upSeqFor_(u);
  const cap = u.lessonCount + (u.hasTest ? 1 : 0);
  if(seq.count > cap) return "配置 " + cap + "（はみ出し " + (seq.count - cap) + "）";
  return "配置 " + seq.count + "/" + cap;
}
function renderUnitList_(){
  const box = $("unitList");
  const list = unitState.units || [];
  if(!list.length){
    box.innerHTML = "<div class='unitempty'>まだ単元がありません。<br>「新しい単元」から、単元名と授業数だけ登録します。</div>";
    return;
  }
  box.innerHTML = list.map(u =>
    "<button class='unitrow' data-unit='" + escText(u.id) + "'>"
    + "<span><b>" + escText(u.name) + "</b><small>"
    + u.lessonCount + "時間" + (u.hasTest ? "＋テスト" : "")
    + (u.start && u.start.date ? "・" + shortDate_(u.start.date) + "〜" : "") + "</small></span>"
    + "<em>" + escText(unitStatus_(u)) + "</em></button>").join("");
  for(const b of box.querySelectorAll("[data-unit]"))
    b.onclick = () => editUnit_(b.dataset.unit);
}
function renderUnitManager_(){
  drawUnitContext_();
  renderUnitTerm_();
  renderUnitList_();
  $("unitStat").textContent = "";
}
function newUnit_(){
  unitState.editing = "";
  $("unitFormTitle").textContent = "新しい単元";
  $("unitName").value = "";
  $("unitCount").value = "1";
  $("unitTest").checked = false;
  $("unitDanger").hidden = true;
  $("unitWarn").hidden = true;
  $("unitForm").hidden = false;
  $("unitName").focus();
}
function editUnit_(id){
  const u = (unitState.units || []).find(x => x.id === id);
  if(!u) return;
  unitState.editing = id;
  $("unitFormTitle").textContent = "単元を直す";
  $("unitName").value = u.name || "";
  $("unitCount").value = String(u.lessonCount || 1);
  $("unitTest").checked = !!u.hasTest;
  $("unitDanger").hidden = false;
  $("unitWarn").hidden = true;
  $("unitForm").hidden = false;
  $("unitName").focus();
}
function unitCountStep_(n){
  const e = $("unitCount");
  e.value = String(Math.max(1, Math.min(99, (+e.value || 1) + n)));
}
function saveUnitForm_(){
  const name = $("unitName").value.trim(), n = Math.floor(+$("unitCount").value || 0);
  if(!name) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "単元名を入れてください。");
  if(n < 1 || n > 99) return void ($("unitWarn").hidden = false, $("unitWarn").textContent = "授業数は1〜99時間です。");
  const ctx = unitContext_();
  const old = (unitState.units || []).find(x => x.id === unitState.editing);
  const input = {
    id: old ? old.id : "",
    expectedUpdatedAt: old ? old.updatedAt : "",
    layer: ctx.kind === "special" ? "special" : "home",
    target: unitState.cls,
    sp: ctx.kind === "special" ? view.sp : "",
    subject: unitState.subject,
    name:name, lessonCount:n, hasTest:$("unitTest").checked
  };
  $("unitSave").disabled = true;
  $("unitStat").textContent = "保存しています…";
  Backend.saveUnit(input, saved => {
    $("unitSave").disabled = false;
    if(saved){
      const list = unitState.units || (unitState.units = []);
      const i = list.findIndex(x => x.id === saved.id);
      if(i >= 0) list[i] = saved; else list.push(saved);
      const ui = UP.units.findIndex(x => x.id === saved.id);
      if(ui >= 0) UP.units[ui] = saved; else UP.units.push(saved);
      unitState.editing = saved.id;
      renderUnitList_();
      editUnit_(saved.id);
      UP.seq = {}; paintSheet();
      if(typeof drawPalette === "function") drawPalette();
      upWarnOne_(saved);
    }
    $("unitStat").textContent = "保存しました。";
  }, why => {
    $("unitSave").disabled = false;
    $("unitStat").textContent = why;
  });
}
function resetUnit_(){
  const u = (unitState.units || []).find(x => x.id === unitState.editing);
  if(!u) return;
  askOk({
    title:"「" + u.name + "」の配置をリセットしますか",
    lines:["<b>単元そのものは残します。</b>",
           "時間割に置いた進捗だけを全部外し、あとで起点から置き直せる状態に戻します。"],
    goLabel:"配置をリセット",
    onYes:() => upResetAll_(u, () => {
      renderUnitList_(); editUnit_(u.id);
      $("unitStat").textContent = "配置をリセットしました。";
      UP.seq = {}; paintSheet();
    })
  });
}
function resetAllUnits_(){
  const list = unitState.units || [];
  if(!list.length) return toast("リセットする単元がありません");
  const sub = (SUB_BY_CODE[unitState.subject] || {}).name || unitState.subject;
  askOk({
    title:unitState.cls + "・" + sub + " の配置をすべてリセットしますか",
    lines:["<b>この画面に並んでいる単元すべて</b>の進捗配置を外します。",
           "単元名・授業数・テスト設定は残ります。ほかの教科には影響しません。"],
    goLabel:"この教科の配置を全リセット",
    onYes:() => {
      let left = list.length;
      for(const u of list) upResetAll_(u, () => {
        if(--left <= 0){
          renderUnitList_();
          $("unitStat").textContent = "この教科の単元配置をすべてリセットしました。";
          UP.seq = {}; paintSheet();
        }
      });
    }
  });
}
function deleteUnit_(){
  const u = (unitState.units || []).find(x => x.id === unitState.editing);
  if(!u) return;
  askOk({
    title:"「" + u.name + "」を削除しますか",
    lines:["<b>単元の登録そのものを削除します。</b>時間割への配置情報も消えます。",
           "配置だけを外したい場合は「配置をリセット」を使ってください。"],
    goLabel:"単元を削除",
    onYes:() => {
      /* 印を外してから単元を消す */
      upResetAll_(u, () => {
        Backend.deleteUnit(u.id, u.updatedAt, () => {
          unitState.units = (unitState.units || []).filter(x => x.id !== u.id);
          UP.units = UP.units.filter(x => x.id !== u.id);
          unitState.editing = ""; $("unitForm").hidden = true; renderUnitList_();
          UP.seq = {}; paintSheet();
          if(typeof drawPalette === "function") drawPalette();
          $("unitStat").textContent = "単元を削除しました。";
        }, why => $("unitStat").textContent = why);
      });
    }
  });
}

/* ── 学期設定 ─────────────────────────────────── */
let termDraft = [];
function openUnitTerms(){
  termDraft = clone(UP.terms);
  if(!termDraft.length) termDraft.push({name:"", start:"", end:""});
  drawTermRows_();
  $("termStat").textContent = "";
  $("termDlg").showModal();
}
function drawTermRows_(){
  const box = $("termRows");
  box.innerHTML = termDraft.map((t,i) =>
    "<div class='termrow' data-ti='" + i + "'>"
    + "<input data-tf='name' value='" + escText(t.name || "") + "' placeholder='学期名（例：1学期）' aria-label='学期名'>"
    + "<input data-tf='start' type='date' value='" + escText(t.start || "") + "' aria-label='開始日'>"
    + "<span>〜</span><input data-tf='end' type='date' value='" + escText(t.end || "") + "' aria-label='終了日'>"
    + "<button class='btn danger' data-tdel='" + i + "'>消す</button></div>").join("");
  for(const inp of box.querySelectorAll("[data-tf]"))
    inp.oninput = () => {
      const i = +inp.closest(".termrow").dataset.ti;
      termDraft[i][inp.dataset.tf] = inp.value;
    };
  for(const b of box.querySelectorAll("[data-tdel]"))
    b.onclick = () => { termDraft.splice(+b.dataset.tdel, 1); drawTermRows_(); };
}
function saveTermRows_(){
  const rows = termDraft.filter(t => t.name || t.start || t.end);
  $("termSave").disabled = true;
  $("termStat").textContent = "保存しています…";
  Backend.saveUnitTerms(rows, UP.termVersion, r => {
    $("termSave").disabled = false;
    UP.terms = (r && r.terms) || [];
    UP.termVersion = (r && r.version) || JSON.stringify(UP.terms);
    renderUnitTerm_();
    $("termDlg").close();
    $("unitStat").textContent = "学期の期間を保存しました。";
    for(const u of upViewUnits_()) if((u.start || {}).date) upWarnOne_(u);
  }, why => {
    $("termSave").disabled = false;
    $("termStat").textContent = why;
  });
}

/* ── パレットのチップ ──────────────────────────
   単元は1画面4つだけで作る（教科 → 名前 → コマ数 → テスト）。
   チップの字は単元名の冒頭3文字。専科の面では「名前・クラス」。 */
function upChipLabel_(u){
  const t = (u.name || "").slice(0, 3) || u.name || "単元";
  return view.kind === "special" ? t + "・" + u.target : t;
}
function upPaletteUnits_(){
  return upViewUnits_().map(u => ({v:"unit:" + u.id, t:upChipLabel_(u), unit:u}));
}
function unitById_(id){
  return upViewUnits_().find(u => u.id === id) || null;
}

/* 結線 */
function wireUnitProgress(){
  const on = (id, ev, fn) => { const e = $(id); if(e) e.addEventListener(ev, fn); };
  on("unitOpen","click",openUnitManager);
  on("unitCls","change",e => { unitState.cls=e.target.value; unitState.editing=""; $("unitForm").hidden=true; loadUnitManager(); });
  on("unitSub","change",e => { unitState.subject=e.target.value; unitState.editing=""; $("unitForm").hidden=true; loadUnitManager(); });
  on("unitNew","click",newUnit_);
  on("unitResetAll","click",resetAllUnits_);
  on("unitCancel","click",() => { unitState.editing=""; $("unitForm").hidden=true; $("unitWarn").hidden=true; });
  on("unitMinus","click",() => unitCountStep_(-1));
  on("unitPlus","click",() => unitCountStep_(1));
  on("unitSave","click",saveUnitForm_);
  on("unitReset","click",resetUnit_);
  on("unitDelete","click",deleteUnit_);
  on("termAdd","click",() => { termDraft.push({name:"",start:"",end:""}); drawTermRows_(); });
  on("termSave","click",saveTermRows_);
}
