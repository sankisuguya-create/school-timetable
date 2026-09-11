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
  /* たんぽぽの出す先。**版を上げただけの学校の形**から始める
     ＝出す先シートは空で、設定の たんぽぽファイルID が1本返る（legacy） */
  window.__TPURL = "https://docs.google.com/spreadsheets/d/TPOK1234567890123456789/edit";
  window.__targets = [{name:"たんぽぽ時間割", url:window.__TPURL, def:true, legacy:true}];
  window.__nyTicks = {};
  window.__nyPlan = false;
  window.__nyEvents = false;
  /* 新年度の設定。**本番は checkYear がシートを見て決める。**
     ここでは、押した・貼ったが手順に効くかどうかだけを見る */
  window.__nySetup = y => {
    const T = window.__nyTicks || {};
    const it = (key, group, label, level, act, hand) =>
      ({key, group, label, level, detail:"いまの状態", fix:"こうする", act, hand:!!hand,
        why:"やらないとこうなる、という理由", mins:3,
        undo: key === "arc.purge"
              ? "**ここだけは元に戻せません。**複製にはそのまま残っています。"
              : "戻せます。やり直せます。",
        wait:"",
        by: hand && T[key] ? "tanaka@edu.nishi.or.jp" : "",
        at: hand && T[key] ? "2027-04-02 09:00" : ""});
    const items = [
      it("arc.count",  "① 前年度を退避する", "前年度の週案の量を数える", "ok", "admin"),
      it("arc.copy",   "① 前年度を退避する", "ドライブで、このファイルを丸ごと複製する",
         T["arc.copy"] ? "ok" : "ng", "admin", true),
      it("arc.verify", "① 前年度を退避する", "複製と本体を照合する", "ok", "admin"),
      it("arc.purge",  "① 前年度を退避する", "本体から前年度の行を消す", "ok", "admin"),
      it("roster",   "② 新年度のかたちを入れる", "学級編成を新年度に直す", "ok", "roster"),
      it("specials", "② 新年度のかたちを入れる", "専科の担当を新年度の人に直した",
         T["specials"] ? "ok" : "ng", "roster", true),
      it("week1",    "② 新年度のかたちを入れる", "第1週の月曜を入れる", "ok", "roster"),
      it("base",     "② 新年度のかたちを入れる", "基本時間割をA週B週とも入れる", "ok", "base"),
      it("events",   "③ 外とつなぐ", "年間行事計画表を貼り替える",
         window.__nyEvents ? "ok" : "ng", "events"),
      it("variant",  "③ 外とつなぐ", "A週B週が年間行事と合っているか確かめる", "ok", "ab"),
      it("tanpopo",  "③ 外とつなぐ", "たんぽぽの交流級と出す先を直す", "ok", "tanpopo"),
      it("plan",     "④ 担任が開ける形にする", "週案シートを作る",
         window.__nyPlan ? "ok" : "ng", "plan")
    ];
    /* **順番を飛ばせないようにする。** 前の段に「まだ」が残っているあいだ、
       次の段は wait を立てる（本番の Store.yearSetup と同じ決まり） */
    let blocked = "";
    for(const x of items){
      x.wait = blocked && x.group !== blocked ? blocked : "";
      if(x.level === "ng" && !blocked) blocked = x.group;
    }
    for(const x of items) if(x.group === blocked) x.wait = "";
    const ng = items.filter(x => x.level === "ng").length;
    const next = items.filter(x => x.level === "ng")[0];
    return {year:y, prev:y - 1, items, ng, done: ng === 0,
            next: next ? next.key : "", file:"週案 2026（高木北）"};
  };
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
      events: {"2026-09-08": {c:"校外学習6年(奈良)", s:"職員会議15:00", w:"A"}},
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
  /* **ほかの先生が、この画面を通さずにシートを直した形を作る。**
     競合はこれでしか作れない（同じ画面から2回書いても競合しない）。 */
  window.__other = (y, layer, target, date, slot, title) => {
    const st = window.__sheet();
    const key = [y, layer, target || ""].join("\u0001");
    const bank = st[key] || (st[key] = {});
    /* **書くたびに時刻を進める。** 同じ時刻のままだと、
       読み直したあとの画面と一致してしまい、2度目の競合が作れない。 */
    const t = 1700000009999 + (window.__otherN = (window.__otherN || 0) + 1);
    bank[date + "|" + slot] = {title, note:"", subject:null, sp:"",
                               at:t, sat:t, by:"sato@edu.nishi.or.jp"};
    window.__sheetSet(st);
    return t;
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
                    y ? {year:y, roster:DATA.year.roster, base:DATA.year.base,
                         events:DATA.year.events} : {});
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
        /* __slowWrite のあいだは返事が遅れる（処理中の全面表示を見るため） */
        const wlag = window.__slowWrite || 0;
        /* __failWrite のあいだは必ず失敗する（回線が落ちている形を作る） */
        if(window.__failWrite){
          setTimeout(() => ngFn(new Error("通信できない")), 0);
          return;
        }
        /* シートに入ったことにして覚える。
           **本番と同じく expectedAt を見る**（→ gas/Store.gs writeCells）。
           古い状態からの保存はコマ単位で止めて conflicts で返す。 */
        const st = window.__sheet();
        const at = {}, conflicts = [];
        for(const q of patches){
          const key = [y, q.layer, q.target || ""].join("\u0001");
          const bank = st[key] || (st[key] = {});
          const dk = q.date + "|" + q.slot;
          const cur = bank[dk] || null;
          const curAt = !cur ? 0 : (cur.at || -1);
          if(q.expectedAt !== undefined && q.expectedAt !== null
             && curAt !== (+q.expectedAt || 0)){
            conflicts.push({date:q.date, slot:q.slot, layer:q.layer,
                            target:q.target || "", expectedAt:+q.expectedAt || 0,
                            currentAt:curAt,
                            currentTitle: cur ? (cur.title || "") : "",
                            currentNote:  cur ? (cur.note  || "") : "",
                            currentBy:    cur ? (cur.by    || "") : ""});
            continue;                      /* このコマは書かない */
          }
          const now = window.__now || 1700000000000;
          if(q.remove || (!q.title && !q.note)) delete bank[dk];
          else bank[dk] = {title:q.title, note:q.note, subject:q.subject || null,
                           sp:q.sp || "", at:now, sat:now, by:"tanaka@edu.nishi.or.jp"};
          at[[q.date, q.slot, q.layer, q.target].join("|")] = q.remove ? 0 : now;
        }
        window.__sheetSet(st);
        /* 本番と同じ形で返す。**時間も返す**（管理・システムに出る） */
        const names = {};
        for(const q of patches) names[q.layer + "|" + (q.target || "")] = 1;
        setTimeout(() => okFn({at, count:patches.length - conflicts.length,
                               asked:patches.length, conflicts,
                               sheets:Object.keys(names).length,
                               ms:120, waitMs:40}), wlag);
      },
      apiWriteRoster(y, c, s, w, tp){ call("apiWriteRoster", [y, c, s, w, tp]); setTimeout(() => okFn({}), 0); },
      /* たんぽぽの出す先。**1本とはかぎらない。** */
      apiTpTargets(){
        call("apiTpTargets", []);
        const r = window.__targets || [];
        setTimeout(() => okFn(r.map(x => Object.assign({}, x))), 0);
      },
      apiWriteTpTargets(list){
        call("apiWriteTpTargets", [list]);
        if((list || []).some(x => !/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/.test(String(x.url || ""))
                                  && !/^[A-Za-z0-9_-]{20,}$/.test(String(x.url || ""))))
          return void setTimeout(() => ngFn(new Error("「URL」が読めません")), 0);
        window.__targets = (list || []).map(x => Object.assign({}, x));
        setTimeout(() => okFn({saved:(list || []).length}), 0);
      },
      apiTestTpTarget(url){
        call("apiTestTpTarget", [url]);
        setTimeout(() => okFn(/TPOK/.test(String(url))
          ? {ok:true, file:"たんぽぽ時間割", sheets:3}
          : {ok:false, why:"開けません"}), 0);
      },
      /* 新年度の設定。**手順と、いまどこまで済んでいるか。** */
      apiYearSetup(y){
        call("apiYearSetup", [y]);
        setTimeout(() => okFn(window.__nySetup(y)), 0);
      },
      apiTickYearSetup(y, key, on){
        call("apiTickYearSetup", [y, key, on]);
        if(["arc.copy", "specials"].indexOf(key) < 0)
          return void setTimeout(() => ngFn(new Error("記録できない手順です")), 0);
        (window.__nyTicks || (window.__nyTicks = {}))[key] = !!on;
        setTimeout(() => okFn(window.__nySetup(y)), 0);
      },
      apiSetupPlanSheets(y){
        call("apiSetupPlanSheets", [y]);
        window.__nyPlan = true;
        setTimeout(() => okFn({made:["週案 全校", "週案 5-1"]}), 0);
      },
      apiWriteVariantOrigin(m){
        call("apiWriteVariantOrigin", [m]);
        setTimeout(() => okFn({saved:m}), 0);
      },
      apiWriteEvents(rows){
        call("apiWriteEvents", [rows]);
        window.__nyEvents = true;
        setTimeout(() => okFn({rows:(rows || []).length - 1, sheet:"行事取り込み",
                               stash:"行事取り込み 前の 2026-09-10"}), 0);
      },
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
      /* たんぽぽへは**1週1シート**で出す。名前は「◯月◯週」。
         同じ名前のシートがあれば、消さずに名前を変えて残す */
      apiExportWeek(y, m, titles, cols, slots, name){
        call("apiExportWeek", [y, m, titles, cols, slots, name]);
        setTimeout(() => okFn({file:"たんぽぽ時間割", sheet:name, cols:3, staff:0,
          rows:81, days:5, wrote:60, empty:30, colW:50,
          backup:name + "（前の 1116-0900）", list:["5-1","5-2","5-2"]}), 0);
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
ok("紙は5行ぶん × 月〜土の6列", await p.locator("#sheet .cell").count() === 30,
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

/* **一連。** 通常の保存 → ほかの先生が先に直す → 競合 → 上書きで送り直す。
   1つずつ確かめても、つなぐと落ちる（控えた物差しが打鍵で進む、
   競合したぶんが送信の列から消える、など）。 */
console.log("\n■ 通常保存 → 競合 → それでも上書き");
await p.evaluate(() => { window.__calls.length = 0; });
const CELL = "#sheet .cell[data-d='3'][data-s='p3']";
await p.locator(CELL + " .t").click(); await p.waitForTimeout(150);
await p.locator("#pScope input[value='self']").check();
await p.locator(".pal[data-v='kokugo']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const c1 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("はじめの保存は expectedAt 0（まだ誰も書いていない）", c1.expectedAt === 0, c1);
ok("そのまま入る", await p.locator("#cfDlg").isVisible() === false);

/* ほかの先生が、この画面を通さずに同じコマを直した */
const theDate = await p.evaluate(() => iso(addDays(monday, 3)));
const oAt1 = await p.evaluate(([d]) =>
  window.__other(fy(), "home", "5-1", d, "p3", "行事（佐藤）"), [theDate]);

await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(CELL + " .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(700);
const c2 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("2回目は、はじめに知っていた時刻を送る", c2.expectedAt === 1700000000000, c2);
ok("**打鍵のたびに物差しが進んでいない**", c2.expectedAt !== 0 && c2.title === "算数", c2);
ok("競合の窓が出る", await p.locator("#cfDlg").isVisible() === true);
ok("いま入っている中身を出す",
   (await p.locator("#cfList").innerText()).indexOf("行事（佐藤）") >= 0,
   await p.locator("#cfList").innerText());
ok("自分が入れようとした中身も出す",
   (await p.locator("#cfList").innerText()).indexOf("算数") >= 0,
   await p.locator("#cfList").innerText());
ok("**既定は「最新の内容を見る」**",
   await p.evaluate(() => document.activeElement && document.activeElement.id) === "cfSee",
   await p.evaluate(() => document.activeElement && document.activeElement.id));

/* ケース：Esc で閉じる。**上書きしない側に落ちる。** */
await p.evaluate(() => { window.__calls.length = 0; });
await p.keyboard.press("Escape");
await p.waitForTimeout(800);
ok("Esc は「最新の内容を見る」に落ちる",
   (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("そのとき週を読み直す", (await calls()).indexOf("apiReadWeek") >= 0, await calls());
ok("画面はほかの先生の内容になる",
   (await p.locator(CELL + " .t").innerText()).indexOf("行事") >= 0,
   await p.locator(CELL + " .t").innerText());
ok("送っていないコマは残っていない",
   (await p.locator("#saveTxt").innerText()).indexOf("ずみ") >= 0,
   await p.locator("#saveTxt").innerText());

/* ケース：もう一度ぶつけて、今度は「それでも自分の内容で上書きする」 */
const oAt2 = await p.evaluate(([d]) =>
  window.__other(fy(), "home", "5-1", d, "p3", "行事（佐藤・2）"), [theDate]);
ok("ほかの先生は違う時刻で書いた（読み直したあとの画面とは食い違う）",
   oAt2 > oAt1, [oAt1, oAt2]);
await p.locator(CELL + " .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(700);
ok("もう一度競合する", await p.locator("#cfDlg").isVisible() === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#cfMine").click();
await p.waitForTimeout(1200);
const c3 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("上書きを選ぶと送り直す", !!c3, c3);
ok("**送り直しは、いまサーバにある時刻で送る**",
   c3 && c3.expectedAt === oAt2, [c3, oAt2]);
ok("force のような合図は足さない", c3 && c3.force === undefined, c3);
ok("送るのは自分の内容", c3 && c3.title === "理科", c3);
ok("送り直す前に読み直している",
   (await calls()).indexOf("apiReadWeek") >= 0
   && (await calls()).indexOf("apiReadWeek") < (await calls()).lastIndexOf("apiWriteCells"),
   await calls());
ok("入ったので窓は閉じている", await p.locator("#cfDlg").isVisible() === false);
ok("画面は自分の内容になる",
   (await p.locator(CELL + " .t").innerText()).indexOf("理科") >= 0,
   await p.locator(CELL + " .t").innerText());

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

await p.locator("#rosterDlg .dlgx").click(); await p.waitForTimeout(200);

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
await p.locator("#baseDlg .dlgx").click(); await p.waitForTimeout(250);

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

console.log("\n■ たんぽぽ時間割へ出す（1週1シート）");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; });
let nativeConfirm = false;
const onDlg = async d => { nativeConfirm = true; await d.dismiss(); };
p.on("dialog", onDlg);
await p.locator("#tpGo").click(); await p.waitForTimeout(400);
p.off("dialog", onDlg);
ok("ブラウザの confirm ではなく、専用の窓で聞く",
   nativeConfirm === false && await p.locator("#tpDlg").evaluate(d => d.open) === true);
ok("既定は「出さない」", await p.evaluate(() =>
   document.activeElement && document.activeElement.id) === "tpNo");
ok("「出さない」を押したら1回も呼ばない", await (async () => {
     await p.locator("#tpNo").click(); await p.waitForTimeout(400);
     return (await calls()).indexOf("apiExportWeek") < 0;
   })() === true, await calls());

await p.locator("#tpGo").click(); await p.waitForTimeout(300);
await p.locator("#tpYes").click(); await p.waitForTimeout(900);
const tp = await lastCall("apiExportWeek");
ok("apiExportWeek を呼ぶ", !!tp, await calls());
ok("出す前に、書いたぶんを先に送る",
   (await calls()).indexOf("apiWriteCells") <
   (await calls()).indexOf("apiExportWeek")
   || (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("紙に出ているとおりの授業名を渡す（月〜金ぶん）",
   !!tp && Object.keys(tp.args[2]["5-1"]).length === 5, tp && tp.args[2]["5-1"]);
/* **組ごとの並びをそのまま渡す。** 出す先の列も 1組の全員 → 2組の全員 … の順になる */
ok("組ごとの並びで渡す",
   !!tp && JSON.stringify(tp.args[3])
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   tp && tp.args[3]);
/* この学校の時程は授業が3コマしかない。**時程シートの授業の行に合わせる** */
ok("校時のIDは時程シートから決める",
   !!tp && JSON.stringify(tp.args[4]) === JSON.stringify(["p1", "p2", "p3"]),
   tp && tp.args[4]);
ok("シート名「◯月◯週」も渡す", !!tp && /^\d+月\d+週$/.test(String(tp.args[5])),
   tp && tp.args[5]);
const tpOut = await p.locator("#tpWarn").innerText();
ok("出したあと、どのシートに入ったかを出す", tpOut.indexOf("シート「") >= 0, tpOut);
ok("何コマ入ったかも出す", /授業名 \d+ コマ/.test(tpOut), tpOut);
ok("同じ名前のシートを残したことも出す",
   tpOut.indexOf("名前を変えて残した") >= 0, tpOut);
ok("週の順に並ぶことを出す", tpOut.indexOf("週の順") >= 0, tpOut);
ok("児童の列の幅も出す（設定から変えられる）",
   tpOut.indexOf("50px") >= 0 && tpOut.indexOf("たんぽぽ列幅") >= 0, tpOut);

console.log("\n■ 「いまの形をみる」「作りなおす」は無くした");
ok("画面に「いまの形をみる」が無い", await p.locator("#tpShape").count() === 0);
ok("画面に「この形で作りなおす」が無い", await p.locator("#tpBuild").count() === 0);
ok("apiShapeTanpopo / apiBuildTanpopo は呼ばない",
   (await calls()).indexOf("apiShapeTanpopo") < 0
   && (await calls()).indexOf("apiBuildTanpopo") < 0, await calls());
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

console.log("\n■ 送り直しに失敗しても、控えは捨てない");
/* **ここが前は捨てていた。** 送れなかったのに控えを消していたので、
   そのあと週を読み直した時点で、閉じる直前に書いたコマが永久に消えていた。
   控えが要るのは、まさにこの事故のためのもの。 */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__hang = true; });
await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(1300);
ok("送れないまま控えができている", await p.evaluate(() =>
     (JSON.parse(localStorage.getItem("school-timetable/v3/pending") || "[]") || []).length) === 1,
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")));

/* **開き直したときの送り直しが失敗する形。** ここが前は控えを消していた。
   立ち上がりの1回で送り直し、失敗しても消していたので、そのあと週を
   読み直した時点で、閉じる直前に書いたコマが永久に消えていた。 */
/* **この1回の立ち上がりだけ失敗させる。** addInitScript は外せないので、
   印を localStorage に置いて、読んだ側がその場で消す */
await p.addInitScript(() => {
  if(localStorage.getItem("wirecheck/failBoot") === "1"){
    window.__failWrite = true;
    localStorage.removeItem("wirecheck/failBoot");
  }
});
await p.evaluate(() => localStorage.setItem("wirecheck/failBoot", "1"));
await p.reload();
await p.waitForTimeout(1500);
const kept = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("school-timetable/v3/pending") || "null"));
ok("送り直しに失敗しても、控えを捨てない",
   Array.isArray(kept) && kept.length === 1 && kept[0].title === "算数", kept);
ok("控えていたぶんは、送り待ちにも積み直す",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));
ok("送れていないことを画面に出す",
   (await p.locator("#saveTxt").innerText()).indexOf("保存できていない") >= 0
   || (await p.locator("#saveTxt").innerText()).indexOf("保存（") >= 0,
   await p.locator("#saveTxt").innerText());

/* 回線が戻れば、控えていたぶんもそのまま出ていく */
await p.evaluate(() => { window.__failWrite = false; });
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.locator("#saveBtn").click(); await p.waitForTimeout(900);
ok("回線が戻れば、控えていたぶんも送れる",
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")) === null
   && await p.evaluate(() => Backend.unsaved()) === 0,
   [await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")),
    await p.evaluate(() => Backend.unsaved())]);
await p.evaluate(() => { window.__failWrite = true; });
/* いま手元にあるぶんを、失敗する回線へ送ってみる */
await p.locator("#sheet .cell[data-d='3'][data-s='p1'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='gyoji']").click();
await p.waitForTimeout(200);
await p.locator("#saveBtn").click();
await p.waitForTimeout(900);
ok("送れなかったら「保存できていない」と出す",
   (await p.locator("#saveTxt").innerText()).indexOf("保存できていない") >= 0,
   await p.locator("#saveTxt").innerText());
ok("送れなかったぶんは、送り待ちに戻る",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));
ok("送れなかったぶんは、控えにも残る",
   await p.evaluate(() =>
     (JSON.parse(localStorage.getItem("school-timetable/v3/pending") || "[]") || []).length) > 0,
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")));
await p.evaluate(() => { window.__failWrite = false; });
await p.locator("#saveBtn").click();
await p.waitForTimeout(900);
ok("押し直せば、そのまま送れる",
   await p.evaluate(() => Backend.unsaved()) === 0
   && await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")) === null,
   [await p.evaluate(() => Backend.unsaved()),
    await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending"))]);

console.log("\n■ 送っている途中で閉じても、控えに残っている");
/* **ここが前は消えていた。** 送り始めた時点で控えから外していたので、
   返事が来る前に画面を閉じられると、そのぶんはシートにも控えにも残らなかった。 */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; window.__failWrite = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(400);
await p.locator("#sheet .cell[data-d='1'][data-s='p3'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.waitForTimeout(1200);
await p.evaluate(() => { window.__hang = true; });   /* 送っても返事が来ない */
await p.locator("#saveBtn").click();
await p.waitForTimeout(700);
ok("送っている途中も、控えに中身が残っている", await p.evaluate(() => {
     const l = JSON.parse(localStorage.getItem("school-timetable/v3/pending") || "[]") || [];
     return l.some(q => q.slot === "p3" && q.target === "5-4" && q.title === "理科");
   }) === true,
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")));
ok("送っている途中は「保存ずみ」と言わない",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));

/* 送らずに閉じたことにして、開き直す */
await p.evaluate(() => { window.__calls.length = 0; });
await p.reload();
await p.waitForTimeout(1400);
ok("開き直すと、送っている途中だったぶんを送り直す", await p.evaluate(() =>
     window.__calls.filter(c => c.name === "apiWriteCells")
       .map(c => c.args[1]).flat()
       .some(q => q.slot === "p3" && q.target === "5-4" && q.title === "理科")) === true,
   await p.evaluate(() => window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1])));
ok("送れたら控えは消える",
   await p.evaluate(() => localStorage.getItem("school-timetable/v3/pending")) === null);
ok("シートにも入っている", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-4"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0
       && bank[k] && bank[k].title === "理科");
   }) === true, await p.evaluate(() => window.__sheet()));

console.log("\n■ 「上位に戻す」はシートにも届く");
/* **前はここが手元だけで消えていた。** 戻したように見えて、次に開くと戻ってきた。
   ほかの検査が見ているコマを触らないよう、5-3 の使っていないコマでやる */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(400);
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='kokugo']").click();
await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(700);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
ok("担任が入れたコマには「上位に戻す」が出る",
   await p.locator("#pRevert").isVisible());
await p.locator("#pRevert").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const rev = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("戻したことがシートへ届く（消す指示になる）",
   rev.length > 0 && rev.some(q => q.slot === "p3" && q.layer === "home"
                                 && (q.remove || (!q.title && !q.note))), rev);
ok("シートの側からも消えている", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-3"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0);
   }) === false, await p.evaluate(() => window.__sheet()));
