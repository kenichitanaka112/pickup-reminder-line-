# 送迎準備 — LINE・GitHub Secrets セットアップ（手順 1）

**単体リポジトリ用:** 本リポジトリは **commit-report-tool** モノレポから切り出した送迎リマインド専用レイアウトです（コミネコの設定・スキルは含みません）。

GitHub Actions から LINE に送るための **Messaging API チャネル** と **送信先 ID** を用意し、値は **GitHub Secrets** にだけ保存します。トークンやグループ ID をリポジトリにコミットしないでください。

新規リポジトリとして push する手順は [`SETUP-NEW-REPO.md`](SETUP-NEW-REPO.md) を参照してください。

## この自動化で使う GitHub Secrets（名前は固定）

| Secret 名 | 入れる値 |
|-----------|----------|
| `SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` | Messaging API の**チャネルアクセストークン**（長期または v2.1 など、コンソールの案内に従う） |
| `SOUGEI_PREP_LINE_TO` | **送信先 ID**（グループトークなら **グループ ID**。`C` で始まる文字列） |
| `SOUGEI_PREP_LINE_TEXT_2` | **GitHub Actions の本番ワークフローでは渡さない**（`out/second.txt` のみで第2通を確定させる）。ローカル `.env` でだけ緊急上書きする用途なら可。ファイルと両方指定時は **ファイル優先**（`send-local.mjs` が警告を出す）。 |
| `SOUGEI_PREP_SYNC_STATE_JSON` | （任意）**トリガー時に文面へ反映する JSON**（1 行推奨）。`build-message.mjs` が `sync-state.json` として書き出し、`visitedVenuesLog` / `freeNotes` を解釈する。未設定ならスキップ。 |
| `SOUGEI_PREP_FAILURE_WEBHOOK_URL` | （任意）失敗時の**第二候補**通知先。Discord Incoming Webhook か Slack Incoming Webhook の URL。未設定ならスキップ。 |

ワークフローでは `secrets.SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` と `secrets.SOUGEI_PREP_LINE_TO` を参照します。

### 失敗時の通知（第一優先: 届け先と同じ LINE）

[`.github/workflows/pickup-reminder.yml`](.github/workflows/pickup-reminder.yml) では、ジョブ失敗時に **同じ `SOUGEI_PREP_LINE_TO` 宛**へ `send-local.mjs` をもう一度実行し、`[送迎リマインド失敗]` で始まる短いテキストと Actions の実行 URL を送ります（別チャンネルは不要）。

### 失敗時の第二候補（プログラムで立てやすい）

**Incoming Webhook**（Discord または Slack）を 1 本用意し、`SOUGEI_PREP_FAILURE_WEBHOOK_URL` に登録する。ワークフローは `post-failure-webhook.mjs` で JSON を 1 POST するだけ（追加ライブラリなし）。

- **Discord**: サーバー設定 → 連携サービス → ウェブフック → URL をコピー（`{ "content": "..." }` で投稿）。
- **Slack**: Incoming Webhooks アプリで URL を発行（URL に `hooks.slack.com` が含まれると `{"text":"..."}` で投稿）。

**その他の第二候補（必要なら拡張）**: `post-failure-webhook.mjs` と同様に `fetch` 1 本のスクリプトを増やし、**Zapier / Make の Webhooks**、**自前の HTTPS エンドポイント**（サーバーレス関数など）へ POST する形が立てやすい。LINE 公式に失敗通知だけ送る API は別途検討（現状は同一グループ Push を第一とする）。

### 定期実行と第2通（前回のフリーメモ）

