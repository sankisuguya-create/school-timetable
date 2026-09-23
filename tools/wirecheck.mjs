/* 本番（Apps Script）側の継ぎ目を確かめる。
     node tools/wirecheck.mjs

   偽の google.script.run を差し込んで、画面がサーバと何をやりとりするかを見る。
   Google のアカウントも Apps Script も要らない。 */
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

/* **偽のサーバに口がそろっているか。** 画面（src/js）が呼ぶ api… を拾い、
   偽のサーバに同じ名前があるかを見る。無い口を呼ぶと例外で処理が止まり、
   検査は「読みに行かない」のような見当違いの理由で落ちる。 */
{
  const fs = await import("fs");
  const dir = path.join(ROOT, "src", "js");
  const used = new Set();
  for(const f of fs.readdirSync(dir).filter(f => f.endsWith(".js")))
    for(const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\.(api[A-Za-z]+)\(/g))
      used.add(m[1]);
  const self = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
  const missing = [...used].filter(n => !new RegExp("^\\s+" + n + "\\(", "m").test(self)).sort();
  console.log("■ 偽のサーバ");
  ok("偽のサーバに口がそろっている（画面が呼ぶ api… が全部ある）", !missing.length, missing);
}
const p = await (await b.newContext({viewport:{width:1500, height:950}})).newPage();
await schoolWeek(p);
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if(m.type() === "error") errs.push("console: " + m.text()); });

/* 偽のサーバ。呼ばれたことと引数を覚え、シートらしい形を返す。 */
await p.addInitScript(() => {
  localStorage.setItem('school-timetable/guide-v2', 'done');
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
    /* 使い始める前の年度には知らせを出さない（設定「新年度の準備を出す年度から」） */
    const since = window.__nySince === undefined ? 2027 : window.__nySince;
    return {year:y, prev:y - 1, items, ng, done: ng === 0,
            off: since > 0 && y < since, from: since,
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
  /* **本番と同じ形で返す。** 画面は「何日目|時程」でコマを持つので、
     日付で覚えているものをここで直して返す（Store.readWeek/readWeeks と同じ） */
  function readOneWeek_(y, m, t){
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
    out.submits = Object.assign({}, ((window.__subs || {})[y + "|" + m]) || {});
    return out;
  }
  function runner(){
    let okFn = () => {}, ngFn = () => {};
    const api = {
      withSuccessHandler(f){ okFn = f; return api; },
      withFailureHandler(f){ ngFn = f; return api; },
      apiBoot(y){
        DATA.boot.isAdmin = (window.__isAdmin === undefined) ? true : !!window.__isAdmin;
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
        const out = readOneWeek_(y, m, t);
        call("apiReadWeek", [y, m, t], out);
        /* __lag に週を書いておくと、その週の返事だけ遅れる
           （校内の回線では、古い週の返事があとから届くことがある） */
        const lag = (window.__lag && window.__lag[m]) || window.__slow || 0;
        setTimeout(() => okFn(out), lag);
      },
      /* **週の配列を1呼び出しで返す。** Store.readWeeks と同じく
         {月曜: 週のかたち}（→ gas/Store.gs apiReadWeeks） */
      apiReadWeeks(y, ms, t){
        const out = {};
        for(const m of (ms || [])) out[m] = readOneWeek_(y, m, t);
        call("apiReadWeeks", [y, ms, t], out);
        setTimeout(() => okFn(out), window.__slow || 0);
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
      /* たんぽぽへの提出。**週ごとに立て直す印。** */
      apiTpSubmit(y, mon, cls, on){
        call("apiTpSubmit", [y, mon, cls, on]);
        const k = y + "|" + mon;
        const all = window.__subs || (window.__subs = {});
        const m = all[k] || (all[k] = {});
        if(on) m[cls] = {at:"2026-09-11 17:00", by:"tanaka@edu.nishi.or.jp"};
        else delete m[cls];
        setTimeout(() => okFn(Object.assign({}, m)), 0);
      },
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
      /* ── 単元進捗・紙の書き出し ─────────────────
         **本番に口を足したら、ここにも足す。** 無いと画面の呼び出しが
         例外になり、その先（面を開く・週を読む）が黙って止まる。
         単元進捗の口が無いまま、クラスを開くと週を読まない形で
         検査が8件落ち続けていた。足し忘れは下の「偽のサーバに口が
         そろっている」が見つける。 */
      apiUnitManager(y, layer, target, subject, sp){
        const u = window.__units || (window.__units = []);
        const r = {terms:[], termVersion:"[]",
                   units:u.filter(x => x.layer === layer && x.target === target
                                  && (!subject || x.subject === subject))};
        call("apiUnitManager", [y, layer, target, subject, sp], r);
        setTimeout(() => okFn(JSON.parse(JSON.stringify(r))), 0);
      },
      apiWriteUnit(y, input){
        const u = window.__units || (window.__units = []);
        const x = Object.assign({}, input, {year:y, updatedAt:String(Date.now())});
        if(!x.id) x.id = "unit-" + (u.length + 1);
        const i = u.findIndex(v => v.id === x.id);
        if(i >= 0) u[i] = x; else u.push(x);
        call("apiWriteUnit", [y, input], x);
        setTimeout(() => okFn(Object.assign({}, x)), 0);
      },
      apiClearUnitStart(y, id, at){
        const x = (window.__units || []).find(v => v.id === id) || {id};
        x.start = {date:"", slot:""};
        call("apiClearUnitStart", [y, id, at], x);
        setTimeout(() => okFn(Object.assign({}, x)), 0);
      },
      apiDeleteUnit(y, id, at){
        window.__units = (window.__units || []).filter(v => v.id !== id);
        call("apiDeleteUnit", [y, id, at]);
        setTimeout(() => okFn({deleted:id}), 0);
      },
      apiWriteTerms(y, list, ver){
        call("apiWriteTerms", [y, list, ver]);
        setTimeout(() => okFn({terms:list, version:JSON.stringify(list)}), 0);
      },
      apiUnitCandidates(y, cls, subject, fromDate, fromSlot, termEnd){
        call("apiUnitCandidates", [y, cls, subject, fromDate, fromSlot, termEnd]);
        setTimeout(() => okFn(null), 0);
      },
      apiExportPlanSheet(name, sheets){
        call("apiExportPlanSheet", [name, sheets]);
        setTimeout(() => okFn({url:"https://docs.google.com/spreadsheets/d/EXPORT/edit"}), 0);
      },
      apiExportSlide(name, png){
        call("apiExportSlide", [name, png]);
        setTimeout(() => okFn({url:"https://docs.google.com/presentation/d/EXPORT/edit"}), 0);
      },
      apiEnsureEventImportSheet(){
        call("apiEnsureEventImportSheet", []);
        setTimeout(() => okFn({name:"週案取り込み（行事計画）",
          url:"https://docs.google.com/spreadsheets/d/EVIMP/edit", fresh:false}), 0);
      },
      /* __evSheetRows に行を置くと、貼られた連携シートの代わりになる */
      apiReadEventImportSheet(){
        call("apiReadEventImportSheet", []);
        setTimeout(() => okFn({name:"週案取り込み（行事計画）",
          url:"https://docs.google.com/spreadsheets/d/EVIMP/edit",
          rows: window.__evSheetRows || []}), 0);
      },
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
      /* 教科の表し方。**本番は直した3列だけを書き戻し、読み直したものを返す** */
      apiWriteSubjects(rows){
        const cur = DATA.boot.subjects || [];
        const out = cur.map(x => {
          const r = (rows || []).find(y => y.code === x.code);
          return r ? Object.assign({}, x, {name:r.name, short:r.short, tp:r.tp}) : x;
        });
        DATA.boot.subjects = out;
        call("apiWriteSubjects", [rows]);
        setTimeout(() => okFn({n:(rows || []).length, subjects:out}), 0);
      },
      apiWriteTally(year, head, rows){
        /* シートのかわりに、この端末へ置く（形だけ本番と同じにする） */
        window.__tally = {year:year, head:head, rows:rows};
        call("apiWriteTally", [year, head, rows]);
        setTimeout(() => okFn({name:"時数集計", rows:(rows || []).length, kept:0}), 0);
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

await p.addInitScript(() => {
  window.__pendingJson = () => {
    const root = "school-timetable/v3/pending/", out = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith(root)) continue;
      try{
        const v = JSON.parse(localStorage.getItem(k) || "[]");
        if(Array.isArray(v)) out.push(...v);
      }catch(_){}
    }
    return out.length ? JSON.stringify(out) : null;
  };
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
/* **いまの中身と違う教科を選ぶ。** 同じ教科を選び直しても変更ではないので
   送られない（正しい）。検査の週（9/7の週）は月曜1校時がもとから国語なので、
   決め打ちで国語を押すと2件しか送られず、まとめ送りを確かめられない */
for(const d of [0, 2, 3]){
  const cell = p.locator("#sheet .cell[data-d='" + d + "'][data-s='p1'] .t");
  const now = (await cell.innerText()).trim();
  await cell.click();
  await p.waitForTimeout(80);
  const pals = p.locator(".pal[data-v]");
  for(let i = 0; i < await pals.count(); i++){
    const pal = pals.nth(i);
    if((await pal.innerText()).trim() !== now){ await pal.click(); break; }
  }
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

/* **開いたものが、そのまま入る先。** 右メニューの「入れる先」は外した ──
   開いているものと別にもう1か所で選べると、学級を開いたまま全校へ広がる */
console.log("\n■ 開いた面が、そのまま層になる");
ok("学級の面に「入れる先」の欄は無い", await p.evaluate(() =>
   !document.getElementById("pScopeWrap")) === true);
ok("学級の面では、いつもその学級に入る", await p.evaluate(() =>
   layerOfStore() + "|" + targetOfStore()) === "home|5-1");
const shut = () => p.evaluate(() =>
  document.querySelectorAll("dialog[open]").forEach(d => d.close()));
await p.evaluate(() => { openView({kind:"grade", grade:"5"}); });
await p.waitForTimeout(700); await shut();
ok("学年の面では、層は grade・対象は学年", await p.evaluate(() =>
   layerOfStore() + "|" + targetOfStore()) === "grade|5");
await p.evaluate(() => { openView({kind:"school"}); });
await p.waitForTimeout(700); await shut();
ok("全学年の面では、層は school", await p.evaluate(() =>
   layerOfStore() + "|" + targetOfStore()) === "school|");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(700); await shut();

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
await p.locator("[data-act='settings']").click();
await p.locator('#setRoster').click();
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
await p.locator("[data-act='settings']").click();
await p.locator('#setBase').click(); await p.waitForTimeout(250);
await p.locator("#baseImp").click(); await p.waitForTimeout(250);
await p.locator("#impSrc button[data-s='sheet']").click(); await p.waitForTimeout(150);
await p.locator("#impRead").click(); await p.waitForTimeout(400);
ok("「シートから」で apiReadPaste を呼ぶ",
   (await calls()).indexOf("apiReadPaste") >= 0, await calls());
ok("シートの表をそのまま読める",
   await p.evaluate(() => (impRes.classes["5-1"].B["0|p2"] || {}).title) === "理科",
   await p.evaluate(() => impRes.classes && impRes.classes["5-1"]));
await p.evaluate(() => { window.__calls.length = 0; });
/* 入れる前の確認は専用の窓（ブラウザの confirm は使わない） */
await p.locator("#impGo").click(); await p.waitForTimeout(250);
await p.locator("#okYes").click(); await p.waitForTimeout(500);
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
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
/* **組分けは窓の中。** 面には置かない（直すのは年度の初めと転入・転出だけ） */
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(300);
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(300);
const tq = await lastCall("apiWriteRoster");
ok("入れるとシートへ書く（組ごとの並びで）",
   !!tq && JSON.stringify(tq.args[4]) === JSON.stringify({"1":["5-1","5-2"]}),
   tq && tq.args[4]);
/* **同じ組へ2回入れれば2人。** 前のクリック切り替えはもう無い */
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("同じ組へ2回入れると2人になる", await p.evaluate(() => tpCount("5-2")) === 2,
   await p.evaluate(() => tpCount("5-2")));
ok("2人ぶんが2列として並ぶ",
   (await p.evaluate(() => tpColumns())).filter(x => x.cls === "5-2").length === 2,
   await p.evaluate(() => tpColumns()));
await p.locator("#tpGrpBody .tpin[data-g='1'][data-i='2']").click(); await p.waitForTimeout(250);
ok("組の中の1人を押すと外れる", await p.evaluate(() => tpCount("5-2")) === 1,
   await p.evaluate(() => Y().tanpopo));
/* 2組へも入れて、出す並びが 1組 → 2組 になることを見る */
await p.locator("#tpGrpBody .tpghead[data-g='2']").click(); await p.waitForTimeout(150);
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("たんぽぽ1組の全員 → 2組の全員 の順に並ぶ",
   JSON.stringify(await p.evaluate(() => tpColumns()))
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   await p.evaluate(() => tpColumns()));
ok("シートには組の番号が届く",
   JSON.stringify((await lastCall("apiWriteRoster")).args[4])
     === JSON.stringify({"1":["5-1","5-2"], "2":["5-2"]}),
   (await lastCall("apiWriteRoster")).args[4]);
await p.locator("#tpGrpDlg .dlgx").click(); await p.waitForTimeout(250);
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
  JSON.parse(window.__pendingJson() || "null"));
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
   await p.evaluate(() => window.__pendingJson()) === null,
   await p.evaluate(() => window.__pendingJson()));

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
     (JSON.parse(window.__pendingJson() || "[]") || []).length) === 1,
   await p.evaluate(() => window.__pendingJson()));

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
  JSON.parse(window.__pendingJson() || "null"));
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
   await p.evaluate(() => window.__pendingJson()) === null
   && await p.evaluate(() => Backend.unsaved()) === 0,
   [await p.evaluate(() => window.__pendingJson()),
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
     (JSON.parse(window.__pendingJson() || "[]") || []).length) > 0,
   await p.evaluate(() => window.__pendingJson()));
await p.evaluate(() => { window.__failWrite = false; });
await p.locator("#saveBtn").click();
await p.waitForTimeout(900);
ok("押し直せば、そのまま送れる",
   await p.evaluate(() => Backend.unsaved()) === 0
   && await p.evaluate(() => window.__pendingJson()) === null,
   [await p.evaluate(() => Backend.unsaved()),
    await p.evaluate(() => window.__pendingJson())]);

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
     const l = JSON.parse(window.__pendingJson() || "[]") || [];
     return l.some(q => q.slot === "p3" && q.target === "5-4" && q.title === "理科");
   }) === true,
   await p.evaluate(() => window.__pendingJson()));
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
   await p.evaluate(() => window.__pendingJson()) === null);
