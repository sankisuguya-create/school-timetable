/* 本番（Apps Script）側の継ぎ目を確かめる。
     node tools/wirecheck.mjs

   偽の google.script.run を差し込んで、画面がサーバと何をやりとりするかを見る。
   Google のアカウントも Apps Script も要らない。 */
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
const p = await (await b.newContext({viewport:{width:1500, height:950}})).newPage();
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if(m.type() === "error") errs.push("console: " + m.text()); });

/* 偽のサーバ。呼ばれたことと引数を覚え、シートらしい形を返す。 */
await p.addInitScript(() => {
  window.__calls = [];
  const DATA = {
    boot: {
      me: "tanaka@edu.nishi.or.jp",
      config: {
        "印刷用紙":"A4", "印刷余白mm":12, "印刷倍率":0.95,
        "時数_貼る先":"D3", "時数_クラスの順":"5-1,5-2,5-3,5-4",
        "時数_1日の行数":12, "時数_列のずれ":"am2:0,p1:1,p2:2,br:3,p3:4,p4:5,lun:6,p5:7,p6:8"
      },
      /* シートの時程は5コマだけ。**画面はコードの既定ではなくこちらに従うはず** */
      slots: [
        {id:"am2", name:"朝学習", kind:"brk",    time:"8:20〜8:35", tally:"朝", chips:true},
        {id:"p1",  name:"1",     kind:"lesson", time:"8:40〜9:25", tally:"1校時"},
        {id:"p2",  name:"2",     kind:"lesson", time:"9:35〜10:20",tally:"2校時"},
        {id:"lun", name:"昼",    kind:"brk",    time:"12:00〜13:00",tally:"昼"},
        {id:"p3",  name:"3",     kind:"lesson", time:"13:05〜13:50",tally:"3校時"}
      ],
      subjects: [
        {code:"kokugo", name:"国語", short:"国", count:true},
        {code:"sansu",  name:"算数", short:"算", count:true},
        {code:"gyoji",  name:"行事", short:"",   count:false}
      ]
    },
    year: {
      roster: {
        classes: {"1":["1-1","1-2"], "5":["5-1","5-2","5-3","5-4"]},
        specials: [{code:"ongaku", label:"音楽"}],
        week1: "2026-04-06",
        tanpopo: ["5-1"]
      },
      base: {"5-1": {A: {"0|p1": {title:"国語", subject:"kokugo"}}}}
    },
    week: {
      school: {}, grade: {},  special: {},
      home: {"5-1": {}}
    }
  };
  const call = (name, args, ret) => {
    window.__calls.push({name, args});
    return ret;
  };
  function runner(){
    let okFn = () => {}, ngFn = () => {};
    const api = {
      withSuccessHandler(f){ okFn = f; return api; },
      withFailureHandler(f){ ngFn = f; return api; },
      apiBoot(){ const r = call("apiBoot", [], DATA.boot); setTimeout(() => okFn(r), 0); },
      apiReadYear(y){ const r = call("apiReadYear", [y], DATA.year); setTimeout(() => okFn(r), 0); },
      apiReadWeek(y, m){ const r = call("apiReadWeek", [y, m], DATA.week); setTimeout(() => okFn(r), 0); },
      apiWriteCells(y, patches){
        call("apiWriteCells", [y, patches]);
        const at = {};
        for(const q of patches)
          at[[q.date, q.slot, q.layer, q.target].join("|")] = q.remove ? 0 : 1700000000000;
        setTimeout(() => okFn({at, count:patches.length}), 0);
      },
      apiWriteRoster(y, c, s, w, tp){ call("apiWriteRoster", [y, c, s, w, tp]); setTimeout(() => okFn({}), 0); },
      apiWriteBase(y, c, v, bank){ call("apiWriteBase", [y, c, v, bank]); setTimeout(() => okFn(true), 0); }
    };
    return api;
  }
  /* google.script.run は毎回新しい呼び出し口を返す */
  window.google = {script: {get run(){ return runner(); }}};
});

await p.goto(PAGE);
await p.waitForTimeout(700);
const calls = () => p.evaluate(() => window.__calls.map(c => c.name));
const lastCall = n => p.evaluate(nn =>
  JSON.parse(JSON.stringify(window.__calls.filter(c => c.name === nn).slice(-1)[0] || null)), n);

console.log("■ 立ち上がり");
ok("本番として動く", await p.evaluate(() => Backend.isGas()) === true);
ok("apiBoot を呼ぶ", (await calls()).indexOf("apiBoot") >= 0, await calls());
ok("apiReadYear を呼ぶ", (await calls()).indexOf("apiReadYear") >= 0);
ok("apiReadWeek を呼ぶ", (await calls()).indexOf("apiReadWeek") >= 0);

console.log("\n■ シートの値がコードの既定に勝つ");
ok("時程はシートの5行になる", await p.evaluate(() => SLOTS.length) === 5,
   await p.evaluate(() => SLOTS.map(s => s.id)));
