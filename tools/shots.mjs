import { chromium } from "playwright";
const exe = process.env.PLAYWRIGHT_CHROMIUM;
const b = await chromium.launch(exe ? {executablePath: exe} : {});
const p = await b.newPage({viewport:{width:1520, height:950}, deviceScaleFactor:2});
p.on("pageerror", e => console.log("ERR", e.message));
p.on("dialog", d => d.accept());
await p.goto("file:///home/user/school-timetable/dist/index.html");
await p.waitForTimeout(400);
const D = process.env.OUT || "/tmp";
await p.screenshot({path:D + "/gate.png"});
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(400);
await p.evaluate(() => {
  const w = week(), set = (o,k,v) => o[k] = Object.assign({at:Date.now()}, v);
  set(w.school, "4|am1", {title:"避難訓練"});
  set(w.school, "0|p1", {title:"全校朝会", subject:"gyoji"});
  w.grade["3"] = {};
  set(w.grade["3"], "2|p3", {title:"学年体育", note:"体育館 3クラス合同", subject:"taiiku"});
  set(w.grade["3"], "2|p4", {title:"学年体育", subject:"taiiku"});
  w.home["3-3"] = {};
  set(w.home["3-3"], "0|p2", {title:"算数", subject:"sansu",
    note:'<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">教科書P12-15</a> と <a href="https://example.com/b" target="_blank" rel="noopener noreferrer">ワークシート</a>'});
  set(w.home["3-3"], "3|p5", {title:"校外学習", note:"市役所 9:00発／弁当", subject:"gyoji"});
  w.weekend = {土:"運動会係打合せ 9:00", 日:""};
  w.memo = "○持ち物：ぞうきん／□提出：漢字ドリル";
  save(); buildSheet();
});
await p.waitForTimeout(400);
for(const id of ["owDlg", "warnDlg"])
  if(await p.locator("#" + id).evaluate(d => d.open).catch(() => false))
    await p.locator("#" + id + " .btn").click();
await p.waitForTimeout(200);
await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").click();
await p.waitForTimeout(300);
await p.screenshot({path:D + "/editor.png"});
await p.locator("[data-act='tanpopo']").click(); await p.waitForTimeout(400);
await p.screenshot({path:D + "/tanpopo.png"});
await p.locator("[data-close='tpDlg']").click(); await p.waitForTimeout(200);
await p.emulateMedia({media:"print"});
await p.waitForTimeout(250);
await p.locator("#sheet").screenshot({path:D + "/print.png"});
console.log("ok");
await b.close();
