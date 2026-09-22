---
name: testing-school-timetable
description: How to end-to-end test the school-timetable single-file app (dist/index.html) in file:// mode with Chrome + CDP — CJK input via xclip, font fixes, cellChanged instrumentation, and the impplan (年間行事からコマを作る) test path.
---

# Testing school-timetable (dist/index.html)

## Devin Secrets Needed
- None. file:// mode runs fully offline (localStorage `school-timetable/v3`).

## Launch / environment
- The app is a single file: `dist/index.html` (built by `python3 build.py` from `src/index.html` + `src/js/*.js`). Test it via `file:///home/ubuntu/repos/school-timetable/dist/index.html` in Chrome.
- Chrome runs with remote debugging on `localhost:29229` (user-data-dir `/home/ubuntu/.browser_data_dir`, `DISPLAY=:0`). Use `browser_console` for JS eval and `computer` for clicks/screenshots. There is **no node** on this box, so `tools/*.mjs` Playwright harnesses do not run.
- `file://` mode means `onGas=false`: `Backend.cellChanged` early-returns before the dirty→patchOf→flush queue, so GAS-only crash paths cannot be reproduced locally — but `cellChanged` **is still invoked**, so wrapping it verifies call-site contracts (see below).
- First launch auto-opens `#guideDlg` (once per GUIDE_KEY `school-timetable/guide-v2`). Close with 「始める」.

## CJK prerequisites (do once per box)
- Japanese text renders as tofu without `fonts-noto-cjk`: `sudo -n apt-get install -y fonts-noto-cjk` (sudo is passwordless). Chrome caches fonts — **restart Chrome** after installing. To relaunch with identical flags: dump `tr '\0' ' ' </proc/<chrome-pid>/cmdline > /tmp/chrome_args.txt` first, kill chrome, then relaunch via `python3 -c 'import subprocess; subprocess.Popen(open("/tmp/chrome_args.txt").read().split(), env={"DISPLAY":":0",...})'`; CDP :29229 comes back.
- `computer` `type` cannot enter Japanese into `contenteditable` fields — it clears the field instead. Workaround: `printf '日本語テキスト' | xclip -selection clipboard` (`apt-get install -y xclip`), click the field, then `key ctrl+v`. Works for `#pTitle` and the `#ipText` textarea.

## Verifying Backend.cellChanged call-site contracts at runtime
```js
window.__cc=[]; const _cc=Backend.cellChanged;
Backend.cellChanged=function(...a){__cc.push(a[5]);return _cc.apply(this,a);};
```
Then run the feature and inspect `window.__cc`. arg[5] is the `where` object — e.g. impplan writes must send `{year:<fy>, monday:<wkKey()>` (a `week:` key or `monday:undefined` indicates the pre-#32 bug). This works even in file:// mode where the GAS queue never engages. Restore is automatic on reload.

## impplan test path (設定 → 年間行事からコマを作る)
- Left rail 「設定」(`[data-act=settings]`) → settingsDlg card `#setImpEv` → `openImpPlan("events")` opens `#impPlanDlg` (`#ipTtl`, textarea `#ipText`, `#ipTpl` 雛形, `#ipRead` 読む, `#ipGo` 全校・学年に入れる).
- Paste TSV into `#ipText` (xclip+Ctrl+V):
  ```
  日付\t校時\t対象\t行事名\t備考
  2026-09-23\t1\t全校\tテスト全校行事\t
  2026-09-24\t3\t3年\tテスト3年行事\t
  ```
  Constraints: dates must be in the displayed week, no Sundays; 校時 "1".."6" or named slots; 対象 "全校" → school layer, "3"/"3年" → grade layer.
- 「読む」populates `#ipGrid` + `#ipStat`「N 件を入れます」and enables `#ipGo` → askOk `#okDlg` (`#okYes` 入れる) → toast「N件を入れた」.
- Verify: 全校 events appear on every class paper + 全学年 view; grade events only on matching grade classes (e.g. 3年 on 3-1 but NOT 1-1). Cells marked with red ！重なり badge + vertical 全校 ribbon when a home cell clashes.

## warnOverwritten / owDlg
- `#owDlg`「あなたの予定が上書きされています」appears when compose() resolves a clash where your (home-layer) cell loses to a newer school/grade-layer write. Reproducible in file://: write a home cell, then impplan-import a 全校 event into the same slot (school `at` is newer → wins).
- To re-trigger after ack: `week().acked.length = 0` then force a repaint (`warnOverwritten()` or `paintSheet()` via console).
- Chrome 137 does **not** throw InvalidStateError for a second `showModal()` — modal dialogs stack in the top layer (observed owDlg over settingsDlg). So the sheet.js try/catch is defensive and may be unexercised; the `if(dlg.open) return` guard (repaint while already open) is the realistically-hit path.

## Misc selectors
- Cells: `.cell` with `data-d` (0=Mon..) and `data-s` (slot id `p1`..`p6`, `brk*`). Read back via `div[aria-label="9/23（水） 1校時 教科名・行事名"]`.
- Persistence: localStorage `school-timetable/v3`; save() debounces ~400ms.
- Guide/settings may leave multiple dialogs in `document.querySelectorAll("dialog[open]")` — check `.open` flags rather than assuming one modal at a time.