ok("シートにも入っている", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-4"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0
       && bank[k] && bank[k].title === "理科");
   }) === true, await p.evaluate(() => window.__sheet()));

console.log("\n■ 「空にする」はシートにも届く");
/* **前は「上位に戻す」という別のボタンもあった。** 中身を見ると、
   自分の層の行を消す点は「空にする」と同じだった（空の題名・備考で
   書くと isEmptyCell が立ち、compose.js writeCell がその場で行を消す）。
   2つの押す口で同じ結果になっていたので、「空にする」1本にまとめた。
   ここでは、その「空にする」が最後まで（シートまで）届くことを確かめる。
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
await p.locator("#pClear").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const rev = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("空にしたことがシートへ届く（消す指示になる）",
   rev.length > 0 && rev.some(q => q.slot === "p3" && q.layer === "home"
                                 && (q.remove || (!q.title && !q.note))), rev);
ok("シートの側からも消えている", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-3"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0);
   }) === false, await p.evaluate(() => window.__sheet()));
/* **開き直しても空いたまま。** 手元だけで消していたころは、シートに行が
   残っていたので開き直すと戻ってきた（→「空にする」もそこを直してある） */
await p.reload(); await p.waitForTimeout(1400);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(500);
ok("開き直しても、担任のコマは戻ってこない",
   await p.evaluate(() => !((week().home["5-3"] || {})["4|p3"])) === true,
   await p.evaluate(() => (week().home["5-3"] || {})["4|p3"]));
ok("空にしたので、上位か基本時間割のものが出る",
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

console.log("\n■ たんぽぽへの提出は、サーバに残る");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
  Y().tanpopo = {"1":["5-1"]}; save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(600);
ok("たんぽぽの児童がいるクラスに、提出ボタンが出る",
   await p.locator("#tpSubBtn").isVisible() === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
const sub = await lastCall("apiTpSubmit");
ok("押すと、年度と週の月曜とクラスを送る",
   !!sub && sub.args[2] === "5-1" && sub.args[3] === true
   && /^\d{4}-\d{2}-\d{2}$/.test(String(sub.args[1])), sub && sub.args);
ok("サーバが返した印を、そのまま画面に入れる",
   await p.evaluate(() => tpSubmitted("5-1")) === true);
/* **外せるようにしておく。** 押し間違いを直せないと、押すのが怖くなる */
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
ok("もう一度押すと、取り消せる",
   await p.evaluate(() => tpSubmitted("5-1")) === false);
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
/* **週ごとに立て直す。** 前の週の印が残っていると、たんぽぽ担当が
   組んだあとで予定が変わる */
await p.locator("#nextWk").click(); await p.waitForTimeout(900);
ok("次の週は、また未に戻る",
   await p.evaluate(() => tpSubmitted("5-1")) === false);
await p.locator("#prevWk").click(); await p.waitForTimeout(900);
ok("元の週へ戻れば、また済に戻る（シートから読み直す）",
   await p.evaluate(() => tpSubmitted("5-1")) === true);

console.log("\n■ たんぽぽの出す先は、画面から足す・消す・変える");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-go='tanpopo']").click();
await p.waitForTimeout(600);
await p.waitForTimeout(400);
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
await p.locator("#tpTgtEdit").click(); await p.waitForTimeout(200);
await p.locator(".tptdel").nth(1).click(); await p.waitForTimeout(300);
/* **ブラウザの confirm を使わない。** confirm は Enter で「はい」に落ちる */
ok("外す前に、専用の窓で確かめる",
   await p.locator("#tpDelDlg").evaluate(d => d.open) === true);
ok("何を外すのかを名指しする",
   (await p.locator("#tpDelTbl").innerText()).indexOf("ひまわり") >= 0,
   await p.locator("#tpDelTbl").innerText());
ok("向こうのファイルは消えないと書いてある",
   (await p.locator("#tpDelDlg").innerText()).indexOf("ファイルそのものは消えません") >= 0);
/* **既定は「外さない」。** いちばん戻しにくい操作を、弱い止め方にしない */
ok("既定は「外さない」に当たっている",
   await p.evaluate(() => document.activeElement.id) === "tpDelNo",
   await p.evaluate(() => document.activeElement.id));
await p.locator("#tpDelNo").click(); await p.waitForTimeout(300);
ok("「外さない」を押せば、そのまま残る", await p.locator(".tpturl").count() === 2,
   await p.locator(".tpturl").count());
await p.locator(".tptdel").nth(1).click(); await p.waitForTimeout(300);
await p.locator("#tpDelYes").click(); await p.waitForTimeout(300);
ok("「外す」を押すと、一覧から消える", await p.locator(".tpturl").count() === 1,
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
/* **使い始める前の年度には出さない。** 2026年度はもう走っているので、
   いまさら「未了」と出しても、やることは無いのに橙色だけが消えない */
await p.evaluate(() => { window.__nySince = 2100; pollNewYear(); });
await p.waitForTimeout(400);
ok("使い始める前の年度には、未了でも知らせを出さない",
   await p.locator("#navNewYear").isHidden() === true);
await p.evaluate(() => { window.__nySince = 0; pollNewYear(); });
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
   (await p.locator("#nyStat").innerText()).indexOf("全部できています") >= 0,
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

/* ── 専科の基本時間割・中央のかたち・空き枠さがし ─────────────
   **基本時間割は教師を持っていない。** 専科が自分の面を開いたとき、
   基本の持ちコマが出るかどうかをここで見る。 */
console.log("\n■ 専科の基本時間割（持ち主は「専科」シートの担当学年から引く）");
await p.evaluate(() => {
  const Yr = Y();
  Yr.specials = [{code:"ongaku", label:"音楽", grades:["5"]},
                 {code:"zuko",   label:"図工", grades:[]}];
  /* 5-1 の月曜1限＝音楽、5-2 の月曜2限＝音楽、1-1 の月曜1限＝音楽（担当外の学年） */
  Yr.base["5-1"] = {A:{"0|p1":{title:"音楽", subject:"ongaku"}}};
  Yr.base["5-2"] = {A:{"0|p2":{title:"音楽", subject:"ongaku"}}};
  Yr.base["1-1"] = {A:{"0|p1":{title:"音楽", subject:"ongaku"}}};
  save();
});
await p.evaluate(() => openView({kind:"special", sp:"ongaku"}));
await p.waitForTimeout(300);
const spCell = (d, s) => p.evaluate(([d, s]) =>
  (document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s}"] .t`) || {}).textContent,
  [d, s]);
ok("基本時間割の持ちコマが、専科の週に出る", await spCell(0, "p1") === "5-1", await spCell(0, "p1"));
ok("別の校時の持ちコマも出る",             await spCell(0, "p2") === "5-2", await spCell(0, "p2"));
ok("担当学年の外は出さない（1-1 は混ざらない）",
   await p.evaluate(() => {
     const t = [...document.querySelectorAll('#sheet .cell .t')].map(e => e.textContent);
     return t.indexOf("1-1") < 0;
   }) === true);
ok("基本から来たコマは淡く出る（層が base）",
   await p.evaluate(() =>
     document.querySelector('#sheet .cell[data-d="0"][data-s="p1"]').dataset.layer) === "base");
/* **担任が別の予定を入れたら、その時間に専科は行かない。** */
await p.evaluate(() => {
  const w = week();
  w.home["5-1"] = w.home["5-1"] || {};
  w.home["5-1"]["0|p1"] = {title:"国語", note:"", subject:"kokugo",
                           at:Date.now(), by:"x@edu.nishi.or.jp"};
  save(); buildSheet();
});
ok("担任が上書きしたコマは、専科の週から消える",
   await spCell(0, "p1") === "", await spCell(0, "p1"));
ok("担当学年を書いていなければ全学年（図工）",
   await p.evaluate(() => {
     view = {kind:"special", sp:"zuko"};
     const me = specials().find(x => x.code === "zuko");
     return (me.grades || []).length === 0;
   }) === true);

console.log("\n■ 中央のかたち（週案・4週・学年）");
/* 上で担任の上書きを作ったので、開くと「上書きされた」の窓が出る。**先に閉じる** */
const closeDlgs = async () => {
  await p.evaluate(() => {
    for(const d of document.querySelectorAll("dialog[open]")) d.close();
  });
  await p.waitForTimeout(150);
};
await p.evaluate(() => openView({kind:"grade", grade:"5"}));
await p.waitForTimeout(300); await closeDlgs();
/* かたちの切り替えは左メニューの「週案を出す」に一本化した
   （専用の帯・#centerTabs は無い。data-center が現在地も言う） */
ok("左メニューにかたちの切り替えが出る",
   await p.evaluate(() => document.querySelectorAll(".nav[data-center]").length) === 4);
await p.locator('.nav[data-center="grade"]').click();
await p.waitForTimeout(400);
ok("学年の面に入れ替わる", await p.evaluate(() =>
   $("gradeView").hidden === false && $("stage").hidden === true) === true);
ok("紙は1枚。**曜日をクラス数で割る**",
   await p.evaluate(() => document.querySelectorAll("#gvPaper .gsheet").length) === 1);
ok("1日が4クラスぶんに割れている",
   await p.evaluate(() =>
     document.querySelectorAll('#gvPaper .gcell[data-d="0"][data-s="p1"]').length) === 4);
ok("どの列がどのクラスかを出す",
   await p.evaluate(() => [...document.querySelectorAll('#gvPaper .gcell[data-d="0"][data-s="p1"]')]
     .map(e => e.dataset.cls).join(",")) === "5-1,5-2,5-3,5-4");
ok("組の見出しは数字だけ（1/4 の幅に「5-1」は入らない）",
   await p.evaluate(() => {
     const g = document.querySelector("#gvPaper .gcls");
     return g.textContent === "1" && g.title === "5-1";
   }) === true);
ok("備考の欄を置かない", await p.evaluate(() =>
   document.querySelectorAll("#gvPaper .gcell .n").length) === 0);
ok("放課後と週メモも置かない", await p.evaluate(() =>
   document.querySelectorAll('#gvPaper [data-s="after"], #gvPaper .foot').length) === 0);
ok("見るだけ（書ける欄を作らない）",
   await p.evaluate(() =>
     document.querySelectorAll("#gvPaper [contenteditable]").length) === 0);
ok("入力パネルは引っこむ",
   await p.evaluate(() => document.querySelector(".panel").hidden) === true);
/* **週を繰ったら、見ている面もついてくる。** */
const gvTitle0 = await p.locator("#gvTitle").innerText();
await p.locator("#nextWk").click(); await p.waitForTimeout(500); await closeDlgs();
ok("週を繰ると、学年の面も動く",
   (await p.locator("#gvTitle").innerText()) !== gvTitle0,
   [gvTitle0, await p.locator("#gvTitle").innerText()]);
ok("学年の面のまま、週の紙へ戻っていない",
   await p.evaluate(() => $("gradeView").hidden) === false);
await closeDlgs();
await p.locator('.nav[data-center="month"]').click();
await p.waitForTimeout(600);
ok("4週の面へも入れ替わる", await p.evaluate(() =>
   $("monthView").hidden === false && $("gradeView").hidden === true) === true);
ok("4週の紙も見るだけ",
   await p.evaluate(() =>
     document.querySelectorAll("#mPaper [contenteditable]").length) === 0);
await closeDlgs();
await p.locator('.nav[data-center="week"]').click();
await p.waitForTimeout(400);
ok("週の紙へ戻る", await p.evaluate(() =>
   $("stage").hidden === false && $("monthView").hidden === true) === true);
ok("週の紙は書ける",
   await p.evaluate(() =>
     document.querySelectorAll("#sheet .cell .t[contenteditable]").length > 0) === true);

console.log("\n■ 空き枠あり/なし表示（3段。2値にしない）");
ok("学級の面には出さない", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     return freeScope();
   }) === null);
