# 新しい GitHub リポジトリとして公開する手順

このフォルダ `pickup-reminder-repo/` は **commit-report-tool モノレポ内のエクスポート用コピー**（履歴なしのテンプレ）です。別リポにする方法は **A: コピーのみ** と **B: サブツリー split（`automation/pickup-reminder/` の履歴を引き継ぐ）** です。

---

## 方法 A: このフォルダをそのままルートにする（履歴なし）

1. GitHub で空のリポジトリを作成（例: `your-org/pickup-reminder-line`）。
2. ローカルで:
   ```bash
   cp -a pickup-reminder-repo /tmp/pickup-reminder-line
   cd /tmp/pickup-reminder-line
   git init
   git add .
   git commit -m "Initial import: pickup reminder standalone"
   git remote add origin https://github.com/your-org/pickup-reminder-line.git
   git branch -M main
   git push -u origin main
   ```
3. リポジトリの **Settings → Secrets and variables → Actions** に `README.md` 記載の Secret を登録。

---

## 方法 B: `git subtree split` で切り出す（`automation/pickup-reminder/` の履歴を残す）

**含まれる履歴:** モノレポで **`automation/pickup-reminder/` 以下**にあったファイルだけ。各コミットではそのプレフィックスが剥がされ、**新リポのルート**に並びます。

**含まれないもの（履歴もコミットもこの split には出ない）:**

- `automation/workflow-frame.html`（親は `automation/` のため prefix 外）
- `.github/workflows/pickup-reminder.yml`
- ルートの `package.json` の `pickup:*` 定義

→ split の直後に、**このテンプレ `pickup-reminder-repo/` から** `workflow-frame.html` / `.github/workflows/pickup-reminder.yml` / `package.json` / `SETUP-NEW-REPO.md` / `docs/` などをコピーして **追加コミット**する想定にしてください（ワークフローと UI の「中身」はテンプレが単体リポ用にパス調整済みです）。

### 手順（モノレポ clone 済みのマシン上）

プレースホルダを置き換えて実行してください。

```bash
# 1) モノレポ（commit-report-tool）のルートへ
cd /path/to/commit-report-tool

# 2) プレフィックスだけの履歴ブランチを生成（リポが大きいと数分かかることがあります）
git subtree split -P automation/pickup-reminder -b pickup-reminder-split

# 3) 空ディレクトリで新リポを受け取る
mkdir -p /tmp/pickup-reminder-line && cd /tmp/pickup-reminder-line
git init
git pull /path/to/commit-report-tool pickup-reminder-split

# 4) デフォルトブランチ名を main に（pull 直後はブランチ名が split 側に依存することがあります）
git branch -M main

# 5) prefix 外だったファイルをテンプレから足す（パスはモノレポ内の pickup-reminder-repo を指す）
MONO=/path/to/commit-report-tool
TPL="$MONO/pickup-reminder-repo"
cp "$TPL/workflow-frame.html" .
cp "$TPL/package.json" .
mkdir -p .github/workflows docs
cp "$TPL/.github/workflows/pickup-reminder.yml" .github/workflows/
cp "$TPL/docs/implementation-plan.html" docs/ 2>/dev/null || true
cp "$TPL/SETUP-NEW-REPO.md" .
# .gitignore もテンプレに合わせる場合
cp "$TPL/.gitignore" .
touch out/.gitkeep 2>/dev/null || mkdir -p out && touch out/.gitkeep

git add .
git commit -m "Add standalone UI, Actions workflow, and package.json (paths outside subtree prefix)"

# 6) リモートへ
git remote add origin https://github.com/your-org/pickup-reminder-line.git
git push -u origin main
```

### 注意

- **`git subtree split` はローカルに新しいブランチを作るだけ**です。モノレポの履歴やブランチは壊しません（不要なら `git branch -D pickup-reminder-split` で後から削除可）。
- 過去に **`automation/pickup-reminder/` にファイルを置く前**のコミットだけの時代は、split 結果の先頭が空に近いことがあります。その場合も上記テンプレ追加で実用上は問題ありません。
- より細かい履歴改変（複数ディレクトリを一気にルートへ寄せる等）は **`git filter-repo`** の領域です。今回の B は **prefix 一つ**に限定しています。

---

## ブラウザ UI

- リポジトリルートで `python3 -m http.server 8765` などを実行し、`http://127.0.0.1:8765/workflow-frame.html` を開く（`config.json` / `lib/list-b-core.mjs` は **同一オリジン**が必要）。

---

## モノレポ側の後片付け（任意）

別リポに移行が完了したら、`commit-report-tool` から `automation/pickup-reminder/` と `.github/workflows/pickup-reminder.yml` を削除し、ルート `package.json` の `pickup:*` スクリプトを外す。`automation/workflow-frame.html` の送迎ブロックは、このスタンドアロン版へリンク差し替えまたは削除。

`git subtree split` 用に作ったローカルブランチ `pickup-reminder-split` をモノレポに残す必要はありません。
