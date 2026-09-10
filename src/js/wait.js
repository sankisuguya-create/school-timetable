/* ── 処理中の全面表示 ──────────────────────────
   **シートへ書いているあいだは、次の操作を受け付けない。**

   止めるのは書き込みだけ ── 保存・たんぽぽ出力・年度の検査・年度の退避。
   週を開く読み込みは今までどおり止めない（サイドバーの細い印のまま）。
   控えで描いた紙を読みながら週を繰れる手ざわりを、ここで殺さない。

   書き込みの途中に別の操作が挟まると、送った内容と画面が食い違う。
   食い違ったことに誰も気づかないまま刷られるのが、いちばん高くつく。

   出し方は <dialog>.showModal()。ふつうの div を重ねると、たんぽぽの窓が
   開いているあいだはその窓の下に潜る（開いている窓は最前面の層にいる）。
   showModal なら窓の上に乗り、まわり全部が触れなくなる。
   遮断はブラウザ側の仕組みなので、Tab でも Enter でも抜けられない。

   ・200ms 待ってから出す。すぐ終わる処理でちらつかせない
   ・**遮断は押した瞬間から効く。** 出ていない 200ms のあいだは guard() が受ける
   ・20秒返らなければ自分で解いて知らせる。掴んだまま固まらせない */
const Wait = (() => {
  let DELAY = 200;            /* これより短い処理では出さない */
  let DOG   = 20000;          /* 返らない処理を、いつまでも掴ませない */
  const live  = new Map();    /* id -> {text, shown, show, dog} */
  let seq = 0, wired = false;

  /* Esc で閉じられると、書いている途中に画面が開いてしまう。
     閉じ方をこちらだけが持つ */
  function wire(d){
    if(wired || !d) return;
    wired = true;
    d.addEventListener("cancel", ev => ev.preventDefault());
  }

  function first(){
    for(const w of live.values()) if(w.shown) return w;
    return null;
  }
  function paint(){
    const d = $("wait");
    if(!d) return;
    wire(d);
    const w = first();
    if(w){
      const t = $("waitTxt");
      if(t) t.textContent = w.text;
      if(!d.open) d.showModal();
    } else if(d.open){
      d.close();
    }
  }

  /* 始める。**返ってきた札を必ず end() に渡す。** */
  function begin(text){
    const id = ++seq;
    const w = {text:text || "処理しています", shown:false, show:0, dog:0};
    w.show = setTimeout(() => { w.shown = true; paint(); }, DELAY);
    w.dog  = setTimeout(() => {
      live.delete(id); clearTimeout(w.show); paint();
      toast("<b>返事がありません</b>　" + escText(w.text)
          + "が20秒たっても終わらなかった。回線を確かめて、もう一度押す");
    }, DOG);
    live.set(id, w);
    return id;
  }
  /* 終える。2回渡しても、番犬が先に解いていても、何も起きない */
  function end(id){
    const w = live.get(id);
    if(!w) return;
    clearTimeout(w.show); clearTimeout(w.dog);
    live.delete(id);
    paint();
  }

  const busy = () => live.size > 0;

  /* 押した瞬間の関門。**出る前の 200ms も、ここが受ける。**
     窓が出てしまえばブラウザが止めるが、出るまでの隙に2回目が通ると
     同じものを2回シートへ送ることになる */
  function guard(){
    const w = live.values().next().value;
    if(!w) return true;
    toast("<b>" + escText(w.text) + "</b>　終わるまで待つ");
    return false;
  }

  /* 間合いを縮める口。**検査からだけ呼ぶ。**
     20秒を待つ検査は書けないので、番犬が本当に解くかをここで短くして見る。
     画面のどこからも呼んでいない（呼んでも出る間合いが変わるだけ） */
  function tune(delay, dog){ DELAY = delay; DOG = dog; }

  return {begin, end, busy, guard, tune};
})();