- スケジュール: **毎月 13 日 19:00（Asia/Tokyo）**（`on.schedule` の `timezone` 使用）。
- 成功時: `build-message.mjs` が `out/main.txt` と（条件付きで）`out/second.txt` を生成 → `send-local.mjs` が **第1通**・**第2通**をファイルから読み Push（`SOUGEI_PREP_LINE_TEXT_2_FILE` を参照）。
- **第2通の本文の優先順位**: `sync-state.json`（または Secret `SOUGEI_PREP_SYNC_STATE_JSON` から生成した同名ファイル）の **`freeNotes`** があればそれを「前回のフリーメモ」として送る。なければ `previous-memo.txt`（gitignore）の内容。タイトル行は `config.json` の `secondMessagePrefix`（既定 `【前回のフリーメモ】`）が先頭に付く。
- **訪問済み→よく行く店（依頼2）**: `sync-state` の `visitedVenuesLog`（1 行 1 店）があると、第1通末尾に案内ブロックを追記し、各行末尾に **`[new]`** を付けて LINE 上でも付箋相当が分かるようにする。リストを空にする操作は **ブラウザの localStorage** 側（`workflow-frame.html` の同期）に依存する旨を文面に含める。
- **Secret に JSON を置く運用**: `SOUGEI_PREP_SYNC_STATE_JSON` に [`sync-state.example.json`](sync-state.example.json) と同形の JSON を**改行なし1行**で保存する。実行直前のワークフローが `sync-state.json` に書き出してから `build-message.mjs` が読む。

#### sync-state とブラウザの境界（ブレ防止）

- **Secret に入れるとよいキー**（Actions と同じ文面契約）: `userFrequentVenuesLog`, `visitedVenuesLog`（旧名 `visitedVenues` は Node の `fetch-topics` / `build-message` でも解釈）, `freeNotes`。
- **主に端末 localStorage のまま**にしてよいもの（誤コピー防止）: `previousFreeNotesSnapshot`, `userFrequentNewTags`, `lastMonthlyReminderHookYm`, `odptConsumerKey`, `arrivalPlatformCache`, チェックリスト等。必要な分だけ手で JSON に写す。
- **`config.json` が単一のノブ**: 一覧外の軸本数上限は `listBDynamicAxesMax`（既定 8）。`config.json` の JSON 破損時は `fetch-topics` / `build-message` が **警告を出して既定テンプレで続行**する（サイレント `{}` にならない）。

### AI をサポートに使う方針（依頼4）

- **ルールベースを土台**にし、要約・店名抽出・文面整形などは **LLM API（例: Claude）や Copilot** を段階的に差し込めるようにする（**Secrets に API キー**、ワークフローから `node` スクリプト呼び出し）。
- 当面は `build-message.mjs` がテンプレ＋ `sync-state` のみ。拡張時は `` 直下に `enrich-message.mjs` のような段を挟み、**入出力をファイルで固定**すると Actions 上で差し替えやすい。

## GitHub への登録

1. GitHub リポジトリを開く → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. 上表の名前で、それぞれ値を貼り付けて保存する（2 本）

## LINE 側の準備（概要）

公式ドキュメント（優先して参照）:

