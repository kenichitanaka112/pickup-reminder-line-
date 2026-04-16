#!/usr/bin/env node
/**
 * トリガー時: config.json の RSS / Atom を取得しスニペットを out/ に書く。
 * - topicFeeds → topics-snippet.txt（直近の話題）
 * - list-b: ① listBDynamicAxes + sync-state（よく行く店・訪問済み）から軸推定 → Google ニュース RSS（各軸1〜3・URL付き）
 *          ② 軸が一つも立たないときのみ listBCandidateFeeds（静的URL列）にフォールバック
 * build-message.mjs が第1通に順に追記する。
 * 終了時に必ず out/fetch-status.json を書く（GitHub Job summary 用）。
 *
 * 失敗してもプロセスは 0 終了（Actions では continue-on-error 併用可）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeVenueLines,
  pickActiveAxes,
  buildExcludeFragments,
  titleExcluded,
  listBDynamicMaxPerAxis,
  listBDynamicFetchPool,
} from "./lib/list-b-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const configPath = join(__dirname, "config.json");
const syncPath = join(__dirname, "sync-state.json");
const topicsOut = join(outDir, "topics-snippet.txt");
const listBOut = join(outDir, "list-b-snippet.txt");
const fetchStatusOut = join(outDir, "fetch-status.json");

/** @param {string[]} lines */
function countBulletLines(lines) {
  return lines.filter((l) => l.startsWith("・")).length;
}

/** @param {string[]} lines */
function countTopicIssueLines(lines) {
  return lines.filter(
    (l) => l.includes("取得失敗") || l.includes("見出しを取得できませんでした")
  ).length;
}

function loadConfig() {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn(
      `fetch-topics: config.json を読めません (${e instanceof Error ? e.message : String(e)}) — 空設定として続行します`
    );
    return {};
  }
}

function loadSyncState() {
  if (!existsSync(syncPath)) return null;
  try {
    return JSON.parse(readFileSync(syncPath, "utf8"));
  } catch {
    return null;
  }
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, "").trim();
}

function decodeBasicEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function normalizeTitle(raw) {
  let t = raw.trim();
  if (t.startsWith("<![CDATA[")) {
    t = t.slice(9).replace(/\]\]>\s*$/g, "").trim();
  }
  t = stripTags(t);
  t = decodeBasicEntities(t);
  return t.replace(/\s+/g, " ").trim();
}

/** RSS 2.0 の item から title を最大 max 件 */
function titlesFromRss(xml, max) {
  const titles = [];
  const itemRe = /<item\b[^>]*>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && titles.length < max) {
    const block = m[0];
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    if (!tm) continue;
    const t = normalizeTitle(tm[1]);
    if (t && !titles.includes(t)) titles.push(t.slice(0, 220));
  }
  return titles;
}

/** Atom の entry から title を最大 max 件 */
function titlesFromAtom(xml, max) {
  const titles = [];
  const entryRe = /<entry\b[^>]*>[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null && titles.length < max) {
    const block = m[0];
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    if (!tm) continue;
    const t = normalizeTitle(tm[1]);
    if (t && !titles.includes(t)) titles.push(t.slice(0, 220));
  }
  return titles;
}

function pickTitles(xml, max) {
  const s = xml.slice(0, 500).trimStart();
  if (s.includes("<feed") || s.includes(":feed")) return titlesFromAtom(xml, max);
  return titlesFromRss(xml, max);
}

/** RSS 2.0 item: title + link */
function itemsFromRss(xml, maxRaw) {
  const items = [];
  const itemRe = /<item\b[^>]*>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < maxRaw) {
    const block = m[0];
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const lm = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
    if (!tm) continue;
    const title = normalizeTitle(tm[1]).slice(0, 220);
    if (!title) continue;
    const link = lm ? stripTags(lm[1]).trim() : "";
    if (!items.some((x) => x.title === title)) items.push({ title, link });
  }
  return items;
}

