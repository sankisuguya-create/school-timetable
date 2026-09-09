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
      file: "週案 2026（高木北）",
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
        {code:"rika",   name:"理科", short:"理", count:true},
        {code:"gyoji",  name:"行事", short:"",   count:false}
      ]
    },
    year: {
      roster: {
        classes: {"1":["1-1","1-2"], "5":["5-1","5-2","5-3","5-4"]},
        specials: [{code:"ongaku", label:"音楽"}],
        week1: "2026-04-06",
        tanpopo: {"1":["5-1"]}
      },
      base: {"5-1": {A: {"0|p1": {title:"国語", subject:"kokugo"}}}}
    },
    week: {
      school: {}, grade: {},  special: {},
      home: {"5-1": {}}
    }
  };
  /* 偽のシート。**開き直しても残る**ようにしておく（本物のシートと同じ） */
  const SHEET_KEY = "fake-sheet";
  window.__sheet = () => {
    try{ return JSON.parse(localStorage.getItem(SHEET_KEY) || "{}"); }catch(e){ return {}; }
  };
  window.__sheetSet = v => {
    try{ localStorage.setItem(SHEET_KEY, JSON.stringify(v)); }catch(e){}
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
      apiBoot(y){
        /* 本番と同じく、年度を渡されたら学級編成と基本時間割も一緒に返す */
        const r = Object.assign({}, DATA.boot,
                    y ? {year:y, roster:DATA.year.roster, base:DATA.year.base} : {});
        call("apiBoot", [y], r);
        setTimeout(() => okFn(r), 0);
      },
      apiReadYear(y){ const r = call("apiReadYear", [y], DATA.year); setTimeout(() => okFn(r), 0); },
      apiReadWeek(y, m, t){
        /* **本番と同じ形で返す。** 画面は「何日目|時程」でコマを持つので、
           日付で覚えているものをここで直して返す（Store.readWeek と同じ） */
        const out = {school:{}, grade:{}, special:{}, home:{}};
        const mon = Date.parse(m + "T00:00:00");
        const store = window.__sheet();
        for(const key in store){
          const p = key.split("\u0001");           /* 年度・層・対象 */
          if(String(p[0]) !== String(y)) continue;
          if(t && t.length && !t.some(x => x.layer === p[1] && (x.target || "") === p[2])) continue;
          const bank = store[key];
          for(const dk in bank){
            const q = dk.split("|");
            const off = Math.round((Date.parse(q[0] + "T00:00:00") - mon) / 86400000);
            if(off < 0 || off > 6) continue;
            const kk = off + "|" + q[1];
            if(p[1] === "school") out.school[kk] = bank[dk];
            else if(p[1] === "grade") (out.grade[p[2]] || (out.grade[p[2]] = {}))[kk] = bank[dk];
            else if(p[1] === "special") (out.special[p[2]] || (out.special[p[2]] = {}))[kk] = bank[dk];
            else (out.home[p[2]] || (out.home[p[2]] = {}))[kk] = bank[dk];
          }
        }
        call("apiReadWeek", [y, m, t], out);
        /* __lag に週を書いておくと、その週の返事だけ遅れる
           （校内の回線では、古い週の返事があとから届くことがある） */
        const lag = (window.__lag && window.__lag[m]) || window.__slow || 0;
        setTimeout(() => okFn(out), lag);
      },
      apiWriteCells(y, patches){
        call("apiWriteCells", [y, patches]);
        /* __hang のあいだは返事をしない（送れないまま閉じた形を作る） */
        if(window.__hang) return;
        /* シートに入ったことにして覚える */
        const st = window.__sheet();
        for(const q of patches){
          const key = [y, q.layer, q.target || ""].join("\u0001");
          const bank = st[key] || (st[key] = {});
          const dk = q.date + "|" + q.slot;
          if(q.remove || (!q.title && !q.note)) delete bank[dk];
          else bank[dk] = {title:q.title, note:q.note, subject:q.subject || null,
                           sp:q.sp || "", at:1700000000000, by:"tanaka@edu.nishi.or.jp"};
        }
        window.__sheetSet(st);
        const at = {};
        for(const q of patches)
          at[[q.date, q.slot, q.layer, q.target].join("|")] = q.remove ? 0 : 1700000000000;
        /* 本番と同じ形で返す。**時間も返す**（管理・システムに出る） */
        const names = {};
        for(const q of patches) names[q.layer + "|" + (q.target || "")] = 1;
        setTimeout(() => okFn({at, count:patches.length, sheets:Object.keys(names).length,
                               ms:120, waitMs:40}), 0);
      },
      apiWriteRoster(y, c, s, w, tp){ call("apiWriteRoster", [y, c, s, w, tp]); setTimeout(() => okFn({}), 0); },
      apiWriteBase(y, c, v, bank){ call("apiWriteBase", [y, c, v, bank]); setTimeout(() => okFn(true), 0); },
      apiWriteBaseAll(y, table){
        call("apiWriteBaseAll", [y, table]);
        setTimeout(() => okFn({classes:Object.keys(table).length}), 0);
      },
      /* 年度の退避。**数える → 照合する → 消す**。
         照合は、退避先のURLが貼られていて、それが本体と違うときだけ通す */
      apiArchiveCount(y){
        call("apiArchiveCount", [y]);
        setTimeout(() => okFn({year:y, rows:1200, cells:1100, file:"週案 2026年度",
          from:"2025-04-07", to:"2026-03-20", done:window.__arcDone || null,
          sheets:[{name:"週案 5-3", rows:800, cells:760},
                  {name:"週案 5年",  rows:400, cells:340}]}), 0);
      },
      apiArchiveVerify(y, url){
        call("apiArchiveVerify", [y, url]);
        const same = String(url).indexOf("HONTAI") >= 0;
        setTimeout(() => okFn(same
          ? {ok:false, why:["貼られたURLが、いま開いているファイルそのものです"]}
          : {ok:true, why:[], there:{file:"週案 保存 2025年度", id:"COPY", rows:1200}}), 0);
      },
      apiArchivePurge(y, url, typed){
        call("apiArchivePurge", [y, url, typed]);
        if(String(typed) !== String(y))
          return void setTimeout(() => ngFn(
            new Error("消す前に、年度（" + y + "）をそのまま打ち込んでください")), 0);
        window.__arcDone = {year:y, url, at:"2027-03-28 17:20",
                            by:"tanaka@edu.nishi.or.jp", rows:1200, cells:1100};
        setTimeout(() => okFn({year:y, sheets:2, rows:1200, cells:1100,
          at:"2027-03-28 17:20", by:"tanaka@edu.nishi.or.jp", url}), 0);
      },
      apiCheckYear(y){
        call("apiCheckYear", [y]);
        setTimeout(() => okFn({year:y, ng:1, warn:1, file:"週案 2026（高木北）", items:[
          {level:"ok",   what:"クラス",     detail:"20組（1・2・3・4・5・6年）", fix:""},
          {level:"ng",   what:"基本時間割", detail:"A週が空：5-4", fix:"表から取り込む"},
          {level:"warn", what:"たんぽぽ",   detail:"交流級が1つも選ばれていない", fix:"人数を入れる"}
        ]}), 0);
      },
      apiShapeTanpopo(m){
        call("apiShapeTanpopo", [m]);
        setTimeout(() => okFn({file:"たんぽぽ時間割", sheet:"週案", sheets:["週案"],
          rows:86, cols:34, days:[], marks:[], classCols:0,
          note:["A列に日付が見つかりません"]}), 0);
      },
      apiBuildTanpopo(y, m, counts, slots){
        call("apiBuildTanpopo", [y, m, counts, slots]);
        setTimeout(() => okFn({file:"たんぽぽ時間割", sheet:"週案", cols:3, staff:0,
          rows:81, backup:"週案（前の形 1116-0900）", list:["5-1","5-2","5-2"]}), 0);
      },
      apiExportTanpopo(y, m, titles, classes, slots){
        call("apiExportTanpopo", [y, m, titles, classes, slots]);
        setTimeout(() => okFn({wrote:60, days:5, skipped:[], unknown:[], file:"たんぽぽ時間割"}), 0);
      },
      apiReadPaste(){
        const g = call("apiReadPaste", [], [
          ["", "", "月", "", "", ""],
          ["", "", "1", "", "2", ""],
          ["", "", "A", "B", "A", "B"],
          ["5-1", "", "国", "", "算", "理"]
        ]);
        setTimeout(() => okFn(g), 0);
      }
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
ok("年度のぶんも同じ1回でもらう（別に取りに行かない）",
   (await calls()).indexOf("apiReadYear") < 0
   && (await lastCall("apiBoot")).args[0] === 2026,
   [await calls(), (await lastCall("apiBoot")).args]);
/* 入口を出すのに週案は要らない。**開いた画面のぶんだけ、あとから読む。** */
ok("入口を出すだけなら週は読まない",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());

console.log("\n■ シートの値がコードの既定に勝つ");
ok("時程はシートの5行になる", await p.evaluate(() => SLOTS.length) === 5,
   await p.evaluate(() => SLOTS.map(s => s.id)));
ok("時刻もシートのもの", await p.evaluate(() => SLOT_BY_ID.p1.time) === "8:40〜9:25");
ok("教科はシートの4つ", await p.evaluate(() => SUBJECTS.length) === 4);
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

console.log("\n■ 開いた画面に要るシートだけ読む");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".tile[data-c='5-1']").click();
await p.waitForTimeout(400);
const rw = await lastCall("apiReadWeek");
ok("クラスを開くと、その週を読みに行く", !!rw, rw);
ok("読むのは 全校・その学年・そのクラス の3枚だけ",
   rw && JSON.stringify(rw.args[2]) === JSON.stringify([
     {layer:"school", target:""}, {layer:"grade", target:"5"},
     {layer:"home", target:"5-1"}]),
   rw && rw.args[2]);
