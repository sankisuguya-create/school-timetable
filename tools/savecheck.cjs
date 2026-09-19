/* 本物のBackendに応答順を制御できるRPCを接続し、通信競合を再現する。 */
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
process.env.TZ='UTC';
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/js/backend.js'),'utf8');
function app(storage=new Map()){
  const mon='2026-09-14', w={school:{},grade:{},special:{},home:{'1-1':{'0|p1':{title:'私の入力',note:'',sat:0}}}};
  const calls=[],states=[];
  function runner(){let ok=()=>{},ng=()=>{};const r=new Proxy({}, {get(_,key){
    if(key==='withSuccessHandler')return f=>(ok=f,r);
    if(key==='withFailureHandler')return f=>(ng=f,r);
    return (...args)=>calls.push({key,args,ok,ng});
  }});return r;}
  const c={Date,Map,console,KEY:'test',google:{script:{get run(){return runner();}}},
    db:{years:{2026:{weeks:{[mon]:w}}}},fy:()=>2026,wkKey:()=>mon,week:()=>w,Y:()=>c.db.years[2026],
    ck:(d,s)=>d+'|'+s,iso:d=>d.toISOString().slice(0,10),parseISO:s=>new Date(s+'T00:00:00Z'),
    addDays:(d,n)=>new Date(+d+n*864e5),monday:new Date(mon),gradeOf:()=> '1',
    targetsForView:()=>[{layer:'home',target:'1-1'}],
    setTimeout:()=>1,clearTimeout(){},addEventListener(){},escText:x=>x,
    /* 取り込みのたびに上がる版。カレンダーの取り置きがここを見る */
    dataTick:0,
    localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}};
  vm.createContext(c);vm.runInContext(source+'\nglobalThis.B=Backend;',c);
  c.B.setDirtyWatcher(n=>states.push(n));
  return {b:c.B,c,w,mon,calls,states,storage,edit(){c.B.cellChanged('home','1-1',0,'p1',0);}};
}
{
  const a=app();let done=0;a.edit();a.b.flush(ok=>{assert.ok(ok);done++;});a.b.flush(ok=>{assert.ok(ok);done++;});
  assert.equal(a.states.at(-1),1);assert.equal(done,0);assert.equal(a.calls.length,1);
  a.calls[0].ok({at:{'2026-09-14|p1|home|1-1':10}});
  assert.equal(done,2);assert.ok(a.b.saved());assert.equal(a.b.unsaved(),0);
  a.edit();assert.equal(a.b.saved(),false);
}
for(const finishFirst of [false,true]){
  const a=app();a.edit();a.b.flush();a.b.readWeeks([a.mon],()=>{});
  const write=a.calls.find(x=>x.key==='apiWriteCells'),read=a.calls.find(x=>x.key==='apiReadWeek');
  if(finishFirst)write.ok({at:{}});
  read.ok({home:{'1-1':{'0|p1':{title:'古い応答'}}}});
  assert.equal(a.w.home['1-1']['0|p1'].title,'私の入力');
}
{
  const a=app();a.edit();let result;a.b.flush(ok=>result=ok);
  a.calls[0].ok({at:{},conflicts:[{date:a.mon,slot:'p1',layer:'home',target:'1-1',currentAt:1,currentTitle:'他者の入力'}]});
  assert.equal(result,false);assert.equal(a.b.unsaved(),1);assert.ok(a.storage.has('test/conflicts'));
  const reopened=app(a.storage);reopened.b.boot(()=>{});
  assert.equal(reopened.b.heldCells()[0].q.title,'私の入力');assert.equal(reopened.b.unsaved(),1);
  reopened.b.dropHeld(reopened.b.heldCells());assert.equal(reopened.b.unsaved(),0);assert.equal(a.storage.has('test/conflicts'),false);
}
{
  const a=app();a.edit();let result;a.b.flush(ok=>result=ok);a.calls[0].ng(new Error('offline'));
  assert.equal(result,false);assert.equal(a.b.unsaved(),1);assert.equal(a.b.saved(),false);
  a.b.flush(ok=>result=ok);a.calls[1].ok({at:{}});assert.equal(result,true);
}
/* 保存中に同じコマをさらに編集：最終版の成功までコールバックを返さない。 */
{
  const a=app();a.edit();let done=false;a.b.flush(()=>done=true);
  a.w.home['1-1']['0|p1'].title='続き';a.edit();a.calls[0].ok({at:{'2026-09-14|p1|home|1-1':20}});
  assert.equal(done,false);assert.equal(a.calls[1].args[1][0].title,'続き');
  assert.equal(a.calls[1].args[1][0].expectedAt,20);a.calls[1].ok({at:{}});assert.equal(done,true);
}
console.log('保存待機・読込競合・競合再起動・再送・連続編集: PASS');
