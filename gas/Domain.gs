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

  return {
    cellKey: cellKey,
    resultKey: resultKey,
    isBlankCell: isBlankCell,
    isRemoval: isRemoval,
    expectedVersionMatches: expectedVersionMatches,
    affectsClass: affectsClass,
    submissionView: submissionView,
    submissionUnchanged: submissionUnchanged,
    nextSubmissionTimestamp: nextSubmissionTimestamp
  };
})();
