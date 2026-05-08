#!/usr/bin/env node
/**
 * 4トピックの Google ニュース RSS を取得し、直近1週間の記事を out/digest.json に書き出す。
 * トピック: 大谷翔平 / 谷川萌々子 / 鬼滅の刃 / 髭男・バックナンバー
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");

const TOPICS = [
  { id: "ohtani",   label: "大谷翔平",           queries: ["大谷翔平"] },
  { id: "tanikawa", label: "谷川萌々子",          queries: ["谷川萌々子"] },
  { id: "kimetsu",  label: "鬼滅の刃",            queries: ["鬼滅の刃"] },
  { id: "music",    label: "髭男・バックナンバー", queries: ["Official髭男dism", "バックナンバー バンド"] },
];

const MAX_ITEMS    = 10;
const ONE_WEEK_MS  = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS   = 10000;

function rssUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
}

function extractTag(block, tag) {
  const m =
    block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i")) ||
    block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title   = extractTag(b, "title");
    const link    = extractTag(b, "link") || extractTag(b, "guid");
    const pubDate = extractTag(b, "pubDate");
    const source  = extractTag(b, "source");
    if (title) items.push({ title, link, pubDate, source });
  }
  return items;
}

async function fetchRss(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function filterRecent(items) {
  const cutoff = new Date(Date.now() - ONE_WEEK_MS);
  return items.filter((item) => {
    if (!item.pubDate) return true;
    const d = new Date(item.pubDate);
    return isNaN(d.getTime()) || d >= cutoff;
  });
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTopic(topic) {
  let all = [];
  for (const q of topic.queries) {
    try {
      const xml = await fetchRss(rssUrl(q));
      all = all.concat(parseRssItems(xml));
    } catch (e) {
      console.warn(`fetch-digest: [${topic.label}] "${q}" 取得失敗 — ${e.message}`);
    }
  }
  return dedupe(filterRecent(all)).slice(0, MAX_ITEMS);
}

const result = { generatedAt: new Date().toISOString(), topics: [] };

for (const topic of TOPICS) {
  process.stdout.write(`Fetching: ${topic.label} ... `);
  const items = await fetchTopic(topic);
  result.topics.push({ id: topic.id, label: topic.label, items });
  console.log(`${items.length} 件`);
}

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "digest.json");
writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(`Wrote ${outPath}`);
