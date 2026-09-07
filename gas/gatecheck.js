/* ==================================================================
   gatecheck.js — 関門を手元で動かして確かめる。

     node gas/gatecheck.js

   Apps Script の API を偽物に差し替えて Gate.gs を読み込む。
   **通してはいけないものが通らないこと**を一つずつ見る。
   Google のアカウントは要らない。
================================================================== */
const fs = require("fs"), path = require("path"), vm = require("vm");

let EMAIL = "";
let SETTINGS = [["キー","値"],["学級","3年3組"]];

const sandbox = {
  console: console,
  Session: { getActiveUser: () => ({ getEmail: () => EMAIL }),
             getEffectiveUser: () => ({ getEmail: () => "deployer@edu.nishi.or.jp" }) },
  SpreadsheetApp: { getActive: () => ({ getSheetByName: (n) =>
      n === "設定" ? { getDataRange: () => ({ getValues: () => SETTINGS.map(r=>r.slice()) }) } : null }) },
  HtmlService: {
    createHtmlOutput: (h) => ({ _h:h, setTitle(){ return this; }, getContent(){ return this._h; } }),
    createTemplateFromFile: () => ({ evaluate: () => ({
      setTitle(){ return this; }, addMetaTag(){ return this; } }) })
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "Gate.gs"), "utf8"), sandbox, {filename:"Gate.gs"});
const ev = (s) => vm.runInContext(s, sandbox);

let ng = 0;
function ok(name, cond, got){
  const pass = cond === true;
  if(!pass) ng++;
  console.log((pass ? "  ○ " : "  × ") + name + (pass ? "" : "   → " + JSON.stringify(got)));
}
/* 通してはいけないもの */
function deny(email, why){
  EMAIL = email;
  const j = ev("Gate.judge(Gate.activeEmail())");
  ok("弾く: " + (email === "" ? "（空）" : email) + "  — " + why, j.ok === false, j);
}
/* 通すもの */
function allow(email){
  EMAIL = email;
  const j = ev("Gate.judge(Gate.activeEmail())");
  ok("通す: " + email, j.ok === true, j);
}

console.log("■ 児童は入れない");
deny("12345678@kyoiku.edu.nishi.or.jp", "児童のドメイン。教職員ドメインを末尾に含むので素通りしやすい");
deny("00000001@kyoiku.edu.nishi.or.jp", "同上");
deny("12345678@edu.nishi.or.jp", "万一ドメインが同じでも、8桁の数字なら止める");

console.log("\n■ 部分一致で通してしまう形");
deny("x@sub.edu.nishi.or.jp",          "下位ドメイン");
deny("x@edu.nishi.or.jp.example.com",  "後ろに足しただけ");
deny("x@notedu.nishi.or.jp",           "前に足しただけ");
deny("x@edu.nishi.or.jp.",             "末尾のドット");
deny("x@xedu.nishi.or.jp",             "1文字足しただけ");

console.log("\n■ 判断がつかないときは通さない");
deny("",              "メールが取れない（別ドメインの利用者ではここに落ちる）");
deny("   ",           "空白だけ");
deny("edu.nishi.or.jp", "@ が無い");
deny("@edu.nishi.or.jp","@ の左が空");
deny("x@",            "@ の右が空");
deny("x y@edu.nishi.or.jp", "空白が入っている");

console.log("\n■ 教職員は入れる");
allow("tanaka@edu.nishi.or.jp");
allow("  Tanaka@EDU.NISHI.OR.JP  ");
allow("ｔａｎａｋａ＠edu.nishi.or.jp");        /* 全角は寄せてから比べる */
allow("a.b-c_d@edu.nishi.or.jp");
EMAIL = "a@b@edu.nishi.or.jp";
ok("@ が2つあるときは最後の @ で切る",
   ev("Gate.judge(Gate.activeEmail()).ok") === true, ev("Gate.judge(Gate.activeEmail())"));

console.log("\n■ 例外は教職員ドメインの中でしか効かない");
SETTINGS = [["キー","値"],["例外で通すメール","12345678@edu.nishi.or.jp"]];
allow("12345678@edu.nishi.or.jp");
deny("12345678@kyoiku.edu.nishi.or.jp", "例外に書いても、別ドメインなら通らない");
SETTINGS = [["キー","値"],["例外で通すメール","12345678@kyoiku.edu.nishi.or.jp"]];
deny("12345678@kyoiku.edu.nishi.or.jp", "児童のアドレスを例外に書いても通らない");
SETTINGS = [["キー","値"]];

console.log("\n■ サーバ関数は素通りしない");
EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
let threw = false;
try{ ev("Gate.check()"); }catch(e){ threw = true; }
ok("児童が呼ぶと Gate.check() が止める", threw === true, "止まらなかった");
EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
threw = false;
try{ ev("loadWeek('2026-11-16')"); }catch(e){ threw = true; }
ok("児童が loadWeek を直接叩いても止まる", threw === true, "止まらなかった");
threw = false;
try{ ev("saveCell({})"); }catch(e){ threw = true; }
ok("児童が saveCell を直接叩いても止まる", threw === true, "止まらなかった");
threw = false;
try{ ev("loadRoster(2026)"); }catch(e){ threw = true; }
ok("児童が loadRoster を直接叩いても止まる", threw === true, "止まらなかった");
EMAIL = "tanaka@edu.nishi.or.jp";
ok("教職員は Gate.check() を通る", ev("Gate.check().ok") === true, ev("Gate.check()"));

console.log("\n■ 弾いた画面にデータを載せない");
EMAIL = "12345678@kyoiku.edu.nishi.or.jp";
const html = ev("Gate.denyPage(Gate.judge(Gate.activeEmail())).getContent()");
ok("弾いた画面に開いた人のメールを出さない", html.indexOf("12345678") < 0, html);
ok("弾いた画面は先生用だと言う", html.indexOf("先生用") >= 0, html);

console.log(ng ? "\n× " + ng + " 件だめだった" : "\n○ ぜんぶ通った");
process.exit(ng ? 1 : 0);