/* **開き直しても戻ったまま。** 前はシートに行が残っていたので戻ってきた */
await p.reload(); await p.waitForTimeout(1400);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(500);
ok("開き直しても、担任のコマは戻ってこない",
   await p.evaluate(() => !((week().home["5-3"] || {})["4|p3"])) === true,
   await p.evaluate(() => (week().home["5-3"] || {})["4|p3"]));
ok("上位に戻したので、上位か基本時間割のものが出る",
   await p.evaluate(() => cellFor(4, "p3").layer) !== "home",
   await p.evaluate(() => cellFor(4, "p3").layer));

console.log("\n■ 年間行事も、立ち上がりの1回で一緒に来る");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(500);
ok("シートから読んだ行事を持っている",
   await p.evaluate(() => !!(Y().events || {})["2026-09-08"]) === true,
   await p.evaluate(() => Y().events));
ok("別に取りに行かない（apiBoot が一緒に返す）",
   (await calls()).indexOf("apiReadEvents") < 0, await calls());
ok("行事のある日の見出しに印が付く",
   await p.locator("#sheet .hd[data-d='1'].hasev").count() === 1,
   await p.locator("#sheet .hd.hasev").count());
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(250);
ok("コマを選ぶと候補が出る", await p.locator("#pEvs .ev").count() === 2,
   await p.locator("#pEvs .ev").count());
