#!/usr/bin/env node
/**
 * 送迎準備: LINE push（1 リクエストに複数テキスト可）。
 *
 * 本文の渡し方:
 *   - SOUGEI_PREP_LINE_TEXT または SOUGEI_PREP_LINE_TEXT_FILE（ファイル優先で上書き）
 *   - 任意の第2通: SOUGEI_PREP_LINE_TEXT_2_FILE を優先、無ければ SOUGEI_PREP_LINE_TEXT_2（空なら送らない）
 *     両方指定時はファイルが勝つ（Secret とビルド成果のブレ防止のため CI ではファイルのみ推奨）
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN_KEY = "SOUGEI_PREP_LINE_CHANNEL_ACCESS_TOKEN";
const TO_KEY = "SOUGEI_PREP_LINE_TO";
const envPath = join(__dirname, ".env");

function parseLineValue(trimmed) {
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = parseLineValue(trimmed);
    if (!parsed) continue;
    const { key, val } = parsed;
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function assignmentStatesInFile(filePath, keys) {
  const states = Object.fromEntries(keys.map((k) => [k, "absent"]));
  if (!existsSync(filePath)) return states;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = parseLineValue(trimmed);
    if (!parsed || !keys.includes(parsed.key)) continue;
    states[parsed.key] = parsed.val === "" ? "empty" : "set";
  }
  return states;
}

function readBody(envKey, fileKey) {
  const fp = process.env[fileKey];
  if (fp && String(fp).trim() && existsSync(fp)) {
    return readFileSync(fp, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  }
  const t = process.env[envKey];
  return t != null && String(t).trim() ? String(t).trimEnd() : "";
}

loadDotEnv(envPath);

if (
  process.env.SOUGEI_PREP_LINE_TEXT_2_FILE &&
  String(process.env.SOUGEI_PREP_LINE_TEXT_2_FILE).trim() &&
  process.env.SOUGEI_PREP_LINE_TEXT_2 != null &&
  String(process.env.SOUGEI_PREP_LINE_TEXT_2).trim()
) {
  console.warn(
    "send-local: 第2通は SOUGEI_PREP_LINE_TEXT_2_FILE が優先されます。SOUGEI_PREP_LINE_TEXT_2 も設定されている場合、ファイルが読めれば env は無視されます（二重指定を避けてください）。"
  );
}

const token = process.env[TOKEN_KEY];
const to = process.env[TO_KEY];

if (!token || !to) {
  console.error(`${TOKEN_KEY} と ${TO_KEY} の両方が必要です（いずれかが未設定です）。`);
  if (!existsSync(envPath)) {
    console.error(`  .env が見つかりません: ${envPath}`);
    console.error(
      "  env.example を同じフォルダにコピーし、.env にリネームして値を埋めてください。"
    );
  } else {
    const st = assignmentStatesInFile(envPath, [TOKEN_KEY, TO_KEY]);
    const hints = [];
    if (!token) {
      if (st[TOKEN_KEY] === "empty") {
        hints.push(`${TOKEN_KEY} の行はありますが = の右が空です。`);
      } else if (st[TOKEN_KEY] === "absent") {
        hints.push(
          `${TOKEN_KEY} が .env に見当たりません（変数名の typo や全角文字の可能性）。`
        );
      }
    }
    if (!to) {
      if (st[TO_KEY] === "empty") {
        hints.push(`${TO_KEY} の行はありますが = の右が空です。`);
      } else if (st[TO_KEY] === "absent") {
        hints.push(
          `${TO_KEY} が .env に見当たりません（変数名の typo や全角文字の可能性）。`
        );
      }
    }
    if (hints.length) {
      for (const h of hints) console.error(`  ${h}`);
    } else {
      console.error(
        "  .env には値が書かれているように見えますが、シェル側の空の環境変数が優先されている可能性があります。unset するか、ターミナルを開き直してから再実行してください。"
      );
    }
    console.error(`  設定ファイル: ${envPath}`);
  }
  console.error("  または、環境変数で同じ名前を渡してください。");
  console.error(`  ひな型: ${join(__dirname, "env.example")}`);
  process.exit(1);
}

const t1 = readBody("SOUGEI_PREP_LINE_TEXT", "SOUGEI_PREP_LINE_TEXT_FILE");
const t2 = readBody("SOUGEI_PREP_LINE_TEXT_2", "SOUGEI_PREP_LINE_TEXT_2_FILE");

const texts = [];
if (t1) texts.push(t1);
if (t2) texts.push(t2);
if (texts.length === 0) texts.push("送迎準備テスト（ローカル）");

const messages = texts.map((text) => ({ type: "text", text }));

const body = { to, messages };

const res = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(body),
});

const reqId = res.headers.get("x-line-request-id");
let errBody = "";
try {
  errBody = await res.text();
} catch {
  /* ignore */
}

if (!res.ok) {
  console.error(`HTTP ${res.status}${reqId ? `  x-line-request-id: ${reqId}` : ""}`);
  if (errBody && errBody.length < 2000) console.error(errBody);
  process.exit(1);
}

console.log(`OK (${res.status})${reqId ? `  x-line-request-id: ${reqId}` : ""}  messages=${messages.length}`);
