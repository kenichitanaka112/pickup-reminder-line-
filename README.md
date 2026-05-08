# 送迎準備リマインド

毎月13日に GitHub Actions が自動実行され、LINE グループへ準備チェックリストを Push 送信します。
あわせて GitHub Pages でインタラクティブなチェックリスト・ニュース・店舗情報が確認できます。

---

## パイプライン概要

```
GitHub Actions (毎月13日 19:00 JST / 手動)
  │
  ├─ fetch-digest.mjs   … 4トピックの Google News RSS を取得 → out/digest.json
  │    └─ git commit & push（GitHub Pages へ自動反映）
  │
  ├─ build-message.mjs  … config.json テンプレートに日付を埋め込み → out/main.txt
  ├─ enrich-message.mjs … 将来の LLM フック用（現在 noop）
  ├─ write-pickup-job-summary.mjs … GitHub Actions Job summary に出力
  └─ send-local.mjs     … LINE Messaging API で Push 送信
```

---

## GitHub Secrets

| Secret 名 | 必須 | 内容 |
|-----------|------|------|
| `SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Messaging API チャネルアクセストークン |
| `SOUGEI_PREP_LINE_TO` | ✅ | 送信先 ID（グループトークなら `C` 始まりのグループ ID） |
| `SOUGEI_PREP_SYNC_STATE_JSON` | 任意 | `sync-state.json` 相当の JSON（1行）。`visitedVenuesLog` / `freeNotes` を解釈し第2通に使用 |
| `SOUGEI_PREP_FAILURE_WEBHOOK_URL` | 任意 | 失敗時の通知先（Discord / Slack Incoming Webhook URL） |

### Secrets の登録手順

1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. 上表の名前で値を登録する

---

## LINE 側の準備

1. [LINE Developers コンソール](https://developers.line.biz/console/)でプロバイダーと **Messaging API** チャネルを作成
2. **Messaging API 設定** → 「グループトーク・複数人トークへの参加を許可」をオンにする
3. チャネルアクセストークンを発行 → Secret `SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` に登録
4. 送信先グループにボット（公式アカウント）を招待
5. グループ ID を取得（Webhook で `source.groupId` を確認）→ Secret `SOUGEI_PREP_LINE_TO` に登録

---

## ローカルでのテスト送信

### 準備

```bash
# env.example をコピーして .env を作成
cp env.example .env
# .env を開いて SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN と SOUGEI_PREP_LINE_TO に値を入力
```

`.env` は `.gitignore` で除外されているためコミットされません。

### 文面ビルド → 送信

```bash
node build-message.mjs          # → out/main.txt を生成
cat out/main.txt                 # 内容確認

node send-local.mjs              # LINE に送信（.env の SOUGEI_PREP_LINE_TEXT_FILE=out/main.txt を参照）
```

### ニュース取得のみ実行

```bash
npm run pickup:fetch-digest      # → out/digest.json を生成
```

### テスト実行

```bash
npm run test:pickup              # lib/list-b-core.mjs のユニットテスト
```

---

## GitHub Pages（workflow-frame.html）

本リポジトリの GitHub Pages（`https://kenichitanaka112.github.io/pickup-reminder-line-/workflow-frame.html`）で以下が確認できます。

| セクション | 内容 |
|-----------|------|
| 準備チェックリスト | 出発前の確認項目（localStorage に記録・進捗表示） |
| 車内チェックリスト | ガソリン・清掃・空調・音楽 等 |
| カテゴリー別・直近の話題 | `out/digest.json` を動的読み込み（大谷・谷川萌々子・鬼滅・髭男） |
| よく行く店候補 | アコーディオンで住所・ルート等を表示 |
| 未訪問のおすすめ | 3件の提案店舗（クリックで公式サイト） |
| フリーメモ・訪問済みリスト | 端末 localStorage に保存 |

### digest.json の更新タイミング

GitHub Actions 実行時に `fetch-digest.mjs` が `out/digest.json` を生成し、リポジトリにコミット・プッシュします。
GitHub Pages はプッシュから数分で反映されます。

---

## 設定ファイル

### config.json

```jsonc
{
  "mainTemplate": "LINE に送る文面テンプレート（{{dateJa}} が日付に置換）",
  "secondMessagePrefix": "第2通の先頭文字列",
  "listBExcludeTitleFragments": ["除外ワード", ...]  // workflow-frame.html のブラウザ側で使用
}
```

`mainTemplate` の `{{dateJa}}` は実行時の日本語日付（例: `2026年5月13日(水)`）に置換されます。

---

## 失敗時の通知

| 通知先 | 仕組み |
|--------|--------|
| LINE（第一）| ジョブ失敗時に同じグループへ `[送迎リマインド失敗]` + Actions URL を Push |
| Webhook（任意）| `post-failure-webhook.mjs` が `SOUGEI_PREP_FAILURE_WEBHOOK_URL` へ POST |

---

## 共有ライブラリ

`lib/list-b-core.mjs` は `workflow-frame.html`（ブラウザ）とテストで共有するモジュールです。
Node のパイプラインからは直接使用していません。

---

## npm スクリプト一覧

| コマンド | 内容 |
|---------|------|
| `npm run pickup:fetch-digest` | ニュース取得 → out/digest.json |
| `npm run pickup:build-message` | 文面生成 → out/main.txt |
| `npm run pickup:enrich-message` | エンリッチ（現在 noop） |
| `npm run pickup:job-summary` | Job summary 出力（ローカルは stdout） |
| `npm run pickup:send-local` | LINE 送信 |
| `npm run test:pickup` | ユニットテスト |