/* 開いたあと、手が空いているうちに残りも読んでおく */
await p.waitForTimeout(1500);
const pre = await lastCall("apiReadWeek");
ok("開いたあとは、この週の残りも読んでおく（次のクラスを待たせない）",
   !!pre && pre.args[2].length > 3, pre && pre.args[2] && pre.args[2].length);

console.log("\n■ 待っているあいだ、待っていると分かる");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
/* まだ読んでいない週へ移る（入口を見ているあいだは週案を読まない） */
await p.locator("#nextWk").click(); await p.waitForTimeout(300);
await p.locator("#nextWk").click(); await p.waitForTimeout(300);
await p.evaluate(() => { window.__slow = 1500; });      /* 返事が遅い回線 */
await p.locator(".tile[data-c='5-2']").click();
await p.waitForTimeout(300);                            /* まだ返事は来ていない */
ok("押してすぐ紙が出る（返事を待たない）",
   await p.locator("#sheet .cell").count() > 0
   && await p.locator("#gate").isHidden() === true,
   await p.locator("#sheet .cell").count());
ok("待っている印が出る", await p.locator("#busy").isVisible() === true);
ok("何をして待っているかを書く",
   (await p.locator("#busyTxt").innerText()).indexOf("5-2") >= 0,
   await p.locator("#busyTxt").innerText());
