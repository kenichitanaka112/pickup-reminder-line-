#!/usr/bin/env node
/**
 * 送迎リマインド: メイン文面を組み立て、out/main.txt に書き出す（GitHub Actions 用）。
 * 第2メッセージは send-local が SOUGEI_PREP_LINE_TEXT_2 / _2_FILE で読む。
 *
 * 任意の sync-state.json（または Actions が Secret から生成した同名ファイル）:
 * - visitedVenuesLog（または visitedVenues）: 訪問済み1行1店 → 第1通末尾に「よく行く店」向け案内＋各行に [new] 付与
 * - freeNotes: 第2通「前回のフリーメモ」本文（previous-memo.txt より優先）
 *
 * 任意の out/topics-snippet.txt（fetch-topics.mjs が生成）:
 * - 第1通に「直近の話題（自動取得）」ブロックとして追記
 *
 * 任意の out/list-b-snippet.txt（fetch-topics.mjs が生成）:
 * - 第1通に「一覧外・追加候補」ブロックとして追記
 * - 優先: sync の userFrequentVenuesLog / visited から軸推定→Google ニュース RSS（各軸1〜3・詳細URL）
 * - 軸が立たないとき: listBCandidateFeeds の静的 RSS にフォールバック
 *
 * このあと Actions では enrich-message.mjs が out/main.txt を任意加工し得る（既定 noop）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const configPath = join(__dirname, "config.json");
const syncPath = join(__dirname, "sync-state.json");

function tokyoDateJa() {
  const d = new Date();
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

const DEFAULT_CONFIG = {
  mainTemplate: "【送迎準備】{{dateJa}}\n",
  secondMessagePrefix: "【前回のフリーメモ】\n",
};

function loadConfig() {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn(
      `build-message: config.json を読めません (${e instanceof Error ? e.message : String(e)}) — 既定テンプレで続行します`
    );
    return { ...DEFAULT_CONFIG };
  }
}

function parseNonEmptyLines(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function loadSyncState() {
  if (!existsSync(syncPath)) return null;
  try {
    const raw = readFileSync(syncPath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`sync-state.json: ${e.message}`);
    return null;
  }
}

function stripCommentLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith("#");
    })
    .join("\n")
    .trim();
}

const cfg = loadConfig();
let main = (cfg.mainTemplate || "").replace(/\{\{dateJa\}\}/g, tokyoDateJa());

const topicsPath = join(outDir, "topics-snippet.txt");
if (existsSync(topicsPath)) {
  const chunk = readFileSync(topicsPath, "utf8").trim();
  if (chunk) main += `\n\n${chunk}`;
}

const listBPath = join(outDir, "list-b-snippet.txt");
if (existsSync(listBPath)) {
  const chunk = readFileSync(listBPath, "utf8").trim();
  if (chunk) main += `\n\n${chunk}`;
}

const sync = loadSyncState();
if (sync && typeof sync === "object") {
  const visited = parseNonEmptyLines(sync.visitedVenuesLog || sync.visitedVenues || "");
  if (visited.length) {
    const lines = visited.map((name) => `・${name} [new]`).join("\n");
    main +=
      "\n\n【訪問済み→よく行く店】\n" +
      "次の店名を「ユーザー追加のよく行く店」と同じ1行1店の形式で反映してください（workflow-frame.html の送迎準備ビューと同一ルール）。\n" +
      `${lines}\n` +
      "訪問済みリストはブラウザ側で空にしてください（GitHub から localStorage は直接操作できません）。\n";
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "main.txt"), main, "utf8");
console.log(`Wrote ${join(outDir, "main.txt")}`);

const prefix = cfg.secondMessagePrefix || "【前回のフリーメモ】\n";
let secondBody = "";

const memoFromSync = sync && String(sync.freeNotes || "").trim();
if (memoFromSync) {
  secondBody = memoFromSync;
}

const prevPath = join(__dirname, "previous-memo.txt");
if (!secondBody && existsSync(prevPath)) {
  secondBody = stripCommentLines(readFileSync(prevPath, "utf8"));
}

if (secondBody) {
  writeFileSync(join(outDir, "second.txt"), prefix + secondBody + "\n", "utf8");
  console.log(`Wrote ${join(outDir, "second.txt")} (${memoFromSync ? "from sync-state" : "from previous-memo.txt"})`);
}