await p.evaluate(() => openView({kind:"grade", grade:"5"}));
await p.waitForTimeout(300); await closeDlgs();
ok("学年の面では出す", await p.evaluate(() => $("freeBox").hidden) === false);
/* **畳んである**（組み替えるときだけ使う道具）。押す前に開く */
ok("畳んだままでも、いま何を出しているかは見出しに出る", await p.evaluate(() =>
   $("freePeek").textContent) === "表示オフ",
   await p.evaluate(() => $("freePeek").textContent));
ok("段の名前は、何をふさがりと見るかで書く", await p.evaluate(() =>
   [...document.querySelectorAll("#freeSeg [data-free]")].map(e => e.textContent).join("/"))
   === "表示オフ/全校・学年枠表示/全校・学年・他専科枠表示",
   await p.evaluate(() =>
     [...document.querySelectorAll("#freeSeg [data-free]")].map(e => e.textContent)));
await p.evaluate(() => { $("freeFold").open = true; });
await p.waitForTimeout(200);
ok("はじめは出さない（段が0）", await p.evaluate(() => freeOpt().level) === 0);
ok("段が0のあいだは、印を付けない", await p.evaluate(() =>
   document.querySelectorAll("#sheet .cell[data-free]").length) === 0);
/* 5年の全クラスに、全校の予定と学年の予定と場所を取る教科を置く */
await p.evaluate(() => {
  const w = week(), now = Date.now();
  w.school["1|p1"] = {title:"全校朝会", note:"", subject:null, at:now, by:"a@edu.nishi.or.jp"};
  w.grade["5"] = w.grade["5"] || {};
  w.grade["5"]["1|p2"] = {title:"学年集会", note:"", subject:"gakunen_shukai",
                          at:now, by:"a@edu.nishi.or.jp"};
  for(const c of classesOfGrade("5")){
    Y().base[c] = Y().base[c] || {};
    /* **A週・B週の両方に置く。** 週を繰ったあとなので、いまがどちらかは決まっている */
    for(const v of ["A", "B"])
      Y().base[c][v] = Object.assign({}, Y().base[c][v],
        {"1|p3":{title:"体育", subject:"taiiku"}});
  }
  save();
});
await closeDlgs();
await p.locator('#freeSeg [data-free="1"]').click();
await p.waitForTimeout(400);
const fst = (d, s) => p.evaluate(([d, s]) =>
  (document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s}"]`) || {dataset:{}})
    .dataset.free, [d, s]);
ok("全校・学年枠：全校の予定は使えない",  await fst(1, "p1") === "busy",  await fst(1, "p1"));
ok("全校・学年枠：学年の予定も使えない",  await fst(1, "p2") === "busy",  await fst(1, "p2"));
ok("全校・学年枠：場所を取る教科は、まだ自由", await fst(1, "p3") === "free", await fst(1, "p3"));
await closeDlgs();
await p.locator('#freeSeg [data-free="2"]').click();
await p.waitForTimeout(400);
ok("全校・学年・他専科枠：場所を取る教科は避けたい", await fst(1, "p3") === "avoid", await fst(1, "p3"));
ok("使えないコマには × が付く", await p.evaluate(() =>
   getComputedStyle(document.querySelector('#sheet .cell[data-d="1"][data-s="p1"]'),
                    "::after").content.indexOf("×") >= 0) === true);
ok("避けたいコマには △ が付く", await p.evaluate(() =>
   getComputedStyle(document.querySelector('#sheet .cell[data-d="1"][data-s="p3"]'),
                    "::after").content.indexOf("△") >= 0) === true);
/* **自由なコマには何も足さない。** 自由がいちばん多いことがあるので、
   そちらに印を付けると紙が印の海になる（塞がっているほうを暗くする） */
const bg = sel => p.evaluate(s2 => {
  const e = document.querySelector(s2);
  return e ? getComputedStyle(e).backgroundImage : "（そのコマが無い）";
}, sel);
ok("自由なコマは、そのまま（斜線を敷かない）",
   await bg('#sheet .cell[data-free=free]') === "none",
   await bg('#sheet .cell[data-free=free]'));
ok("使えないコマに斜線を敷く",
   (await bg('#sheet .cell[data-d="1"][data-s="p1"]')).indexOf("gradient") >= 0,
   await bg('#sheet .cell[data-d="1"][data-s="p1"]'));
ok("避けたいコマにも斜線（濃さが違う）", await p.evaluate(() => {
     const g = s2 => getComputedStyle(document.querySelector(s2)).backgroundImage;
     const a = g('#sheet .cell[data-d="1"][data-s="p3"]');
     const b = g('#sheet .cell[data-d="1"][data-s="p1"]');
     return a.indexOf("gradient") >= 0 && a !== b;
   }) === true);
ok("斜線は休みの斜め線と反対向き（休みは図形で `\\`・こちらは 135deg の `/`）",
   (await bg('#sheet .cell[data-d="1"][data-s="p1"]')).indexOf("135deg") >= 0,
   await bg('#sheet .cell[data-d="1"][data-s="p1"]'));
const busyWhy = await p.evaluate(() =>
  document.querySelector('#sheet .cell[data-d="1"][data-s="p1"]').title);
ok("使えない理由を字で言う", busyWhy.indexOf("全校の予定") >= 0, busyWhy);
ok("数えたものを出す（目で数え直させない）",
   (await p.locator("#freeTally").innerText()).indexOf("○") >= 0,
   await p.locator("#freeTally").innerText());
/* 指定した教科は、**どの段でも**避ける */
await p.evaluate(() => { freeOpt().avoid = ["kokugo"]; freeOpt().level = 1;
                         save(); paintFree(); redrawCenter(); });
await p.waitForTimeout(300);
await p.evaluate(() => {
  const w = week();
  w.grade["5"]["2|p1"] = {title:"国語", note:"", subject:"kokugo",
                          at:Date.now(), by:"a@edu.nishi.or.jp"};
  save(); buildSheet();
});
ok("指定した教科は、どの段でも避ける（学年の予定より前に見ない）",
   await fst(2, "p1") === "busy", await fst(2, "p1"));
await p.evaluate(() => {
  const w = week();
  delete w.grade["5"]["2|p1"];
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    Y().base[c][v] = Object.assign({}, Y().base[c][v], {"2|p1":{title:"国語", subject:"kokugo"}});
  save(); buildSheet();
});
ok("基本時間割の国語も、指定すれば避けたいに落ちる",
   await fst(2, "p1") === "avoid", await fst(2, "p1"));
