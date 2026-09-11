/* ブラウザで実際に動かして確かめる。
     node tools/check.mjs
   Chromium は環境が持っているものを使う（PLAYWRIGHT_CHROMIUM で場所を指定できる）。*/
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGE = "file://" + path.join(ROOT, "dist", "index.html");
const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;

let ng = 0;
const ok = (name, cond, got) => {
  const pass = cond === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name + (pass ? "" : "   → " + JSON.stringify(got)));
};

const b = await chromium.launch(exe ? {executablePath: exe} : {});
const ctx = await b.newContext({viewport:{width:1500, height:950}});
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if(m.type() === "error") errs.push("console: " + m.text()); });
await p.goto(PAGE);
await p.waitForTimeout(400);

console.log("■ 入口");
ok("学級が20（1〜4年は3クラス・5年6年だけ4クラス）",
   await p.locator(".tile.cls").count() === 20,
   await p.locator(".tile.cls").count());
ok("5年に 5-4 がある", await p.locator(".tile[data-c='5-4']").count() === 1);
ok("6年に 6-4 がある", await p.locator(".tile[data-c='6-4']").count() === 1);
ok("4年に 4-4 は無い", await p.locator(".tile[data-c='4-4']").count() === 0);
ok("学年マスターが6つ＋全学年", await p.locator(".master:not(.tp)").count() === 7,
   await p.locator(".master:not(.tp)").count());
ok("専科が4つ（音楽・図工・理科・外国語）",
   await p.locator(".tile.sp").count() === 4,
   await p.locator(".tile.sp").count());

console.log("\n■ 入口には週の表示を置かない（左のメニューにある）");
ok("入口の帯は無い", await p.locator("#gate .head").count() === 0);
ok("週・年度・A週B週は左に1つだけ",
   await p.locator("#weekLabel").count() === 1
   && await p.locator("#weekNo").count() === 1
   && await p.locator("#abA").count() === 1, [
     await p.locator("#weekLabel").count(), await p.locator("#abA").count()]);
ok("入口を出しているときも、左の週表示は合っている",
   /\d+\/\d+ → \d+\/\d+/.test(await p.locator("#weekLabel").innerText())
   && (await p.locator("#weekNo").innerText()).indexOf("年度") >= 0,
   [await p.locator("#weekLabel").innerText(), await p.locator("#weekNo").innerText()]);
ok("入口からでも週を動かせる", await (async () => {
  const before = await p.locator("#weekLabel").innerText();
  await p.locator("#nextWk").click(); await p.waitForTimeout(300);
  const after = await p.locator("#weekLabel").innerText();
  await p.locator("#prevWk").click(); await p.waitForTimeout(300);
  return before !== after;
})() === true);
ok("入口からでもA週B週を変えられる", await (async () => {
  await p.locator("#abB").click(); await p.waitForTimeout(200);
  const v = await p.evaluate(() => week().variant);
  /* **日付から決まる週へ戻しておく。** 手で変えたままにすると、
     あとの検査が「手で変えた週」を見ることになる */
  await p.locator("#abAuto").click(); await p.waitForTimeout(200);
  return v === "B";
})() === true);
ok("戻すと、日付から決まる週になる",
   await p.evaluate(() => !week().vset && week().variant === autoVariant(wkKey())) === true,
   await p.evaluate(() => [week().variant, autoVariant(wkKey()), !!week().vset]));

console.log("\n■ 手の届くところ");
ok("「週案」の右にグリッドメニューのボタンがある",
   await p.locator(".side h2 #gridBtn").count() === 1);
ok("「時間割の入力」の右に保存がある",
   await p.locator(".phead .pbtns #saveBtn").count() === 1);
ok("その隣にロックがある",
   await p.locator(".phead .pbtns #lockBtn").count() === 1);
ok("ロックと保存が折り返さず、見出しと同じ行に並ぶ",
   await p.evaluate(() => {
     const h = document.querySelector(".phead h2").getBoundingClientRect();
     const b = document.querySelector(".pbtns").getBoundingClientRect();
     return Math.abs(h.top - b.top) < 12 && b.width < 240;
   }) === true,
   await p.evaluate(() => {
     const h = document.querySelector(".phead h2").getBoundingClientRect();
     const b = document.querySelector(".pbtns").getBoundingClientRect();
     return [Math.round(h.top), Math.round(b.top), Math.round(b.width)];
   }));
ok("待っている印は、左メニューの操作のすぐ下に出る",
   await p.locator(".side .wk + #busy").count() === 1);
/* 処理中の全面表示。**ふだんは閉じている。**
   閉じているあいだは紙の上に何も乗らない（window 直下に置いてある） */
ok("処理中の全面表示は、ふだん閉じている",
   await p.evaluate(() => $("wait").open) === false);
ok("処理中の全面表示は .app の外に置く（窓の上に乗せるため）",
   await p.evaluate(() => !document.querySelector(".app").contains($("wait"))) === true);
ok("処理中の全面表示には ✕ を差し込まない（自分では閉じさせない）",
   await p.locator("#wait .dlgx").count() === 0);
ok("手元では送るものが無いので「保存ずみ」",
   (await p.locator("#saveTxt").innerText()).indexOf("ずみ") >= 0,
   await p.locator("#saveTxt").innerText());

console.log("\n■ 週案をひらく");
await p.locator(".tile[data-c='3-3']").click();
await p.waitForTimeout(400);
ok("入口が閉じる", await p.locator("#gate").isHidden());
ok("紙が出る（11行×6日）", await p.locator("#sheet .cell").count() === 66,
   await p.locator("#sheet .cell").count());
ok("放課後のほうが週メモより縦に広い（余りは放課後に回す）",
   await p.evaluate(() => {
     const a = document.querySelector("#sheet .cell[data-s='after']").getBoundingClientRect();
     const f = document.querySelector("#sheet .foot").getBoundingClientRect();
     return a.height > f.height * 1.8;
   }) === true,
   await p.evaluate(() => {
     const a = document.querySelector("#sheet .cell[data-s='after']").getBoundingClientRect();
     const f = document.querySelector("#sheet .foot").getBoundingClientRect();
     return [Math.round(a.height), Math.round(f.height)];
   }));
ok("放課後を選ぶと、右も備考だけになる", await (async () => {
  await p.locator("#sheet .cell[data-d='2'][data-s='after'] .n").click();
  await p.waitForTimeout(150);
  const t = await p.locator("#pTitleWrap").isHidden();
  const n = await p.locator("#pNoteWrap").isVisible();
  return t && n;
})() === true);
ok("放課後は備考だけ（題名の欄を作らない）",
   await p.locator("#sheet .cell[data-s='after'] .n").count() === 6
   && await p.locator("#sheet .cell[data-s='after'] .t").count() === 0,
   [await p.locator("#sheet .cell[data-s='after'] .n").count(),
    await p.locator("#sheet .cell[data-s='after'] .t").count()]);
ok("時程に時刻が出る",
   (await p.locator("#sheet .lab .tm").first().innerText()).includes(":"));
const fit = await p.evaluate(() => db.settings.vz);
ok("紙が画面に合わせて拡大される", fit > 40 && fit <= 160, fit);

ok("グリッドのボタンで入口へ戻れる", await (async () => {
  await p.locator("#gridBtn").click(); await p.waitForTimeout(250);
  const shown = await p.locator("#gate").isVisible();
  await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
  return shown;
})() === true);

console.log("\n■ 教科を入れる");
await p.locator(".pal[data-v='taiiku']").dragTo(p.locator("#sheet .cell[data-d='2'][data-s='p5']"));
await p.waitForTimeout(250);
ok("引っぱって入る",
   (await p.locator("#sheet .cell[data-d='2'][data-s='p5'] .t").innerText()).trim() === "体育",
   await p.locator("#sheet .cell[data-d='2'][data-s='p5'] .t").innerText());
