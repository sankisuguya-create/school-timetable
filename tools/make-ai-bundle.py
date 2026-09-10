#!/usr/bin/env python3
"""Create a single, self-contained source document for an external AI."""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "EXTERNAL_AI_BUNDLE.md"

# These are generated, binary, or the output itself. The canonical inputs are included.
EXCLUDED = {
    "EXTERNAL_AI_BUNDLE.md",
    "dist/index.html",
    "gas/plan.html",
    "tools/_print.png",
}


def git(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args], cwd=ROOT, text=True, encoding="utf-8"
    ).strip()


def language(path: str) -> str:
    return {
        ".css": "css",
        ".gs": "javascript",
        ".html": "html",
        ".js": "javascript",
        ".json": "json",
        ".md": "markdown",
        ".py": "python",
    }.get(Path(path).suffix, "text")


def main() -> None:
    paths = [
        path
        for path in git("ls-files").splitlines()
        if path not in EXCLUDED and not path.startswith("node_modules/")
    ]
    version_lines = (ROOT / "VERSION").read_text(encoding="utf-8").splitlines()
    version = " / ".join(
        line.strip() for line in version_lines if line.startswith(("version:", "date:"))
    )

    sections = [
        "# school-timetable 外部AI受け渡し用コード\n",
        "> このファイルは `python3 tools/make-ai-bundle.py` で生成した読み取り専用の資料です。\n"
        "> 修正は各 `## File:` に示した元ファイルへ行い、このファイルへ直接行わないでください。\n",
        f"- VERSION: `{version}`",
        "- 生成物の `dist/index.html` と `gas/plan.html` は省略しています。"
        "それぞれ `python3 build.py` で収録済みの `src/` から再生成できます。",
        "- バイナリの `tools/_print.png` と、このファイル自身も省略しています。\n",
        "## 収録ファイル\n",
        *(f"- `{path}`" for path in paths),
        "",
    ]

    for path in paths:
        content = (ROOT / path).read_text(encoding="utf-8")
        # A longer fence keeps embedded Markdown fences from ending the section.
        sections.extend(
            [
                f"## File: `{path}`\n",
                f"````{language(path)}",
                content.rstrip("\n"),
                "````\n",
            ]
        )

    OUTPUT.write_text("\n".join(sections), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(paths)} files)")


if __name__ == "__main__":
    main()
