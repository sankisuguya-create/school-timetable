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
   await p.locator(".tile:not(.none):not(.sp)").count() === 20,
   await p.locator(".tile:not(.none):not(.sp)").count());
ok("5年に 5-4 がある", await p.locator(".tile[data-c='5-4']").count() === 1);
ok("6年に 6-4 がある", await p.locator(".tile[data-c='6-4']").count() === 1);
ok("4年に 4-4 は無い", await p.locator(".tile[data-c='4-4']").count() === 0);
ok("学年マスターが6つ＋全学年", await p.locator(".master").count() === 7,
   await p.locator(".master").count());
ok("専科が3つ", await p.locator(".tile.sp").count() === 3);

console.log("\n■ 週案をひらく");
await p.locator(".tile[data-c='3-3']").click();
await p.waitForTimeout(400);
ok("入口が閉じる", await p.locator("#gate").isHidden());
ok("紙が出る", await p.locator("#sheet .cell").count() === 50,
   await p.locator("#sheet .cell").count());
ok("時程に時刻が出る",
   (await p.locator("#sheet .lab .tm").first().innerText()).includes(":"));
const fit = await p.evaluate(() => db.settings.vz);
ok("紙が画面に合わせて拡大される", fit > 40 && fit <= 160, fit);

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
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);
ok("学年マスターに学年の予定が出る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p3'] .t").innerText()).trim() === "総合");
ok("担任が入れた分は出ない",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").innerText()).trim() === "");

console.log("\n■ 専科（同じデータをクラス名で見る）");
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile.sp[data-s='ongaku']").click(); await p.waitForTimeout(300);
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='2-1']").click(); await p.waitForTimeout(250);
ok("専科の週にはクラス名が出る",
   (await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").innerText()).trim() === "2-1",
   await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").innerText());
await p.locator(".pal[data-v='2-2']").click(); await p.waitForTimeout(250);
ok("行き先を変えると前のクラスから消える",
   await p.evaluate(() => !(week().special["2-1"] || {})["1|p2"]));
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(250);
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
await p.locator("#rsClose").click(); await p.waitForTimeout(250);

console.log("\n■ 時数のコピー");
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
const tsv = await p.evaluate(() => tallyTsv());
ok("5日 × 1日ぶんの行数 の矩形になる", tsv.split("\n").length === 50, tsv.split("\n").length);
ok("空のセルを含む（貼った先の形が揃う）", tsv.split("\n")[0].split("\t").length === 15,
   tsv.split("\n")[0].split("\t").length);

await p.emulateMedia({media:"print"});
await p.waitForTimeout(200);
ok("刷るとき、まわりの操作は消える", await p.locator(".side").isHidden());
ok("刷るとき、層の印は消える", await p.locator("#sheet .tag").first().isHidden());
ok("刷るとき、時刻は出さない（版面を動かさない）",
   await p.locator("#sheet .lab .tm").first().isHidden());
ok("刷るとき、選んでいる印も消える",
   await p.evaluate(() => {
     const e = document.querySelector("#sheet .cell.sel");
     return !e || getComputedStyle(e).boxShadow === "none";
   }));

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