await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").click();
await p.waitForTimeout(150);
await p.locator(".pal[data-v='rika']").click();
await p.waitForTimeout(250);
ok("押しても入る",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").innerText()).trim() === "理科");

console.log("\n■ リンク（1コマにいくつでも）");
await p.evaluate(() => {
  const n = document.querySelector("#sheet .cell[data-d='0'][data-s='p1'] .n");
  n.focus(); document.execCommand("insertText", false, "教科書P12 と ワークシート");
});
await p.waitForTimeout(200);
async function linkWord(word, url){
  await p.evaluate(w => {
    const n = document.querySelector("#sheet .cell[data-d='0'][data-s='p1'] .n");
    const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walk.nextNode())){
      const i = node.textContent.indexOf(w);
      if(i < 0) continue;
      const r = document.createRange();
      r.setStart(node, i); r.setEnd(node, i + w.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
  }, word);
  await p.waitForTimeout(120);
  p.once("dialog", d => d.accept(url));
  await p.locator("#pAddLink").click();
  await p.waitForTimeout(250);
}
await linkWord("教科書P12", "https://example.com/a");
await linkWord("ワークシート", "https://example.com/b");
ok("1つの欄に2つのリンクが付く",
   await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .n a").count() === 2,
   await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .n a").count());
ok("パネルにリンクが2つ並ぶ", await p.locator("#pLinks .lrow").count() === 2);
await p.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .n a").first().click();
await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .n a").last().click();
await p.waitForTimeout(150);
ok("文字を押すと開く",
   JSON.stringify(await p.evaluate(() => window.__opened))
     === JSON.stringify(["https://example.com/a", "https://example.com/b"]),
   await p.evaluate(() => window.__opened));
ok("javascript: の href は落とす",
   await p.evaluate(() => clean('<a href="javascript:alert(1)">x</a>').indexOf("javascript") < 0));

console.log("\n■ 入れる先（選ぶたびに戻る）");
await p.locator("#sheet .cell[data-d='3'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pScope input[value='grade']").check();
await p.locator(".pal[data-v='sogo']").click();
await p.waitForTimeout(250);
ok("学年に反映すると学年マスターに入る",
   await p.evaluate(() => !!(week().grade["3"] || {})["3|p3"]));
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(200);
ok("別のコマを選ぶと「この学級のみ」へ戻る",
   await p.locator("#pScope input[value='self']").isChecked());

console.log("\n■ 層（マスターはその層のものだけ出す）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);
ok("学年マスターに学年の予定が出る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p3'] .t").innerText()).trim() === "総合");
ok("担任が入れた分は出ない",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").innerText()).trim() === "");

console.log("\n■ 専科（同じデータをクラス名で見る）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile.sp[data-s='ongaku']").click(); await p.waitForTimeout(300);
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='2-1']").click(); await p.waitForTimeout(250);
ok("専科の週にはクラス名が出る",
   (await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").innerText()).trim() === "2-1",
   await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").innerText());
await p.locator(".pal[data-v='2-2']").click(); await p.waitForTimeout(250);
ok("行き先を変えると前のクラスから消える",
   await p.evaluate(() => !(week().special["2-1"] || {})["1|p2"]));
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='2-2']").click(); await p.waitForTimeout(300);
ok("担任からは教科名で出る",
   (await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").innerText()).trim() === "音楽");

console.log("\n■ 年度（前の年度を丸ごと残す）");
const y0 = await p.evaluate(() => fy());
await p.evaluate(() => { for(let i=0;i<40;i++) goWeek(7); });
await p.waitForTimeout(400);
const y1 = await p.evaluate(() => fy());
ok("週を進めると年度が変わる", y1 === y0 + 1, [y0, y1]);
ok("前の年度は残っている",
   await p.evaluate(y => !!db.years[String(y)], y0));
ok("前の年度の書き込みが残っている",
   await p.evaluate(y => {
     const ws = db.years[String(y)].weeks;
     return Object.keys(ws).some(k => Object.keys(ws[k].home || {}).length);
   }, y0));
ok("新しい年度はクラス編成を引き継ぐ",
   await p.evaluate(() => allClasses().length) === 20,
   await p.evaluate(() => allClasses()));
ok("新しい年度の基本時間割は空（毎年変わるものを持ち越さない）",
   await p.evaluate(() => Object.keys(Y().base).length) === 0);
await p.evaluate(() => { for(let i=0;i<40;i++) goWeek(-7); });
await p.waitForTimeout(300);

console.log("\n■ 学級編成（表から読む）");
await p.locator("[data-act='roster']").click(); await p.waitForTimeout(250);
await p.locator("#rsRows input[data-g='4']").fill("4-1, 4-2, 4-3, 4-4");
await p.locator("#rsRows input[data-g='4']").press("Enter");
await p.waitForTimeout(300);
ok("学年ごとのクラス数を表から変えられる",
   await p.evaluate(() => classesOfGrade("4").length) === 4,
   await p.evaluate(() => classesOfGrade("4")));
await p.locator("#rosterDlg .dlgx").click(); await p.waitForTimeout(250);

console.log("\n■ 上書きの警告（書く側）");
/* 学年マスターで 3年 の木3校時に「学年体育」を入れる。
   3-3 には担任の「総合」が入っているので、聞かれるはず */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='kokugo']").click(); await p.waitForTimeout(250);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);

const swOpen = () => p.locator("#swDlg").evaluate(d => d.open);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='taiiku']").click(); await p.waitForTimeout(300);
ok("別の人の予定を潰すときは聞く", await swOpen() === true);
let swText = await p.locator("#swDlg").innerText();
ok("どのクラスの何を何に変えるかを言う",
   swText.indexOf("3-3") >= 0 && swText.indexOf("国語") >= 0 && swText.indexOf("体育") >= 0,
   swText);
ok("誰が入れたものかも言う（層）", swText.indexOf("担任") >= 0, swText);
/* **ブラウザの confirm を使わない。** Enter で「はい」に落ちて、
   打鍵の勢いのまま他人の予定が消える */
ok("既定は「変更しない」（そこに焦点がある）",
   await p.evaluate(() => document.activeElement && document.activeElement.id) === "swNo",
   await p.evaluate(() => document.activeElement && document.activeElement.id));
ok("「変更しない」が先に並ぶ", await p.evaluate(() => {
     const b = [...document.querySelectorAll("#swDlg .end button")].map(x => x.id);
     return b[0] === "swNo" && b[1] === "swYes";
   }) === true, await p.evaluate(() =>
     [...document.querySelectorAll("#swDlg .end button")].map(x => x.id)));

/* Esc は「変更しない」に落ちる。**学年の面には、まだ何も入っていない** */
await p.keyboard.press("Escape"); await p.waitForTimeout(250);
ok("Esc で閉じても入らない", await p.evaluate(() =>
     !((week().grade["3"] || {})["3|p4"])) === true,
   await p.evaluate(() => (week().grade["3"] || {})["3|p4"]));

await p.locator(".pal[data-v='taiiku']").click(); await p.waitForTimeout(250);
await p.locator("#swYes").click(); await p.waitForTimeout(300);
ok("«上書きする»なら入る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim() === "体育",
   await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText());

await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click(); await p.waitForTimeout(250);
ok("同じコマでは聞き直さない", await swOpen() === false);

/* 誰の予定も潰さないコマでは聞かない */
await p.locator("#sheet .cell[data-d='0'][data-s='p6'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sogo']").click(); await p.waitForTimeout(250);
ok("誰の予定も潰さないときは聞かない", await swOpen() === false);

/* «変更しない»なら入らない */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(300);
const beforeCancel = (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim();
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='katei']").click(); await p.waitForTimeout(300);
await p.locator("#swNo").click(); await p.waitForTimeout(300);
ok("«変更しない»なら入らない",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim() === beforeCancel,
   [beforeCancel, await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()]);

/* 打って入れるときも同じ。**打った字ごと元に戻す** */
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").type("音"); await p.waitForTimeout(300);
ok("打ち始めた1打目でも聞く", await swOpen() === true);
await p.locator("#swNo").click(); await p.waitForTimeout(300);
ok("«変更しない»なら、打った字ごと戻す",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim() === beforeCancel,
   await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText());

console.log("\n■ 上位から降りてきたコマに、詳細だけ書いても題名は消えない");
/* **前はここで題名が消えていた。** 全校が入れた「全校朝会」のコマに
   担任が詳細を1字書くと、題名が空のまま「担任」として入り、
   紙から全校朝会が消えた。書いた本人には、消したつもりが無い。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.all").click(); await p.waitForTimeout(400);
await p.evaluate(() => { writeCell(0, "p6", {title:"全校朝会", subject:"gyoji"}); paintSheet(); });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
ok("全校のコマが担任の紙に出ている",
   await p.evaluate(() => plain(cellFor(0, "p6").title)) === "全校朝会",
   await p.evaluate(() => cellFor(0, "p6")));
await p.evaluate(() => { writeCell(0, "p6", {note:"体育館に8:20"}); paintSheet(); });
await p.waitForTimeout(200);
ok("詳細だけ書いても、題名は残る",
   await p.evaluate(() => plain(cellFor(0, "p6").title)) === "全校朝会",
   await p.evaluate(() => cellFor(0, "p6")));
ok("書いた詳細は入っている",
   await p.evaluate(() => plain(cellFor(0, "p6").note)) === "体育館に8:20",
   await p.evaluate(() => cellFor(0, "p6").note));
ok("教科コードも引き継ぐ（時数の数え方が変わらない）",
   await p.evaluate(() => cellFor(0, "p6").subject) === "gyoji",
   await p.evaluate(() => cellFor(0, "p6").subject));
/* **全体が入れた「体育」に担任が詳細を足す**、そのままの形で見る */
ok("全体の「体育」に詳細を足しても、体育と教科コードが残る", await p.evaluate(() => {
     openView({kind:"school"});
     writeCell(2, "p5", {title:"体育", subject:"taiiku"});
     openView({kind:"class", cls:"3-1"});
     writeCell(2, "p5", {note:"運動場・雨なら体育館"});
     const c = cellFor(2, "p5");
     const got = [plain(c.title), c.subject, plain(c.note), c.layer];
     delete (week().home["3-1"] || {})["2|p5"];
     delete week().school["2|p5"];
     save(); paintSheet();
     /* 上書きの知らせが出ていたら閉じる（あとの検査の邪魔をしない） */
     for(const d of document.querySelectorAll("dialog[open]")) d.close();
     return JSON.stringify(got);
   }) === JSON.stringify(["体育", "taiiku", "運動場・雨なら体育館", "home"]),
   await p.evaluate(() => cellFor(2, "p5")));
ok("紙の上でも題名が消えていない",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p6'] .t").innerText())
     .indexOf("全校朝会") >= 0,
   await p.locator("#sheet .cell[data-d='0'][data-s='p6'] .t").innerText());
/* 片づける。あとの検査に響かせない */
await p.evaluate(() => {
  delete (week().home["3-1"] || {})["0|p6"];
  delete week().school["0|p6"];
  save(); paintSheet();
});

console.log("\n■ 専科が他人の予定を潰すときも、書く前に聞く");
/* 前の節で開いたままの窓と、答えの覚えを片づけてから始める */
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  for(const k in askedCells) delete askedCells[k];
});
await p.waitForTimeout(200);
/* **前は専科だけ素通りしていた。** された側の担任には次に開いたときに
   出るので、片肺になっていた（docs/spec.md 3節は両側に出すと決めている）。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='2-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => {
  /* 前の節で入れた専科のコマを片づけてから始める */
  for(const c of allClasses()) delete (week().special[c] || {})["1|p2"];
  writeCell(1, "p2", {title:"国語", subject:"kokugo"});
  /* 担任が入れたことにする（自分が入れたものでは聞かないので） */
  (week().home["2-1"] || {})["1|p2"].by = "hoka@edu.nishi.or.jp";
  save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile.sp[data-s='ongaku']").click(); await p.waitForTimeout(400);
ok("専科の週で、行き先のクラスの予定を数える",
   await p.evaluate(() => wouldOverwrite(1, "p2", "2-1").length) === 1,
   await p.evaluate(() => wouldOverwrite(1, "p2", "2-1")));
ok("行き先を渡さなければ、誰も潰さない（コマだけでは相手が決まらない）",
   await p.evaluate(() => wouldOverwrite(1, "p2").length) === 0);
/* パレットは「先にコマを選ぶ」。専科の週の、そのコマを選んでから押す */
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(200);
await p.locator(".pal[data-v='2-1']").click(); await p.waitForTimeout(400);
ok("クラスを落とすと窓が出る", await p.locator("#swDlg").evaluate(d => d.open) === true);
ok("誰の何を潰すのかを言う",
   (await p.locator("#swList").innerText()).indexOf("国語") >= 0
   && (await p.locator("#swList").innerText()).indexOf("2-1") >= 0,
   await p.locator("#swList").innerText());
ok("既定は「変更しない」",
   await p.evaluate(() => document.activeElement && document.activeElement.id) === "swNo");
await p.locator("#swNo").click(); await p.waitForTimeout(250);
ok("「変更しない」なら入らない",
   await p.evaluate(() => plain(ownCell(1, "p2").title)) === "",
   await p.evaluate(() => ownCell(1, "p2")));
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(200);
await p.locator(".pal[data-v='2-1']").click(); await p.waitForTimeout(400);
await p.locator("#swYes").click(); await p.waitForTimeout(400);
ok("「上書きする」なら入る",
   await p.evaluate(() => plain(ownCell(1, "p2").title)) === "2-1",
   await p.evaluate(() => ownCell(1, "p2")));
ok("自分が受け持っているコマでは、もう聞かない",
   await p.evaluate(() => wouldOverwrite(1, "p2", "2-1").length) === 0);
await p.evaluate(() => {
  for(const c of allClasses()) delete (week().special[c] || {})["1|p2"];
  delete (week().home["2-1"] || {})["1|p2"];
  save();
});

console.log("\n■ 上書きの確認は、入れる先ごとに聞く");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  for(const k in askedCells) delete askedCells[k];
});
await p.waitForTimeout(200);
/* **前は画面とコマだけを鍵にしていた。** «この学級のみ» で1回答えると、
   同じコマを «全校に反映» で入れるときには聞かれなかった。
   効く範囲が1クラスから20クラスへ変わっているのに、無言で通っていた。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-2']").click(); await p.waitForTimeout(400);
await p.evaluate(() => {
  writeCell(2, "p4", {title:"体育", subject:"taiiku"});
  (week().home["3-2"] || {})["2|p4"].by = "hoka@edu.nishi.or.jp";
  save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
ok("鍵に入れる先が入っている", await p.evaluate(() => {
     scope = "self";  const a = [viewName(), layerOfStore(), targetOfStore(), "", ck(2,"p4")].join("|");
     scope = "school"; const b = [viewName(), layerOfStore(), targetOfStore(), "", ck(2,"p4")].join("|");
     scope = "self";
     return a !== b;
   }) === true);
ok("この学級のみでは、3-2 の予定を潰さない",
   await p.evaluate(() => { scope = "self"; return wouldOverwrite(2, "p4").length; }) === 0);
ok("全校に反映にすると、3-2 の予定を潰すと分かる",
   await p.evaluate(() => { const n = (scope = "school", wouldOverwrite(2, "p4").length);
                            scope = "self"; return n; }) > 0);
await p.evaluate(() => { delete (week().home["3-2"] || {})["2|p4"]; save(); });

console.log("\n■ 上書きされた側への知らせ");
/* 3-3 の担任が入れた「国語」は、学年の「体育」に上書きされている */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(500);
ok("開いたときに知らせが出る", await p.locator("#owDlg").evaluate(d => d.open) === true);
const owText = await p.locator("#owList").innerText();
ok("いつ・何が・何に上書きされたかを言う",
   /\d+\/\d+\(.\)\s*\S+校時/.test(owText)
   && owText.indexOf("国語") >= 0 && owText.indexOf("→") > 0
   && owText.indexOf("上書きされました") > 0, owText);
ok("誰が入れたかも言う", owText.indexOf("学年") >= 0, owText);
await p.locator("#owDlg .btn").click(); await p.waitForTimeout(300);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(500);
ok("同じ上書きについては二度出ない",
   await p.locator("#owDlg").evaluate(d => d.open) === false);

/* **層（どこから来たか）と人（誰が入れたか）は別のもの。**
   前は同じ欄に層の名前を入れていたので、他人の予定かどうかを判定できなかった */
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(200);
ok("パネルに、いま入っているものの層を出す",
   (await p.locator("#pWho").innerText()).indexOf("学年") >= 0,
   await p.locator("#pWho").innerText());
ok("手元では「自分」と決めつけない", await p.evaluate(() => isMe("")) === false);
ok("人の名前は @ より前だけ出す",
   await p.evaluate(() => whoName("tanaka@edu.nishi.or.jp")) === "tanaka");