ok("画面の上端にも帯を出す（どこを見ていても目に入る）",
   await p.locator(".app").evaluate(e => e.classList.contains("busy-on")) === true);
ok("押したタイルにも手ごたえを出す",
   await p.locator(".tile[data-c='5-2'].opening").count() === 1);
await p.waitForTimeout(1600);
ok("届いたら印は消える", await p.locator("#busy").isHidden() === true);
ok("届いたら帯も消える",
   await p.locator(".app").evaluate(e => e.classList.contains("busy-on")) === false);
ok("届いたらタイルの印も消える", await p.locator(".opening").count() === 0);

console.log("\n■ 次のクラスは待たせない（先に読んでおく）");
await p.evaluate(() => { window.__slow = 0; });
await p.waitForTimeout(1600);                  /* 手が空いたころに残りを読む */
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
ok("2クラス目は読みに行かない（もう手元にある）",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());
ok("2クラス目は待つ印も出ない", await p.locator("#busy").isHidden() === true);
/* もとの週へ戻す */
await p.locator("#prevWk").click(); await p.waitForTimeout(300);
await p.locator("#prevWk").click(); await p.waitForTimeout(400);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);

console.log("\n■ 書いても、押すまで送らない");
ok("紙は5行ぶんになる", await p.locator("#sheet .cell").count() === 25,
   await p.locator("#sheet .cell").count());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(1200);
ok("打っただけでは送らない",
   (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("まだ入っていないコマの数を出す",
   (await p.locator("#saveTxt").innerText()).indexOf("1") >= 0,
   await p.locator("#saveTxt").innerText());
ok("入っていないうちは保存が目立つ",
   await p.locator("#saveBtn").evaluate(e => e.classList.contains("dirty")) === true);

console.log("\n■ 保存を押すと送る");
await p.locator("#saveBtn").click();
await p.waitForTimeout(600);
const wc = await lastCall("apiWriteCells");
ok("apiWriteCells が呼ばれる", !!wc, wc);
ok("1コマは1件（打鍵のぶんだけ増えない）", wc && wc.args[1].length === 1, wc && wc.args[1]);
const q = wc && wc.args[1][0];
ok("層と対象が正しい", q && q.layer === "home" && q.target === "5-1", q);
ok("日付は曜日ではなく実日付", q && /^\d{4}-\d{2}-\d{2}$/.test(q.date), q && q.date);
ok("題名と教科が入る", q && q.title === "算数" && q.subject === "sansu", q);
ok("サーバが打った時刻で手元を直す",
   await p.evaluate(() => week().home["5-1"]["1|p2"].at) === 1700000000000,
   await p.evaluate(() => week().home["5-1"]["1|p2"]));
ok("送り終わったら「保存ずみ」になる",
   (await p.locator("#saveTxt").innerText()).indexOf("ずみ") >= 0,
   await p.locator("#saveTxt").innerText());

console.log("\n■ 同じコマを何度直しても1件");
await p.evaluate(() => { window.__calls.length = 0; });
for(const v of ["kokugo", "sansu", "kokugo"]){
  await p.locator(".pal[data-v='" + v + "']").click();
  await p.waitForTimeout(80);
}
await p.locator("#saveBtn").click(); await p.waitForTimeout(500);
const again = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1].length));
ok("3回直しても送るのは1件", JSON.stringify(again) === JSON.stringify([1]), again);
ok("送るのは最後の中身",
   (await lastCall("apiWriteCells")).args[1][0].title === "国語",
   (await lastCall("apiWriteCells")).args[1][0]);

console.log("\n■ まとめ送り");
await p.evaluate(() => { window.__calls.length = 0; });
for(const d of [0, 2, 3]){
  await p.locator("#sheet .cell[data-d='" + d + "'][data-s='p1'] .t").click();
  await p.waitForTimeout(80);
  await p.locator(".pal[data-v='kokugo']").click();
  await p.waitForTimeout(80);
}
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const many = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1].length));
ok("3コマを1回で送る", many.length === 1 && many[0] === 3, many);

