/* �{����Backend�ɉ������𐧌�ł���RPC��ڑ����A�ʐM�������Č�����B */
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
process.env.TZ='UTC';
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/js/backend.js'),'utf8');
function app(storage=new Map(), session=new Map(), mon='2026-09-14'){
  const year=+mon.slice(5,7)<=3 ? +mon.slice(0,4)-1 : +mon.slice(0,4);
  const w={school:{},grade:{},special:{},home:{'1-1':{'0|p1':{title:'���̓���',note:'',sat:0}}}};
  const calls=[],states=[];
  function runner(){let ok=()=>{},ng=()=>{};const r=new Proxy({}, {get(_,key){
    if(key==='withSuccessHandler')return f=>(ok=f,r);
    if(key==='withFailureHandler')return f=>(ng=f,r);
    return (...args)=>calls.push({key,args,ok,ng});
  }});return r;}
  const c={Date,Map,console,KEY:'test',google:{script:{get run(){return runner();}}},
    db:{years:{[year]:{weeks:{[mon]:w}}}},fy:()=>year,wkKey:()=>mon,week:()=>w,Y:()=>c.db.years[year],
    ck:(d,s)=>d+'|'+s,iso:d=>d.toISOString().slice(0,10),parseISO:s=>new Date(s+'T00:00:00Z'),
    addDays:(d,n)=>new Date(+d+n*864e5),monday:new Date(mon),gradeOf:()=> '1',
    targetsForView:()=>[{layer:'home',target:'1-1'}],
    setTimeout:()=>1,clearTimeout(){},addEventListener(){},escText:x=>x,
    /* ��荞�݂̂��тɏオ��ŁB�J�����_�[�̎��u�������������� */
    dataTick:0,
    localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},
    sessionStorage:{setItem:(k,v)=>session.set(k,v),getItem:k=>session.get(k),removeItem:k=>session.delete(k)}};
  vm.createContext(c);vm.runInContext(source+'\nglobalThis.B=Backend;',c);
  c.B.setDirtyWatcher(n=>states.push(n));
  return {b:c.B,c,w,mon,calls,states,storage,session,edit(){c.B.cellChanged('home','1-1',0,'p1',0);}};
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
  read.ok({home:{'1-1':{'0|p1':{title:'�Â�����'}}}});
  assert.equal(a.w.home['1-1']['0|p1'].title,'���̓���');
}
{
  const a=app();a.edit();let result;a.b.flush(ok=>result=ok);
  a.calls[0].ok({at:{},conflicts:[{date:a.mon,slot:'p1',layer:'home',target:'1-1',currentAt:1,currentTitle:'���҂̓���'}]});
  assert.equal(result,false);assert.equal(a.b.unsaved(),1);assert.ok([...a.storage.keys()].some(k=>k.startsWith('test/conflicts/')));
  const reopened=app(a.storage,a.session);reopened.b.boot(()=>{});
  assert.equal(reopened.b.heldCells()[0].q.title,'���̓���');assert.equal(reopened.b.unsaved(),1);
  reopened.b.dropHeld(reopened.b.heldCells());assert.equal(reopened.b.unsaved(),0);assert.equal([...a.storage.keys()].some(k=>k.startsWith('test/conflicts/')),false);
}
{
  const a=app();a.edit();let result;a.b.flush(ok=>result=ok);a.calls[0].ng(new Error('offline'));
  assert.equal(result,false);assert.equal(a.b.unsaved(),1);assert.equal(a.b.saved(),false);
  a.b.flush(ok=>result=ok);a.calls[1].ok({at:{}});assert.equal(result,true);
}
/* �����u���E�U�̕ʃ^�u���A�ʐM���s���̍T���������Ă͂����Ȃ��B */
{
  const storage=new Map(), a=app(storage), b=app(storage);a.edit();a.b.flush();a.calls[0].ng(new Error('offline'));
  const mine=[...storage.keys()].find(k=>k.startsWith('test/pending/'));
  b.w.home['1-1']['1|p2']={title:'�ʃ^�u',note:'',sat:0};b.b.cellChanged('home','1-1',1,'p2',0);b.b.flush();b.calls[0].ok({at:{}});
  assert.ok(storage.has(mine),'�ʃ^�u�̕ۑ��Ŗ����M�T���������Ȃ�');
}
/* 4��1�����܂ޏT�́A���j�i3��30���j��������N�x�֓ǂݏ�������B */
{
  const storage=new Map(),session=new Map(),a=app(storage,session,'2026-03-30');
  a.w.home['1-1']['2|p1']={title:'�N�x���E',note:'',sat:0};a.b.cellChanged('home','1-1',2,'p1',0);a.b.flush();
  assert.equal(a.calls[0].args[0],2025);
  a.calls[0].ok({at:{'2026-04-01|p1|home|1-1':123}});
  assert.equal(a.w.home['1-1']['2|p1'].sat,123);
  a.b.cellChanged('home','1-1',2,'p1',123);a.b.flush();a.calls[1].ng(new Error('offline'));
  const reopened=app(storage,session,'2026-03-30');reopened.b.boot(()=>{});reopened.calls[0].ok({});
  assert.equal(reopened.calls[1].args[0],2025);
}
/* �ۑ����ɓ����R�}������ɕҏW�F�ŏI�ł̐����܂ŃR�[���o�b�N��Ԃ��Ȃ��B */
{
  const a=app();a.edit();let done=false;a.b.flush(()=>done=true);
  a.w.home['1-1']['0|p1'].title='����';a.edit();a.calls[0].ok({at:{'2026-09-14|p1|home|1-1':20}});
  assert.equal(done,false);assert.equal(a.calls[1].args[1][0].title,'����');
  assert.equal(a.calls[1].args[1][0].expectedAt,20);a.calls[1].ok({at:{}});assert.equal(done,true);
}
console.log('�ۑ��ҋ@�E�Ǎ������E�����ċN���E�đ��E�A���ҏW: PASS');

