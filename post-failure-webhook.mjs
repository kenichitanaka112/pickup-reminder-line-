#!/usr/bin/env node
/**
 * 失敗時の第二通知: Webhook 1 本 POST（任意）。
 * SOUGEI_PREP_FAILURE_WEBHOOK_URL が未設定なら何もせず 0 終了。
 *
 * Discord Incoming Webhook: JSON { "content": "..." }
 * Slack Incoming Webhook:  JSON { "text": "..." }（URL に slack が含まれる場合）
 */

const url = process.env.SOUGEI_PREP_FAILURE_WEBHOOK_URL;
if (!url || !url.trim()) {
  console.log("post-failure-webhook: SOUGEI_PREP_FAILURE_WEBHOOK_URL なし — スキップ");
  process.exit(0);
}

const text =
  process.env.SOUGEI_PREP_FAILURE_WEBHOOK_TEXT ||
  "[送迎リマインド] GitHub Actions が失敗しました。ログを確認してください。";

const isSlack = /hooks\.slack\.com/i.test(url);
const body = isSlack ? JSON.stringify({ text }) : JSON.stringify({ content: text });

const res = await fetch(url.trim(), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});

if (!res.ok) {
  const t = await res.text().catch(() => "");
  console.error(`post-failure-webhook: HTTP ${res.status}`, t.slice(0, 500));
  process.exit(1);
}

console.log(`post-failure-webhook: OK (${res.status})`);