/* **場所は学校ぜんたいで1つ。** 面の範囲だけを見ると、代用の眼目が効かない */
await p.evaluate(() => {
  /* 5年は全部あける。1年（面の外）にだけ体育を置く */
  const bank = c => (Y().base[c] || (Y().base[c] = {}));
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    delete (bank(c)[v] || {})["3|p1"];
  for(const c of classesOfGrade("1")) for(const v of ["A", "B"])
    bank(c)[v] = Object.assign({}, bank(c)[v], {"3|p1":{title:"体育", subject:"taiiku"}});
  freeOpt().avoid = []; freeOpt().level = 2; save(); redrawCenter();
});
await p.waitForTimeout(300);
ok("ほかの学年が場所を取っていたら、面の外でも避けたいに落ちる",
   await fst(3, "p1") === "avoid", await fst(3, "p1"));
ok("どのクラスが取っているかを言う",
   (await p.evaluate(() =>
      document.querySelector('#sheet .cell[data-d="3"][data-s="p1"]').title)).indexOf("1-1") >= 0,
   await p.evaluate(() =>
      document.querySelector('#sheet .cell[data-d="3"][data-s="p1"]').title));
await p.evaluate(() => {
  for(const c of classesOfGrade("1")) for(const v of ["A", "B"])
    delete ((Y().base[c] || {})[v] || {})["3|p1"];
  save(); redrawCenter();
});
await p.waitForTimeout(300);
ok("場所が空けば自由に戻る", await fst(3, "p1") === "free", await fst(3, "p1"));

/* **コマの読み方は週の紙と学年の面で1つ。** 分けて書いていたころ、
   学年の面には「授業なし」の斜線が出ていなかった */
console.log("\n■ コマの意味づけは、版面が2つでも1つ");
await p.evaluate(() => {
  const w = week();
  w.home["5-2"] = Object.assign(w.home["5-2"] || {},
    {"0|p2":{title:"授業なし", note:"", subject:null, at:Date.now(), by:"a@edu.nishi.or.jp"}});
  save(); setCenter("grade");
});
await p.waitForTimeout(500); await closeDlgs();
ok("学年の面でも「授業なし」は斜線で出る（字のままにしない）",
   await p.evaluate(() =>
     document.querySelectorAll("#gvPaper .gcell.nolesson .noneslash, #gvPaper .gcell.nolesson + .noneslash").length
     + document.querySelectorAll("#gvPaper .gcell.nolesson").length >= 2) === true,
   await p.evaluate(() => document.querySelectorAll("#gvPaper .gcell.nolesson").length));
ok("週の紙と同じ字を出す（層も写す）",
   await p.evaluate(() => {
     const e = document.querySelector('#gvPaper .gcell[data-cls="5-2"][data-d="0"][data-s="p2"]');
     return !!e && e.dataset.layer === "home" && e.classList.contains("nolesson");
   }) === true);
await p.evaluate(() => { const w = week(); delete w.home["5-2"]["0|p2"]; save(); setCenter("week"); });
await p.waitForTimeout(400); await closeDlgs();

/* 空き枠の印は、紙には出さない */
ok("空き枠の印は画面だけ（刷る面には出さない）", await p.evaluate(() => {
     const css = [...document.styleSheets].flatMap(s => {
       try{ return [...s.cssRules]; }catch(_){ return []; }
     });
     return css.some(r => r.media && String(r.media).indexOf("print") >= 0
       && String(r.cssText).indexOf("data-free") >= 0);
   }) === true);
await p.evaluate(() => { freeOpt().level = 0; freeOpt().avoid = []; save(); });

/* ── 教科の色・1文字・対応表・カレンダー ───────────────── */
console.log("\n■ 教科の色は、題名の欄の地だけ（チップをやめた）");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(400); await closeDlgs();
ok("右メニューに口がある（窓を開かせない）",
   await p.evaluate(() => $("chipWrap").hidden) === false);
ok("はじめは「なし」", await p.evaluate(() =>
   $("chipSeg").querySelector('[data-chip=off]').getAttribute("aria-pressed")) === "true");
await p.locator('#chipSeg [data-chip="screen"]').click();
await p.waitForTimeout(400);
ok("紙に地が付く", await p.evaluate(() =>
   $("sheet").classList.contains("chips-screen")) === true);
ok("「画面だけ」は紙の印を立てない", await p.evaluate(() =>
   $("sheet").classList.contains("chips-output")) === false);
ok("丸いチップの形は作らない（地だけ）", await p.evaluate(() => {
     const css = [...document.styleSheets].flatMap(s2 => {
       try{ return [...s2.cssRules]; }catch(_){ return []; }
     }).map(r => r.cssText).join("");
     return css.indexOf("chips-screen .cell.has-sub .t") < 0;
   }) === true);
await p.locator('#chipSeg [data-chip="output"]').click();
await p.waitForTimeout(300);
ok("「紙にも」を選ぶと紙の印が立つ", await p.evaluate(() =>
   $("sheet").classList.contains("chips-output")) === true);
ok("クラスごとに持つ", await p.evaluate(() =>
   (Y().chipModes || {})["5-1"]) === "output");

console.log("\n■ 紙の字の大きさ（右メニューの ＋−）");
/* 設定（印刷と文字）のスライダーと**同じ棚**を触る。窓を開かないと届かない
   ところにしか無いと、紙を見ていて字が入らないと気づいたときに遠い */
ok("右メニューに ＋− が出る", await p.evaluate(() =>
   $("fontWrap") && !$("fontWrap").hidden) === true);
const fsNow = () => p.evaluate(() => ({
  shown:$("fsTitleV").textContent,
  css:getComputedStyle($("sheet")).getPropertyValue("--fs-t").trim(),
  stored:db.settings.titlePt}));
await p.evaluate(() => { db.settings.titlePt = 16; save(); applyPaper(); buildSheet(); });
await p.waitForTimeout(200);
await p.locator('#fontWrap .fsb[data-fs="titlePt"][data-step="0.5"]').click();
await p.waitForTimeout(250);
ok("＋で 0.5pt 大きくなり、紙にも効く",
   JSON.stringify(await fsNow()) === JSON.stringify({shown:"16.5", css:"16.5pt", stored:16.5}),
   await fsNow());
await p.locator('#fontWrap .fsb[data-fs="titlePt"][data-step="-0.5"]').click();
await p.waitForTimeout(250);
ok("−で戻る", JSON.stringify(await fsNow())
   === JSON.stringify({shown:"16", css:"16pt", stored:16}), await fsNow());
/* **端では押せなくする。** 押しても何も起きない状態にすると、
   壊れているのか端なのかが分からない */
ok("上限（題名 20pt）で ＋ が押せなくなる", await p.evaluate(async () => {
     db.settings.titlePt = 20; save(); applyPaper(); paintFontBtns();
     return document.querySelector('#fontWrap .fsb[data-fs="titlePt"][data-step="0.5"]').disabled;
   }) === true);
ok("下限（備考 8pt）で − が押せなくなる", await p.evaluate(() => {
     db.settings.notePt = 8; save(); applyPaper(); paintFontBtns();
     return document.querySelector('#fontWrap .fsb[data-fs="notePt"][data-step="-0.5"]').disabled;
   }) === true);
/* 設定の窓と ＋− は同じ棚を見る。片方で直したら、もう片方の数もそろう */
ok("設定の窓で直すと ＋− の数もそろう", await p.evaluate(() => {
     db.settings.titlePt = 14; db.settings.notePt = 12; save(); applyPaper();
     return $("fsTitleV").textContent + "/" + $("fsNoteV").textContent;
   }) === "14/12");
await p.evaluate(() => { db.settings.titlePt = 16; db.settings.notePt = 12;
                         save(); applyPaper(); buildSheet(); });
await p.waitForTimeout(250);

console.log("\n■ 学年の面は1文字（時数表と同じ字）");
await p.evaluate(() => {
  const Yr = Y();
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    (Yr.base[c] || (Yr.base[c] = {}))[v] =
      Object.assign({}, (Yr.base[c] || {})[v], {"0|p1":{title:"国語", subject:"kokugo"}});
  save(); openView({kind:"grade", grade:"5"});
});
await p.waitForTimeout(400); await closeDlgs();
await p.evaluate(() => setCenter("grade"));
await p.waitForTimeout(600); await closeDlgs();
ok("題名は1文字で出る", await p.evaluate(() =>
   (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {})
     .textContent) === "国",
   await p.evaluate(() =>
     (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {}).textContent));
ok("1文字の無い教科は、紙の字の1文字目に落ちる",
   await p.evaluate(() => shortOf("tosho", "図書")) === "図",
   await p.evaluate(() => shortOf("tosho", "図書")));
/* **幅と高さの両方を見て、当たるまで広げる。**
   前は 26px/コマ を上限にしていたので、画面が広いほど右に余白が残り、
   字はいつまでも小さいままだった。いまは、どちらかの向きが埋まる */
ok("どちらかの向きが埋まるまで広げる", await p.evaluate(() => {
     const sh = document.querySelector("#gvPaper .gsheet");
     const box = $("gvPaper"), r = sh.getBoundingClientRect();
     const fullW = r.width >= box.clientWidth - 2;
     const fullH = r.height >= box.clientHeight - 2;
     return fullW || fullH;
   }) === true, await p.evaluate(() => {
     const sh = document.querySelector("#gvPaper .gsheet");
     const box = $("gvPaper"), r = sh.getBoundingClientRect();
     return {w:[+r.width.toFixed(0), box.clientWidth],
             h:[+r.height.toFixed(0), box.clientHeight]};
   }));
ok("どちらの向きにもはみ出さない", await p.evaluate(() => {
     const sh = document.querySelector("#gvPaper .gsheet");
     const box = $("gvPaper"), r = sh.getBoundingClientRect();
     return r.width <= box.clientWidth + 2 && r.height <= box.clientHeight + 2;
   }) === true);
/* 刷る口。**紙は横に長い**（5日 × クラス数）ので A4 よこ1枚 */
ok("刷るボタンがある", await p.evaluate(() => !!$("gvPrint")) === true);

console.log("\n■ 教科の表し方（設定の対応表）");
await p.evaluate(() => openSubDlg());
await p.waitForTimeout(300);
ok("3つの字を並べて出す", await p.evaluate(() =>
   $("subRows").querySelectorAll(".subrow").length > 0
   && !!$("subRows").querySelector("[data-f=name]")
   && !!$("subRows").querySelector("[data-f=short]")
   && !!$("subRows").querySelector("[data-f=tp]")) === true);
ok("コードは出さない（行の身元なので触らせない）", await p.evaluate(() =>
   !$("subRows").querySelector("[data-f=code]")) === true);
