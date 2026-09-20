/* �{�ԁiApps Script�j���̌p���ڂ��m���߂�B
     node tools/wirecheck.mjs

   �U�� google.script.run ����������ŁA��ʂ��T�[�o�Ɖ������Ƃ肷�邩������B
   Google �̃A�J�E���g�� Apps Script ���v��Ȃ��B */
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
  console.log((pass ? "  �� " : "  �~ ") + name + (pass ? "" : "   �� " + JSON.stringify(got)));
};

const b = await chromium.launch(exe ? {executablePath: exe} : {});
const p = await (await b.newContext({viewport:{width:1500, height:950}})).newPage();
await schoolWeek(p);
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if(m.type() === "error") errs.push("console: " + m.text()); });

/* �U�̃T�[�o�B�Ă΂ꂽ���Ƃƈ������o���A�V�[�g�炵���`��Ԃ��B */
await p.addInitScript(() => {
  localStorage.setItem('school-timetable/guide-v2', 'done');
  window.__calls = [];
  /* ����ۂۂ̏o����B**�ł��グ�������̊w�Z�̌`**����n�߂�
     ���o����V�[�g�͋�ŁA�ݒ�� ����ۂۃt�@�C��ID ��1�{�Ԃ�ilegacy�j */
  window.__TPURL = "https://docs.google.com/spreadsheets/d/TPOK1234567890123456789/edit";
  window.__targets = [{name:"����ۂێ��Ԋ�", url:window.__TPURL, def:true, legacy:true}];
  window.__nyTicks = {};
  window.__nyPlan = false;
  window.__nyEvents = false;
  /* �V�N�x�̐ݒ�B**�{�Ԃ� checkYear ���V�[�g�����Č��߂�B**
     �����ł́A�������E�\�������菇�Ɍ������ǂ������������� */
  window.__nySetup = y => {
    const T = window.__nyTicks || {};
    const it = (key, group, label, level, act, hand) =>
      ({key, group, label, level, detail:"���܂̏��", fix:"��������", act, hand:!!hand,
        why:"���Ȃ��Ƃ����Ȃ�A�Ƃ������R", mins:3,
        undo: key === "arc.purge"
              ? "**���������͌��ɖ߂��܂���B**�����ɂ͂��̂܂܎c���Ă��܂��B"
              : "�߂��܂��B��蒼���܂��B",
        wait:"",
        by: hand && T[key] ? "tanaka@edu.nishi.or.jp" : "",
        at: hand && T[key] ? "2027-04-02 09:00" : ""});
    const items = [
      it("arc.count",  "�@ �O�N�x��ޔ�����", "�O�N�x�̏T�Ă̗ʂ𐔂���", "ok", "admin"),
      it("arc.copy",   "�@ �O�N�x��ޔ�����", "�h���C�u�ŁA���̃t�@�C�����ۂ��ƕ�������",
         T["arc.copy"] ? "ok" : "ng", "admin", true),
      it("arc.verify", "�@ �O�N�x��ޔ�����", "�����Ɩ{�̂��ƍ�����", "ok", "admin"),
      it("arc.purge",  "�@ �O�N�x��ޔ�����", "�{�̂���O�N�x�̍s������", "ok", "admin"),
      it("roster",   "�A �V�N�x�̂�����������", "�w���Ґ���V�N�x�ɒ���", "ok", "roster"),
      it("specials", "�A �V�N�x�̂�����������", "��Ȃ̒S����V�N�x�̐l�ɒ�����",
         T["specials"] ? "ok" : "ng", "roster", true),
      it("week1",    "�A �V�N�x�̂�����������", "��1�T�̌��j������", "ok", "roster"),
      it("base",     "�A �V�N�x�̂�����������", "��{���Ԋ���A�TB�T�Ƃ������", "ok", "base"),
      it("events",   "�B �O�ƂȂ�", "�N�ԍs���v��\��\��ւ���",
         window.__nyEvents ? "ok" : "ng", "events"),
      it("variant",  "�B �O�ƂȂ�", "A�TB�T���N�ԍs���ƍ����Ă��邩�m���߂�", "ok", "ab"),
      it("tanpopo",  "�B �O�ƂȂ�", "����ۂۂ̌𗬋��Əo����𒼂�", "ok", "tanpopo"),
      it("plan",     "�C �S�C���J����`�ɂ���", "�T�ăV�[�g�����",
         window.__nyPlan ? "ok" : "ng", "plan")
    ];
    /* **���Ԃ��΂��Ȃ��悤�ɂ���B** �O�̒i�Ɂu�܂��v���c���Ă��邠�����A
       ���̒i�� wait �𗧂Ă�i�{�Ԃ� Store.yearSetup �Ɠ������܂�j */
    let blocked = "";
    for(const x of items){
      x.wait = blocked && x.group !== blocked ? blocked : "";
      if(x.level === "ng" && !blocked) blocked = x.group;
    }
    for(const x of items) if(x.group === blocked) x.wait = "";
    const ng = items.filter(x => x.level === "ng").length;
    const next = items.filter(x => x.level === "ng")[0];
    /* �g���n�߂�O�̔N�x�ɂ͒m�点���o���Ȃ��i�ݒ�u�V�N�x�̏������o���N�x����v�j */
    const since = window.__nySince === undefined ? 2027 : window.__nySince;
    return {year:y, prev:y - 1, items, ng, done: ng === 0,
            off: since > 0 && y < since, from: since,
            next: next ? next.key : "", file:"�T�� 2026�i���ؖk�j"};
  };
  const DATA = {
    boot: {
      me: "tanaka@edu.nishi.or.jp",
      file: "�T�� 2026�i���ؖk�j",
      config: {
        "����p��":"A4", "����]��mm":12, "����{��":0.95,
        "����_�\���":"D3", "����_�N���X�̏�":"5-1,5-2,5-3,5-4",
        "����_1���̍s��":12, "����_��̂���":"am2:0,p1:1,p2:2,br:3,p3:4,p4:5,lun:6,p5:7,p6:8"
      },
      /* �V�[�g�̎�����5�R�}�����B**��ʂ̓R�[�h�̊���ł͂Ȃ�������ɏ]���͂�** */
      slots: [
        {id:"am2", name:"���w�K", kind:"brk",    time:"8:20?8:35", tally:"��", chips:true},
        {id:"p1",  name:"1",     kind:"lesson", time:"8:40?9:25", tally:"1�Z��"},
        {id:"p2",  name:"2",     kind:"lesson", time:"9:35?10:20",tally:"2�Z��"},
        {id:"lun", name:"��",    kind:"brk",    time:"12:00?13:00",tally:"��"},
        {id:"p3",  name:"3",     kind:"lesson", time:"13:05?13:50",tally:"3�Z��"}
      ],
      subjects: [
        {code:"kokugo", name:"����", short:"��", count:true},
        {code:"sansu",  name:"�Z��", short:"�Z", count:true},
        {code:"rika",   name:"����", short:"��", count:true},
        {code:"gyoji",  name:"�s��", short:"",   count:false}
      ]
    },
    year: {
      events: {"2026-09-08": {c:"�Z�O�w�K6�N(�ޗ�)", s:"�E����c15:00", w:"A"}},
      roster: {
        classes: {"1":["1-1","1-2"], "5":["5-1","5-2","5-3","5-4"]},
        specials: [{code:"ongaku", label:"���y"}],
        week1: "2026-04-06",
        tanpopo: {"1":["5-1"]}
      },
      base: {"5-1": {A: {"0|p1": {title:"����", subject:"kokugo"}}}}
    },
    week: {
      school: {}, grade: {},  special: {},
      home: {"5-1": {}}
    }
  };
  /* �U�̃V�[�g�B**�J�������Ă��c��**�悤�ɂ��Ă����i�{���̃V�[�g�Ɠ����j */
  const SHEET_KEY = "fake-sheet";
  window.__sheet = () => {
    try{ return JSON.parse(localStorage.getItem(SHEET_KEY) || "{}"); }catch(e){ return {}; }
  };
  window.__sheetSet = v => {
    try{ localStorage.setItem(SHEET_KEY, JSON.stringify(v)); }catch(e){}
  };
  /* **�ق��̐搶���A���̉�ʂ�ʂ����ɃV�[�g�𒼂����`�����B**
     �����͂���ł������Ȃ��i������ʂ���2�񏑂��Ă��������Ȃ��j�B */
  window.__other = (y, layer, target, date, slot, title) => {
    const st = window.__sheet();
    const key = [y, layer, target || ""].join("\u0001");
    const bank = st[key] || (st[key] = {});
    /* **�������тɎ�����i�߂�B** ���������̂܂܂��ƁA
       �ǂݒ��������Ƃ̉�ʂƈ�v���Ă��܂��A2�x�ڂ̋��������Ȃ��B */
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
        DATA.boot.isAdmin = (window.__isAdmin === undefined) ? true : !!window.__isAdmin;
        /* �{�ԂƓ������A�N�x��n���ꂽ��w���Ґ��Ɗ�{���Ԋ����ꏏ�ɕԂ� */
        const r = Object.assign({}, DATA.boot,
                    y ? {year:y, roster:DATA.year.roster, base:DATA.year.base,
                         events:DATA.year.events} : {});
        call("apiBoot", [y], r);
        setTimeout(() => okFn(r), 0);
      },
      apiReadYear(y){ const r = call("apiReadYear", [y], DATA.year); setTimeout(() => okFn(r), 0); },
      apiReadWeek(y, m, t){
        /* **�{�ԂƓ����`�ŕԂ��B** ��ʂ́u������|�����v�ŃR�}�����̂ŁA
           ���t�Ŋo���Ă�����̂������Œ����ĕԂ��iStore.readWeek �Ɠ����j */
        const out = {school:{}, grade:{}, special:{}, home:{}};
        const mon = Date.parse(m + "T00:00:00");
        const store = window.__sheet();
        for(const key in store){
          const p = key.split("\u0001");           /* �N�x�E�w�E�Ώ� */
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
        call("apiReadWeek", [y, m, t], out);
        /* __lag �ɏT�������Ă����ƁA���̏T�̕Ԏ������x���
           �i�Z���̉���ł́A�Â��T�̕Ԏ������Ƃ���͂����Ƃ�����j */
        const lag = (window.__lag && window.__lag[m]) || window.__slow || 0;
        setTimeout(() => okFn(out), lag);
      },
      apiWriteCells(y, patches){
        call("apiWriteCells", [y, patches]);
        /* __hang �̂������͕Ԏ������Ȃ��i����Ȃ��܂ܕ����`�����j */
        if(window.__hang) return;
        /* __slowWrite �̂������͕Ԏ����x���i�������̑S�ʕ\�������邽�߁j */
        const wlag = window.__slowWrite || 0;
        /* __failWrite �̂������͕K�����s����i����������Ă���`�����j */
        if(window.__failWrite){
          setTimeout(() => ngFn(new Error("�ʐM�ł��Ȃ�")), 0);
          return;
        }
        /* �V�[�g�ɓ��������Ƃɂ��Ċo����B
           **�{�ԂƓ����� expectedAt ������**�i�� gas/Store.gs writeCells�j�B
           �Â���Ԃ���̕ۑ��̓R�}�P�ʂŎ~�߂� conflicts �ŕԂ��B */
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
            continue;                      /* ���̃R�}�͏����Ȃ� */
          }
          const now = window.__now || 1700000000000;
          if(q.remove || (!q.title && !q.note)) delete bank[dk];
          else bank[dk] = {title:q.title, note:q.note, subject:q.subject || null,
                           sp:q.sp || "", at:now, sat:now, by:"tanaka@edu.nishi.or.jp"};
          at[[q.date, q.slot, q.layer, q.target].join("|")] = q.remove ? 0 : now;
        }
        window.__sheetSet(st);
        /* �{�ԂƓ����`�ŕԂ��B**���Ԃ��Ԃ�**�i�Ǘ��E�V�X�e���ɏo��j */
        const names = {};
        for(const q of patches) names[q.layer + "|" + (q.target || "")] = 1;
        setTimeout(() => okFn({at, count:patches.length - conflicts.length,
                               asked:patches.length, conflicts,
                               sheets:Object.keys(names).length,
                               ms:120, waitMs:40}), wlag);
      },
      apiWriteRoster(y, c, s, w, tp){ call("apiWriteRoster", [y, c, s, w, tp]); setTimeout(() => okFn({}), 0); },
      /* ����ۂۂ̏o����B**1�{�Ƃ͂�����Ȃ��B** */
      /* ����ۂۂւ̒�o�B**�T���Ƃɗ��Ē�����B** */
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
          return void setTimeout(() => ngFn(new Error("�uURL�v���ǂ߂܂���")), 0);
        window.__targets = (list || []).map(x => Object.assign({}, x));
        setTimeout(() => okFn({saved:(list || []).length}), 0);
      },
      apiTestTpTarget(url){
        call("apiTestTpTarget", [url]);
        setTimeout(() => okFn(/TPOK/.test(String(url))
          ? {ok:true, file:"����ۂێ��Ԋ�", sheets:3}
          : {ok:false, why:"�J���܂���"}), 0);
      },
      /* �V�N�x�̐ݒ�B**�菇�ƁA���܂ǂ��܂ōς�ł��邩�B** */
      apiYearSetup(y){
        call("apiYearSetup", [y]);
        setTimeout(() => okFn(window.__nySetup(y)), 0);
      },
      apiTickYearSetup(y, key, on){
        call("apiTickYearSetup", [y, key, on]);
        if(["arc.copy", "specials"].indexOf(key) < 0)
          return void setTimeout(() => ngFn(new Error("�L�^�ł��Ȃ��菇�ł�")), 0);
        (window.__nyTicks || (window.__nyTicks = {}))[key] = !!on;
        setTimeout(() => okFn(window.__nySetup(y)), 0);
      },
      apiSetupPlanSheets(y){
        call("apiSetupPlanSheets", [y]);
        window.__nyPlan = true;
        setTimeout(() => okFn({made:["�T�� �S�Z", "�T�� 5-1"]}), 0);
      },
      apiWriteVariantOrigin(m){
        call("apiWriteVariantOrigin", [m]);
        setTimeout(() => okFn({saved:m}), 0);
      },
      /* ���Ȃ̕\�����B**�{�Ԃ͒�����3�񂾂��������߂��A�ǂݒ��������̂�Ԃ�** */
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
        /* �V�[�g�̂����ɁA���̒[���֒u���i�`�����{�ԂƓ����ɂ���j */
        window.__tally = {year:year, head:head, rows:rows};
        call("apiWriteTally", [year, head, rows]);
        setTimeout(() => okFn({name:"�����W�v", rows:(rows || []).length, kept:0}), 0);
      },
      apiWriteEvents(rows){
        call("apiWriteEvents", [rows]);
        window.__nyEvents = true;
        setTimeout(() => okFn({rows:(rows || []).length - 1, sheet:"�s����荞��",
                               stash:"�s����荞�� �O�� 2026-09-10"}), 0);
      },
      apiWriteBase(y, c, v, bank){ call("apiWriteBase", [y, c, v, bank]); setTimeout(() => okFn(true), 0); },
      apiWriteBaseAll(y, table){
        call("apiWriteBaseAll", [y, table]);
        setTimeout(() => okFn({classes:Object.keys(table).length}), 0);
      },
      /* �N�x�̑ޔ��B**������ �� �ƍ����� �� ����**�B
         �ƍ��́A�ޔ���URL���\���Ă��āA���ꂪ�{�̂ƈႤ�Ƃ������ʂ� */
      apiArchiveCount(y){
        call("apiArchiveCount", [y]);
        setTimeout(() => okFn({year:y, rows:1200, cells:1100, file:"�T�� 2026�N�x",
          from:"2025-04-07", to:"2026-03-20", done:window.__arcDone || null,
          sheets:[{name:"�T�� 5-3", rows:800, cells:760},
                  {name:"�T�� 5�N",  rows:400, cells:340}]}), 0);
      },
      apiArchiveVerify(y, url){
        call("apiArchiveVerify", [y, url]);
        const same = String(url).indexOf("HONTAI") >= 0;
        setTimeout(() => okFn(same
          ? {ok:false, why:["�\��ꂽURL���A���܊J���Ă���t�@�C�����̂��̂ł�"]}
          : {ok:true, why:[], there:{file:"�T�� �ۑ� 2025�N�x", id:"COPY", rows:1200}}), 0);
      },
      apiArchivePurge(y, url, typed){
        call("apiArchivePurge", [y, url, typed]);
        if(String(typed) !== String(y))
          return void setTimeout(() => ngFn(
            new Error("�����O�ɁA�N�x�i" + y + "�j�����̂܂ܑł�����ł�������")), 0);
        window.__arcDone = {year:y, url, at:"2027-03-28 17:20",
                            by:"tanaka@edu.nishi.or.jp", rows:1200, cells:1100};
        setTimeout(() => okFn({year:y, sheets:2, rows:1200, cells:1100,
          at:"2027-03-28 17:20", by:"tanaka@edu.nishi.or.jp", url}), 0);
      },
      apiCheckYear(y){
        call("apiCheckYear", [y]);
        setTimeout(() => okFn({year:y, ng:1, warn:1, file:"�T�� 2026�i���ؖk�j", items:[
          {level:"ok",   what:"�N���X",     detail:"20�g�i1�E2�E3�E4�E5�E6�N�j", fix:""},
          {level:"ng",   what:"��{���Ԋ�", detail:"A�T����F5-4", fix:"�\�����荞��"},
          {level:"warn", what:"����ۂ�",   detail:"�𗬋���1���I�΂�Ă��Ȃ�", fix:"�l��������"}
        ]}), 0);
      },
      /* ����ۂۂւ�**1�T1�V�[�g**�ŏo���B���O�́u�������T�v�B
         �������O�̃V�[�g������΁A�������ɖ��O��ς��Ďc�� */
      apiExportWeek(y, m, titles, cols, slots, name){
        call("apiExportWeek", [y, m, titles, cols, slots, name]);
        setTimeout(() => okFn({file:"����ۂێ��Ԋ�", sheet:name, cols:3, staff:0,
          rows:81, days:5, wrote:60, empty:30, colW:50,
          backup:name + "�i�O�� 1116-0900�j", list:["5-1","5-2","5-2"]}), 0);
      },
      apiReadPaste(){
        const g = call("apiReadPaste", [], [
          ["", "", "��", "", "", ""],
          ["", "", "1", "", "2", ""],
          ["", "", "A", "B", "A", "B"],
          ["5-1", "", "��", "", "�Z", "��"]
        ]);
        setTimeout(() => okFn(g), 0);
      }
    };
    return api;
  }
  /* google.script.run �͖���V�����Ăяo������Ԃ� */
  window.google = {script: {get run(){ return runner(); }}};
});

await p.goto(PAGE);
await p.waitForTimeout(700);
const calls = () => p.evaluate(() => window.__calls.map(c => c.name));
const lastCall = n => p.evaluate(nn =>
  JSON.parse(JSON.stringify(window.__calls.filter(c => c.name === nn).slice(-1)[0] || null)), n);
/* �����M�T���̓^�u���ƂɕʃL�[�B�����ł́A���̃^�u�̍T���S�̂�ǂށB */
const pending = () => p.evaluate(() => {
  const root = "school-timetable/v3/pending/", out = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(!k || !k.startsWith(root)) continue;
    try{ const v = JSON.parse(localStorage.getItem(k) || "[]"); if(Array.isArray(v)) out.push(...v); }catch(_){}
  }
  return out;
});

console.log("�� �����オ��");
ok("�{�ԂƂ��ē���", await p.evaluate(() => Backend.isGas()) === true);
ok("apiBoot ���Ă�", (await calls()).indexOf("apiBoot") >= 0, await calls());
ok("�N�x�̂Ԃ������1��ł��炤�i�ʂɎ��ɍs���Ȃ��j",
   (await calls()).indexOf("apiReadYear") < 0
   && (await lastCall("apiBoot")).args[0] === 2026,
   [await calls(), (await lastCall("apiBoot")).args]);
