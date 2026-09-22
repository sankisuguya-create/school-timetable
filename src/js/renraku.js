"use strict";
/* ── 連絡帳（A4よこ）────────────────────────────────
   児童が写す・学級掲示に貼る「連絡帳」の形。
   左メニュー「週案を出す」の口から日付を選ぶと、
   その日のぶんを **右詰めの縦書き** で1枚に焼く。

   出るもの（右から左へ）
     ・日付曜日
     ・つぎの日の時間割 … 時数表の1文字（国 国 算 …）
     ・宿題　・持ち物 … 先生がこの窓で書く

   **全部ルビつき。** 日付・見出し・教科の字はこちらで付け、
   宿題・持ち物は「漢字（かな）」と書くと かな がルビになる
   （読みの分からない字へ機械でふるのを避けるため、誤読みより
   　書いた人が決めた読みを出す形にした）。

   出力は 印刷・画像・Google Slide。Slide は紙面を絵として
   1枚貼る（Apps Script は新規スライドの大きさを変えられないので、
   紙は Slide 既定の16:9に無理に合わせず、A4よこのまま中央へ置く）。 */

/* 縦書きで90度倒す字（延ばす棒・かっこ・句読点のなかの「：」） */
const REN_ROT = "ー〜～‐‑‒–—―−ｰ（）()［］[]｛｝{}「」『』〈〉《》【】〔〕：";
/* 隅へ寄せる字（縦書きでは右上へ置く） */
const REN_CORNER = "、。";
const REN_DIGIT = /[0-9A-Za-z]/;
const REN_FONT = '"Hiragino Kaku Gothic ProN","Yu Gothic",YuGothic,"Noto Sans JP","Noto Sans CJK JP",Meiryo,sans-serif';

/* 文を「字（＋ルビ）」の並びに分ける。
   漢字（かな） と書くと かな がルビになる。ふりがなでないかっこ書き
   （ふりがな以外の中身・漢字の直前が無い）は、そのまま字として出す。 */
function renRuby(s){
  const segs = [], KANA = /^[ぁ-んァ-ヶー・]+$/;
  /* ルビが掛かるのは「漢字で始まる語尾の並び」（下じき・筆箱・A1 など）。
     漢字の無い語尾（数字・ローマ字だけ）も一応拾う */
  const BASE = /([一-龠々〆ヵヶ][一-龠々〆ヵヶぁ-んァ-ヶー0-9０-９A-Za-z]*|[0-9０-９A-Za-z]+)$/;
  let i = 0, buf = "";
  const flush = () => { if(buf){ segs.push({t:buf}); buf = ""; } };
  while(i < s.length){
    const c = s[i];
    if(c === "（" || c === "("){
      const j = s.indexOf(c === "（" ? "）" : ")", i + 1);
      const rt = j < 0 ? "" : s.slice(i + 1, j);
      if(j < 0 || !KANA.test(rt)){ buf += j < 0 ? c : s.slice(i, j + 1); i = j < 0 ? i + 1 : j + 1; continue; }
      const m = buf.match(BASE);
      if(!m){ segs.push({t:rt}); }          /* 漢字が無いときは中身を字として出す */
      else{
        const head = buf.slice(0, buf.length - m[1].length);
        if(head) segs.push({t:head});
        segs.push({t:m[1], rt});
      }
      buf = ""; i = j + 1; continue;
    }
    buf += c; i++;
  }
  flush();
  return segs;
}

/* 字の列（segs）を縦に1列書く。**ルビは字の右の細い筋へ。**
   返すのは使った高さ。x は字の中心。
   upright を立てると数字・ローマ字も寝かせず正立で積む（日付用）。 */
function renVText(ctx, x, y, segs, fs, color, upright){
  ctx.fillStyle = color || "#222";
  ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.font = fs + "px " + REN_FONT;
  const hasRuby = segs.some(s => s.rt);
  const rx = x + fs * 0.5 + fs * 0.18;          /* ルビの筋は字の右はずれ */
  let yy = y;
  for(const sg of segs){
    const top = yy, t = sg.t || "";
    for(let i = 0; i < t.length; i++){
      const ch = t[i];
      if(!upright && REN_DIGIT.test(ch)){          /* 数字・ローマ字は縦中横 */
        let run = ch;
        while(i + 1 < t.length && REN_DIGIT.test(t[i + 1])) run += t[++i];
        ctx.save(); ctx.translate(x, yy + fs * 0.5); ctx.rotate(Math.PI / 2);
        ctx.fillText(run, 0, 0); ctx.restore();
      }
      else if(REN_CORNER.indexOf(ch) >= 0)
        ctx.fillText(ch, x + fs * 0.3, yy + fs * 0.16);
      else if(REN_ROT.indexOf(ch) >= 0){
        ctx.save(); ctx.translate(x, yy + fs * 0.5); ctx.rotate(Math.PI / 2);
        ctx.fillText(ch, 0, 0); ctx.restore();
      }
      else ctx.fillText(ch, x, yy + fs * 0.5);
      yy += fs;
    }
    if(sg.rt && hasRuby){
      ctx.save(); ctx.font = Math.round(fs * 0.44) + "px " + REN_FONT;
      const rh = fs * 0.5, n = sg.rt.length;
      let ry = top + Math.max(0, (yy - top - n * rh) / 2);   /* 字のかたまりの真ん中に合わせる */
      for(const rc of sg.rt){ ctx.fillText(rc, rx, ry + rh / 2); ry += rh; }
      ctx.restore();
      ctx.font = fs + "px " + REN_FONT;
    }
  }
  return yy - y;
}

