/* 既定値。**本番ではシートから読む。コードに書かない。**
   ここにあるのは、シートが空のときの初期値だけ。 */

/* 版と日付。**ここの値は build.py が VERSION の中身に差し替える。**
   src を直接ブラウザで開いたときだけ dev のまま見える。
   直すのは VERSION のほう（版を上げるのは人の手。ビルド日は埋めない）。 */
let APP_VERSION = "0.0.0-dev";
let BUILD_DATE  = "";

/* 時程。行を固定しない（学校ごとに違う）。
   tally = 時数集計表のどの列に当たるか。chips = 教科を選べるか。
   kind  = lesson（題名＋備考）／brk（題名だけ）／note（**備考だけ**）。
           放課後は教科を入れるところではないので、備考だけにしてある。 */
let SLOTS = [
  {id:"am1", name:"朝休み", kind:"brk",    time:"8:10〜8:25"},
  {id:"am2", name:"朝学習", kind:"brk",    time:"8:25〜8:40", tally:"朝", chips:true},
  {id:"p1",  name:"1",     kind:"lesson", time:"8:45〜9:30",  tally:"1校時"},
  {id:"p2",  name:"2",     kind:"lesson", time:"9:40〜10:25", tally:"2校時"},
  {id:"br",  name:"業間",  kind:"brk",    time:"10:25〜10:45",tally:"中"},
  {id:"p3",  name:"3",     kind:"lesson", time:"10:45〜11:30",tally:"3校時"},
  {id:"p4",  name:"4",     kind:"lesson", time:"11:40〜12:25",tally:"4校時"},
  {id:"lun", name:"昼休み",kind:"brk",    time:"12:25〜13:25",tally:"昼"},
  {id:"p5",  name:"5",     kind:"lesson", time:"13:25〜14:10",tally:"5校時"},
  {id:"p6",  name:"6",     kind:"lesson", time:"14:20〜15:05",tally:"6校時"},
  {id:"after",name:"放課後", kind:"note",   time:""}
];
let SLOT_BY_ID = Object.fromEntries(SLOTS.map(s => [s.id, s]));

/* short = 時数集計表に入れる1文字。
   count:false の教科は空にする。**書くと Excel 側の出現数の集計が増える。**

   tp   = たんぽぽ時間割に出す字。**空なら表示名をそのまま出す。**
          たんぽぽの児童の列は 50px しかないので、「合同体育」は入らない。
          時数の1文字とは別に持つ（「合体」は2文字で、1文字には縮まない）。
   面   = そのチップをどの面に出すか。空なら**どの面にも出す**。
          "学年" と書いたものは、学年と全学年の面にだけ出す。
          合同体育・合同音楽・学年集会は複数学級でやるものなので、
          担任の面に出すと、名前と実態がずれたまま自分の学級だけに入る。 */
let SUBJECTS = [
  {code:"kokugo",  name:"国語",  short:"国", count:true},
  {code:"shakai",  name:"社会",  short:"社", count:true},
  {code:"sansu",   name:"算数",  short:"算", count:true},
  {code:"rika",    name:"理科",  short:"理", count:true},
  {code:"seikatsu",name:"生活",  short:"生", count:true},
  {code:"ongaku",  name:"音楽",  short:"音", count:true},
  {code:"zuko",    name:"図工",  short:"図", count:true},
  {code:"katei",   name:"家庭",  short:"家", count:true},
  {code:"taiiku",  name:"体育",  short:"体", count:true},
  {code:"doutoku", name:"道徳",  short:"道", count:true},
  {code:"gaikoku", name:"外国語",short:"外", count:true},
  {code:"sogo",    name:"総合",  short:"総", count:true},
  {code:"gakkatsu",name:"学活",  short:"学", count:true},
  /* 複数学級でやるもの。**学年・全学年の面にだけ出す。**
     時数は元の教科に数える（合同体育＝体育、合同音楽＝音楽、学年集会＝特別活動） */
  {code:"goudo_taiiku",  name:"合同体育", short:"体", count:true, tp:"合体",   only:"学年"},
  {code:"goudo_ongaku",  name:"合同音楽", short:"音", count:true, tp:"合音",   only:"学年"},
  {code:"gakunen_shukai",name:"学年集会", short:"特", count:true, tp:"学年集", only:"学年"},
  /* 図書（固定時間割の「と」）。**時数に数えるかは学校が決める。**
     数えるなら「時数表の1文字」を入れて count:true にする */
  {code:"tosho",   name:"図書",  short:"",   count:false},
  {code:"gyoji",   name:"行事",  short:"",   count:false},
  {code:"kyushoku",name:"給食",  short:"",   count:false},
  {code:"club",    name:"クラブ",short:"",   count:false},
  {code:"iinkai",  name:"委員会",short:"",   count:false}
];
let SUB_BY_NAME = Object.fromEntries(SUBJECTS.map(s => [s.name, s]));
let SUB_BY_CODE = Object.fromEntries(SUBJECTS.map(s => [s.code, s]));