/* �������o���̂ɏT�Ă͗v��Ȃ��B**�J������ʂ̂Ԃ񂾂��A���Ƃ���ǂށB** */
ok("�������o�������Ȃ�T�͓ǂ܂Ȃ�",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());

console.log("\n�� �V�[�g�̒l���R�[�h�̊���ɏ���");
ok("�����̓V�[�g��5�s�ɂȂ�", await p.evaluate(() => SLOTS.length) === 5,
   await p.evaluate(() => SLOTS.map(s => s.id)));
ok("�������V�[�g�̂���", await p.evaluate(() => SLOT_BY_ID.p1.time) === "8:40?9:25");
ok("���Ȃ̓V�[�g��4��", await p.evaluate(() => SUBJECTS.length) === 4);
ok("�p���E�]���E�{�����V�[�g�̂���",
   await p.evaluate(() => db.settings.paper + "/" + db.settings.margin + "/" + db.settings.k)
     === "A4/12/0.95",
   await p.evaluate(() => [db.settings.paper, db.settings.margin, db.settings.k]));
ok("�����R�s�[�̌`���V�[�g�̂���",
   await p.evaluate(() => db.settings.tally.anchor) === "D3"
   && await p.evaluate(() => db.settings.tally.block) === 12);

console.log("\n�� �w���Ґ����V�[�g����");
ok("1�N��2�N���X�E5�N��4�N���X",
   await p.evaluate(() => classesOfGrade("1").length) === 2
   && await p.evaluate(() => classesOfGrade("5").length) === 4,
   await p.evaluate(() => Y().classes));
ok("�����̃^�C�������̐�",
   await p.locator(".tile.cls").count() === 6,
   await p.locator(".tile.cls").count());
ok("��Ȃ�1��", await p.locator(".tile.sp").count() === 1);
ok("���{�̊�{���Ԋ������Ȃ��i�V�[�g�����{�j",
   await p.evaluate(() => Object.keys(Y().base).join(",")) === "5-1",
   await p.evaluate(() => Object.keys(Y().base)));

console.log("\n�� �J������ʂɗv��V�[�g�����ǂ�");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".tile[data-c='5-1']").click();
await p.waitForTimeout(400);
const rw = await lastCall("apiReadWeek");
ok("�N���X���J���ƁA���̏T��ǂ݂ɍs��", !!rw, rw);
ok("�ǂނ̂� �S�Z�E���̊w�N�E���̃N���X ��3������",
   rw && JSON.stringify(rw.args[2]) === JSON.stringify([
     {layer:"school", target:""}, {layer:"grade", target:"5"},
     {layer:"home", target:"5-1"}]),
   rw && rw.args[2]);
/* �J�������ƁA�肪�󂢂Ă��邤���Ɏc����ǂ�ł��� */
await p.waitForTimeout(1500);
const pre = await lastCall("apiReadWeek");
ok("�J�������Ƃ́A���̏T�̎c����ǂ�ł����i���̃N���X��҂����Ȃ��j",
   !!pre && pre.args[2].length > 3, pre && pre.args[2] && pre.args[2].length);

console.log("\n�� �҂��Ă��邠�����A�҂��Ă���ƕ�����");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
/* �܂��ǂ�ł��Ȃ��T�ֈڂ�i���������Ă��邠�����͏T�Ă�ǂ܂Ȃ��j */
await p.locator("#nextWk").click(); await p.waitForTimeout(300);
await p.locator("#nextWk").click(); await p.waitForTimeout(300);
await p.evaluate(() => { window.__slow = 1500; });      /* �Ԏ����x����� */
await p.locator(".tile[data-c='5-2']").click();
await p.waitForTimeout(300);                            /* �܂��Ԏ��͗��Ă��Ȃ� */
ok("�����Ă��������o��i�Ԏ���҂��Ȃ��j",
   await p.locator("#sheet .cell").count() > 0
   && await p.locator("#gate").isHidden() === true,
   await p.locator("#sheet .cell").count());
ok("�҂��Ă���󂪏o��", await p.locator("#busy").isVisible() === true);
ok("�������đ҂��Ă��邩������",
   (await p.locator("#busyTxt").innerText()).indexOf("5-2") >= 0,
   await p.locator("#busyTxt").innerText());
ok("��ʂ̏�[�ɂ��т��o���i�ǂ������Ă��Ă��ڂɓ���j",
   await p.locator(".app").evaluate(e => e.classList.contains("busy-on")) === true);
ok("�������^�C���ɂ��育�������o��",
   await p.locator(".tile[data-c='5-2'].opening").count() === 1);
await p.waitForTimeout(1600);
ok("�͂������͏�����", await p.locator("#busy").isHidden() === true);
ok("�͂�����т�������",
   await p.locator(".app").evaluate(e => e.classList.contains("busy-on")) === false);
ok("�͂�����^�C���̈��������", await p.locator(".opening").count() === 0);

console.log("\n�� ���̃N���X�͑҂����Ȃ��i��ɓǂ�ł����j");
await p.evaluate(() => { window.__slow = 0; });
await p.waitForTimeout(1600);                  /* �肪�󂢂�����Ɏc���ǂ� */
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='1-1']").click(); await p.waitForTimeout(500);
ok("2�N���X�ڂ͓ǂ݂ɍs���Ȃ��i�����茳�ɂ���j",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());
ok("2�N���X�ڂ͑҂���o�Ȃ�", await p.locator("#busy").isHidden() === true);
/* ���Ƃ̏T�֖߂� */
await p.locator("#prevWk").click(); await p.waitForTimeout(300);
await p.locator("#prevWk").click(); await p.waitForTimeout(400);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);

console.log("\n�� �����Ă��A�����܂ő���Ȃ�");
ok("����5�s�Ԃ� �~ ��?�y��6��", await p.locator("#sheet .cell").count() === 30,
   await p.locator("#sheet .cell").count());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(1200);
ok("�ł��������ł͑���Ȃ�",
   (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("�܂������Ă��Ȃ��R�}�̐����o��",
   (await p.locator("#saveTxt").innerText()).indexOf("1") >= 0,
   await p.locator("#saveTxt").innerText());
ok("�����Ă��Ȃ������͕ۑ����ڗ���",
   await p.locator("#saveBtn").evaluate(e => e.classList.contains("dirty")) === true);

console.log("\n�� �ۑ��������Ƒ���");
await p.locator("#saveBtn").click();
await p.waitForTimeout(600);
const wc = await lastCall("apiWriteCells");
ok("apiWriteCells ���Ă΂��", !!wc, wc);
ok("1�R�}��1���i�Ō��̂Ԃ񂾂������Ȃ��j", wc && wc.args[1].length === 1, wc && wc.args[1]);
const q = wc && wc.args[1][0];
ok("�w�ƑΏۂ�������", q && q.layer === "home" && q.target === "5-1", q);
ok("���t�͗j���ł͂Ȃ������t", q && /^\d{4}-\d{2}-\d{2}$/.test(q.date), q && q.date);
ok("�薼�Ƌ��Ȃ�����", q && q.title === "�Z��" && q.subject === "sansu", q);
ok("�T�[�o���ł��������Ŏ茳�𒼂�",
   await p.evaluate(() => week().home["5-1"]["1|p2"].at) === 1700000000000,
   await p.evaluate(() => week().home["5-1"]["1|p2"]));
ok("����I�������u�ۑ����݁v�ɂȂ�",
   (await p.locator("#saveTxt").innerText()).indexOf("����") >= 0,
   await p.locator("#saveTxt").innerText());

console.log("\n�� �����R�}�����x�����Ă�1��");
await p.evaluate(() => { window.__calls.length = 0; });
for(const v of ["kokugo", "sansu", "kokugo"]){
  await p.locator(".pal[data-v='" + v + "']").click();
  await p.waitForTimeout(80);
}
await p.locator("#saveBtn").click(); await p.waitForTimeout(500);
const again = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1].length));
ok("3�񒼂��Ă�����̂�1��", JSON.stringify(again) === JSON.stringify([1]), again);
ok("����͍̂Ō�̒��g",
   (await lastCall("apiWriteCells")).args[1][0].title === "����",
   (await lastCall("apiWriteCells")).args[1][0]);

console.log("\n�� �܂Ƃߑ���");
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
ok("3�R�}��1��ő���", many.length === 1 && many[0] === 3, many);

console.log("\n�� �T���ʂ�ς���Ƃ��́A�����Ȃ��Ă�����");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(150);
await p.locator("#nextWk").click();
await p.waitForTimeout(600);
ok("�T�𓮂����ƁA�������Ԃ񂪐�ɓ͂�",
   (await calls()).indexOf("apiWriteCells") >= 0, await calls());
await p.locator("#prevWk").click(); await p.waitForTimeout(500);

console.log("\n�� �������ς���Ƒw���ς��");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='4'][data-s='p3'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pScope input[value='grade']").check();
await p.locator(".pal[data-v='kokugo']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const gq = (await lastCall("apiWriteCells")).args[1][0];
ok("�w�N�ɔ��f����Ƒw�� grade�E�Ώۂ͊w�N",
   gq.layer === "grade" && gq.target === "5", gq);

console.log("\n�� ��ɂ���Ə����w�����͂�");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(150);
await p.locator("#pClear").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const dq = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("�����w���ɂȂ�", dq.remove === true || (!dq.title && !dq.note), dq);

/* **��A�B** �ʏ�̕ۑ� �� �ق��̐搶����ɒ��� �� ���� �� �㏑���ő��蒼���B
   1���m���߂Ă��A�Ȃ��Ɨ�����i�T�������������Ō��Ői�ށA
   ���������Ԃ񂪑��M�̗񂩂������A�Ȃǁj�B */
console.log("\n�� �ʏ�ۑ� �� ���� �� ����ł��㏑��");
await p.evaluate(() => { window.__calls.length = 0; });
const CELL = "#sheet .cell[data-d='3'][data-s='p3']";
await p.locator(CELL + " .t").click(); await p.waitForTimeout(150);
await p.locator("#pScope input[value='self']").check();
await p.locator(".pal[data-v='kokugo']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const c1 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("�͂��߂̕ۑ��� expectedAt 0�i�܂��N�������Ă��Ȃ��j", c1.expectedAt === 0, c1);
ok("���̂܂ܓ���", await p.locator("#cfDlg").isVisible() === false);

/* �ق��̐搶���A���̉�ʂ�ʂ����ɓ����R�}�𒼂��� */
const theDate = await p.evaluate(() => iso(addDays(monday, 3)));
const oAt1 = await p.evaluate(([d]) =>
  window.__other(fy(), "home", "5-1", d, "p3", "�s���i�����j"), [theDate]);

await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(CELL + " .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(700);
const c2 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("2��ڂ́A�͂��߂ɒm���Ă��������𑗂�", c2.expectedAt === 1700000000000, c2);
ok("**�Ō��̂��тɕ��������i��ł��Ȃ�**", c2.expectedAt !== 0 && c2.title === "�Z��", c2);
ok("�����̑����o��", await p.locator("#cfDlg").isVisible() === true);
ok("���ܓ����Ă��钆�g���o��",
   (await p.locator("#cfList").innerText()).indexOf("�s���i�����j") >= 0,
   await p.locator("#cfList").innerText());
ok("����������悤�Ƃ������g���o��",
   (await p.locator("#cfList").innerText()).indexOf("�Z��") >= 0,
   await p.locator("#cfList").innerText());
ok("**����́u�ŐV�̓��e������v**",
   await p.evaluate(() => document.activeElement && document.activeElement.id) === "cfSee",
   await p.evaluate(() => document.activeElement && document.activeElement.id));

/* �P�[�X�FEsc �ŕ���B**�㏑�����Ȃ����ɗ�����B** */
await p.evaluate(() => { window.__calls.length = 0; });
await p.keyboard.press("Escape");
await p.waitForTimeout(800);
ok("Esc �́u�ŐV�̓��e������v�ɗ�����",
   (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("���̂Ƃ��T��ǂݒ���", (await calls()).indexOf("apiReadWeek") >= 0, await calls());
ok("��ʂ͂ق��̐搶�̓��e�ɂȂ�",
   (await p.locator(CELL + " .t").innerText()).indexOf("�s��") >= 0,
   await p.locator(CELL + " .t").innerText());
ok("�����Ă��Ȃ��R�}�͎c���Ă��Ȃ�",
   (await p.locator("#saveTxt").innerText()).indexOf("����") >= 0,
   await p.locator("#saveTxt").innerText());

/* �P�[�X�F������x�Ԃ��āA���x�́u����ł������̓��e�ŏ㏑������v */
const oAt2 = await p.evaluate(([d]) =>
  window.__other(fy(), "home", "5-1", d, "p3", "�s���i�����E2�j"), [theDate]);
ok("�ق��̐搶�͈Ⴄ�����ŏ������i�ǂݒ��������Ƃ̉�ʂƂ͐H���Ⴄ�j",
   oAt2 > oAt1, [oAt1, oAt2]);
await p.locator(CELL + " .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.locator("#saveBtn").click(); await p.waitForTimeout(700);
ok("������x��������", await p.locator("#cfDlg").isVisible() === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#cfMine").click();
await p.waitForTimeout(1200);
const c3 = (await lastCall("apiWriteCells")).args[1].slice(-1)[0];
ok("�㏑����I�ԂƑ��蒼��", !!c3, c3);
ok("**���蒼���́A���܃T�[�o�ɂ��鎞���ő���**",
   c3 && c3.expectedAt === oAt2, [c3, oAt2]);
ok("force �̂悤�ȍ��}�͑����Ȃ�", c3 && c3.force === undefined, c3);
ok("����͎̂����̓��e", c3 && c3.title === "����", c3);
ok("���蒼���O�ɓǂݒ����Ă���",
   (await calls()).indexOf("apiReadWeek") >= 0
   && (await calls()).indexOf("apiReadWeek") < (await calls()).lastIndexOf("apiWriteCells"),
   await calls());
ok("�������̂ő��͕��Ă���", await p.locator("#cfDlg").isVisible() === false);
ok("��ʂ͎����̓��e�ɂȂ�",
   (await p.locator(CELL + " .t").innerText()).indexOf("����") >= 0,
   await p.locator(CELL + " .t").innerText());

console.log("\n�� �w���Ґ��𒼂��ƃV�[�g�֏���");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("[data-act='settings']").click();
await p.locator('#setRoster').click();
await p.waitForTimeout(250);
await p.locator("#rsRows input[data-g='1']").fill("1-1, 1-2, 1-3");
await p.locator("#rsRows input[data-g='1']").press("Enter");
await p.waitForTimeout(400);
const rq = await lastCall("apiWriteRoster");
ok("apiWriteRoster ���Ă΂��", !!rq);
ok("�������Ґ����͂�", rq && rq.args[1]["1"].length === 3, rq && rq.args[1]);

await p.locator("#rosterDlg .dlgx").click(); await p.waitForTimeout(200);

console.log("\n�� �Œ莞�Ԋ��̎�荞��");
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("[data-act='settings']").click();
await p.locator('#setBase').click(); await p.waitForTimeout(250);
await p.locator("#baseImp").click(); await p.waitForTimeout(250);
await p.locator("#impSrc button[data-s='sheet']").click(); await p.waitForTimeout(150);
await p.locator("#impRead").click(); await p.waitForTimeout(400);
ok("�u�V�[�g����v�� apiReadPaste ���Ă�",
   (await calls()).indexOf("apiReadPaste") >= 0, await calls());
ok("�V�[�g�̕\�����̂܂ܓǂ߂�",
   await p.evaluate(() => (impRes.classes["5-1"].B["0|p2"] || {}).title) === "����",
   await p.evaluate(() => impRes.classes && impRes.classes["5-1"]));
await p.evaluate(() => { window.__calls.length = 0; });
/* �����O�̊m�F�͐�p�̑��i�u���E�U�� confirm �͎g��Ȃ��j */
await p.locator("#impGo").click(); await p.waitForTimeout(250);
await p.locator("#okYes").click(); await p.waitForTimeout(500);
const ba = await lastCall("apiWriteBaseAll");
ok("�����Ƃ���1��ł܂Ƃ߂đ���i�N���X���Ƃɑ���Ȃ��j",
   !!ba && (await p.evaluate(() =>
     window.__calls.filter(c => c.name === "apiWriteBase").length)) === 0, ba);
ok("A�T��B�T�̗������͂�",
   !!ba && !!ba.args[1]["5-1"].A && !!ba.args[1]["5-1"].B, ba && Object.keys(ba.args[1]));
await p.locator("#baseDlg .dlgx").click(); await p.waitForTimeout(250);

console.log("\n�� ����ۂۂ̑g���V�[�g�Ŏ���");
ok("�V�[�g�̑g�����̂܂܉�ʂ̑g�ɂȂ�",
   JSON.stringify(await p.evaluate(() => Y().tanpopo)) === JSON.stringify({"1":["5-1"]}),
   await p.evaluate(() => Y().tanpopo));
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
/* **�g�����͑��̒��B** �ʂɂ͒u���Ȃ��i�����͔̂N�x�̏��߂Ɠ]���E�]�o�����j */
await p.locator("#tpGrpOpen").click(); await p.waitForTimeout(300);
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(300);
const tq = await lastCall("apiWriteRoster");
ok("�����ƃV�[�g�֏����i�g���Ƃ̕��тŁj",
   !!tq && JSON.stringify(tq.args[4]) === JSON.stringify({"1":["5-1","5-2"]}),
   tq && tq.args[4]);
/* **�����g��2�������2�l�B** �O�̃N���b�N�؂�ւ��͂������� */
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("�����g��2�������2�l�ɂȂ�", await p.evaluate(() => tpCount("5-2")) === 2,
   await p.evaluate(() => tpCount("5-2")));
ok("2�l�Ԃ�2��Ƃ��ĕ���",
   (await p.evaluate(() => tpColumns())).filter(x => x.cls === "5-2").length === 2,
   await p.evaluate(() => tpColumns()));
await p.locator("#tpGrpBody .tpin[data-g='1'][data-i='2']").click(); await p.waitForTimeout(250);
ok("�g�̒���1�l�������ƊO���", await p.evaluate(() => tpCount("5-2")) === 1,
   await p.evaluate(() => Y().tanpopo));
/* 2�g�ւ�����āA�o�����т� 1�g �� 2�g �ɂȂ邱�Ƃ����� */
await p.locator("#tpGrpBody .tpghead[data-g='2']").click(); await p.waitForTimeout(150);
await p.locator("#tpGrpBody .tpchip[data-c='5-2']").click(); await p.waitForTimeout(250);
ok("����ۂ�1�g�̑S�� �� 2�g�̑S�� �̏��ɕ���",
   JSON.stringify(await p.evaluate(() => tpColumns()))
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   await p.evaluate(() => tpColumns()));
ok("�V�[�g�ɂ͑g�̔ԍ����͂�",
   JSON.stringify((await lastCall("apiWriteRoster")).args[4])
     === JSON.stringify({"1":["5-1","5-2"], "2":["5-2"]}),
   (await lastCall("apiWriteRoster")).args[4]);
await p.locator("#tpGrpDlg .dlgx").click(); await p.waitForTimeout(250);
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n�� ����ۂێ��Ԋ��֏o���i1�T1�V�[�g�j");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".master.tp").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; });
let nativeConfirm = false;
const onDlg = async d => { nativeConfirm = true; await d.dismiss(); };
p.on("dialog", onDlg);
await p.locator("#tpGo").click(); await p.waitForTimeout(400);
p.off("dialog", onDlg);
ok("�u���E�U�� confirm �ł͂Ȃ��A��p�̑��ŕ���",
   nativeConfirm === false && await p.locator("#tpDlg").evaluate(d => d.open) === true);
ok("����́u�o���Ȃ��v", await p.evaluate(() =>
   document.activeElement && document.activeElement.id) === "tpNo");
ok("�u�o���Ȃ��v����������1����Ă΂Ȃ�", await (async () => {
     await p.locator("#tpNo").click(); await p.waitForTimeout(400);
     return (await calls()).indexOf("apiExportWeek") < 0;
   })() === true, await calls());

await p.locator("#tpGo").click(); await p.waitForTimeout(300);
await p.locator("#tpYes").click(); await p.waitForTimeout(900);
const tp = await lastCall("apiExportWeek");
ok("apiExportWeek ���Ă�", !!tp, await calls());
ok("�o���O�ɁA�������Ԃ���ɑ���",
   (await calls()).indexOf("apiWriteCells") <
   (await calls()).indexOf("apiExportWeek")
   || (await calls()).indexOf("apiWriteCells") < 0, await calls());
ok("���ɏo�Ă���Ƃ���̎��Ɩ���n���i��?���Ԃ�j",
   !!tp && Object.keys(tp.args[2]["5-1"]).length === 5, tp && tp.args[2]["5-1"]);
/* **�g���Ƃ̕��т����̂܂ܓn���B** �o����̗�� 1�g�̑S�� �� 2�g�̑S�� �c �̏��ɂȂ� */
ok("�g���Ƃ̕��тœn��",
   !!tp && JSON.stringify(tp.args[3])
     === JSON.stringify([{cls:"5-1",group:1},{cls:"5-2",group:1},{cls:"5-2",group:2}]),
   tp && tp.args[3]);
/* ���̊w�Z�̎����͎��Ƃ�3�R�}�����Ȃ��B**�����V�[�g�̎��Ƃ̍s�ɍ��킹��** */
ok("�Z����ID�͎����V�[�g���猈�߂�",
   !!tp && JSON.stringify(tp.args[4]) === JSON.stringify(["p1", "p2", "p3"]),
   tp && tp.args[4]);
ok("�V�[�g���u�������T�v���n��", !!tp && /^\d+��\d+�T$/.test(String(tp.args[5])),
   tp && tp.args[5]);
const tpOut = await p.locator("#tpWarn").innerText();
ok("�o�������ƁA�ǂ̃V�[�g�ɓ����������o��", tpOut.indexOf("�V�[�g�u") >= 0, tpOut);
ok("���R�}�����������o��", /���Ɩ� \d+ �R�}/.test(tpOut), tpOut);
ok("�������O�̃V�[�g���c�������Ƃ��o��",
   tpOut.indexOf("���O��ς��Ďc����") >= 0, tpOut);
ok("�T�̏��ɕ��Ԃ��Ƃ��o��", tpOut.indexOf("�T�̏�") >= 0, tpOut);
ok("�����̗�̕����o���i�ݒ肩��ς�����j",
   tpOut.indexOf("50px") >= 0 && tpOut.indexOf("����ۂۗ�") >= 0, tpOut);

console.log("\n�� �u���܂̌`���݂�v�u���Ȃ����v�͖�������");
ok("��ʂɁu���܂̌`���݂�v������", await p.locator("#tpShape").count() === 0);
ok("��ʂɁu���̌`�ō��Ȃ����v������", await p.locator("#tpBuild").count() === 0);
ok("apiShapeTanpopo / apiBuildTanpopo �͌Ă΂Ȃ�",
   (await calls()).indexOf("apiShapeTanpopo") < 0
   && (await calls()).indexOf("apiBuildTanpopo") < 0, await calls());
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(300);

console.log("\n�� �T�𓮂����ƁA���̏T��ǂ݂ɍs��");
await p.evaluate(() => { window.__calls.length = 0; });
for(let i = 0; i < 5; i++){ await p.locator("#nextWk").click(); await p.waitForTimeout(250); }
await p.waitForTimeout(500);
ok("�܂����Ă��Ȃ��T�� apiReadWeek ���Ă�",
   (await calls()).indexOf("apiReadWeek") >= 0, await calls());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#prevWk").click();
await p.waitForTimeout(500);
ok("��x�ǂ񂾏T�͓ǂݒ����Ȃ��i�����T�ŉ������Ȃ��j",
   (await calls()).indexOf("apiReadWeek") < 0, await calls());

console.log("\n�� ����Ȃ��܂ܕ��Ă��A���ɊJ�����Ƃ��ɑ���");
/* ���炸�ɏ������R�}�����A���̏�ōT�����ł��Ă��邩������ */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__hang = true; });   /* �����Ă��Ԏ������Ȃ���� */
await p.locator("#sheet .cell[data-d='0'][data-s='p3'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.waitForTimeout(1300);                 /* �T���������̂�҂� */
const pend = await pending();
ok("�����Ă��Ȃ��R�}�́A���̒[���ɍT����",
   !!pend && pend.length === 1 && pend[0].title === "����", pend);
ok("�T����̂͒��g���Ɓi���ɊJ�����Ƃ��A�ǂݒ����ŏ����Ȃ��悤�Ɂj",
   !!pend && pend[0].layer === "home" && pend[0].target === "5-1"
   && /^\d{4}-\d{2}-\d{2}$/.test(pend[0].date), pend && pend[0]);

/* ���炸�ɕ������Ƃɂ��āA�J������ */
await p.evaluate(() => { window.__calls.length = 0; });
await p.reload();
await p.waitForTimeout(1200);
const resent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]));
ok("�J�������ƁA�T���Ă����Ԃ�𑗂�",
   resent.length === 1 && resent[0].length === 1 && resent[0][0].title === "����", resent);
ok("�T��ǂݒ�������ɑ���", await p.evaluate(() => {
     const n = window.__calls.map(c => c.name);
     const w = n.indexOf("apiWriteCells"), r = n.indexOf("apiReadWeek");
     return w >= 0 && (r < 0 || w < r);
   }) === true, await calls());
ok("���ꂽ��T���͏���", (await pending()).length === 0, await pending());

console.log("\n�� ���蒼���Ɏ��s���Ă��A�T���͎̂ĂȂ�");
/* **�������O�͎̂ĂĂ����B** ����Ȃ������̂ɍT���������Ă����̂ŁA
   ���̂��ƏT��ǂݒ��������_�ŁA���钼�O�ɏ������R�}���i�v�ɏ����Ă����B
   �T�����v��̂́A�܂��ɂ��̎��̂̂��߂̂��́B */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__hang = true; });
await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='sansu']").click();
await p.waitForTimeout(1300);
ok("����Ȃ��܂܍T�����ł��Ă���", (await pending()).length === 1, await pending());

/* **�J���������Ƃ��̑��蒼�������s����`�B** �������O�͍T���������Ă����B
   �����オ���1��ő��蒼���A���s���Ă������Ă����̂ŁA���̂��ƏT��
   �ǂݒ��������_�ŁA���钼�O�ɏ������R�}���i�v�ɏ����Ă����B */
/* **����1��̗����オ�肾�����s������B** addInitScript �͊O���Ȃ��̂ŁA
   ��� localStorage �ɒu���āA�ǂ񂾑������̏�ŏ��� */
await p.addInitScript(() => {
  if(localStorage.getItem("wirecheck/failBoot") === "1"){
    window.__failWrite = true;
    localStorage.removeItem("wirecheck/failBoot");
  }
});
await p.evaluate(() => localStorage.setItem("wirecheck/failBoot", "1"));
await p.reload();
await p.waitForTimeout(1500);
const kept = await pending();
ok("���蒼���Ɏ��s���Ă��A�T�����̂ĂȂ�",
   Array.isArray(kept) && kept.length === 1 && kept[0].title === "�Z��", kept);
ok("�T���Ă����Ԃ�́A����҂��ɂ��ςݒ���",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));
ok("����Ă��Ȃ����Ƃ���ʂɏo��",
   (await p.locator("#saveTxt").innerText()).indexOf("�ۑ��ł��Ă��Ȃ�") >= 0
   || (await p.locator("#saveTxt").innerText()).indexOf("�ۑ��i") >= 0,
   await p.locator("#saveTxt").innerText());