console.log("\n■ 週や画面を変えるときは、押さなくても送る");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(150);
await p.locator("#nextWk").click();
await p.waitForTimeout(600);
ok("週を動かすと、書いたぶんが先に届く",
   (await calls()).indexOf("apiWriteCells") >= 0, await calls());
await p.locator("#prevWk").click(); await p.waitForTimeout(500);

console.log("\n■ 入れる先を変えると層も変わる");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pScope input[value='grade']").check();
await p.locator(".pal[data-v='kokugo']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const gq = (await lastCall("apiWriteCells")).args[1][0];
ok("学年に反映すると層は grade・対象は学年",
   gq.layer === "grade" && gq.target === "5", gq);

console.log("\n■ 空にすると消す指示が届く");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pClear").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
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

console.log("\n■ 固定時間割の取り込み");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("[data-act='base']").click(); await p.waitForTimeout(250);
await p.locator("#baseImp").click(); await p.waitForTimeout(250);
await p.locator("#impSrc button[data-s='sheet']").click(); await p.waitForTimeout(150);
await p.locator("#impRead").click(); await p.waitForTimeout(400);
ok("「シートから」で apiReadPaste を呼ぶ",
   (await calls()).indexOf("apiReadPaste") >= 0, await calls());
ok("シートの表をそのまま読める",
   await p.evaluate(() => (impRes.classes["5-1"].B["0|p2"] || {}).title) === "理科",
   await p.evaluate(() => impRes.classes && impRes.classes["5-1"]));
await p.evaluate(() => { window.__calls.length = 0; });
p.once("dialog", d => d.accept());
await p.locator("#impGo").click(); await p.waitForTimeout(500);
const ba = await lastCall("apiWriteBaseAll");
ok("入れるときは1回でまとめて送る（クラスごとに送らない）",
   !!ba && (await p.evaluate(() =>
     window.__calls.filter(c => c.name === "apiWriteBase").length)) === 0, ba);
ok("A週とB週の両方が届く",
   !!ba && !!ba.args[1]["5-1"].A && !!ba.args[1]["5-1"].B, ba && Object.keys(ba.args[1]));
await p.locator("#baseClose").click(); await p.waitForTimeout(250);

console.log("\n■ たんぽぽの組もシートで持つ");
ok("シートの組がそのまま画面の組になる",
   JSON.stringify(await p.evaluate(() => Y().tanpopo)) === JSON.stringify({"1":["5-1"]}),
   await p.evaluate(() => Y().tanpopo));
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.tp").click(); await p.waitForTimeout(300);
await p.locator("#tpSel .tpchip[data-c='5-2']").click(); await p.waitForTimeout(300);
const tq = await lastCall("apiWriteRoster");
ok("入れるとシートへ書く（組ごとの並びで）",
   !!tq && JSON.stringify(tq.args[4]) === JSON.stringify({"1":["5-1","5-2"]}),
   tq && tq.args[4]);
/* **同じ組へ2回入れれば2人。** 前のクリック切り替えはもう無い */
await p.locator("#tpSel .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("同じ組へ2回入れると2人になる", await p.evaluate(() => tpCount("5-2")) === 2,
   await p.evaluate(() => tpCount("5-2")));
ok("2人ぶんが2列として並ぶ",
   (await p.evaluate(() => tpColumns())).filter(x => x.cls === "5-2").length === 2,
   await p.evaluate(() => tpColumns()));
await p.locator("#tpSel .tpin[data-g='1'][data-i='2']").click(); await p.waitForTimeout(250);
ok("組の中の1人を押すと外れる", await p.evaluate(() => tpCount("5-2")) === 1,
   await p.evaluate(() => Y().tanpopo));
/* 2組へも入れて、出す並びが 1組 → 2組 になることを見る */
await p.locator("#tpSel .tpghead[data-g='2']").click(); await p.waitForTimeout(150);
await p.locator("#tpSel .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("たんぽぽ1組の全員 → 2組の全員 の順に並ぶ",
   JSON.stringify(await p.evaluate(() => tpColumns()))
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   await p.evaluate(() => tpColumns()));
ok("シートには組の番号が届く",
   JSON.stringify((await lastCall("apiWriteRoster")).args[4])
     === JSON.stringify({"1":["5-1","5-2"], "2":["5-2"]}),
   (await lastCall("apiWriteRoster")).args[4]);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n■ たんぽぽ時間割へ出す");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; });
p.once("dialog", d => d.accept());
await p.locator("#tpGo").click(); await p.waitForTimeout(900);
const tp = await lastCall("apiExportTanpopo");
ok("apiExportTanpopo を呼ぶ", !!tp, await calls());
ok("出す前に、書いたぶんを先に送る",
   (await calls()).indexOf("apiWriteCells") <
   (await calls()).indexOf("apiExportTanpopo")
   || (await calls()).indexOf("apiWriteCells") < 0, await calls());
/* 出す中身は交流級だけで決まる（どの組かは列の並びの話）。
   **人数はそのまま渡す。** あちらの列の数と合っているかを見るため */
ok("交流級ごとの人数を渡す（2人いれば2列いる）",
   !!tp && JSON.stringify(tp.args[3]) === JSON.stringify({"5-1":1, "5-2":2}),
   tp && tp.args[3]);
ok("紙に出ているとおりの授業名を渡す（月〜金ぶん）",
   !!tp && Object.keys(tp.args[2]["5-1"]).length === 5, tp && tp.args[2]["5-1"]);
/* この学校の時程は授業が3コマしかない。**時程シートの授業の行に合わせる** */
ok("校時のIDは時程シートから決める",
   !!tp && JSON.stringify(tp.args[4]) === JSON.stringify(["p1", "p2", "p3"]),
   tp && tp.args[4]);
ok("出したあと、何コマ入ったかを出す",
   (await p.locator("#tpWarn").innerText()).indexOf("60") >= 0,
   await p.locator("#tpWarn").innerText());
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n■ たんぽぽ時間割の形を、みる・作りなおす");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#tpShape").click(); await p.waitForTimeout(400);
ok("「いまの形をみる」で apiShapeTanpopo を呼ぶ",
   (await calls()).indexOf("apiShapeTanpopo") >= 0, await calls());