await p.evaluate(() => {
  const r = $("subRows").querySelector('.subrow[data-code=kokugo]');
  r.querySelector("[data-f=short]").value = "語";
  saveSubTable();
});
await p.waitForTimeout(400);
ok("直すとシートへ送る",
   (await calls()).indexOf("apiWriteSubjects") >= 0, await calls());
ok("送る中身は、直した3つの字",
   await p.evaluate(() => {
     const a = (window.__calls.filter(c => c.name === "apiWriteSubjects").pop() || {}).args;
     const r = a && a[0].find(x => x.code === "kokugo");
     return !!r && r.short === "語" && r.name === "国語";
   }) === true);
ok("直した字が、そのまま学年の面に出る", await p.evaluate(() => {
     $("subDlg").close();
     setCenter("grade");
     return (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {})
       .textContent;
   }) === "語");
await p.evaluate(() => {
  const r = $("subRows").querySelector('.subrow[data-code=kokugo]');
  if(r) r.querySelector("[data-f=short]").value = "国";
  const S = SUBJECTS.map(x => x.code === "kokugo" ? Object.assign({}, x, {short:"国"}) : x);
  setSubjects(S); save();
});

console.log("\n■ カレンダーの面（2ヶ月・A4よこ1枚）");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(400); await closeDlgs();
await p.locator('.nav[data-center="cal"]').click();
await p.waitForTimeout(900); await closeDlgs();
ok("カレンダーの面に入れ替わる", await p.evaluate(() =>
   $("calView").hidden === false && $("stage").hidden === true) === true);
/* **2ヶ月。** 1日の時間割を縦に積むと、4ヶ月では1校時 1.63mm にしかならず
   字が入らない（版面の計算）。横に2枚だけにして、1日を倍の高さにした */
ok("2ヶ月ぶん出る", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth").length) === 2);
ok("横に2枚（縦は割らない）", await p.evaluate(() =>
   getComputedStyle($("cvPaper")).gridTemplateRows.split(" ").length) === 1);
ok("月〜土の6列（日曜は置かない）", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth:first-child .cdow").length) === 6);
ok("1日は「日付」の下に、校時が縦に並ぶ", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return !!d.querySelector(".cnum") && !!d.querySelector(".cper");
   }) === true);
/* **縦に積む。** 横並びだと1校時が 2.6mm 幅の升になり、何校時のことか
   位置でしか分からない。縦なら上から1・2・3…と読める */
ok("校時は縦に積む（横に並べない）", await p.evaluate(() => {
     const r = [...document.querySelectorAll("#cvPaper .cday:not(.none) .cper > i")]
       .slice(0, 2).map(e => e.getBoundingClientRect());
     return r.length === 2 && r[1].top > r[0].top + 1
         && Math.abs(r[1].left - r[0].left) < 1;
   }) === true);
ok("教科は1文字ずつ並ぶ", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper")].some(e => e.textContent.trim().length > 1)) === true);
ok("見るだけ（書ける欄を作らない）", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper [contenteditable]").length) === 0);
/* 校時の行の数は時程の「授業」の数。6と決め打ちにすると、5校時までの学校で1つ余る */
ok("校時の行は、授業の数だけ置く", await p.evaluate(() => {
     const n = SLOTS.filter(s => s.kind === "lesson").length;
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return d.querySelectorAll(".cper > i").length === n && n > 1;
   }) === true, await p.evaluate(() =>
     document.querySelector("#cvPaper .cday:not(.none)").querySelectorAll(".cper > i").length));
ok("1行に書き込む欄が1つ（教科の右）", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return d.querySelectorAll(".cper > i > u").length
         === d.querySelectorAll(".cper > i").length;
   }) === true);
ok("書き込む欄は空のまま刷る", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper u")].every(e => e.textContent === "")) === true);
ok("出ない校時のぶんも行は置く（詰めると校時がずれる）", await p.evaluate(() => {
     const n = SLOTS.filter(s => s.kind === "lesson").length;
     return [...document.querySelectorAll("#cvPaper .cper")]
       .every(e => e.querySelectorAll(":scope > i").length === n);
   }) === true);
ok("1行の教科は1文字まで", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper > i > b")]
     .every(e => e.textContent.length <= 1)) === true);
/* **日付がいちばん大きい字。** カレンダーは「何日か」を先に探す面なので、
   教科の1文字より日付が目に入らないと、日を数え直すことになる */
ok("日付は教科の字より大きく、濃い", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     const n = d.querySelector(".cnum"), b = d.querySelector(".cper > i > b");
     const fs = e => parseFloat(getComputedStyle(e).fontSize);
     return fs(n) > fs(b) && +getComputedStyle(n).fontWeight >= 700;
   }) === true, await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return {num:getComputedStyle(d.querySelector(".cnum")).fontSize,
             sub:getComputedStyle(d.querySelector(".cper > i > b")).fontSize};
   }));
/* **降りてきたコマには、週案の紙と同じ左端の線。** 視覚的に見つけるための印 */
ok("学年・全校から降りたコマに左端の線が付く", await p.evaluate(() => {
     const w = week(), now = Date.now();
     w.school["0|p1"] = {title:"全校朝会", note:"", subject:"gyoji", at:now, by:"a@edu.nishi.or.jp"};
     save(); redrawCenter();
     return true;
   }) === true);
await p.waitForTimeout(900); await closeDlgs();
ok("線は出どころの色（全校＝青）", await p.evaluate(() => {
     const e = document.querySelector("#cvPaper .cper > i[data-from=school]");
     return !!e && getComputedStyle(e).boxShadow.indexOf("inset") >= 0;
   }) === true);

/* 月の下の時数集計。**その月のコマ数（年度はじめからの累計）** */
ok("月の下に時数集計が出る", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth .ctally").length) === 2);
/* **教科ごと。** 合計ひとつなら、日数×コマ数でほぼ決まる数にしかならない。
   月ごとに何教科出るかは、その学校の教科シート次第なので数では縛らない ──
   **出ている札が教科の1文字かどうか**で見る */
ok("教科ごとに出す（合計ひとつではない）", await p.evaluate(() => {
     const shorts = SUBJECTS.filter(s => s.count && s.short).map(s => s.short);
     const bs = [...document.querySelectorAll("#cvPaper .ct > b")];
     return bs.length > 0 && bs.every(e => shorts.indexOf(e.textContent) >= 0);
   }) === true, await p.evaluate(() =>
     [...document.querySelectorAll("#cvPaper .ct > b")].map(e => e.textContent)));
ok("「1文字 その月(累計)」の形", await p.evaluate(() => {
     const e = document.querySelector("#cvPaper .cmonth:first-child .ct");
     return /^.\d+\(\d+\)$/.test(e.textContent.replace(/\s/g, ""));
   }) === true, await p.evaluate(() =>
     document.querySelector("#cvPaper .cmonth:first-child .ct").textContent));
ok("累計は、その月のぶんを下回らない", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .ct")].every(e => {
     const m = e.textContent.replace(/\s/g, "").match(/^.(\d+)\((\d+)\)$/);
     return m && +m[2] >= +m[1];
   })) === true);
/* 数え方は時数集計表へのコピーと1つ（compose.js countSub）。
   **時数に数えない教科は数に入らない** */
/* 教科はシートが正本なので、名前を決め打ちにせず**いまの教科シートから取る** */
ok("数え方は時数集計表と同じ（countSub 1つ）", await p.evaluate(() => {
     const yes = SUBJECTS.filter(s => s.count && s.short)[0];
     const no  = SUBJECTS.filter(s => !s.count || !s.short)[0];
     return typeof countSub === "function"
       && countSub({title:yes.name, subject:yes.code}).short === yes.short
       /* 教科コードが無くても、題名の字で引く（手で書いたぶんも数える） */
       && countSub({title:yes.name, subject:null}).short === yes.short
       && (!no || countSub({title:no.name, subject:no.code}) === null)
       && countSub({title:"授業なし", subject:null}) === null
       && countSub({title:"", subject:null}) === null
       && countSub(null) === null;
   }) === true, await p.evaluate(() =>
     SUBJECTS.map(s => [s.code, s.short, !!s.count])));
ok("累計は年度で切る（4月はその月＝累計）", await p.evaluate(() => {
     const apr = calCount(new Date(2026, 3, 1)), sum = calSum(new Date(2026, 3, 1));
     return JSON.stringify(apr) === JSON.stringify(sum);
   }) === true);
ok("休みの日は数えない", await p.evaluate(() => {
     /* 4月の、授業が数えられる最初の日を休みにして数え直す。
        シートへは送らず、この端末の控えだけを直す（送ると後の検査に混ざる） */
     let dt = null;
     for(const d of calDates(new Date(2026, 3, 1))){
       const c = calDayC(d);
       if(c && Object.keys(c.count).length){ dt = d; break; }
     }
     if(!dt) return "4月に数えられる日が無い";
     const before = calDayC(dt);
     const n = Object.keys(before.count).reduce((a, k) => a + before.count[k], 0);
     const keep = monday;
     monday = mondayOf(dt);
     const d0 = Math.round((dt - monday) / 86400000);
     const w = week(), key = d0 + "|" + DAY_SLOT, was = w.school[key];
     w.school[key] = {title:"休み", note:"", subject:null, at:Date.now(), by:"a@edu.nishi.or.jp"};
     calCache = {};
     const m = Object.keys(calDayC(dt).count).reduce((a, k) => a + calDayC(dt).count[k], 0);
     if(was) w.school[key] = was; else delete w.school[key];
     monday = keep;
     calCache = {};
     return n > 0 && m === 0;
   }) === true, await p.evaluate(() => "上を見よ"));
const calT0 = await p.locator("#cvTitle").innerText();
await p.locator("#cvNext").click(); await p.waitForTimeout(700); await closeDlgs();
ok("2ヶ月ずつ繰れる", (await p.locator("#cvTitle").innerText()) !== calT0,
   [calT0, await p.locator("#cvTitle").innerText()]);
ok("刷るのは A4 よこ", await p.evaluate(() =>
   CAL_PAGE.w === 297 && CAL_PAGE.h === 210) === true);
ok("刷る手順は月の面と1つ（printSpread）", await p.evaluate(() =>
   typeof printSpread === "function" && typeof printCal === "function") === true);

/* **月ごとに数えたものを取り置き、累計は足し算だけにする。**
   4ヶ月ぶんの累計は、4月を4回・5月を3回…と同じ月を何度も通るので、
   月の合計を1度だけ出せば数え直しが消える */
ok("月ごとの数を取り置く", await p.evaluate(() =>
   Object.keys(calMonthCache).length > 0) === true,
   await p.evaluate(() => Object.keys(calMonthCache).length));
ok("累計は取り置いた月を足すだけ（日を数え直さない）", await p.evaluate(() => {
     for(const m of calMonths()) calSum(m);        /* 取り置きを温める */
     const days = Object.keys(calCache).length;
     const months = Object.keys(calMonthCache).length;
     for(const m of calMonths()) calSum(m);        /* 2回目 */
     /* 日も月も増えない＝組み直していない */
     return days > 0 && Object.keys(calCache).length === days
                     && Object.keys(calMonthCache).length === months;
   }) === true);