/* ������߂�΁A�T���Ă����Ԃ�����̂܂܏o�Ă��� */
await p.evaluate(() => { window.__failWrite = false; });
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
await p.locator("#saveBtn").click(); await p.waitForTimeout(900);
ok("������߂�΁A�T���Ă����Ԃ�������",
   (await pending()).length === 0 && await p.evaluate(() => Backend.unsaved()) === 0,
   [await pending(), await p.evaluate(() => Backend.unsaved())]);
await p.evaluate(() => { window.__failWrite = true; });
/* ���܎茳�ɂ���Ԃ���A���s�������֑����Ă݂� */
await p.locator("#sheet .cell[data-d='3'][data-s='p1'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='gyoji']").click();
await p.waitForTimeout(200);
await p.locator("#saveBtn").click();
await p.waitForTimeout(900);
ok("����Ȃ�������u�ۑ��ł��Ă��Ȃ��v�Əo��",
   (await p.locator("#saveTxt").innerText()).indexOf("�ۑ��ł��Ă��Ȃ�") >= 0,
   await p.locator("#saveTxt").innerText());
ok("����Ȃ������Ԃ�́A����҂��ɖ߂�",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));
ok("����Ȃ������Ԃ�́A�T���ɂ��c��", (await pending()).length > 0, await pending());
await p.evaluate(() => { window.__failWrite = false; });
await p.locator("#saveBtn").click();
await p.waitForTimeout(900);
ok("���������΁A���̂܂ܑ����",
   await p.evaluate(() => Backend.unsaved()) === 0
   && (await pending()).length === 0,
   [await p.evaluate(() => Backend.unsaved()), await pending()]);

console.log("\n�� �����Ă���r���ŕ��Ă��A�T���Ɏc���Ă���");
/* **�������O�͏����Ă����B** ����n�߂����_�ōT������O���Ă����̂ŁA
   �Ԏ�������O�ɉ�ʂ������ƁA���̂Ԃ�̓V�[�g�ɂ��T���ɂ��c��Ȃ������B */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; window.__failWrite = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(400);
await p.locator("#sheet .cell[data-d='1'][data-s='p3'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click();
await p.waitForTimeout(1200);
await p.evaluate(() => { window.__hang = true; });   /* �����Ă��Ԏ������Ȃ� */
await p.locator("#saveBtn").click();
await p.waitForTimeout(700);
ok("�����Ă���r�����A�T���ɒ��g���c���Ă���",
   (await pending()).some(q => q.slot === "p3" && q.target === "5-4" && q.title === "����"),
   await pending());
ok("�����Ă���r���́u�ۑ����݁v�ƌ���Ȃ�",
   await p.evaluate(() => Backend.unsaved()) > 0,
   await p.evaluate(() => Backend.unsaved()));

/* ���炸�ɕ������Ƃɂ��āA�J������ */
await p.evaluate(() => { window.__calls.length = 0; });
await p.reload();
await p.waitForTimeout(1400);
ok("�J�������ƁA�����Ă���r���������Ԃ�𑗂蒼��", await p.evaluate(() =>
     window.__calls.filter(c => c.name === "apiWriteCells")
       .map(c => c.args[1]).flat()
       .some(q => q.slot === "p3" && q.target === "5-4" && q.title === "����")) === true,
   await p.evaluate(() => window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1])));
ok("���ꂽ��T���͏�����",
   (await pending()).length === 0, await pending());
ok("�V�[�g�ɂ������Ă���", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-4"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0
       && bank[k] && bank[k].title === "����");
   }) === true, await p.evaluate(() => window.__sheet()));

console.log("\n�� �u��ʂɖ߂��v�̓V�[�g�ɂ��͂�");
/* **�O�͂������茳�����ŏ����Ă����B** �߂����悤�Ɍ����āA���ɊJ���Ɩ߂��Ă����B
   �ق��̌��������Ă���R�}��G��Ȃ��悤�A5-3 �̎g���Ă��Ȃ��R�}�ł�� */
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
ok("�S�C�����ꂽ�R�}�ɂ́u��ʂɖ߂��v���o��",
   await p.locator("#pRevert").isVisible());
await p.locator("#pRevert").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const rev = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("�߂������Ƃ��V�[�g�֓͂��i�����w���ɂȂ�j",
   rev.length > 0 && rev.some(q => q.slot === "p3" && q.layer === "home"
                                 && (q.remove || (!q.title && !q.note))), rev);
ok("�V�[�g�̑�����������Ă���", await p.evaluate(() => {
     const st = window.__sheet();
     const bank = st[["2026","home","5-3"].join("\u0001")] || {};
     return Object.keys(bank).some(k => k.indexOf("|p3") > 0);
   }) === false, await p.evaluate(() => window.__sheet()));
/* **�J�������Ă��߂����܂܁B** �O�̓V�[�g�ɍs���c���Ă����̂Ŗ߂��Ă��� */
await p.reload(); await p.waitForTimeout(1400);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(500);
ok("�J�������Ă��A�S�C�̃R�}�͖߂��Ă��Ȃ�",
   await p.evaluate(() => !((week().home["5-3"] || {})["4|p3"])) === true,
   await p.evaluate(() => (week().home["5-3"] || {})["4|p3"]));
ok("��ʂɖ߂����̂ŁA��ʂ���{���Ԋ��̂��̂��o��",
   await p.evaluate(() => cellFor(4, "p3").layer) !== "home",
   await p.evaluate(() => cellFor(4, "p3").layer));

console.log("\n�� �N�ԍs�����A�����オ���1��ňꏏ�ɗ���");
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(500);
ok("�V�[�g����ǂ񂾍s���������Ă���",
   await p.evaluate(() => !!(Y().events || {})["2026-09-08"]) === true,
   await p.evaluate(() => Y().events));
ok("�ʂɎ��ɍs���Ȃ��iapiBoot ���ꏏ�ɕԂ��j",
   (await calls()).indexOf("apiReadEvents") < 0, await calls());
ok("�s���̂�����̌��o���Ɉ󂪕t��",
   await p.locator("#sheet .hd[data-d='1'].hasev").count() === 1,
   await p.locator("#sheet .hd.hasev").count());
await p.locator("#sheet .cell[data-d='1'][data-s='p2'] .t").click();
await p.waitForTimeout(250);
ok("�R�}��I�Ԃƌ�₪�o��", await p.locator("#pEvs .ev").count() === 2,
   await p.locator("#pEvs .ev").count());
await p.locator("#pEvs .ev").first().click(); await p.waitForTimeout(400);
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const evSent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("�����ē��ꂽ���̂́A�ӂ��̃R�}�Ƃ��ăV�[�g�֍s��",
   evSent.some(q => q.slot === "p2" && q.title.indexOf("�Z�O�w�K") >= 0
                 && q.subject === "gyoji"), evSent);
await p.evaluate(() => { writeCell(1, "p2", {title:"", note:"", subject:null}); });
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);

console.log("\n�� �T�������V�[�g�֑���");
/* **�O�͂��̒[���ɂ����c��Ȃ������B** ���鎆�͊w�����ƂȂ̂�
   �T�ɂЂƂ��������A�ق��̐搶�ɂ������Ȃ������B */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; window.__failWrite = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-2']").click(); await p.waitForTimeout(400);
await p.evaluate(() => { window.__calls.length = 0; setMemo("���Z������������"); });
await p.locator("#saveBtn").click(); await p.waitForTimeout(800);
const memoSent = await p.evaluate(() =>
  window.__calls.filter(c => c.name === "apiWriteCells").map(c => c.args[1]).flat());
ok("�������V�[�g�֑�����",
   memoSent.some(q => q.slot === "memo" && q.layer === "home" && q.target === "5-2"
                   && q.title.indexOf("���Z����") >= 0), memoSent);
ok("���j�̍s�Ƃ��đ���i�T�ɂЂƂj",
   memoSent.some(q => q.slot === "memo" && q.date === "2026-09-07"), memoSent);
ok("�J�������Ă��c���Ă���", await (async () => {
     await p.reload(); await p.waitForTimeout(1400);
     await p.locator(".tile[data-c='5-2']").click(); await p.waitForTimeout(500);
     return (await p.locator("#sheet .foot .t").innerText()).indexOf("���Z����") >= 0;
   })() === true, await p.locator("#sheet .foot .t").innerText());
ok("�ق��̊w���̎��ɂ͏o�Ȃ�", await (async () => {
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(400);
     return (await p.locator("#sheet .foot .t").innerText()).indexOf("���Z����") < 0;
   })() === true);

console.log("\n�� �J�����ςȂ��̉�ʂ��A���܂ɓǂݒ���");
/* **�O�͈�x�ǂ񂾂��x�Ɠǂݒ����Ȃ������B** 30�l�������T��G��^�p�Ȃ̂ɁA
   �^�u���J�����܂܂̒S�C�ɂ́A���̓��ق��̒N���������Ă��f��Ȃ������B */
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click();
/* **��ǂ݂��I���܂ő҂��Ă��琔���n�߂�B**
   ��ǂ݂͊J���� 1.2 �b��ɑ���̂ŁA�����Ő�����ƊJ�������̂Ԃ�ƍ����� */
await p.waitForTimeout(1800);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(500);
ok("�����J���������Ƃ��͓ǂ݂ɍs���Ȃ��i�����Č��邽�тɑ҂����Ȃ��j",
   (await calls()).filter(n => n === "apiReadWeek").length === 0, await calls());
ok("������̌�������i�J�����ςȂ��ł��ǂݒ����j",
   await p.evaluate(() => typeof Backend.watch === "function"
                       && typeof Backend.stale === "function") === true);
ok("�T�����Â�����΁A�J���Ƃ��ɓǂݒ���", await (async () => {
     await p.evaluate(() => { window.__calls.length = 0; Backend.stale(); });
     await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
     await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(700);
     return (await calls()).filter(n => n === "apiReadWeek").length > 0;
   })() === true, await calls());
/* �ق��̐搶�����ꂽ���Ƃɂ��āA�ǂݒ����ŉf�邩������ */
await p.evaluate(() => {
  const st = window.__sheet();
  const key = ["2026", "home", "5-1"].join("\u0001");
  const bank = st[key] || (st[key] = {});
  bank["2026-09-09|p2"] = {title:"�ق��̐l�����ꂽ", note:"", subject:null,
                           sp:"", at:1700000009999, by:"inoue@edu.nishi.or.jp"};
  window.__sheetSet(st);
});
/* �^�u�֖߂��Ă����`�����iheadless �ł� hidden �ɂȂ�Ȃ��̂ŁA
   ��������ʂ��F�T�����Â����Ă���ǂݒ����j */
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
await p.evaluate(() => { Backend.stale();
  document.dispatchEvent(new Event("visibilitychange", {bubbles:true})); });
