/* �u���ꏊ�̌p���ځB**��ʂ͂ǂ���œ����Ă��邩��m��Ȃ��B**

     �茳�i�u���E�U�� dist/index.html ���J���j  �c localStorage
     �{�ԁiApps Script �̃E�F�u�A�v���j        �c �V�[�g

   ��ʂ͍��܂łǂ���A�������� db �����ē����ɕ`���B
   �{�Ԃł�**�T��1��ǂ�Ń������Ɏ����A�������݂͍����𒙂߂Ă܂Ƃ߂đ���**�B
   1�R�}�ł��тɃT�[�o��҂��ɂ���ƁA�Z���̉���ł͑Ō����~�܂�B

   �����i�������������߂�l�j��**�T�[�o���ł������̂���**�B
   ���������Ƃɖ߂��Ă��������ŁA�茳�̍T���𒼂��B */
const Backend = (function(){

  const onGas = typeof google !== "undefined" && google.script && google.script.run;

  /* **�܂������Ă��Ȃ��R�}�́u�ꏊ�v�������o����B���g�͊o���Ȃ��B**
     �Ō��̂��тɒ��g��ςނƁA1�R�}���������ŉ��\�������邱�ƂɂȂ�B
     ���钼�O�ɁA���̂Ƃ���ʂ������Ă��钆�g��ǂ��1���ɂ܂Ƃ߂�B */
  let dirty = {};        /* "�w|�Ώ�|�j��|����" �� {layer,target,d,slot} */
  let dirtyN = 0;
  /* **���ܑ����Ă���r���̂Ԃ�B** �������Ԃ�܂ŁA�����ɒ��g���ƒu���Ă����B
     �O�͑���n�߂����_�� dirty ����O���Ă����̂ŁA�Ԏ�������O�ɉ�ʂ�
     ������ƁA���̂Ԃ񂪍T���ɂ��c��Ȃ��܂܏����Ă����B
     �T���́u�܂��V�[�g�ɓ����Ă��Ȃ����́v��S�������Ă��Ȃ���ΈӖ����Ȃ��B */
  let inflight = {};     /* �������񂲂Ƃ� id �� [patch, �c] */
  let flightId = 0;
  let timer = 0;
  let sending = false;
  let editEpoch = 0;
  let acknowledged = false;
  /* **���̉�ʂ�1�R�}�ł������āA�܂������Ă��Ȃ����B**
     �J���������̐l���u���ۑ��v�ɂ��Ȃ����߂ɁAacknowledged �Ƃ͕ʂɎ���
     �iacknowledged �͗����オ�肪 false �Ȃ̂ŁA�J�����u�Ԃ��疢�ۑ��Ɍ�����j�B
     �茳�ł��{�Ԃł������ɓ��� ���� ���ۑ��̐��̓V�[�g�֑���Ԃ񂵂������Ȃ��̂ŁA
     �茳�ł� always 0 �ɂȂ�A��ʂ̍��}�Ɏg���Ȃ��B */
  let touched = false;
  const flushWaiters = [];
  let notify = () => {};
  let onDirty = () => {};   /* ���ۑ��̐����ς�������ʂɒm�点�� */
  let lastErr = "";

  /* **�������ď����Ȃ������Ԃ�B�̂ĂȂ��B**
     dirty �֖߂��ƁA���� expectedAt �ł��܂ł�������������B
     ���̕Ԏ����o��܂ŁA���낤�Ƃ������g���Ƃ����ɒu���B */
  let held = [];
  let onConflict = () => {};

  /* ���� ���� ���������������������������������������������������������������������������� */

  const isGas = () => !!onGas;
  const setNotifier = fn => { notify = fn; };

  /* 1�R�}�ς�����B**�ꏊ���o���邾���ŁA�܂�����Ȃ��B**
     �茳�ilocalStorage�j�͂��̂Ǌۂ��Ə����o���Ă���̂ŁA
     �����Ŋo����͖̂{�Ԃ̃V�[�g�֑���Ԃ�B */
  /* baseAt �� **�����O�ɁA���̃R�}���T�[�o�Ŏ����Ă��������B**
     �Ăԑ��icompose.js �� writeCell�j���A�����ւ���O�ɓǂ�œn���B
     �����œǂނ̂ł͒x���B��ɂ��鑀��ł́A�����R�}�������Ă���B

     �����Ǌo������A�����R�}�𑱂��Ē����Ă�**�㏑�����Ȃ�**�B
     �Ō��̂��тɍX�V����ƁA�������������̑Ō��ɒǏ]���āA�������������B */
  /* where �� ���̃R�}������N�x�ƏT�B**�n���Ȃ���΁A���܊J���Ă���T�B**
     ���������Ԃ����꒼���Ƃ��́A�ʂ̏T�̃R�}��������Ȃ��B
     ���܂̏T�Ƃ��Ċo����ƁA�ʂ̏T�̃R�}�������ւ��Ă��܂��B */
  /* wasTitle �� �����O�ɁA���̒I�ɓ����Ă����薼�B**����ۂۂ̒�o�𕢂�����
     ���߂�̂ɗv��**�i�� store.js markTpEdited �E tanpopo.js tpAffected�j�B
     �n���Ȃ������Ăяo���́A���܂łǂ���w�����Ō��߂�i�������֓|���j�B */
  function cellChanged(layer, target, d, slotId, baseAt, where, wasTitle){
    acknowledged = false;
    touched = true;
    editEpoch++;
    if(typeof markTpEdited === "function")
      markTpEdited(layer, target, where, d, slotId, wasTitle);
    if(!onGas) return;
    const yr = where ? String(where.year) : fy();
    const mo = where ? where.monday : wkKey();
    const k = [layer, target || "", yr, mo, d, slotId].join("|");
    if(!dirty[k]){ dirty[k] = {layer, target:target || "", year:yr,
                               monday:mo, d, slot:slotId,
                               baseAt: +baseAt || 0}; dirtyN++; }
    onDirty(unsaved(), lastErr);
    persistSoon();
    schedule();
  }

  /* **�Ō��ł͑���Ȃ��B** �肪�~�܂��Ă��΂炭�o���Ă���A�O�̂��ߑ���B
     �ӂ���́u�ۑ��v���������Ƃ��E�T���ʂ�ς����Ƃ��E����Ƃ��ɑ���B */
  function schedule(){ retry(180000); }        /* 3���B��肱�ڂ��̎󂯎M */
  function retry(ms){
    clearTimeout(timer);
    timer = setTimeout(() => flush(), ms);
  }

  /* ���� ���������Ԃ� ������������������������������������������������������
     �T�[�o�́A�Â���Ԃ���̕ۑ����R�}�P�ʂŎ~�߂� conflicts �ŕԂ�
     �i�� gas/Store.gs writeCells�j�B**�~�܂������Ƃ���ʂɓ`���Ȃ��ƁA
     ���t�͏���������ŏ����Ă��Ȃ��܂܏T��i�߂�B** */
  const cfKey = q => [q.date, q.slot, q.layer, q.target || ""].join("|");

  /* ���̓��t���A�ǂ̔N�x�E�ǂ̏T�E�T�̉����ڂ����o���B
     �����́A���܊J���Ă���T�̂��̂Ƃ͂�����Ȃ��i�T���ڂ�Ƃ��ɑ��邽�߁j�B */
  function locOf(dateISO){
    const dt = parseISO(dateISO);
    if(!dt) return null;
    const off = (dt.getDay() + 6) % 7;            /* ���j�� 0 �ɂ��� */
    const monday = iso(addDays(dt, -off));
    /* �T�Ă̔N�x�̓R�}�̓��t�ł͂Ȃ��A���̏T�̌��j�Ō��܂�B
       3/30 �̏T�ɂ��� 4/1 ����t�Ŕ��肷��ƁA�ۑ����ʂ��������N�x�̔���
       ����A���̕ҏW�ŌÂ� expectedAt �𑗂��Ă��܂��B */
    const monYear = +monday.slice(0, 4), monMonth = +monday.slice(5, 7);
    return {year: (monMonth <= 3 ? monYear - 1 : monYear), monday, d: off};
  }

  function takeConflicts(list, sent){
    if(!list || !list.length) return;
    for(const c of list){
      const loc = locOf(c.date);
      if(!loc) continue;                          /* ���t���ǂ߂Ȃ��B�̂Ă��ɔ�΂� */
      held.push({c, q: (sent || {})[cfKey(c)] || null, loc});
    }
    persistPending();
    onConflict(held.slice());
  }
  const heldCells = () => held.slice();
  const dropHeld = list => {
    held = list ? held.filter(h => !list.includes(h)) : [];
    persistPending(); onDirty(unsaved(), lastErr);
  };

  /* **�����������Ƃ́A���̏T��K���ǂݒ����B**
     �ǂݒ������ɑ��蒼���ƁA���Ă��Ȃ��ύX��������x�ׂ��ɂ������ƂɂȂ�B */
  function reloadWeek(list, after){
    if(!onGas) return after();
    for(const h of (list || []))
      for(const t of allTargets())
        delete loadedWeek[weekTag(t, String(h.loc.year), h.loc.monday)];
    for(const t of allTargets()) delete loadedWeek[weekTag(t)];
    ready(after);
  }

  /* ���钼�O�ɁA���܉�ʂ������Ă��钆�g��ǂ��1�R�}1���ɂ���B */
  function patchOf(m){
    const w = (db.years[String(m.year)] || {weeks:{}}).weeks[m.monday];
    const bank = !w ? null
               : m.layer === "school" ? w.school
               : m.layer === "grade"  ? (w.grade[m.target]   || {})
               : m.layer === "special"? (w.special[m.target] || {})
               :                        (w.home[m.target]    || {});
    const e = bank ? bank[ck(m.d, m.slot)] : null;
    const p = m.monday.split("-");
    const date = iso(new Date(+p[0], +p[1] - 1, +p[2] + m.d));
    return {date, slot:m.slot, layer:m.layer, target:m.target,
            title:   e ? e.title : "",
            note:    e ? e.note  : "",
            subject: e ? (e.subject || "") : "",
            sp:      e ? (e.sp || "")      : "",
            remove:  !e,
            /* **���̕ҏW���n�߂��Ƃ��A�������m���Ă����T�[�o�̍X�V�����B**
               �T�[�o�́A���܃V�[�g�ɓ����Ă��鎞���Ƃ��������ׂ�B
               �Ⴆ�΁A���̂������ɒN���������Ă���i�����j�B

               �茳�őł��������iat�j�ł͂Ȃ��B**�ł��т� at �͐i�ނ̂ŁA
               ����𑗂�ƕK���H���Ⴂ�A�S���������ɂȂ�B**
               �����O�ɍT�����l�ibaseAt�j���g���B�R�}����ɂ����Ƃ���
               �������g�������̂ŁA�T���Ă����Ȃ��ƕ�������������B */
            expectedAt: +m.baseAt || 0};
  }

  /* ���߂��Ԃ�𑗂�Bafter �͑���I����Ă���Ăԁi�������育������Ԃ����߁j�B */
  function flush(after){
    if(after) flushWaiters.push(after);
    if(sending) return;
    const finishFlush = (ok, record = true) => {
      if(record){ acknowledged = ok; if(ok) touched = false; }
      onDirty(unsaved(), lastErr);
      for(const fn of flushWaiters.splice(0)) fn(ok);
    };
    if(!onGas || !dirtyN){
      lastErr = "";
      return finishFlush(!held.length, acknowledged || flushWaiters.length > 0);
    }
    const batch = dirty;
    dirty = {}; dirtyN = 0; sending = true;
    /* **�ǂ̃R�}���A�ǂ̒��g�ő����������o���Ă����B**
       �������Ԃ��Ă����Ƃ��A�Ԃ��Ă���̂́u���܃V�[�g�ɓ����Ă�����́v�����B
       ����������悤�Ƃ������g�́A������Ŏ����Ă��Ȃ��Əo���Ȃ��B */
    const byYear = {}, sent = {};
    for(const k in batch){
      const m = batch[k];
      const q = patchOf(m);
      sent[cfKey(q)] = q;
      (byYear[m.year] || (byYear[m.year] = [])).push(q);
    }
    /* �ӂ���1�N�x�Ԃ�B�N�x���܂����Œ������Ƃ�����2��ɕ������ */
    const years = Object.keys(byYear);
    let left = years.length, bad = false;
    const t0 = Date.now();
    for(const y of years){
      /* **����Ԃ���A�������Ԃ�܂ōT���̑��ɂ��u���Ă����B**
         �Ԏ�������O�ɉ�ʂ�����Ă��A���ɊJ�����Ƃ��ɑ��蒼���� */
      const id = ++flightId;
      inflight[id] = byYear[y];
      persistPending();
      google.script.run
        .withSuccessHandler(res => {
          editEpoch++;
          delete inflight[id];            /* �V�[�g�ɓ������B�T������O���Ă悢 */
          noteTime(res, Date.now() - t0);
          applyServerTimes(res && res.at);
          takeConflicts(res && res.conflicts, sent);
          if(!--left){ sending = false; lastErr = bad ? lastErr : ""; }
          onDirty(unsaved(), lastErr);
          persistPending();
          if(!left){
            if(!bad && dirtyN) flush();
            else finishFlush(!bad && !unsaved());
          }
        })
        .withFailureHandler(err => {
          bad = true;
          delete inflight[id];
          /* ����Ȃ������Ԃ�͎̂ĂȂ��B���̕ۑ��ł�����x���� */
          for(const k in batch) if(String(batch[k].year) === String(y)){
            if(!dirty[k]){ dirty[k] = batch[k]; dirtyN++; }
          }
          lastErr = err && err.message ? err.message : "�ʐM�ł��Ȃ�";
          notify("<b>�ۑ��ł��Ă��Ȃ�</b>�i" + escText(lastErr) + "�j�B������x�u�ۑ��v������");
          if(!--left) sending = false;
          onDirty(unsaved(), lastErr);
          persistPending();
          if(!left) finishFlush(false);
        })
        .apiWriteCells(+y, byYear[y]);
    }
    /* **����n�߂Ă��A�����Ă��Ȃ����͌��炳�Ȃ��B** ���炷�ƁA�����������
       �u�ۑ����݁v�Əo�āA�����ŕ����l�͓������Ǝv���Ă��܂� */
    onDirty(unsaved(), lastErr);
  }
  /* ���� ����Ȃ��܂ܕ���ꂽ�Ԃ�������z�� ����������������
     �����Ă���r���ŉ�ʂ������ƁA�V�[�g�ɓ���Ȃ��܂܏�����B
     �茳�ilocalStorage�j�ɂ͒��g���c�邪�A���ɊJ�����Ƃ��V�[�g�̑���
     �ǂݒ����̂ŁA**�V�[�g�ɖ������̂͏㏑������ď�����B**

     ������A�܂������Ă��Ȃ��R�}��**���g����**���̒[���ɍT���Ă����A
     ���ɊJ�����Ƃ��ɑ��蒼���B���ꂽ��T�����̂Ă�B */
  /* localStorage �͓����u���E�U�̑S�^�u�ŋ��ʁB�ۑ����̃^�u���ʃ^�u��
     �T���������Ȃ��悤�A�^�u���Ƃɕۑ���𕪂���BsessionStorage ��ID��
     �����^�u�̍ēǍ��ł͎c��̂ŁA�ʐM�f��̕�������ς��Ȃ��B */
  function tabId(){
    const k = KEY + "/pending-tab";
    try{
      let id = sessionStorage.getItem(k);
      if(!id){
        id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        sessionStorage.setItem(k, id);
      }
      return id;
    }catch(e){ return "fallback"; }
  }
  const TAB = tabId();
  const PEND = KEY + "/pending/" + TAB;
  const HELD = KEY + "/conflicts/" + TAB;
  const LEGACY_PEND = KEY + "/pending";
  const LEGACY_HELD = KEY + "/conflicts";
  let pendT = 0;

  /* 1.33.1 �܂ł̋��ʃL�[�Ɏc�����T���́A�ŏ��ɊJ�����^�u�ֈ�x�����ڂ��B
     �V�����^�u���m�ł́A�e���̃L�[�ȊO��ǂ܂Ȃ��B */
  function savedList(key, legacy){
    let list = null;
    try{ list = JSON.parse(localStorage.getItem(key) || "null"); }catch(e){}
    if(Array.isArray(list) && list.length) return list;
    try{ list = JSON.parse(localStorage.getItem(legacy) || "null"); }catch(e){}
    if(!Array.isArray(list) || !list.length) return [];
    try{ localStorage.setItem(key, JSON.stringify(list)); localStorage.removeItem(legacy); }catch(e){}
    return list;
  }

  /* �T���ɏ������g�B**�܂������Ă��Ȃ��Ԃ�ƁA�����Ă���r���̂Ԃ�̗����B**
     �����R�}�������ɂ���΁A���܉�ʂ������Ă���ق��idirty�j���������B */
  function pendingNow(){
    const seen = {}, out = [];
    for(const k in dirty){
      const q = patchOf(dirty[k]);
      seen[[q.layer, q.target, q.date, q.slot].join("|")] = 1;
      out.push(q);
    }
    for(const id in inflight)
      for(const q of inflight[id])
        if(!seen[[q.layer, q.target, q.date, q.slot].join("|")]) out.push(q);
    return out;
  }
  function persistPending(){
    if(!onGas) return;
    try{
      const list = pendingNow();
      if(held.length) localStorage.setItem(HELD, JSON.stringify(held));
      else localStorage.removeItem(HELD);
      if(list.length) localStorage.setItem(PEND, JSON.stringify(list));
      else localStorage.removeItem(PEND);
    }catch(e){}                 /* �T�����Ȃ��Ă��A���܂̕ۑ��͎~�߂Ȃ� */
  }
  const persistSoon = () => { clearTimeout(pendT); pendT = setTimeout(persistPending, 900); };

  /* �O�ɕ����Ƃ��̎����z���𑗂�B**�T��ǂݒ����O�ɑ���B**
     ���Ƃ��瑗��ƁA�ǂݒ����ŏ��������g�𑗂邱�ƂɂȂ�B */
  function sendPending(after){
    if(!onGas) return after();
    const list = savedList(PEND, LEGACY_PEND);
    if(!list || !list.length) return after();
    const byYear = {};
    for(const q of list){
      const loc = locOf(q.date);
      if(!loc) continue;
      (byYear[loc.year] || (byYear[loc.year] = [])).push(q);
    }
    let left = Object.keys(byYear).length;
    if(!left) return after();
    /* **����Ȃ������Ԃ�͎̂ĂȂ��B** �O�͂����ōT���������Ă����B
       ���������ƂɏT��ǂݒ����̂ŁA���钼�O�ɏ������R�}���A
       �����̒ʐM1��̂܂�����**�i�v�ɏ����Ă���**�B�T�����v��̂�
       �܂��ɂ��̎��̂̂��߂Ȃ̂ŁA���ꂽ���̂������T������O���B */
    const leftOver = [];
    const done = () => {
      if(--left) return;
      try{
        if(leftOver.length) localStorage.setItem(PEND, JSON.stringify(leftOver));
        else localStorage.removeItem(PEND);
        if(held.length) localStorage.setItem(HELD, JSON.stringify(held));
      }catch(e){}
      after();
    };
    for(const y in byYear)
      (function(y, list){
        google.script.run
          /* �����z��������������i���Ă��邠�����ɒN�����������j�B
             **�����Ŗق��Ď̂Ă�ƁA����O�ɏ������Ԃ񂪏�����B** */
          .withSuccessHandler(res => {
            const sent = {};
            for(const q of list) sent[cfKey(q)] = q;
            takeConflicts(res && res.conflicts, sent);
            done();
          })
          .withFailureHandler(() => {
            /* �T���Ɏc�������łȂ��A���܂̑���҂��ɂ��ςށB
               ���Ɂu�ۑ��v���������Ƃ��ɁA������ꏏ�ɏo�Ă��� */
            for(const q of list){
              leftOver.push(q);
              const d = String(q.date).split("-");
              const mon = iso(mondayOf(new Date(+d[0], +d[1] - 1, +d[2])));
              const dd = Math.round((parseISO(q.date) - parseISO(mon)) / 86400000);
              const k = [q.layer, q.target || "", y, mon, dd, q.slot].join("|");
              if(!dirty[k]){
                dirty[k] = {layer:q.layer, target:q.target || "", year:+y,
                            monday:mon, d:dd, slot:q.slot,
                            baseAt: +q.expectedAt || 0};
                dirtyN++;
              }
            }
            onDirty(unsaved(), lastErr);
            notify("<b>�O�ɕ����Ƃ��̂Ԃ�𑗂�Ȃ�����</b>�i" + list.length
                 + " �R�}�j�B������x�u�ۑ��v������");
            done();
          })
          .apiWriteCells(+y, list);
      })(y, byYear[y]);
  }

  /* **�܂��V�[�g�ɓ����Ă��Ȃ��R�}�̐��B** �����Ă���r���̂Ԃ��������B
     �����Ȃ��ƁA����������Ɂu�ۑ����݁v�Əo�Ă��܂��A
     �����ŕ����l�͓������Ǝv���Ă��܂��B */
  const unsaved = () => {
    let n = dirtyN + held.length;
    for(const id in inflight) n += inflight[id].length;
    return n;
  };
  const setDirtyWatcher = fn => { onDirty = fn; fn(unsaved(), lastErr); };
  const setConflictWatcher = fn => { onConflict = fn; };

  /* �T�[�o���ł��������Ŏ茳�̍T���𒼂��B
     ���t���ꂼ��� PC �̎��v�ŏ������������߂�ƁA���v���i��ł���l�� always ���B */
  function applyServerTimes(at){
    if(!at) return;
    for(const k in at){
      const p = k.split("|");            /* ���t|����|�w|�Ώ� */
      for(const m of Object.values(dirty)){
        const q = patchOf(m);
        if(cfKey(q) === k) m.baseAt = at[k];
      }
      const loc = locOf(p[0]);
      const w = loc && ((db.years[String(loc.year)] || {}).weeks || {})[loc.monday];
      if(!w) continue;
      const key = ck(loc.d, p[1]);
      const bank = p[2] === "school" ? w.school
                 : p[2] === "grade"  ? w.grade[p[3]]
                 : p[2] === "special"? w.special[p[3]]
                 : w.home[p[3]];
      /* **�T�[�o���ł��������B** ���ɂ��̃R�}�𒼂��Ƃ��̕������ɂȂ� */
      if(bank && bank[key]){ bank[key].at = at[k]; bank[key].sat = at[k]; }
    }
  }

  /* ���� �ǂݍ��� ����������������������������������������������������������������
     �茳�ł͉������Ȃ��idb �����̂܂ܐ��{�j�B
     �{�Ԃł́A���̔N�x�ƏT���V�[�g��������ă������ɍڂ���B */

  /* �����オ��B**�ݒ�ƁA���܂̔N�x�̂Ԃ��1��ł��炤�B**
     �ʁX�Ɏ��ɍs���ƁA�������o��܂łɂ��̉񐔂����҂��ƂɂȂ�B */
  let booted = false;
  const waiters = [];
  /* �����オ��ł�������A**�����ƒu���ꏊ�̂���**�B�Ǘ���ʂɏo���B
     �茳�ŊJ���Ă���Ƃ��͋�̂܂܁i�T�[�o�ɕ����Ă��Ȃ��̂ŕ�����Ȃ��j�B */
  /* isAdmin ��**��ʂ��B�����߂���**�B�֖�̓T�[�o�� checkAdmin �����B
     �茳�iGAS�łȂ��j�ł͉B���Ȃ� ���� �G�����̂������ƁA�����Ă��邩�m���߂��Ȃ� */
  let bootInfo = {me:"", file:"", archived:{}, isAdmin:!onGas};

  /* **�ۑ��ɂ����������Ԃ��A�ŋ߂̂Ԃ񂾂��o����B**
     �����Ȃ��Ă������ƂɁA�N��������O�ɋC�Â����߁B
     ���ߍ��܂Ȃ��i�傫�Ȋč����O�͍��Ȃ��B���΍�����ŒN�����Ȃ��j�B */
  const TIMES = 20;
  const times = [];
  function noteTime(res, roundMs){
    if(!res) return;
    times.push({ms: +res.ms || 0, wait: +res.waitMs || 0, round: roundMs,
                cells: +res.count || 0, sheets: +res.sheets || 0});
    while(times.length > TIMES) times.shift();
  }
  /* �x���ق����猩��B**���ς́A���܂ɏo��x�����B���B**
     ����̂́u���܂�10�b�҂������v�ق��ŁA���ς��������Ƃł͂Ȃ��B */
  function saveTimes(){
    if(!times.length) return null;
    const pick = f => times.map(f).sort((a, b) => a - b);
    const worst = a => a[a.length - 1];
    return {n: times.length,
            ms: worst(pick(x => x.ms)), wait: worst(pick(x => x.wait)),
            round: worst(pick(x => x.round)),
            cells: worst(pick(x => x.cells)), sheets: worst(pick(x => x.sheets))};
  }
  const info = () => ({me: bootInfo.me, file: bootInfo.file, gas: !!onGas,
                      isAdmin: !!bootInfo.isAdmin,
                      archived: bootInfo.archived || {}, times: saveTimes()});
  /* ���̔N�x�͑ޔ����݂��B**�ޔ����݂̔N�x�ɁA�������킸�Ɏ����o���Ȃ��B**
     �T�Ă̍s�͂����{�̂ɖ����̂ŁA��{���Ԋ������̎����o��B
     �����ق��ďo���Ɓu�T�Ă��S���������v�ƌ�����B */
  const archivedYear = y => (bootInfo.archived || {})[String(y)] || null;
  function boot(after){
    if(!onGas){ booted = true; return after(); }
    held = savedList(HELD, LEGACY_HELD);
    if(held.length){ onConflict(held.slice()); onDirty(unsaved(), lastErr); }
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      booted = true;
      after();
      while(waiters.length) waiters.shift()();
    };
    /* google.script.run �͉���f�Ő����E���s�̂ǂ�����Ԃ�Ȃ����Ƃ�����B
       �����ƏT�ړ����i�v�ɑ҂������A�[���̍T���ŊJ�����Ԃ֖߂��B */
    const timer = setTimeout(() => {
      notify("�ŏ��̓ǂݍ��݂Ɏ��Ԃ��������Ă���B<b>�[���̍T���ŊJ����</b>�B������m���߂čēǂݍ��݂��Ă�������");
      finish();
    }, 15000);
    google.script.run
      .withSuccessHandler(b => {
        bootInfo = {me: b.me || "", file: b.file || "", archived: b.archived || {},
                    isAdmin: !!b.isAdmin};
        if(b.slots    && b.slots.length)    setSlots(b.slots);
        if(b.subjects && b.subjects.length) setSubjects(b.subjects);
        if(b.config)  applyConfig(b.config);
        if(b.year) applyYear(String(b.year), b);
        /* **�T��ǂݒ����O�ɁA�����z���𑗂�B** */
        sendPending(() => {
          finish();
        });
      })
      .withFailureHandler(e => {
        notify("�J���Ȃ������i" + escText(String(e && e.message)) + "�j");
        finish();                   /* �J���Ȃ��Ă��~�߂Ȃ��B�茳�̍T���ő����� */
      })
      .apiBoot(fy());
  }
  const whenBooted = fn => booted ? fn() : waiters.push(fn);

  const loadedYear = {}, loadedWeek = {};
  /* **��x�ǂ񂾂��x�Ɠǂݒ����Ȃ��A����߂�B**
     30�l�������T��G��^�p�Ȃ̂ɁA�^�u���J�����܂܂̒S�C�ɂ�
     ���̓��ق��̒N���������Ă��f��Ȃ������B�u���ɊJ�����Ƃ��ɒm�点��v
     �idocs/spec.md 3�߁j��"�J�����Ƃ�"���A���ۂɂ͍ēǂݍ��݂������������B

     �ǂ񂾎������o���Ă����A�Â��Ȃ��Ă������ʂ��J���Ƃ��ɓǂݒ����B
     �����ɓǂݒ����̂ł͂Ȃ��Ԃ�u���̂́A�N���X�𑱂��Č���Ƃ���
     1�����������Ȃ����߁B */
  const FRESH_MS = 60000;          /* ������Â��T���́A�J���Ƃ��ɓǂݒ��� */
  const WATCH_MS = 180000;         /* �J�����ςȂ��̉�ʂ��A���ꂲ�ƂɌ��ɍs�� */
  const fresh_ = tag => (loadedWeek[tag] || 0) > Date.now() - FRESH_MS;

  function applyYear(y, r){
    if(String(y) !== String(fy())) return;  /* ���܊J���Ă���N�x�̂Ԃ񂾂� */
    const Yr = Y();
    if(r.roster){
      if(r.roster.classes && Object.keys(r.roster.classes).length) Yr.classes = r.roster.classes;
      if(r.roster.specials && r.roster.specials.length)            Yr.specials = r.roster.specials;
      if(r.roster.week1) Yr.week1 = r.roster.week1;
      /* ��������̂����i�S���O�����N�x������j�B�L���ł͂Ȃ��A�Ԃ��Ă������Ō��� */
      if(r.roster.tanpopo !== undefined && r.roster.tanpopo !== null)
        Yr.tanpopo = tpNorm_(r.roster.tanpopo);
    }
    Yr.base = r.base || {};
    /* �N�ԍs���B**��������̂���**�i�܂��\���Ă��Ȃ��N�x������j */
    if(r.events !== undefined && r.events !== null) Yr.events = r.events;
    /* **�ǂ߂Ȃ������s�͖ق��Ď̂ĂȂ��B** �����Ă��Ȃ��̂��ǂ߂Ă��Ȃ��̂���
       ������Ȃ��ƁA�V�[�g�����Ȃ��牽�x�������������ƂɂȂ� */
    if(r.warn && r.warn.length)
      notify("<b>��{���Ԋ��V�[�g�ɓǂ߂Ȃ��s������</b>�i" + r.warn.length + "�s�j�F<br>"
           + r.warn.slice(0, 3).map(escText).join("<br>")
           + (r.warn.length > 3 ? "<br>�ق� " + (r.warn.length - 3) + "�s" : ""));
    loadedYear[y] = true;
  }

  function ensureYear(after){
    if(!onGas) return after();
    const y = String(fy());
    Y();                                   /* ���̔N�x�̓��ꕨ��p�ӂ��Ă��� */
    if(loadedYear[y]) return after();
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      after();
    };
    const timer = setTimeout(() => {
      notify("�N�x�̐ݒ�̓ǂݍ��݂Ɏ��Ԃ��������Ă���B�[���̍T���ő�����");
      finish();
    }, 15000);
    google.script.run
      .withSuccessHandler(r => {
        /* ����ۂی𗬋��͋�������̂����i�S���O�����N�x������j�B
           �L���ł͂Ȃ��A�z�񂪕Ԃ��Ă������ǂ����Ō���iapplyYear �̒��j */
        applyYear(y, r);
        finish();
      })
      /* **�ǂ߂Ȃ��Ă���֐i�ށB** �i�܂Ȃ��ƁA�J��������̉�ʂ��o�Ȃ��܂�
         �O�̉�ʂ��c��A�ǂ������Ă���̂�������Ȃ��Ȃ�B
         ���g�͎茳�̍T���̂܂܁B�ǂ߂Ȃ��������Ƃ͑тŌ����B */
      .withFailureHandler(e => {
        notify("�N�x�̐ݒ��ǂ߂Ȃ������i" + escText(String(e && e.message)) + "�j");
        finish();
      })
      .apiReadYear(+y);
  }

  /* **���̉�ʂɗv��V�[�g������ǂށB**
     �T�Ă̓N���X���Ƃ�1������̂ŁA�S���ǂނ�27���Ԃ�҂��ƂɂȂ�B
     3-3 ���J���Ȃ�u�T�� 3-3�v�u�T�� 3�N�v�u�T�� �S�Z�v��3���ő����B */
  function ensureWeek(after){
    if(!onGas) return after();
    const want = targetsForView().filter(t => !fresh_(weekTag(t)));
    if(!want.length) return after();
    /* **�ǂ̔N�x�E�ǂ̏T�ɗ��񂾂̂����o���Ă����B**
       �Ԏ������邱��ɂ́A�����ʂ̏T�����Ă��邩������Ȃ��B
       ���܌��Ă���T�֓���Ă��܂��ƁA���̏T�̒��g��������B
       �Z���̉���ł͕Ԏ��̏���������ւ��i�Â��T�̕Ԏ������Ƃ���͂��j�B */
    const year = fy(), mon = wkKey(), epoch = editEpoch;
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      after();
    };
    const timer = setTimeout(() => {
      notify("���̏T�̓ǂݍ��݂Ɏ��Ԃ��������Ă���B<b>�[���̍T���ŊJ����</b>");
      finish();
    }, 15000);
    google.script.run
      .withSuccessHandler(w => {
        mergeWeek(want, w, year, mon, epoch);
        finish();
      })
      .withFailureHandler(e => {
        notify("���̏T��ǂ߂Ȃ������i" + escText(String(e && e.message))
             + "�j�B<b>���̏T�͂܂������Ȃ�</b>");
        finish();
      })
      .apiReadWeek(year, mon, want);
  }
  /* **�������̏T���A�܂Ƃ߂ēǂށB** ���̖ʂ�4�T�Ԃ����x�ɏo���B
     1�T���J���ēǂ܂���ƁA4��҂��ƂɂȂ�B
     ���܌��Ă����ʂɗv��Ώۂ����ǂށi27���͓ǂ܂Ȃ��j�B */
  function readWeeks(mons, after){
    if(!onGas) return after();
    const want = targetsForView();
    const year = fy(), epoch = editEpoch;
    const todo = (mons || []).filter(m => want.some(t => !fresh_(weekTag(t, year, m))));
    if(!todo.length || !want.length) return after();
    /* **��x�ɓ����鐔��}����B** �J�����_�[�̖ʂ͔N�x�͂��߂���̗݌v���o���̂ŁA
       3���ɂ� 45 �T�Ԃ�ɂȂ�B45 �{�𓯎��ɓ������ GAS ���ŋl�܂�A
       �ǂ���Ԃ�Ȃ��܂ܑ҂��̕\�����c��B */
    let left = todo.length, next = 0;
    const done = () => { if(--left <= 0) after(); else fire(); };
    function fire(){
      if(next >= todo.length) return;
      const m = todo[next++];
      google.script.run
        .withSuccessHandler(w => { mergeWeek(want, w, year, m, epoch); done(); })
        /* **�ǂ߂Ȃ��Ă���֐i�ށB** �i�܂Ȃ��ƁA�J��������̖ʂ��o�Ȃ� */
        .withFailureHandler(() => done())
        .apiReadWeek(year, m, want);
    }
    for(let i = 0; i < AT_ONCE && i < todo.length; i++) fire();
  }
  const AT_ONCE = 8;
  /* **�S�N���X�Ԃ�̏T��ǂށB** �����W�v��27�N���X�S���𐔂���̂ŁA
     ���܊J���Ă���ʁi3���j�����ł͑���Ȃ��B
     �����W�v�̃{�^�����炵���Ă΂Ȃ� ���� �ӂ���̉�ʂł͓ǂ݂����ɂȂ�B */
  function readWeeksAll(mons, after){
    if(!onGas) return after();
    const want = allTargets();
    const year = fy(), epoch = editEpoch;
    const todo = (mons || []).filter(m => want.some(t => !fresh_(weekTag(t, year, m))));
    if(!todo.length) return after();
    let left = todo.length, next = 0;
    const done = () => { if(--left <= 0) after(); else fire(); };
    function fire(){
      if(next >= todo.length) return;
      const m = todo[next++];
      google.script.run
        .withSuccessHandler(w => { mergeWeek(want, w, year, m, epoch); done(); })
        .withFailureHandler(() => done())
        .apiReadWeek(year, m, want);
    }
    for(let i = 0; i < AT_ONCE && i < todo.length; i++) fire();
  }

  /* �n�������j�̂����A**�܂��ǂ�ł��Ȃ��T�̐�**�B
     �����̏W�v�́A�ǂ߂Ă��Ȃ��T���u��{���Ԋ��ǂ���v�Ƃ��Đ�����̂ŁA
     �o���Ă��鐔���ǂꂾ�������݂Ȃ̂����A��ʂŌ�����悤�ɂ���B */
  function unread(mons, year){
    if(!onGas) return 0;
    const want = targetsForView(), y = year === undefined ? fy() : year;
    if(!want.length) return 0;
    return (mons || []).filter(m => want.some(t => !fresh_(weekTag(t, y, m)))).length;
  }
  const weekTag = (t, year, mon) =>
    (year === undefined ? fy() : year) + "/" + (mon === undefined ? wkKey() : mon)
    + "/" + t.layer + "/" + (t.target || "");

  /* �܂������Ă��Ȃ��R�}������Ώۂ́A�ǂݒ����ŏ㏑�����Ȃ��B
     **�㏑������ƁA�������̂ɏ������悤�Ɍ�����B** */
  function hasPending(layer, target, year, mon){
    const matches = m => m.layer === layer && m.target === (target || "")
      || layer === "home" && m.layer === "special" && m.target === target;
    for(const k in dirty){
      const m = dirty[k];
      if(String(m.year) === String(year) && m.monday === mon && matches(m)) return true;
    }
    for(const batch of Object.values(inflight)) for(const q of batch){
      const loc = locOf(q.date);
      if(loc && String(loc.year) === String(year) && loc.monday === mon && matches(q)) return true;
    }
    return false;
  }

  /* **���̃N���X��҂����Ȃ��B** 1�J�������ƁA�肪�󂢂Ă��邤����
     ���̏T�̎c���ǂ�ł����B�J�����т�1�����҂̂́A
     3�N���X���邾����3��҂Ƃ������ƁB */
  let preT = 0;
  function prefetchWeek(){
    if(!onGas) return;
    clearTimeout(preT);
    preT = setTimeout(() => {
      /* ��ǂ݂�**��x���ǂ�ł��Ȃ�����**�����B�Â��Ȃ��������̂��̂܂�
         ��ǂ݂���ƁA�J���Ă����Ȃ��N���X�̂��߂ɖ����ǂ݂ɍs�����ƂɂȂ� */
      const want = allTargets().filter(t => !loadedWeek[weekTag(t)]);
      if(!want.length || sending) return;
      const year = fy(), mon = wkKey(), epoch = editEpoch;
      google.script.run
        .withSuccessHandler(w => mergeWeek(want, w, year, mon, epoch))
        .withFailureHandler(() => {})     /* ��ǂ݂����s���Ă��A�J���Ƃ��ɓǂݒ��� */
        .apiReadWeek(year, mon, want);
    }, 1200);
  }
  function allTargets(){
    const out = [{layer:"school", target:""}];
    for(const g of grades()) out.push({layer:"grade", target:g});
    for(const c of allClasses()) out.push({layer:"home", target:c});
    return out;
  }

  /* year/mon �́u���񂾂Ƃ��̔N�x�ƏT�v�B�n����Ȃ���΁A���܂̔N�x�ƏT�B
     **���񂾐�̏T�֓����B** ���܌��Ă���T�֓����ƁA
     �Ԏ����x�ꂽ�Ԃ񂾂��ʂ̏T�̒��g��������B */
  function mergeWeek(want, w, year, mon, epoch){
    if(epoch !== undefined && epoch !== editEpoch) return;
    dataTick++;                      /* ���������̂̎��u�����Â����� */
    const y = (year === undefined) ? fy() : year;
    const m = (mon  === undefined) ? wkKey() : mon;
    const Yr = db.years[String(y)];
    if(!Yr || !Yr.weeks) return;      /* ���̔N�x���������� */
    const cur = Yr.weeks[m] || (Yr.weeks[m] =
      {school:{}, grade:{}, special:{}, home:{}, acked:[], variant:"A"});
    /* �T�[�o���痈���R�}�ɂ́A**���̎������u�m���Ă��������v�Ƃ��čT����**�B
       ���ɂ��̃R�}�𒼂��Ƃ��A����� expectedAt �Ƃ��đ���B
       �T�[�o�� sat�i�X�V�����������s�� -1�j��t���ĕԂ��B�t���Ă��Ȃ��̂�
       �Â��ł̃T�[�o�Ȃ̂ŁA���̂Ƃ����� at �őウ��B */
    const stamp = bank => {
      for(const k in (bank || {}))
        if(bank[k].sat === undefined) bank[k].sat = bank[k].at || 0;
      return bank || {};
    };
    for(const t of want){
      /* �܂������Ă��Ȃ��R�}������Ώۂ͐G��Ȃ� */
      if(hasPending(t.layer, t.target, y, m)) continue;
      if(t.layer === "school")     cur.school = stamp(w.school);
      else if(t.layer === "grade") cur.grade[t.target]  = stamp((w.grade || {})[t.target]);
      else {
        cur.home[t.target]    = stamp((w.home    || {})[t.target]);
        cur.special[t.target] = stamp((w.special || {})[t.target]);
      }
      loadedWeek[weekTag(t, y, m)] = Date.now();
    }
    /* **��o�̈�́A�Ώۂɂ�����炸�ڂ��ւ���B**
       �T���Ƃ̎������̂ŁA�ǂ̃N���X��ǂ񂾂��Ƃ͊֌W���Ȃ� */
    if(w && w.submits){
      for(const c of Object.keys(w.submits)){
        if(hasPending('home', c, y, m) || hasPending('grade', gradeOf(c), y, m)
           || hasPending('school', '', y, m)) w.submits[c].dirty = true;
        if(!w.submits[c].dirty && cur.tpEdited) delete cur.tpEdited[c];
      }
      cur.tpSub = w.submits;
      if(typeof paintTpSub === 'function') paintTpSub();
    }
  }
  /* **�J�����ςȂ��̉�ʂ��A���܂ɓǂݒ����B**
     �ؗj�̗[����30�l�������T��G��^�p�ŁA�J�����܂ܒu���Ă���S�C��
     �ق��̐l�̏������݂�1���f��Ȃ��̂������΂񍢂�B

     ���Ă��Ȃ��^�u�ł͓ǂ܂Ȃ��i�d�r�Ɖ�����g��Ȃ��j�B
     �܂������Ă��Ȃ��R�}������Ώۂ́A�ǂݒ����Ă��G��Ȃ��ihasPending�j�B */
  let watchT = 0;
  function watch(){
    clearInterval(watchT);
    if(!onGas) return;
    watchT = setInterval(() => {
      if(document.hidden || sending) return;
      if(typeof view === "undefined" || view.kind === "gate") return;
      ensureWeek(() => {
        if(view.kind === 'tanpopo') drawTanpopoView();
        else if(typeof paintSheet === "function") paintSheet();
      });
    }, WATCH_MS);
  }
  /* ���܊J���Ă����ʂ̍T�����u�Â��v���Ƃɂ���B���ɓǂނƂ��ɓǂݒ����B
     **�^�u�֖߂��Ă����l�������΂�Â����̂����Ă���**�̂ŁA�����ŕK��1��ǂށB */
  function stale(){
    for(const t of targetsForView()) delete loadedWeek[weekTag(t)];
  }
  addEventListener("visibilitychange", () => {
    if(document.hidden || !onGas || !booted) return;
    if(typeof view === "undefined" || view.kind === "gate" || view.kind === "tanpopo") return;
    stale();
    ensureWeek(() => { if(typeof paintSheet === "function") paintSheet(); });
  });

  /* �T��N�x���J���Ƃ��̓����B�茳�ł͑����̏�ő����B
     �����オ���1�񂪂܂��Ԃ��Ă��Ȃ���΁A�����҂��Ă���ǂ�
     �i�҂��Ȃ��ƁA�V�[�g�̎�����m��Ȃ��܂܎���g��ł��܂��j�B */
  const ready = after => whenBooted(() => ensureYear(() => ensureWeek(after)));
  const readyYear = after => whenBooted(() => ensureYear(after));

  /* ���� �ݒ�̏������� ������������������������������������������������������ */

  function saveRoster(){
    if(!onGas) return save();
    const Yr = Y();
    google.script.run
      .withFailureHandler(e => notify("�w���Ґ���ۑ��ł��Ȃ������i" + escText(String(e && e.message)) + "�j"))
      .apiWriteRoster(fy(), Yr.classes, Yr.specials, Yr.week1, Yr.tanpopo || {});
  }
  /* ���Ȃ̕\�����B**�N���X��N�x�ɕR�Â��Ȃ�**�i�w�Z��1�j�̂ŔN�x�𑗂�Ȃ��B
     �茳�ł͑���悪�����̂ŁA�T�����������čςɂ��� */
  function saveSubjects(rows, then){
    if(!onGas){ save(); if(then) then(true); return; }
    google.script.run
      .withSuccessHandler(r => {
        if(r && r.subjects && r.subjects.length) setSubjects(r.subjects);
        if(then) then(true);
      })
      .withFailureHandler(e => {
        notify("���Ȃ̕\������ۑ��ł��Ȃ������i" + escText(String(e && e.message)) + "�j");
        if(then) then(false);
      })
      .apiWriteSubjects(rows);
  }
  function saveBase(cls, variant){
    if(!onGas) return save();
    google.script.run
      .withFailureHandler(e => notify("��{���Ԋ���ۑ��ł��Ȃ������i" + escText(String(e && e.message)) + "�j"))
      .apiWriteBase(fy(), cls, variant, ((Y().base[cls] || {})[variant]) || {});
  }

  /* �Œ莞�Ԋ��̎�荞�݁B**20�N���X�~A�TB�T��1��ő���B**
     1�N���X������ƁA�r���Ő؂ꂽ�Ƃ��ɔ��������������\���c��B */
  function saveBaseAll(list, after){
    if(!onGas){ save(); return after && after(); }
    const table = {}, B = Y().base;
    for(const c of list) if(B[c]) table[c] = {A:B[c].A || {}, B:B[c].B || {}};
    google.script.run
      .withSuccessHandler(r => after && after(r))
      .withFailureHandler(e => notify("��{���Ԋ���ۑ��ł��Ȃ������i" + (e && e.message) + "�j"))
      .apiWriteBaseAll(fy(), table);
  }

  /* �N�x�̑ޔ��B**������^�ƍ�����^���� ��3�ɕ����Ă���B**
     1�ɂ܂Ƃ߂�ƁA�m���߂��ɏ����Ă��܂��B */
  function archiveCount(year, ok, ng){
    if(!onGas) return ng("�茳�ł̓V�[�g�ɂȂ����Ă��Ȃ��̂ŁA�ޔ��ł��Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("�������Ȃ������i" + (e && e.message) + "�j"))
      .apiArchiveCount(+year);
  }
  function archiveVerify(year, url, ok, ng){
    if(!onGas) return ng("�茳�ł̓V�[�g�ɂȂ����Ă��Ȃ��̂ŁA�ƍ��ł��Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("�ƍ��ł��Ȃ������i" + (e && e.message) + "�j"))
      .apiArchiveVerify(+year, url);
  }
  function archivePurge(year, url, typed, ok, ng){
    if(!onGas) return ng("�茳�ł̓V�[�g�ɂȂ����Ă��Ȃ��̂ŁA�����Ȃ�");
    google.script.run
      .withSuccessHandler(r => {
        /* ��������A���̔N�x�͑ޔ����݂ɂȂ�B**��ʂɂ������f��** */
        (bootInfo.archived || (bootInfo.archived = {}))[String(year)] =
          {url:r.url, at:r.at, by:r.by};
        ok(r);
      })
      .withFailureHandler(e => ng(String((e && e.message) || "�����Ȃ�����")))
      .apiArchivePurge(+year, url, typed);
  }

  /* �N�x�̌����B**4���ɊJ�����Ƃ��A��������Ȃ�����1��ʂŌ����B**
     �茳�ł͌����Ȃ��i�V�[�g��ǂ܂Ȃ���΁A����Ȃ����̂�������Ȃ��j�B */
  function checkYear(ok, ng){
    if(!onGas) return ng("�茳�ł̓V�[�g�ɂȂ����Ă��Ȃ��̂ŁA�����ł��Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("�����ł��Ȃ������i" + (e && e.message) + "�j"))
      .apiCheckYear(fy());
  }

  /* �\��t���p�V�[�g���A���̂܂܂̌`�œǂށB�茳�ł͎g���Ȃ� */
  function readPaste(ok, ng){
    if(!onGas) return ng("�茳�ł́A�V�[�g�̑���ɓ\��t�������g��");
    google.script.run
      .withSuccessHandler(g => ok(g || []))
      .withFailureHandler(e => ng("�V�[�g��ǂ߂Ȃ������i" + (e && e.message) + "�j"))
      .apiReadPaste();
  }

  /* ����ۂێ��Ԋ��ցA**1�T�Ԃ��1���̃V�[�g�Ƃ��ďo��**�B
     �ǂ̃N���X�̂ǂ̍Z�������������߂�͉̂�ʁi�w�̏d�˕���m���Ă���j�B
     �ǂ�Ȍ`�̃V�[�g����邩�����߂�̂̓V�[�g���i�����̌`��m���Ă���j�B
     cols = [{cls, group}] �̕��сB**���тƑg��������Ō��߂ēn���B** */
  /* �����W�v�V�[�g�֒u���B**�������͉̂�ʂ̂ق�**�i������1�����̂܂܁j�B
     �茳�����Ŏg���Ă���Ƃ��͒u���悪�����̂ŁA���̂܂܍ςɂ���B */
  function saveTally(year, head, rows, then){
    if(!onGas) return then && then({name:"�i�茳�j", rows:rows.length, kept:0});
    google.script.run
      .withSuccessHandler(r => then && then(r))
      .withFailureHandler(e => {
        notify("�����W�v�������Ȃ������i" + escText(String(e && e.message)) + "�j");
        then && then(null);
      })
      .apiWriteTally(year, head, rows);
  }

  function exportWeek(titles, cols, slots, name, url, ok, ng){
    if(!onGas) return ng("�茳�ł͂���ۂێ��Ԋ��ɂȂ����Ă��Ȃ�");
    const w = week(), year = fy(), mon = wkKey();
    google.script.run
      .withSuccessHandler(r => { if(r.submits) w.tpSub = r.submits; save(); ok(r); })
      .withFailureHandler(e => ng(String((e && e.message) || "�������߂Ȃ�����")))
      .apiExportWeek(year, mon, titles, cols, slots, name, url || "", w.tpSub || {});
  }

  /* ���� ����ۂۂւ̒�o ������������������������������������������������
     **�S�C���u���T�Ԃ�͏����I�����v�ƌ�������B** �T���Ƃɗ��Ē����B
     �茳�ł́A���̒[���̒������Ɏ��i�V�[�g�ɂȂ��ł��Ȃ��j�B */
  function tpSubmit(cls, on, ok, ng){
    const w = week();
    const seq = (w.tpEditSeq || {})[cls] || 0;
    if(!onGas){
      if(!w.tpSub) w.tpSub = {};
      if(on) w.tpSub[cls] = {at:String(Date.now()), by:"�i�茳�j", dirty:false, exports:(w.tpSub[cls] || {}).exports || {}};
      else delete w.tpSub[cls];
      if(w.tpEdited) delete w.tpEdited[cls];
      save();
      return ok(w.tpSub);
    }
    google.script.run
      .withSuccessHandler(r => {
        w.tpSub = r || {};
        if(seq === ((w.tpEditSeq || {})[cls] || 0)){
          if(w.tpEdited) delete w.tpEdited[cls];
        }else if(w.tpSub[cls]) w.tpSub[cls].dirty = true;
        save();
        ok(w.tpSub);
      })
      .withFailureHandler(e => ng(String((e && e.message) || "���Ă��Ȃ�����")))
      .apiTpSubmit(fy(), wkKey(), cls, !!on);
  }

  /* ���� ����ۂۂ̏o���� ������������������������������������������������
     **1�{�Ƃ͂�����Ȃ��B** �茳�ł͐ݒ�������Ȃ��̂ŁA��ŕԂ�
     �i��ʂ́u�茳�ł͏o��������ĂȂ��v�Əo���j�B */
  function tpTargets(ok, ng){
    if(!onGas) return ok([]);
    google.script.run
      .withSuccessHandler(r => ok(r || []))
      .withFailureHandler(e => ng("�o�����ǂ߂Ȃ������i" + (e && e.message) + "�j"))
      .apiTpTargets();
  }
  function saveTpTargets(list, ok, ng){
    if(!onGas) return ng("�茳�ł͏o��������ĂȂ��i�V�[�g�ɂȂ��ł��Ȃ��j");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "�����Ȃ�����")))
      .apiWriteTpTargets(list);
  }
  function testTpTarget(url, ok, ng){
    if(!onGas) return ng("�茳�ł͎����Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "�����Ȃ�����")))
      .apiTestTpTarget(url);
  }

  /* ���� �V�N�x�̐ݒ� ��������������������������������������������������������
     �菇�ƁA���܂ǂ��܂ōς�ł��邩�B**�V�[�g�����Ȃ��ƕ�����Ȃ��B** */
  function yearSetup(ok, ng){
    if(!onGas) return ng("�茳�ł͕�����Ȃ��i�V�[�g�����Ȃ��Ɣ���ł��Ȃ��j");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng("�ǂ߂Ȃ������i" + (e && e.message) + "�j"))
      .apiYearSetup(fy());
  }
  function tickYearSetup(key, on, ok, ng){
    if(!onGas) return ng("�茳�ł͋L�^�ł��Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "�L�^�ł��Ȃ�����")))
      .apiTickYearSetup(fy(), key, !!on);
  }
  function setupPlanSheets(ok, ng){
    if(!onGas) return ng("�茳�ł̓V�[�g�����Ȃ�");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "���Ȃ�����")))
      .apiSetupPlanSheets(fy());
  }
  /* A�T�̋N�_�̌��j�B**�ݒ�V�[�g�̂���1�s��������ʂ��璼���B** */
  function saveVariantOrigin(monday, ok, ng){
    if(!onGas){ db.settings.abAnchor = monday; save(); return ok({saved: monday}); }
    google.script.run
      .withSuccessHandler(r => { db.settings.abAnchor = monday; save(); ok(r); })
      .withFailureHandler(e => ng(String((e && e.message) || "�����Ȃ�����")))
      .apiWriteVariantOrigin(monday);
  }
  /* �N�ԍs���v��\��\��ւ���Brows �͌��o�����܂ޓ񎟌��z�� */
  function saveEvents(rows, ok, ng){
    if(!onGas) return ng("�茳�ł͓\��ւ����Ȃ��i�V�[�g�ɂȂ��ł��Ȃ��j");
    google.script.run
      .withSuccessHandler(r => ok(r))
      .withFailureHandler(e => ng(String((e && e.message) || "�\��ւ����Ȃ�����")))
      .apiWriteEvents(rows);
  }
  /* �T�Ă����L�p�̐V���� Google Sheet �ɂ���B���J�͈͂͏���ɕς��Ȃ��B */
  function exportPlanSheet(name, sheets, ok, ng){
    if(!onGas) return ng("�茳�ł�Google Sheet�����Ȃ�");
    google.script.run.withSuccessHandler(ok)
      .withFailureHandler(e => ng(String((e && e.message) || "Sheet�����Ȃ�����")))
      .apiExportPlanSheet(name, sheets);
  }

  /* ��ʂ����O�ɁA���߂��Ԃ���o���؂�B
     �o���؂�Ȃ������ɕ���ꂻ���ȂƂ��́A�����~�߂�B */
  addEventListener("beforeunload", ev => {
    if(onGas && (unsaved() || sending || held.length)){
      persistPending();          /* ��ɍT����B����؂�Ȃ��Ă����ɊJ�����Ƃ��ɑ��� */
      flush();
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  return {isGas, info, saved: () => acknowledged && !unsaved() && !sending,
          /* �������̂ɁA�܂��V�[�g�ɓ����Ă��Ȃ��B��ʂ̒n�̐F�͂���Ō��߂� */
          touched: () => touched || !!lastErr, setNotifier, setDirtyWatcher, setConflictWatcher,
          unsaved, prefetchWeek, readWeeks, readWeeksAll, unread, saveTally,
          watch, stale, heldCells, dropHeld, reloadWeek,
          cellChanged, flush, boot, ready, readyYear,
          saveRoster, saveSubjects, saveBase, saveBaseAll, readPaste, checkYear, archivedYear,
          archiveCount, archiveVerify, archivePurge, exportWeek,
          tpTargets, saveTpTargets, testTpTarget, tpSubmit,
          yearSetup, tickYearSetup, setupPlanSheets, saveVariantOrigin, saveEvents,
          exportPlanSheet};
})();

