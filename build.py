#!/usr/bin/env python3
"""src/ を組み立てて、ブラウザで開ける1枚と GAS 用の1枚を書き出す。

    python3 build.py          生成する
    python3 build.py --check  生成物が src と一致するか調べる（ずれたら終了コード1）

なぜ1枚に畳むのか
    Apps Script のウェブアプリは、モジュールもバンドラも使えない。
    だから src/ を人が読める単位で分けておき、ここで1枚に畳む。
    **直すのは src/ のほう。** 生成物を直しても次のビルドで消える。

@include の書き方
    /* @include css/tokens.css */     CSS を差し込む
    /* @include js/store.js */        JS を差し込む
    差し込む順序は index.html が決める。JS は上から順に評価されるので、
    定義より先に使う書き方をしない（依存の向きは docs/spec.md 参照）。

@dark{ … }
    暗い配色の値を1箇所に保つための仕掛け。メディアクエリの中と外の
    2つに展開する。いまの週案は机の色を明暗で変えないので使っていないが、
    トークンの書式は homeroom-tools と揃えてある。
"""
import sys, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
VER  = ROOT / "VERSION"
SRC  = ROOT / "src"
OUT  = ROOT / "dist" / "index.html"
GAS  = ROOT / "gas" / "plan.html"

INCLUDE = re.compile(r'^([ \t]*)/\* @include ([\w./\-]+) \*/[ \t]*$', re.M)


def version():
    """VERSION に書いてある版と日付を読む。

    **ビルドした日を埋めない。** 埋めると、翌日 --check が落ちる
    （生成物は変わらないのに中身だけ日付で変わるため）。
    版を上げるときに人が VERSION を書き替える。
    """
    out = {"version": "0.0.0", "date": ""}
    if VER.exists():
        for line in VER.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                if k.strip() in out:
                    out[k.strip()] = v.strip()
    return out

STAMP = re.compile(r'^(let (?:APP_VERSION|BUILD_DATE)\s*=\s*)"[^"]*"(;)', re.M)


def stamp(html: str) -> str:
    """src/js/config.js の APP_VERSION / BUILD_DATE を VERSION の値にする。

    2行そろって見つからなければ止める。**黙って古い版を配らない。**
    """
    v = version()
    def sub(m):
        key = "version" if "APP_VERSION" in m.group(1) else "date"
        return '%s"%s"%s' % (m.group(1), v[key], m.group(2))
    out, n = STAMP.subn(sub, html)
    if n != 2:
        raise SystemExit(
            "APP_VERSION / BUILD_DATE が src/js/config.js に見当たらない（%d 行）" % n)
    return out


BANNER = ("<!-- このファイルは src/ から build.py が作る。\n"
          "     直すのは src/ のほう。ここを直しても次のビルドで消える。 -->\n")


def expand_dark(css: str) -> str:
    """@dark{ … } を、暗い配色の2つのブロックに展開する。"""
    out, i = [], 0
    for m in re.finditer(r'^@dark\{\n(.*?)^\}\n', css, re.S | re.M):
        body = m.group(1)
        indented = "".join(("  " + l if l.strip() else l) + "\n"
                           for l in body.rstrip("\n").split("\n"))
        out.append(css[i:m.start()])
        out.append(
            "@media (prefers-color-scheme:dark){\n"
            "  :root:not([data-theme=\"light\"]){\n" + indented + "  }\n}\n"
            ":root[data-theme=\"dark\"]{\n" + body + "}\n")
        i = m.end()
    out.append(css[i:])
    return "".join(out)


def render(entry: pathlib.Path):
    """@include を差し込む。差し込んだ名前の集合と一緒に返す。
    同じファイルは二度差し込まない。"""
    seen = set()
    src = entry.read_text(encoding="utf-8")

    def sub(m):
        pad, name = m.group(1), m.group(2)
        if name in seen:
            return pad + "/* %s は差し込み済み */" % name
        seen.add(name)
        path = SRC / name
        if not path.exists():
            raise SystemExit("差し込む先が無い: src/%s" % name)
        body = path.read_text(encoding="utf-8").rstrip("\n")
        if name.endswith(".css"):
            body = expand_dark(body + "\n").rstrip("\n")
        head = "%s/* ▼ src/%s ▼ */\n" % (pad, name)
        tail = "\n%s/* ▲ src/%s ▲ */" % (pad, name)
        return head + body + tail

    out = INCLUDE.sub(sub, src)
    if "@include" in out:
        raise SystemExit("差し込みきれていない @include が残っている")
    return out, seen


def main():
    check = "--check" in sys.argv
    built, seen = render(SRC / "index.html")
    built = BANNER + stamp(built)
    bad = []
    for dest in (OUT, GAS):
        dest.parent.mkdir(parents=True, exist_ok=True)
        if check:
            cur = dest.read_text(encoding="utf-8") if dest.exists() else ""
            if cur != built:
                bad.append(str(dest.relative_to(ROOT)))
        else:
            dest.write_text(built, encoding="utf-8")

    print("生成物を確認" if check else "生成")
    for n in sorted(seen):
        print("  src/%s" % n)
    v = version()
    print("  → dist/index.html ・ gas/plan.html   (%d 行)   版 %s（%s）"
          % (built.count("\n"), v["version"], v["date"] or "日付なし"))
    if check:
        if bad:
            print("\nsrc と一致しない: " + ", ".join(bad))
            print("python3 build.py で作り直す")
            return 1
        print("\n一致している")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
