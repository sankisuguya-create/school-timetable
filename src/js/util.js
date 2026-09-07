/* 文字・リンク・日付の道具。ここは状態を持たない。 */

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(html != null) e.innerHTML = html;
  return e;
};
const clone = x => JSON.parse(JSON.stringify(x));

/* ── 文字とリンク ───────────────────────────────
   コマの中身は「文字＋リンク」を持つ。1つのコマにリンクはいくつでも入る。
   持ち方は <a> だけを許した HTML。**文字を打ち直してもリンクが文字に付いて動く。**
   （文字数の位置でリンクを持つと、前を1字消しただけで全部ずれる） */

/* 属性は ' で囲んでいるので ' も逃がす。逃がさないと属性が途中で閉じる */
const escText = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

const _sink = document.createElement("div");
function plain(html){
  _sink.innerHTML = html || "";
  return (_sink.textContent || "").replace(/ /g," ");
}
/* 貼り付けや打鍵で入ってくる余計なタグを落とす。残すのは文字と <a href> だけ。
   href は http/https だけ通す（javascript: を弾く）。 */
function clean(html){
  const d = document.createElement("div");
  d.innerHTML = html || "";
  (function walk(node){
    for(const c of [...node.childNodes]){
      if(c.nodeType === 3) continue;                     /* 文字はそのまま */
      if(c.nodeType !== 1){ c.remove(); continue; }
      if(c.tagName === "BR"){ c.replaceWith(document.createTextNode(" ")); continue; }
      if(c.tagName === "A"){
        const href = c.getAttribute("href") || "";
        for(const a of [...c.attributes]) c.removeAttribute(a.name);
        if(/^https?:\/\//i.test(href)){
          c.setAttribute("href", href);
          c.setAttribute("target", "_blank");
          c.setAttribute("rel", "noopener noreferrer");
          walk(c);
          continue;
        }
        walk(c); c.replaceWith(...c.childNodes);         /* 通さない href は外す */
        continue;
      }
      walk(c); c.replaceWith(...c.childNodes);           /* ほかのタグは中身だけ残す */
    }
  })(d);
  return d.innerHTML;
}
function linksIn(html){
  if(!html || html.indexOf("<a") < 0) return [];
  const d = document.createElement("div");
  d.innerHTML = html;
  return [...d.querySelectorAll("a")]
    .map(a => ({text:a.textContent, href:a.getAttribute("href")}));
}
function dropLink(html, href, text){
  const d = document.createElement("div");
  d.innerHTML = html || "";
  for(const a of [...d.querySelectorAll("a")])
    if(a.getAttribute("href") === href && a.textContent === text)
      a.replaceWith(...a.childNodes);
  return d.innerHTML;
}
const isEmptyCell = e => !plain(e.title) && !plain(e.note)
                      && !/<a\b/i.test(String(e.title) + String(e.note));

/* ── 日付 ─────────────────────────────────────── */

const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
const parseISO = s => { const d = new Date(String(s) + "T00:00:00"); return isNaN(d) ? null : d; };
function mondayOf(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   /* 日曜=0 を 6 に読み替える */
  return x;
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const md = d => (d.getMonth()+1) + "/" + d.getDate();

/* 年度は 4/1 起点 */
const fyOf = d => (d.getMonth() >= 3) ? d.getFullYear() : d.getFullYear() - 1;
/* 4/1 以後の最初の月曜。時数集計表のシート名（週番号）の起点にする */
function firstMonday(y){
  const d = new Date(y, 3, 1);
  d.setDate(d.getDate() + ((8 - (d.getDay() || 7)) % 7));
  return iso(d);
}

/* クラス名の揺れを 3-1 の形に寄せる。
   実物のたんぽぽ時間割は 1-３ ２ｰ３ ３－２ 1-2 １－１ が混在している。 */
function normCls(raw){
  let x = String(raw || "");
  if(x.normalize) x = x.normalize("NFKC");
  return x.trim().replace(/[-‐‑‒–—―ー−ｰ－]/g, "-");
}
