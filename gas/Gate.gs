/* ==================================================================
   Gate.gs — 誰が入れるかを決める唯一の場所。週案は教職員だけが使う。

   ■ この学校のアドレス
       教職員   なまえ@edu.nishi.or.jp
       児童     12345678@kyoiku.edu.nishi.or.jp   （@の左は8桁の数字）

   ■ いちばん危ない間違い
       児童のドメイン kyoiku.edu.nishi.or.jp は、教職員のドメイン
       edu.nishi.or.jp を**末尾に含んでいる**。だから

           email.endsWith("edu.nishi.or.jp")        ← 児童も通る
           email.indexOf("edu.nishi.or.jp") >= 0    ← 児童も通る
           /edu\.nishi\.or\.jp$/.test(email)        ← 児童も通る

       はすべて素通りする。@ の右側を切り出して**完全一致**で比べる。
       この1点のためにこのファイルがある。

   ■ 閉じる側に倒す
       メールが取れない・形がおかしい・判断がつかない、はすべて「通さない」。
       ウェブアプリを「自分（教師）として実行」で置くと、別ドメインの利用者では
       Session.getActiveUser().getEmail() が空を返す。児童が別テナントにいる場合
       ここに落ちるので、空＝通さない、でなければ児童が入れてしまう。

   ■ doGet だけを守っても意味がない
       ウェブアプリの URL を開ける人は google.script.run で
       サーバ関数を直接呼べる。**読む関数・書く関数すべての1行目で
       Gate.check() を呼ぶ。** 画面を出さないのは目隠しであって関門ではない。
================================================================== */
const Gate = (function(){

  /* 教職員のドメイン。ここ「だけ」を通す。下位ドメインは通さない。 */
  const STAFF_DOMAIN  = "edu.nishi.or.jp";
  /* 児童のアドレスは @ の左が8桁の数字。ドメインが万一同じでも止める2枚目。 */
  const STUDENT_LOCAL = /^[0-9]{8}$/;

  /* 設定シートに書いた例外。**教職員ドメインの中でしか効かない**
     （8桁の数字が本名のアドレスになっている職員のための逃げ道）。
     ここに書いても、別ドメインのアドレスは絶対に通らない。 */
  function exceptions(){
    try{
      const sh = SpreadsheetApp.getActive().getSheetByName("設定");
      if(!sh) return [];
      const v = sh.getDataRange().getValues();
      const out = [];
      for(let i = 1; i < v.length; i++){
        if(String(v[i][0]).trim() !== "例外で通すメール") continue;
        String(v[i][1]).split(/[,\s]+/).forEach(function(x){
          x = norm(x); if(x) out.push(x);
        });
      }
      return out;
    }catch(err){ return []; }   /* 読めなければ例外なし。閉じる側に倒す */
  }

  function norm(raw){
    let e;
    try{ e = String(raw == null ? "" : raw); }catch(err){ return ""; }
    if(e.normalize) e = e.normalize("NFKC");   /* ＠ や全角英数を寄せる */
    return e.trim().toLowerCase();
  }

  /* メール1つを見て、通すか通さないかを決める。純粋な関数。 */
  function judge(raw){
    const e = norm(raw);
    if(!e)            return no("メールが取れなかった", "no-email");
    if(/\s/.test(e))  return no("メールに空白が入っている", "bad-form");

    const at = e.lastIndexOf("@");
    if(at <= 0 || at === e.length - 1) return no("メールの形になっていない", "bad-form");

    const local  = e.slice(0, at);
    const domain = e.slice(at + 1);

    /* 完全一致。前方・後方の部分一致では比べない（冒頭の注意） */
    if(domain !== STAFF_DOMAIN)
      return no("教職員のアドレスではない", "not-staff");

    if(STUDENT_LOCAL.test(local) && exceptions().indexOf(e) < 0)
      return no("児童のアドレスの形をしている", "student-form");

    return {ok:true, email:e, local:local, domain:domain};
  }
  function no(why, code){ return {ok:false, why:why, code:code, email:""}; }

  /* いま開いている人のメール。取れなければ空文字。
     getEffectiveUser() は「置いた人」であって「開いている人」ではない。使わない。 */
  function activeEmail(){
    try{ return Session.getActiveUser().getEmail() || ""; }
    catch(err){ return ""; }
  }

  /* サーバ関数の1行目で呼ぶ。通らなければ例外を投げてそこで終わる。 */
  function check(){
    const j = judge(activeEmail());
    if(!j.ok) throw new Error("この週案は教職員だけが使えます。（" + j.why + "）");
    return j;
  }

  /* 通らなかった人に出す画面。データは1つも載せない。 */
  function denyPage(j){
    const msg = (j.code === "student-form" || j.code === "not-staff")
      ? "この週案は先生用です。"
      : "だれが開いているかを確かめられませんでした。";
    const sub = (j.code === "no-email")
      ? "学校のアカウントでログインしてから、もう一度開いてください。"
      : "先生のアカウント（@" + STAFF_DOMAIN + "）で開いてください。";
    return HtmlService.createHtmlOutput(
        '<div style="font:16px/1.9 system-ui,sans-serif;padding:14vh 8vw;color:#1A1A1A">'
      + '<p style="font-size:20px;font-weight:600;margin:0 0 6px">' + esc(msg) + '</p>'
      + '<p style="margin:0;color:#616870">' + esc(sub) + '</p></div>')
      .setTitle("週案");
  }
  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  return {judge:judge, check:check, activeEmail:activeEmail,
          denyPage:denyPage, STAFF_DOMAIN:STAFF_DOMAIN};
})();

/* ------------------------------------------------------------------
   入口。通らない人には画面もデータも渡さない。
------------------------------------------------------------------ */
function doGet(e){
  const j = Gate.judge(Gate.activeEmail());
  if(!j.ok) return Gate.denyPage(j);

  const t = HtmlService.createTemplateFromFile("plan");
  t.boot = JSON.stringify({email: j.email});
  return t.evaluate()
    .setTitle("週案")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* 画面から呼ぶ関数は、**すべて1行目で Gate.check() を呼ぶ**。
   doGet を守っただけでは、URL を開ける人がここを直接叩ける。
   本体は gas/Store.gs の api… にある。呼び忘れは
   `node gas/apicheck.js` が見つける。 */