const shOut = await p.locator("#tpShapeOut").innerText();
ok("何行×何列か・骨や見出しがあるかを、そのまま出す",
   shOut.indexOf("86行") >= 0 && shOut.indexOf("交流学級の見出し：0列") >= 0, shOut);
ok("足りないものを名指しする",
   shOut.indexOf("日付が見つかりません") >= 0, shOut);

p.once("dialog", d => d.accept());
await p.locator("#tpBuild").click(); await p.waitForTimeout(500);
const bd = await lastCall("apiBuildTanpopo");
ok("「この形で作りなおす」で apiBuildTanpopo を呼ぶ", !!bd, await calls());
/* **形を作るときは、組ごとの並びをそのまま渡す。**
   出す先の列も 1組の全員 → 2組の全員 … の順になる */
ok("組ごとの並びで渡す",
   !!bd && JSON.stringify(bd.args[2])
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   bd && bd.args[2]);
const bdOut = await p.locator("#tpShapeOut").innerText();
ok("作りなおしたことと、前の形を残したことを出す",
   bdOut.indexOf("作りなおした") >= 0 && bdOut.indexOf("前の形") >= 0, bdOut);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n■ 週を動かすと、その週を読みに行く");
await p.evaluate(() => { window.__calls.length = 0; });
for(let i = 0; i < 5; i++){ await p.locator("#nextWk").click(); await p.waitForTimeout(250); }
await p.waitForTimeout(500);
ok("まだ見ていない週で apiReadWeek を呼ぶ",
   (await calls()).indexOf("apiReadWeek") >= 0, await calls());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#prevWk").click();
await p.waitForTimeout(500);
ok("一度読んだ週は読み直さない（同じ週で往復しない）",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());

console.log("\n■ 送れないまま閉じても、次に開いたときに送る");
/* 送らずに書いたコマを作り、その場で控えができているかを見る */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__hang = true; });   /* 送っても返事が来ない状態 */
await p.locator("#sheet .cell[data-d='0'][data-s='p3'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.waitForTimeout(1300);                 /* 控えを書くのを待つ */
const pend = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("school-timetable/v3/pending") || "null"));
ok("送っていないコマは、この端末に控える",
   !!pend && pend.length === 1 && pend[0].title === "理科", pend);
ok("控えるのは中身ごと（次に開いたとき、読み直しで消えないように）",
   !!pend && pend[0].layer === "home" && pend[0].target === "5-1"
   && /^\d{4}-\d{2}-\d{2}$/.test(pend[0].date), pend && pend[0]);

/* 送らずに閉じたことにして、開き直す */
await p.evaluate(() => { window.__calls.length = 0; });
await p.reload();
await p.waitForTimeout(1200);
const resent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]));
ok("開き直すと、控えていたぶんを送る",
   resent.length === 1 && resent[0].length === 1 && resent[0][0].title === "理科", resent);
ok("週を読み直すより先に送る", await p.evaluate(() => {
     const n = window.__calls.map(c => c.name);
     const w = n.indexOf("apiWriteCells"), r = n.indexOf("apiReadWeek");
     return w >= 0 && (r < 0 || w < r);
   }) === true, await calls());
