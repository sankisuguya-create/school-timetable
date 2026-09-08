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
  await p.locator("#abA").click(); await p.waitForTimeout(200);
  return v === "B";
})() === true);

console.log("\n■ 手の届くところ");
ok("「週案」の右にグリッドメニューのボタンがある",
   await p.locator(".side h2 #gridBtn").count() === 1);
ok("「時間割の入力」の右に保存がある",
   await p.locator(".phead .pbtns #saveBtn").count() === 1);
ok("その隣にロックがある",
   await p.locator(".phead .pbtns #lockBtn").count() === 1);
ok("手元では送るものが無いので「保存ずみ」",
   (await p.locator("#saveTxt").innerText()).indexOf("ずみ") >= 0,
   await p.locator("#saveTxt").innerText());

console.log("\n■ 週案をひらく");
await p.locator(".tile[data-c='3-3']").click();
await p.waitForTimeout(400);
ok("入口が閉じる", await p.locator("#gate").isHidden());
ok("紙が出る（11行×5日）", await p.locator("#sheet .cell").count() === 55,
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
   await p.locator("#sheet .cell[data-s='after'] .n").count() === 5
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
await p.locator("#rsClose").click(); await p.waitForTimeout(250);

console.log("\n■ 上書きの警告（書く側）");
/* 学年マスターで 3年 の木3校時に「学年体育」を入れる。
   3-3 には担任の「総合」が入っているので、聞かれるはず */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='kokugo']").click(); await p.waitForTimeout(250);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
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
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
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
       tpSlots().every(s => tanpopoCell(i, c, s).fill !== "none"));
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
await p.locator("#baseClose").click(); await p.waitForTimeout(250);

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