await p.locator("#pEvs .ev").first().click(); await p.waitForTimeout(400);
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const evSent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("押して入れたものは、ふつうのコマとしてシートへ行く",
   evSent.some(q => q.slot === "p2" && q.title.indexOf("校外学習") >= 0
                 && q.subject === "gyoji"), evSent);
await p.evaluate(() => { writeCell(1, "p2", {title:"", note:"", subject:null}); });
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);

console.log("\n■ 週メモもシートへ送る");
/* **前はこの端末にしか残らなかった。** 刷る紙は学級ごとなのに
   週にひとつしか無く、ほかの先生にも見えなかった。 */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; window.__failWrite = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-2']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; setMemo("下校時刻がちがう"); });
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const memoSent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("メモがシートへ送られる",
   memoSent.some(q => q.slot === "memo" && q.layer === "home" && q.target === "5-2"
                   && q.title.indexOf("下校時刻") >= 0), memoSent);
ok("月曜の行として送る（週にひとつ）",
   memoSent.some(q => q.slot === "memo" && q.date === "2026-09-07"), memoSent);
ok("開き直しても残っている", await (async () => {
     await p.reload(); await p.waitForTimeout(1400);
     await p.locator(".tile[data-c='5-2']").click(); await p.waitForTimeout(500);
     return (await p.locator("#sheet .foot .t").innerText()).indexOf("下校時刻") >= 0;
   })() === true, await p.locator("#sheet .foot .t").innerText());
