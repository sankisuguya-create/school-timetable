/* ブラウザで実際に動かして確かめる。
     node tools/check.mjs
   Chromium は環境が持っているものを使う（PLAYWRIGHT_CHROMIUM で場所を指定できる）。*/
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import {schoolWeek} from './test-clock.mjs';

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
await schoolWeek(p);
/* 通常の検査中は初回案内を重ねない。案内自体は末尾で明示的に検査する。 */
await p.addInitScript(() => {
  try{ localStorage.setItem("school-timetable/guide-v2", "done"); }catch(_){}
});
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
/* **枠は6つ。** 同じ教科を学年で分けて持つ形がある
   （図工1・2年／図工3〜6年、理科3・4年／理科5・6年） */
ok("専科の枠が6つ（同じ教科が2枠あってよい）",
   await p.locator(".tile.sp").count() === 6,
   await p.evaluate(() => specials().map(s => spLabel(s))));
ok("古い形の端末キャッシュでも、初回から入口を描ける", await p.evaluate(() => {
  const yr = Y(), keep = {classes:clone(yr.classes), specials:clone(yr.specials),
                          tanpopo:clone(yr.tanpopo)};
  yr.classes = ["1-1", "2-1"];
  yr.specials = ["音楽"];
  yr.tanpopo = {"1":"1-1"};
  try{
    drawGate();
    return document.querySelectorAll("#grid .tile.cls").length === 2
      && $("weekLabel").textContent.length > 0 && $("gClose").hidden;
  }finally{
    yr.classes = keep.classes; yr.specials = keep.specials; yr.tanpopo = keep.tanpopo;
    drawGate();
  }
}) === true);

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
/* 見出しの「週案」と、その右のグリッド（入口へ飛ぶ口）は外した。
   **字だけの見出しは何も決めない**し、入口へ行く口はすぐ下の
   「ほかの週案を開く」と同じもので、同じ場所に2つあった。

   専用の帯（#centerTabs）もやめた。**「週案を出す」の並びと中身が同じで、
   押す場所が2つに分かれていた。** いまはこの並びが現在地も言う
   （→ data-center・aria-current。「ほかの週案を開く」と同じ仕組み） */
ok("左メニューの「週案を出す」に、面を切り替える4つが並ぶ",
   await p.locator(".side .nav[data-center]").count() === 4);
ok("かたちを入れ替える専用の帯は無い（左メニューに一本化した）",
   await p.locator("#centerTabs").count() === 0);
ok("入口へ行く口は1つだけ",
   await p.locator('[data-act="gate"]').count() === 1);
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
/* 時刻（8:45〜9:30）は出さない方針にした。教務必携そのものに刷ってあり、
   同じ情報が2か所に並んでいた。空いた高さは校時の数字（.lab .no）へ回した */
ok("時程に時刻は出さない（教務必携に刷ってある）",
   await p.locator("#sheet .lab .tm").count() === 0);
ok("空いたぶん、校時の数字を大きくしてある（14pt 超）", await p.evaluate(() => {
     const cs = getComputedStyle(document.querySelector("#sheet .lab .no"));
     return parseFloat(cs.fontSize);
   }) > 18 /* 17pt×--k、画面では --k が1を超えることが多いのでpxで緩めに見る */,
   await p.evaluate(() => getComputedStyle(document.querySelector("#sheet .lab .no")).fontSize));
const fit = await p.evaluate(() => db.settings.vz);
ok("紙が画面に合わせて拡大される", fit > 40 && fit <= 160, fit);

ok("「ほかの週案を開く」で入口へ戻れる", await (async () => {
  await p.locator('.nav[data-act="gate"]').click(); await p.waitForTimeout(250);
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
  /* URL は専用の窓で聞く（ブラウザの prompt は使わない。docs/spec.md 7節） */
  await p.locator("#pAddLink").click();
  await p.waitForTimeout(150);
  await p.locator("#linkUrl").fill(url);
  await p.locator("#linkGo").click();
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

/* **入れる先の欄は外した。** 開いたものが、そのまま入る先。
   別にもう1か所で選べると、開いているものと食い違い、
   学級を開いたまま全校へ広がることが起きていた */
console.log("\n■ 入れる先は、開いた面が決める");
ok("学級の面に「入れる先」の欄は無い",
   await p.evaluate(() => !document.getElementById("pScopeWrap")));
await p.locator("#sheet .cell[data-d='3'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
await p.locator(".pal[data-v='sogo']").click();
await p.waitForTimeout(250);
ok("学級の面で入れると、その学級に入る",
   await p.evaluate(() => !!(week().home["3-3"] || {})["3|p3"]));
ok("学年マスターには入らない",
   await p.evaluate(() => !(week().grade["3"] || {})["3|p3"]));

console.log("\n■ 層（マスターはその層のものだけ出す）");
/* **学年の層に置いてから見る。** 担任の面から学年へ広げる口は無くなった
   （入れる先の欄を外した）ので、この節は自分で学年の棚へ置く */
await p.evaluate(() => {
  const w = week();
  (w.grade["3"] || (w.grade["3"] = {}))["3|p3"] =
    /* **自分が入れたことにする。** ほかの人の名前にすると、3-3 を開いたとき
       「あなたの予定が上書きされています」の窓が出て、そのあとの節で
       紙の上を押せなくなる（窓が手前に乗る） */
    {title:"総合", note:"", subject:"sogo", at:Date.now(), by:myEmail()};
  save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);
await p.evaluate(() => { for(const d of document.querySelectorAll("dialog[open]")) d.close(); });
ok("学年マスターに学年の予定が出る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p3'] .t").innerText()).trim() === "総合");
ok("担任が入れた分は出ない",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").innerText()).trim() === "");

console.log("\n■ 専科（同じデータをクラス名で見る）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile.sp[data-s='ongaku']").click(); await p.waitForTimeout(300);
/* **開いたときの知らせを閉じてから触る。** 面を開くと「上書きされています」の
   窓が出ることがあり、出ていると紙の上を押せない（窓が手前に乗る） */
await p.evaluate(() => { for(const d of document.querySelectorAll("dialog[open]")) d.close(); });
await p.waitForTimeout(150);
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
await p.locator("[data-act='settings']").click();
await p.locator('#setRoster').click(); await p.waitForTimeout(250);
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
/* 面を開いたときに出る知らせ（上書き・重なり）は、先に閉じてから触る。
   出ていると紙の上を押せない（窓が手前に乗る） */
const shutDlgs = async () => { await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog[open]")) d.close(); });
  await p.waitForTimeout(120); };
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(300);
await shutDlgs();
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='kokugo']").click(); await p.waitForTimeout(250);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(300);
await shutDlgs();

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
/* **落としたクラスが入っていないこと**を見る。空になるとは限らない ──
   そのコマは基本時間割で別のクラス（6-4 など）に当たっていることがある */
ok("「変更しない」なら入らない", await p.evaluate(() => {
     const c = ownCell(1, "p2");
     return c.layer === "base" || plain(c.title).indexOf("2-1") < 0;
   }) === true, await p.evaluate(() => ownCell(1, "p2")));
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
   前はパネルに文で出していた（#pWho）。読まれず、コマを選び直すたびに
   同じ情報を2度読むことになるので外した ── いまは紙の左端の札（.src）が、
   降りてきたコマにだけ層を言う（→ compose.js srcLabel）。データそのものは
   変わっていないので、ここでは cellFor と紙の札の両方で確かめる。 */
await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .t").click(); await p.waitForTimeout(200);
ok("いま入っているものの層はデータに残る（学年）",
   await p.evaluate(() => cellFor(3, "p4").layer) === "grade",
   await p.evaluate(() => cellFor(3, "p4").layer));
ok("紙の左端の札にも層が出る",
   (await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .src").innerText()).indexOf("年") >= 0,
   await p.locator("#sheet .cell[data-d='3'][data-s='p4'] .src").innerText());
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
   await p.locator("[data-act='outweek']").isHidden() === true
   && await p.locator("[data-act='tally']").isHidden() === true);
/* **組分けは面に置かない。** 直すのは年度の初めと転入・転出のときだけなので、
   毎週の面に置くと、出しに来た人が毎回20クラスを越えないと組に手が届かない */
ok("面に交流級の並びは出さない", await p.locator("#tpSel .tpchip").count() === 0,
   await p.locator("#tpSel .tpchip").count());
ok("面から組分けの窓を開ける", await p.locator("#tpGrpOpen").count() === 1);
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
ok("面の組は読むだけ（×を出さない）",
   await p.locator("#tpSel button.tpin").count() === 0);
ok("偶数の組は地の色で分ける",
   await p.locator("#tpSel .tpgrp.even").count() === 2,
   await p.locator("#tpSel .tpgrp.even").count());
ok("偶数の組は色だけに頼らない（太い縦線も引く）", await p.evaluate(() => {
     const e = document.querySelector("#tpSel .tpgrp.even .tpghead");
     return parseFloat(getComputedStyle(e).borderLeftWidth) >= 4;
   }) === true);

/* ここから組分けの窓。**設定の「たんぽぽ組分け」と同じ窓** */
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(250);
ok("組分けの窓が開く", await p.locator("#tpGrpDlg").evaluate(d => d.open) === true);
ok("交流級はすべての学級から選べる",
   await p.locator("#tpGrpBody .tpchip").count()
     === await p.evaluate(() => allClasses().length),
   await p.locator("#tpGrpBody .tpchip").count());
ok("空の組は、入れ方を字で言う",
   (await p.locator("#tpGrpBody .tpgrp").first().innerText()).indexOf("引っぱって") >= 0,
   await p.locator("#tpGrpBody .tpgrp").first().innerText());
ok("設定からも同じ窓が開く", await p.evaluate(() => {
     $("tpGrpDlg").close();
     openSettings();
     $("setTanpopo").click();
     return $("tpGrpDlg").open && !$("settingsDlg").open;
   }) === true);

/* 3-3 は担任が書いた週。1-1 は基本時間割のまま。3-1 は学年の予定だけ。
   引っぱれない端末のために、押しても「いま選んでいる組」へ入る。 */
await p.locator("#tpGrpBody .tpchip[data-c='3-3']").click(); await p.waitForTimeout(200);
ok("押すと1組へ入る", await p.evaluate(() => tpIn("1")).then
   ? true : (await p.evaluate(() => tpIn("1"))).indexOf("3-3") >= 0,
   await p.evaluate(() => tpIn("1")));
await p.locator("#tpGrpBody .tpchip[data-c='1-1']").click(); await p.waitForTimeout(200);
await p.locator("#tpGrpBody .tpchip[data-c='3-1']").click(); await p.waitForTimeout(200);
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
await p.locator("#tpGrpBody .tpchip[data-c='3-3']").click(); await p.waitForTimeout(200);
ok("同じ組へ2回入れると2人になる", await p.evaluate(() => tpCount("3-3")) === 2,
   await p.evaluate(() => tpCount("3-3")));
ok("組の中はクラス順に並ぶ",
   JSON.stringify(await p.evaluate(() => tpIn("1"))) === JSON.stringify(["1-1","3-1","3-3","3-3"]),
   await p.evaluate(() => tpIn("1")));
ok("チップにどの組かを字で出す",
   (await p.locator("#tpGrpBody .tpchip[data-c='3-3']").innerText()).indexOf("1組") >= 0,
   await p.locator("#tpGrpBody .tpchip[data-c='3-3']").innerText());
ok("組の中の1人を押すと外れる", await (async () => {
     await p.locator("#tpGrpBody .tpin[data-g='1'][data-i='3']").click();
     await p.waitForTimeout(200);
     return await p.evaluate(() => tpCount("3-3")) === 1;
   })() === true, await p.evaluate(() => tpIn("1")));

/* **出す列の並びは たんぽぽ1組 → 2組 …。** 組の中はクラス順 */
await p.locator("#tpGrpBody .tpghead[data-g='2']").click(); await p.waitForTimeout(150);
await p.locator("#tpGrpBody .tpchip[data-c='1-1']").click(); await p.waitForTimeout(200);
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
     return await p.locator("#tpGrpBody .tpgrp").count() === 5;
   })() === true);