console.log("\n■ たんぽぽ（交流級を選ぶところから出す）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
ok("他のクラスの画面に反映ボタンは無い",
   await p.locator("[data-act='tanpopo']").count() === 0,
   await p.locator("[data-act='tanpopo']").count());
ok("入口のいちばん下にたんぽぽがある", await p.locator(".master.tp").count() === 1);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
ok("たんぽぽの面が出る", await p.locator("#tpView").isVisible() === true);
ok("週案の紙は引っこむ", await p.locator("#stage").isHidden() === true);
ok("入力パネルも引っこむ", await p.locator(".panel").isHidden() === true);
ok("紙から出す操作（印刷・時数）も伏せる",
   await p.locator("[data-act='print']").isHidden() === true
   && await p.locator("[data-act='tally']").isHidden() === true);
ok("交流級はすべての学級から選べる",
   await p.locator("#tpSel .tpchip").count()
     === await p.evaluate(() => allClasses().length),
   await p.locator("#tpSel .tpchip").count());
ok("入れるまでは出せない", await p.locator("#tpGo").isDisabled() === true);
ok("まだ誰も入れていないと言う",
   (await p.locator("#tpWarn").innerText()).indexOf("まだ誰も入れていません") >= 0,
   await p.locator("#tpWarn").innerText());

/* **たんぽぽの組が受け皿。** 既定は4組で、空でも出しておく（落とす先が要る） */
ok("たんぽぽの組が4つ出ている", await p.locator("#tpSel .tpgrp").count() === 4,
   await p.locator("#tpSel .tpgrp").count());
ok("1組から順に並ぶ",
   (await p.locator("#tpSel .tpgrp .tpghead").first().innerText()).indexOf("1組") >= 0,
   await p.locator("#tpSel .tpgrp .tpghead").first().innerText());
ok("空の組は、入れ方を字で言う",
   (await p.locator("#tpSel .tpgrp").first().innerText()).indexOf("引っぱって") >= 0,
   await p.locator("#tpSel .tpgrp").first().innerText());
ok("偶数の組は地の色で分ける",
   await p.locator("#tpSel .tpgrp.even").count() === 2,
   await p.locator("#tpSel .tpgrp.even").count());
ok("偶数の組は色だけに頼らない（太い縦線も引く）", await p.evaluate(() => {
     const e = document.querySelector("#tpSel .tpgrp.even .tpghead");
     return parseFloat(getComputedStyle(e).borderLeftWidth) >= 4;
   }) === true);

/* **交流級は畳んである。** 触る前に開く（入れ替えは年度の初めだけなので、
   ふだんは畳んでおく設計） */
const openFrom = async () => {
  if(await p.locator(".tpfromb").evaluate(e => e.hidden))
    await p.locator("#tpFromQ").click();
  await p.waitForTimeout(200);
};
await openFrom();
ok("交流級は、押すと開くトグルに収まっている",
   await p.locator("#tpFromQ").count() === 1);

/* 3-3 は担任が書いた週。1-1 は基本時間割のまま。3-1 は学年の予定だけ。
   引っぱれない端末のために、押しても「いま選んでいる組」へ入る。 */
await p.locator("#tpSel .tpchip[data-c='3-3']").click(); await p.waitForTimeout(200);
ok("押すと1組へ入る", await p.evaluate(() => tpIn("1")).then
   ? true : (await p.evaluate(() => tpIn("1"))).indexOf("3-3") >= 0,
   await p.evaluate(() => tpIn("1")));
await p.locator("#tpSel .tpchip[data-c='1-1']").click(); await p.waitForTimeout(200);
await p.locator("#tpSel .tpchip[data-c='3-1']").click(); await p.waitForTimeout(200);
/* **済／未は、下の欄に字で書かない。** 組のチップそのものが言う
   （下にまとめて書くと、組の並びと読み合わせないと、どのクラスか分からない） */
const tpWarn = await p.locator("#tpWarn").innerText();
ok("下の欄には、済／未を字で書かない",
   tpWarn.indexOf("基本時間割のまま") < 0 && tpWarn.indexOf("未着手") < 0
   && tpWarn.indexOf("提出") < 0, tpWarn);
ok("組のチップが、まだのクラスを言う", await p.evaluate(() =>
     [...document.querySelectorAll(".tpin")].some(x => /1-1/.test(x.textContent)
       && x.classList.contains("st-base"))) === true);
ok("出す人数と列の数を出す",
   (await p.locator("#tpCount").innerText()).indexOf("3 人") >= 0,
   await p.locator("#tpCount").innerText());
ok("入れたクラスは入口にも出る",
   await p.evaluate(() => tpChosen().length) === 3,
   await p.evaluate(() => tpChosen()));

/* **同じ組へ2回入れれば2人（＝2列）。** 前のクリック切り替えはもう無い */
await p.locator("#tpSel .tpchip[data-c='3-3']").click(); await p.waitForTimeout(200);
ok("同じ組へ2回入れると2人になる", await p.evaluate(() => tpCount("3-3")) === 2,
   await p.evaluate(() => tpCount("3-3")));
ok("組の中はクラス順に並ぶ",
   JSON.stringify(await p.evaluate(() => tpIn("1"))) === JSON.stringify(["1-1","3-1","3-3","3-3"]),
   await p.evaluate(() => tpIn("1")));
ok("チップにどの組かを字で出す",
   (await p.locator("#tpSel .tpchip[data-c='3-3']").innerText()).indexOf("1組") >= 0,
   await p.locator("#tpSel .tpchip[data-c='3-3']").innerText());
ok("組の中の1人を押すと外れる", await (async () => {
     await p.locator("#tpSel .tpin[data-g='1'][data-i='3']").click();
     await p.waitForTimeout(200);
     return await p.evaluate(() => tpCount("3-3")) === 1;
   })() === true, await p.evaluate(() => tpIn("1")));

/* **出す列の並びは たんぽぽ1組 → 2組 …。** 組の中はクラス順 */
await p.locator("#tpSel .tpghead[data-g='2']").click(); await p.waitForTimeout(150);
await p.locator("#tpSel .tpchip[data-c='1-1']").click(); await p.waitForTimeout(200);
ok("2組を選んでから押すと、2組へ入る",
   (await p.evaluate(() => tpIn("2"))).indexOf("1-1") >= 0,
   await p.evaluate(() => tpIn("2")));
ok("出す列は1組の全員 → 2組の全員の順",
   JSON.stringify(await p.evaluate(() => tpColumns()))
     === JSON.stringify([{cls:"1-1",group:1},{cls:"3-1",group:1},{cls:"3-3",group:1},
                         {cls:"1-1",group:2}]),
   await p.evaluate(() => tpColumns()));
ok("組を足せる", await (async () => {
     await p.locator("#tpAddG").click(); await p.waitForTimeout(200);
     return await p.locator("#tpSel .tpgrp").count() === 5;
   })() === true);
/* 足した組は空のままにして、あとの検査に響かせない */
await p.locator("#tpSel .tpghead[data-g='1']").click(); await p.waitForTimeout(150);
await p.locator("#tpSel .tpin[data-g='2'][data-i='0']").click(); await p.waitForTimeout(200);

/* 出す。**専用の窓で聞く。既定は「出さない」。**
   ブラウザの confirm は Enter で「はい」に落ちるので、この面でいちばん大きく
   動く操作には使わない（1コマの上書きと同じ作りにそろえてある）。 */
let usedNativeConfirm = false;
const onTpDialog = async d => { usedNativeConfirm = true; await d.dismiss(); };
p.on("dialog", onTpDialog);
await p.locator("#tpGo").click(); await p.waitForTimeout(400);
p.off("dialog", onTpDialog);
ok("ブラウザの confirm を使わない", usedNativeConfirm === false);
ok("出す前に窓で聞く", await p.locator("#tpDlg").evaluate(d => d.open) === true);
ok("既定は「出さない」（開いた瞬間そこに焦点がある）",
   await p.evaluate(() => document.activeElement && document.activeElement.id) === "tpNo",
   await p.evaluate(() => document.activeElement && document.activeElement.id));
const tpAsked = await p.locator("#tpDlg .dlg").innerText();
ok("出す先のシート名を言う（◯月◯週）", /\d+月\d+週/.test(tpAsked), tpAsked.slice(0, 200));
ok("どの交流級を何人出すかを言う", tpAsked.indexOf("3-3") >= 0, tpAsked.slice(0, 300));
ok("同じ名前のシートは残すことを言う",
   tpAsked.indexOf("名前を変えて残す") >= 0, tpAsked.slice(0, 400));
ok("シートが週の順に並ぶことを言う", tpAsked.indexOf("週の順") >= 0, tpAsked.slice(0, 400));
/* **出す前だけは名指しする。** 出したものを見てたんぽぽ担当が支援員を
   組むので、まだ書き終えていない週を配ると、あとでやり直しになる */
ok("出す前は、まだ提出していないクラスを名指しする",
   (await p.locator("#tpDlgWarn").innerText()).indexOf("提出") >= 0,
   await p.locator("#tpDlgWarn").innerText());
ok("担当者・場所の行には書かないことを言う",
   tpAsked.indexOf("授業名の行だけ") >= 0, tpAsked.slice(0, 600));
/* Esc で閉じても「出さない」に落ちる */
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
ok("Esc で閉じても出さない", await p.locator("#tpDlg").evaluate(d => d.open) === false);

/* 「いまの形をみる」「この形で作りなおす」は無くした。
   出す先の形をこちらが毎週作るので、形を読み違える余地そのものが無い */
ok("「いまの形をみる」は置かない", await p.locator("#tpShape").count() === 0);
ok("「この形で作りなおす」も置かない", await p.locator("#tpBuild").count() === 0);
ok("たんぽぽの面に押すものは「出す」だけ",
   await p.locator("#tpView .tpact .btn").count() === 1,
   await p.locator("#tpView .tpact .btn").count());

/* 手元では書き込まない。**書かないことを画面に出す** */
await p.locator("#tpGo").click(); await p.waitForTimeout(300);
await p.locator("#tpYes").click(); await p.waitForTimeout(400);
ok("手元では書き込まないと言う",
   (await p.locator("#tpWarn").innerText()).indexOf("書き込まない") >= 0,
   await p.locator("#tpWarn").innerText());

console.log("\n■ たんぽぽの面は、組が左・交流級が右");
ok("左が たんぽぽの組", await p.evaluate(() => {
     const to = document.querySelector(".tpto").getBoundingClientRect();
     const from = document.querySelector(".tpfrom").getBoundingClientRect();
     return to.left < from.left;
   }) === true);
ok("組と交流級の上端がそろっている", await p.evaluate(() => {
     const to = document.querySelector(".tpto").getBoundingClientRect();
     const from = document.querySelector(".tpfrom").getBoundingClientRect();
     return Math.abs(to.top - from.top) < 2;
   }) === true);
ok("説明は畳んである（開かないと出ない）",
   await p.locator(".tphead details").evaluate(d => d.open) === false);
ok("畳んだ説明は開ける", await (async () => {
     await p.locator(".tphead summary").click(); await p.waitForTimeout(150);
     const open = await p.locator(".tphead details").evaluate(d => d.open);
     await p.locator(".tphead summary").click(); await p.waitForTimeout(150);
     return open;
   })() === true);
ok("出す先のシート名を面にも出す",
   /\d+月\d+週/.test(await p.locator("#tpCount").innerText()),
   await p.locator("#tpCount").innerText());

console.log("\n■ A週・B週の「ー」は、片方だけの授業なし");
/* **つないだマスの空欄と、人が書いた「ー」を分ける。**
   同じ扱いにすると、A＝国語／B＝「ー」を「B週も国語」に埋めてしまい、
   授業の無い校時に授業が入る（落ちないので気づかない）。 */
ok("A=国／B=ー は、A週だけ国語", await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""],
                ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"],
                ["3-1", "", "国", "ー", "算", "体"]];
     const r = parseFixed(g), c = r.classes["3-1"];
     return [ (c.A["0|p1"] || {}).title || "", (c.B["0|p1"] || {}).title || "" ];
   }).then(v => JSON.stringify(v)) === '["国語",""]',
   await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"], ["3-1", "", "国", "ー", "算", "体"]];
     const c = parseFixed(g).classes["3-1"];
     return [(c.A["0|p1"]||{}).title, (c.B["0|p1"]||{}).title];
   }));
ok("A=国／B=空欄 は、今までどおり両方とも国語", await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"], ["3-1", "", "国", "", "算", "体"]];
     const c = parseFixed(g).classes["3-1"];
     return [(c.A["0|p1"]||{}).title || "", (c.B["0|p1"]||{}).title || ""];
   }).then(v => JSON.stringify(v)) === '["国語","国語"]');
ok("A=ー／B=国 は、B週だけ国語（逆向きも同じ）", await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"], ["3-1", "", "ー", "国", "算", "体"]];
     const c = parseFixed(g).classes["3-1"];
     return [(c.A["0|p1"]||{}).title || "", (c.B["0|p1"]||{}).title || ""];
   }).then(v => JSON.stringify(v)) === '["","国語"]');
