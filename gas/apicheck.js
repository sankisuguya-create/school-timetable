/* ==================================================================
   apicheck.js — 関門の呼び忘れと、呼び先の行方不明を見つける。

     node gas/apicheck.js

   守りたいのは2つ。

     1. **画面から呼べるサーバ関数が、全部 Gate.check() を通ること。**
        doGet を守っただけでは足りない。URL を開ける人（＝ドメイン内の
        全員、児童を含む）は google.script.run で関数名を直接叩ける。
        1つ足りないだけで、そこが抜け道になる。人の目では見落とす。

     2. **画面が呼んでいる名前が、サーバに実在すること。**
        関数を消したり綴りを変えたりすると、画面は静かに失敗する。
        本番で押して初めて分かる、では遅い。

   Google のアカウントは要らない。
================================================================== */
const fs = require("fs"), path = require("path"), vm = require("vm");

const GAS = __dirname;
const SRC = path.join(__dirname, "..", "src", "js");
const GS  = ["Gate.gs", "Sheets.gs", "Store.gs"];

let ng = 0;
function ok(name, cond, got){
  const pass = cond === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name + (pass ? "" : "   → " + JSON.stringify(got)));
}

/* ── トップレベルの関数を、名前と中身に分ける ────────────
   行頭の function だけを見る。中に入れ子で書いた関数は行頭に来ない。 */
function topLevel(src){
  const out = {};
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while((m = re.exec(src))){
    /* 対応する } まで数える。文字列や注釈の中の括弧は数えない */
    let i = src.indexOf("{", m.index), depth = 0, j = i;
    for(; j < src.length; j++){
      const c = src[j];
      if(c === "\"" || c === "'"){                       /* 文字列を飛ばす */
        const q = c; j++;
        while(j < src.length && src[j] !== q){ if(src[j] === "\\") j++; j++; }
      }else if(c === "/" && src[j+1] === "*"){ j = src.indexOf("*/", j) + 1; }
      else if(c === "/" && src[j+1] === "/"){ j = src.indexOf("\n", j); if(j < 0) j = src.length; }
      else if(c === "{") depth++;
      else if(c === "}" && --depth === 0) break;
    }
    out[m[1]] = src.slice(i, j + 1);
  }
  return out;
}

const server = {};                              /* 名前 → 中身 */
const where  = {};                              /* 名前 → ファイル */
for(const f of GS){
  const t = topLevel(fs.readFileSync(path.join(GAS, f), "utf8"));
  for(const n in t){ server[n] = t[n]; where[n] = f; }
}

console.log("■ サーバ関数は関門を通る（呼び忘れ検査）");
const names = Object.keys(server).sort();
ok("トップレベルのサーバ関数を見つけた", names.length > 0, names);
for(const n of names){
  const body = server[n];
  if(n === "doGet"){
    ok(n + " は自分で判定して、通らない人に画面を返す",
       /Gate\.judge\s*\(/.test(body) && /Gate\.denyPage\s*\(/.test(body), where[n]);
    continue;
  }
  ok(n + " が Gate.check() を呼ぶ  (" + where[n] + ")",
     /Gate\.check\s*\(/.test(body), body.slice(0, 120));
}

console.log("\n■ 画面が呼ぶ名前は、サーバに実在する");
const called = new Set();
for(const f of fs.readdirSync(SRC).filter(x => x.endsWith(".js"))){
  const s = fs.readFileSync(path.join(SRC, f), "utf8");
  let m;
  const re = /\.\s*(api[A-Za-z0-9_$]*)\s*\(/g;
  while((m = re.exec(s))) called.add(m[1]);
}
ok("画面から呼んでいるサーバ関数を見つけた", called.size > 0, [...called]);
for(const n of [...called].sort())
  ok("画面が呼ぶ " + n + " がサーバにある", !!server[n], Object.keys(server));

/* サーバにあって画面から呼ばれないものは、エディタから手で回すもの
   （setupSheets など）。落とさずに並べるだけにする。 */
const idle = names.filter(n => n.startsWith("api") && !called.has(n));
if(idle.length) console.log("  ・画面から呼ばれない api…: " + idle.join("、"));

console.log("\n■ 児童が直接叩いても止まる（実際に呼ぶ）");
let EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
const dead = () => { throw new Error("シートに触れた"); };
const sandbox = {
  console: console,
  Session: { getActiveUser: () => ({ getEmail: () => EMAIL }),
             getEffectiveUser: () => ({ getEmail: () => "deployer@edu.nishi.or.jp" }) },
  SpreadsheetApp: { getActive: () => ({
      getSheetByName: (n) => n === "設定"
        ? { getDataRange: () => ({ getValues: () => [["キー","値"]] }) } : null,
      getSheets: dead, insertSheet: dead }),
    openById: dead, getUi: dead },
  DriveApp: { getFileById: dead },
  LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
  Utilities: { formatDate: () => "", sleep(){} },
  Logger: { log(){} },
  HtmlService: {
    createHtmlOutput: (h) => ({ _h:h, setTitle(){ return this; }, getContent(){ return this._h; } }),
    createTemplateFromFile: () => ({ evaluate: () => ({
      setTitle(){ return this; }, addMetaTag(){ return this; } }) })
  }
};
vm.createContext(sandbox);
for(const f of GS)
  vm.runInContext(fs.readFileSync(path.join(GAS, f), "utf8"), sandbox, {filename:f});

/* 引数は空でよい。**関門は1行目にあるので、中身に届く前に止まる。**
   届いてしまったら偽のシートが「シートに触れた」で落ちる（＝それも失敗）。 */
for(const n of names){
  if(n === "doGet") continue;
  let threw = false, got = "";
  try{ vm.runInContext(n + "()", sandbox); }
  catch(e){ threw = /先生用|教職員|Gate|通せ|止め/.test(e.message) || !/シートに触れた/.test(e.message);
            got = e.message; }
  ok("児童が " + n + " を叩いても止まる", threw === true, got || "止まらなかった");
}

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
