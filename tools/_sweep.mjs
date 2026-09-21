/* 全部の面と窓を順に開いて、コンソールのエラーを拾う。 */
import { chromium } from "playwright";
const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const p = await b.newPage({viewport:{width:1520, height:1000}});
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if(m.type() === "error") errs.push("console: " + m.text()); });
p.on("dialog", d => d.accept());
const shut = () => p.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
const step = async (name, fn) => {
  const before = errs.length;
  try{ await fn(); }catch(e){ errs.push("step[" + name + "]: " + e.message); }
  await p.waitForTimeout(350); await shut();
  const got = errs.slice(before);
  console.log((got.length ? "✗ " : "○ ") + name + (got.length ? "  → " + got.join(" | ") : ""));
};
await p.goto("file:///home/user/school-timetable/dist/index.html");
await p.waitForTimeout(900); await shut();

await step("入口", () => p.evaluate(() => showGate()));
for(const c of ["1-1","3-3","5-1"])
  await step("学級 " + c, () => p.evaluate(x => openView({kind:"class", cls:x}), c));
await step("学年 5年", () => p.evaluate(() => openView({kind:"grade", grade:"5"})));
await step("全学年", () => p.evaluate(() => openView({kind:"school"})));
const sps = await p.evaluate(() => specials().map(s => s.code));
for(const sp of sps)
  await step("専科 " + sp, () => p.evaluate(x => openView({kind:"special", sp:x}), sp));
await step("たんぽぽ", () => p.evaluate(() => openView({kind:"tanpopo"})));

await p.evaluate(() => openView({kind:"class", cls:"5-1"}));
await p.waitForTimeout(500); await shut();
for(const k of ["month","grade","cal","week"])
  await step("中央 " + k, () => p.evaluate(x => setCenter(x), k));

/* コマを選んで右メニューを一通り */
await step("コマを選ぶ", async () => {
  await p.locator("#sheet .cell[data-d='0'][data-s='p1'] .t").click();
});
await step("チップを押す", () => p.locator(".pal[data-v='kokugo']").click());
await step("フォントサイズ ＋", () => p.locator('#fontWrap .fsb[data-fs="titlePt"][data-step="0.5"]').click());
await step("時数を開く", () => p.evaluate(() => { $("tallyFold").open = true; drawTallyPanel(); }));
await step("空き枠を開く", () => p.evaluate(() => { openView({kind:"school"}); }));
await step("空き枠 段2", async () => {
  await p.evaluate(() => { $("freeFold").open = true; });
  await p.locator('#freeSeg [data-free="2"]').click();
});
await step("日の形を開く", () => p.evaluate(() => { $("dayFold").open = true; drawDayPanel(); }));

/* 窓を順に */
const dlgs = [["settings","openSettings"],["roster","openRosterDlg"],["base","openBaseDlg"],
              ["paper",null],["admin","openAdminDlg"],["tally","openTallyDlg"],
              ["events","openEventsDlg"],["subjects","openSubDlg"],["imp","openImpDlg"],
              ["newyear","openNewYearDlg"]];
for(const [name, fn] of dlgs)
  if(fn) await step("窓 " + name, () => p.evaluate(f => window[f] ? window[f]() : eval(f + "()"), fn));
await step("窓 時数表インポート", () => p.evaluate(() => { openView({kind:"class", cls:"5-1"}); }));
await step("  雛形を出す", async () => {
  await p.evaluate(() => openImpPlan("tally"));
  await p.locator("#ipTpl").click();
  await p.locator("#ipRead").click();
});
await step("窓 年間行事→コマ", async () => {
  await p.evaluate(() => { $("impPlanDlg").close(); openImpPlan("events"); });
  await p.locator("#ipTpl").click();
  await p.locator("#ipRead").click();
});
/* ？ をぜんぶ開く */
const keys = await p.evaluate(() => Object.keys(HELP));
for(const k of keys)
  await step("？ " + k, () => p.evaluate(x => openHelp(x), k));

console.log("\n=== まとめ ===");
console.log(errs.length ? errs.length + " 件のエラー" : "エラーなし");
await b.close();
process.exit(errs.length ? 1 : 0);