await p.waitForTimeout(1200);
ok("�������񗣂�Ė߂�ƁA�ق��̐l�̏������݂��f��",
   (await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").innerText())
     .indexOf("�ق��̐l�����ꂽ") >= 0,
   await p.locator("#sheet .cell[data-d='2'][data-s='p2'] .t").innerText());

console.log("\n�� �Â��T�̕Ԏ����A���܌��Ă���T�������Ȃ�");
/* **�Ԏ��̏����͓���ւ��B** ���T�Ԃ�̕Ԏ�������O�ɗ��T�֓����ƁA
   �x��ē͂������T�Ԃ񂪁A���T�̒��g���㏑�����Ă��܂��`���������B */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(400);
/* ���T��1�R�}�����āA�V�[�g���ɓ���Ă��� */
await p.locator("#nextWk").click(); await p.waitForTimeout(500);
await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").click(); await p.waitForTimeout(120);
await p.locator(".pal[data-v='gyoji']").click(); await p.waitForTimeout(150);
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
const nextMon = await p.evaluate(() => wkKey());
await p.locator("#prevWk").click(); await p.waitForTimeout(400);
const thisMon = await p.evaluate(() => wkKey());
/* ���̒[���̍T�����̂ĂāA�V�[�g����ǂݒ�������B���T�Ԃ�̕Ԏ������x�点�� */
await p.evaluate(m => {
  localStorage.removeItem("school-timetable/v3");
  window.__lagNext = m;
}, thisMon);
await p.reload();
await p.waitForTimeout(400);
await p.evaluate(m => { window.__lag = {}; window.__lag[m] = 1500; }, thisMon);
await p.locator(".tile[data-c='5-4']").click(); await p.waitForTimeout(150);
await p.locator("#nextWk").click();                 /* ���T�Ԃ�̕Ԏ��͂܂����Ă��Ȃ� */
await p.waitForTimeout(2500);
ok("���T�����Ă��邠�����ɍ��T�̕Ԏ����͂��Ă��A���T�̒��g�͏����Ȃ�",
   (await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").innerText()).trim() === "�s��",
   [await p.evaluate(() => wkKey()),
    await p.locator("#sheet .cell[data-d='0'][data-s='p2'] .t").innerText()]);
ok("���T�֖߂�ƁA���T�̒��g���o��", await (async () => {
  await p.locator("#prevWk").click(); await p.waitForTimeout(700);
  return (await p.evaluate(() => wkKey())) === thisMon;
})() === true);
await p.evaluate(() => { window.__lag = {}; });

console.log("\n�� �������R�}�́A���ɊJ���Ă��c���Ă���");
/* **������������ƁA�V�[�g�ɂ͓����Ă���̂Ɋ�{���Ԋ��ɖ߂��Č�����B**
   ���� �� ���� �� �J������ �� �o��A�܂Œʂ��Ō��� */
await p.evaluate(() => { window.__slow = 0; window.__hang = false; });
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(500);
await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").click();
await p.waitForTimeout(120);
await p.locator(".pal[data-v='rika']").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(600);
ok("�������R�}���V�[�g���ɓ���",
   await p.evaluate(() => {
     const k = ["2026", "home", "5-3"].join("\u0001");
     const b = window.__sheet()[k] || {};
     return Object.keys(b).some(x => /\|p1$/.test(x) && b[x].title === "����");
   }) === true, await p.evaluate(() => window.__sheet()));

/* ���̒[���̍T�����̂ĂāA�V�[�g����ǂݒ������� */
await p.evaluate(() => { localStorage.removeItem("school-timetable/v3"); });
await p.reload();
await p.waitForTimeout(900);
await p.locator(".tile[data-c='5-3']").click(); await p.waitForTimeout(900);
ok("�J�������Ă��A�������R�}���o��i��{���Ԋ��ɖ߂�Ȃ��j",
   (await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").innerText()).trim() === "����",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1'] .t").innerText());
ok("���ꂽ�w�̂܂ܖ߂�i�S�C�����ꂽ���̂Ƃ��ďo��j",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1']").getAttribute("data-layer") === "home",
   await p.locator("#sheet .cell[data-d='2'][data-s='p1']").getAttribute("data-layer"));

/* **�w�Ɛl�͕ʂ̂��́B** �V�[�g�́u�X�V�ҁv�̓��[���Ȃ̂ŁA�茳�ł�
   ���[�������Č`�����낦���B���낦�ď��߂āu���������l���v�𔻒�ł���B */
console.log("\n�� ���������ꂽ�R�}���A���l�����ꂽ�R�}��");
ok("�J���Ă���l�̃��[������ʂ܂œ͂�",
   await p.evaluate(() => myEmail()) === "tanaka@edu.nishi.or.jp",
   await p.evaluate(() => myEmail()));
ok("�����̃��[���Ȃ玩��", await p.evaluate(() => isMe("tanaka@edu.nishi.or.jp")) === true);
ok("�啶���������͓������̂Ƃ��Č���",
   await p.evaluate(() => isMe("Tanaka@Edu.Nishi.or.jp")) === true);
ok("�ʂ̐l�Ȃ玩���ł͂Ȃ�", await p.evaluate(() => isMe("suzuki@edu.nishi.or.jp")) === false);
ok("��͎����ł͂Ȃ��i������Ȃ��Ƃ��͑��l�ɓ|���j",
   await p.evaluate(() => isMe("")) === false);
ok("�������R�}�̍X�V�҂́A�w�ł͂Ȃ��l",
   await p.evaluate(() => {
     const w = week(), k = Object.keys(w.home["5-3"] || {})[0];
     return k ? w.home["5-3"][k].by : null;
   }) === "tanaka@edu.nishi.or.jp",
   await p.evaluate(() => {
     const w = week(), k = Object.keys(w.home["5-3"] || {})[0];
     return k ? w.home["5-3"][k] : null;
   }));
/* �w�N�̖ʂ���S�C�̃R�}��ׂ��`�Ō���i�w���Ⴄ�̂ŁA�w�ł͏�����Ȃ��j�B
   **�����R�}�ŁA�X�V�҂��������ւ��Ĕ�ׂ�B** */
const owFrom = (by) => p.evaluate(who => {
  const w = week(), key = "1|p2", keep = view;
  (w.home["5-3"] || (w.home["5-3"] = {}))[key] =
    {title:"����", note:"", subject:"kokugo", at:Date.now(), by:who};
  view = {kind:"grade", grade:"5"};
  const n = wouldOverwrite(1, "p2").length;
  view = keep;
  delete w.home["5-3"][key];
  return n;
}, by);
ok("���������ꂽ�R�}�Ȃ畷���Ȃ�", await owFrom("tanaka@edu.nishi.or.jp") === 0,
   await owFrom("tanaka@edu.nishi.or.jp"));
ok("���l�����ꂽ�R�}�Ȃ畷��", await owFrom("suzuki@edu.nishi.or.jp") >= 1,
   await owFrom("suzuki@edu.nishi.or.jp"));
ok("�X�V�҂�������Ȃ��R�}�������i���l�ɓ|���j", await owFrom("") >= 1, await owFrom(""));

console.log("\n�� �Ǘ��E�V�X�e���i�{�Ԃł́A�ǂ��ɂȂ��ł��邩���o��j");
await p.locator(".side .admin").click();
await p.waitForTimeout(250);
ok("�{�ԂɂȂ��ł���ƌ���",
   (await p.locator("#sysTbl").innerText()).indexOf("�X�v���b�h�V�[�g") >= 0,
   await p.locator("#sysTbl").innerText());
ok("�Ȃ��ł���t�@�C���̖��O���o��",
   (await p.locator("#sysTbl").innerText()).indexOf("�T�� 2026�i���ؖk�j") >= 0,
   await p.locator("#sysTbl").innerText());
ok("�J���Ă���l�̃��[�����o��",
   (await p.locator("#sysTbl").innerText()).indexOf("tanaka@edu.nishi.or.jp") >= 0,
   await p.locator("#sysTbl").innerText());
await p.locator("#adminDlg .dlgx").click();
await p.waitForTimeout(200);

console.log("\n�� �V�N�x�̌����i����Ȃ����̂������w������j");
await p.locator(".side .admin").click(); await p.waitForTimeout(200);
await p.locator("#ckGo").click(); await p.waitForTimeout(300);
ok("apiCheckYear ���A�J���Ă���N�x�ŌĂ�",
   (await lastCall("apiCheckYear")).args[0] === 2026, await lastCall("apiCheckYear"));
ok("����Ȃ����̂̌���������",
   (await p.locator("#ckStat").innerText()).indexOf("1 ��") >= 0,
   await p.locator("#ckStat").innerText());
ok("���ڂ�S�����ׂ�", await p.locator("#ckOut tr").count() === 3,
   await p.locator("#ckOut tr").count());
ok("����Ȃ����̂́u�v��v�Əo��",
   (await p.locator("#ckOut tr.ng .lv").innerText()).trim() === "�v��",
   await p.locator("#ckOut tr.ng .lv").innerText());
ok("���������o��",
   (await p.locator("#ckOut tr.ng").innerText()).indexOf("�\�����荞��") >= 0,
   await p.locator("#ckOut tr.ng").innerText());
ok("�F�����Ō����������Ȃ��i���ł������j", await p.evaluate(() =>
     [...document.querySelectorAll("#ckOut .lv")].every(e => e.innerText.trim().length > 0)) === true);
ok("�悢���ڂ͗��Ƃ��ďo���i�ǂނƂ�������炷�j", await p.evaluate(() => {
     const a = getComputedStyle(document.querySelector("#ckOut tr.ok th")).color;
     const b = getComputedStyle(document.querySelector("#ckOut tr.ng th")).color;
     return a !== b;
   }) === true);
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

/* **������������́A�K�����������������ɓ����B**
   ��������i2�b�j�ɓ͂��O�Ɏ�����Ȃ����߂̖ڐ���B */
console.log("\n�� �ۑ��ɂ����������Ԃ��A�Ǘ��E�V�X�e���ɏo��");
/* ���̐߂̑O�ŊJ�������Ă���̂ŁA�܂�1�񏑂��ĕۑ����� */
await p.locator("#sheet .cell[data-d='3'][data-s='p2'] .t").click(); await p.waitForTimeout(150);
await p.locator(".pal[data-v='sansu']").click(); await p.waitForTimeout(200);
await p.locator("#saveBtn").click(); await p.waitForTimeout(500);
ok("�ۑ�����Ǝ��Ԃ��o����", await p.evaluate(() => {
     const t = Backend.info().times;
     return !!t && t.n >= 1 && typeof t.round === "number";
   }) === true, await p.evaluate(() => Backend.info().times));
ok("�҂��Ə������݂𕪂��Ď���", await p.evaluate(() => {
     const t = Backend.info().times;
     return typeof t.wait === "number" && typeof t.ms === "number";
   }) === true, await p.evaluate(() => Backend.info().times));
await p.locator(".side .admin").click(); await p.waitForTimeout(250);
ok("�����΂�x�������Ԃ���o���i���ς́A���܂ɏo��x�����B���j",
   (await p.locator("#sysTbl").innerText()).indexOf("�ł��x������") >= 0,
   await p.locator("#sysTbl").innerText());
ok("���R�}�E���V�[�g�����������o��",
   (await p.locator("#sysTbl").innerText()).indexOf("�V�[�g") >= 0,
   await p.locator("#sysTbl").innerText());
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

/* **�N�x���ɁA�l���h���C�u�Ŋۂ��ƕ�������B**
   ��ʂ͐�����E�ƍ�����E���������B�{�̂�URL�͕ς��Ȃ��B */
console.log("\n�� �N�x�̑ޔ��i�@������ �A���� �B�ƍ� �C�����j");
await p.locator(".side .admin").click(); await p.waitForTimeout(250);
ok("�����1�O�̔N�x",
   await p.evaluate(() => +document.getElementById("arYear").value) === 2025,
   await p.evaluate(() => document.getElementById("arYear").value));
ok("�����Ȃ�����Ȃ��i�A�B�C�͏o�Ă��Ȃ��j",
   await p.evaluate(() => document.getElementById("arStep2").hidden
                       && document.getElementById("arStep4").hidden) === true);

await p.locator("#arCount").click(); await p.waitForTimeout(300);
ok("�@ ������ƁA�s���ƃR�}���Ɠ��t�͈̔͂��o��", await (async () => {
     const t = await p.locator("#arOut").innerText();
     return t.indexOf("1200") >= 0 && t.indexOf("1100") >= 0 && t.indexOf("2025-04-07") >= 0;
   })() === true, await p.locator("#arOut").innerText());
ok("�V�[�g���Ƃ̓��킯���o��",
   (await p.locator("#arOut").innerText()).indexOf("�T�� 5-3") >= 0,
   await p.locator("#arOut").innerText());
ok("���������Ƃ� �A �̎菇���o��",
   await p.evaluate(() => !document.getElementById("arStep2").hidden) === true);
ok("�����̖��O��������Ō��߂Č�����",
   (await p.locator("#arName").innerText()).indexOf("�T�� �ۑ� 2025�N�x") >= 0,
   await p.locator("#arName").innerText());
ok("�������̃t�@�C������������",
   (await p.locator("#arFile").innerText()).indexOf("�T�� 2026�N�x") >= 0,
   await p.locator("#arFile").innerText());
ok("�f�v���C���Ȃ����Ƃ��菇�ɏ���",
   (await p.locator("#arStep2").innerText()).indexOf("�f�v���C���Ȃ�") >= 0,
   await p.locator("#arStep2").innerText());
ok("�����������ł́A�܂������Ȃ�",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);

/* �{�̂��̂��̂�URL��\�鎖�� */
await p.locator("#arUrl").fill("https://docs.google.com/spreadsheets/d/HONTAI/edit");
await p.locator("#arVerify").click(); await p.waitForTimeout(300);
ok("�B �{�̂��̂��̂�\������~�߂�",
   (await p.locator("#arWhy").innerText()).indexOf("���̂���") >= 0,
   await p.locator("#arWhy").innerText());
ok("�~�܂����Ƃ��� �C ���o���Ȃ�",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);

await p.locator("#arUrl").fill("https://docs.google.com/spreadsheets/d/COPY/edit");
await p.locator("#arVerify").click(); await p.waitForTimeout(300);
ok("�B �����Ă���� �C ���o��",
   await p.evaluate(() => !document.getElementById("arStep4").hidden) === true);
ok("���s������Ă��邩������",
   (await p.locator("#arWhy").innerText()).indexOf("1200") >= 0,
   await p.locator("#arWhy").innerText());
ok("�N�x��ł����ނ܂ŉ����Ȃ�", await p.locator("#arGo").isDisabled() === true);
await p.locator("#arTyped").fill("2026"); await p.waitForTimeout(150);
ok("�Ⴄ�N�x��ł��Ă������Ȃ�", await p.locator("#arGo").isDisabled() === true);
await p.locator("#arTyped").fill("2025"); await p.waitForTimeout(150);
ok("�N�x�������Ή�����", await p.locator("#arGo").isDisabled() === false);

await p.locator("#arGo").click(); await p.waitForTimeout(400);
ok("�C ��������A������������������", await (async () => {
     const t = await p.locator("#arWhy").innerText();
     return t.indexOf("1200") >= 0 && t.indexOf("�ۊǌ�") >= 0;
   })() === true, await p.locator("#arWhy").innerText());
ok("���������Ƃ� �C ���������߂�",
   await p.evaluate(() => document.getElementById("arStep4").hidden) === true);
ok("�ޔ���URL�����̂܂ܓn��",
   (await lastCall("apiArchivePurge")).args[1].indexOf("COPY") >= 0,
   await lastCall("apiArchivePurge"));
await p.locator("#adminDlg .dlgx").click(); await p.waitForTimeout(200);

/* **�ޔ������N�x���J������A�ق��Ď����o���Ȃ��B**
   �T�Ă̍s�͂��������̂ŁA��{���Ԋ������̎����o��B�����ق��ďo����
   �u�T�Ă��S���������v�ƌ�����B */
console.log("\n�� �ޔ����݂̔N�x���J������A��������");
ok("���܂̔N�x�i�ޔ����Ă��Ȃ��j�ł͏o���Ȃ�",
   await p.locator("#arcBar").evaluate(e => e.hidden) === true);
await p.evaluate(() => { for(let i = 0; i < 52; i++) goWeek(-7); });
await p.waitForTimeout(600);
ok("�T�������̂ڂ��đO�N�x�ɓ���Əo��",
   await p.locator("#arcBar").evaluate(e => e.hidden) === false,
   await p.evaluate(() => fy()));
ok("���N�x���ޔ����݂�������",
   (await p.locator("#arcTitle").innerText()).indexOf("2025�N�x") >= 0,
   await p.locator("#arcTitle").innerText());
ok("���܏o�Ă���̂���{���Ԋ����ƌ���",
   (await p.locator("#arcNote").innerText()).indexOf("��{���Ԋ�") >= 0,
   await p.locator("#arcNote").innerText());
ok("�N�����ޔ�������������",
   (await p.locator("#arcNote").innerText()).indexOf("2027-03-28") >= 0,
   await p.locator("#arcNote").innerText());
ok("�ۊǌɂւ̃����N���o��",
   (await p.locator("#arcLink").getAttribute("href")).indexOf("COPY") >= 0,
   await p.locator("#arcLink").getAttribute("href"));
ok("����Ƃ��͏o���Ȃ��i���̊O�j", await (async () => {
     await p.emulateMedia({media:"print"});
     const v = await p.evaluate(() =>
       getComputedStyle(document.getElementById("arcBar")).display);
     await p.emulateMedia({media:"screen"});
     return v === "none";
   })() === true);
await p.evaluate(() => { for(let i = 0; i < 52; i++) goWeek(7); });
await p.waitForTimeout(600);
ok("���܂̔N�x�֖߂��Ə�����",
   await p.locator("#arcBar").evaluate(e => e.hidden) === true,
   await p.evaluate(() => fy()));

console.log("\n�� �{�Ԃł́A�Â��T�̍T�����Ԉ���");
ok("���܌��Ă���T�́A�Ԉ����Ă��c��", await p.evaluate(() => {
     const y = String(fy()), W = db.years[y].weeks, here = wkKey();
     const blank = () => ({school:{},grade:{},special:{},home:{},acked:[],variant:"A"});
     W[here] = W[here] || blank();
     for(const d of ["2000-01-03","2000-01-10","2000-01-17"]) W[d] = blank();
     const n = pruneWeeks(1);
     return n >= 3 && !!W[here] && !W["2000-01-03"];
   }) === true, await p.evaluate(() => Object.keys(db.years[String(fy())].weeks)));
ok("�܂������Ă��Ȃ��R�}������Ƃ��́A�����̂ĂȂ�", await p.evaluate(() => {
     const y = String(fy()), W = db.years[y].weeks;
     W["2000-01-03"] = {school:{},grade:{},special:{},home:{},acked:[],variant:"A"};
     /* �����M��1�����B**����O�Ɏ̂Ă�ƁA�������{�l�ɂ������Ȃ��܂܏�����** */
     Backend.cellChanged("home", "5-3", 0, "p1");
     const n = pruneWeeks(0);
     const kept = !!W["2000-01-03"];
     delete W["2000-01-03"];
     return n === 0 && kept;
   }) === true);

console.log("\n�� ����ۂۂւ̒�o�́A�T�[�o�Ɏc��");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
  Y().tanpopo = {"1":["5-1"]}; save();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(250);
await p.locator(".tile[data-c='5-1']").click(); await p.waitForTimeout(600);
ok("����ۂۂ̎���������N���X�ɁA��o�{�^�����o��",
   await p.locator("#tpSubBtn").isVisible() === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
const sub = await lastCall("apiTpSubmit");
ok("�����ƁA�N�x�ƏT�̌��j�ƃN���X�𑗂�",
   !!sub && sub.args[2] === "5-1" && sub.args[3] === true
   && /^\d{4}-\d{2}-\d{2}$/.test(String(sub.args[1])), sub && sub.args);
ok("�T�[�o���Ԃ�������A���̂܂܉�ʂɓ����",
   await p.evaluate(() => tpSubmitted("5-1")) === true);
/* **�O����悤�ɂ��Ă����B** �����ԈႢ�𒼂��Ȃ��ƁA�����̂��|���Ȃ� */
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
ok("������x�����ƁA��������",
   await p.evaluate(() => tpSubmitted("5-1")) === false);
await p.locator("#tpSubBtn").click(); await p.waitForTimeout(500);
/* **�T���Ƃɗ��Ē����B** �O�̏T�̈󂪎c���Ă���ƁA����ۂےS����
   �g�񂾂��Ƃŗ\�肪�ς�� */
await p.locator("#nextWk").click(); await p.waitForTimeout(900);
ok("���̏T�́A�܂����ɖ߂�",
   await p.evaluate(() => tpSubmitted("5-1")) === false);
await p.locator("#prevWk").click(); await p.waitForTimeout(900);
ok("���̏T�֖߂�΁A�܂��ςɖ߂�i�V�[�g����ǂݒ����j",
   await p.evaluate(() => tpSubmitted("5-1")) === true);

console.log("\n�� ����ۂۂ̏o����́A��ʂ��瑫���E�����E�ς���");
await p.evaluate(() => {
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
});
await p.locator(".nav[data-act='gate']").click(); await p.waitForTimeout(200);
await p.locator(".master[data-go='tanpopo']").click();
await p.waitForTimeout(600);
await p.waitForTimeout(400);
ok("�o���悪�A����ۂۂ̖ʂɏo��", await p.locator("#tpTgt").isVisible() === true);
ok("�ł��グ�������̊w�Z�́A�ݒ��1�{�����̂܂܏o����ɂȂ�",
   (await p.locator("#tpTgt").innerText()).indexOf("����ۂێ��Ԋ�") >= 0,
   await p.locator("#tpTgt").innerText());

await p.locator("#tpTgtEdit").click(); await p.waitForTimeout(200);
ok("�����Ă��邠�����͏o���Ȃ��i�ǂ��֏o�邩���܂��Ă��Ȃ��j",
   await p.locator("#tpGo").isDisabled() === true);
await p.locator("#tpTgtAdd").click(); await p.waitForTimeout(200);
ok("�����ƍs��������", await p.locator(".tpturl").count() === 2,
   await p.locator(".tpturl").count());
/* URL ����̂܂ܓ��ꂳ���Ȃ��B**�o���Ƃ��ɏ��߂Ď��s�����Ȃ�** */
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(200);
ok("URL����̍s������΁A���ꂳ���Ȃ�",
   (await p.locator("#tpTgtWhy").innerText()).indexOf("URL����") >= 0,
   await p.locator("#tpTgtWhy").innerText());
await p.locator(".tpturl").nth(1).fill("https://docs.google.com/spreadsheets/d/TPOK9999999999999999999/edit");
await p.locator(".tptname").nth(1).fill("�Ђ܂�莞�Ԋ�");
await p.locator(".tpttest").nth(1).click(); await p.waitForTimeout(200);
ok("�\�������_�ŁA�J���邩������",
   (await p.locator("#tpTgtWhy").innerText()).indexOf("�J���܂���") >= 0,
   await p.locator("#tpTgtWhy").innerText());
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(400);
const tw = await lastCall("apiWriteTpTargets");
ok("�����ƁA���т��܂邲�Ƒ���i�����E������ʁX�̌��ɂ��Ȃ��j",
   !!tw && tw.args[0].length === 2, tw && tw.args[0]);
ok("���ꂽ���Ƃ́A�܂��o����", await p.locator("#tpGo").isDisabled() === false);

/* �����ς���ƁA�o���悪�ς�� */
await p.locator("#tpTgtSel").selectOption("1"); await p.waitForTimeout(400);
ok("�I�񂾂��̂��A�o����ɂȂ�",
   (await p.locator("#tpCount").innerText()).indexOf("�Ђ܂��") >= 0,
   await p.locator("#tpCount").innerText());
/* �����B**�������̃t�@�C���ɂ͎���o���Ȃ�** */
await p.locator("#tpTgtEdit").click(); await p.waitForTimeout(200);
await p.locator(".tptdel").nth(1).click(); await p.waitForTimeout(300);
/* **�u���E�U�� confirm ���g��Ȃ��B** confirm �� Enter �Łu�͂��v�ɗ����� */
ok("�O���O�ɁA��p�̑��Ŋm���߂�",
   await p.locator("#tpDelDlg").evaluate(d => d.open) === true);
ok("�����O���̂��𖼎w������",
   (await p.locator("#tpDelTbl").innerText()).indexOf("�Ђ܂��") >= 0,
   await p.locator("#tpDelTbl").innerText());
ok("�������̃t�@�C���͏����Ȃ��Ə����Ă���",
   (await p.locator("#tpDelDlg").innerText()).indexOf("�t�@�C�����̂��̂͏����܂���") >= 0);
/* **����́u�O���Ȃ��v�B** �����΂�߂��ɂ���������A�ア�~�ߕ��ɂ��Ȃ� */
ok("����́u�O���Ȃ��v�ɓ������Ă���",
   await p.evaluate(() => document.activeElement.id) === "tpDelNo",
   await p.evaluate(() => document.activeElement.id));
await p.locator("#tpDelNo").click(); await p.waitForTimeout(300);
ok("�u�O���Ȃ��v�������΁A���̂܂܎c��", await p.locator(".tpturl").count() === 2,
   await p.locator(".tpturl").count());
await p.locator(".tptdel").nth(1).click(); await p.waitForTimeout(300);
await p.locator("#tpDelYes").click(); await p.waitForTimeout(300);
ok("�u�O���v�������ƁA�ꗗ���������", await p.locator(".tpturl").count() === 1,
   await p.locator(".tpturl").count());
await p.locator("#tpTgtSave").click(); await p.waitForTimeout(400);
ok("�o����������Ă��A�������̃t�@�C���͏����Ȃ��i�ꗗ����O�������j",
   (await calls()).indexOf("apiDeleteTpFile") < 0);

console.log("\n�� �V�����N�x�̏����́A����1����");
await p.evaluate(() => {
  window.__nyTicks = {}; window.__nyPlan = false; window.__nyEvents = false;
  for(const d of document.querySelectorAll("dialog")) if(d.open) d.close();
  pollNewYear();
});
await p.waitForTimeout(400);
/* **�g���n�߂�O�̔N�x�ɂ͏o���Ȃ��B** 2026�N�x�͂��������Ă���̂ŁA
   ���܂���u�����v�Əo���Ă��A��邱�Ƃ͖����̂ɞ�F�����������Ȃ� */
await p.evaluate(() => { window.__nySince = 2100; pollNewYear(); });
await p.waitForTimeout(400);
ok("�g���n�߂�O�̔N�x�ɂ́A�����ł��m�点���o���Ȃ�",
   await p.locator("#navNewYear").isHidden() === true);
await p.evaluate(() => { window.__nySince = 0; pollNewYear(); });
await p.waitForTimeout(400);
ok("�����̂������́A�����j���[�ɏo��",
   await p.locator("#navNewYear").isVisible() === true);
ok("�F�����ɗ���Ȃ��i�u�����v�̎���Y����j",
   (await p.locator("#navNewYear").innerText()).indexOf("����") >= 0,
   await p.locator("#navNewYear").innerText());
await p.locator("#navNewYear").click(); await p.waitForTimeout(500);
ok("�����ƁA�����̉�ʂ��J��", await p.locator("#nyDlg").evaluate(e => e.open) === true);
ok("���ɂ�邱�Ƃ�1�����傫���o���i���킹�Ȃ��j",
   await p.locator(".nynext").count() === 1, await p.locator(".nynext").count());
ok("���̂�邱�ƂɁA�Ȃ��v�邩���Y���Ă���",
   (await p.locator(".nynwhy").innerText()).length > 5,
   await p.locator(".nynwhy").innerText());
ok("���ɖ߂��邩���A�K���o��", await p.locator(".nynundo").count() === 1);
ok("�߂��Ȃ��菇�ɂ� ? ��t����i�\�̒��j",
   await p.locator("table.ny .nyno").count() === 1,
   await p.locator("table.ny .nyno").count());
ok("�߂���菇�ɂ� �� ��t����", await p.locator("table.ny .nyyes").count() > 1);
ok("���܂��s�Ɂu���܂����v���o��", await p.locator("table.ny .nynow").count() === 1);
ok("�܂����ԂłȂ��i�́A���ԂłȂ��ƌ���",
   await p.locator("table.ny tr.later").count() > 0,
   await p.locator("table.ny tr.later").count());
ok("�܂����ԂłȂ��i�̃{�^���͉����Ȃ�",
   await p.locator("table.ny tr.later .nygo").first().isDisabled() === true);
ok("�@�B�����肷��菇�́A�`�F�b�N�{�b�N�X���o���Ȃ�",
   await p.locator("table.ny tr").filter({hasText:"��{���Ԋ�"}).locator(".nytick").count() === 0);

/* �l��������ł��Ȃ��菇���A�����ċL�^���� */
await p.locator(".nyntick").click(); await p.waitForTimeout(500);
const tk = await lastCall("apiTickYearSetup");
ok("�����ƁA�N���������������T�[�o�֋L�^����",
   !!tk && tk.args[1] === "arc.copy" && tk.args[2] === true, tk && tk.args);
ok("�����ƁA���ɂ�邱�Ƃ����̎菇�֐i��",
   (await p.locator(".nynttl").innerText()).indexOf("����") < 0,
   await p.locator(".nynttl").innerText());

/* �T�ăV�[�g�����B**����܂ł̓G�f�B�^���炵�����点���Ȃ������B**
   �@�A�B���ςނ܂ŇC�͏��ԂłȂ��̂ŁA�����܂Ői�߂��`�ɂ��Ă��牟�� */
await p.evaluate(() => {
  window.__nyTicks = {"arc.copy":true, "specials":true};
  window.__nyEvents = true;
  loadNewYear();
});
await p.waitForTimeout(400);
ok("�O�̒i���ςނƁA���̒i�̃{�^����������悤�ɂȂ�",
   await p.locator("table.ny .nygo").filter({hasText:"�T�ăV�[�g�����"}).isDisabled() === false);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("table.ny .nygo").filter({hasText:"�T�ăV�[�g�����"}).click();
await p.waitForTimeout(500);
ok("�T�ăV�[�g���A��ʂ������",
   (await calls()).indexOf("apiSetupPlanSheets") >= 0, await calls());

/* ����ԍς߂΁A�����j���[��������� */
await p.evaluate(() => {
  window.__nyTicks = {"arc.copy":true, "specials":true};
  window.__nyPlan = true; window.__nyEvents = true;
  loadNewYear();
});
await p.waitForTimeout(400);
ok("����ԍςނƁA�����j���[�̒m�点��������",
   await p.locator("#navNewYear").isHidden() === true);
ok("�ς񂾂��Ƃ�����",
   (await p.locator("#nyStat").innerText()).indexOf("����Ԃł��Ă��܂�") >= 0,
   await p.locator("#nyStat").innerText());

console.log("\n�� A�T�̋N�_�ƔN�ԍs���́A�V�[�g���J�����ɒ�����");
await p.evaluate(() => { for(const d of document.querySelectorAll("dialog")) if(d.open) d.close(); });
await p.evaluate(() => openAbDlg());
await p.waitForTimeout(200);
/* **���j�����󂯎��Ȃ��B** �Ηj������ƈȌ�̏T�����T����� */
await p.locator("#abDate").fill("2026-09-08");
await p.locator("#abSave").click(); await p.waitForTimeout(200);
ok("���j�łȂ����́A�����Ă�����Ȃ�",
   (await p.locator("#abWhy").innerText()).indexOf("���j") >= 0,
   await p.locator("#abWhy").innerText());
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#abDate").fill("2026-09-07");
await p.locator("#abSave").click(); await p.waitForTimeout(500);
ok("���j�Ȃ�A�ݒ�V�[�g�̂���1�s����������",
   (await calls()).indexOf("apiWriteVariantOrigin") >= 0, await calls());

await p.evaluate(() => { for(const d of document.querySelectorAll("dialog")) if(d.open) d.close(); });
await p.evaluate(() => openEventsDlg());
await p.waitForTimeout(200);
await p.locator("#evPaste").fill("�˂񂰂�\t�Ȃɂ�\nx\ty");
await p.locator("#evRead").click(); await p.waitForTimeout(200);
ok("���t�̗񂪖�����΁A�\��ւ������Ȃ�",
   (await p.locator("#evWarn").innerText()).indexOf("���t") >= 0
   && await p.locator("#evGo").isDisabled() === true,
   await p.locator("#evWarn").innerText());
await p.locator("#evPaste").fill(
  "���t\t�T\t�s���v��i�����j\t�s���v��i�E���j\n2027-04-08\tA\t�n�Ǝ�\t�E����c");
await p.locator("#evRead").click(); await p.waitForTimeout(200);
ok("�ǂނƁA�\��O�ɒ��g��������", await p.locator("#evGrid table tr").count() === 2,
   await p.locator("#evGrid table tr").count());
ok("���Ă��牟����i�ǂ܂��ɂ͉����Ȃ��j", await p.locator("#evGo").isDisabled() === false);
ok("�\��ւ���O�ɁA���֖߂��邱�Ƃ���ʂɏo��",
   (await p.locator("#evDlg").innerText()).indexOf("���ɖ߂��܂�") >= 0);

console.log("\n�� �����Ă��邠�����́A�S�ʂɂ��Ԃ��Ď��̑�����󂯕t���Ȃ�");
/* �c���ЂÂ��A5-1 ���J�����f�̏�Ԃ���n�߂�B
   �O�̌��������ꂽ�R�}���c���Ă���ƁA�ۑ����d�Ȃ�̑����J���Ă��܂� */
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
/* �ۑ��̂��тɁA�d�Ȃ�̑����o�Ă��������i���̐߂Ō������̂͑S�ʕ\���j */
const closeCf = () => p.evaluate(() => { if($("cfDlg").open) $("cfDlg").close(); });

/* �@ �����I���ۑ��ł͏o���Ȃ��i����������Ȃ��j */
await p.evaluate(() => { Backend.cellChanged("home", "5-1", 0, "p1"); });
await p.locator("#saveBtn").click();
await p.waitForTimeout(90);
ok("�����I���ۑ��ł́A�S�ʕ\�����o���Ȃ�",
   await p.evaluate(() => $("wait").open) === false);
await p.waitForTimeout(400); await closeCf();

/* �A ���Ԃ̂�����ۑ��ł͏o�� */
await p.evaluate(() => { window.__slowWrite = 900; Backend.cellChanged("home", "5-1", 1, "p1"); });
await p.locator("#saveBtn").click();
await p.waitForTimeout(400);
ok("���Ԃ̂�����ۑ��ł́A�S�ʕ\�����o��",
   await p.evaluate(() => $("wait").open) === true);
ok("�������Ă��邩���傫���o��",
   (await p.locator("#waitTxt").innerText()).indexOf("�ۑ�") >= 0,
   await p.locator("#waitTxt").innerText());
ok("���͎��̃R�}���傫���i�T���Ȃ��Ă��ڂɓ���j",
   await p.evaluate(() => parseFloat(getComputedStyle($("waitTxt")).fontSize)) >= 20,
   await p.evaluate(() => getComputedStyle($("waitTxt")).fontSize));
ok("���̎��͓����ēǂ߂�i�w��s�����ɂ��Ȃ��j",
   await p.evaluate(() => {
     const bg = getComputedStyle($("wait"), "::backdrop").backgroundColor;
     const m = bg.match(/rgba\(([^)]+)\)/);
     const a = m ? parseFloat(m[1].split(",")[3]) : 1;
     return a > 0 && a < 1;
   }) === true,
   await p.evaluate(() => getComputedStyle($("wait"), "::backdrop").backgroundColor));

/* �B �o�Ă��邠�����A�܂��ɐG��Ȃ��i�J���Ă��鑋�̎d�g�݂Ŏ~�߂�j */
ok("���̃R�}�ɏ������߂Ȃ�", await p.evaluate(() => {
     const c = document.querySelector("#sheet .cell .t");
     if(!c) return "�R�}������";
     c.focus();
     return document.activeElement === c ? "���Ɉڂ���" : true;
   }) === true);
ok("�T�C�h�o�[�̃{�^���������Ȃ�", await p.evaluate(() => {
     const bt = $("lockBtn"); if(!bt) return "�{�^��������";
     bt.focus();
     return document.activeElement === bt ? "�����Ă��܂�" : true;
   }) === true);

/* �C �������u�Ԃ���2��ڂ��󂯂Ȃ��i�o��O�� 200ms ���܂߂āj */
ok("�������́A���̏������󂯕t���Ȃ�",
   await p.evaluate(() => Wait.guard()) === false);

/* �D �I���Ε��A�܂�肪���ǂ���G��� */
await p.waitForTimeout(1200); await closeCf();
ok("�I���Ε���", await p.evaluate(() => $("wait").open) === false);
ok("�������Ƃ͎��ɏ�����", await p.evaluate(() => {
     const c = document.querySelector("#sheet .cell .t");
     if(!c) return "�R�}������";
     c.focus();
     return document.activeElement === c ? true : "�����Ȃ�";
   }) === true);
ok("�������Ƃ́A���̏������󂯕t����",
   await p.evaluate(() => Wait.guard()) === true);

/* �E �Ԍ��B**�Ԃ�Ȃ��������A���܂ł��͂܂��Ȃ��B**
   20�b�͑҂ĂȂ��̂ŁA�ԍ������k�߂Ė{���ɉ����邩������ */
await p.evaluate(() => {
  Wait.tune(20, 300); window.__hang = true;
  Backend.cellChanged("home", "5-1", 2, "p1"); doSave(true);
});
await p.waitForTimeout(120);
ok("�Ԏ������Ȃ��������́A�o���܂�",
   await p.evaluate(() => $("wait").open) === true);
await p.waitForTimeout(500);
ok("�Ԏ������Ȃ���΁A�����ŉ����ĉ�ʂ�Ԃ�",
   await p.evaluate(() => $("wait").open) === false);
ok("���������Ƃ�m�点��",
   (await p.locator("#toast").innerText()).indexOf("�Ԏ�������܂���") >= 0,
   await p.locator("#toast").innerText());
ok("���������Ƃ́A���̏������󂯕t����",
   await p.evaluate(() => Wait.guard()) === true);
await p.evaluate(() => {
  Wait.tune(200, 20000); window.__hang = false; window.__slowWrite = 0;
});
await p.waitForTimeout(200); await closeCf();

/* ���� ��Ȃ̊�{���Ԋ��E�����̂������E�󂫘g������ ��������������������������
   **��{���Ԋ��͋��t�������Ă��Ȃ��B** ��Ȃ������̖ʂ��J�����Ƃ��A
   ��{�̎����R�}���o�邩�ǂ����������Ō���B */
console.log("\n�� ��Ȃ̊�{���Ԋ��i������́u��ȁv�V�[�g�̒S���w�N��������j");
await p.evaluate(() => {
  const Yr = Y();
  Yr.specials = [{code:"ongaku", label:"���y", grades:["5"]},
                 {code:"zuko",   label:"�}�H", grades:[]}];
  /* 5-1 �̌��j1�������y�A5-2 �̌��j2�������y�A1-1 �̌��j1�������y�i�S���O�̊w�N�j */
  Yr.base["5-1"] = {A:{"0|p1":{title:"���y", subject:"ongaku"}}};
  Yr.base["5-2"] = {A:{"0|p2":{title:"���y", subject:"ongaku"}}};
  Yr.base["1-1"] = {A:{"0|p1":{title:"���y", subject:"ongaku"}}};
  save();
});
await p.evaluate(() => openView({kind:"special", sp:"ongaku"}));
await p.waitForTimeout(300);
const spCell = (d, s) => p.evaluate(([d, s]) =>
  (document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s}"] .t`) || {}).textContent,
  [d, s]);
ok("��{���Ԋ��̎����R�}���A��Ȃ̏T�ɏo��", await spCell(0, "p1") === "5-1", await spCell(0, "p1"));
ok("�ʂ̍Z���̎����R�}���o��",             await spCell(0, "p2") === "5-2", await spCell(0, "p2"));
ok("�S���w�N�̊O�͏o���Ȃ��i1-1 �͍�����Ȃ��j",
   await p.evaluate(() => {
     const t = [...document.querySelectorAll('#sheet .cell .t')].map(e => e.textContent);
     return t.indexOf("1-1") < 0;
   }) === true);
ok("��{���痈���R�}�͒W���o��i�w�� base�j",
   await p.evaluate(() =>
     document.querySelector('#sheet .cell[data-d="0"][data-s="p1"]').dataset.layer) === "base");
/* **�S�C���ʂ̗\�����ꂽ��A���̎��Ԃɐ�Ȃ͍s���Ȃ��B** */
await p.evaluate(() => {
  const w = week();
  w.home["5-1"] = w.home["5-1"] || {};
  w.home["5-1"]["0|p1"] = {title:"����", note:"", subject:"kokugo",
                           at:Date.now(), by:"x@edu.nishi.or.jp"};
  save(); buildSheet();
});
ok("�S�C���㏑�������R�}�́A��Ȃ̏T���������",
   await spCell(0, "p1") === "", await spCell(0, "p1"));
ok("�S���w�N�������Ă��Ȃ���ΑS�w�N�i�}�H�j",
   await p.evaluate(() => {
     view = {kind:"special", sp:"zuko"};
     const me = specials().find(x => x.code === "zuko");
     return (me.grades || []).length === 0;
   }) === true);

console.log("\n�� �����̂������i�T�āE4�T�E�w�N�j");
/* ��ŒS�C�̏㏑����������̂ŁA�J���Ɓu�㏑�����ꂽ�v�̑����o��B**��ɕ���** */
const closeDlgs = async () => {
  await p.evaluate(() => {
    for(const d of document.querySelectorAll("dialog[open]")) d.close();
  });
  await p.waitForTimeout(150);
};
await p.evaluate(() => openView({kind:"grade", grade:"5"}));
await p.waitForTimeout(300); await closeDlgs();
ok("�т��o��", await p.evaluate(() => $("centerBar").hidden) === false);
await p.locator('#centerTabs [data-center="grade"]').click();
await p.waitForTimeout(400);
ok("�w�N�̖ʂɓ���ւ��", await p.evaluate(() =>
   $("gradeView").hidden === false && $("stage").hidden === true) === true);
ok("����1���B**�j�����N���X���Ŋ���**",
   await p.evaluate(() => document.querySelectorAll("#gvPaper .gsheet").length) === 1);
ok("1����4�N���X�Ԃ�Ɋ���Ă���",
   await p.evaluate(() =>
     document.querySelectorAll('#gvPaper .gcell[data-d="0"][data-s="p1"]').length) === 4);
ok("�ǂ̗񂪂ǂ̃N���X�����o��",
   await p.evaluate(() => [...document.querySelectorAll('#gvPaper .gcell[data-d="0"][data-s="p1"]')]
     .map(e => e.dataset.cls).join(",")) === "5-1,5-2,5-3,5-4");
ok("�g�̌��o���͐��������i1/4 �̕��Ɂu5-1�v�͓���Ȃ��j",
   await p.evaluate(() => {
     const g = document.querySelector("#gvPaper .gcls");
     return g.textContent === "1" && g.title === "5-1";
   }) === true);
ok("���l�̗���u���Ȃ�", await p.evaluate(() =>
   document.querySelectorAll("#gvPaper .gcell .n").length) === 0);
ok("���ی�ƏT�������u���Ȃ�", await p.evaluate(() =>
   document.querySelectorAll('#gvPaper [data-s="after"], #gvPaper .foot').length) === 0);
ok("���邾���i�����闓�����Ȃ��j",
   await p.evaluate(() =>
     document.querySelectorAll("#gvPaper [contenteditable]").length) === 0);
ok("���̓p�l���͈�������",
   await p.evaluate(() => document.querySelector(".panel").hidden) === true);
/* **�T���J������A���Ă���ʂ����Ă���B** */
const gvTitle0 = await p.locator("#gvTitle").innerText();
await p.locator("#nextWk").click(); await p.waitForTimeout(500); await closeDlgs();
ok("�T���J��ƁA�w�N�̖ʂ�����",
   (await p.locator("#gvTitle").innerText()) !== gvTitle0,
   [gvTitle0, await p.locator("#gvTitle").innerText()]);
ok("�w�N�̖ʂ̂܂܁A�T�̎��֖߂��Ă��Ȃ�",
   await p.evaluate(() => $("gradeView").hidden) === false);
await closeDlgs();
await p.locator('#centerTabs [data-center="month"]').click();
await p.waitForTimeout(600);
ok("4�T�̖ʂւ�����ւ��", await p.evaluate(() =>
   $("monthView").hidden === false && $("gradeView").hidden === true) === true);
ok("4�T�̎������邾��",
   await p.evaluate(() =>
     document.querySelectorAll("#mPaper [contenteditable]").length) === 0);
await closeDlgs();
await p.locator('#centerTabs [data-center="week"]').click();
await p.waitForTimeout(400);
ok("�T�̎��֖߂�", await p.evaluate(() =>
   $("stage").hidden === false && $("monthView").hidden === true) === true);
ok("�T�̎��͏�����",
   await p.evaluate(() =>
     document.querySelectorAll("#sheet .cell .t[contenteditable]").length > 0) === true);

console.log("\n�� �󂫘g�������i3�i�B2�l�ɂ��Ȃ��j");
ok("�w���̖ʂɂ͏o���Ȃ�", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     return freeScope();
   }) === null);