/** Atom entry: title + link (href 属性または要素本文) */
function itemsFromAtom(xml, maxRaw) {
  const items = [];
  const entryRe = /<entry\b[^>]*>[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null && items.length < maxRaw) {
    const block = m[0];
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    if (!tm) continue;
    const title = normalizeTitle(tm[1]).slice(0, 220);
    if (!title) continue;
    let link = "";
    const hrefM = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
    if (hrefM) link = hrefM[1].trim();
    else {
      const lm = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
      if (lm) link = stripTags(lm[1]).trim();
    }
    if (!items.some((x) => x.title === title)) items.push({ title, link });
  }
  return items;
}

function rssItemsFromXml(xml, maxRaw) {
  const s = xml.slice(0, 500).trimStart();
  if (s.includes("<feed") || s.includes(":feed")) return itemsFromAtom(xml, maxRaw);
  return itemsFromRss(xml, maxRaw);
}

async function fetchOne(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; commit-report-tool/pickup-reminder; +https://github.com) AppleWebKit/537.36 (KHTML, like Gecko)",
        Accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {{ label?: string, url?: string }[]} feeds
 * @param {string[]} headerLines 先頭に付ける固定行（見出し・注記）
 * @param {string} logTag ログ用
 */
async function buildSnippetFromFeeds(feeds, headerLines, logTag, maxPer, timeoutMs) {
  const lines = headerLines.slice();
  for (const entry of feeds) {
    const label = (entry && entry.label) || "feed";
    const url = entry && entry.url;
    if (!url || typeof url !== "string") continue;
    try {
      const xml = await fetchOne(url.trim(), timeoutMs);
      const titles = pickTitles(xml, maxPer);
      if (titles.length === 0) {
        lines.push(`・[${label}] （見出しを取得できませんでした）`);
        continue;
      }
      for (const title of titles) {
        lines.push(`・[${label}] ${title}`);
      }
    } catch (e) {
      console.warn(`fetch-topics[${logTag}]: ${label} ${url} — ${e.message}`);
      lines.push(`・[${label}] （取得失敗: ${String(e.message).slice(0, 80)}）`);
    }
  }
  return lines;
}

function googleNewsRssUrl(searchQuery) {
  const q = encodeURIComponent(String(searchQuery).trim());
  return `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`;
}

const listBHeaderDynamic = [
  "【一覧外・追加候補（トリガー取得・参照）】",
  "（よく行く店・訪問済みの語から軸を推定。固定一覧に近い見出しは除外。各軸1〜3件・該当ゼロの軸は省略。詳細URLは裏取り用）",
];

const listBHeaderStatic = [
  "【一覧外・追加候補（自動取得）】",
  "（RSS の見出しのみ。店舗の営業・イベントの保証ではありません。公式で裏取りしてください）",
];

/**
 * @returns {Promise<string[]|null>} 見出し行が1行以上あれば配列、なければ null（フォールバック用）
 */
async function buildListBDynamicSnippet(cfg, timeoutMs) {
  const sync = loadSyncState();
  const lines = mergeVenueLines(sync);
  const active = pickActiveAxes(cfg, lines);
  if (active.length === 0) return null;

  const maxPer = listBDynamicMaxPerAxis(cfg);
  const pool = listBDynamicFetchPool(cfg, maxPer);
  const fragments = buildExcludeFragments(lines, cfg);
  const outLines = listBHeaderDynamic.slice();

  for (const ax of active) {
    const label = (ax && ax.label) || "候補";
    const q = (ax && ax.searchQuery) || label;
    const url = googleNewsRssUrl(q);
    try {
      const xml = await fetchOne(url, timeoutMs);
      const raw = rssItemsFromXml(xml, pool);
      const picked = [];
      for (const it of raw) {
        if (picked.length >= maxPer) break;
        if (titleExcluded(it.title, fragments)) continue;
        picked.push(it);
      }
      for (const it of picked) {
        const detail = it.link ? ` 詳細:${it.link}` : "";
        outLines.push(`・[${label}] ${it.title}${detail}`);
      }
    } catch (e) {
      console.warn(`fetch-topics[list-b-dynamic]: ${label} — ${e.message}`);
    }
  }

  const bullets = outLines.filter((l) => l.startsWith("・"));
  if (bullets.length === 0) return null;
  return outLines;
}

async function runFetch() {
  /** @type {Record<string, unknown>} */
  const status = {
    version: 1,
    finishedAt: new Date().toISOString(),
    topicsMode: "pending",
    topicsBulletLines: 0,
    topicsIssueLines: 0,
    listBMode: "none",
    listBBulletLines: 0,
    listBIssueLines: 0,
    listBDynamicAxesHit: 0,
    fatalError: null,
  };

  mkdirSync(outDir, { recursive: true });

  try {
    const cfg = loadConfig();
    const topicFeeds = Array.isArray(cfg.topicFeeds) ? cfg.topicFeeds : [];
    const listBFeeds = Array.isArray(cfg.listBCandidateFeeds) ? cfg.listBCandidateFeeds : [];
    const maxPer = Math.min(10, Math.max(1, Number(cfg.topicFetchMaxPerFeed) || 2));
    const listBMaxPer = Math.min(10, Math.max(1, Number(cfg.listBFetchMaxPerFeed) || maxPer));
    const timeoutMs = Math.min(60000, Math.max(3000, Number(cfg.topicFetchTimeoutMs) || 12000));

    const sync = loadSyncState();
    const merged = mergeVenueLines(sync);
    const activeAxes = pickActiveAxes(cfg, merged);
    status.listBDynamicAxesHit = activeAxes.length;

    const topicHeader = [
      "【直近の話題（自動取得）】",
      "（RSS/Atom の見出しのみ。詳細は各公式・報道で裏取りしてください）",
    ];

    if (topicFeeds.length === 0) {
      status.topicsMode = "no_feeds";
      writeFileSync(topicsOut, "", "utf8");
      console.log("fetch-topics: topicFeeds なし — 空の topics-snippet.txt");
    } else {
      status.topicsMode = "rss";
      const lines = await buildSnippetFromFeeds(topicFeeds, topicHeader, "topics", maxPer, timeoutMs);
      status.topicsBulletLines = countBulletLines(lines);
      status.topicsIssueLines = countTopicIssueLines(lines);
      writeFileSync(topicsOut, lines.join("\n").trimEnd() + "\n", "utf8");
      console.log(`fetch-topics: wrote ${topicsOut} (${lines.length} lines)`);
    }

    const listBLines = await buildListBDynamicSnippet(cfg, timeoutMs);
    if (listBLines) {
      status.listBMode = "dynamic";
      status.listBBulletLines = countBulletLines(listBLines);
      status.listBIssueLines = 0;
      writeFileSync(listBOut, listBLines.join("\n").trimEnd() + "\n", "utf8");
      console.log(`fetch-topics: wrote ${listBOut} (list-b dynamic, ${listBLines.length} lines)`);
    } else if (listBFeeds.length === 0) {
      status.listBMode = "none";
      writeFileSync(listBOut, "", "utf8");
      console.log("fetch-topics: list-b なし — 空の list-b-snippet.txt");
    } else {
      status.listBMode = "static";
      const lines = await buildSnippetFromFeeds(listBFeeds, listBHeaderStatic, "list-b-static", listBMaxPer, timeoutMs);
      status.listBBulletLines = countBulletLines(lines);
      status.listBIssueLines = countTopicIssueLines(lines);
      writeFileSync(listBOut, lines.join("\n").trimEnd() + "\n", "utf8");
      console.log(`fetch-topics: wrote ${listBOut} (list-b static feeds, ${lines.length} lines)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status.fatalError = msg;
    console.error(`fetch-topics: ${msg}`);
  } finally {
    status.finishedAt = new Date().toISOString();
    writeFileSync(fetchStatusOut, JSON.stringify(status, null, 2) + "\n", "utf8");
  }
}

await runFetch();