ok("ほかの学級の紙には出ない", await (async () => {
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
     return (await p.locator("#sheet .foot .t").innerText()).indexOf("下校時刻") < 0;
   })() === true);

console.log("\n■ 開きっぱなしの画面も、たまに読み直す");
/* **前は一度読んだら二度と読み直さなかった。** 30人が同じ週を触る運用なのに、
   タブを開いたままの担任には、その日ほかの誰が何を入れても映らなかった。 */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click();
/* **先読みが終わるまで待ってから数え始める。**
   先読みは開いた 1.2 秒後に走るので、そこで数えると開き直しのぶんと混ざる */
await p.waitForTimeout(1800);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(500);
ok("すぐ開き直したときは読みに行かない（続けて見るたびに待たせない）",
   (await calls()).filter(n => n === "apiReadWeek").length === 0, await calls());
ok("見張りの口がある（開きっぱなしでも読み直す）",
   await p.evaluate(() => typeof Backend.watch === "function"
                       && typeof Backend.stale === "function") === true);
ok("控えを古くすれば、開くときに読み直す", await (async () => {
     await p.evaluate(() => { window.__calls.length = 0; Backend.stale(); });
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(700);
     return (await calls()).filter(n => n === "apiReadWeek").length > 0;
   })() === true, await calls());