await p.evaluate(() => openView({kind:"grade", grade:"5"}));
await p.waitForTimeout(300); await closeDlgs();
ok("�w�N�̖ʂł͏o��", await p.evaluate(() => $("freeBox").hidden) === false);
ok("�͂��߂͏o���Ȃ��i�i��0�j", await p.evaluate(() => freeOpt().level) === 0);
ok("�i��0�̂������́A���t���Ȃ�", await p.evaluate(() =>
   document.querySelectorAll("#sheet .cell[data-free]").length) === 0);
/* 5�N�̑S�N���X�ɁA�S�Z�̗\��Ɗw�N�̗\��Əꏊ����鋳�Ȃ�u�� */
await p.evaluate(() => {
  const w = week(), now = Date.now();
  w.school["1|p1"] = {title:"�S�Z����", note:"", subject:null, at:now, by:"a@edu.nishi.or.jp"};
  w.grade["5"] = w.grade["5"] || {};
  w.grade["5"]["1|p2"] = {title:"�w�N�W��", note:"", subject:"gakunen_shukai",
                          at:now, by:"a@edu.nishi.or.jp"};
  for(const c of classesOfGrade("5")){
    Y().base[c] = Y().base[c] || {};
    /* **A�T�EB�T�̗����ɒu���B** �T���J�������ƂȂ̂ŁA���܂��ǂ��炩�͌��܂��Ă��� */
    for(const v of ["A", "B"])
      Y().base[c][v] = Object.assign({}, Y().base[c][v],
        {"1|p3":{title:"�̈�", subject:"taiiku"}});
  }
  save();
});
await closeDlgs();
await p.locator('#freeSeg [data-free="1"]').click();
await p.waitForTimeout(400);
const fst = (d, s) => p.evaluate(([d, s]) =>
  (document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s}"]`) || {dataset:{}})
    .dataset.free, [d, s]);