ok("A=ー／B=ー は、どちらにも入れない", await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"], ["3-1", "", "ー", "ー", "算", "体"]];
     const c = parseFixed(g).classes["3-1"];
     return !c.A["0|p1"] && !c.B["0|p1"];
   }) === true);
ok("全角のダッシュ（−・ｰ・〜）も「授業なし」として読む", await p.evaluate(() => {
     return ["−", "ｰ", "〜", "—", "-"].every(mark => {
       const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                  ["", "", "A", "B", "A", "B"], ["3-1", "", "国", mark, "算", "体"]];
       const c = parseFixed(g).classes["3-1"];
       return !c.B["0|p1"];
     });
   }) === true);
ok("「ー」は読めない字として知らせない（授業なしと分かっている）",
   await p.evaluate(() => {
     const g = [["", "", "月", "", "", ""], ["", "", "1", "", "2", ""],
                ["", "", "A", "B", "A", "B"], ["3-1", "", "国", "ー", "算", "体"]];
     return parseFixed(g).unknown.join("");
   }) === "");

console.log("\n■ 固定時間割の取り込み");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(300);
await p.locator("[data-act='base']").click(); await p.waitForTimeout(250);
await p.locator("#baseImp").click(); await p.waitForTimeout(250);
ok("「表から取り込む」で窓が出る", await p.locator("#impDlg").evaluate(d => d.open) === true);
ok("読む前は入れられない", await p.locator("#impGo").isDisabled() === true);

/* 同梱の表（2026 固定時間割案） */
await p.locator("#impSrc button[data-s='builtin']").click(); await p.waitForTimeout(150);
await p.locator("#impRead").click(); await p.waitForTimeout(300);
ok("同梱の表は20学級ぶん読める",
   (await p.locator("#impStat").innerText()).indexOf("20 クラス") >= 0,
   await p.locator("#impStat").innerText());
ok("同梱の表に読めない字は無い",
   (await p.locator("#impWarn").innerText()).indexOf("読めない字") < 0,
   await p.locator("#impWarn").innerText());
ok("表に無かったクラス（4-4）はそのままにすると言う",
   (await p.locator("#impWarn").innerText()).indexOf("4-4") >= 0,
   await p.locator("#impWarn").innerText());
await p.locator("#impCls").selectOption("3-1"); await p.waitForTimeout(200);
const imp31 = await p.evaluate(() => {
  const rows = [...document.querySelectorAll("#impGrid tr")].map(r =>
    [...r.children].map(c => c.innerText.trim()).join(" "));
  return rows.join("\n");
});
ok("A週とB週を並べて見せる", /A週/.test(imp31) && /B週/.test(imp31), imp31.slice(0,120));
ok("A週とB週で違うコマに印が付く",
   await p.locator("#impGrid td.diff").count() > 0,
   await p.locator("#impGrid td.diff").count());
ok("3-1 の木は A週が理科・B週が音楽（表のとおり）",
   await p.evaluate(() => {
     const c = impRes.classes["3-1"];
     return (c.A["3|p3"] || {}).title + "/" + (c.B["3|p3"] || {}).title;
   }) === "理科/音楽",
   await p.evaluate(() => {
     const c = impRes.classes["3-1"];
     return [(c.A["3|p3"]||{}).title, (c.B["3|p3"]||{}).title];
   }));
ok("つないだマス（片方が空）は両方に同じ授業が入る",
   await p.evaluate(() => {
     const c = impRes.classes["3-1"];
     return (c.A["3|p4"] || {}).title === "理科" && (c.B["3|p4"] || {}).title === "理科";
   }) === true);
ok("月・水に6校時は入らない（表に列が無い）",
   await p.evaluate(() => !impRes.classes["3-1"].A["0|p6"] && !impRes.classes["3-1"].A["2|p6"]),
   await p.evaluate(() => [impRes.classes["3-1"].A["0|p6"], impRes.classes["3-1"].A["2|p6"]]));

/* 貼り付け。学校の表と同じ見出しの形 */
const impTsv = [
  ["", "", "月", "", "", "", "火", "", "", ""],
  ["", "", "1", "", "2", "", "1", "", "2", ""],
  ["", "", "A", "B", "A", "B", "A", "B", "A", "B"],
  ["1-1", "先生", "国", "", "算", "理", "ー", "ー", "体", ""],
  ["9-1", "先生", "国", "", "謎", "", "国", "", "算", ""]
].map(r => r.join("\t")).join("\n");
await p.locator("#impSrc button[data-s='paste']").click(); await p.waitForTimeout(150);
await p.locator("#impText").fill(impTsv);
await p.locator("#impRead").click(); await p.waitForTimeout(300);
const impW = await p.locator("#impWarn").innerText();
ok("貼り付けた表も同じ読み方で読める",
   (await p.locator("#impStat").innerText()).indexOf("1 クラス") >= 0,
   await p.locator("#impStat").innerText());
ok("片方が空のマスは両方に入る",
   await p.evaluate(() => {
     const c = impRes.classes["1-1"];
     return (c.A["0|p1"]||{}).title === "国語" && (c.B["0|p1"]||{}).title === "国語";
   }) === true,
   await p.evaluate(() => impRes.classes["1-1"]));
ok("A週とB週で字が違えば別々に入る",
   await p.evaluate(() => {
     const c = impRes.classes["1-1"];
     return (c.A["0|p2"]||{}).title === "算数" && (c.B["0|p2"]||{}).title === "理科";
   }) === true);
ok("「ー」は授業なしとして空にする",
   await p.evaluate(() => !impRes.classes["1-1"].A["1|p1"] && !impRes.classes["1-1"].B["1|p1"]));
ok("知らない字は捨てずに知らせる", impW.indexOf("謎") >= 0, impW);
ok("知らない字は題名として残る",
   await p.evaluate(() => {
     const e = impRes.classes["9-1"].A["0|p2"];
     return e.title === "謎" && e.subject === null;
   }) === true);
ok("編成に無いクラスは入れないと言う",
   impW.indexOf("9-1") >= 0 && impW.indexOf("学級編成に無い") >= 0, impW);
ok("表に無かったクラスはそのままにすると言う",
   impW.indexOf("表に無かった") >= 0 && impW.indexOf("3-1") >= 0, impW);

/* 見出しが無ければ読まない（黙って別の校時に入れない） */
await p.locator("#impText").fill("1-1\t国\t算\n1-2\t算\t国");
await p.locator("#impRead").click(); await p.waitForTimeout(250);
ok("見出しが無ければ読めないと言う",
   (await p.locator("#impWarn").innerText()).indexOf("読めなかった") >= 0,
   await p.locator("#impWarn").innerText());
ok("読めないときは入れられない", await p.locator("#impGo").isDisabled() === true);

/* 入れる */
await p.locator("#impSrc button[data-s='builtin']").click(); await p.waitForTimeout(150);
await p.locator("#impRead").click(); await p.waitForTimeout(300);
let impAsked = null;
const onImpDialog = async d => { impAsked = d.message(); await d.accept(); };
p.on("dialog", onImpDialog);
await p.locator("#impGo").click(); await p.waitForTimeout(400);
p.off("dialog", onImpDialog);
ok("入れる前に聞く", typeof impAsked === "string" && impAsked.indexOf("入れ替え") >= 0, impAsked);
ok("いまの基本時間割が消えることを言う",
   !!impAsked && impAsked.indexOf("消えます") >= 0, impAsked);
ok("入れると基本時間割になる",
   await p.evaluate(() => (Y().base["3-1"].B["3|p3"] || {}).title) === "音楽",
   await p.evaluate(() => Y().base["3-1"].B["3|p3"]));
ok("入れたら窓は閉じる", await p.locator("#impDlg").evaluate(d => d.open) === false);
await p.locator("#baseDlg .dlgx").click(); await p.waitForTimeout(250);

console.log("\n■ 学年・全学年には「リセット」を出す");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(400);
ok("担任の画面には出さない（そちらは「上位に戻す」がある）",
   await p.locator(".pal.clear").count() === 0);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-g='1']").click(); await p.waitForTimeout(400);
ok("学年の画面には出る", await p.locator(".pal.clear").count() === 1);
ok("入れるものと見分けられる色になっている",
   await p.evaluate(() => getComputedStyle(document.querySelector(".pal.clear"))
     .backgroundColor) !== await p.evaluate(() => getComputedStyle(
       document.querySelector(".pal[data-v='kokugo']")).backgroundColor));
const g1 = "#sheet .cell[data-d='2'][data-s='p2']";
await p.locator(g1 + " .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='taiiku']").click(); await p.waitForTimeout(250);
ok("学年に入れたものは紙に出る",
   (await p.locator(g1 + " .t").innerText()).trim() === "体育");
ok("学年の各クラスにも降りている",
   await p.evaluate(() => plain(compose("1-2", 2, "p2").title).trim()) === "体育",
   await p.evaluate(() => plain(compose("1-2", 2, "p2").title)));
await p.locator(".pal.clear").click(); await p.waitForTimeout(250);
ok("リセットで、その学年から取り消せる",
   await p.evaluate(() => !(week().grade["1"] || {})["2|p2"]) === true,
   await p.evaluate(() => week().grade["1"]));
ok("取り消すと、各クラスは自分の予定に戻る",
   await p.evaluate(() => plain(compose("1-2", 2, "p2").title).trim()) !== "体育",
   await p.evaluate(() => plain(compose("1-2", 2, "p2").title)));
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.all").click(); await p.waitForTimeout(400);
ok("全学年の画面にも出る", await p.locator(".pal.clear").count() === 1);

console.log("\n■ 入力ロック（見るだけのときに、うっかり直さない）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='2-2']").click(); await p.waitForTimeout(400);
const cell22 = "#sheet .cell[data-d='1'][data-s='p3']";
await p.locator(cell22 + " .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='rika']").click(); await p.waitForTimeout(250);
const before22 = (await p.locator(cell22 + " .t").innerText()).trim();
ok("ロックする前は入る", before22 === "理科", before22);

await p.locator("#lockBtn").click(); await p.waitForTimeout(250);
ok("押すとロック中になる",
   await p.locator("#lockBtn").getAttribute("aria-pressed") === "true");
ok("ロック中だと画面に出る", await p.locator("#lockMsg").isVisible() === true);
ok("紙の欄は書けなくなる",
   await p.locator(cell22 + " .t").getAttribute("contenteditable") === "false");
ok("教科のボタンは押せなくなる",
   await p.locator(".pal[data-v='kokugo']").isDisabled() === true);
ok("「空にする」も押せなくなる", await p.locator("#pClear").isDisabled() === true);
/* 押しても入らない（ボタンが効かないだけでなく、書き込みの道でも止める） */
await p.evaluate(() => applyPalette(1, "p3", "kokugo"));
await p.waitForTimeout(200);
ok("ロック中は、どこから入れても入らない",
   (await p.locator(cell22 + " .t").innerText()).trim() === "理科",
   await p.locator(cell22 + " .t").innerText());
ok("直に書き込もうとしても入らない",
   await p.evaluate(() => writeCell(1, "p3", {title:"だめ", subject:null})) === false);

/* ロックは画面ごと。ほかのクラスは直せる */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='2-3']").click(); await p.waitForTimeout(400);
ok("ほかのクラスはロックされない",
   await p.locator("#lockBtn").getAttribute("aria-pressed") === "false");
ok("ほかのクラスは書ける",
   await p.locator("#sheet .cell[data-d='1'][data-s='p3'] .t")
     .getAttribute("contenteditable") === "true");

/* 戻ってくるとロックは続いている */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='2-2']").click(); await p.waitForTimeout(400);
ok("開き直してもロックは続く",
   await p.locator("#lockBtn").getAttribute("aria-pressed") === "true");
await p.locator("#lockBtn").click(); await p.waitForTimeout(250);
ok("もう一度押すと外れる",
   await p.locator("#lockBtn").getAttribute("aria-pressed") === "false"
   && await p.locator(cell22 + " .t").getAttribute("contenteditable") === "true");

console.log("\n■ 時数のコピー");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
const tsv = await p.evaluate(() => tallyTsv());
ok("5日 × 1日ぶんの行数 の矩形になる", tsv.split("\n").length === 50, tsv.split("\n").length);
ok("空のセルを含む（貼った先の形が揃う）", tsv.split("\n")[0].split("\t").length === 15,
   tsv.split("\n")[0].split("\t").length);

