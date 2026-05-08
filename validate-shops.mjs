#!/usr/bin/env node
/**
 * 未訪問のおすすめ店舗バリデーター
 *
 * recommended-shops.json の各店舗について以下を検証する:
 *   1. 公式 URL が HTTP 200 で応答すること
 *   2. 必須フィールド（alacarte / lunchHours / verifiedAt）が揃っていること
 *   3. alacarte が true であること
 *
 * 使用方法:
 *   node validate-shops.mjs
 *
 * CI での利用:
 *   npm run validate:shops
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 10000;
const REQUIRED_FIELDS = ["name", "url", "lunchHours", "alacarte", "verifiedAt", "description"];

const data = JSON.parse(
  readFileSync(join(__dirname, "recommended-shops.json"), "utf8")
);

let hasError = false;

async function checkUrl(shop) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(shop.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (validate-shops)" },
    });
    clearTimeout(timer);
    if (res.ok) {
      console.log(`  ✅ HP 疎通 OK  (${res.status}) ${shop.url}`);
      return true;
    } else {
      console.error(`  ❌ HP 疎通 NG (${res.status}) ${shop.url}`);
      return false;
    }
  } catch (e) {
    clearTimeout(timer);
    console.error(`  ❌ HP 疎通 NG (${e.message}) ${shop.url}`);
    return false;
  }
}

function checkFields(shop) {
  let ok = true;
  for (const f of REQUIRED_FIELDS) {
    if (shop[f] === undefined || shop[f] === null || shop[f] === "") {
      console.error(`  ❌ 必須フィールド不足: "${f}"`);
      ok = false;
    }
  }
  if (!shop.alacarte) {
    console.error(`  ❌ alacarte が false — 条件違反`);
    ok = false;
  }
  if (!shop.lunchHours || shop.lunchHours.trim() === "") {
    console.error(`  ❌ lunchHours が未設定 — 日中営業の確認が必要`);
    ok = false;
  }
  if (ok) console.log(`  ✅ 必須フィールド OK`);
  return ok;
}

console.log("=== 未訪問おすすめ店舗バリデーション ===\n");
console.log(`必須条件:`);
for (const c of data.conditions.required) console.log(`  • ${c}`);
console.log();

for (const shop of data.shops) {
  console.log(`[${shop.rank}] ${shop.name}`);
  const fieldsOk = checkFields(shop);
  const urlOk    = await checkUrl(shop);
  if (!fieldsOk || !urlOk) hasError = true;
  console.log();
}

if (hasError) {
  console.error("❌ バリデーション失敗 — 上記のエラーを修正してから git push してください。");
  process.exit(1);
} else {
  console.log("✅ 全店舗バリデーション通過 — コミット可能です。");
}