ok("���x��1�F�S�Z�̗\��͎g���Ȃ�",  await fst(1, "p1") === "busy",  await fst(1, "p1"));
ok("���x��1�F�w�N�̗\����g���Ȃ�",  await fst(1, "p2") === "busy",  await fst(1, "p2"));
ok("���x��1�F�ꏊ����鋳�Ȃ́A�܂����R", await fst(1, "p3") === "free", await fst(1, "p3"));
await closeDlgs();
await p.locator('#freeSeg [data-free="2"]').click();
await p.waitForTimeout(400);
ok("���x��2�F�ꏊ����鋳�Ȃ͔�������", await fst(1, "p3") === "avoid", await fst(1, "p3"));
ok("�g���Ȃ��R�}�ɂ� �~ ���t��", await p.evaluate(() =>
   getComputedStyle(document.querySelector('#sheet .cell[data-d="1"][data-s="p1"]'),
                    "::after").content.indexOf("�~") >= 0) === true);
ok("���������R�}�ɂ� �� ���t��", await p.evaluate(() =>
   getComputedStyle(document.querySelector('#sheet .cell[data-d="1"][data-s="p3"]'),
                    "::after").content.indexOf("��") >= 0) === true);
/* **���R�ȃR�}�ɂ͉��������Ȃ��B** ���R�������΂񑽂����Ƃ�����̂ŁA
   ������Ɉ��t����Ǝ�����̊C�ɂȂ�i�ǂ����Ă���ق����Â�����j */
const bg = sel => p.evaluate(s2 => {
  const e = document.querySelector(s2);
  return e ? getComputedStyle(e).backgroundImage : "�i���̃R�}�������j";
}, sel);
ok("���R�ȃR�}�́A���̂܂܁i�ΐ���~���Ȃ��j",
   await bg('#sheet .cell[data-free=free]') === "none",
   await bg('#sheet .cell[data-free=free]'));
ok("�g���Ȃ��R�}�Ɏΐ���~��",
   (await bg('#sheet .cell[data-d="1"][data-s="p1"]')).indexOf("gradient") >= 0,
   await bg('#sheet .cell[data-d="1"][data-s="p1"]'));
ok("���������R�}�ɂ��ΐ��i�Z�����Ⴄ�j", await p.evaluate(() => {
     const g = s2 => getComputedStyle(document.querySelector(s2)).backgroundImage;
     const a = g('#sheet .cell[data-d="1"][data-s="p3"]');
     const b = g('#sheet .cell[data-d="1"][data-s="p1"]');
     return a.indexOf("gradient") >= 0 && a !== b;
   }) === true);
ok("�ΐ��͋x�݂̎΂ߐ��Ɣ��Ό����i�x�݂͐}�`�� `\\`�E������� 135deg �� `/`�j",
   (await bg('#sheet .cell[data-d="1"][data-s="p1"]')).indexOf("135deg") >= 0,
   await bg('#sheet .cell[data-d="1"][data-s="p1"]'));
const busyWhy = await p.evaluate(() =>
  document.querySelector('#sheet .cell[data-d="1"][data-s="p1"]').title);
ok("�g���Ȃ����R�����Ō���", busyWhy.indexOf("�S�Z�̗\��") >= 0, busyWhy);
ok("���������̂��o���i�ڂŐ����������Ȃ��j",
   (await p.locator("#freeTally").innerText()).indexOf("��") >= 0,
   await p.locator("#freeTally").innerText());
/* �w�肵�����Ȃ́A**�ǂ̒i�ł�**������ */
await p.evaluate(() => { freeOpt().avoid = ["kokugo"]; freeOpt().level = 1;
                         save(); paintFree(); redrawCenter(); });
await p.waitForTimeout(300);
await p.evaluate(() => {
  const w = week();
  w.grade["5"]["2|p1"] = {title:"����", note:"", subject:"kokugo",
                          at:Date.now(), by:"a@edu.nishi.or.jp"};
  save(); buildSheet();
});
ok("�w�肵�����Ȃ́A���x��1�ł�������i�w�N�̗\����O�Ɍ��Ȃ��j",
   await fst(2, "p1") === "busy", await fst(2, "p1"));
await p.evaluate(() => {
  const w = week();
  delete w.grade["5"]["2|p1"];
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    Y().base[c][v] = Object.assign({}, Y().base[c][v], {"2|p1":{title:"����", subject:"kokugo"}});
  save(); buildSheet();
});
ok("��{���Ԋ��̍�����A�w�肷��Δ��������ɗ�����",
   await fst(2, "p1") === "avoid", await fst(2, "p1"));
/* **�ꏊ�͊w�Z���񂽂���1�B** �ʂ͈̔͂���������ƁA��p�̊�ڂ������Ȃ� */
await p.evaluate(() => {
  /* 5�N�͑S��������B1�N�i�ʂ̊O�j�ɂ����̈��u�� */
  const bank = c => (Y().base[c] || (Y().base[c] = {}));
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    delete (bank(c)[v] || {})["3|p1"];
  for(const c of classesOfGrade("1")) for(const v of ["A", "B"])
    bank(c)[v] = Object.assign({}, bank(c)[v], {"3|p1":{title:"�̈�", subject:"taiiku"}});
  freeOpt().avoid = []; freeOpt().level = 2; save(); redrawCenter();
});
await p.waitForTimeout(300);
ok("�ق��̊w�N���ꏊ������Ă�����A�ʂ̊O�ł����������ɗ�����",
   await fst(3, "p1") === "avoid", await fst(3, "p1"));
ok("�ǂ̃N���X������Ă��邩������",
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
ok("�ꏊ���󂯂Ύ��R�ɖ߂�", await fst(3, "p1") === "free", await fst(3, "p1"));

/* **�R�}�̓ǂݕ��͏T�̎��Ɗw�N�̖ʂ�1�B** �����ď����Ă�������A
   �w�N�̖ʂɂ́u���ƂȂ��v�̎ΐ����o�Ă��Ȃ����� */
console.log("\n�� �R�}�̈Ӗ��Â��́A�Ŗʂ�2�ł�1��");
await p.evaluate(() => {
  const w = week();
  w.home["5-2"] = Object.assign(w.home["5-2"] || {},
    {"0|p2":{title:"���ƂȂ�", note:"", subject:null, at:Date.now(), by:"a@edu.nishi.or.jp"}});
  save(); setCenter("grade");
});
await p.waitForTimeout(500); await closeDlgs();
ok("�w�N�̖ʂł��u���ƂȂ��v�͎ΐ��ŏo��i���̂܂܂ɂ��Ȃ��j",
   await p.evaluate(() =>
     document.querySelectorAll("#gvPaper .gcell.nolesson .noneslash, #gvPaper .gcell.nolesson + .noneslash").length
     + document.querySelectorAll("#gvPaper .gcell.nolesson").length >= 2) === true,
   await p.evaluate(() => document.querySelectorAll("#gvPaper .gcell.nolesson").length));
ok("�T�̎��Ɠ��������o���i�w���ʂ��j",
   await p.evaluate(() => {
     const e = document.querySelector('#gvPaper .gcell[data-cls="5-2"][data-d="0"][data-s="p2"]');
     return !!e && e.dataset.layer === "home" && e.classList.contains("nolesson");
   }) === true);
await p.evaluate(() => { const w = week(); delete w.home["5-2"]["0|p2"]; save(); setCenter("week"); });
await p.waitForTimeout(400); await closeDlgs();

/* �󂫘g�̈�́A���ɂ͏o���Ȃ� */
ok("�󂫘g�̈�͉�ʂ����i����ʂɂ͏o���Ȃ��j", await p.evaluate(() => {
     const css = [...document.styleSheets].flatMap(s => {
       try{ return [...s.cssRules]; }catch(_){ return []; }
     });
     return css.some(r => r.media && String(r.media).indexOf("print") >= 0
       && String(r.cssText).indexOf("data-free") >= 0);
   }) === true);
await p.evaluate(() => { freeOpt().level = 0; freeOpt().avoid = []; save(); });

/* ���� ���Ȃ̐F�E1�����E�Ή��\�E�J�����_�[ ���������������������������������� */
console.log("\n�� ���Ȃ̐F�́A�薼�̗��̒n�����i�`�b�v����߂��j");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(400); await closeDlgs();
ok("�E���j���[�Ɍ�������i�����J�����Ȃ��j",
   await p.evaluate(() => $("chipWrap").hidden) === false);
ok("�͂��߂́u�Ȃ��v", await p.evaluate(() =>
   $("chipSeg").querySelector('[data-chip=off]').getAttribute("aria-pressed")) === "true");
await p.locator('#chipSeg [data-chip="screen"]').click();
await p.waitForTimeout(400);
ok("���ɒn���t��", await p.evaluate(() =>
   $("sheet").classList.contains("chips-screen")) === true);
ok("�u��ʂ����v�͎��̈�𗧂ĂȂ�", await p.evaluate(() =>
   $("sheet").classList.contains("chips-output")) === false);
ok("�ۂ��`�b�v�̌`�͍��Ȃ��i�n�����j", await p.evaluate(() => {
     const css = [...document.styleSheets].flatMap(s2 => {
       try{ return [...s2.cssRules]; }catch(_){ return []; }
     }).map(r => r.cssText).join("");
     return css.indexOf("chips-screen .cell.has-sub .t") < 0;
   }) === true);
await p.locator('#chipSeg [data-chip="output"]').click();
await p.waitForTimeout(300);
ok("�u���ɂ��v��I�ԂƎ��̈󂪗���", await p.evaluate(() =>
   $("sheet").classList.contains("chips-output")) === true);
ok("�N���X���ƂɎ���", await p.evaluate(() =>
   (Y().chipModes || {})["5-1"]) === "output");

console.log("\n�� ���̎��̑傫���i�E���j���[�� �{?�j");
/* �ݒ�i����ƕ����j�̃X���C�_�[��**�����I**��G��B�����J���Ȃ��Ɠ͂��Ȃ�
   �Ƃ���ɂ��������ƁA�������Ă��Ď�������Ȃ��ƋC�Â����Ƃ��ɉ��� */
ok("�E���j���[�� �{? ���o��", await p.evaluate(() =>
   $("fontWrap") && !$("fontWrap").hidden) === true);
const fsNow = () => p.evaluate(() => ({
  shown:$("fsTitleV").textContent,
  css:getComputedStyle($("sheet")).getPropertyValue("--fs-t").trim(),
  stored:db.settings.titlePt}));
await p.evaluate(() => { db.settings.titlePt = 16; save(); applyPaper(); buildSheet(); });
await p.waitForTimeout(200);
await p.locator('#fontWrap .fsb[data-fs="titlePt"][data-step="0.5"]').click();
await p.waitForTimeout(250);
ok("�{�� 0.5pt �傫���Ȃ�A���ɂ�����",
   JSON.stringify(await fsNow()) === JSON.stringify({shown:"16.5", css:"16.5pt", stored:16.5}),
   await fsNow());
await p.locator('#fontWrap .fsb[data-fs="titlePt"][data-step="-0.5"]').click();
await p.waitForTimeout(250);
ok("?�Ŗ߂�", JSON.stringify(await fsNow())
   === JSON.stringify({shown:"16", css:"16pt", stored:16}), await fsNow());
/* **�[�ł͉����Ȃ�����B** �����Ă������N���Ȃ���Ԃɂ���ƁA
   ���Ă���̂��[�Ȃ̂���������Ȃ� */
ok("����i�薼 20pt�j�� �{ �������Ȃ��Ȃ�", await p.evaluate(async () => {
     db.settings.titlePt = 20; save(); applyPaper(); paintFontBtns();
     return document.querySelector('#fontWrap .fsb[data-fs="titlePt"][data-step="0.5"]').disabled;
   }) === true);
ok("�����i���l 8pt�j�� ? �������Ȃ��Ȃ�", await p.evaluate(() => {
     db.settings.notePt = 8; save(); applyPaper(); paintFontBtns();
     return document.querySelector('#fontWrap .fsb[data-fs="notePt"][data-step="-0.5"]').disabled;
   }) === true);
/* �ݒ�̑��� �{? �͓����I������B�Е��Œ�������A�����Е��̐������낤 */
ok("�ݒ�̑��Œ����� �{? �̐������낤", await p.evaluate(() => {
     db.settings.titlePt = 14; db.settings.notePt = 12; save(); applyPaper();
     return $("fsTitleV").textContent + "/" + $("fsNoteV").textContent;
   }) === "14/12");
await p.evaluate(() => { db.settings.titlePt = 16; db.settings.notePt = 12;
                         save(); applyPaper(); buildSheet(); });
await p.waitForTimeout(250);

console.log("\n�� �w�N�̖ʂ�1�����i�����\�Ɠ������j");
await p.evaluate(() => {
  const Yr = Y();
  for(const c of classesOfGrade("5")) for(const v of ["A", "B"])
    (Yr.base[c] || (Yr.base[c] = {}))[v] =
      Object.assign({}, (Yr.base[c] || {})[v], {"0|p1":{title:"����", subject:"kokugo"}});
  save(); openView({kind:"grade", grade:"5"});
});
await p.waitForTimeout(400); await closeDlgs();
await p.evaluate(() => setCenter("grade"));
await p.waitForTimeout(600); await closeDlgs();
ok("�薼��1�����ŏo��", await p.evaluate(() =>
   (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {})
     .textContent) === "��",
   await p.evaluate(() =>
     (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {}).textContent));
ok("1�����̖������Ȃ́A���̎���1�����ڂɗ�����",
   await p.evaluate(() => shortOf("tosho", "�}��")) === "�}",
   await p.evaluate(() => shortOf("tosho", "�}��")));
ok("�����̂��̂��ׂ��i��ʂ����ς��ɐL�΂��Ȃ��j", await p.evaluate(() => {
     const sh = document.querySelector("#gvPaper .gsheet");
     return sh.getBoundingClientRect().width < $("gvPaper").clientWidth;
   }) === true);

console.log("\n�� ���Ȃ̕\�����i�ݒ�̑Ή��\�j");
await p.evaluate(() => openSubDlg());
await p.waitForTimeout(300);
ok("3�̎�����ׂďo��", await p.evaluate(() =>
   $("subRows").querySelectorAll(".subrow").length > 0
   && !!$("subRows").querySelector("[data-f=name]")
   && !!$("subRows").querySelector("[data-f=short]")
   && !!$("subRows").querySelector("[data-f=tp]")) === true);
ok("�R�[�h�͏o���Ȃ��i�s�̐g���Ȃ̂ŐG�点�Ȃ��j", await p.evaluate(() =>
   !$("subRows").querySelector("[data-f=code]")) === true);
await p.evaluate(() => {
  const r = $("subRows").querySelector('.subrow[data-code=kokugo]');
  r.querySelector("[data-f=short]").value = "��";
  saveSubTable();
});
await p.waitForTimeout(400);
ok("�����ƃV�[�g�֑���",
   (await calls()).indexOf("apiWriteSubjects") >= 0, await calls());
ok("���钆�g�́A������3�̎�",
   await p.evaluate(() => {
     const a = (window.__calls.filter(c => c.name === "apiWriteSubjects").pop() || {}).args;
     const r = a && a[0].find(x => x.code === "kokugo");
     return !!r && r.short === "��" && r.name === "����";
   }) === true);
ok("�����������A���̂܂܊w�N�̖ʂɏo��", await p.evaluate(() => {
     $("subDlg").close();
     setCenter("grade");
     return (document.querySelector('#gvPaper .gcell[data-cls="5-1"][data-d="0"][data-s="p1"] .t') || {})
       .textContent;
   }) === "��");
await p.evaluate(() => {
  const r = $("subRows").querySelector('.subrow[data-code=kokugo]');
  if(r) r.querySelector("[data-f=short]").value = "��";
  const S = SUBJECTS.map(x => x.code === "kokugo" ? Object.assign({}, x, {short:"��"}) : x);
  setSubjects(S); save();
});

console.log("\n�� �J�����_�[�̖ʁi2�����EA4�悱1���j");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(400); await closeDlgs();
await p.locator('#centerTabs [data-center="cal"]').click();
await p.waitForTimeout(900); await closeDlgs();
ok("�J�����_�[�̖ʂɓ���ւ��", await p.evaluate(() =>
   $("calView").hidden === false && $("stage").hidden === true) === true);
/* **2�����B** 1���̎��Ԋ����c�ɐςނƁA4�����ł�1�Z�� 1.63mm �ɂ����Ȃ炸
   ��������Ȃ��i�Ŗʂ̌v�Z�j�B����2�������ɂ��āA1����{�̍����ɂ��� */
ok("2�����Ԃ�o��", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth").length) === 2);
ok("����2���i�c�͊���Ȃ��j", await p.evaluate(() =>
   getComputedStyle($("cvPaper")).gridTemplateRows.split(" ").length) === 1);
ok("��?�y��6��i���j�͒u���Ȃ��j", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth:first-child .cdow").length) === 6);
ok("1���́u���t�v�̉��ɁA�Z�����c�ɕ���", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return !!d.querySelector(".cnum") && !!d.querySelector(".cper");
   }) === true);
/* **�c�ɐςށB** �����т���1�Z���� 2.6mm ���̏��ɂȂ�A���Z���̂��Ƃ�
   �ʒu�ł���������Ȃ��B�c�Ȃ�ォ��1�E2�E3�c�Ɠǂ߂� */
ok("�Z���͏c�ɐςށi���ɕ��ׂȂ��j", await p.evaluate(() => {
     const r = [...document.querySelectorAll("#cvPaper .cday:not(.none) .cper > i")]
       .slice(0, 2).map(e => e.getBoundingClientRect());
     return r.length === 2 && r[1].top > r[0].top + 1
         && Math.abs(r[1].left - r[0].left) < 1;
   }) === true);
ok("���Ȃ�1����������", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper")].some(e => e.textContent.trim().length > 1)) === true);
ok("���邾���i�����闓�����Ȃ��j", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper [contenteditable]").length) === 0);
/* �Z���̍s�̐��͎����́u���Ɓv�̐��B6�ƌ��ߑł��ɂ���ƁA5�Z���܂ł̊w�Z��1�]�� */
ok("�Z���̍s�́A���Ƃ̐������u��", await p.evaluate(() => {
     const n = SLOTS.filter(s => s.kind === "lesson").length;
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return d.querySelectorAll(".cper > i").length === n && n > 1;
   }) === true, await p.evaluate(() =>
     document.querySelector("#cvPaper .cday:not(.none)").querySelectorAll(".cper > i").length));
ok("1�s�ɏ������ޗ���1�i���Ȃ̉E�j", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return d.querySelectorAll(".cper > i > u").length
         === d.querySelectorAll(".cper > i").length;
   }) === true);
ok("�������ޗ��͋�̂܂܍���", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper u")].every(e => e.textContent === "")) === true);
ok("�o�Ȃ��Z���̂Ԃ���s�͒u���i�l�߂�ƍZ���������j", await p.evaluate(() => {
     const n = SLOTS.filter(s => s.kind === "lesson").length;
     return [...document.querySelectorAll("#cvPaper .cper")]
       .every(e => e.querySelectorAll(":scope > i").length === n);
   }) === true);
ok("1�s�̋��Ȃ�1�����܂�", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .cper > i > b")]
     .every(e => e.textContent.length <= 1)) === true);
/* **���t�������΂�傫�����B** �J�����_�[�́u�������v���ɒT���ʂȂ̂ŁA
   ���Ȃ�1���������t���ڂɓ���Ȃ��ƁA���𐔂��������ƂɂȂ� */
ok("���t�͋��Ȃ̎����傫���A�Z��", await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     const n = d.querySelector(".cnum"), b = d.querySelector(".cper > i > b");
     const fs = e => parseFloat(getComputedStyle(e).fontSize);
     return fs(n) > fs(b) && +getComputedStyle(n).fontWeight >= 700;
   }) === true, await p.evaluate(() => {
     const d = document.querySelector("#cvPaper .cday:not(.none)");
     return {num:getComputedStyle(d.querySelector(".cnum")).fontSize,
             sub:getComputedStyle(d.querySelector(".cper > i > b")).fontSize};
   }));