/* 足した組は空のままにして、あとの検査に響かせない */
await p.locator("#tpGrpBody .tpghead[data-g='1']").click(); await p.waitForTimeout(150);
await p.locator("#tpGrpBody .tpin[data-g='2'][data-i='0']").click(); await p.waitForTimeout(200);

/* 組分けを終えたら窓を閉じる。**出すのは面から。** */
await p.locator("#tpGrpDlg").evaluate(d => d.close()); await p.waitForTimeout(200);
ok("窓を閉じると、面の組にも入っている",
   await p.locator("#tpSel .tpin").count() === 3,
   await p.locator("#tpSel .tpin").count());
/* **ロックは出すことを止めない。** 守るのは出す先と組分け */
await p.evaluate(() => setLock(true)); await p.waitForTimeout(150);
ok("ロック中でも出せる", await p.locator("#tpGo").isDisabled() === false);
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(200);
ok("ロック中は組分けを開かない",
   await p.locator("#tpGrpDlg").evaluate(d => d.open) === false);
await p.evaluate(() => setLock(false)); await p.waitForTimeout(150);

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
/* **出すボタンは見出しの右。** 下に置いていたころは、組を並べ終えてから
   目で探しに行っていた。この面でいちばん大きく動く操作なので、上に出す */
ok("出すボタンは、見出しの右にある", await p.evaluate(() => {
     const h = document.querySelector(".tphead h2");
     return !!h && h.contains(document.getElementById("tpGo"));
   }) === true);
ok("下の欄には、押すものを置かない",
   await p.locator("#tpView .tpact .btn").count() === 0,
   await p.locator("#tpView .tpact .btn").count());

/* 手元では書き込まない。**書かないことを画面に出す** */
await p.locator("#tpGo").click(); await p.waitForTimeout(300);
await p.locator("#tpYes").click(); await p.waitForTimeout(400);
ok("手元では書き込まないと言う",
   (await p.locator("#tpWarn").innerText()).indexOf("書き込まない") >= 0,
   await p.locator("#tpWarn").innerText());

console.log("\n■ 組分けの窓は、組が左・交流級が右");
await p.evaluate(() => openTpGroupDlg()); await p.waitForTimeout(250);
ok("左が たんぽぽの組", await p.evaluate(() => {
     const to = document.querySelector("#tpGrpBody .tpto").getBoundingClientRect();
     const from = document.querySelector("#tpGrpBody .tpfrom").getBoundingClientRect();
     return to.left < from.left;
   }) === true);
ok("組と交流級の上端がそろっている", await p.evaluate(() => {
     const to = document.querySelector("#tpGrpBody .tpto").getBoundingClientRect();
     const from = document.querySelector("#tpGrpBody .tpfrom").getBoundingClientRect();
     return Math.abs(to.top - from.top) < 2;
   }) === true);
await p.evaluate(() => $("tpGrpDlg").close()); await p.waitForTimeout(200);
/* 説明は ？ に寄せた。**畳んだ説明を毎回たどらせない。**
   ほかの面の「？」と同じ押し方にそろえる */
ok("説明は ？ から読める", await (async () => {
     await p.locator(".tphead .helpq").click(); await p.waitForTimeout(250);
     const open = await p.locator("#helpDlg").evaluate(d => d.open);
     const txt = await p.locator("#helpBody").innerText();
     await p.locator("#helpDlg .dlgx").click(); await p.waitForTimeout(200);
     return open && txt.indexOf("たんぽぽ") >= 0;
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
await p.locator("[data-act='settings']").click(); await p.waitForTimeout(150);
await p.locator("#setBase").click(); await p.waitForTimeout(250);
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
/* **専用の窓で聞く**（ブラウザの confirm は使わない。docs/spec.md 7節） */
let impNative = false;
const onImpDialog = async d => { impNative = true; await d.accept(); };
p.on("dialog", onImpDialog);
await p.locator("#impGo").click(); await p.waitForTimeout(300);
const impAsked = await p.evaluate(() => $("okDlg").open
  ? {ttl:$("okTtl").textContent, body:$("okBody").textContent,
     go:$("okYes").textContent, focus:document.activeElement && document.activeElement.id}
  : null);
ok("入れる前に聞く", !!impAsked && impAsked.ttl.indexOf("入れ替え") >= 0, impAsked);
ok("ブラウザの confirm を使わない", impNative === false);
ok("既定は「やめる」側にある", !!impAsked && impAsked.focus === "okNo", impAsked);
ok("いまの基本時間割が消えることを言う",
   !!impAsked && impAsked.body.indexOf("消えます") >= 0, impAsked);
ok("進む側のボタンに、何が起きるかを書く",
   !!impAsked && impAsked.go === "入れ替える", impAsked);
await p.locator("#okYes").click(); await p.waitForTimeout(400);
p.off("dialog", onImpDialog);
ok("入れると基本時間割になる",
   await p.evaluate(() => (Y().base["3-1"].B["3|p3"] || {}).title) === "音楽",
   await p.evaluate(() => Y().base["3-1"].B["3|p3"]));
ok("入れたら窓は閉じる", await p.locator("#impDlg").evaluate(d => d.open) === false);
await p.locator("#baseDlg .dlgx").click(); await p.waitForTimeout(250);

console.log("\n■ 学年・全学年には「リセット」を出す");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(400);
ok("担任の画面には出さない（自分のクラスに「上位からのぶんを消す」概念が無い）",
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
ok("刷るときも、時程の列は同じ幅（時刻を出していた頃だけ画面と刷るときで幅が違った）",
   await p.evaluate(() => getComputedStyle($("sheet")).getPropertyValue("--labw").trim()) === "10mm",
   await p.evaluate(() => getComputedStyle($("sheet")).getPropertyValue("--labw")));
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
/* **入れる口は右メニューにある。** 紙の上には印（特・休）だけを残す */
ok("担任の画面には、日の形の欄を出さない",
   await p.locator("#dayWrap").evaluate(e => e.hidden) === true);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.all").click(); await p.waitForTimeout(400);
/* **畳んである**（週に0〜1回しか直さない）。押す前に開く */
ok("畳んだままでも、ふつうでない日があるかは見える",
   await p.evaluate(() => $("dayPeek").textContent.length > 0) === true,
   await p.evaluate(() => $("dayPeek").textContent));
await p.evaluate(() => { $("dayFold").open = true; });
await p.waitForTimeout(200);
ok("全学年の面では、右メニューに6日ぶん並ぶ",
   await p.locator("#dayRow .dayb").count() === 6,
   await p.locator("#dayRow .dayb").count());
ok("紙の日付の見出しには、押す口を置かない",
   await p.locator("#sheet .hd.pick, #sheet .hd .pk").count() === 0);
await p.locator("#dayRow .dayb").nth(1).click(); await p.waitForTimeout(250);
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
/* **画面の倍率を外して測る。** 紙は .paper の zoom で画面に合わせて
   拡大してあり、getBoundingClientRect はその拡大後の大きさを返す。
   割らずに mm と見なすと、画面が広いだけで「B5 に入らない」と出る。 */
const sheetMM = () => p.evaluate(() => {
  const z = parseFloat(getComputedStyle(document.querySelector(".paper")).zoom) || 1;
  return document.querySelector("#sheet").getBoundingClientRect().height / z / (96/25.4);
});
ok("紙の高さは変わらない（B5 に収まる）",
   (await sheetMM()) <= 257 - 16 + 0.5,
   Math.round((await sheetMM()) * 10) / 10);
ok("詰めたぶんは放課後が受け取る（その日の放課後が広い）",
   await p.evaluate(() => {
     const h = s => document.querySelector(s).getBoundingClientRect().height;
     return h("#sheet .cell[data-d='1'][data-s='after']") > h("#sheet .cell[data-d='0'][data-s='after']") + 5;
   }) === true);

console.log("\n■ 休み：1〜6に1本の斜め線");
await p.locator("#dayRow .dayb").nth(3).click(); await p.waitForTimeout(250);
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
     await p.locator("#dayRow .dayb").nth(3).click(); await p.waitForTimeout(250);
     await p.locator("#dayForms .dayform[data-f='']").click(); await p.waitForTimeout(350);
     return await p.locator("#sheet .daycol[data-d='3'] .dayoff").count() === 0
         && await p.locator("#sheet .hd[data-d='3'] .mark").count() === 0;
   })() === true);
/* 片づける */
await p.locator("#dayRow .dayb").nth(1).click(); await p.waitForTimeout(250);
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
/* **押す口は、押す口が並ぶ場所に置く。** 紙の上に置いていたころは気づかれなかった */
ok("右メニューに日の形の欄が出る",
   await p.locator("#dayWrap").evaluate(e => e.hidden) === false);
ok("説明にも、どこから決めるかが書いてある",
   (await p.evaluate(() => viewWhere())).indexOf("日の形") >= 0,
   await p.evaluate(() => viewWhere()));
await p.locator("#dayRow .dayb").first().click(); await p.waitForTimeout(300);
await p.locator(".dayform[data-f='off']").click(); await p.waitForTimeout(400);
ok("休みにすると、斜め線が入る", await p.locator("#sheet .dayoff").count() === 1);
ok("休みの日の授業には書けない",
   await p.evaluate(() => writeCell(0, "p1", {title:"あ"})) === false);
ok("朝学習と放課後には書ける（休業日でも行事の準備が入る）",
   await p.evaluate(() => writeCell(0, "after", {note:"準備"})) !== false);
ok("休みにすると、右メニューの字も変わる",
   (await p.locator("#dayRow .dayb").first().innerText()).indexOf("休み") >= 0,
   await p.locator("#dayRow .dayb").first().innerText());
ok("紙には印（休）が残る　※刷って残る情報",
   (await p.locator("#sheet .hd[data-d='0'] .mark").innerText()).trim() === "休");
await p.locator("#dayRow .dayb").first().click(); await p.waitForTimeout(300);
await p.locator(".dayform[data-f='']").click(); await p.waitForTimeout(400);
ok("戻すと、斜め線は消える", await p.locator("#sheet .dayoff").count() === 0);

console.log("\n■ 紙の左右で週を繰る");
ok("紙の左右に2つ出る", await p.locator("#stage .wkarrow").count() === 2);
const wkWas = await p.locator("#weekLabel").innerText();
await p.locator("#wkNext").click(); await p.waitForTimeout(500);
const wkNext = await p.locator("#weekLabel").innerText();
ok("› で次の週へ動く", wkNext !== wkWas, {wkWas, wkNext});
await p.locator("#wkPrev").click(); await p.waitForTimeout(500);
ok("‹ で元の週へ戻る", await p.locator("#weekLabel").innerText() === wkWas);
/* **紙は痩せない。** 矢印が取る幅は autoFit が倍率に入れる */
ok("紙が枠からはみ出さない", await p.evaluate(() =>
     $("sheet").getBoundingClientRect().width <= $("stage").clientWidth + 1) === true);
ok("矢印が潰れていない", await p.evaluate(() =>
     [...document.querySelectorAll("#stage .wkarrow")].every(e => e.offsetWidth > 0)) === true);
/* **紙の外のもの。** 刷るときは出さない */
await p.emulateMedia({media:"print"}); await p.waitForTimeout(200);
ok("矢印は、紙には出さない", await p.evaluate(() =>
     [...document.querySelectorAll("#stage .wkarrow")]
       .every(x => getComputedStyle(x).display === "none")) === true);
await p.emulateMedia({media:"screen"}); await p.waitForTimeout(200);

console.log("\n■ たんぽぽ提出を覆すのは、渡る文字が変わったときだけ");
/* 規則そのものは gas/domaincheck.js が画面とサーバの両方に同じ表を通す。
   ここで見るのは**書き込みの道がその規則へ繋がっているか**（前の題名を渡しているか）。
   繋がっていないと、規則を直しても効かない。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
const tpHit = async (label, body) => await p.evaluate(fn => {
  const cls = view.cls, w = week();
  w.tpSub = {[cls]:{at:"T1", by:"x", dirty:false, exports:{}}};
  w.tpEdited = {};
  (new Function(fn))();
  return !!(w.tpSub[cls] || {}).dirty || !!(w.tpEdited || {})[cls];
}, body);
ok("覆る  : 教科名が変わった",
   await tpHit("t", "writeCell(0,'p1',{title:'算数',subject:'sansu'})") === true);
ok("覆らない: 同じ教科名で上書きした", await tpHit("t",
   "const w=week();w.home[view.cls]={[ck(0,'p2')]:{title:'国語',note:'',at:1,sat:1}};"
   + "writeCell(0,'p2',{title:'国語',subject:'kokugo'})") === false);
ok("覆らない: 備考だけ直した", await tpHit("t",
   "const w=week();w.home[view.cls]={[ck(0,'p3')]:{title:'体育',note:'',at:1,sat:1}};"
   + "writeCell(0,'p3',{note:'運動場'})") === false);
ok("覆らない: 放課後を直した",
   await tpHit("t", "writeCell(0,'after',{note:'部活'})") === false);
ok("覆らない: 朝学習を直した",
   await tpHit("t", "writeCell(0,'am2',{title:'読書'})") === false);
ok("覆らない: 土曜を直した",
   await tpHit("t", "writeCell(5,'p1',{title:'行事'})") === false);
ok("覆らない: 週メモを直した",
   await tpHit("t", "setMemo('持ち物')") === false);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.all").click(); await p.waitForTimeout(400);
ok("覆らない: 特別校時にした（全校の面）", await tpHit("t",
   "setDayForm(1,'special');setDayForm(1,'')") === false);
ok("覆る  : 休みにした（全校の面）", await tpHit("t",
   "setDayForm(2,'off');setDayForm(2,'')") === true);
await p.evaluate(() => { setDayForm(1,""); setDayForm(2,""); });

/* 仕込んだぶんを片づける。**あとの検査に響かせない**
   （残すと上書きの知らせが出たままになり、次の操作を塞ぐ） */
await p.evaluate(() => {
  const w = week();
  for(const cls of allClasses()) delete w.home[cls];
  for(const k of ["0|p1","0|p2","0|p3","0|after","0|am2","5|p1","0|memo"]) delete w.school[k];
  w.tpSub = {}; w.tpEdited = {}; w.acked = [];
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  buildSheet();
});
await p.waitForTimeout(150);

console.log("\n■ 出したあとに変わったら「未」ではなく「変」");
/* 「未」は「担任がまだ書き終えていない。待てばよい」。出したあとに変わったものは
   待っても直らない（出し直しが要る）ので、同じ印にしない */
const tpMark = await p.evaluate(() => {
  const TGT = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  tpTargets = [{name:"たんぽぽ", url:"https://docs.google.com/spreadsheets/d/" + TGT + "/edit", def:true}];
  const cls = allClasses()[0], w = week();
  const set = o => { w.tpSub = {[cls]:o}; return TP_ST[tpState(cls)].mark; };
  const out = {};
  w.tpSub = {}; out["① 何もしていない"] = TP_ST[tpState(cls)].mark;
  out["② 提出した"]         = set({at:"T1", dirty:false, exports:{}});
  out["③ 出力した"]         = set({at:"T1", dirty:false, exports:{[TGT]:"T1"}});
  out["④ そのあと直した"]   = set({at:"T1", dirty:true,  exports:{[TGT]:"T1"}});
  out["⑤ 再提出した"]       = set({at:"T2", dirty:false, exports:{[TGT]:"T1"}});
  out["⑥ もう一度出力した"] = set({at:"T2", dirty:false, exports:{[TGT]:"T2"}});
  out["提出→出力前に直した"] = set({at:"T1", dirty:true,  exports:{}});
  w.tpSub = {};
  return out;
});
for(const [k, want] of [["① 何もしていない","未"], ["② 提出した","済"], ["③ 出力した","済"],
                        ["④ そのあと直した","変"], ["⑤ 再提出した","変"],
                        ["⑥ もう一度出力した","済"], ["提出→出力前に直した","未"]])
  ok(k + " → " + want, tpMark[k] === want, tpMark[k]);
/* 出す先も元へ戻す（手元では1本も無いのがふだんの姿） */
await p.evaluate(() => { tpTargets = []; });

console.log("\n■ 新しいチップ（合同3つ・校外行事・授業なし）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='3-1']").click(); await p.waitForTimeout(400);
let chips = await p.evaluate(() => [...document.querySelectorAll("#pals .pal")].map(x => x.textContent));
/* **合同3つは複数学級でやるもの。** 担任の面に出すと、名前と実態がずれたまま
   自分の学級だけに入る。校外行事は学級だけの校外学習もあるので、どの面にも出す */
ok("担任の面に合同3つを出さない",
   !["合同体育","合同音楽","学年集会"].some(x => chips.includes(x)), chips);
ok("担任の面にも校外行事は出す", chips.includes("校外行事"), chips);
ok("担任の面にも授業なしは出す", chips.includes("授業なし"), chips);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-g='3']").click(); await p.waitForTimeout(450);
chips = await p.evaluate(() => [...document.querySelectorAll("#pals .pal")].map(x => x.textContent));
ok("学年の面には合同3つが出る",
   ["合同体育","合同音楽","学年集会"].every(x => chips.includes(x)), chips);
