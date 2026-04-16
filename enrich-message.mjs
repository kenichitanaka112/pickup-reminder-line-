#!/usr/bin/env node
/**
 * build-message の直後に挟む任意段。既定は本文を変更しない（I/O のみ）。
 * LLM で整形する場合は PICKUP_ENRICH_LLM=1 と ANTHROPIC_API_KEY（将来実装）を想定。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const mainPath = join(outDir, "main.txt");
const statusPath = join(outDir, "enrich-status.json");

function writeStatus(obj) {
  writeFileSync(statusPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

mkdirSync(outDir, { recursive: true });

const llmOn = process.env.PICKUP_ENRICH_LLM === "1";
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim());

if (!existsSync(mainPath)) {
  writeStatus({
    version: 1,
    finishedAt: new Date().toISOString(),
    applied: false,
    reason: "main.txt missing (build-message 未実行?)",
  });
  console.warn("enrich-message: out/main.txt がありません — スキップ");
  process.exit(0);
}

const mainCharsBefore = readFileSync(mainPath, "utf8").length;

if (llmOn && hasKey) {
  writeStatus({
    version: 1,
    finishedAt: new Date().toISOString(),
    applied: false,
    reason: "llm_not_implemented",
    mainCharsBefore,
    hint: "Anthropic 呼び出しは未配線。本文はそのまま。",
  });
  console.warn("enrich-message: PICKUP_ENRICH_LLM=1 かつ API キーあり — LLM 未実装のため本文は変更しません");
  process.exit(0);
}

if (llmOn && !hasKey) {
  writeStatus({
    version: 1,
    finishedAt: new Date().toISOString(),
    applied: false,
    reason: "llm_requested_no_api_key",
    mainCharsBefore,
  });
  console.warn("enrich-message: PICKUP_ENRICH_LLM=1 だが ANTHROPIC_API_KEY なし — スキップ");
  process.exit(0);
}

writeStatus({
  version: 1,
  finishedAt: new Date().toISOString(),
  applied: false,
  reason: "noop_default",
  mainCharsBefore,
});
console.log("enrich-message: noop（既定。LLM は PICKUP_ENRICH_LLM=1 で明示有効化）");
