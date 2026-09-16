# 軽量DDDの境界

このリポジトリは、全面的なDDD再構築を行わない。
GASウェブアプリ、Google Sheetsの列構成、既存データ、画面API、印刷・たんぽぽ出力を正本として維持し、業務ルールの一部だけを副作用のない形に切り出す。

## 何をドメインとするか

| 業務概念 | Domain.gsの関数 | 呼び出し元 |
|---|---|---|
| 1コマの一意性 | `cellKey` | `Store.writeCells` |
| 保存結果の識別 | `resultKey` | `Store.writeCells` |
| コマを空にしたときの削除 | `isRemoval` | `Store.writeCells` |
| 古い画面からの保存競合 | `expectedVersionMatches` | `Store.writeCells` |
| 変更がどの学級へ届くか | `affectsClass` | `markTpChanges_` |
| 提出状態の画面用表現 | `submissionView` | `tpSubmits` |
| 出力中の提出状態変化 | `submissionUnchanged` | `exportWeek_` |
| 同一ミリ秒の提出防止 | `nextSubmissionTimestamp` | `tpSubmit` |

## 依存の向き

```text
画面API
  ↓
Store.gs（業務処理の手順）
  ↓
Domain.gs（副作用のない業務判定）
  ↓
Sheets.gs（Google Sheetsへの読み書き）
```

厳密な層分けではなく、既存の`Store.gs`を壊さないための最小境界である。

## 守る規則

- `Domain.gs`からGoogle Apps ScriptやGoogle Sheetsを直接呼ばない。
- 既存のシート列・シート名・API引数・戻り値の形を変えない。
- 学級名の日付化など、保存先固有の変換は`Sheets.asClass`を引数で渡す。
- 新しい業務ルールを追加したら、まず`gas/domaincheck.js`に単体検査を追加する。
- 画面の色・表示・印刷版面だけの変更は、Domain.gsへ入れない。
- 新しいルールの追加でStoreの処理が読みにくくなった場合だけ、別のユースケース分離を検討する。

## データ移行

移行は不要である。

現在の1行1コマの形式を読み込み、処理中にDomain.gsの判定を通し、同じ形式へ書き戻す。既存の時間割データ、A週・B週、提出記録、たんぽぽ出力先はそのまま利用する。

## 検査

```text
node gas/domaincheck.js
npm test
```

`npm test`には`domaincheck.js`が含まれる。ブラウザを使う検査は、PlaywrightのChromiumが利用できる環境で実行する。