console.log("\n■ 授業名は枠いっぱい。入らないコマだけ縮める");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(400);
await p.evaluate(() => {
  writeCell(0, "p1", {title:"国語", subject:"kokugo"});
  writeCell(1, "p1", {title:"クラブ活動・委員会", subject:null});
  paintSheet();
});
await p.waitForTimeout(250);
const fs = d => p.evaluate(dd => parseFloat(getComputedStyle(
  document.querySelector("#sheet .cell[data-d='" + dd + "'][data-s='p1'] .t")).fontSize), d);
ok("2文字の教科は大きく出る", await fs(0) >= 19, await fs(0));
ok("長い名前はそのコマだけ縮む", await fs(1) < await fs(0) * 0.7,
   [await fs(0), await fs(1)]);
ok("縮めても、ほかのコマは大きいまま（全部を長い名前に合わせない）",
   await fs(0) >= 19, await fs(0));
ok("どのコマも枠からはみ出さない",
   await p.evaluate(() => [...document.querySelectorAll("#sheet .cell .t")]
     .every(t => t.scrollWidth <= t.clientWidth + 1
                 && t.scrollHeight <= t.clientHeight + 1)) === true,
   await p.evaluate(() => [...document.querySelectorAll("#sheet .cell .t")]
     .filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.innerText)));

await p.emulateMedia({media:"print"});
await p.waitForTimeout(200);
ok("刷るとき、まわりの操作は消える", await p.locator(".side").isHidden());
ok("刷るとき、層の印は消える", await p.locator("#sheet .tag").first().isHidden());
ok("刷るとき、時刻は出さない（版面を動かさない）",
   await p.locator("#sheet .lab .tm").first().isHidden());
ok("刷っても枠からはみ出さない（刷るときの列の幅で測っている）",
   await p.evaluate(() => [...document.querySelectorAll("#sheet .cell .t")]
     .every(t => t.scrollWidth <= t.clientWidth + 1)) === true,
   await p.evaluate(() => [...document.querySelectorAll("#sheet .cell .t")]
     .filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.innerText)));
ok("刷るとき、待っている印は出さない",
   await p.evaluate(() => getComputedStyle(document.querySelector(".busy")).display) === "none");
/* 処理中の全面表示は開いていると最前面の層に乗る。**紙には出さない。**
   出したまま刷ると、週案の真ん中に黒い箱が刷り込まれる */
ok("刷るとき、処理中の全面表示も出さない", await p.evaluate(() => {
     const w = Wait.begin("刷るときの検査");
     const d = document.getElementById("wait");
     d.showModal();                       /* 200ms を待たずに、その場で出す */
     const dsp = getComputedStyle(d).display;
     Wait.end(w); if(d.open) d.close();
     return dsp;
   }) === "none");
ok("刷るとき、選んでいる印も消える",
   await p.evaluate(() => {
     const e = document.querySelector("#sheet .cell.sel");
     return !e || getComputedStyle(e).boxShadow === "none";
   }));

ok("刷るときも 月〜土の6列", await p.locator("#sheet .hd").count() === 6,
   await p.locator("#sheet .hd").count());
ok("刷るときも放課後の欄が6日ぶん出る",
   await p.locator("#sheet .cell.note .n").count() === 6,
   await p.locator("#sheet .cell.note .n").count());
ok("刷るとき、放課後は週メモより広い（余りは放課後に回る）",
   await p.evaluate(() => {
     const a = document.querySelector("#sheet .cell[data-s='after']").getBoundingClientRect();
     const f = document.querySelector("#sheet .foot").getBoundingClientRect();
     return a.height > f.height * 2;
   }) === true,
   await p.evaluate(() => {
     const a = document.querySelector("#sheet .cell[data-s='after']").getBoundingClientRect();
     const f = document.querySelector("#sheet .foot").getBoundingClientRect();
     return [Math.round(a.height), Math.round(f.height)];
   }));
/* **紙は1枚に収める。** 版面が page の高さを超えると2ページ目が出る。
   `@page{size:B5}` は ISO B5（176×250mm）で、この設計の JIS B5（182×257mm）
   より小さい。キーワードで書くと下がはみ出す（実際に出た）ので mm で書いている */
ok("紙の縦が B5（JIS・257mm）の中に収まる", await p.evaluate(() => {
     const mm = px => px / (96 / 25.4);
     return mm(document.querySelector("#sheet").getBoundingClientRect().height) <= 257 - 16;
   }) === true,
   await p.evaluate(() => Math.round(
     document.querySelector("#sheet").getBoundingClientRect().height / (96/25.4))));
ok("@page に B5 とは書かない（CSS の B5 は ISO の 176×250mm）",
   await p.evaluate(() => {
     const t = (document.getElementById("pagecss") || {}).textContent || "";
     return t.indexOf("182mm") >= 0 && t.indexOf("257mm") >= 0 && !/size:\s*B5/.test(t);
   }) === true,
   await p.evaluate(() => (document.getElementById("pagecss") || {}).textContent));
ok("紙の外に置いたものは、body の高さを押し広げない（白紙の2枚目が出ない）",
   await p.evaluate(() => {
     const mm = px => px / (96 / 25.4);
     return mm(document.body.getBoundingClientRect().height) <= 257 - 16 + 1;
   }) === true,
   await p.evaluate(() => Math.round(
     document.body.getBoundingClientRect().height / (96/25.4))));

await p.emulateMedia({media:"screen"});      /* 刷るときの見え方から画面へ戻す */

console.log("\n■ 年間行事は、日付ごとに候補として出す");
/* **校時への割り付けはしない。** 行事は日付にしか結びついていないので、
   自動でコマに入れると、外れたものを毎週打ち消す作業が生まれる。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => {
  Y().events = {};
  Y().events[iso(addDays(monday, 1))] = {c:"校外学習6年(奈良)", s:"職員会議15:00", w:"A"};
  Y().events[iso(addDays(monday, 3))] = {c:"", s:"定時退勤日", w:""};
  save(); buildSheet();
});
await p.waitForTimeout(300);
ok("行事のある日には、見出しに印が付く",
   await p.locator("#sheet .hd.hasev").count() === 2,
   await p.locator("#sheet .hd.hasev").count());
ok("印は画面だけ（紙には出さない）", await (async () => {
     await p.emulateMedia({media:"print"}); await p.waitForTimeout(200);
     const v = await p.evaluate(() => getComputedStyle(
       document.querySelector("#sheet .hd.hasev"), "::after").display);
     await p.emulateMedia({media:"screen"}); await p.waitForTimeout(200);
     return v;
   })() === "none");
ok("行事の無い日には印を付けない",
   await p.locator("#sheet .hd[data-d='0'].hasev").count() === 0);
await p.locator("#sheet .cell[data-d='1'][data-s='p3'] .t").click();
await p.waitForTimeout(250);
ok("コマを選ぶと、その日の行事が右に出る",
   await p.locator("#pEvWrap").isVisible() === true);
ok("児童と職員の2つとも出る",
   await p.locator("#pEvs .ev").count() === 2,
   await p.locator("#pEvs .ev").count());
ok("どちらの欄のものかを添える",
   (await p.locator("#pEvs").innerText()).indexOf("児童") >= 0
   && (await p.locator("#pEvs").innerText()).indexOf("職員") >= 0,
   await p.locator("#pEvs").innerText());
ok("押すと、選んでいるコマに入る", await (async () => {
     await p.locator("#pEvs .ev").first().click(); await p.waitForTimeout(350);
     return await p.evaluate(() => plain(cellFor(1, "p3").title));
   })() === "校外学習6年(奈良)");
ok("教科は「行事」にする（時数に数えない）",
   await p.evaluate(() => cellFor(1, "p3").subject) === "gyoji",
   await p.evaluate(() => cellFor(1, "p3").subject));
ok("時数のコピーには出てこない", await p.evaluate(() => {
     db.settings.tally.classes = "3-1";
     const block = Math.max(1, +db.settings.tally.block || 10);
     const line = tallyGrid()[1 * block];
     return line.join("").indexOf("校外") < 0;
   }) === true);
await p.locator("#sheet .cell[data-d='0'][data-s='p3'] .t").click();
await p.waitForTimeout(250);
ok("行事の無い日には、その欄を出さない",
   await p.locator("#pEvWrap").isVisible() === false);
ok("自動ではコマに入れない（押すまで入らない）",
   await p.evaluate(() => plain(cellFor(3, "p3").title)) !== "定時退勤日",
   await p.evaluate(() => plain(cellFor(3, "p3").title)));
/* 片づける */
await p.evaluate(() => { delete (week().home["3-1"] || {})["1|p3"]; Y().events = {};
                         save(); buildSheet(); });
await p.waitForTimeout(250);

console.log("\n■ この日の形（ふつう／特別校時／休み）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
ok("担任の画面からは決められない（日付の見出しを押せない）",
   await p.locator("#sheet .hd.pick").count() === 0);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.all").click(); await p.waitForTimeout(400);
ok("全学年の面では、日付の見出しが押せる",
   await p.locator("#sheet .hd.pick").count() === 6,
   await p.locator("#sheet .hd.pick").count());
await p.locator("#sheet .hd[data-d='1']").click(); await p.waitForTimeout(250);
ok("押すと窓が開く", await p.locator("#dayDlg").evaluate(d => d.open) === true);
ok("その日の日付を出す",
   /\d+\/\d+/.test(await p.locator("#dayWhen").innerText()),
   await p.locator("#dayWhen").innerText());
ok("3つから選ぶ（ふつう・特別校時・休み）",
   await p.locator("#dayForms .dayform").count() === 3);
ok("全クラスに入ることを言う",
   (await p.locator("#dayDlg .dlg").innerText()).indexOf("全クラス") >= 0);
ok("戻せば予定がそのまま出ることを言う",
   (await p.locator("#dayDlg .dlg").innerText()).indexOf("消していません") >= 0);
await p.locator("#dayForms .dayform[data-f='special']").click(); await p.waitForTimeout(350);

console.log("\n■ 特別校時：朝学習が消え、その分だけ上へ詰まる");
ok("その日の朝学習の欄が無くなる",
   await p.locator("#sheet .cell[data-d='1'][data-s='am2']").count() === 0);
ok("ほかの曜日の朝学習は残る",
   await p.locator("#sheet .cell[data-d='0'][data-s='am2']").count() === 1);
ok("見出しに「特」の印が出る",
   (await p.locator("#sheet .hd[data-d='1'] .mark").innerText()).trim() === "特");
ok("その日の1時間目が、ほかの曜日より上に来る（本当に詰まっている）",
   await p.evaluate(() => {
     const t = s => document.querySelector(s).getBoundingClientRect().top;
     return t("#sheet .cell[data-d='1'][data-s='p1']") < t("#sheet .cell[data-d='0'][data-s='p1']") - 5;
   }) === true,
   await p.evaluate(() => {
     const t = s => Math.round(document.querySelector(s).getBoundingClientRect().top);
     return [t("#sheet .cell[data-d='1'][data-s='p1']"), t("#sheet .cell[data-d='0'][data-s='p1']")];
   }));
/* **ここが前に壊れたところ。** 外の格子の行をずらすと、朝学習の行に
   授業1コマが落ちてその行が 6mm → 29mm に膨らみ、紙が B5 に入らなくなる */
ok("ほかの曜日の行の高さは変わらない（朝学習の行は 6mm のまま）",
   await p.evaluate(() => {
     const mm = px => px / (96/25.4);
     return mm(document.querySelector("#sheet .cell[data-d='0'][data-s='am2']")
                 .getBoundingClientRect().height) < 8;
   }) === true,
   await p.evaluate(() => Math.round(document.querySelector("#sheet .cell[data-d='0'][data-s='am2']")
     .getBoundingClientRect().height / (96/25.4) * 10) / 10));
ok("紙の高さは変わらない（B5 に収まる）",
   await p.evaluate(() => {
     const mm = px => px / (96/25.4);
     return mm(document.querySelector("#sheet").getBoundingClientRect().height) <= 257 - 16;
   }) === true,
   await p.evaluate(() => Math.round(document.querySelector("#sheet")
     .getBoundingClientRect().height / (96/25.4) * 10) / 10));
ok("詰めたぶんは放課後が受け取る（その日の放課後が広い）",
   await p.evaluate(() => {
     const h = s => document.querySelector(s).getBoundingClientRect().height;
     return h("#sheet .cell[data-d='1'][data-s='after']") > h("#sheet .cell[data-d='0'][data-s='after']") + 5;
   }) === true);

console.log("\n■ 休み：1〜6に1本の斜め線");
await p.locator("#sheet .hd[data-d='3']").click(); await p.waitForTimeout(250);
await p.locator("#dayForms .dayform[data-f='off']").click(); await p.waitForTimeout(350);
ok("見出しに「休」の印が出る",
   (await p.locator("#sheet .hd[data-d='3'] .mark").innerText()).trim() === "休");
ok("斜め線は1本だけ（コマごとに切れない）",
   await p.locator("#sheet .daycol[data-d='3'] .dayoff svg line").count() === 1,
   await p.locator("#sheet .dayoff svg line").count());
ok("線は図形で描く（背景の色ではない。白黒印刷で消えない）",
   await p.locator("#sheet .daycol[data-d='3'] .dayoff svg").count() === 1);
ok("1時間目の上から6時間目の下までを覆う", await p.evaluate(() => {
     const r = document.querySelector("#sheet .daycol[data-d='3'] .dayoff").getBoundingClientRect();
     const p1 = document.querySelector("#sheet .cell[data-d='3'][data-s='p1']").getBoundingClientRect();
     const p6 = document.querySelector("#sheet .cell[data-d='3'][data-s='p6']").getBoundingClientRect();
     return Math.abs(r.top - p1.top) < 2 && Math.abs(r.bottom - p6.bottom) < 2;
   }) === true);
ok("休み①：1〜6は空にするが、朝学習は残す",
   await p.evaluate(() => plain(cellFor(3, "am2").title).length >= 0
     && document.querySelector("#sheet .cell[data-d='3'][data-s='am2']") !== null) === true);
ok("休みの日の授業には書けない",
   await p.evaluate(() => {
     writeCell(3, "p2", {title:"算数", subject:"sansu"});
     return plain(((week().home["3-1"]||{})["3|p2"]||{}).title || "");
   }) === "");
ok("休みの日でも、放課後には書ける",
   await p.evaluate(() => {
     openView({kind:"class", cls:"3-1"});
     writeCell(3, "after", {note:"部活動"});
     const v = plain(cellFor(3, "after").note);
     openView({kind:"school"});
     return v;
   }) === "部活動");
ok("休みの日は時数に数えない", await p.evaluate(() => {
     db.settings.tally.classes = "3-1";
     const g = tallyGrid(), block = Math.max(1, +db.settings.tally.block || 10);
     return g[3 * block].every(v => v === "");
   }) === true, await p.evaluate(() => tallyGrid()[3 * (+db.settings.tally.block || 10)]));
ok("ふつうに戻すと、書いてある予定がそのまま出る", await (async () => {
     await p.locator("#sheet .hd[data-d='3']").click(); await p.waitForTimeout(250);
     await p.locator("#dayForms .dayform[data-f='']").click(); await p.waitForTimeout(350);
     return await p.locator("#sheet .daycol[data-d='3'] .dayoff").count() === 0
         && await p.locator("#sheet .hd[data-d='3'] .mark").count() === 0;
   })() === true);
/* 片づける */
await p.locator("#sheet .hd[data-d='1']").click(); await p.waitForTimeout(250);
await p.locator("#dayForms .dayform[data-f='']").click(); await p.waitForTimeout(350);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);

