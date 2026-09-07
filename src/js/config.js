/* 既定値。**本番ではシートから読む。コードに書かない。**
   ここにあるのは、シートが空のときの初期値だけ。 */

/* 時程。行を固定しない（学校ごとに違う）。
   tally = 時数集計表のどの列に当たるか。chips = 教科を選べるか。 */
const SLOTS = [
  {id:"am1", name:"朝休み", kind:"brk",    time:"8:10〜8:25"},
  {id:"am2", name:"朝学習", kind:"brk",    time:"8:25〜8:40", tally:"朝", chips:true},
  {id:"p1",  name:"1",     kind:"lesson", time:"8:45〜9:30",  tally:"1校時"},
  {id:"p2",  name:"2",     kind:"lesson", time:"9:40〜10:25", tally:"2校時"},
  {id:"br",  name:"業間",  kind:"brk",    time:"10:25〜10:45",tally:"中"},
  {id:"p3",  name:"3",     kind:"lesson", time:"10:45〜11:30",tally:"3校時"},
  {id:"p4",  name:"4",     kind:"lesson", time:"11:40〜12:25",tally:"4校時"},
  {id:"lun", name:"昼休み",kind:"brk",    time:"12:25〜13:25",tally:"昼"},
  {id:"p5",  name:"5",     kind:"lesson", time:"13:25〜14:10",tally:"5校時"},
  {id:"p6",  name:"6",     kind:"lesson", time:"14:20〜15:05",tally:"6校時"}
];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map(s => [s.id, s]));

/* short = 時数集計表に入れる1文字。
   count:false の教科は空にする。**書くと Excel 側の出現数の集計が増える。** */
const SUBJECTS = [
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
  {code:"gyoji",   name:"行事",  short:"",   count:false},
  {code:"kyushoku",name:"給食",  short:"",   count:false},
  {code:"club",    name:"クラブ",short:"",   count:false},
  {code:"iinkai",  name:"委員会",short:"",   count:false}
];
const SUB_BY_NAME = Object.fromEntries(SUBJECTS.map(s => [s.name, s]));
const SUB_BY_CODE = Object.fromEntries(SUBJECTS.map(s => [s.code, s]));

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
const DEFAULT_SPECIALS = [
  {code:"ongaku", label:"音楽"},
  {code:"zuko",   label:"図工"},
  {code:"rika",   label:"理科"}
];

/* 層。**層は出どころの表示だけで、勝ち負けは決めない**（勝ち負けは書かれた時刻）。
   RANK は同じ時刻で並んだときの順序にしか使わない。 */
const LAYER_NAME = {base:"", school:"全体", grade:"学年", special:"専", home:""};
const LAYER_FULL = {base:"基本時間割", school:"学校全体", grade:"学年",
                    special:"専科", home:"担任"};
const RANK = {base:0, home:1, special:2, grade:3, school:4};

const DOW = ["月","火","水","木","金"];
