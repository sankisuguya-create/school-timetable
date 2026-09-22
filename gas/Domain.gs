/* ==================================================================
   Domain.gs — school-timetableの業務ルール（GAS/Sheets非依存）

   このファイルは「どのシートへ書くか」ではなく、
   「時間割として何を意味するか」を決める。
   シート形式・画面API・出力形式は変更しない。

   ここに置くのは副作用のない判定・変換だけ。
   Google Sheetsへ触る処理はSheets.gs / Store.gsが担当する。
================================================================== */
var TimetableDomain = (function(){
  function str(v){
    return String(v == null ? "" : v);
  }

  /* 時間割セルの永続化キー。
     シートの1行＝1コマという既存の一意性を、そのまま業務概念にする。 */
  function cellKey(year, date, slot, layer, target){
    return [str(year), str(date), str(slot), str(layer), str(target)].join("\t");
  }

  /* 保存結果を画面側の更新時刻表へ戻すキー。
     writeCellsの既存キー形式を変えない。 */
  function resultKey(date, slot, layer, target){
    return [str(date), str(slot), str(layer), str(target)].join("|");
  }

  /* 題名と詳細がともに空なら、コマの中身を消す。
     falseや0など、旧処理の扱いも変えない。 */
  function isBlankCell(patch){
    var p = patch || {};
    return !str(p.title || "").trim() && !str(p.note || "").trim();
  }

  function isRemoval(patch){
    return !!(patch && patch.remove) || isBlankCell(patch);
  }

  /* expectedAtが無い古い画面は従来どおり通す。
     expectedAtがある画面だけ、サーバ側の現在時刻と一致させる。 */
  function expectedVersionMatches(expectedAt, currentAt){
    if(expectedAt === undefined || expectedAt === null) return true;
    return currentAt === (+expectedAt || 0);
  }

  /* 変更が、ある学級の週案に影響するか。
     asClassはSheets.asClassを注入する。ドメイン層からSheetsへ依存しない。 */
  function affectsClass(patch, className, asClass){
    var p = patch || {};
    var layer = str(p.layer);
    var target = str(p.target);
    if(layer === "school") return true;
    if(layer === "grade")
      return str(className).split("-")[0] === target;
    if(layer === "home" || layer === "special"){
      var normalized = typeof asClass === "function" ? asClass(p.target) : target;
      return normalized === className;
    }
    return false;
  }

  /* たんぽぽへ渡る文字が変わったか。**変わっていなければ担任の提出を覆さない。**

     提出は「担任が今週ぶんを書き終えた」という印。渡るものが変わっていないのに
     覆すと、押し直すだけの作業が毎週増える。押し直しが増えるほど、印そのものが
     「とりあえず押すもの」になって、たんぽぽ担当が見分けられなくなる。

     たんぽぽへ渡るのは **月〜金 × 授業6コマの題名**だけ。だから

       土曜・朝休み・朝学習・業間・昼休み・放課後・週メモ  渡らない → 覆さない
       備考だけ直した／同じ教科名で上書きした              文字が同じ → 覆さない
       休みにした／休みを解いた                            空で出るので → 覆る
       特別校時にした                                      朝学習が消えるだけ → 覆さない
       校外行事を付けた／外した                            「校外」に変わる → 覆る

     **同じ規則が画面にもある**（src/js/tanpopo.js の tpAffected）。
     画面はすぐ塗るために持ち、ここは読み直したときの正本として持つ。
     片方だけ直すと、画面が「済」でシートが「未」になり、どちらが本当か
     分からなくなる。**必ず両方を直す**（domaincheck.js が同じ表で見る）。

     層の重なりは見ない。学年のコマを直しても、その上に担任のコマが載っていれば
     渡る文字は変わらないが、そこまでは見ずに覆す側へ倒す。

       dow        0=月 … 5=土（画面の「月曜から何日目か」と同じ）
       lessonIds  たんぽぽへ出す時程のID（授業の先頭6つ）
       daySlot    日の形を置く時程のID
       offLabel   休みの題名
       tripSlot   校外行事を置く時程のIDの頭（"trip:"） */
  function affectsTanpopo(dow, slot, wasTitle, nowTitle, lessonIds, daySlot, offLabel,
                          tripSlot){
    if(!(dow >= 0 && dow <= 4)) return false;      /* 土曜はたんぽぽへ出さない */
    var was = str(wasTitle).trim(), now = str(nowTitle).trim();
    var id = str(slot);
    if(id === str(daySlot))
      return (was === str(offLabel)) !== (now === str(offLabel));
    /* 校外行事の付け外し。渡る字が「校外」に変わるので覆る。
       覆っている下の時程が、たんぽぽへ出す6コマのときだけ */
    var head = str(tripSlot || "trip:");
    if(id.indexOf(head) === 0){
      if(was === now) return false;
      id = id.slice(head.length);
    }
    var ids = lessonIds || [], inRange = false;
    for(var i = 0; i < ids.length; i++)
      if(str(ids[i]) === id){ inRange = true; break; }
    if(!inRange) return false;                     /* 出力に入らないコマ */
    return was !== now;
  }

  /* 提出行と状態行から、画面へ返す提出状態を組み立てる。
     出力記録が壊れていても、従来どおり空の記録として扱う。 */
  function submissionView(row, state){
    var r = row || {}, s = state || {}, exports = {};
    try{ exports = JSON.parse(s["出力記録"] || "{}"); }catch(_){}
    return {
      at: str(r["提出日時"] || ""),
      by: str(r["提出者"] || ""),
      dirty: str(s["変更あり"]) === "1",
      exports: exports
    };
  }

  /* 出力開始後に提出状態が変わっていないか。
     変更あり、または提出時刻の変化があれば出力を止める。 */
  function submissionUnchanged(current, submitted){
    var c = current || {}, s = submitted || {};
    return !c.dirty && (c.at || "") === (s.at || "");
  }

  /* 同一ミリ秒の提出を許さない既存ルールを名前付きにする。 */
  function nextSubmissionTimestamp(previous, nowMs){
    var p = previous || {};
    return new Date(Math.max(
      +nowMs,
      (Date.parse(p.at) || 0) + 1
    )).toISOString();
  }


  /* ── 単元進捗 ──────────────────────────────────
     単元の番号そのものは保存しない。保存するのは「どのコマがその単元か」だけ。
     1/5, 2/5 ... は候補コマの順から画面側が作れる。これなら途中の1コマを
     外しても、後ろの全コマをシートへ書き直さずに済む。 */

  function unitSlotKey(v){
    if(v == null) return "";
    if(typeof v === "object"){
      var date = str(v.date).trim(), slot = str(v.slot).trim();
      return date && slot ? date + "|" + slot : "";
    }
    var t = str(v).trim();
    return /^\d{4}-\d{2}-\d{2}\|[^|]+$/.test(t) ? t : "";
  }

  function uniqueUnitSlots(list){
    var out = [], seen = {};
    for(var i = 0; i < (list || []).length; i++){
      var k = unitSlotKey(list[i]);
      if(k && !seen[k]){ seen[k] = true; out.push(k); }
    }
    return out;
  }

  /* UnitPlan の境界で形をそろえる。テストのコマは通常授業とは別に持つ。
     assignments の「最後がテスト」と推測すると、5→6時間へ増やした瞬間に
     旧テストを6時間目へ転用できるか判定できなくなるため。 */
  function normalizeUnitPlan(raw){
    var u = raw || {};
    return {
      id: str(u.id || u.unitId).trim(),
      year: +u.year || 0,
      className: str(u.className || u["対象クラス"]).trim(),
      subject: str(u.subject || u["教科コード"]).trim(),
      name: str(u.name || u["単元名"]).trim(),
      lessonCount: Math.max(0, Math.floor(+u.lessonCount || +u["授業数"] || 0)),
      hasTest: u.hasTest === true || str(u.hasTest || u["テスト"]).toLowerCase() === "true"
               || str(u.hasTest || u["テスト"]) === "1",
      assignments: uniqueUnitSlots(u.assignments || []),
      testAssignment: unitSlotKey(u.testAssignment),
      excludedSlots: uniqueUnitSlots(u.excludedSlots || []),
      updatedBy: str(u.updatedBy || "").trim(),
      updatedAt: str(u.updatedAt || "").trim()
    };
  }

  function unitDate_(key){
    return str(key).split("|")[0];
  }

  /* 単元の既存配置をなるべく残し、足りないぶんだけ後ろへ足す。
     candidateSlots は Store 側が「起点から学期末まで」を時系列順で返す。
     occupiedSlots は **別単元** が使っているコマだけを渡す。 */
  function reconcileUnit(unit, candidateSlots, occupiedSlots, termEnd){
    var u = normalizeUnitPlan(unit);
    var candidates = uniqueUnitSlots(candidateSlots);
    var occupied = {}, excluded = {}, order = {}, candidate = {};
    var i, k;
    for(i = 0; i < (occupiedSlots || []).length; i++){
      k = unitSlotKey(occupiedSlots[i]); if(k) occupied[k] = true;
    }
    for(i = 0; i < u.excludedSlots.length; i++) excluded[u.excludedSlots[i]] = true;

    /* 学期末より後ろは候補から外す。候補の順そのものが校時順なので、
       文字列の p1/p10 順では並べ替えない。 */
    var inTerm = [];
    for(i = 0; i < candidates.length; i++){
      k = candidates[i];
      if(termEnd && unitDate_(k) > str(termEnd)) continue;
      order[k] = inTerm.length;
      candidate[k] = true;
      inTerm.push(k);
    }

    var lessons = [], used = {};
    for(i = 0; i < u.assignments.length; i++){
      k = u.assignments[i];
      if(!candidate[k] || excluded[k] || occupied[k] || used[k]) continue;
      used[k] = true; lessons.push(k);
    }
    lessons.sort(function(a, b){ return order[a] - order[b]; });

    /* 減らした場合は末尾だけを外す。手で動かした前半を作り直さない。 */
    if(lessons.length > u.lessonCount) lessons = lessons.slice(0, u.lessonCount);
    used = {};
    for(i = 0; i < lessons.length; i++) used[lessons[i]] = true;

    /* 増やした場合は既存を保ったまま空きを足す。
       旧テストのコマも通常授業へ転用できるため、ここでは予約しない。 */
    for(i = 0; i < inTerm.length && lessons.length < u.lessonCount; i++){
      k = inTerm[i];
      if(used[k] || excluded[k] || occupied[k]) continue;
      used[k] = true; lessons.push(k);
    }
    lessons.sort(function(a, b){ return order[a] - order[b]; });

    var test = "";
    if(u.hasTest && lessons.length === u.lessonCount){
      var last = lessons.length ? order[lessons[lessons.length - 1]] : -1;
      var oldTest = u.testAssignment;
      if(oldTest && candidate[oldTest] && !excluded[oldTest] && !occupied[oldTest]
         && !used[oldTest] && order[oldTest] > last){
        test = oldTest;
      }else{
        for(i = last + 1; i < inTerm.length; i++){
          k = inTerm[i];
          if(used[k] || excluded[k] || occupied[k]) continue;
          test = k; break;
        }
      }
    }

    var missingLessons = Math.max(0, u.lessonCount - lessons.length);
    var missingTest = !!u.hasTest && !test;
    var out = {};
    for(var p in u) out[p] = u[p];
    out.assignments = lessons;
    out.testAssignment = u.hasTest ? test : "";

    return {
      unit: out,
      warning: (missingLessons || missingTest) ? {
        code: "term-capacity",
        missingLessons: missingLessons,
        missingTest: missingTest,
        requestedLessons: u.lessonCount,
        placedLessons: lessons.length,
        termEnd: str(termEnd || "")
      } : null
    };
  }

  return {
    cellKey: cellKey,
    resultKey: resultKey,
    isBlankCell: isBlankCell,
    isRemoval: isRemoval,
    expectedVersionMatches: expectedVersionMatches,
    affectsClass: affectsClass,
    affectsTanpopo: affectsTanpopo,
    submissionView: submissionView,
    submissionUnchanged: submissionUnchanged,
    nextSubmissionTimestamp: nextSubmissionTimestamp,
    unitSlotKey: unitSlotKey,
    normalizeUnitPlan: normalizeUnitPlan,
    reconcileUnit: reconcileUnit
  };
})();