/* 本番では「時程」「教科」シートが正本。ここの値は、シートが空のときだけ使う。 */
function setSlots(list){
  SLOTS = list;
  SLOT_BY_ID = Object.fromEntries(SLOTS.map(s => [s.id, s]));
}
function setSubjects(list){
  SUBJECTS = list;
  SUB_BY_NAME = Object.fromEntries(SUBJECTS.map(s => [s.name, s]));
  SUB_BY_CODE = Object.fromEntries(SUBJECTS.map(s => [s.code, s]));
}
/* 「設定」シートの値を画面の設定へ移す。空欄はいまの値のまま */
function applyConfig(cfg){
  const t = db.settings.tally, put = (k, fn) => {
    const v = cfg[k];
    if(v !== undefined && v !== null && String(v).trim() !== "") fn(v);
  };
  put("印刷用紙",        v => db.settings.paper  = String(v).trim());
  put("印刷余白mm",      v => db.settings.margin = +v || 8);
  put("印刷倍率",        v => db.settings.k      = +v || 1);
  put("タイトル文字pt",  v => db.settings.titlePt = +v || 16);
  put("詳細文字pt",      v => db.settings.notePt  = +v || 12);
  put("時数_貼る先",     v => t.anchor  = String(v).trim());
  put("時数_クラスの順", v => t.classes = String(v));
  put("時数_1日の行数",  v => t.block   = +v || 10);
  /* A週の起点。**ここを動かすと、以後の週のA/Bが全部入れ替わる。** */
  put("A週の起点の月曜", v => db.settings.abAnchor = String(v).trim());
  /* 場所を取る教科。教科コードでも表示名でも書ける（体育,図書 ／ taiiku,tosho）。
     **読めない字は捨てる。** 捨てたものを黙って全教科に広げない */
  put("場所を取る教科", v => {
    const out = [];
    for(const raw of String(v).split(/[,、\s]+/)){
      const t = raw.trim();
      if(!t) continue;
      const s = SUB_BY_CODE[t] || SUB_BY_NAME[t];
      if(s && out.indexOf(s.code) < 0) out.push(s.code);
    }
    if(out.length) PLACE_SUBJECTS = out;
  });
  put("時数_列のずれ",   v => {
    const cols = {};
    for(const part of String(v).split(/[,、\s]+/)){
      const kv = part.split(":");
      if(kv.length === 2 && kv[0].trim()) cols[kv[0].trim()] = +kv[1] || 0;
    }
    if(Object.keys(cols).length) t.cols = cols;
  });
}

/* クラス編成。学年でクラス数が違う（**5年・6年だけ4クラス**）ので数を決め打ちしない。
   本番では「クラス」シートが正本（1行1クラス：年度・学年・クラス）。
   画面の「学級編成」から直せる。直した値は年度ごとに持つ。 */
const DEFAULT_CLASSES = {
  "1":["1-1","1-2","1-3"],
  "2":["2-1","2-2","2-3"],
  "3":["3-1","3-2","3-3"],
  "4":["4-1","4-2","4-3"],
  "5":["5-1","5-2","5-3","5-4"],
  "6":["6-1","6-2","6-3","6-4"]
};
/* grades＝受け持つ学年。**空なら全学年。** 同じ教科に専科が2人いる学校で、
   基本時間割のどのコマが誰のものかを決める唯一の材料（「専科」シートの担当学年）。 */
const DEFAULT_SPECIALS = [
  {code:"ongaku",  label:"音楽",  grades:[]},
  {code:"zuko",    label:"図工",  grades:[]},
  {code:"rika",    label:"理科",  grades:[]},
  {code:"gaikoku", label:"外国語",grades:[]}
];

/* ── 場所を取る教科 ────────────────────────────
   **体育館・図書室のように、同じ時間に1クラスしか入れない教科。**
   空き枠さがし（レベル2）で「避けたい」に落とす材料になる。

   *教科を場所の代わりに使う理由*：場所そのものを持たせると、コマごとに
   場所を入れる作業が増える。週に何件も入れるものではないので、
   **教科で代用して入力を増やさない。** 学校の事情なので「設定」シートに置く
   （教科そのものの性質ではない ── 運動場が2面ある学校では体育は競合しない）。 */
let PLACE_SUBJECTS = ["taiiku", "tosho"];