ok("時刻もシートのもの", await p.evaluate(() => SLOT_BY_ID.p1.time) === "8:40〜9:25");
ok("教科はシートの3つ", await p.evaluate(() => SUBJECTS.length) === 3);
ok("用紙・余白・倍率もシートのもの",
   await p.evaluate(() => db.settings.paper + "/" + db.settings.margin + "/" + db.settings.k)
     === "A4/12/0.95",
   await p.evaluate(() => [db.settings.paper, db.settings.margin, db.settings.k]));
ok("時数コピーの形もシートのもの",
   await p.evaluate(() => db.settings.tally.anchor) === "D3"
   && await p.evaluate(() => db.settings.tally.block) === 12);

console.log("\n■ 学級編成もシートから");
ok("1年が2クラス・5年が4クラス",
   await p.evaluate(() => classesOfGrade("1").length) === 2
   && await p.evaluate(() => classesOfGrade("5").length) === 4,
   await p.evaluate(() => Y().classes));
ok("入口のタイルもその数",
   await p.locator(".tile.cls").count() === 6,
   await p.locator(".tile.cls").count());
ok("専科は1つ", await p.locator(".tile.sp").count() === 1);
ok("見本の基本時間割を入れない（シートが正本）",
   await p.evaluate(() => Object.keys(Y().base).join(",")) === "5-1",
   await p.evaluate(() => Object.keys(Y().base)));

console.log("\n■ 書いたコマがサーバへ差分で届く");
await p.locator(".tile[data-c='5-1']").click();
await p.waitForTimeout(400);
ok("紙は5行ぶんになる", await p.locator("#sheet .cell").count() === 25,
   await p.locator("#sheet .cell").count());
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(1200);                       /* まとめ送りを待つ */
const wc = await lastCall("apiWriteCells");
ok("apiWriteCells が呼ばれる", !!wc, wc);
ok("1件だけ送る（打つたびに送らない）", wc && wc.args[1].length === 1, wc && wc.args[1]);
const q = wc && wc.args[1][0];
ok("層と対象が正しい", q && q.layer === "home" && q.target === "5-1", q);
ok("日付は曜日ではなく実日付", q && /^\d{4}-\d{2}-\d{2}$/.test(q.date), q && q.date);
ok("題名と教科が入る", q && q.title === "算数" && q.subject === "sansu", q);
ok("サーバが打った時刻で手元を直す",
   await p.evaluate(() => week().home["5-1"]["1|p2"].at) === 1700000000000,
   await p.evaluate(() => week().home["5-1"]["1|p2"]));

console.log("\n■ まとめ送り");
await p.evaluate(() => { window.__calls.length = 0; });
for(const d of [0, 2, 3]){
  await p.locator("#sheet .cell[data-d='" + d + "'][data-s='p1'] .t").click();
  await p.waitForTimeout(80);
  await p.locator(".pal[data-v='kokugo']").click();
  await p.waitForTimeout(80);
}
await p.waitForTimeout(1200);
const many = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1].length));
ok("3コマを1回で送る", many.length === 1 && many[0] === 3, many);

console.log("\n■ 入れる先を変えると層も変わる");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pScope input[value='grade']").check();
await p.locator(".pal[data-v='kokugo']").click();
await p.waitForTimeout(1200);
const gq = (await lastCall("apiWriteCells")).args[1][0];
ok("学年に反映すると層は grade・対象は学年",
   gq.layer === "grade" && gq.target === "5", gq);

console.log("\n■ 空にすると消す指示が届く");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pClear").click();
await p.waitForTimeout(1200);
const dq = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("消す指示になる", dq.remove === true || (!dq.title && !dq.note), dq);

console.log("\n■ 学級編成を直すとシートへ書く");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("[data-act='roster']").click();
await p.waitForTimeout(250);
await p.locator("#rsRows input[data-g='1']").fill("1-1, 1-2, 1-3");
await p.locator("#rsRows input[data-g='1']").press("Enter");
await p.waitForTimeout(400);
const rq = await lastCall("apiWriteRoster");
ok("apiWriteRoster が呼ばれる", !!rq);
ok("直した編成が届く", rq && rq.args[1]["1"].length === 3, rq && rq.args[1]);

await p.locator("#rsClose").click(); await p.waitForTimeout(200);

console.log("\n■ たんぽぽ交流級もシートで持つ");
ok("シートの印がそのまま選択になる",
   JSON.stringify(await p.evaluate(() => tpChosen())) === JSON.stringify(["5-1"]),
   await p.evaluate(() => tpChosen()));
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.tp").click(); await p.waitForTimeout(300);
await p.locator("#tpSel .tpchip[data-c='5-2']").click(); await p.waitForTimeout(300);
const tq = await lastCall("apiWriteRoster");
ok("選び直すとシートへ書く",
   !!tq && JSON.stringify(tq.args[4]) === JSON.stringify(["5-1","5-2"]),
   tq && tq.args[4]);
await p.locator("[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n■ 週を動かすと、その週を読みに行く");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#nextWk").click();
await p.waitForTimeout(500);
ok("次の週で apiReadWeek を呼ぶ",
   (await calls()).indexOf("apiReadWeek") >= 0, await calls());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#prevWk").click();
await p.waitForTimeout(500);
ok("一度読んだ週は読み直さない（同じ週で往復しない）",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