ok("学年の面にも校外行事が出る", chips.includes("校外行事"), chips);
ok("学年の面にも授業なしが出る", chips.includes("授業なし"), chips);

console.log("\n■ 校外行事（被覆）");
let tr = await p.evaluate(() => {
  applyPalette(0, "p1", "__trip"); applyPalette(0, "p2", "__trip"); applyPalette(0, "p3", "__trip");
  const col = document.querySelector('#sheet .daycol[data-d="0"]');
  const m = col.querySelector(".tripmark");
  const chip = m.querySelector("span");
  const cr = col.getBoundingClientRect(), sr = chip.getBoundingClientRect();
  const cs = getComputedStyle(chip);
  const gs = [...chip.querySelectorAll("i")].map(i => i.getBoundingClientRect().top);
  const cell = col.querySelector(".cell.trip");
  return {枚数: col.querySelectorAll(".tripmark").length,
          覆い: col.querySelectorAll(".cell.trip").length,
          字数: gs.length, 縦: gs.every((t, i) => i === 0 || t > gs[i - 1] + 5),
          右に寄る: (cr.right - sr.right) < cr.width * .12 && sr.left > cr.left + cr.width * .5,
          細い: sr.width < cr.width * .45,
          地: cs.backgroundColor, 枠: cs.borderTopStyle,
          字をよける: parseFloat(getComputedStyle(cell.querySelector(".t")).paddingRight)
                      >= sr.width,
          線: [...col.querySelectorAll(".cell.trip")]
                .map(c => getComputedStyle(c).borderBottomWidth).join(","),
          題名: (week().grade["3"] || {})[ck(0, "p1")] || null,
          持ち方: ((week().grade["3"] || {})[ck(0, "trip:p1")] || {}).title || ""};
});
/* **業間をまたいで1本になる。** 1〜3限が校外なら、そのあいだの業間も校外にいる。
   またがないと、業間のところでチップが切れて2本に見える */
ok("1〜3限は、業間をまたいで1本のチップになる", tr.枚数 === 1, tr);
ok("業間もまとまりに入る（4行）", tr.覆い === 4, tr);
/* **一日の右に寄せた、細い縦長のチップ。** 版面の大半は予定のために空ける */
ok("チップは一日の右に寄る", tr.右に寄る === true, tr);
ok("チップは細い（列幅の半分未満）", tr.細い === true, tr);
ok("チップに枠の線がある（地が飛んでも残る）", tr.枠 === "solid", tr.枠);
/* **半透明。下が読めるように。** 校外学習の日でも、その時間に何をするかは
   紙の上で読めないと困る（時数もその教科で数えている） */
ok("チップの地は半透明", /^rgba\(.*0?\.\d+\)$/.test(tr.地), tr.地);
ok("覆ったコマの字は、チップの手前で折り返す", tr.字をよける === true, tr);
/* **校時の横線は消さない。** 消すと、どの校時のことか紙から読めなくなる */
/* 太さの数値そのものは見ない。CSS は .6px 指定で、画面の拡大率によって
   ブラウザが 1px にも 1.03px にも丸める。**4本とも残っていること**を見る */
ok("校時の横線はそのまま残る",
   String(tr.線).split(",").length === 4
   && String(tr.線).split(",").every(x => parseFloat(x) > 0), tr.線);
/* **縦書きに頼らない。** writing-mode の縦組みは、字を送るのにフォント側の
   情報が要る。無い環境では4文字が同じ場所に重なった（実測 24×11px） */
ok("「校外学習」が1文字ずつ縦に並ぶ", tr.字数 === 4 && tr.縦 === true, tr);
ok("題名欄には入らない", tr.題名 === null, tr.題名);
ok("時程IDに trip: を使って、ふつうのコマとして持つ", tr.持ち方 === "校外学習", tr.持ち方);
ok("たんぽぽには「校外」で出る",
   await p.evaluate(() => tpTitle("3-1", 0, "p1")) === "校外");
ok("時数は題名の教科に準ずる（校外は時数を変えない）", await p.evaluate(() => {
     writeCell(0, "p1", {title:"社会", subject:"shakai"});
     const c = compose("3-1", 0, "p1");
     return c.subject === "shakai" && plain(c.title) === "社会";
   }) === true);

