/**
 * 一覧外（list-b）動的軸の共通ロジック。
 * fetch-topics.mjs（Node）と workflow-frame.html（ブラウザ dynamic import）の単一ソース。
 * 取得先（Google RSS vs Wikipedia）は環境差のため呼び出し側で分岐する。
 */

/** @param {unknown} sync */
export function mergeVenueLines(sync) {
  if (!sync || typeof sync !== "object") return [];
  const f = /** @type {{ userFrequentVenuesLog?: string }} */ (sync).userFrequentVenuesLog || "";
  const v =
    /** @type {{ visitedVenuesLog?: string; visitedVenues?: string }} */ (sync).visitedVenuesLog ||
    /** @type {{ visitedVenuesLog?: string; visitedVenues?: string }} */ (sync).visitedVenues ||
    "";
  const a = []
    .concat(String(f).split(/\r?\n/).map((l) => l.trim()))
    .concat(String(v).split(/\r?\n/).map((l) => l.trim()))
    .filter(Boolean);
  return [...new Set(a)];
}

/** @param {Record<string, unknown>} cfg @param {string[]} mergedLines */
export function pickActiveAxes(cfg, mergedLines) {
  const axes = Array.isArray(cfg.listBDynamicAxes) ? cfg.listBDynamicAxes : [];
  const blob = mergedLines.join(" ").toLowerCase();
  if (!blob.trim()) return [];
  const active = [];
  for (const ax of axes) {
    const kws = Array.isArray(ax.keywords) ? ax.keywords : [];
    let hit = false;
    for (const kw of kws) {
      if (kw && blob.includes(String(kw).toLowerCase())) {
        hit = true;
        break;
      }
    }
    if (hit) active.push(ax);
  }
  const cap = Math.min(20, Math.max(1, Number(cfg.listBDynamicAxesMax) || 8));
  return active.slice(0, cap);
}

/** @param {string[]} lines @param {Record<string, unknown>} cfg @returns {string[]} */
export function buildExcludeFragments(lines, cfg) {
  const extra = Array.isArray(cfg.listBExcludeTitleFragments) ? cfg.listBExcludeTitleFragments : [];
  const frag = new Set(extra.map((s) => String(s).trim()).filter(Boolean));
  for (const line of lines) {
    if (line.length >= 2) frag.add(line);
  }
  return [...frag];
}

/** @param {string} title @param {string[]} fragments */
export function titleExcluded(title, fragments) {
  const t = title.toLowerCase();
  for (const fr of fragments) {
    if (fr.length >= 2 && t.includes(String(fr).toLowerCase())) return true;
  }
  return false;
}

/** @param {Record<string, unknown>} cfg */
export function listBDynamicMaxPerAxis(cfg) {
  return Math.min(5, Math.max(1, Number(cfg.listBDynamicMaxPerAxis) || 3));
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {number} maxPer
 */
export function listBDynamicFetchPool(cfg, maxPer) {
  return Math.min(20, Math.max(maxPer, Number(cfg.listBDynamicFetchPool) || maxPer + 4));
}