- [Messaging API](https://developers.line.biz/ja/docs/messaging-api/)
- [メッセージを送信する](https://developers.line.biz/ja/docs/messaging-api/sending-messages/)（Push: `POST /v2/bot/message/push`）
- [グループトークと複数人トーク](https://developers.line.biz/ja/docs/messaging-api/group-chats/)
- [Messaging API リファレンス](https://developers.line.biz/ja/reference/messaging-api/)

### 手順の流れ

1. [LINE Developers コンソール](https://developers.line.biz/console/)でプロバイダーと **Messaging API** チャネルを作成する。
2. チャネルの **Messaging API 設定**で、**グループトーク・複数人トークへの参加を許可する** をオンにする（グループにボットを入れる場合に必要。上記公式ガイド参照）。
3. チャネルアクセストークンを発行し、その値を Secret `SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` に登録する。
4. LINE アプリで **送迎準備の通知を送りたいグループ**を開き、そのグループに **LINE 公式アカウント（このボット）を招待**する。
5. **グループ ID** を取得する（例）:
   - Webhook URL を一時的に設定し、[join イベント](https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects) などで `source.groupId` を確認する、または開発用にメッセージイベントのペイロードから `groupId` を控える。  
   - 取得した ID を Secret `SOUGEI_PREP_LINE_TO` に登録する（`to` にそのまま使う値）。

### ローカルで試す（GitHub ログイン不要）

トークンとグループ ID が揃っていれば、**この PC のターミナル**だけで 1 通送れます。

**方法 A: `.env` ファイル（いちばん簡単・ターミナルに長いトークンを貼らない）**

**重要:** コピー元は **`env.example`** だけです。置き場所も **`.env`**（`send-local.mjs` と同じフォルダ）に限定してください。**リポジトリルートの `.env` はこのスクリプトでは読みません。**

1. `env.example` をコピーし、同じフォルダに **`.env`** という名前で保存する。  
2. Cursor などで `.env` を開き、`SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN` と `SOUGEI_PREP_LINE_TO` の右側に **実際の値だけ**を貼る（説明文は書かない）。保存する。  
3. リポジトリのルートで（Node 18+）:

```bash
node send-local.mjs
# または: npm run pickup:send-local
```

`.env` はルートの `.gitignore` で無視されるので **コミットされません**。それでも念のため `git status` で `.env` が出ていないか確認してください。

**方法 B: 環境変数で渡す**

```bash
export SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN='（LINE Developers でコピーしたトークン）'
export SOUGEI_PREP_LINE_TO='（グループ ID など）'
# 任意: export SOUGEI_PREP_LINE_TEXT='送迎準備テスト'
node send-local.mjs
```

成功すると `OK (200)` と `x-line-request-id` が表示されます。

**方法 C: curl**

トークンはシェル履歴に残りやすいので、試したあと **トークン再発行**も検討してください。

```bash
curl -sS -X POST "https://api.line.me/v2/bot/message/push" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN の値>" \
  -d '{"to":"<SOUGEI_PREP_LINE_TO の値>","messages":[{"type":"text","text":"送迎準備テスト"}]}'
```

成功時は HTTP 200 で本文は `{}` に近い形です。公式: [Push message](https://developers.line.biz/ja/reference/messaging-api/#send-push-message)。

## GitHub Actions（本番）

ワークフロー: [`.github/workflows/pickup-reminder.yml`](.github/workflows/pickup-reminder.yml)

- `workflow_dispatch` で手動実行も可能。
- 文面テンプレは [`config.json`](config.json)（`mainTemplate` の `{{dateJa}}` が東京日付に置換）。
- `fetch-topics.mjs` → `build-message.mjs` → **`enrich-message.mjs`（任意フック・既定は noop）** → `send-local.mjs`。取得は RSS/Atom と一覧外（`sync-state.json` の語から軸推定→**Google ニュース RSS** が優先、軸が立たないときのみ `listBCandidateFeeds`）。取得に失敗してもジョブは続行（`continue-on-error`）。
- 各実行のあと **`write-pickup-job-summary.mjs`** が GitHub の **Job summary** に1ブロック追記（`out/fetch-status.json` / `out/enrich-status.json` / `main.txt` サイズ）。緑完走でも取得の問題行数を一覧できる。

## ローカル: 文面ビルドのみ

```bash
npm run pickup:fetch-topics   # topicFeeds → out/topics-snippet.txt、一覧外 → out/list-b-snippet.txt（動的優先）+ out/fetch-status.json
npm run pickup:build-message
npm run pickup:enrich-message # 既定 noop → out/enrich-status.json
npm run pickup:job-summary    # ローカルでは表を stdout（Actions では Job summary へ）
# → out/main.txt
```

一覧外の軸・除外ロジックの単一実装は [`lib/list-b-core.mjs`](lib/list-b-core.mjs)。回 regressions 用に `npm run test:pickup`（`node --test`）を用意しています。

### 直近の話題（RSS / Atom）

[`config.json`](config.json) の `topicFeeds`（`{ "label", "url" }` の配列）に RSS 2.0 または Atom の URL を列挙します。`npm run pickup:fetch-topics` で `out/topics-snippet.txt` を書き出し、`build-message.mjs` が第1通の末尾付近にその内容を追記します。件数・タイムアウトは `topicFetchMaxPerFeed` / `topicFetchTimeoutMs` で調整できます。

[`workflow-frame.html`](workflow-frame.html) の「直近の話題」カードは引き続き**静的モック**です。LINE に入る見出しは上記スクリプトの取得結果に依存し、モックのカード本文と一致しないことがあります。

### 一覧外・追加候補（トリガー取得）

1. **優先（Actions / `fetch-topics.mjs`）**: `sync-state.json`（Secret `SOUGEI_PREP_SYNC_STATE_JSON`）の **`userFrequentVenuesLog` と `visitedVenuesLog`（または `visitedVenues`）** の語から、[`config.json`](config.json) の `listBDynamicAxes`（`keywords` + `searchQuery`）で軸を立て、**同時に試す軸の本数上限は `listBDynamicAxesMax`**、**各軸あたり最大 `listBDynamicMaxPerAxis` 件（1〜3・該当なしは 0）** を Google ニュース RSS で取得します。`listBExcludeTitleFragments` と店名行で見出しを除外し、**一覧の固定店に寄せた見出しを落とす**想定です。行末に **詳細 URL** を付けます。
2. **フォールバック**: どの軸も立たないときだけ、従来どおり `listBCandidateFeeds`（`{ "label", "url" }`）の静的 RSS を使います。件数は `listBFetchMaxPerFeed`（未指定時は `topicFetchMaxPerFeed` と同じ）。
3. **ブラウザ**: [`workflow-frame.html`](workflow-frame.html) の「一覧外・追加候補」ブロックでは **Wikipedia API**（`origin=*`）で同じ軸の検索をし、**詳細**ボタンで記事に飛びます（CORS の都合で Google RSS は手元では使わない）。**参照レベル**で、LINE 本番文面は Actions 側の取得結果に依存します。

#### 一覧外: Node（Actions）とブラウザの取得元が違う理由（案1・意図的分岐）

- **Actions の `fetch-topics.mjs`**: サーバーから **Google ニュース RSS** を取り、LINE 用スニペットに使う（CORS なし）。
- **ブラウザのプレビュー**: 手元からは **Wikipedia 検索 API** だけが同一オリジンで呼びやすいため、**近似プレビュー**にしている。軸の立て方・除外語は [`lib/list-b-core.mjs`](lib/list-b-core.mjs) で Node と共有し、**見出しの中身の出どころだけ**が異なる。
- 将来、プロキシやサーバ側取得で揃えるかは任意。現状は「本番＝Google」「手元プレビュー＝Wikipedia」でブレを README とコードで固定する。

**各配信元・Wikipedia の利用条件を確認**してください。

## ブラウザ（workflow-frame）との連携

[`workflow-frame.html`](workflow-frame.html) の送迎準備ビューでは、**毎月13日以降の初回表示**にだけ確認ダイアログが出ます（同意時のみ実行）。

- **一覧外の追加候補**は固定カード一覧には含めず、**トリガー時**に `fetch-topics.mjs` が `out/list-b-snippet.txt` を生成します（よく行く店・訪問済みから軸推定→RSS。手元では「いま取得する」または月次同期直後に Wikipedia で近似表示）。
- **訪問済み店リスト**の行を **ユーザー追加のよく行く店**（1行1店・同一形式）へ移し、訪問リストは空にする。
- **今回のフリーメモ**の内容を **前回のフリーメモ（コピー用）** 欄にスナップし、入力欄は空にする（LINE 第2通に貼る用）。

**GitHub トリガーとの二重経路**: Actions は **LINE 文面**で「前回のフリーメモ」相当と訪問済み案内を送れるが、**端末の localStorage を直接消したり移したりはできない**。ブラウザの同期ダイアログと併用するか、LINE のコピペを手元で「前回のフリーメモ」欄に貼り戻す運用とする。

UI モックの設計メモは [`workflow-frame.html`](workflow-frame.html) にあり、届け先の説明と本 README の Secret 名を対応させています。図解の実装計画は [`docs/implementation-plan.html`](docs/implementation-plan.html) を参照。
