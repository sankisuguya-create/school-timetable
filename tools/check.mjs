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

console.log("\n■ 上書きの警告（書く側）");
/* 学年マスターで 3年 の木3校時に「学年体育」を入れる。
   3-3 には担任の「総合」が入っているので、聞かれるはず */
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='kokugo']").click(); await p.waitForTimeout(250);
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);

let asked = null, answer = true;
const onDialog = async d => { asked = d.message(); await (answer ? d.accept() : d.dismiss()); };
p.on("dialog", onDialog);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='taiiku']").click(); await p.waitForTimeout(300);
ok("別の人の予定を潰すときは聞く", typeof asked === "string" && asked.length > 0, asked);
ok("どのクラスの何を何に変えるかを言う",
   !!asked && asked.indexOf("3-3") >= 0 && asked.indexOf("国語") >= 0
   && asked.indexOf("体育") >= 0, asked);
ok("«はい»なら入る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim() === "体育");

asked = null;
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click(); await p.waitForTimeout(250);
ok("同じコマでは聞き直さない", asked === null, asked);

/* 誰の予定も潰さないコマでは聞かない */
asked = null;
await p.locator("#sheet .cell[data-d='0'][data-s='p6'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sogo']").click(); await p.waitForTimeout(250);
ok("誰の予定も潰さないときは聞かない", asked === null, asked);

/* «いいえ»なら入らない */
answer = false; asked = null;
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(300);
const beforeCancel = (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim();
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='katei']").click(); await p.waitForTimeout(300);
ok("«いいえ»なら入らない",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()).trim() === beforeCancel,
   [beforeCancel, await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").innerText()]);
p.off("dialog", onDialog);
answer = true;

console.log("\n■ 上書きされた側への知らせ");
/* 3-3 の担任が入れた「国語」は、学年の「体育」に上書きされている */
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(500);
ok("開いたときに知らせが出る", await p.locator("#owDlg").evaluate(d => d.open) === true);
const owText = await p.locator("#owList").innerText();
ok("いつ・何が・何に上書きされたかを言う",
   /\d+\/\d+\(.\)\s*\S+校時/.test(owText)
   && owText.indexOf("国語") >= 0 && owText.indexOf("→") > 0
   && owText.indexOf("上書きされました") > 0, owText);
ok("誰が入れたかも言う", owText.indexOf("学年") >= 0, owText);
await p.locator("#owDlg .btn").click(); await p.waitForTimeout(300);
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(500);
ok("同じ上書きについては二度出ない",
   await p.locator("#owDlg").evaluate(d => d.open) === false);

console.log("\n■ たんぽぽ（交流級を選ぶところから出す）");
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(250);
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
ok("選ぶまでは出せない", await p.locator("#tpGo").isDisabled() === true);
ok("まだ選んでいないと言う",
   (await p.locator("#tpWarn").innerText()).indexOf("選んでいません") >= 0,
   await p.locator("#tpWarn").innerText());

/* 3-3 は担任が書いた週。1-1 は基本時間割のまま。3-1 は学年の予定だけ。 */
await p.locator("#tpSel .tpchip[data-c='3-3']").click(); await p.waitForTimeout(200);
ok("予定が入っているクラスだけなら知らせは出ない",
   (await p.locator("#tpWarn").innerText()).indexOf("基本時間割のまま") < 0,
   await p.locator("#tpWarn").innerText());
await p.locator("#tpSel .tpchip[data-c='1-1']").click(); await p.waitForTimeout(200);
await p.locator("#tpSel .tpchip[data-c='3-1']").click(); await p.waitForTimeout(200);
const tpWarn = await p.locator("#tpWarn").innerText();
ok("基本時間割から動いていないクラスを知らせる",
   tpWarn.indexOf("1-1") >= 0 && tpWarn.indexOf("基本時間割のまま") >= 0, tpWarn);
ok("上位の予定しか入っていないクラスも知らせる",
   tpWarn.indexOf("3-1") >= 0 && tpWarn.indexOf("担任は未着手") >= 0, tpWarn);
ok("選んだ数を出す",
   (await p.locator("#tpCount").innerText()).indexOf("3 クラス") >= 0,
   await p.locator("#tpCount").innerText());
ok("選んだクラスは入口にも出る",
   await p.evaluate(() => tpChosen().length) === 3,
   await p.evaluate(() => tpChosen()));

/* 出す。**たんぽぽ側の直しが消えること**を先に言ってから開く。 */
let tpAsked = null;
const onTpDialog = async d => { tpAsked = d.message(); await d.accept(); };
p.on("dialog", onTpDialog);
await p.locator("#tpGo").click(); await p.waitForTimeout(500);
p.off("dialog", onTpDialog);
ok("出す前に聞く", typeof tpAsked === "string" && tpAsked.length > 0, tpAsked);
ok("どの交流級を出すかを言う", !!tpAsked && tpAsked.indexOf("3-3") >= 0, tpAsked);
ok("基本時間割のままのクラスも言う", !!tpAsked && tpAsked.indexOf("1-1") >= 0, tpAsked);
ok("たんぽぽ側の直しが消えることを言う",
   !!tpAsked && tpAsked.indexOf("消えます") >= 0, tpAsked);

ok("プレビューが開く", await p.locator("#tpDlg").evaluate(d => d.open) === true);
ok("実物の列構成で出る（34列＋見出し）",
   await p.locator("#tpGrid table tr").count() === 35,
   await p.locator("#tpGrid table tr").count());
const tpText = await p.locator("#tpGrid").innerText();
const sum = await p.locator("#tpSum").innerText();
ok("1コマがタイトルと担当者・場所の2つで出る",
   await p.locator("#tpGrid td b, #tpGrid td i").count() > 0
   && await p.locator("#tpGrid td u").count() > 0);
ok("入れたコマは灰色（#DCDCDC）",
   await p.evaluate(() => {
     const e = document.querySelector("#tpGrid td.f-imported");
     return e ? getComputedStyle(e).backgroundColor : "";
   }) === "rgb(220, 220, 220)",
   await p.evaluate(() => {
     const e = document.querySelector("#tpGrid td.f-imported");
     return e ? getComputedStyle(e).backgroundColor : "無し";
   }));
ok("担当者・場所が「た」で始まるコマは白",
   await p.evaluate(() => {
     const e = document.querySelector("#tpGrid td.f-own");
     return e ? getComputedStyle(e).backgroundColor : "";
   }) === "rgb(255, 255, 255)");
ok("選んだ交流級の列は、空のコマも含めて全部入れる",
   await p.evaluate(() => {
     const cols = TANPOPO_COLS.map((c, i) => [i, c])
       .filter(([, c]) => !c.staff && c.cls === "3-3");
     return cols.length > 0 && cols.every(([i, c]) =>
       TANPOPO_SLOTS.every(s => tanpopoCell(i, c, s).fill !== "none"));
   }) === true);
ok("選んでいない交流級の列には書かない", tpText.indexOf("選んでいない交流級") >= 0);
ok("支援員の列には書かない", tpText.indexOf("支援員の列") >= 0);
ok("支援員の列そのものは8列",
   (await p.locator("#tpGrid tr.staff").count()) === 8,
   await p.locator("#tpGrid tr.staff").count());
/* 編成に 4-4 を足したあとなので、4-4 の列も「編成に無い」ではなくなっている */
ok("編成に足したクラスの列は「編成に無い」と出なくなる",
   tpText.indexOf("編成に無いクラス") < 0, tpText.slice(0, 200));
ok("入れる（灰）・入れる（白）・書かない の数を出す",
   /入れる（灰）\s*\d+/.test(sum) && /白）\s*\d+/.test(sum) && /書かない\s*\d+/.test(sum), sum);
await p.locator("#tpDays button").nth(2).click(); await p.waitForTimeout(250);
ok("曜日を変えると中身が変わる",
   (await p.locator("#tpGrid").innerText()) !== tpText);
await p.locator("[data-close='tpDlg']").click(); await p.waitForTimeout(200);

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
