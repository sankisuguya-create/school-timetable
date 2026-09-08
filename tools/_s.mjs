import { chromium } from "playwright";
import { fileURLToPath } from "url"; import path from "path";
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const b = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM});
const p = await (await b.newContext({viewport:{width:1560,height:980}})).newPage();
await p.goto("file://" + path.join(ROOT, "dist", "index.html"));
await p.waitForTimeout(500);
await p.locator(".tile[data-c='3-3']").click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  writeCell(0, "am2", {title:"漢字", subject:null});
  writeCell(3, "p1", {title:"校外学習（奈良）", note:"8:30出発／弁当", subject:"gyoji"});
  paintSheet();
});
await p.waitForTimeout(300);
await p.emulateMedia({media:"print"});
await p.waitForTimeout(200);
await p.locator("#sheet").screenshot({path: path.join(ROOT, "tools", "_print.png")});
await b.close();
