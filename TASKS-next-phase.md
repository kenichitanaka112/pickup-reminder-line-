# 次の段 — 具体タスク（反映状況）

## 1. Job summary（＋ enrich 段）

| # | タスク | 状態 |
|---|--------|------|
| 1.1 | `fetch-topics.mjs` が `out/fetch-status.json` を **常に** 書く（topics / list-b モード・箇条書き行数・問題行・致命的エラー） | 済 |
| 1.2 | `enrich-message.mjs` が `out/enrich-status.json` を書く（noop / 将来 LLM） | 済 |
| 1.3 | `write-pickup-job-summary.mjs` が `$GITHUB_STEP_SUMMARY` に Markdown 追記 | 済 |
| 1.4 | `.github/workflows/pickup-reminder.yml` に **enrich** ステップと **`if: always()`** の summary ステップを挿入 | 済 |
| 1.5 | 本番ワークフロー手動実行で Job summary に表が出ることを確認 | 要確認（あなたのリポで1回 dispatch） |

## 2. enrich フック（案採用）

| # | タスク | 状態 |
|---|--------|------|
| 2.1 | `build-message` → **`enrich-message`** → `send-local` の順をワークフローに固定 | 済 |
| 2.2 | 既定は **本文変更なし**（`PICKUP_ENRICH_LLM=1` かつ `ANTHROPIC_API_KEY` 時も未配線で明示スキップ） | 済 |
| 2.3 | Anthropic で要約・整形する場合: `enrich-message.mjs` 内に API 呼び出しを実装し、`applied: true` と差分を `enrich-status` に記録 | 未（将来） |

## 3. list-b-core のテスト（案採用）

| # | タスク | 状態 |
|---|--------|------|
| 3.1 | `node --test` で `test/list-b-core.test.mjs` | 済 |
| 3.2 | `package.json` の `test:pickup` | 済 |
| 3.3 | CI で `npm run test:pickup` を回す（任意・ワークフローに1行追加） | 未 |

## 4. README 案1（取得元の意図的分岐）

| # | タスク | 状態 |
|---|--------|------|
| 4.1 | Node＝Google RSS、ブラウザ＝Wikipedia 近似の **理由と境界** を README に明文化 | 済 |
| 4.2 | `list-b-core.mjs` 単一ソースであることを README に追記 | 済（ローカル手順ブロック内） |