/* 列が横にどれだけ食うか（字幅＋ルビの筋） */
const renColW = (segs, fs) => fs + (segs.some(s => s.rt) ? fs * 0.62 : 0);

/* 曜日の読み（日付にはルビを付けない決まり。曜日だけこちらで付ける） */
const REN_DOW = {"月":"げつようび","火":"かようび","水":"すいようび","木":"もくようび",
                 "金":"きんようび","土":"どようび","日":"にちようび"};
/* 1文字コマの読み（国→こく・図→ず。表示の字そのものの読みだけを出す）。
   **ここに無い字にはルビを出さない**（当てずっぽうを刷るより、
   ルビなしのほうがまだ書き写せる）。 */
const REN_CHAR = {
  "国":"こく","社":"しゃ","算":"さん","理":"り","生":"せ","音":"おん",
  "図":"ず","家":"か","体":"たい","道":"どう","外":"がい","英":"えい",
  "総":"そう","学":"がっ","特":"とく","漢":"かん","書":"しょ","情":"じょう",
  "読":"どく","給":"きゅう","委":"い","行":"ぎょう","掃":"そう","下":"げ",
  "登":"とう","朝":"あさ","集":"しゅう","会":"かい","話":"はな","合":"ごう",
  "大":"おお","始":"し","終":"しゅう","運":"うん","遠":"えん","修":"しゅう",
  "参":"さん","保":"ほ","入":"にゅう","卒":"そつ","着":"ちゃく","水":"すい",
  "校":"こう","交":"こう","町":"まち","転":"てん","相":"そう","個":"こ",
  "耳":"みみ","鼻":"はな","歯":"は","眼":"め","戸":"と","放":"ほう"
};
/* その日の形・休みなど「語」で出るものの読み（字の並びではなく語の読み）。 */
const REN_YOMI = {
  "国語":"こくご","算数":"さんすう","理科":"りか","社会":"しゃかい","生活":"せいかつ",
  "音楽":"おんがく","図工":"ずこう","図画工作":"ずがこうさく","家庭":"かてい",
  "体育":"たいいく","道徳":"どうとく","外国語":"がいこくご","英語":"えいご",
  "総合":"そうごう","学活":"がっかつ","特別活動":"とくべつかつどう",
  "図書":"としょ","行事":"ぎょうじ","給食":"きゅうしょく","クラブ":"くらぶ",
  "委員会":"いいんかい","読書":"どくしょ","漢字":"かんじ","書写":"しょしゃ","情報":"じょうほう",
  "合同体育":"ごうどうたいいく","合同音楽":"ごうどうおんがく","学年集会":"がくねんしゅうかい",
  "休み":"やすみ","始業式":"しぎょうしき","終業式":"しゅうぎょうしき","大掃除":"おおそうじ",
  "運動会":"うんどうかい","遠足":"えんそく","修学旅行":"しゅうがくりょこう",
  "参観日":"さんかんび","保護者会":"ほごしゃかい","下校":"げこう","登校":"とうこう"
};

/* 選んだ日の中身を読む。コマの積み方は週の紙と同じ compose を通す ──
   行事・授業なし・専科の入れ替えまで、紙に出ているものと同じ字が出る。 */
function renrakuModel(cls, dt, hwText, itemText){
  const keep = monday; monday = mondayOf(dt);
  const d = (dt.getDay() + 6) % 7;
  try{
    const w = week();
    const dayCell = (w.school || {})[ck(d, DAY_SLOT)];
    const dayT = plain((dayCell && dayCell.title) || "").trim();
    const letters = [];
    if(/休/.test(dayT)) letters.push({t:"休み", rt:REN_YOMI["休み"]});
    else{
      if(dayT) letters.push({t:dayT, rt:REN_YOMI[dayT] || ""});
      for(const s of SLOTS){
        if(s.kind !== "lesson") continue;
        const c = compose(cls, d, s.id);
        const t = plain(c.title || "").trim();
        if(!t){ letters.push({t:"", rt:""}); continue; }
        if(t === NO_LESSON){ letters.push({t:"なし", rt:""}); continue; }
        const lt = shortOf(c.subject, t, c.short);
        /* 1文字コマはその字の読み（国→こく）。語で出るものは語の読み */
        letters.push({t:lt, rt:lt.length === 1 ? (REN_CHAR[lt] || "")
                                               : (REN_YOMI[lt] || REN_YOMI[t] || "")});
      }
    }
    const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(x => x).map(renRuby);
    const dowCh = dt.getDay() === 0 ? "日" : DOW[d];
    return {dt, letters,
      /* 日付にルビはいらない（曜日だけ付ける） */
      date:[{t:(dt.getMonth()+1) + "月"},
            {t:dt.getDate() + "日"},
            {t:"（"}, {t:dowCh + "曜日", rt:REN_DOW[dowCh]}, {t:"）"}],
      headTT:[{t:"つぎの"},{t:"日",rt:"ひ"},{t:"の"},{t:"時間割",rt:"じかんわり"}],
      headHW:[{t:"宿題",rt:"しゅくだい"}],
      headIT:[{t:"持",rt:"も"},{t:"ち"},{t:"物",rt:"もの"}],
      hw:lines(hwText), items:lines(itemText)};
  } finally{ monday = keep; }
}