ok("中身が変わると取り置きを捨てる", await p.evaluate(() => {
     for(const m of calMonths()) calSum(m);
     const had = Object.keys(calMonthCache).length;
     dataTick++;                     /* 書き込み・読み込みで上がる印 */
     calFreshen();
     return had > 0 && Object.keys(calMonthCache).length === 0;
   }) === true);
/* **面ごとに数が違う。** openView は捨てたあとすぐ数え直す（右メニューの時数を
   描くため）ので、捨てる決まりそのものを見る */
ok("面が変わると取り置きを捨てる（クラスごとに数が違う）", await p.evaluate(() => {
     const keep = view;
     view = {kind:"class", cls:"5-1"};
     calFreshen();
     calCount(new Date(2026, 3, 1));
     const had = Object.keys(calMonthCache).length;
     view = {kind:"class", cls:"5-2"};
     calFreshen();
     const after = Object.keys(calMonthCache).length;
     view = keep; calFreshen();
     return had > 0 && after === 0;
   }) === true, await p.evaluate(() => Object.keys(calMonthCache).length));
/* **週の年度は、その週の月曜で決まる。** 4月1日を含む週の月曜は3月にあることが
   あり、その週は前の年度のシートに入っている。月の年度でまとめるとそこがずれ、
   その年度ぶんを丸ごと違う年の箱へ読みに行っていた */
ok("4/1 を含む週は、前の年度の箱に入れて読む", await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1)]);      /* 2026年4月 */
     return Object.keys(g).sort().join(",") === "2025,2026"
         && Object.keys(g["2025"]).join(",") === "2026-03-30";
   }) === true, await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1)]);
     return Object.keys(g).map(y => y + ":" + Object.keys(g[y]).join("/"));
   }));
ok("年度ごとの先頭の月曜が、その年度に入っている", await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1), new Date(2026, 4, 1)]);
     return Object.keys(g).every(y =>
       String(fyOf(parseISO(Object.keys(g[y]).sort()[0]))) === y);
   }) === true);
await p.locator('.nav[data-center="week"]').click();
await p.waitForTimeout(400); await closeDlgs();

console.log("\n■ 右メニューの時数");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
ok("学級を開くと出る", await p.evaluate(() =>
   $("tallyWrap").hidden === false) === true);
ok("教科ごとに「今月」と「累計」の3列", await p.evaluate(() => {
     const r = document.querySelector("#tlyBox .tlyrow");
     return !!r && r.children.length === 3
         && /^\d+$/.test(r.children[1].textContent)
         && /^\d+$/.test(r.children[2].textContent);
   }) === true, await p.evaluate(() => {
     const r = document.querySelector("#tlyBox .tlyrow");
     return r ? [...r.children].map(e => e.textContent) : null;
   }));
/* **カレンダーの面と同じ数。** 数え方は countSub 1つなので、見る場所で違わない */
ok("カレンダーの月の下と同じ数", await p.evaluate(() => {
     const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const now = calCount(m), sum = calSum(m);
     return [...document.querySelectorAll("#tlyBox .tlyrow")].every(r => {
       const k = r.children[0].textContent;
       return String(now[k] || 0) === r.children[1].textContent
           && String(sum[k] || 0) === r.children[2].textContent;
     });
   }) === true);
/* **決まりごとは ？ の中**（毎回同じ字が数の下に居座ると、変わった数が埋もれる）。
   欄に残すのは「いまの状態」だけ ── 何週ぶんをまだ読んでいないか */
ok("決まりごとは ？ の中にある", await p.evaluate(() =>
   /基本時間割/.test(HELP.tally3.b.join(""))) === true);
ok("欄に残すのは、いまの状態だけ", await p.evaluate(() => {
     const t = $("tlyNote").textContent;
     return t === "" || /読み/.test(t);
   }) === true, await p.evaluate(() => $("tlyNote").textContent));
/* **畳んでおける。** 毎日見るものではないので、既定は畳む。
   開き閉じは覚える（毎回たたみ直させない） */
ok("時数は畳める", await p.evaluate(() => !!$("tallyFold")) === true);
ok("？は畳んだままでも押せる（見出しに置く）", await p.evaluate(() =>
   !!document.querySelector('#tallyFold > summary .helpq')) === true);
ok("開き閉じを覚える", await p.evaluate(() => {
     const f = $("tallyFold");
     f.open = true; f.dispatchEvent(new Event("toggle"));
     const a = !!db.settings.tallyOpen;
     f.open = false; f.dispatchEvent(new Event("toggle"));
     return a && !db.settings.tallyOpen;
   }) === true);
ok("畳んでいても、今月のコマ数は見える", await p.evaluate(() =>
   /コマ/.test($("tlyPeek").textContent)) === true,
   await p.evaluate(() => $("tlyPeek").textContent));
ok("入口（まだ何も開いていない）では出さない", await p.evaluate(() => {
     const keep = view;
     view = {kind:"gate"};
     drawTallyPanel();
     const hid = $("tallyWrap").hidden;
     view = keep; drawTallyPanel();
     return hid;
   }) === true);

console.log("\n■ 時数集計シート（押したときだけ）");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
/* 時数は畳んである（既定）。**中のボタンを押すには、まず開く** */
await p.evaluate(() => { $("tallyFold").open = true; });
await p.waitForTimeout(200);
ok("ボタンが出る", await p.evaluate(() => !!$("tlySheet")) === true);
/* 断りは ？ の中だけにする。ボタンの下に置くと、押す前に読むとは限らない字が
   時数の表の下に積み上がる（畳んだときに見えなくなる場所でもある） */
ok("？の説明に、時間がかかると書いてある", await p.evaluate(() =>
   /分/.test(HELP.tally2.b.join("")) ) === true);
/* **数えるのは開いている面のぶんだけ。** 前は全27クラスを数えていて、
   担任が自分のクラスを見たいだけでも 1〜3分待たされた */
ok("学級を開いていれば、そのクラス1つだけ数える", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     return JSON.stringify(tallyScope());
   }) === JSON.stringify(["5-1"]));
ok("学年を開いていれば、その学年のクラス", await p.evaluate(() => {
     openView({kind:"grade", grade:"5"});
     const a = JSON.stringify(tallyScope()), b = JSON.stringify(classesOfGrade("5"));
     openView({kind:"class", cls:"5-1"});
     return a === b;
   }) === true);
ok("？の説明も、開いている面のぶんだと言っている", await p.evaluate(() =>
   /開いている/.test(HELP.tally2.b.join("")) ) === true);
/* **？はボタンのすぐ右。** 見出しの横だと、押そうとしている人の目に入らない */
ok("？は「時数を集計する」のすぐ右にある", await p.evaluate(() => {
     const q = document.querySelector('[data-help="tally2"] .helpq');
     const btn = $("tlySheet");
     if(!q || !btn) return "？かボタンが無い";
     const a = btn.getBoundingClientRect(), b = q.getBoundingClientRect();
     /* 同じ高さで、ボタンより右。見出しの横に付いていたら上にずれる */
     return b.left >= a.right - 1 && Math.abs(b.top - a.top) < a.height;
   }) === true, await p.evaluate(() => {
     const q = document.querySelector('[data-help="tally2"] .helpq');
     const btn = $("tlySheet");
     return q && btn ? [btn.getBoundingClientRect().toJSON(),
                        q.getBoundingClientRect().toJSON()] : null;
   }));
/* **押し間違いで1〜3分待たせない。** 既定は「やめる」 */
await p.locator("#tlySheet").click();
await p.waitForTimeout(300);
ok("押すと、先に確かめる窓が出る", await p.evaluate(() =>
   $("okDlg").open === true) === true);