/* ほかの先生が入れたことにして、読み直しで映るかを見る */
await p.evaluate(() => {
  const st = window.__sheet();
  const key = ["2026", "home", "5-1"].join("\u0001");
  const bank = st[key] || (st[key] = {});
  bank["2026-09-09|p2"] = {title:"ほかの人が入れた", note:"", subject:null,
                           sp:"", at:1700000009999, by:"inoue@edu.nishi.or.jp"};
  window.__sheetSet(st);
});
/* タブへ戻ってきた形を作る（headless では hidden にならないので、
   同じ道を通す：控えを古くしてから読み直す） */
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
await p.evaluate(() => { Backend.stale();
  document.dispatchEvent(new Event("visibilitychange", {bubbles:true})); });
await p.waitForTimeout(1200);
ok("いったん離れて戻ると、ほかの人の書き込みが映る",
   (await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").innerText())
     .indexOf("ほかの人が入れた") >= 0,
   await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").innerText());

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
await p.locator("#adminDlg .dlgx").click();
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
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

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
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

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
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

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

console.log("\n■ たんぽぽの出す先は、画面から足す・消す・変える");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-go='tanpopo']").click();
await p.waitForTimeout(600);
ok("出す先が、たんぽぽの面に出る", await p.locator("#tpTgt").isVisible() === true);
ok("版を上げただけの学校は、設定の1本がそのまま出す先になる",
   (await p.locator("#tpTgt").innerText()).indexOf("たんぽぽ時間割") >= 0,
   await p.locator("#tpTgt").innerText());

await p.locator("#tpTgtEdit").click(); await p.waitForTimeout(200);
ok("直しているあいだは出せない（どこへ出るか決まっていない）",
   await p.locator("#tpGo").isDisabled() === true);
await p.locator("#tpTgtAdd").click(); await p.waitForTimeout(200);
ok("足すと行が増える", await p.locator(".tpturl").count() === 2,
   await p.locator(".tpturl").count());
/* URL が空のまま入れさせない。**出すときに初めて失敗させない** */
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(200);
ok("URLが空の行があれば、入れさせない",
   (await p.locator("#tpTgtWhy").innerText()).indexOf("URLが空") >= 0,
   await p.locator("#tpTgtWhy").innerText());
await p.locator(".tpturl").nth(1).fill("https://docs.google.com/spreadsheets/d/TPOK9999999999999999999/edit");
await p.locator(".tptname").nth(1).fill("ひまわり時間割");
await p.locator(".tpttest").nth(1).click(); await p.waitForTimeout(200);
ok("貼った時点で、開けるか試せる",
   (await p.locator("#tpTgtWhy").innerText()).indexOf("開けました") >= 0,
   await p.locator("#tpTgtWhy").innerText());
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(400);
const tw = await lastCall("apiWriteTpTargets");
ok("入れると、並びをまるごと送る（足す・消すを別々の口にしない）",
   !!tw && tw.args[0].length === 2, tw && tw.args[0]);
ok("入れたあとは、また出せる", await p.locator("#tpGo").isDisabled() === false);

/* 既定を変えると、出す先が変わる */
await p.locator("#tpTgtSel").selectOption("1"); await p.waitForTimeout(400);
ok("選んだものが、出す先になる",
   (await p.locator("#tpCount").innerText()).indexOf("ひまわり") >= 0,
   await p.locator("#tpCount").innerText());
/* 消す。**向こうのファイルには手を出さない** */
p.once("dialog", d => d.accept());
await p.locator("#tpTgtEdit").click(); await p.waitForTimeout(200);
await p.locator(".tptdel").nth(1).click(); await p.waitForTimeout(300);
ok("消すと、一覧から消える", await p.locator(".tpturl").count() === 1,
   await p.locator(".tpturl").count());
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(400);
ok("出す先を消しても、向こうのファイルは消さない（一覧から外すだけ）",
   (await calls()).indexOf("apiDeleteTpFile") < 0);

console.log("\n■ 新しい年度の準備は、順に1つずつ");
await p.evaluate(() => {
  window.__nyTicks = {}; window.__nyPlan = false; window.__nyEvents = false;
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
  pollNewYear();
});
await p.waitForTimeout(400);
ok("未了のあいだは、左メニューに出る",
   await p.locator("#navNewYear").isVisible() === true);
ok("色だけに頼らない（「未了」の字を添える）",
   (await p.locator("#navNewYear").innerText()).indexOf("未了") >= 0,
   await p.locator("#navNewYear").innerText());
await p.locator("#navNewYear").click(); await p.waitForTimeout(500);
ok("押すと、準備の画面が開く", await p.locator("#nyDlg").evaluate(e => e.open) === true);
ok("つぎにやることを1つだけ大きく出す（迷わせない）",
   await p.locator(".nynext").count() === 1, await p.locator(".nynext").count());
ok("そのやることに、なぜ要るかが添えてある",
   (await p.locator(".nynwhy").innerText()).length > 5,
   await p.locator(".nynwhy").innerText());
ok("元に戻せるかを、必ず出す", await p.locator(".nynundo").count() === 1);
ok("戻せない手順には ⚠ を付ける（表の中）",
   await p.locator("table.ny .nyno").count() === 1,
   await p.locator("table.ny .nyno").count());
ok("戻せる手順には ◯ を付ける", await p.locator("table.ny .nyyes").count() > 1);
ok("いまやる行に「いまここ」を出す", await p.locator("table.ny .nynow").count() === 1);
ok("まだ順番でない段は、順番でないと言う",
   await p.locator("table.ny tr.later").count() > 0,
   await p.locator("table.ny tr.later").count());
ok("まだ順番でない段のボタンは押せない",
   await p.locator("table.ny tr.later .nygo").first().isDisabled() === true);
ok("機械が判定する手順は、チェックボックスを出さない",
   await p.locator("table.ny tr").filter({hasText:"基本時間割"}).locator(".nytick").count() === 0);

/* 人しか判定できない手順を、押して記録する */
await p.locator(".nyntick").click(); await p.waitForTimeout(500);
const tk = await lastCall("apiTickYearSetup");
ok("押すと、誰がいつ押したかをサーバへ記録する",
   !!tk && tk.args[1] === "arc.copy" && tk.args[2] === true, tk && tk.args);
ok("押すと、つぎにやることが次の手順へ進む",
   (await p.locator(".nynttl").innerText()).indexOf("複製") < 0,
   await p.locator(".nynttl").innerText());

/* 週案シートを作る。**これまではエディタからしか走らせられなかった。**
   ①②③が済むまで④は順番でないので、そこまで進めた形にしてから押す */
await p.evaluate(() => {
  window.__nyTicks = {"arc.copy":true, "specials":true};
  window.__nyEvents = true;
  loadNewYear();
});
await p.waitForTimeout(400);
ok("前の段が済むと、次の段のボタンが押せるようになる",
   await p.locator("table.ny .nygo").filter({hasText:"週案シートを作る"}).isDisabled() === false);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("table.ny .nygo").filter({hasText:"週案シートを作る"}).click();
await p.waitForTimeout(500);
ok("週案シートを、画面から作れる",
   (await calls()).indexOf("apiSetupPlanSheets") >= 0, await calls());

/* ぜんぶ済めば、左メニューから消える */
await p.evaluate(() => {
  window.__nyTicks = {"arc.copy":true, "specials":true};
  window.__nyPlan = true; window.__nyEvents = true;
  loadNewYear();
});
await p.waitForTimeout(400);
ok("ぜんぶ済むと、左メニューの知らせが消える",
   await p.locator("#navNewYear").isHidden() === true);
ok("済んだことを言う",
   (await p.locator("#nyStat").innerText()).indexOf("ぜんぶできています") >= 0,
   await p.locator("#nyStat").innerText());

console.log("\n■ A週の起点と年間行事は、シートを開かずに直せる");
await p.evaluate(() => { for(const d of document.querySelectorAll("dialog")) if(d.open) d.close(); });
await p.evaluate(() => openAbDlg());
await p.waitForTimeout(200);
/* **月曜しか受け取らない。** 火曜を入れると以後の週が半週ずれる */
await p.locator("#abDate").fill("2026-09-08");
await p.locator("#abSave").click(); await p.waitForTimeout(200);
ok("月曜でない日は、押しても入らない",
   (await p.locator("#abWhy").innerText()).indexOf("月曜") >= 0,
   await p.locator("#abWhy").innerText());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#abDate").fill("2026-09-07");
await p.locator("#abSave").click(); await p.waitForTimeout(500);
ok("月曜なら、設定シートのその1行だけを書く",
   (await calls()).indexOf("apiWriteVariantOrigin") >= 0, await calls());

await p.evaluate(() => { for(const d of document.querySelectorAll("dialog")) if(d.open) d.close(); });
await p.evaluate(() => openEventsDlg());
await p.waitForTimeout(200);
await p.locator("#evPaste").fill("ねんげつ\tなにか\nx\ty");
await p.locator("#evRead").click(); await p.waitForTimeout(200);
ok("日付の列が無ければ、貼り替えさせない",
   (await p.locator("#evWarn").innerText()).indexOf("日付") >= 0
   && await p.locator("#evGo").isDisabled() === true,
   await p.locator("#evWarn").innerText());
await p.locator("#evPaste").fill(
  "日付\t週\t行事計画（児童）\t行事計画（職員）\n2027-04-08\tA\t始業式\t職員会議");
await p.locator("#evRead").click(); await p.waitForTimeout(200);
ok("読むと、貼る前に中身が見える", await p.locator("#evGrid table tr").count() === 2,
   await p.locator("#evGrid table tr").count());
ok("見てから押せる（読まずには押せない）", await p.locator("#evGo").isDisabled() === false);
ok("貼り替える前に、元へ戻せることを画面に出す",
   (await p.locator("#evDlg").innerText()).indexOf("元に戻せます") >= 0);

console.log("\n■ 書いているあいだは、全面にかぶせて次の操作を受け付けない");
/* 残りを片づけ、5-1 を開いた素の状態から始める。
   前の検査が入れたコマが残っていると、保存が重なりの窓を開いてしまう */
await p.evaluate(() => {
  window.__hang = false; window.__failWrite = false;
  window.__slow = 0; window.__slowWrite = 0;
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const st = window.__sheet();
  for(const k of Object.keys(st)) delete st[k];
  window.__sheetSet(st);
  const w = db.years[String(fy())].weeks[wkKey()];
  if(w){ w.school = {}; w.grade = {}; w.special = {}; w.home = {}; }
  save(); refreshWeek();
});
await p.waitForTimeout(200);
/* 保存のたびに、重なりの窓が出ていたら閉じる（この節で見たいのは全面表示） */
const closeCf = () => p.evaluate(() => { if($("cfDlg").open) $("cfDlg").close(); });

/* ① すぐ終わる保存では出さない（ちらつきを作らない） */
await p.evaluate(() => { Backend.cellChanged("home", "5-1", 0, "p1"); });
await p.locator("#saveBtn").click();
await p.waitForTimeout(90);
ok("すぐ終わる保存では、全面表示を出さない",
   await p.evaluate(() => $("wait").open) === false);
await p.waitForTimeout(400); await closeCf();

/* ② 時間のかかる保存では出す */
await p.evaluate(() => { window.__slowWrite = 900; Backend.cellChanged("home", "5-1", 1, "p1"); });
await p.locator("#saveBtn").click();
await p.waitForTimeout(400);
ok("時間のかかる保存では、全面表示が出る",
   await p.evaluate(() => $("wait").open) === true);
ok("何をしているかが大きく出る",
   (await p.locator("#waitTxt").innerText()).indexOf("保存") >= 0,
   await p.locator("#waitTxt").innerText());
ok("字は紙のコマより大きい（探さなくても目に入る）",
   await p.evaluate(() => parseFloat(getComputedStyle($("waitTxt")).fontSize)) >= 20,
   await p.evaluate(() => getComputedStyle($("waitTxt")).fontSize));
ok("下の紙は透けて読める（背を不透明にしない）",
   await p.evaluate(() => {
     const bg = getComputedStyle($("wait"), "::backdrop").backgroundColor;
     const m = bg.match(/rgba\(([^)]+)\)/);
     const a = m ? parseFloat(m[1].split(",")[3]) : 1;
     return a > 0 && a < 1;
   }) === true,
   await p.evaluate(() => getComputedStyle($("wait"), "::backdrop").backgroundColor));