console.log("\n■ 休みの日にも置ける（自然学校）");
tr = await p.evaluate(() => {
  openView({kind:"school"});
  setDayForm(3, "off");
  applyPalette(3, "p1", "__trip"); applyPalette(3, "p2", "__trip");
  buildSheet();
  const col = document.querySelector('#sheet .daycol[data-d="3"]');
  return {斜め線: col.querySelectorAll(".dayoff").length,
          透かし: col.querySelectorAll(".tripmark").length,
          休み印: (document.querySelector('#sheet .hd[data-d="3"] .mark') || {}).textContent,
          書ける: writeCell(3, "p1", {title:"社会", subject:"shakai"}) !== false,
          たんぽぽ: tpTitle(allClasses()[0], 3, "p1")};
});
ok("校外が覆う日は、斜め線を引かない", tr.斜め線 === 0, tr);
ok("チップは出る", tr.透かし === 1, tr);
ok("見出しの「休」印は残る（日の形そのものは変わっていない）", tr.休み印 === "休", tr);
ok("授業コマに書ける（時数のために教科が要る）", tr.書ける === true, tr);
ok("たんぽぽにも「校外」を出す（休みで空にしない）", tr.たんぽぽ === "校外", tr);

console.log("\n■ 層をまたぐ被覆");
tr = await p.evaluate(() => {
  const cls = allClasses()[0];
  openView({kind:"class", cls});
  return {担任に出る: tripOn(cls, 3, "p1"),
          理由: setTrip(3, "p1", false),
          まだ在る: tripOn(cls, 3, "p1")};
});
ok("全学年が入れた校外は、担任の紙にも出る", tr.担任に出る === true, tr);
ok("担任は外せない。外す先を名指しする",
   tr.まだ在る === true && /全学年/.test(tr.理由), tr);

console.log("\n■ 校外行事の名前（行事ごと・右メニュー）");
let tn = await p.evaluate(() => {
  const cls = allClasses()[0];
  openView({kind:"class", cls});
  setTrip(2, "p1", true); setTrip(2, "p2", true);
  buildSheet();
  selectCell(2, "p1", cellAt(2, "p1"));
  const wrap = document.getElementById("pTripWrap");
  const nm = document.getElementById("pTripName"), tp = document.getElementById("pTripTp");
  const 既定 = {出る: !wrap.hidden, 紙: nm.value, たんぽぽ: tp.value};
  /* 提出ずみにしておく。**どちらの字で覆るか**を見る */
  week().tpSub[cls] = {at: Date.now() - 1000, dirty: false, exports: {}};
  setTripName(2, "p1", "自然学校", undefined);          /* 紙の字だけ直す */
  const 紙だけ = !!(tpSubmitInfo(cls) || {}).dirty;
  setTripName(2, "p1", undefined, "自然");              /* たんぽぽの字を直す */
  const たんぽぽも = !!(tpSubmitInfo(cls) || {}).dirty;
  buildSheet();
  selectCell(2, "p1", cellAt(2, "p1"));
  const col = document.querySelector('#sheet .daycol[data-d="2"]');
  return Object.assign(既定, {
    紙だけ, たんぽぽも,
    紙の字: [...col.querySelectorAll(".tripmark span i")].map(i => i.textContent).join(""),
    たんぽぽの字: tpTitle(cls, 2, "p1"),
    まとまりの端: tripName(2, "p2"),
    欄にも出る: document.getElementById("pTripName").value,
    持ち方: (() => { const e = (week().home[cls] || {})[ck(2, "trip:p2")] || {};
                     return {題名: plain(e.title), 詳細: plain(e.note)}; })()
  });
});
ok("覆っているコマを選ぶと、名前の欄が出る", tn.出る === true, tn);
ok("既定は「校外学習」「校外」", tn.紙 === "校外学習" && tn.たんぽぽ === "校外", tn);
ok("紙の字を直すと、チップの字が変わる", tn.紙の字 === "自然学校", tn.紙の字);
ok("たんぽぽの字を直すと、たんぽぽに出る字が変わる", tn.たんぽぽの字 === "自然", tn);
/* **1本のチップは同じ名前。** まとまりの全部のコマに同じ字を書く */
ok("続けて置いた1本ぶんに、同じ字が入る", tn.まとまりの端 === "自然学校", tn);
ok("欄にも、いまの字が出る", tn.欄にも出る === "自然学校", tn);
/* **題名＝紙の字／詳細＝たんぽぽの字。** シートに列を足さない */
ok("題名は紙の字、詳細はたんぽぽの字",
   tn.持ち方.題名 === "自然学校" && tn.持ち方.詳細 === "自然", tn.持ち方);
/* **たんぽぽへ渡る字で覆る。** 紙の字だけ直しても、たんぽぽ担当に渡るものは
   変わっていない。逆にすると、渡る字が変わったのに印が立たない */
ok("紙の字だけでは提出は覆らない", tn.紙だけ === false, tn);
ok("たんぽぽの字を直すと提出が覆る", tn.たんぽぽも === true, tn);

tn = await p.evaluate(() => {
  const cls = allClasses()[0];
  setTrip(2, "p3", true);                    /* あとから1コマ足す */
  const 引き継ぐ = tripName(2, "p3");
  /* 長い名前。**小さくして収める**（切らない） */
  setTripName(2, "p1", "6年生を送る会", undefined);
  buildSheet();
  const col = document.querySelector('#sheet .daycol[data-d="2"]');
  const gl = [...col.querySelectorAll(".tripmark span i")];
  const sp = col.querySelector(".tripmark span");
  const 字の高さ = gl.reduce((a, g) => a + g.getBoundingClientRect().height, 0);
  return {引き継ぐ, 字数: gl.length,
          小さい: parseFloat(getComputedStyle(gl[0]).fontSize),
          はみ出さない: 字の高さ <= sp.getBoundingClientRect().height + 1};
});
ok("あとから足したコマは、隣の名前を引き継ぐ", tn.引き継ぐ === "自然学校", tn);
ok("長い名前も全部出す（7文字）", tn.字数 === 7, tn);
ok("長い名前は小さくして、はみ出させない", tn.はみ出さない === true, tn);

/* **入れた層からしか直せない。** 外すのと同じ規則 */
tn = await p.evaluate(() => {
  const cls = allClasses()[0], g = gradeOf(cls);
  openView({kind:"grade", grade:String(g)});
  setTrip(4, "p1", true);
  setTripName(4, "p1", "社会見学", "見学");
  openView({kind:"class", cls});
  buildSheet();
  selectCell(4, "p1", cellAt(4, "p1"));
  return {担任にも出る: tripName(4, "p1"),
          直せない: document.getElementById("pTripName").disabled,
          理由: document.getElementById("pTripHint").textContent,
          弾く: setTripName(4, "p1", "遠足", undefined),
          そのまま: tripName(4, "p1")};
});
ok("学年が入れた行事の名前は、担任の紙にも出る", tn.担任にも出る === "社会見学", tn);
ok("担任は直せない（欄を止める）", tn.直せない === true, tn);
ok("どこから直すのかを名指しする", /年/.test(tn.理由), tn.理由);
ok("押しても変わらない", tn.そのまま === "社会見学" && /年/.test(tn.弾く), tn);

/* 仕込んだぶんを片づける。**あとの検査に響かせない** */
await p.evaluate(() => {
  openView({kind:"school"}); setDayForm(3, "");
  const w = week();
  w.school = {}; w.grade = {}; w.home = {}; w.tpSub = {}; w.tpEdited = {}; w.acked = [];
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  buildSheet();
});
await p.waitForTimeout(150);

console.log("\n■ 授業なし（コマ1つ）");
let nl = await p.evaluate(() => {
  const cls = allClasses()[0];
  openView({kind:"class", cls});
  db.settings.tally.classes = cls;          /* 時数の1行目をこの学級にする */
  writeCell(0, "p4", {title:"国語", subject:"kokugo"});
  writeCell(0, "p4", {note:"学年行事のため"});
  const t = db.settings.tally;
  const 前 = tallyGrid()[0][t.cols["p4"]];
  applyPalette(0, "p4", "__none");
  buildSheet();
  const cell = document.querySelector('#sheet .cell[data-d="0"][data-s="p4"]');
  const tt = cell.querySelector(".t"), sl = cell.querySelector(".noneslash");
  const cr = cell.getBoundingClientRect(), sr = sl ? sl.getBoundingClientRect() : null;
  return {題名: plain(compose(cls, 0, "p4").title),
          備考: plain(compose(cls, 0, "p4").note),
          斜め線: !!sl,
          図形で描く: !!(sl && sl.querySelector("svg line")),
          題名を消す: getComputedStyle(tt).visibility,
          備考の欄は残る: !!cell.querySelector(".n"),
          線は題名の欄だけ: sr ? sr.height < cr.height * .75 : null,
          たんぽぽ: tpTitle(cls, 0, "p4"),
          時数前: 前, 時数後: tallyGrid()[0][t.cols["p4"]],
          持ち方: (week().home[cls] || {})[ck(0, "p4")].title};
});
ok("題名が「授業なし」になる", nl.題名 === "授業なし", nl.題名);
ok("斜め線を引く", nl.斜め線 === true, nl);
ok("線は図形で描く（地の色はトナー節約の印刷機で消える）", nl.図形で描く === true, nl);
ok("題名の欄は消す", nl.題名を消す === "hidden", nl.題名を消す);
/* **備考は残す。**「学年行事のため」「自習」を書けないと、
   なぜ授業が無いのかが紙から読めない */
ok("備考の欄は残る", nl.備考の欄は残る === true, nl);
ok("備考の中身も残る", nl.備考 === "学年行事のため", nl.備考);
ok("斜め線は題名の欄だけ（備考にはかからない）", nl.線は題名の欄だけ === true, nl);
/* **時数は数えない。**「授業なし」に合う教科が無いので、自然にそうなる */
ok("時数に数えない（前は数えていた）", nl.時数前 === "国" && nl.時数後 === "", nl);
/* **たんぽぽには「なし」。空にしない** ── 空は「まだ書いていない」と
   見分けがつかず、たんぽぽ担当が催促に回る。児童の列は 50px なので2文字 */
ok("たんぽぽには「なし」で出る", nl.たんぽぽ === "なし", nl.たんぽぽ);
ok("ふつうのコマとして持つ（専用の入れ物を作らない）",
   nl.持ち方 === "授業なし", nl.持ち方);

nl = await p.evaluate(() => {
  const cls = allClasses()[0];
  applyPalette(0, "p4", "sansu");            /* 授業を入れようとする */
  const 弾いた = plain(compose(cls, 0, "p4").title);
  const 知らせ = document.getElementById("toast").textContent;
  applyPalette(0, "p4", "__none");           /* もう一度押して外す */
  buildSheet();
  const cell = document.querySelector('#sheet .cell[data-d="0"][data-s="p4"]');
  return {弾いた, 知らせ,
          外れた: plain(compose(cls, 0, "p4").title),
          備考は残る: plain(compose(cls, 0, "p4").note),
          斜め線: !!cell.querySelector(".noneslash"),
          また書ける: writeCell(0, "p4", {title:"算数", subject:"sansu"}) !== false};
});
ok("授業なしのコマには、授業を入れない", nl.弾いた === "授業なし", nl.弾いた);
ok("入らない理由を、その場で言う", /授業なし/.test(nl.知らせ), nl.知らせ);
ok("もう一度押すと外れる", nl.外れた === "" && nl.斜め線 === false, nl);
/* **外しても備考は消さない。** 打ち直させない */
ok("外しても備考は残る", nl.備考は残る === "学年行事のため", nl.備考は残る);
ok("外したあとは、また授業を入れられる", nl.また書ける === true, nl);