/* **�~��Ă����R�}�ɂ́A�T�Ă̎��Ɠ������[�̐��B** ���o�I�Ɍ����邽�߂̈� */
ok("�w�N�E�S�Z����~�肽�R�}�ɍ��[�̐����t��", await p.evaluate(() => {
     const w = week(), now = Date.now();
     w.school["0|p1"] = {title:"�S�Z����", note:"", subject:"gyoji", at:now, by:"a@edu.nishi.or.jp"};
     save(); redrawCenter();
     return true;
   }) === true);
await p.waitForTimeout(900); await closeDlgs();
ok("���͏o�ǂ���̐F�i�S�Z���j", await p.evaluate(() => {
     const e = document.querySelector("#cvPaper .cper > i[data-from=school]");
     return !!e && getComputedStyle(e).boxShadow.indexOf("inset") >= 0;
   }) === true);

/* ���̉��̎����W�v�B**���̌��̃R�}���i�N�x�͂��߂���̗݌v�j** */
ok("���̉��Ɏ����W�v���o��", await p.evaluate(() =>
   document.querySelectorAll("#cvPaper .cmonth .ctally").length) === 2);
/* **���Ȃ��ƁB** ���v�ЂƂȂ�A�����~�R�}���łقڌ��܂鐔�ɂ����Ȃ�Ȃ��B
   �����Ƃɉ����ȏo�邩�́A���̊w�Z�̋��ȃV�[�g����Ȃ̂Ő��ł͔���Ȃ� ����
   **�o�Ă���D�����Ȃ�1�������ǂ���**�Ō��� */
ok("���Ȃ��Ƃɏo���i���v�ЂƂł͂Ȃ��j", await p.evaluate(() => {
     const shorts = SUBJECTS.filter(s => s.count && s.short).map(s => s.short);
     const bs = [...document.querySelectorAll("#cvPaper .ct > b")];
     return bs.length > 0 && bs.every(e => shorts.indexOf(e.textContent) >= 0);
   }) === true, await p.evaluate(() =>
     [...document.querySelectorAll("#cvPaper .ct > b")].map(e => e.textContent)));
ok("�u1���� ���̌�(�݌v)�v�̌`", await p.evaluate(() => {
     const e = document.querySelector("#cvPaper .cmonth:first-child .ct");
     return /^.\d+\(\d+\)$/.test(e.textContent.replace(/\s/g, ""));
   }) === true, await p.evaluate(() =>
     document.querySelector("#cvPaper .cmonth:first-child .ct").textContent));
ok("�݌v�́A���̌��̂Ԃ�������Ȃ�", await p.evaluate(() =>
   [...document.querySelectorAll("#cvPaper .ct")].every(e => {
     const m = e.textContent.replace(/\s/g, "").match(/^.(\d+)\((\d+)\)$/);
     return m && +m[2] >= +m[1];
   })) === true);
/* �������͎����W�v�\�ւ̃R�s�[��1�icompose.js countSub�j�B
   **�����ɐ����Ȃ����Ȃ͐��ɓ���Ȃ�** */
/* ���Ȃ̓V�[�g�����{�Ȃ̂ŁA���O�����ߑł��ɂ���**���܂̋��ȃV�[�g������** */
ok("�������͎����W�v�\�Ɠ����icountSub 1�j", await p.evaluate(() => {
     const yes = SUBJECTS.filter(s => s.count && s.short)[0];
     const no  = SUBJECTS.filter(s => !s.count || !s.short)[0];
     return typeof countSub === "function"
       && countSub({title:yes.name, subject:yes.code}).short === yes.short
       /* ���ȃR�[�h�������Ă��A�薼�̎��ň����i��ŏ������Ԃ��������j */
       && countSub({title:yes.name, subject:null}).short === yes.short
       && (!no || countSub({title:no.name, subject:no.code}) === null)
       && countSub({title:"���ƂȂ�", subject:null}) === null
       && countSub({title:"", subject:null}) === null
       && countSub(null) === null;
   }) === true, await p.evaluate(() =>
     SUBJECTS.map(s => [s.code, s.short, !!s.count])));
ok("�݌v�͔N�x�Ő؂�i4���͂��̌����݌v�j", await p.evaluate(() => {
     const apr = calCount(new Date(2026, 3, 1)), sum = calSum(new Date(2026, 3, 1));
     return JSON.stringify(apr) === JSON.stringify(sum);
   }) === true);
ok("�x�݂̓��͐����Ȃ�", await p.evaluate(() => {
     /* 4���́A���Ƃ���������ŏ��̓����x�݂ɂ��Đ��������B
        �V�[�g�ւ͑��炸�A���̒[���̍T�������𒼂��i����ƌ�̌����ɍ�����j */
     let dt = null;
     for(const d of calDates(new Date(2026, 3, 1))){
       const c = calDayC(d);
       if(c && Object.keys(c.count).length){ dt = d; break; }
     }
     if(!dt) return "4���ɐ��������������";
     const before = calDayC(dt);
     const n = Object.keys(before.count).reduce((a, k) => a + before.count[k], 0);
     const keep = monday;
     monday = mondayOf(dt);
     const d0 = Math.round((dt - monday) / 86400000);
     const w = week(), key = d0 + "|" + DAY_SLOT, was = w.school[key];
     w.school[key] = {title:"�x��", note:"", subject:null, at:Date.now(), by:"a@edu.nishi.or.jp"};
     calCache = {};
     const m = Object.keys(calDayC(dt).count).reduce((a, k) => a + calDayC(dt).count[k], 0);
     if(was) w.school[key] = was; else delete w.school[key];
     monday = keep;
     calCache = {};
     return n > 0 && m === 0;
   }) === true, await p.evaluate(() => "�������"));
const calT0 = await p.locator("#cvTitle").innerText();
await p.locator("#cvNext").click(); await p.waitForTimeout(700); await closeDlgs();
ok("2�������J���", (await p.locator("#cvTitle").innerText()) !== calT0,
   [calT0, await p.locator("#cvTitle").innerText()]);
ok("����̂� A4 �悱", await p.evaluate(() =>
   CAL_PAGE.w === 297 && CAL_PAGE.h === 210) === true);
ok("����菇�͌��̖ʂ�1�iprintSpread�j", await p.evaluate(() =>
   typeof printSpread === "function" && typeof printCal === "function") === true);

/* **�����Ƃɐ��������̂����u���A�݌v�͑����Z�����ɂ���B**
   4�����Ԃ�̗݌v�́A4����4��E5����3��c�Ɠ����������x���ʂ�̂ŁA
   ���̍��v��1�x�����o���ΐ��������������� */
ok("�����Ƃ̐������u��", await p.evaluate(() =>
   Object.keys(calMonthCache).length > 0) === true,
   await p.evaluate(() => Object.keys(calMonthCache).length));
ok("�݌v�͎��u�������𑫂������i���𐔂������Ȃ��j", await p.evaluate(() => {
     for(const m of calMonths()) calSum(m);        /* ���u�������߂� */
     const days = Object.keys(calCache).length;
     const months = Object.keys(calMonthCache).length;
     for(const m of calMonths()) calSum(m);        /* 2��� */
     /* �������������Ȃ����g�ݒ����Ă��Ȃ� */
     return days > 0 && Object.keys(calCache).length === days
                     && Object.keys(calMonthCache).length === months;
   }) === true);
ok("���g���ς��Ǝ��u�����̂Ă�", await p.evaluate(() => {
     for(const m of calMonths()) calSum(m);
     const had = Object.keys(calMonthCache).length;
     dataTick++;                     /* �������݁E�ǂݍ��݂ŏオ��� */
     calFreshen();
     return had > 0 && Object.keys(calMonthCache).length === 0;
   }) === true);
/* **�ʂ��Ƃɐ����Ⴄ�B** openView �͎̂Ă����Ƃ������������i�E���j���[�̎�����
   �`�����߁j�̂ŁA�̂Ă錈�܂肻�̂��̂����� */
ok("�ʂ��ς��Ǝ��u�����̂Ă�i�N���X���Ƃɐ����Ⴄ�j", await p.evaluate(() => {
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
/* **�T�̔N�x�́A���̏T�̌��j�Ō��܂�B** 4��1�����܂ޏT�̌��j��3���ɂ��邱�Ƃ�
   ����A���̏T�͑O�̔N�x�̃V�[�g�ɓ����Ă���B���̔N�x�ł܂Ƃ߂�Ƃ���������A
   ���̔N�x�Ԃ���ۂ��ƈႤ�N�̔��֓ǂ݂ɍs���Ă��� */
ok("4/1 ���܂ޏT�́A�O�̔N�x�̔��ɓ���ēǂ�", await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1)]);      /* 2026�N4�� */
     return Object.keys(g).sort().join(",") === "2025,2026"
         && Object.keys(g["2025"]).join(",") === "2026-03-30";
   }) === true, await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1)]);
     return Object.keys(g).map(y => y + ":" + Object.keys(g[y]).join("/"));
   }));
ok("�N�x���Ƃ̐擪�̌��j���A���̔N�x�ɓ����Ă���", await p.evaluate(() => {
     const g = fyWeeks([new Date(2026, 3, 1), new Date(2026, 4, 1)]);
     return Object.keys(g).every(y =>
       String(fyOf(parseISO(Object.keys(g[y]).sort()[0]))) === y);
   }) === true);
await p.locator('#centerTabs [data-center="week"]').click();
await p.waitForTimeout(400); await closeDlgs();

console.log("\n�� �E���j���[�̎���");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
ok("�w�����J���Əo��", await p.evaluate(() =>
   $("tallyWrap").hidden === false) === true);
ok("���Ȃ��ƂɁu�����v�Ɓu�݌v�v��3��", await p.evaluate(() => {
     const r = document.querySelector("#tlyBox .tlyrow");
     return !!r && r.children.length === 3
         && /^\d+$/.test(r.children[1].textContent)
         && /^\d+$/.test(r.children[2].textContent);
   }) === true, await p.evaluate(() => {
     const r = document.querySelector("#tlyBox .tlyrow");
     return r ? [...r.children].map(e => e.textContent) : null;
   }));
/* **�J�����_�[�̖ʂƓ������B** �������� countSub 1�Ȃ̂ŁA����ꏊ�ň��Ȃ� */
ok("�J�����_�[�̌��̉��Ɠ�����", await p.evaluate(() => {
     const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const now = calCount(m), sum = calSum(m);
     return [...document.querySelectorAll("#tlyBox .tlyrow")].every(r => {
       const k = r.children[0].textContent;
       return String(now[k] || 0) === r.children[1].textContent
           && String(sum[k] || 0) === r.children[2].textContent;
     });
   }) === true);
/* **���܂育�Ƃ� �H �̒�**�i���񓯂��������̉��ɋ�����ƁA�ς���������������j�B
   ���Ɏc���̂́u���܂̏�ԁv���� ���� ���T�Ԃ���܂��ǂ�ł��Ȃ��� */
ok("���܂育�Ƃ� �H �̒��ɂ���", await p.evaluate(() =>
   /��{���Ԋ�/.test(HELP.tally3.b.join(""))) === true);
ok("���Ɏc���̂́A���܂̏�Ԃ���", await p.evaluate(() => {
     const t = $("tlyNote").textContent;
     return t === "" || /�ǂ�/.test(t);
   }) === true, await p.evaluate(() => $("tlyNote").textContent));
/* **���ł�����B** ����������̂ł͂Ȃ��̂ŁA����͏�ށB
   �J�����͊o����i���񂽂��ݒ������Ȃ��j */
ok("�����͏�߂�", await p.evaluate(() => !!$("tallyFold")) === true);
ok("�H�͏�񂾂܂܂ł�������i���o���ɒu���j", await p.evaluate(() =>
   !!document.querySelector('#tallyFold > summary .helpq')) === true);
ok("�J�������o����", await p.evaluate(() => {
     const f = $("tallyFold");
     f.open = true; f.dispatchEvent(new Event("toggle"));
     const a = !!db.settings.tallyOpen;
     f.open = false; f.dispatchEvent(new Event("toggle"));
     return a && !db.settings.tallyOpen;
   }) === true);
ok("���ł��Ă��A�����̃R�}���͌�����", await p.evaluate(() =>
   /�R�}/.test($("tlyPeek").textContent)) === true,
   await p.evaluate(() => $("tlyPeek").textContent));
ok("�����i�܂������J���Ă��Ȃ��j�ł͏o���Ȃ�", await p.evaluate(() => {
     const keep = view;
     view = {kind:"gate"};
     drawTallyPanel();
     const hid = $("tallyWrap").hidden;
     view = keep; drawTallyPanel();
     return hid;
   }) === true);

console.log("\n�� �����W�v�V�[�g�i�������Ƃ������j");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
/* �����͏��ł���i����j�B**���̃{�^���������ɂ́A�܂��J��** */
await p.evaluate(() => { $("tallyFold").open = true; });
await p.waitForTimeout(200);
ok("�{�^�����o��", await p.evaluate(() => !!$("tlySheet")) === true);
/* �f��� �H �̒������ɂ���B�{�^���̉��ɒu���ƁA�����O�ɓǂނƂ͌���Ȃ�����
   �����̕\�̉��ɐςݏオ��i��񂾂Ƃ��Ɍ����Ȃ��Ȃ�ꏊ�ł�����j */
ok("�H�̐����ɁA���Ԃ�������Ə����Ă���", await p.evaluate(() =>
   /��/.test(HELP.tally2.b.join("")) ) === true);