/* ③ 出ているあいだ、まわりに触れない（開いている窓の仕組みで止める） */
ok("紙のコマに書き込めない", await p.evaluate(() => {
     const c = document.querySelector("#sheet .cell .t");
     if(!c) return "コマが無い";
     c.focus();
     return document.activeElement === c ? "紙に移った" : true;
   }) === true);
ok("サイドバーのボタンも押せない", await p.evaluate(() => {
     const bt = $("lockBtn"); if(!bt) return "ボタンが無い";
     bt.focus();
     return document.activeElement === bt ? "押せてしまう" : true;
   }) === true);

/* ④ 押した瞬間から2回目を受けない（出る前の 200ms も含めて） */
ok("処理中は、次の処理を受け付けない",
   await p.evaluate(() => Wait.guard()) === false);

/* ⑤ 終われば閉じ、まわりが元どおり触れる */
await p.waitForTimeout(1200); await closeCf();
ok("終われば閉じる", await p.evaluate(() => $("wait").open) === false);
ok("閉じたあとは紙に書ける", await p.evaluate(() => {
     const c = document.querySelector("#sheet .cell .t");
     if(!c) return "コマが無い";
     c.focus();
     return document.activeElement === c ? true : "書けない";
   }) === true);
ok("閉じたあとは、次の処理を受け付ける",
   await p.evaluate(() => Wait.guard()) === true);

/* ⑥ 番犬。**返らない処理を、いつまでも掴ませない。**
   20秒は待てないので、間合いを縮めて本当に解けるかを見る */
await p.evaluate(() => {
  Wait.tune(20, 300); window.__hang = true;
  Backend.cellChanged("home", "5-1", 2, "p1"); doSave(true);
});
await p.waitForTimeout(120);
ok("返事が来ないあいだは、出たまま",
   await p.evaluate(() => $("wait").open) === true);
await p.waitForTimeout(500);
ok("返事が来なければ、自分で解いて画面を返す",
   await p.evaluate(() => $("wait").open) === false);
ok("解いたことを知らせる",
   (await p.locator("#toast").innerText()).indexOf("返事がありません") >= 0,
   await p.locator("#toast").innerText());
ok("解いたあとは、次の処理を受け付ける",
   await p.evaluate(() => Wait.guard()) === true);
await p.evaluate(() => {
  Wait.tune(200, 20000); window.__hang = false; window.__slowWrite = 0;
});
await p.waitForTimeout(200); await closeCf();

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
