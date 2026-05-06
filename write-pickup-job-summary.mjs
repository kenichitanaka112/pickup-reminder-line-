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

const enrichS = safeReadJson(join(outDir, "enrich-status.json"));
const mainPath = join(outDir, "main.txt");
let mainNote = "なし";
if (existsSync(mainPath)) {
  const n = readFileSync(mainPath, "utf8").length;
  mainNote = `${n} 文字`;
}

const lines = ["## 送迎リマインド（enrich / build）", ""];

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
