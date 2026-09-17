/* ==================================================================
   domaincheck.js — Domain.gsの純粋な業務ルールを検査する。
   Googleアカウント・GAS・Google Sheetsは使わない。
================================================================== */
const fs = require("fs"), path = require("path"), vm = require("vm");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "Domain.gs"), "utf8"),
                sandbox, {filename:"Domain.gs"});
const D = sandbox.TimetableDomain;
let ng = 0;
function ok(name, condition, got){
  const pass = condition === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name +
              (pass ? "" : " → " + JSON.stringify(got)));
}

console.log("■ コマの識別");
ok("シートと同じセルキーを作る",
   D.cellKey(2026, "2026-09-16", "p3", "grade", "3") ===
   "2026\t2026-09-16\tp3\tgrade\t3");
ok("保存結果キーを作る",
   D.resultKey("2026-09-16", "p3", "home", "3-1") ===
   "2026-09-16|p3|home|3-1");

console.log("\n■ コマの変更");
ok("題名と詳細が空なら空欄",
   D.isBlankCell({title:"", note:""}) === true);
ok("題名があれば空欄ではない",
   D.isBlankCell({title:"体育", note:""}) === false);
ok("remove指定は削除",
   D.isRemoval({remove:true, title:"残っていても"}) === true);
ok("空欄も削除",
   D.isRemoval({title:"", note:""}) === true);

console.log("\n■ 競合");
ok("古い画面（expectedAtなし）は通す",
   D.expectedVersionMatches(undefined, 123) === true);
ok("同じ更新時刻は通す",
   D.expectedVersionMatches("123", 123) === true);
ok("違う更新時刻は止める",
   D.expectedVersionMatches(122, 123) === false);
ok("未作成コマ同士の0は一致",
   D.expectedVersionMatches(0, 0) === true);

console.log("\n■ 反映範囲");
const asClass = value => String(value).replace(/^DATE:/, "");
ok("全校はどの学級にも影響",
   D.affectsClass({layer:"school", target:""}, "3-1", asClass) === true);
ok("学年は同じ学年だけに影響",
   D.affectsClass({layer:"grade", target:"3"}, "3-2", asClass) === true &&
   D.affectsClass({layer:"grade", target:"3"}, "4-1", asClass) === false);
ok("担任は対象学級だけに影響",
   D.affectsClass({layer:"home", target:"3-1"}, "3-1", asClass) === true &&
   D.affectsClass({layer:"home", target:"3-1"}, "3-2", asClass) === false);
ok("Date化した学級名も変換器で戻せる",
   D.affectsClass({layer:"special", target:"DATE:3-1"}, "3-1", asClass) === true);

console.log("\n■ 提出状態");
const view = D.submissionView(
  {"提出日時":"2026-09-16T10:00:00.000Z", "提出者":"teacher@edu.nishi.or.jp"},
  {"変更あり":"1", "出力記録":"{\"file\":\"2026-09-16T10:00:00.000Z\"}"}
);
ok("提出状態を画面用に組み立てる",
   view.at === "2026-09-16T10:00:00.000Z" &&
   view.by === "teacher@edu.nishi.or.jp" &&
   view.dirty === true &&
   view.exports.file === "2026-09-16T10:00:00.000Z", view);
ok("出力時に変更がなければ通す",
   D.submissionUnchanged({at:"x", dirty:false}, {at:"x"}) === true);
ok("出力時に変更ありなら止める",
   D.submissionUnchanged({at:"x", dirty:true}, {at:"x"}) === false);
ok("出力時刻は同一ミリ秒を避ける",
   D.nextSubmissionTimestamp({"at":"2026-09-16T10:00:00.000Z"},
                              Date.parse("2026-09-16T10:00:00.000Z"))
   === "2026-09-16T10:00:00.001Z");

/* ── たんぽぽ提出を覆すかどうか ──────────────────
   **規則が2か所にある**（Domain.gs と src/js/tanpopo.js）。画面はすぐ塗るために
   持ち、サーバは読み直したときの正本として持つ。片方だけ直すと、画面が「済」で
   シートが「未」になり、どちらが本当か分からなくなる。
   だから**同じ表を両方に通して、答えが一致することまで見る。** */
const client = {};
vm.createContext(client);
for(const f of ["../src/js/config.js", "../src/js/tanpopo.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), client, {filename:f});
/* SLOTS は let なので context のプロパティにならない。式を中で評価して取り出す */
const LESSON6 = vm.runInContext(
  "SLOTS.filter(x => x.kind === 'lesson').slice(0, 6).map(x => x.id)", client);

console.log("\n■ たんぽぽ提出を覆すかどうか（サーバと画面で同じ答えになる）");
/* [その週の何日目か, 時程, 直す前の題名, 直したあとの題名, 覆すか] */
const TP_CASES = [
  [0, "p1", "国語", "国語",     false, "同じ教科名で上書きした"],
  [0, "p1", "国語", "算数",     true,  "教科名が変わった"],
  [0, "p1", "",     "校外学習", true,  "空のコマに入れた"],
  [0, "p1", "国語", "",         true,  "コマを空にした"],
  [0, "p1", "国語", " 国語 ",   false, "前後の空白だけが違う"],
  [0, "am2", "",    "読書",     false, "朝学習（たんぽぽへ渡らない）"],
  [0, "br",  "",    "集会",     false, "業間（たんぽぽへ渡らない）"],
  [0, "lun", "",    "掃除",     false, "昼休み（たんぽぽへ渡らない）"],
  [0, "after", "",  "部活",     false, "放課後（たんぽぽへ渡らない）"],
  [0, "memo", "",   "持ち物",   false, "週メモ（たんぽぽへ渡らない）"],
  [4, "p6", "算数", "理科",     true,  "金曜は渡る"],
  [5, "p1", "",     "行事",     false, "土曜は渡らない"],
  [0, "day", "",     "休み",    true,  "休みにした"],
  [0, "day", "休み", "",        true,  "休みを解いた"],
  [0, "day", "",     "特別校時", false, "特別校時にした（朝学習が消えるだけ）"],
  [0, "day", "休み", "特別校時", true,  "休みを特別校時に変えた"],
  [0, "day", "特別校時", "",     false, "特別校時を解いた"]
];
for(const [d, slot, was, now, want, what] of TP_CASES){
  const server = D.affectsTanpopo(d, slot, was, now, LESSON6, "day", "休み");
  const screen = client.tpAffected(d, slot, was, now);
  ok((want ? "覆る  : " : "覆らない: ") + what, server === want && screen === want,
     {server, screen, want});
}

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