/* **学年から降ろせる。** 学年で1コマ潰れる日のほうが多い */
nl = await p.evaluate(() => {
  const cls = allClasses()[0], g = cls.split("-")[0];
  openView({kind:"grade", grade:g});
  applyPalette(1, "p5", "__none");
  openView({kind:"class", cls});
  buildSheet();
  const cell = document.querySelector('#sheet .cell[data-d="1"][data-s="p5"]');
  return {担任に出る: plain(compose(cls, 1, "p5").title),
          斜め線: !!cell.querySelector(".noneslash"),
          休みの日には入らない: (() => {
            openView({kind:"school"}); setDayForm(2, "off");
            const why = setNoLesson(2, "p1", true);
            setDayForm(2, "");
            return why;
          })(),
          授業のコマだけ: setNoLesson(0, "br", true)};
});
ok("学年で入れた授業なしは、担任の紙にも斜め線で出る",
   nl.担任に出る === "授業なし" && nl.斜め線 === true, nl);
ok("休みの日には入れない（1日ぶんは日の形のほう）",
   /休み/.test(nl.休みの日には入らない), nl.休みの日には入らない);
ok("休み時間には入れない（もともと授業が無い）",
   /授業のコマ/.test(nl.授業のコマだけ), nl.授業のコマだけ);

/* 仕込んだぶんを片づける */
await p.evaluate(() => {
  openView({kind:"school"});
  const w = week();
  w.school = {}; w.grade = {}; w.home = {}; w.tpSub = {}; w.tpEdited = {}; w.acked = [];
  db.settings.tally.classes = "3-1,3-2,3-3";
  /* **戻す控えも片づける。** 残すと、次の「戻すものが無ければ」が戻せてしまう */
  undoStack.length = 0; redoStack.length = 0;
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  buildSheet();
});
await p.waitForTimeout(150);

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

console.log("\n■ たんぽぽの面の見出し（出すボタン・出す週）");
await p.evaluate(() => { Y().tanpopo = {"1":["1-1","3-2"]};
                         week().tpSub = {}; save(); drawTanpopoView(); });
await p.waitForTimeout(300);
/* 説明は ？ に寄せる。畳んだ説明を毎回たどらせない */
ok("「この面ですること」の折りたたみは置かない",
   await p.locator(".tphead details").count() === 0);
ok("説明は ？ から読める", await p.locator(".tphead .helpq").count() === 1);
ok("？ とロックは重ならない", await p.evaluate(() => {
     const a = document.querySelector(".tphead .helpq").getBoundingClientRect();
     const b = document.getElementById("tpLockBtn").getBoundingClientRect();
     return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
   }) === true);
/* **出す週を、ボタンのとなりにもう一度出す。** 左メニューの週とは離れている */
ok("出す週を、ボタンのとなりに出す",
   /\d+\/\d+\s*→\s*\d+\/\d+/.test(await p.locator("#tpWeek").innerText()),
   await p.locator("#tpWeek").innerText());
ok("まだのクラスがあれば、出すボタンは緑にしない",
   await p.evaluate(() => $("tpGo").classList.contains("ready")) === false);
ok("まだの数を、週のとなりに出す",
   (await p.locator("#tpWeek").innerText()).indexOf("未提出 2 クラス") >= 0,
   await p.locator("#tpWeek").innerText());
await p.evaluate(() => {
  week().tpSub = {"1-1":{at:"x",by:"y"}, "3-2":{at:"x",by:"y"}};
  save(); drawTanpopoView();
});
await p.waitForTimeout(300);
ok("全クラスが出していれば、出すボタンが緑になる",
   await p.evaluate(() => $("tpGo").classList.contains("ready")) === true);
/* **色だけに頼らない。** 緑と青は3型で ΔE 7.3（閾値18）と潰れる */
ok("色だけでなく、ボタンの字も変わる（✓）",
   (await p.locator("#tpGo").innerText()).indexOf("✓") === 0,
   await p.locator("#tpGo").innerText());
ok("色だけでなく、となりにも字で出す",
   (await p.locator("#tpWeek").innerText()).indexOf("ぜんぶ提出ずみ") >= 0,
   await p.locator("#tpWeek").innerText());
ok("緑の上でも字が読める（4.5以上）", await p.evaluate(() => {
     const lin = v => { v /= 255; return v <= .03928 ? v/12.92
                                 : Math.pow((v + .055)/1.055, 2.4); };
     const L = c => { const m = c.match(/\d+/g).map(Number);
       return .2126*lin(m[0]) + .7152*lin(m[1]) + .0722*lin(m[2]); };
     const s = getComputedStyle(document.getElementById("tpGo"));
     const x = L(s.backgroundColor), y = L(s.color);
     return (Math.max(x,y) + .05) / (Math.min(x,y) + .05) >= 4.5;
   }) === true);
await p.evaluate(() => { week().tpSub = {}; save(); drawTanpopoView(); });
await p.waitForTimeout(200);

console.log("\n■ たんぽぽの面（ロックは出すことを止めない）");
await p.evaluate(() => { Y().tanpopo = {"1":["1-1"]}; save(); });
await p.locator(".nav[data-act='gate']").first().click(); await p.waitForTimeout(250);
await p.locator(".master[data-go='tanpopo']").click(); await p.waitForTimeout(600);
ok("ロックのボタンがある", await p.locator("#tpLockBtn").isVisible() === true);
await p.evaluate(() => { week().tpSub = {"1-1":{at:"x",by:"y"}}; save(); drawTanpopoView(); });
await p.locator("#tpLockBtn").click(); await p.waitForTimeout(300);
/* **ロックが守るのは出す先と組分け。** 毎週やるのは出すことだけで、
   そこまで止めると、毎週ロックを外して掛け直すことになる */
ok("ロック中でも、出すボタンは押せる", await p.locator("#tpGo").isDisabled() === false);
ok("押せない理由も出さない", await p.locator("#tpGoWhy").isHidden() === true);
ok("提出ずみなら、ロック中でも緑にする",
   await p.evaluate(() => $("tpGo").classList.contains("ready")) === true);
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(250);
ok("ロック中は、組分けの窓を開かない",
   await p.locator("#tpGrpDlg").evaluate(d => d.open) === false);
/* 外したら、組分けの窓から入れられる */
await p.locator("#tpLockBtn").click(); await p.waitForTimeout(300);
await p.evaluate(() => { Y().tanpopo = {}; save(); drawTanpopoView(); });
ok("1人も入れていないと、出せない", await p.locator("#tpGo").isDisabled() === true);
ok("押せない理由は、組分けへ案内する",
   (await p.locator("#tpGoWhy").innerText()) === "先に組分けで交流級を入れてください",
   await p.locator("#tpGoWhy").innerText());
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(250);
ok("ロックを外すと、組分けの窓が開く",
   await p.locator("#tpGrpDlg").evaluate(d => d.open) === true);
await p.locator("#tpGrpBody .tpchip").first().click(); await p.waitForTimeout(250);
await p.evaluate(() => $("tpGrpDlg").close()); await p.waitForTimeout(250);
ok("窓で入れると、面から出せるようになる",
   await p.locator("#tpGo").isDisabled() === false);

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
/* **上書きの知らせが、2つ以上の週にある状態**を作ってから月の面を開く。
   月の面は同じ窓を4回開こうとするが、2回目からの showModal は無視される。
   出していたら、一覧が後の週のものへ入れ替わって先に出たぶんが消える */
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog[open]")) d.close();
  const mon0 = new Date(monday);
  for(let i = 0; i < 2; i++){
    const keep = monday; monday = addDays(mon0, i * 7);
    const w = week();
    w.home["1-1"] = {"0|p1":{title:"国語", note:"", at:100, by:"me@edu.nishi.or.jp"}};
    w.school      = {"0|p1":{title:"全校朝会", note:"", at:200, by:"other@edu.nishi.or.jp"}};
    w.acked = [];
    monday = keep;
  }
});
await p.locator(".nav[data-act='month']").click(); await p.waitForTimeout(700);
ok("上書きの知らせは、月の面からは出さない（先に出たぶんを消さない）",
   await p.evaluate(() => $("owDlg").open) === false);
/* 仕込んだぶんを片づける。**あとの検査に響かせない**
   （残すと、週の紙へ戻ったところで知らせの窓が出て、次の操作を塞ぐ） */
await p.evaluate(() => {
  const mon0 = new Date(monday);
  for(let i = 0; i < 2; i++){
    const keep = monday; monday = addDays(mon0, i * 7);
    const w = week();
    delete (w.home["1-1"] || {})["0|p1"];
    delete w.school["0|p1"];
    monday = keep;
  }
  save();
});
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
/* 面の出し入れは setCenter 1本になった（showMonth は PR23 で無くなった） */
await p.evaluate(() => setCenter("week"));
await p.waitForTimeout(400);
ok("戻ると、いつもの週の紙に戻る",
   await p.locator("#monthView").evaluate(e => e.hidden) === true
   && await p.locator("#stage").evaluate(e => e.hidden) === false);