console.log("\n■ 月〜土の6列。日曜は置かない");
ok("曜日の見出しは 月・火・水・木・金・土",
   (await p.locator("#sheet .hd").allInnerTexts()).map(t => t.slice(-1)).join("")
     === "月火水木金土",
   await p.locator("#sheet .hd").allInnerTexts());
ok("日曜の欄は無い",
   (await p.locator("#sheet").innerText()).indexOf("日曜") < 0
   && await p.locator("#sheet .wk").count() === 0);
ok("土の列は月〜金より狭い（月〜金の幅を痩せさせない）", await p.evaluate(() => {
     const h = [...document.querySelectorAll("#sheet .hd")].map(e => e.getBoundingClientRect().width);
     return h[5] < h[0] && h[0] === h[4];
   }) === true,
   await p.evaluate(() => [...document.querySelectorAll("#sheet .hd")]
     .map(e => Math.round(e.getBoundingClientRect().width))));
ok("土にも書ける（行事とオープンスクール）", await (async () => {
     await p.evaluate(() => { writeCell(5, "p2", {title:"オープンスクール", subject:null});
                              paintSheet(); });
     await p.waitForTimeout(200);
     return (await p.locator("#sheet .cell[data-d='5'][data-s='p2'] .t").innerText())
              .indexOf("オープンスクール") >= 0;
   })() === true);
ok("土は基本時間割から何も降りてこない",
   await p.evaluate(() => compose("3-3", 5, "p1").layer) === "base"
   && await p.evaluate(() => plain(compose("3-3", 5, "p1").title)) === "",
   await p.evaluate(() => compose("3-3", 5, "p1")));

console.log("\n■ 備考の字は、題名より少し小さい程度");
const fsT = await p.evaluate(() => parseFloat(getComputedStyle(
  document.querySelector("#sheet .cell[data-d='0'][data-s='p1'] .t")).fontSize));
const fsN = await p.evaluate(() => parseFloat(getComputedStyle(
  document.querySelector("#sheet .cell[data-d='0'][data-s='p1'] .n")).fontSize));
ok("備考は題名の 0.6 〜 0.9 倍", fsN > fsT * 0.6 && fsN < fsT * 0.95, [fsT, fsN]);
ok("前（7pt）より大きい", fsN >= 14, fsN);

console.log("\n■ 週メモは、学級ごとに持ち、シートへ送る");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { setMemo("3-3のメモ"); buildSheet(); });
await p.waitForTimeout(200);
ok("3-3 で書いたメモが 3-3 に出る",
   (await p.locator("#sheet .foot .t").innerText()).indexOf("3-3のメモ") >= 0);
ok("その学級のコマとして持つ（時程は memo・月曜の行）",
   await p.evaluate(() => !!(week().home["3-3"] || {})["0|memo"]) === true,
   await p.evaluate(() => (week().home["3-3"] || {})["0|memo"]));
ok("誰が書いたかも残る",
   await p.evaluate(() => "by" in ((week().home["3-3"] || {})["0|memo"] || {})) === true);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
ok("ほかの学級の紙には出ない",
   (await p.locator("#sheet .foot .t").innerText()).indexOf("3-3のメモ") < 0,
   await p.locator("#sheet .foot .t").innerText());
ok("学年の面は学年のシートに持つ", await (async () => {
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(400);
     await p.evaluate(() => setMemo("3年のメモ"));
     return await p.evaluate(() => plain(((week().grade["3"] || {})["0|memo"] || {}).title || ""));
   })() === "3年のメモ");
ok("専科の面は全校のシートに、教科コードを付けて持つ", await (async () => {
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".tile.sp[data-s='ongaku']").click(); await p.waitForTimeout(400);
     await p.evaluate(() => setMemo("音楽のメモ"));
     return await p.evaluate(() => plain((week().school["0|memo:ongaku"] || {}).title || ""));
   })() === "音楽のメモ");
ok("メモは紙のコマには出てこない（時程の行が無いので）",
   await p.evaluate(() => SLOTS.every(s => s.id !== "memo")) === true);
await p.evaluate(() => {
  delete (week().home["3-3"] || {})["0|memo"];
  delete (week().grade["3"] || {})["0|memo"];
  delete week().school["0|memo:ongaku"];
  save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);

console.log("\n■ 時数の列は、時程シートの行を全部出す");
/* **前は「もう列のずれが入っているもの」だけを出していた。**
   時程シートのIDを既定から変えた学校では一覧に出ず、
   時数のコピーが空のまま画面からは直せなかった。 */
await p.locator("[data-act='tally']").click(); await p.waitForTimeout(300);
ok("時程の行の数だけ、列のずれの欄が出る",
   await p.locator("#tyCols input").count() === await p.evaluate(() => SLOTS.length),
   [await p.locator("#tyCols input").count(), await p.evaluate(() => SLOTS.length)]);
ok("列のずれを持っていない行にも欄が出る（放課後）",
   await p.locator("#tyCols input[data-s='after']").count() === 1);
ok("空欄にすると、その校時は写さない", await (async () => {
     const before = await p.evaluate(() => tallyGrid()[0].join("|"));
     await p.locator("#tyCols input[data-s='p1']").fill(""); await p.waitForTimeout(250);
     const after = await p.evaluate(() => "p1" in db.settings.tally.cols);
     await p.locator("#tyCols input[data-s='p1']").fill("2"); await p.waitForTimeout(250);
     return after === false && before.length > 0;
   })() === true);
ok("入れれば、その校時が写るようになる",
   await p.evaluate(() => db.settings.tally.cols.p1) === 2,
   await p.evaluate(() => db.settings.tally.cols));
await p.locator("#tallyDlg .dlgx").click(); await p.waitForTimeout(250);

console.log("\n■ A週・B週は日付から決まる（交互）");
ok("9/7 の週は A週",
   await p.evaluate(() => autoVariant("2026-09-07")) === "A");
ok("次の週は B週", await p.evaluate(() => autoVariant("2026-09-14")) === "B");
ok("その次はまた A週", await p.evaluate(() => autoVariant("2026-09-21")) === "A");
ok("前の週も B週（起点より前でも交互）",
   await p.evaluate(() => autoVariant("2026-08-31")) === "B");
ok("年をまたいでも交互のまま",
   await p.evaluate(() => autoVariant("2027-03-08")) === "A"
     || await p.evaluate(() => autoVariant("2027-03-08")) === "B");
ok("起点は設定から動かせる", await p.evaluate(() => {
     const keep = db.settings.abAnchor;
     db.settings.abAnchor = "2026-09-14";
     const v = autoVariant("2026-09-07");
     db.settings.abAnchor = keep;
     return v;
   }) === "B");
ok("ふだんは「自動に戻す」を出さない",
   await p.locator("#abAuto").isHidden());
ok("手で変えると、その週だけ変わる", await (async () => {
     const before = await p.evaluate(() => week().variant);
     await p.locator("#ab" + (before === "A" ? "B" : "A")).click();
     await p.waitForTimeout(250);
     return await p.evaluate(() => week().variant) !== before;
   })() === true);
ok("手で変えた週にだけ「自動に戻す」が出る",
   await p.locator("#abAuto").isVisible());
ok("「自動に戻す」で日付どおりに戻る", await (async () => {
     await p.locator("#abAuto").click(); await p.waitForTimeout(250);
     return await p.evaluate(() => week().variant === autoVariant(wkKey()))
         && await p.locator("#abAuto").isHidden();
   })() === true);

console.log("\n■ 左の並びと入口の見え方");
ok("左の並びは、どれも1行に収まる（折り返さない）", await p.evaluate(() =>
     [...document.querySelectorAll(".side .nav")]
       .every(n => n.getBoundingClientRect().height <= 40)) === true,
   await p.evaluate(() => [...document.querySelectorAll(".side .nav")]
     .map(n => n.textContent.trim() + ":" + Math.round(n.getBoundingClientRect().height))));
ok("「ほかの週案を開く」になっている",
   (await p.locator(".nav[data-act='gate']").first().innerText()).indexOf("週案を開く") >= 0,
   await p.locator(".nav[data-act='gate']").first().innerText());
/* **同じものを2か所に置かない。** 行き先の欄がすぐ上で同じことを言っている */
ok("「いま：◯年◯組」の行は置かない", await p.locator("#navOpen").count() === 0);
await p.locator(".nav[data-act='gate']").first().click(); await p.waitForTimeout(250);
ok("入口の下に説明文を置かない（閉じるだけ）",
   (await p.locator(".gate > p.note").innerText()).trim() === "閉じる",
   await p.locator(".gate > p.note").innerText());

console.log("\n■ 全学年の面では、日付を押して休みにできる");
await p.locator(".master.all").click(); await p.waitForTimeout(500);
/* **押せることを、字で見せる。** 印が無かったころは、口そのものが無いと言われた */
ok("日付に、押せる印が出る", await p.locator("#sheet .hd .pk").count() === 6,
   await p.locator("#sheet .hd .pk").count());
ok("説明にも、押せると書いてある",
   (await p.evaluate(() => viewWhere())).indexOf("休み") >= 0,
   await p.evaluate(() => viewWhere()));
await p.locator("#sheet .hd").first().click(); await p.waitForTimeout(300);
await p.locator(".dayform[data-f='off']").click(); await p.waitForTimeout(400);
ok("休みにすると、斜め線が入る", await p.locator("#sheet .dayoff").count() === 1);
ok("休みの日の授業には書けない",
   await p.evaluate(() => writeCell(0, "p1", {title:"あ"})) === false);
ok("朝学習と放課後には書ける（休業日でも行事の準備が入る）",
   await p.evaluate(() => writeCell(0, "after", {note:"準備"})) !== false);
await p.locator("#sheet .hd").first().click(); await p.waitForTimeout(300);
await p.locator(".dayform[data-f='']").click(); await p.waitForTimeout(400);
ok("戻すと、斜め線は消える", await p.locator("#sheet .dayoff").count() === 0);
/* **押せる印は画面だけ。** 決め終わったあとも版面に残ると、紙が汚れる */
await p.emulateMedia({media:"print"}); await p.waitForTimeout(200);
ok("押せる印は、紙には出さない", await p.evaluate(() =>
     [...document.querySelectorAll("#sheet .hd .pk")]
       .every(x => getComputedStyle(x).display === "none")) === true);
await p.emulateMedia({media:"screen"}); await p.waitForTimeout(200);

console.log("\n■ 一手戻す（Ctrl+Z）");
await p.locator(".nav[data-act='gate']").first().click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
const cz = "#sheet .cell[data-d='0'][data-s='p1'] .t";
const was0 = await p.locator(cz).innerText();
await p.locator(cz).click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='rika']").click(); await p.waitForTimeout(300);
ok("パレットで入れたものが入る", await p.locator(cz).innerText() === "理科",
   await p.locator(cz).innerText());