/* ── 空き枠さがしの段階 ────────────────────────
   **3段で出す。2値にしない。** 空きの無い週に画面から候補が全部消えると、
   使う側は「壊れている」と読んで二度と開かない。
   「使えない」と「空いているが避けたい」を分けておけば、
   候補が無い週でも、何がどう埋まっているかは読める。

     0  出さない
     1  全校・学年の予定と、校外行事・休み・授業なしを避ける
     2  1に加えて、場所を取る教科・学年でやる活動・ほかの専科も避ける

   どの段でも「避ける教科」の指定は効く（段の指定に足すもの）。 */
const FREE_OFF = 0, FREE_L2 = 2;
/* 印の読み。**記号と語を必ず併せる。** 色を外しても意味が残る
   （○△× は形で、語は字で運ぶ。色はそのどちらも言い直しているだけ）。 */
const FREE_MARK = {free:"○", avoid:"△", busy:"×"};
const FREE_WHY  = {free:"自由", avoid:"避けたい", busy:"使えない"};

/* 層。**層は出どころの表示だけで、勝ち負けは決めない**（勝ち負けは書かれた時刻）。
   RANK は同じ時刻で並んだときの順序にしか使わない。 */
const LAYER_NAME = {base:"", school:"全体", grade:"学年", special:"専", home:""};
const LAYER_FULL = {base:"基本時間割", school:"学校全体", grade:"学年",
                    special:"専科", home:"担任"};
const RANK = {base:0, home:1, special:2, grade:3, school:4};

/* 曜日。**月〜土の6日。** 土曜はほとんど空くが、行事とオープンスクールが入る。
   土の列は 20mm のまま（前の「土日」1列と同じ幅）なので、
   **月〜金の列は1mmも痩せない**。日曜は置かない。 */
const DOW = ["月","火","水","木","金","土"];
const DAYS = 6;            /* 紙に出す日数（月〜土） */
/* 月〜金だけを見るもの。基本時間割・たんぽぽ・時数集計表は5日で組んである */
const WEEKDAYS = 5;

/* A週・B週の起点。**この月曜がA週で、あとは1週ごとに入れ替わる。**
   手で切り替えさせない——切り替え忘れた人だけ別の基本時間割を見ることになる。
   学校の年間行事計画表に合わせて「設定」シートから動かせる。 */
const AB_ANCHOR = "2026-09-07";

/* ── その日の形 ────────────────────────────────
   **日ごとに「ふつう／特別校時／休み」を持つ。** 学校全体で決まるものなので、
   全学年の面からだけ入れられ、学校全体の層として全クラスに降りる。

   持ち方は**ふつうのコマと同じ**（週案 全校 シートの1行）。時程のIDに
   `day` を使う。専用の入れ物を作らないので、書き込み・読み込み・
   まだ送っていない数え方・年度の退避が、そのまま全部効く。 */
const DAY_SLOT = "day";
const DAY_FORM = {
  "":        {label:"ふつう",   mark:"",   why:"朝学習から放課後まで、いつもどおり"},
  "special": {label:"特別校時", mark:"特", why:"朝学習が無い。その日の欄が1つ上へ詰まる"},
  "off":     {label:"休み",     mark:"休", why:"1〜6校時に斜め線を引く。書き込めなくなる"}
};
/* ── 校外行事（被覆） ────────────────────────
   **題名にも備考にも入らない。** コマの上に薄く縦書きで出る印で、続けて置くと
   枠がつながって1つの縦長になる。題名欄はコマごとに残るので、時数は今までどおり
   各コマの教科で数えられる。

   持ち方は**ふつうのコマと同じ**（時程のIDに `trip:時程`）。`day`・`memo` と
   同じ手で、専用の入れ物を作らない。**週案シートに列を足さない** ── 列を足すと、
   見出しの無い既存ファイルで黙って読み捨てられる（writePlan は見出しを書き直さない）。 */
const TRIP_SLOT = "trip:";
const TRIP_NAME = "校外学習";

/* ── 授業なし（コマ1つ） ────────────────────────
   **「このコマは授業がない」を1コマだけ表す。** 休みの日（DAY_FORM の off）は
   1日ぶんだが、行事や下校で1コマだけ潰れる日のほうが多い。

   持ち方は**ふつうのコマと同じで、題名そのもの**にこの字を入れる。
   専用の入れ物も、時程のIDも作らない ── 層の重なり・競合・取り消し・
   年度の退避が、そのまま全部効く。シートを開いた人にも「授業なし」と読める。
   **備考は残す**（「学年行事のため」「自習」を書ける）。
   時数は、この字に合う教科が無いので数えられない（→ dialogs.js tallyGrid）。 */
const NO_LESSON = "授業なし";

/* 休みの日に引く斜め線。**背景ではなく図形で描く。**
   背景の色は、トナーを節約する設定のプリンタでは消えることがある。 */
const SLASH_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
  + '<line x1="0" y1="0" x2="100" y2="100" vector-effect="non-scaling-stroke"/></svg>';
