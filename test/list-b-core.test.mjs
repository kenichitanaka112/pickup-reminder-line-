import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeVenueLines,
  pickActiveAxes,
  buildExcludeFragments,
  titleExcluded,
  listBDynamicMaxPerAxis,
  listBDynamicFetchPool,
} from "../lib/list-b-core.mjs";

describe("mergeVenueLines", () => {
  it("dedupes and merges logs", () => {
    const out = mergeVenueLines({
      userFrequentVenuesLog: "A店\nB店\n",
      visitedVenuesLog: "B店\nC店",
    });
    assert.deepEqual(out.sort(), ["A店", "B店", "C店"]);
  });

  it("returns [] for non-object", () => {
    assert.deepEqual(mergeVenueLines(null), []);
  });
});

describe("pickActiveAxes", () => {
  it("activates axis when keyword in blob", () => {
    const cfg = {
      listBDynamicAxes: [
        { label: "軸1", keywords: ["渋谷"], searchQuery: "渋谷 イベント" },
        { label: "軸2", keywords: ["未登場語"], searchQuery: "x" },
      ],
      listBDynamicAxesMax: 8,
    };
    const active = pickActiveAxes(cfg, ["渋谷のカフェ"]);
    assert.equal(active.length, 1);
    assert.equal(active[0].label, "軸1");
  });

  it("respects listBDynamicAxesMax", () => {
    const axes = Array.from({ length: 12 }, (_, i) => ({
      label: `a${i}`,
      keywords: [`k${i}`],
      searchQuery: `q${i}`,
    }));
    const cfg = { listBDynamicAxes: axes, listBDynamicAxesMax: 3 };
    const lines = axes.map((_, i) => `k${i}`);
    const active = pickActiveAxes(cfg, lines);
    assert.equal(active.length, 3);
  });
});

describe("buildExcludeFragments + titleExcluded", () => {
  it("excludes by venue line", () => {
    const fr = buildExcludeFragments(["銀座寿司"], {});
    assert.equal(titleExcluded("銀座寿司のニュース", fr), true);
    assert.equal(titleExcluded("別の話題", fr), false);
  });

  it("merges config fragments", () => {
    const fr = buildExcludeFragments([], { listBExcludeTitleFragments: ["テスト語"] });
    assert.equal(titleExcluded("テスト語を含む", fr), true);
  });
});

describe("caps", () => {
  it("listBDynamicMaxPerAxis clamps", () => {
    assert.equal(listBDynamicMaxPerAxis({ listBDynamicMaxPerAxis: 99 }), 5);
    assert.equal(listBDynamicMaxPerAxis({ listBDynamicMaxPerAxis: 1 }), 1);
    assert.equal(listBDynamicMaxPerAxis({ listBDynamicMaxPerAxis: 0 }), 3); // 0 は falsy → 既定 3
  });

  it("listBDynamicFetchPool", () => {
    const p = listBDynamicFetchPool({ listBDynamicFetchPool: 12 }, 3);
    assert.equal(p, 12);
    const d = listBDynamicFetchPool({}, 3);
    assert.equal(d, 7);
  });
});