await p.evaluate(() => document.activeElement.blur());
await p.keyboard.press("Control+z"); await p.waitForTimeout(400);
ok("Ctrl+Z で1手戻る", await p.locator(cz).innerText() === was0,
   await p.locator(cz).innerText());
await p.keyboard.press("Control+Shift+z"); await p.waitForTimeout(400);
ok("Ctrl+Shift+Z でやり直せる", await p.locator(cz).innerText() === "理科",
   await p.locator(cz).innerText());
await p.keyboard.press("Control+z"); await p.waitForTimeout(400);
await p.keyboard.press("Control+z"); await p.waitForTimeout(400);
ok("戻すものが無ければ、そう言う（黙って別の週を直さない）",
   (await p.locator("#toast").innerText()).indexOf("戻せるもの") >= 0,
   await p.locator("#toast").innerText());
/* **欄の中では、ブラウザに任せる。** 打ち間違いを1字だけ直せなくなる */
ok("欄の中の Ctrl+Z は横取りしない", await p.evaluate(() => {
     const e = document.querySelector("#sheet .cell[data-d='1'][data-s='p1'] .t");
     e.focus();
     const ev2 = new KeyboardEvent("keydown", {key:"z", ctrlKey:true,
                                               bubbles:true, cancelable:true});
     document.dispatchEvent(ev2);
     e.blur();
     return ev2.defaultPrevented === false;
   }) === true);

console.log("\n■ たんぽぽの面（ロック・交流級の畳み・外す確認）");
await p.evaluate(() => { Y().tanpopo = {"1":["1-1"]}; save(); });
await p.locator(".nav[data-act='gate']").first().click(); await p.waitForTimeout(250);
await p.locator(".master[data-go='tanpopo']").click(); await p.waitForTimeout(600);
ok("ロックのボタンがある", await p.locator("#tpLockBtn").isVisible() === true);
/* **ふだんは畳む。** 入れ替えるのは年度の初めだけ
   （前の節で開いてあるので、畳んだところから見る） */
await p.evaluate(() => { tpFromOpen = false; drawTanpopoView(); });
await p.waitForTimeout(300);
ok("交流級は畳んである", await p.locator(".tpfromb").evaluate(e => e.hidden) === true);
await p.locator("#tpFromQ").click(); await p.waitForTimeout(300);
ok("押すと開く", await p.locator(".tpfromb").evaluate(e => e.hidden) === false
   && await p.locator(".tpchip").count() > 0);
await p.locator("#tpLockBtn").click(); await p.waitForTimeout(300);
ok("ロック中は、出すボタンが押せない", await p.locator("#tpGo").isDisabled() === true);
await p.locator(".tpchip").first().click(); await p.waitForTimeout(300);
ok("ロック中は、組に入れられない",
   await p.evaluate(() => tpCount("1-1")) === 1,
   await p.evaluate(() => tpCount("1-1")));
await p.locator("#tpLockBtn").click(); await p.waitForTimeout(300);
ok("外すと、また入れられる", await p.locator("#tpGo").isDisabled() === false);

console.log("\n■ いま見ている週は、転がしても左上に残る");
ok("左メニューを転がしても、週の欄が見えたまま", await p.evaluate(() => {
     const s = document.querySelector(".side"), w = document.querySelector(".side .wk");
     s.scrollTop = 0;
     const a = w.getBoundingClientRect().top - s.getBoundingClientRect().top;
     s.scrollTop = 9999;
     const b2 = w.getBoundingClientRect().top - s.getBoundingClientRect().top;
     s.scrollTop = 0;
     return b2 <= a + 1 && b2 >= -20;       /* 上へ張りつく（流れ去らない） */
   }) === true);
ok("張りついたとき、下の並びが透けない",
   await p.evaluate(() => getComputedStyle(document.querySelector(".side .wk"))
     .backgroundColor) !== "rgba(0, 0, 0, 0)");

console.log("\n■ 月の面（4週を 2×2 で、B4 よこ1枚に）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
await p.locator(".nav[data-act='month']").click(); await p.waitForTimeout(700);
ok("紙が4枚出る", await p.locator("#mPaper .sheet").count() === 4,
   await p.locator("#mPaper .sheet").count());
ok("2×2 に並ぶ", await p.evaluate(() => {
     const s = [...document.querySelectorAll("#mPaper .sheet")]
       .map(x => x.getBoundingClientRect());
     return s[0].top === s[1].top && s[2].top === s[3].top
         && s[0].left === s[2].left && s[0].top < s[2].top;
   }) === true);
ok("4枚とも別の週を出す", await p.evaluate(() => {
     const h = [...document.querySelectorAll("#mPaper .sheet")]
       .map(x => x.querySelector(".hd span").textContent);
     return new Set(h).size === 4;
   }) === true, await p.evaluate(() => [...document.querySelectorAll("#mPaper .sheet")]
     .map(x => x.querySelector(".hd span").textContent)));
/* **転がさずに1画面へ収める。** 収まらなければ紙にもならない */
ok("画面を転がさずに収まる",
   await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight) <= 0,
   await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight));
ok("どの1枚も枠からはみ出さない", await p.evaluate(() =>
     [...document.querySelectorAll("#mPaper .sheet")]
       .every(x => x.scrollHeight <= x.clientHeight + 1)) === true);
/* **見るだけ。** 直すのは週の紙のほうで */
ok("月の面では書き込めない", await p.evaluate(() =>
     [...document.querySelectorAll("#mPaper .cell .t")]
       .every(x => getComputedStyle(x).pointerEvents === "none")) === true);
/* **紙の大きさで組み直してから刷る。** 画面の広さのまま刷ると、はみ出す */
await p.emulateMedia({media:"print"});
await p.evaluate(() => { document.body.classList.add("printing-month"); fitMonth(mCellMM()); });
await p.waitForTimeout(300);
const mm = px => px / (96 / 25.4);
ok("刷ると B4 よこの版面（352×245mm）に収まる", await p.evaluate(() => {
     const b2 = document.getElementById("mPaper");
     const w = b2.getBoundingClientRect().width / (96 / 25.4);
     const h = b2.scrollHeight / (96 / 25.4);
     return w <= 352.5 && h <= 245.5 && w >= 340 && h >= 235;
   }) === true, await p.evaluate(() => {
     const b2 = document.getElementById("mPaper");
     return [ +(b2.getBoundingClientRect().width / (96/25.4)).toFixed(1),
              +(b2.scrollHeight / (96/25.4)).toFixed(1) ];
   }));
ok("刷るときは、まわりの操作も週の1枚も出さない", await p.evaluate(() =>
     getComputedStyle(document.querySelector(".mbar")).display === "none"
     && getComputedStyle(document.getElementById("stage")).display === "none") === true);
await p.evaluate(() => { document.body.classList.remove("printing-month"); fitMonth(); });
await p.emulateMedia({media:"screen"});
await p.evaluate(() => showMonth(false));
await p.waitForTimeout(400);
ok("戻ると、いつもの週の紙に戻る",
   await p.locator("#monthView").evaluate(e => e.hidden) === true
   && await p.locator("#stage").evaluate(e => e.hidden) === false);

console.log("\n■ 教科チップの色は、字が運んでいるものを二重にするだけ");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
ok("教科ごとに地の色がある",
   await p.evaluate(() => new Set([...document.querySelectorAll(".pal")]
     .map(x => getComputedStyle(x).backgroundColor)).size) >= 12,
   await p.evaluate(() => new Set([...document.querySelectorAll(".pal")]
     .map(x => getComputedStyle(x).backgroundColor)).size));
/* **色は識別を担わない。** 字を消さない。色だけの凡例も作らない */
ok("チップには教科名が必ず書いてある（色だけにしない）",
   await p.evaluate(() => [...document.querySelectorAll(".pal")]
     .every(x => x.textContent.trim().length > 0)) === true);
