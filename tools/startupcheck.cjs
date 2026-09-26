/* DOM契約・起動順序の検査。Chrome不要。実レイアウトの検査はcheck.mjsで行う。
   BASELINE_REF=origin/main node tools/startupcheck.cjs で修正前の失敗も再現できる。 */
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
const read = p => process.env.BASELINE_REF
  ? cp.execFileSync('git', ['show', process.env.BASELINE_REF + ':' + p], {encoding:'utf8'})
  : fs.readFileSync(p, 'utf8');
const html = read('src/index.html');
const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], {hidden:false, textContent:''}]));
const actions = new Map([...html.matchAll(/data-act="([^"]+)"/g)].map(m => [m[1], {hidden:false}]));
const outputs = [...html.matchAll(/<button[^>]*data-plan-output[^>]*>/g)].map(m => actions.get(m[0].match(/data-act="([^"]+)"/)[1]));
const scheduled = [];
let bootCount=0, draws=0, headers=0, busy=0;
const context = vm.createContext({
  console, setTimeout(fn){ scheduled.push(fn); return scheduled.length; }, clearTimeout(){},
  addEventListener(){},
  document:{addEventListener(){}, querySelector(s){
    const a = s.match(/data-act=['"]([^'"]+)/);
    if(a) return actions.get(a[1]) || null;
    return {classList:{toggle(){}}};
  }, querySelectorAll(s){ return s === '[data-plan-output]' ? outputs : []; }},
  $:id => nodes.get(id),
  Backend:{flush(){}, ready(fn){fn();}, isGas(){return true;},
    setNotifier(){}, setDirtyWatcher(){}, setConflictWatcher(){},
    /* 管理の関門が start() から見る。**管理者として通す** ──
       ここで見たいのは起動順序で、関門そのものは gatecheck が見る */
    info(){ return {me:'a@edu.nishi.or.jp', isAdmin:true}; },
    boot(fn){bootCount++; fn();}, watch(){}, readyYear(fn){fn();}},
  KEY:'school-timetable/v3',
  view:{kind:'gate'}, selCell:null, storeBroken:'', onStoreError:null,
  loadDb(){}, applyPaper(){}, paintArchive(){}, pollNewYear(){},
  pruneWeeks(){return 0;}, KEEP_WEEKS:60, save(){}, saveNow(){}, showConflicts(){},
  monday:new Date('2026-09-14'), addDays(d,n){return new Date(+d+n*86400000);},
  fy(){return 2026;}, db:{years:{2026:{}}}, clearSelection(){}, refreshWeek(){draws++;},
  openGuide(){}, localStorage:{getItem(){return null;},setItem(){}},
});
vm.runInContext(read('src/js/gate.js'), context);
vm.runInContext(read('src/js/main.js').replace(/\bstart\(\);\s*$/, ''), context);
context.wire = () => {}; // イベント結線はブラウザ検査。ここでは起動順序のみを検査。
context.drawGate = () => {draws++;};
context.paintHeader = () => {headers++;};
context.setBusy = on => {busy += on ? 1 : -1;};
vm.runInContext('start()', context);
assert.equal(bootCount,1,'初期描画後にGAS初期化へ到達する');
assert.ok(draws>0 && headers>0,'週移動前に入口と行き先を描画する');
if(!process.env.BASELINE_REF){
  /* 教務必携用・時数をコピー・4週まとめて・学年でならべる・カレンダー・連絡帳用 */
  assert.equal(outputs.length,6,'出力ボタン6個のHTML契約');
  vm.runInContext('showPlanOutputs(false)',context);
  assert.ok(outputs.every(x=>x.hidden));
  vm.runInContext('showGate()',context);
  assert.ok(outputs.every(x=>!x.hidden));
  busy=1;
  vm.runInContext('loadAndDraw(()=>{}, "同期")',context);
  assert.equal(busy,1,'同期完了で他操作の待機を減らさない');
  let land;
  context.Backend.ready=fn=>{land=fn;};
  vm.runInContext('loadAndDraw(()=>{}, "非同期")',context);
  assert.equal(busy,2); land(); assert.equal(busy,1);
  const store=vm.createContext({AB_ANCHOR:'2026-09-07',mondayOf:d=>d,
    clone:x=>JSON.parse(JSON.stringify(x)), DEFAULT_CLASSES:{'1':['1-1']},DEFAULT_SPECIALS:[],SUB_BY_NAME:{}});
  vm.runInContext(read('src/js/store.js'),store);
  vm.runInContext(`const classes={'1':[]}; const specialList=[];
    if(normClasses_(classes)!==classes || normSpecials_(specialList)!==specialList) throw Error('参照破壊');
    if(normClasses_(['1-1'])['1'][0]!=='1-1') throw Error('旧形式');`,store);
  // 静的なID参照は全ソースを走査。動的に生成するIDも含めて存在を調べる。
  const sources=fs.readdirSync('src/js').filter(f=>f.endsWith('.js')).map(f=>read('src/js/'+f)).join('\n');
  // ブラウザの confirm / prompt を1つも置かない（docs/spec.md 7節）。
  // Enter で「はい」に落ちるので、いちばん大きく壊せる操作がそこに残る。
  // 文だけの確認は askOk（okDlg）、URL の入力は linkDlg。
  // コメントの中の字は数えない（禁じている理由をコメントに書けなくなる）。
  const code=sources.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  for(const bad of ['confirm','prompt'])
    assert.ok(!new RegExp('(^|[^.\\w])'+bad+'\\s*\\(').test(code),
      'ブラウザの '+bad+'() を使わない（docs/spec.md 7節）。'
      +'文だけの確認は askOk、URL の入力は linkDlg');
  for(const match of sources.matchAll(/\$\(['"]([\w-]+)['"]\)/g)){
    const id=match[1];
    assert.ok(nodes.has(id) || sources.includes('id="'+id+'"') || sources.includes("id='"+id+"'")
      || new RegExp('\\.id\\s*=\\s*[\x27\x22]'+id+'[\x27\x22]').test(sources), '不明なID: '+id);
  }
}
console.log('起動順序・DOM参照・出力切替・待機所有権・設定参照: PASS');