console.log("\n■ 教科チップの色は、字が運んでいるものを二重にするだけ");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
/* 押す口は窓から右メニューの帯へ移った（#chipSeg）。既定は「なし」 */
ok("教科チップの色は既定で使わない",
   await p.evaluate(() => !$('sheet').classList.contains('chips-screen')
     && document.querySelector('#chipSeg [data-chip=off]')
          .getAttribute('aria-pressed') === 'true') === true);
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
   }) === true, await p.evaluate(() => {
     const pal = new Set([...document.querySelectorAll(".pal")]
       .map(x => getComputedStyle(x).backgroundColor));
     pal.delete("rgba(0, 0, 0, 0)");
     return [...document.querySelectorAll("#sheet .cell")]
       .filter(x => pal.has(getComputedStyle(x).backgroundColor))
       .map(x => x.className + "=" + getComputedStyle(x).backgroundColor);
   }));
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
ok("提出前は白地（提出後だけオレンジ）", await p.evaluate(() => {
     const b2 = document.getElementById("tpSubBtn");
     const bg = getComputedStyle(b2).backgroundColor;
     return !b2.classList.contains("on") && /255, 255, 255/.test(bg);
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
   await p.evaluate(() => [...document.querySelectorAll("#tpSel .tpin")]
     .map(x => x.className.match(/st-\w+/)[0]).join(",")) === "st-ok,st-base,st-base",
   await p.evaluate(() => [...document.querySelectorAll("#tpSel .tpin")].map(x => x.className)));
/* **色だけに頼らない。** どちらも短い字を持つ */
ok("色だけでなく、字でも言う（済／未）",
   await p.evaluate(() => [...document.querySelectorAll("#tpSel .tpin em")]
     .map(x => x.textContent).join(",")) === "済,未,未",
   await p.evaluate(() => [...document.querySelectorAll("#tpSel .tpin em")].map(x => x.textContent)));
ok("済と未は色が違う（左端の線）", await p.evaluate(() => {
     const c = [...document.querySelectorAll("#tpSel .tpin")]
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
ok("左に「もとになるもの」は置かない",
   (await p.locator(".side").innerText()).indexOf("もとになるもの") < 0);
ok("左に「紙の上の見え方」は置かない",
   (await p.locator(".side").innerText()).indexOf("紙の上の見え方") < 0);
ok("B5・B4・時数コピーは左に残す", await p.evaluate(() => {
     const t=document.querySelector(".side").innerText;
     return t.includes("教務必携用（B5）") && t.includes("4週まとめて（B4）") && t.includes("時数をコピー");
   }) === true);
ok("基本時間割は設定から開く", await (async () => {
     await p.locator("[data-act=settings]").click(); await p.waitForTimeout(100);
     const open=await p.locator("#settingsDlg").evaluate(d=>d.open);
     await p.locator("#settingsDlg .dlgx").click(); return open && await p.locator("#setBase").count()===1;
   })() === true);
ok("左の主な項目ぜんぶに「？」がある",
   await p.evaluate(() => [...document.querySelectorAll('.side [data-help]')]
     .every(e => !!e.querySelector(':scope > .helpq'))) === true,
   await p.locator(".side .helpq").count());
ok("「？」に説明の中身がある（空の窓を開かない）",
   await p.evaluate(() => [...document.querySelectorAll("[data-help]")]
     .every(e => HELP[e.dataset.help] && HELP[e.dataset.help].b.length > 0)) === true,
   await p.evaluate(() => [...document.querySelectorAll("[data-help]")]
     .filter(e => !HELP[e.dataset.help]).map(e => e.dataset.help)));
/* **？を押しても、親の画面は切り替わらない。**
   読もうとしただけの人が、開く気のない週案を開いてしまう */
await p.locator(".nav[data-help='settings'] .helpq").click();
await p.waitForTimeout(300);
ok("「？」を押すと説明の窓が開く",
   await p.locator("#helpDlg").evaluate(d => d.open) === true);
ok("「？」を押しても、その項目そのものは開かない",
   await p.locator("#settingsDlg").evaluate(d => d.open) === false);
ok("説明は、何が起きるかを字で書いてある",
   (await p.locator("#helpBody").innerText()).length > 40,
   (await p.locator("#helpBody").innerText()).length);
/* **「はじめの人がつまずくところ」は書かない方針にした。**
   つまずきどころを1つだけ足すやり方は、結局どの項目も長くなり、
   読む前に閉じられた（→ dialogs.js HELP の書き方の決まり） */
ok("説明にその方針どおり「はじめの人がつまずくところ」が無い",
   (await p.locator("#helpBody").innerText()).indexOf("はじめの人がつまずくところ") < 0);
await p.locator("#helpDlg .dlgx").click(); await p.waitForTimeout(250);
ok("説明の窓は ✕ で閉じる",
   await p.locator("#helpDlg").evaluate(d => d.open) === false);
ok("文字サイズはタイトルと詳細を別々に設定できる",
   await p.locator("#stTitle").count()===1 && await p.locator("#stNote").count()===1);
/* 印刷・画像・Google Sheet は窓を挟まず、紙のとなりの帯（#weekBar）に出る
   （4週・学年・カレンダーの .mbar と同じ形にそろえた） */
ok("週の紙にも印刷・画像・Google Sheetがある",
   await p.locator("#weekPrint,#weekImage,#weekSheet").count()===3);
ok("教務必携用の窓（#outDlg）は無い", await p.locator("#outDlg").count()===0);
ok("B4出力にも印刷・画像・Google Sheetがある",
   await p.locator("#mPrint,#mImage,#mSheet").count()===3);
/* 押す口は窓から右メニューの帯へ移った（#chipSeg。なし／画面だけ／紙にも） */
ok("教科チップは3段階から選べる",
   await p.locator("#chipSeg [data-chip]").count()===3);

console.log("\n■ 「週案を出す」の並びは現在地も言う");
/* 直前の節は入口（#gate）を開いたまま、閉じるボタンの字だけ見て終わっている。
   入口の面では中央のかたちを切り替えられない（centerOk() が false）ので、
   ここで改めてクラスを開く */
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(400);
/* 繰る幅の順（1週 → 4週 → 2ヶ月）。学年は「同じ週を横に並べる」面なので末尾。
   時数をコピーは面を切り替える操作ではないので、さらにその下。 */
ok("並びは 教務必携用→4週→カレンダー→学年→時数をコピー", await p.evaluate(() => {
     const t = [...document.querySelectorAll(".side .nav[data-act], .side .nav[data-plan-output]")]
       .map(e => e.dataset.act).filter(a => ["outweek","month","cal","grade","tally"].includes(a));
     return t.join(",");
   }) === "outweek,month,cal,grade,tally",
   await p.evaluate(() => [...document.querySelectorAll(".side [data-plan-output]")]
     .map(e => e.dataset.act)));
ok("カレンダーには大きさの表記がある（2ヶ月・A4）",
   (await p.locator('.nav[data-act="cal"]').innerText()).indexOf("2ヶ月") >= 0);
ok("学年でならべるにも大きさの表記がある（A4よこ）",
   (await p.locator('.nav[data-act="grade"]').innerText()).indexOf("A4") >= 0);
/* 現在地は aria-current で言う（「ほかの週案を開く」と同じ仕組み） */
await p.locator('.nav[data-act="month"]').click(); await p.waitForTimeout(500);
ok("4週へ移ると、そこだけ aria-current になる", await p.evaluate(() =>
     document.querySelector('.nav[data-center="month"]').getAttribute("aria-current") === "true"
     && document.querySelector('.nav[data-center="week"]').getAttribute("aria-current") === "false"));
ok("週の紙のぶんの出力（#weekBar）は、いまは隠れている",
   await p.locator("#weekBar").isHidden() === true);
await p.locator('.nav[data-act="outweek"]').click(); await p.waitForTimeout(500);
ok("週の紙へ戻ると、また現在地になる", await p.evaluate(() =>
     document.querySelector('.nav[data-center="week"]').getAttribute("aria-current") === "true"));
ok("週の紙のぶんの出力も、また出る", await p.locator("#weekBar").isVisible() === true);


console.log("\n■ 窓を閉じるところは、窓枠の右上");
for(const [act, dlg] of [["settings","settingsDlg"], ["admin","adminDlg"]]){
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

console.log("\n■ 見るだけの面は、枠いっぱいに広げて色を出す");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(400);
/* 教科が1つも無いと色の検査ができないので、1コマだけ入れておく */
await p.evaluate(() => {
  writeCell(0, "p3", {title:"算数", subject:"sansu"});
  writeCell(0, "p4", {title:"国語", subject:"kokugo", note:"漢字の練習"});
  save(); buildSheet(); paintSheet();
});
await p.evaluate(() => setCenter("grade"));
await p.waitForTimeout(700);
/* **幅も高さも枠に当たるまで広げる。** 前は「1コマ 26px × 倍率」で
   紙の縦横比を固定していたので、横に広い枠では下が2割余っていた */
ok("学年の面は枠いっぱいに広がる", await p.evaluate(() => {
     const box = $("gvPaper"), sh = box.querySelector(".gsheet");
     return Math.abs(sh.offsetWidth - box.clientWidth) < 2
         && sh.offsetHeight > box.clientHeight * .92;
   }) === true,
   await p.evaluate(() => {
     const box = $("gvPaper"), sh = box.querySelector(".gsheet");
     return [sh.offsetWidth, box.clientWidth, sh.offsetHeight, box.clientHeight];
   }));
/* **色はクラスの設定と関わりなく出す。** 1-1 は「なし」のままで開いている */
ok("学年の面は、クラスの設定が「なし」でも色が出る", await p.evaluate(() => {
     const t = [...document.querySelectorAll(".gsheet .cell[data-subject=sansu] .t")][0];
     if(!t) return "コマが無い";
     const bg = getComputedStyle(t).backgroundColor;
     return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
   }) === true,
   await p.evaluate(() => {
     const t = [...document.querySelectorAll(".gsheet .cell[data-subject=sansu] .t")][0];
     return t ? getComputedStyle(t).backgroundColor : "コマが無い";
   }));
/* 刷るときも紙いっぱい（A4 よこ 297×210、余白 8mm ＝ 281×194mm） */
ok("学年の面は、刷るときも紙いっぱい", await p.evaluate(() => {
     document.body.classList.add("printing-grade");
     fitGradePrint();
     const sh = $("gvPaper").querySelector(".gsheet"), mm = 96 / 25.4;
     const w = sh.offsetWidth / mm, h = sh.offsetHeight / mm;
     document.body.classList.remove("printing-grade"); fitGrade();
     return Math.abs(w - 281) < 2 && h > 194 * .92 && h <= 194 + 1;
   }) === true,
   await p.evaluate(() => {
     document.body.classList.add("printing-grade");
     fitGradePrint();
     const sh = $("gvPaper").querySelector(".gsheet"), mm = 96 / 25.4;
     const r = [+(sh.offsetWidth / mm).toFixed(1), +(sh.offsetHeight / mm).toFixed(1)];
     document.body.classList.remove("printing-grade"); fitGrade();
     return r;
   }));
/* カレンダーも同じ決まり（教科の1文字の欄に地を敷く） */
await p.evaluate(() => setCenter("cal"));
await p.waitForTimeout(900);
ok("カレンダーも、クラスの設定が「なし」でも色が出る", await p.evaluate(() => {
     const b = document.querySelector(".cper > i[data-subject=sansu] b");
     if(!b) return "コマが無い";
     const bg = getComputedStyle(b).backgroundColor;
     return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
   }) === true);
/* 4週のコマ。**題名が左・備考が右**（土だけは縦のまま） */
await p.evaluate(() => setCenter("month"));
await p.waitForTimeout(900);
ok("4週のコマは、題名が左・備考が右", await p.evaluate(() => {
     const c = document.querySelector("#mS0 .daycol:not(.lastcol) .cell.lesson");
     const t = c.querySelector(".t"), n = c.querySelector(".n");
     const tr = t.getBoundingClientRect(), nr = n.getBoundingClientRect();
     return tr.right <= nr.left + 1 && Math.abs(tr.height - nr.height) < 2;
   }) === true);
ok("土だけは縦のまま（20mm を割ると題名が1文字ぶんになる）", await p.evaluate(() => {
     const c = document.querySelector("#mS0 .daycol.lastcol .cell.lesson");
     const t = c.querySelector(".t"), n = c.querySelector(".n");
     return t.getBoundingClientRect().bottom <= n.getBoundingClientRect().top + 1;
   }) === true);
/* 4週の紙に、右メニューの小さいボタンの形が当たっていないこと。
   **同じ .mini という名前を2つの物に使っていた**ので、紙に padding と
   white-space:nowrap が乗り、版面が痩せてコマの中の字が折り返さなくなっていた */
ok("4週の紙に、ボタンの形が当たっていない", await p.evaluate(() => {
     const cs = getComputedStyle($("mS0"));
     return cs.padding === "0px" && cs.whiteSpace === "normal";
   }) === true,
   await p.evaluate(() => {
     const cs = getComputedStyle($("mS0"));
     return [cs.padding, cs.whiteSpace];
   }));
/* 専科の面は、コマの中身が「行き先のクラス」。色は教科ではなく学年で付ける */
await p.evaluate(() => setCenter("week"));
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile.sp").first().click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const c = classesOfSpecial(view.sp)[0];
  writeCell(0, "p1", {title:c});
  save(); buildSheet(); paintSheet();
});
await p.waitForTimeout(250);
ok("専科の面は、行き先のクラスの学年で色が付く", await p.evaluate(() => {
     const e = document.querySelector("#sheet .cell[data-cg]");
     if(!e) return "印が付いていない";
     const bg = getComputedStyle(e.querySelector(".t")).backgroundColor;
     return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
   }) === true,
   await p.evaluate(() => {
     const e = document.querySelector("#sheet .cell[data-cg]");
     return e ? [e.dataset.cg, getComputedStyle(e.querySelector(".t")).backgroundColor]
              : "印が付いていない";
   }));
/* 書いたぶんで上書きの知らせが開くことがある。**次の節の邪魔をしない。**
   開いた窓は押すものを覆う（::backdrop）ので、**移る前と移ったあとの両方**で
   閉じる ── 面を開き直すと、その面ぶんの知らせがもう一度出る */
const shut = async () => {
  await p.evaluate(() => document.querySelectorAll("dialog[open]")
                           .forEach(d => d.close()));
  await p.waitForTimeout(150);
};
await shut();
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await shut();
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(400);
await shut();

console.log("\n■ 初回案内は閉じて再表示でき、画面を勝手に移動しない");
await p.evaluate(() => {localStorage.removeItem('school-timetable/guide-v2');openGuide(true);});
ok("初回案内が開く", await p.locator('#guideDlg').isVisible());
await p.keyboard.press('Escape');
await p.waitForFunction(() => localStorage.getItem('school-timetable/guide-v2') === 'done');
ok("Escapeで閉じる", await p.locator('#guideDlg').isVisible() === false);
ok("案内完了を保存", await p.evaluate(() => localStorage.getItem('school-timetable/guide-v2')) === 'done');
await p.evaluate(() => openGuide(true));
ok("既読なら自動表示しない", await p.locator('#guideDlg').isVisible() === false);
await p.locator('#guideOpen').click();
ok("使い方から再表示", await p.locator('#guideDlg').isVisible());
await p.locator('[data-close="guideDlg"]').click();

console.log("\n■ 専科どうしの月予定（仮）");
/* この節は、基本時間割を同梱の写しで満たしてから見る。
   **空の基本時間割では、組むコマが1つも出ない**（需要は基本から数える） */
await shut();
await p.evaluate(() => { applyFixed(fixedBuiltin()); openView({kind:"class", cls:"3-1"}); });
await p.waitForTimeout(250); await shut();
ok("担任の面には、月予定の口を出さない", await p.locator("#navSpMonth").isHidden());
await p.evaluate(() => openView({kind:"school"})); await p.waitForTimeout(250); await shut();
ok("全学年の面には出る", await p.locator("#navSpMonth").isVisible());
await p.evaluate(() => openView({kind:"special", sp:specials()[0].code}));
await p.waitForTimeout(250); await shut();
ok("専科の面にも出る", await p.locator("#navSpMonth").isVisible());

/* 硬い制約。**全校の予定・学年の予定・休みのコマには置かない。**
   判定は空き枠さがしと同じ freeOne を通っているので、画面の ○△× と食い違わない */
const spmHard = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const ws = spMonthWeeks(Y0, M0), keep = monday;
  monday = ws[1];
  const w = week();
  w.school[ck(1, "p2")] = {title:"全校朝会", note:"", subject:null,
                           by:"x@edu.nishi.or.jp", at:Date.now()};
  (w.grade["3"] || (w.grade["3"] = {}))[ck(3, "p4")] =
    {title:"学年集会", note:"", subject:null, by:"x@edu.nishi.or.jp", at:Date.now()};
  monday = ws[2];
  week().school[ck(2, DAY_SLOT)] = {title:"休み", note:"", subject:null,
                                    by:"x@edu.nishi.or.jp", at:Date.now()};
  monday = keep; save();
  const wishes = {};
  for(const s of specials()) wishes[s.code] = spwBlank();
  const t0 = performance.now();
  const cx = spBuild(Y0, M0, wishes, true);
  const res = spSolve(cx);
  const ms = Math.round(performance.now() - t0);
  let onSchool = 0, onGrade = 0, onOff = 0, twoCls = 0, twoSp = 0, outMonth = 0;
  const byCls = {}, bySp = {};
  for(const u of res.placed){
    const wi = cx.posWi(u.at), dd = cx.posD(u.at), si = cx.posSi(u.at);
    const sid = cx.lessons[si].id;
    if(wi === 1 && dd === 1 && sid === "p2") onSchool++;
    if(wi === 1 && dd === 3 && sid === "p4" && gradeOf(u.cls) === "3") onGrade++;
    if(wi === 2 && dd === 2) onOff++;
    if(cx.days[wi].indexOf(dd) < 0) outMonth++;
    if(byCls[u.at + "|" + u.cls]) twoCls++; byCls[u.at + "|" + u.cls] = 1;
    if(bySp[u.at + "|" + u.sp]) twoSp++;    bySp[u.at + "|" + u.sp]   = 1;
  }
  return {ms, units:cx.units.length, placed:res.placed.length, unplaced:res.unplaced.length,
          moved:res.moved.length, onSchool, onGrade, onOff, twoCls, twoSp, outMonth,
          weeks:cx.weeks.length};
});
ok("組むコマを、基本時間割から数えている", spmHard.units > 100, spmHard);
ok("全校の予定のコマには置かない",   spmHard.onSchool === 0, spmHard);
ok("学年の予定のコマには置かない",   spmHard.onGrade  === 0, spmHard);
ok("休みの日には置かない",           spmHard.onOff    === 0, spmHard);
ok("同じ時刻に、同じクラスへ2人は行かない", spmHard.twoCls === 0, spmHard);
ok("同じ時刻に、1人が2クラスへは行かない",  spmHard.twoSp  === 0, spmHard);
ok("月の外の日には組まない",         spmHard.outMonth === 0, spmHard);
/* **速さも見る。** 押してから返らないと、組み直して見比べる使い方ができない */
ok("1ヶ月ぶんを 3秒以内で組む", spmHard.ms < 3000, spmHard);

/* 希望。**チェックを入れたものが、案に効いている** */
const spmWishChk = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const ws = spMonthWeeks(Y0, M0);
  const code = specials()[0].code;
  const avoid = iso(addDays(ws[1], 1));
  const run = set => {
    const wishes = {};
    for(const s of specials()) wishes[s.code] = spwBlank();
    set(wishes[code]);
    const cx = spBuild(Y0, M0, wishes, true);
    return {cx, res: spSolve(cx)};
  };
  const cnt = ({cx, res}, f) => res.placed.filter(u => u.sp === code
      && f(cx.posWi(u.at), cx.posD(u.at), cx.posSi(u.at), cx)).length;
  const A = run(w => { w.days = [avoid]; w.avoid = true; });
  /* **日付を選んでもチェックを外していれば効かない。** ほかの希望と同じ形 */
  const N = run(w => { w.days = [avoid]; w.avoid = false; });
  const B = run(w => { w.am = true; });
  const C = run(() => {});
  const onDay = (o) => cnt(o, (wi, dd, si, cx) => iso(addDays(cx.weeks[wi], dd)) === avoid);
  return {
    avoidOn: onDay(A), avoidUnchecked: onDay(N), avoidNone: onDay(C),
    amOn:  cnt(B, (wi, dd, si, cx) => si >= cx.amCut),
    amOff: cnt(C, (wi, dd, si, cx) => si >= cx.amCut),
    ngShape: JSON.stringify(Object.keys(B.res.wishNg[code]).sort())
  };
});
ok("避ける日にチェックを入れると、その専科を置かない", spmWishChk.avoidOn === 0, spmWishChk);
ok("チェックを外すと、日付を選んでいても効かない",
   spmWishChk.avoidUnchecked === spmWishChk.avoidNone
   && spmWishChk.avoidNone > 0, spmWishChk);