ok("送れたら控えは消す",
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")) === null,
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")));

console.log("\n■ 古い週の返事が、いま見ている週を消さない");
/* **返事の順序は入れ替わる。** 今週ぶんの返事が来る前に来週へ動くと、
   遅れて届いた今週ぶんが、来週の中身を上書きしてしまう形があった。 */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(400);
/* 来週に1コマ書いて、シート側に入れておく */
await p.locator("#nextWk").click(); await p.waitForTimeout(500);
await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='gyoji']").click(); await p.waitForTimeout(150);
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const nextMon = await p.evaluate(() => wkKey());
await p.locator("#prevWk").click(); await p.waitForTimeout(400);
const thisMon = await p.evaluate(() => wkKey());
/* この端末の控えを捨てて、シートから読み直させる。今週ぶんの返事だけ遅らせる */
await p.evaluate(m => {
  localStorage.removeItem("school-timetable/v3");
  window.__lagNext = m;
}, thisMon);
await p.reload();
await p.waitForTimeout(400);
await p.evaluate(m => { window.__lag = {}; window.__lag[m] = 1500; }, thisMon);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(150);
await p.locator("#nextWk").click();                 /* 今週ぶんの返事はまだ来ていない */
await p.waitForTimeout(2500);
ok("来週を見ているあいだに今週の返事が届いても、来週の中身は消えない",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").innerText()).trim() === "行事",
   [await p.evaluate(() => wkKey()),
    await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").innerText()]);
ok("今週へ戻ると、今週の中身が出る", await (async () => {
  await p.locator("#prevWk").click(); await p.waitForTimeout(700);
  return (await p.evaluate(() => wkKey())) === thisMon;
})() === true);
await p.evaluate(() => { window.__lag = {}; });

console.log("\n■ 書いたコマは、次に開いても残っている");
/* **ここが抜けると、シートには入っているのに基本時間割に戻って見える。**
   書く → 送る → 開き直す → 出る、まで通しで見る */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(500);
await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
ok("送ったコマがシート側に入る",
   await p.evaluate(() => {
     const k = ["2026", "home", "5-3"].join("\u0001");
     const b = window.__sheet()[k] || {};
     return Object.keys(b).some(x => /\|p1$/.test(x) && b[x].title === "理科");
   }) === true, await p.evaluate(() => window.__sheet()));

/* この端末の控えを捨てて、シートから読み直させる */
await p.evaluate(() => { localStorage.removeItem("school-timetable/v3"); });
await p.reload();
await p.waitForTimeout(900);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(900);
ok("開き直しても、書いたコマが出る（基本時間割に戻らない）",
   (await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").innerText()).trim() === "理科",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").innerText());
ok("入れた層のまま戻る（担任が入れたものとして出る）",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1']").getAttribute("data-layer") === "home",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1']").getAttribute("data-layer"));

/* **層と人は別のもの。** シートの「更新者」はメールなので、手元でも
   メールを入れて形をそろえた。そろえて初めて「自分か他人か」を判定できる。 */
console.log("\n■ 自分が入れたコマか、他人が入れたコマか");
ok("開いている人のメールが画面まで届く",
   await p.evaluate(() => myEmail()) === "tanaka@edu.nishi.or.jp",
   await p.evaluate(() => myEmail()));
ok("自分のメールなら自分", await p.evaluate(() => isMe("tanaka@edu.nishi.or.jp")) === true);
ok("大文字小文字は同じものとして見る",
   await p.evaluate(() => isMe("Tanaka@Edu.Nishi.or.jp")) === true);
ok("別の人なら自分ではない", await p.evaluate(() => isMe("suzuki@edu.nishi.or.jp")) === false);
ok("空は自分ではない（分からないときは他人に倒す）",
   await p.evaluate(() => isMe("")) === false);
ok("書いたコマの更新者は、層ではなく人",
   await p.evaluate(() => {
     const w = week(), k = Object.keys(w.home["5-3"] || {})[0];
     return k ? w.home["5-3"][k].by : null;
   }) === "tanaka@edu.nishi.or.jp",
   await p.evaluate(() => {
     const w = week(), k = Object.keys(w.home["5-3"] || {})[0];
     return k ? w.home["5-3"][k] : null;
   }));
/* 学年の面から担任のコマを潰す形で見る（層が違うので、層では除かれない）。
   **同じコマで、更新者だけを入れ替えて比べる。** */
const owFrom = (by) => p.evaluate(who => {
  const w = week(), key = "1|p2", keep = view;
  (w.home["5-3"] || (w.home["5-3"] = {}))[key] =
    {title:"国語", note:"", subject:"kokugo", at:Date.now(), by:who};
  view = {kind:"grade", grade:"5"};
  const n = wouldOverwrite(1, "p2").length;
  view = keep;
  delete w.home["5-3"][key];
  return n;
}, by);
ok("自分が入れたコマなら聞かない", await owFrom("tanaka@edu.nishi.or.jp") === 0,
   await owFrom("tanaka@edu.nishi.or.jp"));
ok("他人が入れたコマなら聞く", await owFrom("suzuki@edu.nishi.or.jp") >= 1,
   await owFrom("suzuki@edu.nishi.or.jp"));
ok("更新者が分からないコマも聞く（他人に倒す）", await owFrom("") >= 1, await owFrom(""));

console.log("\n■ 管理・システム（本番では、どこにつないでいるかが出る）");
await p.locator(".side .admin").click();
await p.waitForTimeout(250);
ok("本番につないでいると言う",
   (await p.locator("#sysTbl").innerText()).indexOf("スプレッドシート") >= 0,
   await p.locator("#sysTbl").innerText());
ok("つないでいるファイルの名前が出る",
   (await p.locator("#sysTbl").innerText()).indexOf("週案 2026（高木北）") >= 0,
   await p.locator("#sysTbl").innerText());
ok("開いている人のメールが出る",
   (await p.locator("#sysTbl").innerText()).indexOf("tanaka@edu.nishi.or.jp") >= 0,
   await p.locator("#sysTbl").innerText());
await p.locator("#adminDlg [data-close]").click();
await p.waitForTimeout(200);

console.log("\n■ 新年度の検査（足りないものだけ名指しする）");
await p.locator(".side .admin").click(); await p.waitForTimeout(200);
await p.locator("#ckGo").click(); await p.waitForTimeout(300);
ok("apiCheckYear を、開いている年度で呼ぶ",
   (await lastCall("apiCheckYear")).args[0] === 2026, await lastCall("apiCheckYear"));
ok("足りないものの件数を言う",
   (await p.locator("#ckStat").innerText()).indexOf("1 件") >= 0,
   await p.locator("#ckStat").innerText());
ok("項目を全部並べる", await p.locator("#ckOut tr").count() === 3,
   await p.locator("#ckOut tr").count());
ok("足りないものは「要る」と出す",
   (await p.locator("#ckOut tr.ng .lv").innerText()).trim() === "要る",
   await p.locator("#ckOut tr.ng .lv").innerText());
ok("直し方も出す",
   (await p.locator("#ckOut tr.ng").innerText()).indexOf("表から取り込む") >= 0,
   await p.locator("#ckOut tr.ng").innerText());
ok("色だけで見分けさせない（字でも書く）", await p.evaluate(() =>
     [...document.querySelectorAll("#ckOut .lv")].every(e => e.innerText.trim().length > 0)) === true);
ok("よい項目は落として出す（読むところを減らす）", await p.evaluate(() => {
     const a = getComputedStyle(document.querySelector("#ckOut tr.ok th")).color;
     const b = getComputedStyle(document.querySelector("#ckOut tr.ng th")).color;
     return a !== b;
   }) === true);
await p.locator("#adminDlg [data-close]").click(); await p.waitForTimeout(200);

/* **速くする改造は、必ず正しさを削る方向に働く。**
   数字が基準（2秒）に届く前に手を入れないための目盛り。 */
console.log("\n■ 保存にかかった時間を、管理・システムに出す");
/* この節の前で開き直しているので、まず1回書いて保存する */
await p.locator("#sheet .cell[data-d='3'][data-s='p2'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(500);
ok("保存すると時間を覚える", await p.evaluate(() => {
     const t = Backend.info().times;
     return !!t && t.n >= 1 && typeof t.round === "number";
   }) === true, await p.evaluate(() => Backend.info().times));
ok("待ちと書き込みを分けて持つ", await p.evaluate(() => {
     const t = Backend.info().times;
     return typeof t.wait === "number" && typeof t.ms === "number";
   }) === true, await p.evaluate(() => Backend.info().times));
await p.locator(".side .admin").click(); await p.waitForTimeout(250);
ok("いちばん遅かったぶんを出す（平均は、たまに出る遅さを隠す）",
   (await p.locator("#sysTbl").innerText()).indexOf("最も遅かった") >= 0,
   await p.locator("#sysTbl").innerText());
ok("何コマ・何シートだったかも出す",
   (await p.locator("#sysTbl").innerText()).indexOf("シート") >= 0,
   await p.locator("#sysTbl").innerText());
await p.locator("#adminDlg [data-close]").click(); await p.waitForTimeout(200);

/* **年度末に、人がドライブで丸ごと複製する。**
   画面は数える・照合する・消すだけ。本体のURLは変わらない。 */
console.log("\n■ 年度の退避（①数える ②複製 ③照合 ④消す）");
await p.locator(".side .admin").click(); await p.waitForTimeout(250);
ok("既定は1つ前の年度",
   await p.evaluate(() => +document.getElementById("arYear").value) === 2025,
   await p.evaluate(() => document.getElementById("arYear").value));
ok("いきなり消せない（②③④は出ていない）",
   await p.evaluate(() => document.getElementById("arStep2").hidden
                       && document.getElementById("arStep4").hidden) === true);

await p.locator("#arCount").click(); await p.waitForTimeout(300);
ok("① 数えると、行数とコマ数と日付の範囲を出す", await (async () => {
     const t = await p.locator("#arOut").innerText();
     return t.indexOf("1200") >= 0 && t.indexOf("1100") >= 0 && t.indexOf("2025-04-07") >= 0;
   })() === true, await p.locator("#arOut").innerText());
ok("シートごとの内わけも出す",
   (await p.locator("#arOut").innerText()).indexOf("週案 5-3") >= 0,
   await p.locator("#arOut").innerText());
ok("数えたあとに ② の手順が出る",
   await p.evaluate(() => !document.getElementById("arStep2").hidden) === true);
ok("複製の名前をこちらで決めて見せる",
   (await p.locator("#arName").innerText()).indexOf("週案 保存 2025年度") >= 0,
   await p.locator("#arName").innerText());
ok("複製元のファイル名も見せる",
   (await p.locator("#arFile").innerText()).indexOf("週案 2026年度") >= 0,
   await p.locator("#arFile").innerText());
ok("デプロイしないことを手順に書く",
   (await p.locator("#arStep2").innerText()).indexOf("デプロイしない") >= 0,
   await p.locator("#arStep2").innerText());
ok("数えただけでは、まだ消せない",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);

/* 本体そのもののURLを貼る事故 */
await p.locator("#arUrl").fill("https://docs.google.com/spreadsheets/d/HONTAI/edit");
await p.locator("#arVerify").click(); await p.waitForTimeout(300);
ok("③ 本体そのものを貼ったら止める",
   (await p.locator("#arWhy").innerText()).indexOf("そのもの") >= 0,
   await p.locator("#arWhy").innerText());
ok("止まったときは ④ を出さない",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);

await p.locator("#arUrl").fill("https://docs.google.com/spreadsheets/d/COPY/edit");
await p.locator("#arVerify").click(); await p.waitForTimeout(300);
ok("③ 合っていれば ④ が出る",
   await p.evaluate(() => !document.getElementById("arStep4").hidden) === true);
ok("何行そろっているかを言う",
   (await p.locator("#arWhy").innerText()).indexOf("1200") >= 0,
   await p.locator("#arWhy").innerText());
ok("年度を打ち込むまで押せない", await p.locator("#arGo").isDisabled() === true);
await p.locator("#arTyped").fill("2026"); await p.waitForTimeout(150);
ok("違う年度を打っても押せない", await p.locator("#arGo").isDisabled() === true);
await p.locator("#arTyped").fill("2025"); await p.waitForTimeout(150);
ok("年度が合えば押せる", await p.locator("#arGo").isDisabled() === false);

await p.locator("#arGo").click(); await p.waitForTimeout(400);
ok("④ 消したら、何を消したかを言う", await (async () => {
     const t = await p.locator("#arWhy").innerText();
     return t.indexOf("1200") >= 0 && t.indexOf("保管庫") >= 0;
   })() === true, await p.locator("#arWhy").innerText());
ok("消したあとは ④ を引っこめる",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);
ok("退避先のURLをそのまま渡す",
   (await lastCall("apiArchivePurge")).args[1].indexOf("COPY") >= 0,
   await lastCall("apiArchivePurge"));
await p.locator("#adminDlg [data-close]").click(); await p.waitForTimeout(200);

/* **退避した年度を開いたら、黙って紙を出さない。**
   週案の行はもう無いので、基本時間割だけの紙が出る。それを黙って出すと
   「週案が全部消えた」と言われる。 */
console.log("\n■ 退避ずみの年度を開いたら、そう言う");
ok("いまの年度（退避していない）では出さない",
   await p.locator("#arcBar").evaluate(e => e.hidden) === true);
await p.evaluate(() => { for(let i = 0; i < 52; i++) goWeek(-7); });
await p.waitForTimeout(600);
ok("週をさかのぼって前年度に入ると出る",
   await p.locator("#arcBar").evaluate(e => e.hidden) === false,
   await p.evaluate(() => fy()));
ok("何年度が退避ずみかを言う",
   (await p.locator("#arcTitle").innerText()).indexOf("2025年度") >= 0,
   await p.locator("#arcTitle").innerText());
ok("いま出ているのが基本時間割だと言う",
   (await p.locator("#arcNote").innerText()).indexOf("基本時間割") >= 0,
   await p.locator("#arcNote").innerText());
ok("誰がいつ退避したかも言う",
   (await p.locator("#arcNote").innerText()).indexOf("2027-03-28") >= 0,
   await p.locator("#arcNote").innerText());
ok("保管庫へのリンクを出す",
   (await p.locator("#arcLink").getAttribute("href")).indexOf("COPY") >= 0,
   await p.locator("#arcLink").getAttribute("href"));
ok("刷るときは出さない（紙の外）", await (async () => {
     await p.emulateMedia({media:"print"});
     const v = await p.evaluate(() =>
       getComputedStyle(document.getElementById("arcBar")).display);
     await p.emulateMedia({media:"screen"});
     return v === "none";
   })() === true);
await p.evaluate(() => { for(let i = 0; i < 52; i++) goWeek(7); });
await p.waitForTimeout(600);
ok("いまの年度へ戻すと消える",
   await p.locator("#arcBar").evaluate(e => e.hidden) === true,
   await p.evaluate(() => fy()));

console.log("\n■ 本番では、古い週の控えを間引く");
ok("いま見ている週は、間引いても残る", await p.evaluate(() => {
     const y = String(fy()), W = db.years[y].weeks, here = wkKey();
     const blank = () => ({school:{},grade:{},special:{},home:{},acked:[],variant:"A"});
     W[here] = W[here] || blank();
     for(const d of ["2000-01-03","2000-01-10","2000-01-17"]) W[d] = blank();
     const n = pruneWeeks(1);
     return n >= 3 && !!W[here] && !W["2000-01-03"];
   }) === true, await p.evaluate(() => Object.keys(db.years[String(fy())].weeks)));
ok("まだ送っていないコマがあるときは、何も捨てない", await p.evaluate(() => {
     const y = String(fy()), W = db.years[y].weeks;
     W["2000-01-03"] = {school:{},grade:{},special:{},home:{},acked:[],variant:"A"};
     /* 未送信を1件作る。**送る前に捨てると、書いた本人にも見えないまま消える** */
     Backend.cellChanged("home", "5-3", 0, "p1");
     const n = pruneWeeks(0);
     const kept = !!W["2000-01-03"];
     delete W["2000-01-03"];
     return n === 0 && kept;
   }) === true);

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