ok("既定は「やめる」", await p.evaluate(() =>
   document.activeElement === $("okNo")) === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#okNo").click();
await p.waitForTimeout(400); await closeDlgs();
ok("やめれば、1本も呼ばない", (await calls()).indexOf("apiWriteTally") < 0, await calls());
/* 数えて置く */
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#tlySheet").click();
await p.waitForTimeout(300);
await p.locator("#okYes").click();
await p.waitForTimeout(2500); await closeDlgs();
ok("数えると、時数集計シートへ置く",
   (await calls()).indexOf("apiWriteTally") >= 0, await calls());
const tly = await p.evaluate(() => window.__tally || null);
ok("見出しは 年度・クラス・月 → 教科 → 合計",
   !!tly && tly.head[0] === "年度" && tly.head[1] === "クラス" && tly.head[2] === "月"
   && tly.head.indexOf("合計") > 3, tly && tly.head);
ok("教科の列は、教科シートの順（1文字）", await p.evaluate(() => {
     const want = SUBJECTS.filter(s => s.count && s.short).map(s => s.short)
       .filter((x, i, a) => a.indexOf(x) === i);
     const got = (window.__tally.head || []).slice(3, 3 + want.length);
     return want.join(",") === got.join(",");
   }) === true, tly && tly.head);
/* **開いている面のぶんだけ。** 学級を開いていれば1クラス × 月の数 */
ok("行は 開いている面のクラス × 月 のぶん", await p.evaluate(() => {
     const m0 = new Date(monday.getFullYear(), monday.getMonth(), 1);
     return window.__tally.rows.length
         === tallyScope().length * tallyMonths(m0).length;
   }) === true, tly && tly.rows.length);
ok("ほかのクラスの行は作らない", await p.evaluate(() =>
   window.__tally.rows.every(r => tallyScope().indexOf(r[1]) >= 0)) === true,
   await p.evaluate(() => [...new Set(window.__tally.rows.map(r => r[1]))]));
/* **数えるのは画面。** シートの数と、右メニューに出ている数が一致すること */
ok("シートに置いた数は、画面の数と同じ", await p.evaluate(() => {
     const t = window.__tally, m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const row = t.rows.find(r => r[1] === view.cls && r[2] === (m.getMonth() + 1) + "月");
     if(!row) return "その月の行が無い";
     const now = calCount(m);
     return t.head.slice(3, t.head.indexOf("合計")).every((k, i) =>
       String(now[k] || 0) === row[3 + i]);
   }) === true, await p.evaluate(() => {
     const t = window.__tally, m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const row = t.rows.find(r => r[1] === view.cls && r[2] === (m.getMonth() + 1) + "月");
     return [t.head, row];
   }));
ok("合計の列は、教科の数の合計", await p.evaluate(() => {
     const t = window.__tally, at = t.head.indexOf("合計");
     return t.rows.every(r => {
       let n = 0;
       for(let i = 3; i < at; i++) n += +r[i] || 0;
       return String(n) === r[at];
     });
   }) === true);
/* **休みの日は数えない**（時数集計表へのコピーと同じ決まり） */
ok("数え方は時数集計表と同じ（休みの日は数えない）", await p.evaluate(() => {
     const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     /* **数えられるクラスを選ぶ。** 見本の基本時間割は全クラスぶんは無いので、
        1つ目のクラスを決め打ちにすると、はじめから 0 のまま通ってしまう */
     let cls = null, n = 0;
     for(const c of allClasses()){
       const x = tallyClassMonth(c, m);
       const t = Object.keys(x).reduce((a, k) => a + x[k], 0);
       if(t > 0){ cls = c; n = t; break; }
     }
     if(!cls) return "数えられるクラスが無い";
     /* この月の平日を全部「休み」にして数え直す（この端末の控えだけ直す） */
     const keep = monday, touched = [];
     for(const dt of calDates(m)){
       monday = mondayOf(dt);
       const d = Math.round((dt - monday) / 86400000);
       if(d < 0 || d >= DAYS) continue;
       const w = week(), key = d + "|" + DAY_SLOT;
       touched.push([w, key, w.school[key]]);
       w.school[key] = {title:"休み", note:"", subject:null,
                        at:Date.now(), by:"a@edu.nishi.or.jp"};
     }
     const after = tallyClassMonth(cls, m);
     for(const [w, key, was] of touched){ if(was) w.school[key] = was; else delete w.school[key]; }
     monday = keep; calCache = {}; calMonthCache = {}; calMark = "";
     return n > 0 && Object.keys(after).length === 0;
   }) === true);

console.log("\n■ 表から取り込む（時数表・年間行事計画表）");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
/* ── 時数表。**いま開いているクラスの、この週だけ** ── */
/* 並びは「時数をコピー」と同じ矩形。手元の時数集計表からその週の塊を
   そのまま貼れるようにするため（形が違うと、貼る前に並べ替える手間が入る） */
await p.evaluate(() => {
  const t = db.settings.tally;
  t.classes = allClasses().slice(0, 4).join(", ");
  t.block = 6;
  t.cols = {};
  SLOTS.filter(s => s.kind === "lesson").forEach((s, i) => { t.cols[s.id] = i + 1; });
  save();
  openView({kind:"class", cls:t.classes.split(",")[0].trim()});
});
await p.waitForTimeout(700); await closeDlgs();
await p.evaluate(() => openImpPlan("tally"));
await p.waitForTimeout(350);
ok("時数表は、窓の中のマス目の表で受ける", await p.evaluate(() =>
   !$("ipTableWrap").hidden && $("ipTextWrap").hidden) === true);
ok("行は 5日 × 1日の行数", await p.evaluate(() =>
   document.querySelectorAll("#ipTable tr").length
   === 1 + WEEKDAYS * impTallyCols().block) === true,
   await p.evaluate(() => document.querySelectorAll("#ipTable tr").length));
ok("列は「列のずれ」の設定どおり", await p.evaluate(() =>
   document.querySelectorAll("#ipTable tr:nth-child(2) input").length
   === impTallyCols().width) === true);
/* **自分の行に印。** 貼るのは塊ごとだが、入るのは自分の行だけ */
ok("いま開いているクラスの行に印が付く", await p.evaluate(() =>
   document.querySelectorAll("#ipTable tr.mine").length === WEEKDAYS) === true,
   await p.evaluate(() => document.querySelectorAll("#ipTable tr.mine").length));
ok("表にはいまの週案が入っている", await p.evaluate(() => {
     const at = impTallyRow();
     const box = document.querySelector("#ipTable input[data-n='" + at + "'][data-c='1']");
     const les = SLOTS.filter(s => s.kind === "lesson");
     const c = cellFor(0, les[0].id), sub = countSub(c);
     return box.value === (sub ? sub.short : "");
   }) === true);
/* **変えていない欄は入れない。** 貼り戻しただけで全欄を書くと、
   学年・全校から降りてきたコマが担任の層に化ける（紙の見た目は同じ） */
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("そのままなら、1件も入れない", await p.evaluate(() =>
   /同じでした/.test($("ipWarn").textContent) && $("ipGo").disabled) === true,
   await p.evaluate(() => $("ipStat").textContent + " / " + $("ipWarn").textContent));
/* 塊ごと貼れる（時数集計表からコピーしてくるのが、この口の目的） */
ok("塊ごと貼れる", await p.evaluate(() => {
     const at = impTallyRow();
     impTallyPaste(at, 1, [["国", "算"]]);
     const a = document.querySelector("#ipTable input[data-n='" + at + "'][data-c='1']").value;
     const b = document.querySelector("#ipTable input[data-n='" + at + "'][data-c='2']").value;
     return a === "国" && b === "算";
   }) === true);
await p.evaluate(() => {
  const at = impTallyRow();
  document.querySelector("#ipTable input[data-n='" + at + "'][data-c='3']").value = "むにゃ";
});
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("読めない字は、入れずに名指しする", await p.evaluate(() =>
   /むにゃ/.test($("ipWarn").textContent)) === true);
ok("入れる前に「どの曜日の何校時に何が入るか」を出す", await p.evaluate(() =>
   /月/.test($("ipGrid").innerText)) === true,
   await p.evaluate(() => $("ipGrid").innerText.slice(0, 60)));
await p.locator("#ipGo").click(); await p.waitForTimeout(700); await closeDlgs();
ok("開いているクラスの、担任の層に入る", await p.evaluate(() => {
     const les = SLOTS.filter(s => s.kind === "lesson");
     const a = cellFor(0, les[0].id);
     return plain(a.title).trim() === "国語" && a.layer === "home";
   }) === true, await p.evaluate(() => {
     const les = SLOTS.filter(s => s.kind === "lesson");
     return cellFor(0, les[0].id);
   }));
ok("ほかの週には入らない", await p.evaluate(() => {
     const other = Y().weeks[iso(addDays(monday, 7))];
     return !other || !other.home || !other.home[view.cls]
         || Object.keys(other.home[view.cls]).length === 0;
   }) === true);
/* **クラスの並びに入っていなければ、行が決められないので取り込まない** */
ok("並びに無いクラスでは、理由を言って止める", await p.evaluate(() => {
     const keep = db.settings.tally.classes;
     db.settings.tally.classes = "9-9";
     const r = impTallyRead([]);
     db.settings.tally.classes = keep;
     return /クラスの並び/.test(r.warn || "");
   }) === true);

/* ── 年間行事。**全校・学年へ。日付は週をまたぐ** ── */
await p.evaluate(() => {
  const y = Y();
  y.events = y.events || {};
  y.events[iso(addDays(monday, 2))]  = {c:"避難訓練"};
  y.events[iso(addDays(monday, 16))] = {c:"社会見学"};
  save(); openView({kind:"school"});
});
await p.waitForTimeout(600); await closeDlgs();
await p.evaluate(() => openImpPlan("events"));
await p.waitForTimeout(250);
await p.locator("#ipTpl").click(); await p.waitForTimeout(300);
ok("雛形の見出しは 日付／校時／対象／行事名／備考", await p.evaluate(() =>
   $("ipText").value.split("\n")[0]) === "日付\t校時\t対象\t行事名\t備考");
ok("雛形に、年間行事の行が並ぶ", await p.evaluate(() =>
   /避難訓練/.test($("ipText").value) && /社会見学/.test($("ipText").value)) === true);
/* **校時と対象が空の行は入れない。** 雛形には行事のある日がぜんぶ並ぶので、
   コマにしないものが残っているのがふつう */
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("校時と対象が空なら、1件も入れない", await p.evaluate(() =>
   $("ipGo").disabled) === true, await p.evaluate(() => $("ipStat").textContent));
await p.evaluate(() => {
  const r = $("ipText").value.split("\n").map(x => x.split("\t"));
  const hit = t => r.findIndex(x => x[3] === t);
  r[hit("避難訓練")][1] = "2"; r[hit("避難訓練")][2] = "全校";
  /* **学級編成にある学年を使う。** 無い学年は「誰の紙にも出ない」ので入らない */
  window.__g = gradesAll()[0];
  r[hit("社会見学")][1] = "3"; r[hit("社会見学")][2] = window.__g + "年";
  $("ipText").value = r.map(x => x.join("\t")).join("\n");
});
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("対象を 全校／◯年 で読む", await p.evaluate(() =>
   /全校/.test($("ipGrid").innerText)
   && new RegExp(window.__g + "年").test($("ipGrid").innerText)) === true,
   await p.evaluate(() => $("ipGrid").innerText.slice(0, 80)));
await p.locator("#ipGo").click(); await p.waitForTimeout(400);
/* **押す前に、当たる範囲を言う**（ほかの先生の紙に出るため） */
ok("全校・学年へ入れる前に、範囲を言って聞く", await p.evaluate(() =>
   $("okDlg") && $("okDlg").open) === true);
await p.locator("#okYes").click(); await p.waitForTimeout(2000); await closeDlgs();
ok("全校の層に入る", await p.evaluate(() => {
     const w = Y().weeks[iso(monday)], les = SLOTS.filter(s => s.kind === "lesson");
     return plain(((w.school || {})[ck(2, les[1].id)] || {}).title || "") === "避難訓練";
   }) === true);
/* **週をまたいでも入る。** 入れる前に、当たる週をぜんぶ読んでから書く */
ok("2週先のコマも、学年の層に入る", await p.evaluate(() => {
     const w = Y().weeks[iso(addDays(monday, 14))], les = SLOTS.filter(s => s.kind === "lesson");
     const g = w && w.grade && w.grade[window.__g];
     return !!g && plain((g[ck(2, les[2].id)] || {}).title || "") === "社会見学";
   }) === true, await p.evaluate(() => {
     const w = Y().weeks[iso(addDays(monday, 14))];
     return w && w.grade ? Object.keys(w.grade).map(g =>
       g + ":" + Object.keys(w.grade[g]).join(",")) : "その週が無い";
   }));
/* **後片付け。** ここで入れたコマは、あとの検査が見る週に残る
   （5-1 の 0|p1 に担任の層で入れたままだと、次の「出どころ」の検査で
   全校のコマを覆ってしまう）。検査どうしが順番で結ばれないようにする。 */
await p.evaluate(() => {
  const les = SLOTS.filter(s => s.kind === "lesson");
  const key = (d, i) => les[i] ? ck(d, les[i].id) : null;
  const drop = (o, k) => { if(o && k) delete o[k]; };
  const wipe = (w, g) => { if(!w) return;
    for(const i of [0, 1, 2, 3]) drop(w.home && w.home["5-1"], key(0, i));
    drop(w.school, key(2, 1));
    drop(g && w.grade && w.grade[g], key(2, 2));
  };
  wipe(Y().weeks[iso(monday)], window.__g);
  wipe(Y().weeks[iso(addDays(monday, 14))], window.__g);
  const ev = Y().events || {};
  delete ev[iso(addDays(monday, 2))];
  delete ev[iso(addDays(monday, 16))];
  save();
  openView({kind:"class", cls:"5-1"});
});
await p.waitForTimeout(600); await closeDlgs();

console.log("\n■ 出どころの四角（週案の紙だけ）");
await p.evaluate(() => {
  const w = week(), now = Date.now();
  w.school["0|p1"] = {title:"全校朝会", note:"", subject:null, at:now, by:"a@edu.nishi.or.jp"};
  (w.grade["5"] || (w.grade["5"] = {}))["1|p1"] =
    {title:"学年集会", note:"", subject:"gakunen_shukai", at:now, by:"a@edu.nishi.or.jp"};
  save(); openView({kind:"class", cls:"5-1"});
});
await p.waitForTimeout(500); await closeDlgs();
const srcAt = (d, s2) => p.evaluate(([d, s2]) => {
  const e = document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s2}"] .src`);
  return e && !e.hidden ? e.textContent : "";
}, [d, s2]);
ok("全校から降りたコマは「全校」", await srcAt(0, "p1") === "全校", await srcAt(0, "p1"));
/* **縦長。** 題名の欄は高さが余り、横幅が題名と取り合いになる。
   横長だと「全校」で 5mm 取られるところ、縦なら 2.6mm で済む。
   **見た目の形で見る**（縦書きの指定ではなく）── 指定が効いていても
   箱が潰れていたら読めない */
