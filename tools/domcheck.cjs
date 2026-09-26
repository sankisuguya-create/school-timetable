/* 実HTML+全JSをjsdomで実行。レイアウト・GAS実接続は対象外。 */
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../dist/index.html'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function check(gas, failure=false, guide='new', resume=''){
  const errors=[], calls=[];
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>{if(e.type!=='css-parsing' && e.type!=='css parsing') errors.push(String(e));});
  const dom=new JSDOM(html,{url:'https://school.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      /* 案内は自動では開かない（スマホで「見た」印が揮発し、毎回出てしまうため）。
         'done' は過去の印を残すだけで、動きは変わらない */
      if(resume) w.localStorage.setItem('school-timetable/v3/last',
        JSON.stringify({kind:'class',cls:resume}));
      /* jsdom は matchMedia を持たない。狭い画面の判定は画面のことだけに
         効くので、検査では「広い」と答えるだけの受けを置く */
      w.matchMedia = () => ({matches:false, media:"", onchange:null,
        addEventListener(){}, removeEventListener(){},
        addListener(){}, removeListener(){}, dispatchEvent(){return false;}});
      w.HTMLDialogElement.prototype.showModal=function(){
        if(guide==='broken' && this.id==='guideDlg') throw new Error('test dialog unavailable');
        this.open=true;
      };
      w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
      if(gas){
        function runner(){
          let ok=()=>{},ng=()=>{};
          const api=new Proxy({}, {get(_,name){
            if(name==='withSuccessHandler') return fn=>{ok=fn;return api;};
            if(name==='withFailureHandler') return fn=>{ng=fn;return api;};
            return (...args)=>{
              calls.push(name);
              w.setTimeout(()=>{
                if(failure) return ng(new Error('test offline'));
                const r=name==='apiBoot' ? {year:args[0],base:{},roster:{classes:{'1':['1-1']},specials:[{code:'ongaku',label:'音楽'}]}}
                  : name==='apiReadWeek' ? {school:{},grade:{},special:{},home:{},submits:{}}
                  : name==='apiTpTargets' ? [] : {};
                ok(r);
              },10);
            };
          }});return api;
        }
        w.google={script:{get run(){return runner();}}};
      }
    }});
  const w=dom.window,d=w.document;
  try{
    await wait(350);
    assert.equal(errors.length,0,errors.join('\n'));
    /* 直前に開いていた面へ戻る。面が消えていれば入口へ（gate.js loadLastTarget） */
    if(resume==='1-1'){
      assert.equal(d.getElementById('gate').hidden,true,'前回の面へ復帰（入口を飛ばす）');
      assert.equal(w.eval("view.kind+':'+(view.cls||'')"),'class:1-1');
      d.querySelector('.nav[data-act="gate"]').click();
      await wait(50);
    }else if(resume){
      assert.equal(d.getElementById('gate').hidden,false,'消えた面は入口へ戻す');
    }
    assert.ok(d.querySelectorAll('#grid .tile.cls').length>0,'週切替なしで入口表示');
    assert.ok(d.getElementById('weekLabel').textContent);
    if(gas) assert.ok(calls.includes('apiBoot'),'初期通信到達');
    assert.equal(d.getElementById('guideDlg').open,false,'案内は自動では開かない');
    d.querySelector('[data-close="guideDlg"]').click();
    assert.equal(d.getElementById('guideDlg').open,false);
    d.querySelector('#grid .tile.cls').click();
    await wait(80);
    assert.ok(d.getElementById('gate').hidden,'週切替なしで学級表示');
    assert.ok(d.querySelectorAll('#sheet .cell').length>0,'週案セル');
    assert.ok(d.querySelectorAll('#pals .pal').length>0,'右の授業チップ');
    /* 教科チップ。**押す口は画面から消えた**（「教科の表し方」に移った）ので、
       棚（chipModes）を直して組み直す。見たいのは「棚の値が紙に出るか」。
       中身は const/let の素の大域なので window には付かない。w.eval で触る。 */
    assert.equal(d.getElementById('sheet').classList.contains('chips-screen'),false);
    w.eval("Y().chipModes[view.cls]='screen'; buildSheet();");
    assert.ok(d.getElementById('sheet').classList.contains('chips-screen'),'棚の値が紙に出る');
    w.eval("Y().chipModes[view.cls]='off'; buildSheet();");
    assert.equal(d.getElementById('sheet').classList.contains('chips-screen'),false);
    /* 見出しの右のグリッドは外した。入口へ行く口は「ほかの週案を開く」1つ */
    d.querySelector('.nav[data-act="gate"]').click();
    assert.equal(d.getElementById('gate').hidden,false);
    d.getElementById('nextWk').click();
    await wait(80);
    assert.equal(d.getElementById('busy').hidden,true);
    d.getElementById('guideOpen').click();
    assert.equal(d.getElementById('guideDlg').open,guide!=='broken','案内再表示');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('DOM起動・画面切替・チップ・案内: PASS',gas?'GAS mock':'local',failure?'offline':'',guide);
  }finally{w.close();}
}
(async()=>{await check(false);await check(true);await check(true,true);await check(false,false,'done');await check(true,false,'broken');await check(false,false,'new','1-1');await check(true,false,'new','1-1');await check(false,false,'new','9-9');})().catch(e=>{console.error(e);process.exitCode=1;});