/* 見出し列＋中身の列を1まとまりとして書く。枠線は引かず、字だけ。
   右から左へ積み、返すのは食った横幅（次のまとまりの右端を決める）。 */
function renGroup(ctx, xr, y, head, cols, headFs, bodyFs, color){
  const gap = 22;
  /* 見出しの筋はまとまりの右はし。ルビはさらにその右 */
  let x = xr - renColW(head, headFs);
  renVText(ctx, x + headFs / 2, y, head, headFs, color);
  x -= gap;
  for(const col of cols){
    x -= renColW(col, bodyFs);
    if(col.length) renVText(ctx, x + bodyFs / 2, y, col, bodyFs, color);
    x -= gap;
  }
  return (xr - x) + 64;         /* まとまりとまとまりのあいだ */
}

/* A4よこ（297:210）を2倍の精細さで焼く */
function renDraw(m){
  const W = 1414, H = 1000;
  const cv = el("canvas"); cv.width = W * 2; cv.height = H * 2;
  cv.style.width = "560px"; cv.style.height = "auto";
  const ctx = cv.getContext("2d"); ctx.scale(2, 2);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

  /* 印刷して配る・モニターに大きく映す紙。字は大きく、装飾はなし */
  let xr = W - 64, y = 84;
  /* いちばん右は日付曜日（いちばん大きく。数字も寝かせず正立） */
  renVText(ctx, xr - renColW(m.date, 86) + 43, y, m.date, 86, "#222", true);
  xr -= renColW(m.date, 86) + 76;

  xr -= renGroup(ctx, xr, y, m.headTT, [m.letters], 52, 76, "#222");
  xr -= renGroup(ctx, xr, y, m.headHW, m.hw, 52, 56, "#222");
  xr -= renGroup(ctx, xr, y, m.headIT, m.items, 52, 56, "#222");

  /* 左下に小さく名札（どのクラスの紙か） */
  ctx.fillStyle = "#888"; ctx.font = "26px " + REN_FONT;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(m.clsName || "", 70, H - 60);
  return cv;
}

/* ── 窓の開き方 ────────────────────────────────── */
let renrakuLast = {cls:"", date:""};

function openRenrakuDlg(){
  const cls = (view && view.kind === "class" ? view.cls : "") || renrakuLast.cls || allClasses()[0] || "";
  fillSelect($("renCls"), allClasses().map(c => ({v:c, t:c})), cls);
  if(!$("renDate").value){
    /* あした（日曜なら月曜へ） */
    let d = addDays(new Date(), 1);
    while(d.getDay() === 0) d = addDays(d, 1);
    $("renDate").value = iso(d);
  }
  $("renStat").textContent = "";
  /* **窓を開けてから焼く。** 手元モードでは readByFy が同期で返り、
     焼き終わったときに窓がまだ開いていないと絵を捨ててしまう */
  $("renDlg").showModal();
  renrakuRender();
}

/* 選んだ日の週を読んでから紙を焼く。読み済みの週はすぐ返るので、
   宿題を打つたびに呼んでも重くならない。 */
function renrakuRender(){
  const cls = $("renCls").value, dt = parseISO($("renDate").value);
  renrakuLast = {cls, date:$("renDate").value};
  const box = $("renView");
  if(!cls || !dt){ box.innerHTML = ""; return; }
  const mon = mondayOf(dt), need = {};
  (need[fyOf(mon)] = {})[iso(mon)] = true;
  const w = Wait.begin("その週を読んでいます");
  readByFy(need, () => {
    Wait.end(w);
    if(!$("renDlg").open) return;
    const m = renrakuModel(cls, dt, $("renHw").value, $("renItem").value);
    m.clsName = cls + "　れんらくちょう";
    box.innerHTML = ""; box.appendChild(renDraw(m));
  });
}
function renrakuCanvas(){ return ($("renView") || {}).querySelector ? $("renView").querySelector("canvas") : null; }
function renrakuName(){
  return "連絡帳_" + ($("renDate").value || "") + "_" + ($("renCls").value || "");
}