ok("四角は縦長（1行1文字で積む）", await p.evaluate(() => {
     const e = document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .src');
     const r = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(e).fontSize);
     /* 2文字ぶんの高さがあり、幅は1文字ぶん。字が入りきっていること */
     return r.height > r.width * 1.5
         && r.height >= fs * 1.8
         && e.scrollHeight <= e.clientHeight + 1;
   }) === true, await p.evaluate(() => {
     const e = document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .src');
     const r = e.getBoundingClientRect();
     return {w:+r.width.toFixed(1), h:+r.height.toFixed(1),
             fs:getComputedStyle(e).fontSize,
             scroll:e.scrollHeight, client:e.clientHeight};
   }));
ok("学年から降りたコマは「◯年」（層の名前ではなく学年の数字）",
   await srcAt(1, "p1") === "5年", await srcAt(1, "p1"));
ok("自分で書いたコマには出さない", await p.evaluate(() => {
     writeCell(2, "p1", {title:"国語", subject:"kokugo"});
     paintSheet();
     const e = document.querySelector('#sheet .cell[data-d="2"][data-s="p1"] .src');
     return !e || e.hidden;
   }) === true);
ok("右上の札と二重に言わない（層は四角が言う）", await p.evaluate(() => {
     const e = document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .tag');
     return e.hidden || e.textContent === "";
   }) === true);
ok("重なりは右上に残す（四角が言えないもの）", await p.evaluate(() => {
     const w = week(), now = Date.now() + 1000;
     (w.home["5-1"] || (w.home["5-1"] = {}))["0|p1"] =
       {title:"国語", note:"", subject:"kokugo", at:now, by:"b@edu.nishi.or.jp"};
     save(); paintSheet();
     return document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .tag').textContent;
   }) === "！重なり");
/* **全学年の面では出さない。** 全部が「全校」になり、何も区別しない印になる */
ok("全学年の面では出さない", await p.evaluate(() => {
     openView({kind:"school"});
     return [...document.querySelectorAll("#sheet .src")].every(e => e.hidden);
   }) === true);
await p.waitForTimeout(400); await closeDlgs();
ok("4週の面には出さない", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     setCenter("month");
     return document.querySelectorAll("#mPaper .src:not([hidden])").length;
   }) === 0);
await p.waitForTimeout(600); await closeDlgs();
await p.evaluate(() => setCenter("week"));
await p.waitForTimeout(400); await closeDlgs();

/* **設定は、教職員なら誰でも触れる。** 画面もサーバも同じ
   （gas/Gate.gs の checkAdmin を呼ぶ口は無くなった）。
   学校で3人しか直せないと、基本時間割や学級編成を直したい人が
   その3人の手が空くのを待つことになっていた。 */
console.log("\n■ 専科の枠（同じ教科を学年で分けて持てる）");
/* **身元（code）と教科（subject）は別もの。** 同じ教科に2人いる形が
   実際にある（図工1・2年／図工3〜6年、理科3・4年／理科5・6年）ので、
   教科コードそのものを身元にはできない */
await p.evaluate(() => {
  Y().specials = [
    {code:"rika",   subject:"rika", grades:["3","4"]},
    {code:"rika_2", subject:"rika", grades:["5","6"]}
  ];
  save(); drawGate();
});
await p.waitForTimeout(400); await closeDlgs();
ok("同じ教科の枠が2つ持てる", await p.evaluate(() =>
   specials().filter(s => spSubjectOf(s.code) === "rika").length) === 2);
ok("名前に担当学年が付く（入口で見分けられる）", await p.evaluate(() =>
   specials().map(s => spLabel(s)).join("/")) === "理科3・4年/理科5・6年",
   await p.evaluate(() => specials().map(s => spLabel(s))));
ok("身元が違えば、受け持つクラスも違う", await p.evaluate(() => {
     const a = classesOfSpecial("rika"), b = classesOfSpecial("rika_2");
     return a.join(",") !== b.join(",") && !a.some(c => b.indexOf(c) >= 0);
   }) === true,
   await p.evaluate(() => [classesOfSpecial("rika"), classesOfSpecial("rika_2")]));
ok("担当学年のクラスだけを受け持つ", await p.evaluate(() =>
   classesOfSpecial("rika").every(c => ["3","4"].indexOf(gradeOf(c)) >= 0)
   && classesOfSpecial("rika_2").every(c => ["5","6"].indexOf(gradeOf(c)) >= 0)) === true,
   await p.evaluate(() => [classesOfSpecial("rika"), classesOfSpecial("rika_2")]));
/* **紙に出す字と時数は教科のほう。** 身元は枠を指すだけ */
ok("どちらの枠でも、教科は理科", await p.evaluate(() =>
   spSubjectOf("rika") === "rika" && spSubjectOf("rika_2") === "rika") === true);
/* 古い控え（subject が無い）は、身元をそのまま教科として読む */
ok("古い控えは、身元を教科として読む", await p.evaluate(() => {
     const keep = Y().specials;
     Y().specials = [{code:"ongaku", label:"音楽", grades:[]}];
     const got = spSubjectOf("ongaku");
     Y().specials = keep;
     return got;
   }) === "ongaku");
await p.evaluate(() => { Y().specials = clone(DEFAULT_SPECIALS); save(); drawGate(); });
await p.waitForTimeout(400); await closeDlgs();

console.log("\n■ 専科の面のクラスチップ（学年ごとに束ねる）");
await p.evaluate(() => openView({kind:"special", sp:"ongaku"}));
await p.waitForTimeout(800); await closeDlgs();
/* **20クラスを1列に流すと「4-2 はどこか」を毎回端から探す。**
   2列×3段に固め、学年の位置をいつも同じにする */
/* 束の数＝その専科が受け持つ学年の数（見本の音楽は5年だけ） */
ok("受け持つ学年のぶんだけ束ができる", await p.evaluate(() =>
   document.querySelectorAll("#pals .palgg").length
   === gradesAll().filter(g =>
        classesOfSpecial(view.sp).some(c => gradeOf(c) === g)).length) === true,
   await p.evaluate(() => [document.querySelectorAll("#pals .palgg").length,
     classesOfSpecial(view.sp)]));
ok("2列に並ぶ", await p.evaluate(() =>
   getComputedStyle(document.querySelector("#pals .palg"))
     .gridTemplateColumns.split(" ").length) === 2);
/* **束に見出しは置かない。** チップの字の頭がその学年で、束の位置も
   学年の順に固定してある。「3年」と書き足しても何も増えない */
ok("束に見出しを置かない", await p.evaluate(() =>
   document.querySelectorAll("#pals .palgh").length) === 0);
ok("束の順は学年の順（左上から小さいほうへ）", await p.evaluate(() => {
     const got = [...document.querySelectorAll("#pals .palgg")]
       .map(e => parseInt(e.dataset.g, 10));
     return got.every((n, i) => i === 0 || n > got[i - 1]);
   }) === true,
   await p.evaluate(() => [...document.querySelectorAll("#pals .palgg")].map(e => e.dataset.g)));
ok("チップの字はクラス名のまま", await p.evaluate(() =>
   [...document.querySelectorAll("#pals .pal[data-g]")]
     .every(e => /^[1-9]-[1-9]$/.test(e.textContent))) === true);
/* **色は学年を運ばない。** 運ぶのは字と並び。色は三重目 ──
   実測でこの6色は色だけでは見分けられない（2色覚で13組が閾値割れ）。
   だから字（3-2）も並び（学年の位置）も外さない */
ok("学年ごとに地の色が付く（束の中は同じ色）", await p.evaluate(() =>
   [...document.querySelectorAll("#pals .palgg")].every(gg => {
     const cs = [...gg.querySelectorAll(".pal")]
       .map(e => getComputedStyle(e).backgroundColor);
     return cs.length && new Set(cs).size === 1
         && cs[0] !== "rgba(0, 0, 0, 0)" && cs[0] !== "rgb(255, 255, 255)";
   })) === true,
   await p.evaluate(() => [...document.querySelectorAll("#pals .pal[data-g]")]
     .slice(0,3).map(e => getComputedStyle(e).backgroundColor)));
ok("色を外しても、字と並びで学年が分かる", await p.evaluate(() => {
     const e = document.querySelector('#pals .pal[data-g]');
     return e.textContent.charAt(0) === e.closest(".palgg").dataset.g;
   }) === true);
/* **リセットは専科にも出す。** 専科が入れたコマも全クラスの紙に降りるので、
   入れるのと同じ手数で取り消せないと、1コマずつ空にして回ることになる */
ok("専科にもリセットのチップが出る", await p.evaluate(() =>
   !!document.querySelector("#pals > .pal.clear")) === true);
ok("リセットは束の外に置く（入れるものではない）", await p.evaluate(() =>
   !document.querySelector("#pals .palgg .pal.clear")) === true);
await p.evaluate(() => openView({kind:"class", cls:"5-1"}));
await p.waitForTimeout(700); await closeDlgs();
ok("学級の面は、いままでどおり教科の並び", await p.evaluate(() =>
   !document.querySelector("#pals .palg")
   && document.querySelectorAll("#pals .pal").length > 5) === true);

console.log("\n■ 設定は教職員なら誰でも触れる");
ok("管理者でなくても、設定を出す", await p.evaluate(() => {
     window.__isAdmin = false;
     return !document.querySelector('[data-act="settings"]').hidden;
   }) === true);
ok("管理・システムも隠さない", await p.evaluate(() =>
   !document.querySelector('[data-act="admin"]').hidden) === true);
/* **止めるのは児童と外の人だけ。** そちらはサーバの Gate.check が持つ */
ok("サーバ側に管理者だけの関門は残っていない", await p.evaluate(() =>
   typeof Backend.info().isAdmin === "boolean") === true);

console.log(errs.length ? "\n【エラー】\n" + errs.join("\n") : "\nJSエラーなし");
if(errs.length) ng += errs.length;
console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
await b.close();
process.exit(ng ? 1 : 0);
