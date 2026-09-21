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
  /* たんぽぽの面。**ロックは出すことだけは止めない。** 組分けは窓の中にある */
  await p.evaluate(()=>{openView({kind:'tanpopo'});if(isLocked())setLock(false);});
  assert.equal(await p.locator('#tpSel .tpchip').count(),0,'面に交流級の並びは出さない');
  assert.equal(await p.locator('#tpGo').isDisabled(),false);
  await p.evaluate(()=>setLock(true));
  assert.equal(await p.locator('#tpGo').isDisabled(),false,'ロック中でも出せる');
  await p.locator('#tpGrpOpen').click();
  assert.equal(await p.locator('#tpGrpDlg').evaluate(d=>d.open),false,'ロック中は組分けを開かない');
  await p.evaluate(()=>setLock(false));
  await p.locator('#tpGrpOpen').click();
  assert.ok(await p.locator('#tpGrpDlg').evaluate(d=>d.open));
  const tpBefore=await p.evaluate(()=>tpTotal());
  const tpAdded=await p.locator('#tpGrpBody .tpchip').first().getAttribute('data-c');
  await p.locator('#tpGrpBody .tpchip').first().click();
  assert.equal(await p.evaluate(()=>tpTotal()),tpBefore+1,'窓から組へ入る');
  await p.evaluate(c=>{tpDrop(tpPick,c);save();drawTpGroupDlg();},tpAdded);
  assert.equal(await p.evaluate(()=>tpTotal()),tpBefore);
  await p.evaluate(()=>$('tpGrpDlg').close());

  for(const kind of ['grade','school']){
    await p.evaluate(kind=>openView({kind,grade:'5'}),kind);
    assert.equal(await p.locator('body').getAttribute('data-scope'),kind);
    assert.match(await p.locator('#stage').evaluate(e=>getComputedStyle(e).backgroundImage),/gradient/);
    if(process.env.STATE_SHOTS) await p.screenshot({path:process.env.STATE_SHOTS+'/'+kind+'.png'});
  }
  /* くすむのは「書いたのに、まだ入っていない」ときだけ。開いただけでは付かない */
  const shut="document.querySelectorAll('dialog[open]').forEach(d=>d.close());";
  const unsaved=()=>p.locator('body').evaluate(e=>e.classList.contains('is-unsaved'));
  for(const kind of ['class','grade','school']){
    await p.evaluate(`${shut}openView(${JSON.stringify(kind==='class'?{kind:'class',cls:'5-1'}:{kind,grade:'5'})});doSave(false);`);
    assert.equal(await unsaved(),false,kind+': 開いただけで未保存にしない');
    await p.evaluate(shut+"writeCell(2,'p2',{title:'国語'});refreshWeek();");
    assert.equal(await unsaved(),true,kind+': 書いたらくすむ');
    await p.evaluate(shut+'doSave(false);');
    assert.equal(await unsaved(),false,kind+': 保存できたら戻る');
  }
  /* 学年・全学年の保存は、押したときに1回聞く。**既定は「反映しない」** */
  await p.evaluate(`${shut}openView({kind:'grade',grade:'5'});writeCell(3,'p1',{title:'学年集会'});refreshWeek();`);
  await p.evaluate(shut);
  assert.match(await p.locator('#saveTxt').innerText(),/保存・反映/);
  /* 「ここで直したものは◯クラスに出る」の1行は外した。
     効く先が広いことは、保存ボタンの字（保存・反映）と左上の行き先が言う */
  assert.equal(await p.evaluate(()=>writeClasses().length),4);
  await p.locator('#saveBtn').click();
  assert.ok(await p.locator('#apDlg').evaluate(d=>d.open));
  assert.equal(await p.evaluate(()=>document.activeElement.id),'apNo');
  await p.locator('#apNo').click();
  assert.equal(await unsaved(),true,'反映しないなら、まだ入っていない');
  await p.locator('#saveBtn').click();
  await p.locator('#apYes').click();
  assert.equal(await unsaved(),false,'反映するなら入る');
  /* 学級の面では聞かない（入れる先がその学級だけなので） */
  await p.evaluate(`${shut}openView({kind:'class',cls:'5-1'});writeCell(3,'p4',{title:'算数'});refreshWeek();`);
  await p.evaluate(shut);
  assert.match(await p.locator('#saveTxt').innerText(),/^保存/);
  assert.equal(await p.evaluate(()=>broadScope()),false);
  await p.locator('#saveBtn').click();
  assert.equal(await p.locator('#apDlg').evaluate(d=>d.open),false);
  assert.equal(await unsaved(),false);

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
  console.log('実ブラウザ: 保存背景・くすみ（開いただけ/書いた/保存後）・反映の窓・提出/再提出・紫の変・学年/学校背景・保存失敗時の提出/出力停止 PASS');
}finally{await b.close();}