ok("午前のみで、午後のコマが減る", spmWishChk.amOn < spmWishChk.amOff, spmWishChk);
ok("希望の通らなかった数を数えている",
   spmWishChk.ngShape === '["am","avoid","base","pair","spread"]', spmWishChk);

/* **チェックを入れた希望は、破らずに済むかぎり破らない。**
   1人だけが希望を入れた月なら、ほかの専科が譲るので通り切る。
   避ける日を1週ぶん丸ごと選んでも、その週には1コマも置かない。 */
const spmAbs = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const cx0 = spBuild(Y0, M0, (() => { const w = {};
    for(const s of specials()) w[s.code] = spwBlank(); return w; })(), true);
  /* 受け持ちのいちばん少ない枠で見る（多い枠は午前の数が足りない） */
  const code = cx0.sps.map(s => s.code)
    .sort((a, b) => classesOfSpecial(a).length - classesOfSpecial(b).length)[0];
  const week2 = cx0.days[2].map(dd => iso(addDays(cx0.weeks[2], dd)));
  const wishes = {};
  for(const s of specials()) wishes[s.code] = spwBlank();
  wishes[code].avoid = true; wishes[code].days = week2;
  wishes[code].am = true;
  const cx = spBuild(Y0, M0, wishes, true), res = spSolve(cx);
  let onAvoid = 0, pm = 0;
  for(const u of res.placed){
    if(u.sp !== code) continue;
    const wi = cx.posWi(u.at), dd = cx.posD(u.at);
    if(week2.indexOf(iso(addDays(cx.weeks[wi], dd))) >= 0) onAvoid++;
    if(cx.posSi(u.at) >= cx.amCut) pm++;
  }
  return {code, days:week2.length, onAvoid, pm,
          unplaced:res.unplaced.filter(u => u.sp === code).length};
});
ok("1週ぶん丸ごと避けても、その週には置かない", spmAbs.onAvoid === 0, spmAbs);
ok("受け持ちの少ない枠なら、午前のみを破らずに済む", spmAbs.pm === 0, spmAbs);

/* **破った数を、まとめの帯で数えている。** 破ったことを黙らない */
const spmBrokeChk = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const mk = f => { const w = {};
    for(const s of specials()) w[s.code] = spwBlank(); f(w); return w; };
  /* 全員が午前のみ＝午前の枠がぜんぜん足りない。**破らざるを得ない** */
  const hard = spSolve(spBuild(Y0, M0, mk(w => {
    for(const k in w) w[k].am = true; }), true));
  const easy = spSolve(spBuild(Y0, M0, mk(() => {}), true));
  return {hard: spmBroke(hard), easy: spmBroke(easy),
          unplaced: hard.unplaced.length};
});
ok("破らざるを得ない月では、破った数を出す", spmBrokeChk.hard > 0, spmBrokeChk);
ok("希望を入れていない月は、破った数が 0", spmBrokeChk.easy === 0, spmBrokeChk);
/* **破ってでも置く。** 置けないままにするより、破ったと言って置くほうがよい */
ok("破ることになっても、コマは置き切る", spmBrokeChk.unplaced === 0, spmBrokeChk);

