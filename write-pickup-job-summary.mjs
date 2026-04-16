#!/usr/bin/env node
/**
 * GitHub Actions の Job summary（$GITHUB_STEP_SUMMARY）へ Markdown を追記。
 * ローカルでは GITHUB_STEP_SUMMARY が無い場合は stdout のみ。
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function safeReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const fetchS = safeReadJson(join(outDir, "fetch-status.json"));
const enrichS = safeReadJson(join(outDir, "enrich-status.json"));
const mainPath = join(outDir, "main.txt");
let mainNote = "なし";
if (existsSync(mainPath)) {
  const n = readFileSync(mainPath, "utf8").length;
  mainNote = `${n} 文字`;
}

const lines = ["## 送迎リマインド（取得 / enrich）", ""];

if (fetchS) {
  lines.push(
    "| 項目 | 値 |",
    "|------|-----|",
    `| topics モード | ${escapeCell(String(fetchS.topicsMode ?? ""))} |`,
    `| topics 箇条書き行 | ${fetchS.topicsBulletLines ?? 0} |`,
    `| topics 取得系の問題行 | ${fetchS.topicsIssueLines ?? 0} |`,
    `| list-b モード | ${escapeCell(String(fetchS.listBMode ?? ""))} |`,
    `| list-b 箇条書き行 | ${fetchS.listBBulletLines ?? 0} |`,
    `| list-b 取得系の問題行 | ${fetchS.listBIssueLines ?? 0} |`,
    `| 一覧外 動的軸ヒット数 | ${fetchS.listBDynamicAxesHit ?? 0} |`,
    `| 致命的エラー | ${fetchS.fatalError ? escapeCell(String(fetchS.fatalError)) : "なし"} |`,
    ""
  );
} else {
  lines.push("（`out/fetch-status.json` なし — fetch-topics 未実行または古い実行）", "");
}

if (enrichS) {
  lines.push(
    "### enrich-message",
    "",
    "| 項目 | 値 |",
    "|------|-----|",
    `| 本文変更 | ${enrichS.applied ? "あり" : "なし"} |`,
    `| 理由 | ${escapeCell(String(enrichS.reason ?? ""))} |`,
    `| main.txt（処理前） | ${enrichS.mainCharsBefore ?? "—"} 文字 |`,
    ""
  );
} else {
  lines.push("### enrich-message", "", "（`out/enrich-status.json` なし）", "");
}

lines.push("### build 出力", "", `- **out/main.txt**: ${mainNote}`, "");

const md = lines.join("\n");

if (summaryPath) {
  appendFileSync(summaryPath, md, "utf8");
} else {
  console.log(md);
}

function escapeCell(s) {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 500);
}