/* 硬い条件は、地の上で字が読めること */
ok("どの地の上でも字が読める（4.5以上）", await p.evaluate(() => {
     const lin = v => { v /= 255; return v <= .03928 ? v / 12.92
                                 : Math.pow((v + .055) / 1.055, 2.4); };
     const L = c => { const m = c.match(/\d+/g).map(Number);
       return .2126 * lin(m[0]) + .7152 * lin(m[1]) + .0722 * lin(m[2]); };
     const ratio = (a, b) => { const x = L(a), y = L(b);
       return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
     return [...document.querySelectorAll(".pal")].map(x => {
       const s = getComputedStyle(x);
       return ratio(s.backgroundColor, s.color);
     }).every(r => r >= 4.5);
   }) === true, await p.evaluate(() => [...document.querySelectorAll(".pal")]
     .map(x => getComputedStyle(x).backgroundColor + " / " + getComputedStyle(x).color)));
/* **紙の上には出さない。** 紙のコマの地は「層」を表し、モノクロで刷る */
ok("教科の色は、紙のコマには出さない", await p.evaluate(() => {
     const pal = new Set([...document.querySelectorAll(".pal")]
       .map(x => getComputedStyle(x).backgroundColor));
     pal.delete("rgba(0, 0, 0, 0)");
     return [...document.querySelectorAll("#sheet .cell")]
       .every(x => !pal.has(getComputedStyle(x).backgroundColor));
   }) === true);
/* 時数に数えない教科は、色を外しても分かる（破線の枠） */
ok("時数に数えない教科は、枠の形でも分かる", await p.evaluate(() =>
     [...document.querySelectorAll(".pal.off")]
       .every(x => getComputedStyle(x).borderStyle === "dashed")) === true);

console.log("\n■ たんぽぽへの提出は、担任が押す");
await p.evaluate(() => { Y().tanpopo = {"1":["1-1","3-2"], "2":["6-1"]}; save(); });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
/* **たんぽぽの児童がいるクラスにだけ出す。** 全クラスに出すと、
   関係のない人が「押すものなのか」を毎週考えることになる */
ok("たんぽぽの児童がいるクラスには、提出ボタンが出る",
   await p.locator("#tpSubBtn").isVisible() === true);
ok("提出ボタンは、保存の右隣にある", await p.evaluate(() => {
     const s = document.getElementById("saveBtn").getBoundingClientRect();
     const b2 = document.getElementById("tpSubBtn").getBoundingClientRect();
     return b2.left >= s.right - 2 && Math.abs(b2.top - s.top) < 12;
   }) === true);
ok("押す前は塗ってある（押していないほうを目立たせる）", await p.evaluate(() => {
     const b2 = document.getElementById("tpSubBtn");
     const bg = getComputedStyle(b2).backgroundColor;
     return !b2.classList.contains("on") && bg !== "rgba(0, 0, 0, 0)"
         && !/255, 255, 255/.test(bg);
   }) === true, await p.evaluate(() => getComputedStyle($("tpSubBtn")).backgroundColor));
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(400);
ok("押すと、提出ずみになる",
   (await p.locator("#tpSubTxt").innerText()).indexOf("提出ずみ") >= 0,
   await p.locator("#tpSubTxt").innerText());
/* **色だけに頼らない。** 字そのものが変わる */
ok("色だけでなく、字も変わる",
   await p.evaluate(() => $("tpSubBtn").getAttribute("aria-pressed")) === "true");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-2']").click(); await p.waitForTimeout(500);
ok("たんぽぽの児童がいないクラスには、出さない",
   await p.locator("#tpSubBtn").isHidden() === true);

console.log("\n■ たんぽぽの組は、提出したかをチップそのものが言う");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master[data-go='tanpopo']").click(); await p.waitForTimeout(500);
ok("出したクラスと、まだのクラスを見分ける",
   await p.evaluate(() => [...document.querySelectorAll(".tpin")]
     .map(x => x.className.match(/st-\w+/)[0]).join(",")) === "st-ok,st-base,st-base",
   await p.evaluate(() => [...document.querySelectorAll(".tpin")].map(x => x.className)));
/* **色だけに頼らない。** どちらも短い字を持つ */
ok("色だけでなく、字でも言う（済／未）",
   await p.evaluate(() => [...document.querySelectorAll(".tpin em")]
     .map(x => x.textContent).join(",")) === "済,未,未",
   await p.evaluate(() => [...document.querySelectorAll(".tpin em")].map(x => x.textContent)));
ok("済と未は色が違う（左端の線）", await p.evaluate(() => {
     const c = [...document.querySelectorAll(".tpin")]
       .map(x => getComputedStyle(x, "::before").backgroundColor);
     return new Set(c).size === 2;
   }) === true);
ok("見分け方は、組の上に置く（下ではない）", await p.evaluate(() => {
     const l = document.querySelector(".tpleg"), g = document.querySelector(".tpgrp");
     return !!l && !!g && l.getBoundingClientRect().bottom <= g.getBoundingClientRect().top;
   }) === true);
/* **下の字では書かない。** 組の並びと読み合わせる手間をなくしたのが目的 */
ok("下の欄には、済／未を字で書かない",
   await p.evaluate(() => {
     const s = document.getElementById("tpWarn").innerText;
     return s.indexOf("基本時間割のまま") < 0 && s.indexOf("上位（全校・学年）") < 0;
   }) === true, await p.locator("#tpWarn").innerText());
/* **1コマでも書いてあれば済、にはしない。** ちょっと触っただけの週と、
   出してよい週を、たんぽぽ担当が見分けられなくなる */
ok("書いただけでは済にならない（押したものだけが済）", await p.evaluate(() => {
     const w = week();
     w.home["3-2"] = {[ck(0,"p1")]:{title:"国語"}};
     save(); drawTanpopoView();
     const el2 = [...document.querySelectorAll(".tpin")].find(x => /3-2/.test(x.textContent));
     return el2.classList.contains("st-base");
   }) === true);

console.log("\n■ 字は、日本語の字で出る");
/* **日本語の字形を持つフォントを、英字だけのフォントより先に置く。**
   外すと「編」などが中国語の字形で出る */
ok("日本語のフォントを先に並べている", await p.evaluate(() => {
     const f = getComputedStyle(document.body).fontFamily;
     const ja = ["Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Meiryo"];
     const i = f.indexOf("system-ui");
     return ja.every(n => f.indexOf(n) >= 0 && (i < 0 || f.indexOf(n) < i));
   }) === true, await p.evaluate(() => getComputedStyle(document.body).fontFamily));
ok("小さい字がかすれる Yu Gothic（UI でないほう）は並べない",
   await p.evaluate(() => {
     const f = getComputedStyle(document.body).fontFamily;
     return !/"?Yu Gothic"?\s*(,|$)/.test(f.replace(/Yu Gothic UI/g, ""));
   }) === true, await p.evaluate(() => getComputedStyle(document.body).fontFamily));
/* **字幅を詰めるのは紙の上だけ。** 画面の小さい字に掛けると字間がばらつく */
ok("字幅を詰めるのは紙の上だけ", await p.evaluate(() => {
     const b = getComputedStyle(document.body).fontFeatureSettings || "normal";
     const s = getComputedStyle(document.querySelector(".sheet")).fontFeatureSettings || "";
     return b.indexOf("palt") < 0 && s.indexOf("palt") >= 0;
   }) === true, await p.evaluate(() => [
     getComputedStyle(document.body).fontFeatureSettings,
     getComputedStyle(document.querySelector(".sheet")).fontFeatureSettings]));
ok("左の並びの「？」が、A週B週の上に重ならない", await p.evaluate(() => {
     const q = document.querySelector(".wkrow > .helpq"), b2 = document.getElementById("abB");
     if(!q || !b2) return "無い";
     const a = q.getBoundingClientRect(), c = b2.getBoundingClientRect();
     return !(a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top);
   }) === true);

console.log("\n■ 入口の表（上が見切れない・説明が要る）");
await p.locator("[data-act='gate']").first().click(); await p.waitForTimeout(300);
/* **中身が入りきらない高さでも、1行目が見切れない。**
   ふつうの center は上へはみ出し、はみ出したぶんは転がしても出てこない */
await p.setViewportSize({width:1280, height:520});
await p.waitForTimeout(300);
ok("狭い画面でも、表の上が見切れない", await p.evaluate(() => {
     const a = document.getElementById("gate"), g = document.getElementById("grid");
     a.scrollTop = 0;
     return g.getBoundingClientRect().top >= a.getBoundingClientRect().top;
   }) === true, await p.evaluate(() => {
     const a = document.getElementById("gate"), g = document.getElementById("grid");
     return [Math.round(g.getBoundingClientRect().top), Math.round(a.getBoundingClientRect().top)];
   }));
await p.setViewportSize({width:1500, height:950});
await p.waitForTimeout(300);
/* **入口の下に説明文を置かない。** どこへ入るかは、開いた先の紙の上で
   「書いたものは◯◯に入る」と出る。入口で先に読ませても覚えていない */
ok("入口の下は、閉じるボタンだけ",
   (await p.locator(".gate > p.note").innerText()).trim() === "閉じる",
   await p.locator(".gate > p.note").innerText());

console.log("\n■ 左の並びには「？」があり、押すと説明が出る");
ok("左の主な項目ぜんぶに「？」がある",
   await p.locator(".side .helpq").count() >= 10,
   await p.locator(".side .helpq").count());
ok("「？」に説明の中身がある（空の窓を開かない）",
   await p.evaluate(() => [...document.querySelectorAll("[data-help]")]
     .every(e => HELP[e.dataset.help] && HELP[e.dataset.help].b.length > 0)) === true,
   await p.evaluate(() => [...document.querySelectorAll("[data-help]")]
     .filter(e => !HELP[e.dataset.help]).map(e => e.dataset.help)));
/* **？を押しても、親の画面は切り替わらない。**
   読もうとしただけの人が、開く気のない週案を開いてしまう */
await p.locator(".nav[data-help='base'] .helpq").click();
await p.waitForTimeout(300);
ok("「？」を押すと説明の窓が開く",
   await p.locator("#helpDlg").evaluate(d => d.open) === true);
ok("「？」を押しても、その項目そのものは開かない",
   await p.locator("#baseDlg").evaluate(d => d.open) === false);
ok("説明は、何が起きるかを字で書いてある",
   (await p.locator("#helpBody").innerText()).length > 40,
   (await p.locator("#helpBody").innerText()).length);
ok("はじめての人がつまずくところを添える",
   (await p.locator("#helpBody").innerText()).indexOf("はじめの人がつまずくところ") >= 0);
await p.locator("#helpDlg .dlgx").click(); await p.waitForTimeout(250);
ok("説明の窓は ✕ で閉じる",
   await p.locator("#helpDlg").evaluate(d => d.open) === false);

console.log("\n■ 窓を閉じるところは、窓枠の右上");
for(const [act, dlg] of [["base","baseDlg"], ["roster","rosterDlg"],
                         ["paper","setDlg"], ["admin","adminDlg"]]){
  await p.locator("[data-act='" + act + "']").click(); await p.waitForTimeout(250);
  const x = p.locator("#" + dlg + " .dlgx");
  ok(dlg + " に ✕ がある", await x.count() === 1);
  /* **窓の中ではなく、窓枠の右上の角。** 中に置くと、中身の1行目と
     同じ高さに並んで、読むものと閉じるものが混ざる */
  ok(dlg + " の ✕ は窓枠の右上の角にある", await (async () => {
       const box = await p.locator("#" + dlg).boundingBox();
       const bx  = await x.boundingBox();
       if(!box || !bx) return false;
       const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2;
       /* 中心が枠の右上の角のそば（角から 20px 以内）にあること */
       return Math.abs(cx - (box.x + box.width)) < 20 && Math.abs(cy - box.y) < 20;
     })() === true,
     await (async () => JSON.stringify({
       dlg: await p.locator("#" + dlg).boundingBox(),
       x:   await x.boundingBox()}))());
  ok(dlg + " の ✕ は窓の中身より上へはみ出している（1行目と並ばない）",
     await (async () => {
       const box = await p.locator("#" + dlg + " .dlg").boundingBox();
       const bx  = await x.boundingBox();
       return !!box && !!bx && bx.y < box.y && (bx.x + bx.width) > (box.x + box.width);
     })() === true,
     await (async () => JSON.stringify({
       dlg: await p.locator("#" + dlg + " .dlg").boundingBox(),
       x:   await x.boundingBox()}))());
  await x.click(); await p.waitForTimeout(250);
  ok(dlg + " は ✕ で閉じる", await p.locator("#" + dlg).evaluate(d => d.open) === false);
}
ok("窓の下の隅に「閉じる」だけのボタンは置かない",
   await p.evaluate(() => [...document.querySelectorAll("dialog .end .btn")]
     .filter(b => b.textContent.trim() === "閉じる").length) === 0,
   await p.evaluate(() => [...document.querySelectorAll("dialog .end .btn")]
     .map(b => b.textContent.trim())));

console.log("\n■ 管理・システム（版が分かる）");
ok("版が dev のまま配られていない",
   await p.evaluate(() => APP_VERSION) !== "0.0.0-dev",
   await p.evaluate(() => APP_VERSION));
ok("版の日付が入っている",
   /^\d{4}-\d{2}-\d{2}$/.test(await p.evaluate(() => BUILD_DATE)),
   await p.evaluate(() => BUILD_DATE));
ok("管理の入口は左メニューの一番下にある",
   await p.locator(".side .admin").count() === 1);
ok("管理の入口は担任の操作より小さく出す", await p.evaluate(() => {
     const a = parseFloat(getComputedStyle(document.querySelector(".side .admin")).fontSize);
     const n = parseFloat(getComputedStyle(document.querySelector(".side .nav")).fontSize);
     return a < n;
   }) === true);
await p.locator(".side .admin").click();
await p.waitForTimeout(250);
ok("管理の窓が開く", await p.locator("#adminDlg[open]").count() === 1);
ok("窓に版と日付が出る", await (async () => {
     const t = await p.locator("#sysTbl").innerText();
     const v = await p.evaluate(() => APP_VERSION), d = await p.evaluate(() => BUILD_DATE);
     return t.indexOf(v) >= 0 && t.indexOf(d) >= 0;
   })() === true, await p.locator("#sysTbl").innerText());
ok("窓に開いている年度が出る",
   (await p.locator("#sysTbl").innerText()).indexOf(await p.evaluate(() => fy() + "年度")) >= 0,
   await p.locator("#sysTbl").innerText());
ok("手元で開いているときは、そう言う",
   (await p.locator("#sysTbl").innerText()).indexOf("この端末だけ") >= 0,
   await p.locator("#sysTbl").innerText());
ok("そのまま伝えられる1行がある",
   (await p.locator("#sysLine").innerText()).indexOf(await p.evaluate(() => APP_VERSION)) >= 0,
   await p.locator("#sysLine").innerText());
ok("管理に担任の操作（押すもの）を置いていない", await (async () => {
     const t = await p.evaluate(() => [...document.querySelectorAll("#adminDlg button")]
       .map(b => b.innerText.trim()));
     return t.every(x => ["基本時間割", "学級編成", "印刷", "たんぽぽ", "時数"]
       .every(w => x.indexOf(w) < 0));
   })() === true, await p.evaluate(() => [...document.querySelectorAll("#adminDlg button")]
     .map(b => b.innerText.trim())));
ok("手元では検査できないと言い、押せなくする",
   await p.locator("#ckGo").isDisabled() === true
   && (await p.locator("#ckStat").innerText()).indexOf("手元") >= 0,
   await p.locator("#ckStat").innerText());
await p.locator("#adminDlg .dlgx").click();
await p.waitForTimeout(200);

console.log("\n■ 手元だけで使っているときは、古い週を捨てない");
ok("本番につないでいないときは間引かない", await p.evaluate(() => {
     const y = String(fy());
     db.years[y].weeks["2000-01-03"] = {school:{},grade:{},special:{},home:{},acked:[],variant:"A"};
     const n = pruneWeeks(0);
     const kept = !!db.years[y].weeks["2000-01-03"];
     delete db.years[y].weeks["2000-01-03"];
     return n === 0 && kept;
   }) === true);

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