/* 2コマくっつける。**片割れが行事でつぶれても、2コマに戻る** */
const spmPair = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const ws = spMonthWeeks(Y0, M0), lessons = SLOTS.filter(s => s.kind === "lesson");
  const sp = specials().find(s => s.subject === "zuko" && (s.grades || []).indexOf("1") >= 0);
  if(!sp) return {skip:true};
  const cls = classesOfSpecial(sp.code)[0];
  const keep = monday;
  let found = null;
  for(let wi = 1; wi < ws.length - 1 && !found; wi++){
    monday = ws[wi];
    for(let dd = 0; dd < WEEKDAYS && !found; dd++)
      for(let si = 0; si + 1 < lessons.length; si += 2){
        const a = baseCell(cls, dd, lessons[si].id), b2 = baseCell(cls, dd, lessons[si+1].id);
        if(a && b2 && a.subject === "zuko" && b2.subject === "zuko"){ found = {wi, dd, si}; break; }
      }
  }
  if(!found){ monday = keep; return {skip:true}; }
  monday = ws[found.wi];
  const w = week(), g = gradeOf(cls);
  (w.grade[g] || (w.grade[g] = {}))[ck(found.dd, lessons[found.si].id)] =
    {title:"学年行事", note:"", subject:null, by:"x@edu.nishi.or.jp", at:Date.now()};
  monday = keep; save();
  const run = pair => {
    const wishes = {};
    for(const s of specials()) wishes[s.code] = spwBlank();
    wishes[sp.code].pair = pair;
    const cx = spBuild(Y0, M0, wishes, true), res = spSolve(cx);
    const byDay = {};
    let inWeek = 0;
    for(const u of res.placed){
      if(u.sp !== sp.code || u.cls !== cls || cx.posWi(u.at) !== found.wi) continue;
      inWeek++;
      (byDay[cx.posD(u.at)] || (byDay[cx.posD(u.at)] = [])).push(cx.posSi(u.at));
    }
    let paired = 0;
    for(const k in byDay){
      const a = byDay[k].sort((x, y) => x - y);
      for(let i = 0; i + 1 < a.length; i += 2) if(spPaired(a[i], a[i+1])) paired += 2;
    }
    return {paired, inWeek};
  };
  return {off: run(false), on: run(true)};
});
ok("片割れがつぶれても、くっつける希望で2コマに戻る",
   spmPair.skip === true || spmPair.on.paired === 2, spmPair);
/* **その週から追い出して2コマにしない。** 追い出すと、その週の時数が変わる */
ok("2コマにするために、別の週へ逃がさない",
   spmPair.skip === true || spmPair.on.inWeek === spmPair.off.inWeek, spmPair);

/* 入れる。**基本時間割がそのまま出すコマは書かない**（行だけ増えて紙は変わらない） */
const spmPut = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const wishes = {};
  for(const s of specials()) wishes[s.code] = spwBlank();
  const cx = spBuild(Y0, M0, wishes, true), res = spSolve(cx);
  res.over = spWouldOverwrite(res);
  const a = spApply(res);
  const b2 = spApply(spSolve(spBuild(Y0, M0, wishes, true)));   /* 2回目 */
  const keep = monday;
  let cells = 0, outMonth = 0;
  for(let wi = 0; wi < cx.weeks.length; wi++){
    monday = cx.weeks[wi];
    const w = week();
    for(const c of allClasses()) for(let dd = 0; dd < WEEKDAYS; dd++)
      for(const s of cx.lessons){
        if(!((w.special[c] || {})[ck(dd, s.id)])) continue;
        cells++;
        if(cx.days[wi].indexOf(dd) < 0) outMonth++;
      }
  }
  monday = keep;
  return {units:cx.units.length, moved:res.moved.length, wrote:a.wrote,
          stale:a.stale.length, again:b2.wrote, cleared:b2.cleared, cells, outMonth};
});
ok("基本がそのまま出すコマは書かない", spmPut.wrote < spmPut.units / 4, spmPut);
ok("動かしたコマは書く",               spmPut.wrote >= spmPut.moved, spmPut);
ok("月の外の日には書かない",           spmPut.outMonth === 0, spmPut);
ok("2回組んでも、専科のコマは増え続けない", spmPut.again === spmPut.cells, spmPut);
/* **元の場所に基本の字が残ることを数えている。**
   そこは担任が入れ直すところなので、黙って残さない */
ok("基本の字が残るコマを数えている", spmPut.stale > 0, spmPut);

/* 希望の持ち方。**専用の入れ物を作らない**（全校層の1コマ・時程は wish:） */
const spmWishIO = await p.evaluate(() => {
  const d = new Date(monday), Y0 = d.getFullYear(), M0 = d.getMonth();
  const code = specials()[0].code;
  const w1 = spwBlank();
  w1.am = true; w1.pair = true; w1.days = ["2026-10-15"];
  spWishWrite(Y0, M0, code, w1);
  const back = spWishRead(Y0, M0, code);
  /* 次の月は空。**先月のぶんが既定になる**（毎月入れ直させない） */
  const next = spWishRead(Y0, M0 + 1, code);
  /* 空にすれば、コマごと消える */
  spWishWrite(Y0, M0, code, spwBlank());
  const gone = spwRaw_(spwAnchor(Y0, M0), code);
  return {am:back.wish.am, pair:back.wish.pair, days:back.wish.days,
          carried:next.carried, nextAm:next.wish.am, gone};
});
ok("希望を書いて、読み戻せる",
   spmWishIO.am === true && spmWishIO.pair === true
   && spmWishIO.days.join() === "2026-10-15", spmWishIO);
ok("次の月は、先月の希望を既定にする",
   spmWishIO.carried === true && spmWishIO.nextAm === true, spmWishIO);
ok("空にすると、コマごと消える", spmWishIO.gone === null, spmWishIO);
/* **窓を開いて閉じただけでは、1コマも書き出さない。**
   書き出すと、先月から引き継いだ希望が「見ただけ」で今月のものになり、
   触っていない人のぶんまで未保存として出る */
const spmUntouched = await p.evaluate(() => {
  const before = Backend.unsaved();
  spmDirty = false;
  const n = spmSaveWish();
  return {n, grew: Backend.unsaved() - before};
});
ok("希望を触っていなければ、1コマも書き出さない",
   spmUntouched.n === 0 && spmUntouched.grew === 0, spmUntouched);

console.log("\n■ 専科の月予定は、4週の面と同じ紙で出す");
/* **窓ではなく紙で見る。** ふだん読んでいる週案の形と別物だと、
   読み方をもう一度覚えることになる */
await shut();
await p.evaluate(() => openView({kind:"special", sp:specials()[0].code}));
await p.waitForTimeout(250); await shut();
await p.locator("#navSpMonth").click(); await p.waitForTimeout(700);
ok("窓が開く", await p.locator("#spmDlg").isVisible());
await p.locator("#spmRun").click(); await p.waitForTimeout(4000);
ok("くむと、窓が閉じて紙が出る",
   (await p.locator("#spmDlg").isVisible()) === false
   && (await p.locator("#spmView").isVisible()) === true);
const spmSheets = await p.locator("#spmPaper .sheet").count();
ok("週の数だけ紙が並ぶ", spmSheets >= 4 && spmSheets <= 6, spmSheets);
const spmLines = await p.locator("#spmPaper .spx").count();
ok("1コマに専科が並ぶ", spmLines > 100, spmLines);
/* **色は1行ずつに敷く。** コマ全体に敷くと、6人並んだコマが1色になる */
const spmCol = await p.evaluate(() => {
  const a = [...document.querySelectorAll("#spmPaper .spx")].slice(0, 80);
  const set = {};
  for(const e of a) set[getComputedStyle(e).backgroundColor] = 1;
  const cellBg = new Set([...document.querySelectorAll("#spmPaper .cell.lesson>.t")]
    .slice(0, 40).map(e => getComputedStyle(e).backgroundColor));
  return {kinds:Object.keys(set).length, cellKinds:cellBg.size,
          subj:a.slice(0, 4).map(e => e.dataset.subject)};
});
ok("教科ごとに色が変わる", spmCol.kinds >= 3, spmCol);
ok("色はコマ全体ではなく、1行ずつに付く", spmCol.cellKinds <= 1, spmCol);
/* 全校の予定・休みは、下敷きの全学年の紙がそのまま持っている */
const spmCtx = await p.evaluate(() => {
  const cx = spmRes.cx, keep = monday;
  let onSchool = 0, onOff = 0;
  monday = cx.weeks[1];
  const w = week();
  w.school[ck(1, "p2")] = {title:"全校朝会", note:"", subject:null,
                           by:"x@edu.nishi.or.jp", at:Date.now()};
  monday = keep;
  drawSpMonthView();
  const sheets = document.querySelectorAll("#spmPaper .sheet");
  const cell = sheets[1] && sheets[1].querySelector(".cell[data-d='1'][data-s='p2']");
  const txt = cell ? cell.textContent : "";
  for(const e of document.querySelectorAll("#spmPaper .spx")) onSchool += 0;
  return {txt, lines: cell ? cell.querySelectorAll(".spx").length : -1,
          slash: !!document.querySelector("#spmPaper .cell .noneslash, #spmPaper .daycol .offslash")};
});
ok("全校の予定のコマは、その予定がそのまま出る",
   spmCtx.txt.indexOf("全校朝会") >= 0 && spmCtx.lines === 0, spmCtx);

/* 仮採用。**基本時間割と同じ薄さ・同じ低さで入る** */
const spmTent = await p.evaluate(() => {
  const r = spmRes, cx = r.cx;
  spmSaveWish();
  const out = spApply(r, true);
  spmPreview = null; spmAdoptedAs = "tent";
  const keep = monday;
  let tent = 0, real = 0, found = null;
  for(const mon of cx.weeks){
    monday = mon;
    const w = week();
    for(const c of allClasses()) for(const k in (w.special[c] || {})){
      if(k.indexOf("|" + TENT_SLOT) >= 0) tent++; else real++;
    }
  }
  monday = cx.weeks[0];
  for(const c of allClasses()){
    for(let d = 0; d < WEEKDAYS && !found; d++) for(const sl of cx.lessons){
      const cur = compose(c, d, sl.id);
      if(cur.layer === "tent"){ found = {c, d, s:sl.id, t:plain(cur.title)}; break; }
    }
    if(found) break;
  }
  let beaten = "", own = "";
  if(found){
    /* **本物を書いた瞬間に負ける。** それが「優先度がいちばん低い」の中身 */
    const w = week();
    (w.home[found.c] || (w.home[found.c] = {}))[ck(found.d, found.s)] =
      {title:"国語", note:"", subject:"kokugo", by:"y@edu.nishi.or.jp", at:Date.now()};
    beaten = compose(found.c, found.d, found.s).layer;
    delete w.home[found.c][ck(found.d, found.s)];
    /* 専科の自分の週にも、薄く出る */
    const e = (week().special[found.c] || {})[ck(found.d, TENT_SLOT + found.s)];
    if(e) own = ownCell(found.d, found.s, e.sp).layer;
  }
  monday = keep;
  return {tent, real, found, beaten, own, wrote:out.wrote};
});
ok("仮採用は tent: の行に入る（本物の校時には書かない）",
   spmTent.tent > 0 && spmTent.real === 0, spmTent);
ok("仮採用のコマが、紙に出る", !!spmTent.found, spmTent);
ok("誰かが本物を書くと、仮は引っ込む", spmTent.beaten === "home", spmTent);
ok("専科の自分の週にも、薄く出る", spmTent.own === "tent", spmTent);

/* 採用しなおすと、仮のぶんはどける。**二重に残さない** */
const spmSwap = await p.evaluate(() => {
  const r = spmRes, cx = r.cx;
  const out = spApply(r, false);
  const keep = monday;
  let tent = 0, real = 0;
  for(const mon of cx.weeks){
    monday = mon;
    const w = week();
    for(const c of allClasses()) for(const k in (w.special[c] || {})){
      if(k.indexOf("|" + TENT_SLOT) >= 0) tent++; else real++;
    }
  }
  monday = keep;
  return {tent, real, cleared:out.cleared, wrote:out.wrote};
});
ok("採用しなおすと、仮のぶんは残らない",
   spmSwap.tent === 0 && spmSwap.real > 0, spmSwap);

await p.evaluate(() => setCenter("week"));
await p.waitForTimeout(200);
await shut();

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
