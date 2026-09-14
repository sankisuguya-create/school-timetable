/* 実ブラウザで保存背景・提出の状態・入力範囲・失敗時の停止を検査する。 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const b=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{});
try{
  const p=await b.newPage({viewport:{width:1500,height:950}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('school-timetable/guide-v2','done'));
  await p.goto(new URL('../dist/index.html',import.meta.url).href);
  await p.evaluate(()=>{monday=parseISO('2026-09-14');Y().tanpopo={'1':['5-1']};openView({kind:'class',cls:'5-1'});});
  await p.locator('#saveBtn').click();
  assert.ok(await p.locator('body').evaluate(e=>e.classList.contains('is-saved')));
  await p.evaluate(()=>{writeCell(0,'p1',{title:'国語'});refreshWeek();});
  assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('is-saved')),false);
  assert.ok(await p.locator('#tpChanged').isVisible());
  await p.locator('#tpSubBtn').click();
  assert.ok(await p.locator('#tpSubBtn').evaluate(e=>e.classList.contains('on')));
  await p.evaluate(()=>{writeCell(0,'p1',{title:'算数'});refreshWeek();});
  assert.equal(await p.locator('#tpSubBtn').evaluate(e=>e.classList.contains('on')),false);
  await p.locator('#saveBtn').click();
  assert.ok(await p.locator('#tpChanged').isVisible());
  await p.locator('#tpSubBtn').click();
  assert.match(await p.locator('#tpSubTxt').innerText(),/提出ずみ/);
  assert.equal(await p.locator('#tpChanged').isVisible(),false);
  await p.evaluate(()=>{
    tpTargets=[{url:'https://docs.google.com/spreadsheets/d/123456789012345678901234567890/edit',def:true}];
    const s=tpSubmitInfo('5-1');s.exports={'123456789012345678901234567890':'previous'};
    openView({kind:'tanpopo'});
  });
  assert.equal(await p.locator('.tpin.st-changed em').innerText(),'変');
  assert.equal(await p.locator('.tpin.st-changed em').evaluate(e=>getComputedStyle(e).color),'rgb(105, 65, 137)');
  await p.evaluate(()=>{const s=tpSubmitInfo('5-1');s.exports['123456789012345678901234567890']=s.at;drawTanpopoView();});
  assert.equal(await p.locator('.tpin.st-ok em').innerText(),'済');
  for(const kind of ['grade','school']){
    await p.evaluate(kind=>openView({kind,grade:'5'}),kind);
    assert.equal(await p.locator('body').getAttribute('data-scope'),kind);
    assert.match(await p.locator('#stage').evaluate(e=>getComputedStyle(e).backgroundImage),/gradient/);
    if(process.env.STATE_SHOTS) await p.screenshot({path:process.env.STATE_SHOTS+'/'+kind+'.png'});
  }
  await p.evaluate(()=>{
    openView({kind:'class',cls:'5-1'});
    window.__submitted=0;window.__exported=0;
    Backend.flush=after=>after&&after(false);
    Backend.tpSubmit=()=>window.__submitted++;
    toggleTpSub();
    Backend.isGas=()=>true;
    Backend.exportWeek=()=>window.__exported++;
    doExportTanpopo();
  });
  assert.deepEqual(await p.evaluate(()=>[window.__submitted,window.__exported]),[0,0]);
  assert.deepEqual(errors,[]);
  console.log('実ブラウザ: 保存背景・提出/再提出・紫の変・学年/学校背景・保存失敗時の提出/出力停止 PASS');
}finally{await b.close();}