/* **������̂͊J���Ă���ʂ̂Ԃ񂾂��B** �O�͑S27�N���X�𐔂��Ă��āA
   �S�C�������̃N���X�������������ł� 1?3���҂����ꂽ */
ok("�w�����J���Ă���΁A���̃N���X1����������", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     return JSON.stringify(tallyScope());
   }) === JSON.stringify(["5-1"]));
ok("�w�N���J���Ă���΁A���̊w�N�̃N���X", await p.evaluate(() => {
     openView({kind:"grade", grade:"5"});
     const a = JSON.stringify(tallyScope()), b = JSON.stringify(classesOfGrade("5"));
     openView({kind:"class", cls:"5-1"});
     return a === b;
   }) === true);
ok("�H�̐������A�J���Ă���ʂ̂Ԃ񂾂ƌ����Ă���", await p.evaluate(() =>
   /�J���Ă���/.test(HELP.tally2.b.join("")) ) === true);
/* **�H�̓{�^���̂����E�B** ���o���̉����ƁA�������Ƃ��Ă���l�̖ڂɓ���Ȃ� */
ok("�H�́u�������W�v����v�̂����E�ɂ���", await p.evaluate(() => {
     const q = document.querySelector('[data-help="tally2"] .helpq');
     const btn = $("tlySheet");
     if(!q || !btn) return "�H���{�^��������";
     const a = btn.getBoundingClientRect(), b = q.getBoundingClientRect();
     /* ���������ŁA�{�^�����E�B���o���̉��ɕt���Ă������ɂ���� */
     return b.left >= a.right - 1 && Math.abs(b.top - a.top) < a.height;
   }) === true, await p.evaluate(() => {
     const q = document.querySelector('[data-help="tally2"] .helpq');
     const btn = $("tlySheet");
     return q && btn ? [btn.getBoundingClientRect().toJSON(),
                        q.getBoundingClientRect().toJSON()] : null;
   }));
/* **�����ԈႢ��1?3���҂����Ȃ��B** ����́u��߂�v */
await p.locator("#tlySheet").click();
await p.waitForTimeout(300);
ok("�����ƁA��Ɋm���߂鑋���o��", await p.evaluate(() =>
   $("okDlg").open === true) === true);
ok("����́u��߂�v", await p.evaluate(() =>
   document.activeElement === $("okNo")) === true);
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#okNo").click();
await p.waitForTimeout(400); await closeDlgs();
ok("��߂�΁A1�{���Ă΂Ȃ�", (await calls()).indexOf("apiWriteTally") < 0, await calls());
/* �����Ēu�� */
await p.evaluate(() => { window.__calls.length = 0; });
await p.locator("#tlySheet").click();
await p.waitForTimeout(300);
await p.locator("#okYes").click();
await p.waitForTimeout(2500); await closeDlgs();
ok("������ƁA�����W�v�V�[�g�֒u��",
   (await calls()).indexOf("apiWriteTally") >= 0, await calls());
const tly = await p.evaluate(() => window.__tally || null);
ok("���o���� �N�x�E�N���X�E�� �� ���� �� ���v",
   !!tly && tly.head[0] === "�N�x" && tly.head[1] === "�N���X" && tly.head[2] === "��"
   && tly.head.indexOf("���v") > 3, tly && tly.head);
ok("���Ȃ̗�́A���ȃV�[�g�̏��i1�����j", await p.evaluate(() => {
     const want = SUBJECTS.filter(s => s.count && s.short).map(s => s.short)
       .filter((x, i, a) => a.indexOf(x) === i);
     const got = (window.__tally.head || []).slice(3, 3 + want.length);
     return want.join(",") === got.join(",");
   }) === true, tly && tly.head);
/* **�J���Ă���ʂ̂Ԃ񂾂��B** �w�����J���Ă����1�N���X �~ ���̐� */
ok("�s�� �J���Ă���ʂ̃N���X �~ �� �̂Ԃ�", await p.evaluate(() => {
     const m0 = new Date(monday.getFullYear(), monday.getMonth(), 1);
     return window.__tally.rows.length
         === tallyScope().length * tallyMonths(m0).length;
   }) === true, tly && tly.rows.length);
ok("�ق��̃N���X�̍s�͍��Ȃ�", await p.evaluate(() =>
   window.__tally.rows.every(r => tallyScope().indexOf(r[1]) >= 0)) === true,
   await p.evaluate(() => [...new Set(window.__tally.rows.map(r => r[1]))]));
/* **������͉̂�ʁB** �V�[�g�̐��ƁA�E���j���[�ɏo�Ă��鐔����v���邱�� */
ok("�V�[�g�ɒu�������́A��ʂ̐��Ɠ���", await p.evaluate(() => {
     const t = window.__tally, m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const row = t.rows.find(r => r[1] === view.cls && r[2] === (m.getMonth() + 1) + "��");
     if(!row) return "���̌��̍s������";
     const now = calCount(m);
     return t.head.slice(3, t.head.indexOf("���v")).every((k, i) =>
       String(now[k] || 0) === row[3 + i]);
   }) === true, await p.evaluate(() => {
     const t = window.__tally, m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     const row = t.rows.find(r => r[1] === view.cls && r[2] === (m.getMonth() + 1) + "��");
     return [t.head, row];
   }));
ok("���v�̗�́A���Ȃ̐��̍��v", await p.evaluate(() => {
     const t = window.__tally, at = t.head.indexOf("���v");
     return t.rows.every(r => {
       let n = 0;
       for(let i = 3; i < at; i++) n += +r[i] || 0;
       return String(n) === r[at];
     });
   }) === true);
/* **�x�݂̓��͐����Ȃ�**�i�����W�v�\�ւ̃R�s�[�Ɠ������܂�j */
ok("�������͎����W�v�\�Ɠ����i�x�݂̓��͐����Ȃ��j", await p.evaluate(() => {
     const m = new Date(monday.getFullYear(), monday.getMonth(), 1);
     /* **��������N���X��I�ԁB** ���{�̊�{���Ԋ��͑S�N���X�Ԃ�͖����̂ŁA
        1�ڂ̃N���X�����ߑł��ɂ���ƁA�͂��߂��� 0 �̂܂ܒʂ��Ă��܂� */
     let cls = null, n = 0;
     for(const c of allClasses()){
       const x = tallyClassMonth(c, m);
       const t = Object.keys(x).reduce((a, k) => a + x[k], 0);
       if(t > 0){ cls = c; n = t; break; }
     }
     if(!cls) return "��������N���X������";
     /* ���̌��̕�����S���u�x�݁v�ɂ��Đ��������i���̒[���̍T�����������j */
     const keep = monday, touched = [];
     for(const dt of calDates(m)){
       monday = mondayOf(dt);
       const d = Math.round((dt - monday) / 86400000);
       if(d < 0 || d >= DAYS) continue;
       const w = week(), key = d + "|" + DAY_SLOT;
       touched.push([w, key, w.school[key]]);
       w.school[key] = {title:"�x��", note:"", subject:null,
                        at:Date.now(), by:"a@edu.nishi.or.jp"};
     }
     const after = tallyClassMonth(cls, m);
     for(const [w, key, was] of touched){ if(was) w.school[key] = was; else delete w.school[key]; }
     monday = keep; calCache = {}; calMonthCache = {}; calMark = "";
     return n > 0 && Object.keys(after).length === 0;
   }) === true);

console.log("\n�� �\�����荞�ށi�����\�E�N�ԍs���v��\�j");
await p.evaluate(() => { openView({kind:"class", cls:"5-1"}); });
await p.waitForTimeout(500); await closeDlgs();
/* ���� �����\�B**���܊J���Ă���N���X�́A���̏T����** ���� */
await p.evaluate(() => openImpPlan("tally"));
await p.waitForTimeout(250);
await p.locator("#ipTpl").click(); await p.waitForTimeout(300);
ok("���`�� ���o���{��?�� ��5�s", await p.evaluate(() => {
     const r = $("ipText").value.split("\n");
     return r.length === 6 && r[0].split("\t")[0] === "�j��" && r[1].split("\t")[0] === "��";
   }) === true, await p.evaluate(() => $("ipText").value.split("\n")[0]));
ok("���`�ɂ��܂̒��g�������Ă���", await p.evaluate(() => {
     const r = $("ipText").value.split("\n").map(x => x.split("\t"));
     const les = SLOTS.filter(s => s.kind === "lesson");
     const c = cellFor(0, les[0].id), t = plain(c.title).trim();
     return r[1][1] === (!t ? "" : t === NO_LESSON ? "�^" : shortOf(c.subject, c.title));
   }) === true);
/* **�ς��Ă��Ȃ����͓���Ȃ��B** �\��߂��������őS���������ƁA
   �w�N�E�S�Z����~��Ă����R�}���S�C�̑w�ɉ�����i���̌����ڂ͓����j */
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("���̂܂ܓ\��߂��Ă��A1��������Ȃ�", await p.evaluate(() =>
   /�����ł���/.test($("ipWarn").textContent) && $("ipGo").disabled) === true,
   await p.evaluate(() => $("ipStat").textContent + " / " + $("ipWarn").textContent));
await p.evaluate(() => {
  const r = $("ipText").value.split("\n").map(x => x.split("\t"));
  r[1][1] = "��"; r[1][2] = "�Z"; r[1][3] = "�ނɂ�";
  $("ipText").value = r.map(x => x.join("\t")).join("\n");
});
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("�ǂ߂Ȃ����́A���ꂸ�ɖ��w������", await p.evaluate(() =>
   /�ނɂ�/.test($("ipWarn").textContent)) === true);
ok("�����O�Ɂu�ǂ̗j���̉��Z���ɉ������邩�v���o��", await p.evaluate(() =>
   /����/.test($("ipGrid").innerText) && /��/.test($("ipGrid").innerText)) === true,
   await p.evaluate(() => $("ipGrid").innerText.slice(0, 60)));
const impBefore = await p.evaluate(() => {
  const les = SLOTS.filter(s => s.kind === "lesson");
  return JSON.stringify([0,1].map(i => plain(cellFor(0, les[i].id).title).trim()));
});
await p.locator("#ipGo").click(); await p.waitForTimeout(700); await closeDlgs();
ok("�J���Ă���N���X�́A�S�C�̑w�ɓ���", await p.evaluate(() => {
     const les = SLOTS.filter(s => s.kind === "lesson");
     const a = cellFor(0, les[0].id), b = cellFor(0, les[1].id);
     return plain(a.title).trim() === "����" && a.layer === "home"
         && plain(b.title).trim() === "�Z��" && b.layer === "home";
   }) === true, impBefore);
ok("�ق��̏T�ɂ͓���Ȃ�", await p.evaluate(() => {
     const other = Y().weeks[iso(addDays(monday, 7))];
     return !other || !other.home || !other.home["5-1"]
         || Object.keys(other.home["5-1"]).length === 0;
   }) === true);
/* ���� �N�ԍs���B**�S�Z�E�w�N�ցB���t�͏T���܂���** ���� */
await p.evaluate(() => {
  const y = Y();
  y.events = y.events || {};
  y.events[iso(addDays(monday, 2))]  = {c:"���P��"};
  y.events[iso(addDays(monday, 16))] = {c:"�Љ�w"};
  save(); openView({kind:"school"});
});
await p.waitForTimeout(600); await closeDlgs();
await p.evaluate(() => openImpPlan("events"));
await p.waitForTimeout(250);
await p.locator("#ipTpl").click(); await p.waitForTimeout(300);
ok("���`�̌��o���� ���t�^�Z���^�Ώہ^�s�����^���l", await p.evaluate(() =>
   $("ipText").value.split("\n")[0]) === "���t\t�Z��\t�Ώ�\t�s����\t���l");
ok("���`�ɁA�N�ԍs���̍s������", await p.evaluate(() =>
   /���P��/.test($("ipText").value) && /�Љ�w/.test($("ipText").value)) === true);
/* **�Z���ƑΏۂ���̍s�͓���Ȃ��B** ���`�ɂ͍s���̂����������ԕ��Ԃ̂ŁA
   �R�}�ɂ��Ȃ����̂��c���Ă���̂��ӂ� */
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("�Z���ƑΏۂ���Ȃ�A1��������Ȃ�", await p.evaluate(() =>
   $("ipGo").disabled) === true, await p.evaluate(() => $("ipStat").textContent));
await p.evaluate(() => {
  const r = $("ipText").value.split("\n").map(x => x.split("\t"));
  const hit = t => r.findIndex(x => x[3] === t);
  r[hit("���P��")][1] = "2"; r[hit("���P��")][2] = "�S�Z";
  /* **�w���Ґ��ɂ���w�N���g���B** �����w�N�́u�N�̎��ɂ��o�Ȃ��v�̂œ���Ȃ� */
  window.__g = gradesAll()[0];
  r[hit("�Љ�w")][1] = "3"; r[hit("�Љ�w")][2] = window.__g + "�N";
  $("ipText").value = r.map(x => x.join("\t")).join("\n");
});
await p.locator("#ipRead").click(); await p.waitForTimeout(300);
ok("�Ώۂ� �S�Z�^���N �œǂ�", await p.evaluate(() =>
   /�S�Z/.test($("ipGrid").innerText)
   && new RegExp(window.__g + "�N").test($("ipGrid").innerText)) === true,
   await p.evaluate(() => $("ipGrid").innerText.slice(0, 80)));
await p.locator("#ipGo").click(); await p.waitForTimeout(400);
/* **�����O�ɁA������͈͂�����**�i�ق��̐搶�̎��ɏo�邽�߁j */
ok("�S�Z�E�w�N�֓����O�ɁA�͈͂������ĕ���", await p.evaluate(() =>
   $("okDlg") && $("okDlg").open) === true);
await p.locator("#okYes").click(); await p.waitForTimeout(2000); await closeDlgs();
ok("�S�Z�̑w�ɓ���", await p.evaluate(() => {
     const w = Y().weeks[iso(monday)], les = SLOTS.filter(s => s.kind === "lesson");
     return plain(((w.school || {})[ck(2, les[1].id)] || {}).title || "") === "���P��";
   }) === true);
/* **�T���܂����ł�����B** �����O�ɁA������T������ԓǂ�ł��珑�� */
ok("2�T��̃R�}���A�w�N�̑w�ɓ���", await p.evaluate(() => {
     const w = Y().weeks[iso(addDays(monday, 14))], les = SLOTS.filter(s => s.kind === "lesson");
     const g = w && w.grade && w.grade[window.__g];
     return !!g && plain((g[ck(2, les[2].id)] || {}).title || "") === "�Љ�w";
   }) === true, await p.evaluate(() => {
     const w = Y().weeks[iso(addDays(monday, 14))];
     return w && w.grade ? Object.keys(w.grade).map(g =>
       g + ":" + Object.keys(w.grade[g]).join(",")) : "���̏T������";
   }));
/* **��Еt���B** �����œ��ꂽ�R�}�́A���Ƃ̌���������T�Ɏc��
   �i5-1 �� 0|p1 �ɒS�C�̑w�œ��ꂽ�܂܂��ƁA���́u�o�ǂ���v�̌�����
   �S�Z�̃R�}�𕢂��Ă��܂��j�B�����ǂ��������ԂŌ��΂�Ȃ��悤�ɂ���B */
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

console.log("\n�� �o�ǂ���̎l�p�i�T�Ă̎������j");
await p.evaluate(() => {
  const w = week(), now = Date.now();
  w.school["0|p1"] = {title:"�S�Z����", note:"", subject:null, at:now, by:"a@edu.nishi.or.jp"};
  (w.grade["5"] || (w.grade["5"] = {}))["1|p1"] =
    {title:"�w�N�W��", note:"", subject:"gakunen_shukai", at:now, by:"a@edu.nishi.or.jp"};
  save(); openView({kind:"class", cls:"5-1"});
});
await p.waitForTimeout(500); await closeDlgs();
const srcAt = (d, s2) => p.evaluate(([d, s2]) => {
  const e = document.querySelector(`#sheet .cell[data-d="${d}"][data-s="${s2}"] .src`);
  return e && !e.hidden ? e.textContent : "";
}, [d, s2]);
ok("�S�Z����~�肽�R�}�́u�S�Z�v", await srcAt(0, "p1") === "�S�Z", await srcAt(0, "p1"));
/* **�c���B** �薼�̗��͍������]��A�������薼�Ǝ�荇���ɂȂ�B
   �������Ɓu�S�Z�v�� 5mm �����Ƃ���A�c�Ȃ� 2.6mm �ōςށB
   **�����ڂ̌`�Ō���**�i�c�����̎w��ł͂Ȃ��j���� �w�肪�����Ă��Ă�
   �����ׂ�Ă�����ǂ߂Ȃ� */
ok("�l�p�͏c���i1�s1�����Őςށj", await p.evaluate(() => {
     const e = document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .src');
     const r = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(e).fontSize);
     /* 2�����Ԃ�̍���������A����1�����Ԃ�B�������肫���Ă��邱�� */
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
ok("�w�N����~�肽�R�}�́u���N�v�i�w�̖��O�ł͂Ȃ��w�N�̐����j",
   await srcAt(1, "p1") === "5�N", await srcAt(1, "p1"));
ok("�����ŏ������R�}�ɂ͏o���Ȃ�", await p.evaluate(() => {
     writeCell(2, "p1", {title:"����", subject:"kokugo"});
     paintSheet();
     const e = document.querySelector('#sheet .cell[data-d="2"][data-s="p1"] .src');
     return !e || e.hidden;
   }) === true);
ok("�E��̎D�Ɠ�d�Ɍ���Ȃ��i�w�͎l�p�������j", await p.evaluate(() => {
     const e = document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .tag');
     return e.hidden || e.textContent === "";
   }) === true);
ok("�d�Ȃ�͉E��Ɏc���i�l�p�������Ȃ����́j", await p.evaluate(() => {
     const w = week(), now = Date.now() + 1000;
     (w.home["5-1"] || (w.home["5-1"] = {}))["0|p1"] =
       {title:"����", note:"", subject:"kokugo", at:now, by:"b@edu.nishi.or.jp"};
     save(); paintSheet();
     return document.querySelector('#sheet .cell[data-d="0"][data-s="p1"] .tag').textContent;
   }) === "�I�d�Ȃ�");
/* **�S�w�N�̖ʂł͏o���Ȃ��B** �S�����u�S�Z�v�ɂȂ�A������ʂ��Ȃ���ɂȂ� */
ok("�S�w�N�̖ʂł͏o���Ȃ�", await p.evaluate(() => {
     openView({kind:"school"});
     return [...document.querySelectorAll("#sheet .src")].every(e => e.hidden);
   }) === true);
await p.waitForTimeout(400); await closeDlgs();
ok("4�T�̖ʂɂ͏o���Ȃ�", await p.evaluate(() => {
     openView({kind:"class", cls:"5-1"});
     setCenter("month");
     return document.querySelectorAll("#mPaper .src:not([hidden])").length;
   }) === 0);
await p.waitForTimeout(600); await closeDlgs();
await p.evaluate(() => setCenter("week"));
await p.waitForTimeout(400); await closeDlgs();

console.log("\n�� �Ǘ�����́A�����O�ɃT�[�o���~�߂�");
ok("�Ǘ��҂Ȃ�A�ݒ�ƊǗ����o��", await p.evaluate(() =>
   !document.querySelector('[data-act="settings"]').hidden) === true);
ok("��ʂ֖͊�ł͂Ȃ��i�{�̂̓T�[�o�� checkAdmin�j", await p.evaluate(() => {
     /* �B��Ă��Ă� google.script.run �͌Ăׂ�B������T�[�o���Ŏ~�߂� */
     return typeof Backend.info().isAdmin === "boolean";
   }) === true);

console.log(errs.length ? "\n�y�G���[�z\n" + errs.join("\n") : "\nJS�G���[�Ȃ�");
if(errs.length) ng += errs.length;
console.log(ng ? "\n�~ " + ng + " �����߂�����" : "\n�� ����Ԓʂ���");
await b.close();
process.exit(ng ? 1 : 0);

