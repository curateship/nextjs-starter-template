import { describe, expect, it } from "vitest"

import { seededCatalog } from "@/lib/pomodoro/catalog-fixture"
import {
  catalogTags,
  filterByTags,
  normalizeTag,
  ownOnlyTags,
  ownTagCount,
  poolOwnFiles,
  parseMediaPool,
  pickFromPool,
  poolSounds,
  serializeMediaPool,
  tagsFit,
  type MediaPool,
} from "@/lib/pomodoro/media-pool"

const tagged = {
  ...seededCatalog,
  sounds: seededCatalog.sounds.map((sound) => ({
    ...sound,
    tags:
      sound.key === "rain" ? ["rain", "nature"] : sound.key === "forest" ? ["nature"] : [],
  })),
}


/** The tags of a pool that must be a tag pool; anything else fails the test. */
function tagsOf(pool: MediaPool | null) {
  if (pool?.mode !== "tags") throw new Error(`expected a tag pool, got ${JSON.stringify(pool)}`)
  return pool.tags
}

describe("a group choice", () => {
  it("reads and writes shuffle and tags, and nothing else", () => {
    expect(parseMediaPool("shuffle")).toEqual({ mode: "shuffle" })
    expect(parseMediaPool("tags: Nature ,rain,rain")).toEqual({
      mode: "tags",
      tags: ["nature", "rain"],
    })
    expect(parseMediaPool("tags:")).toBeNull()
    // Up to the 200-character column, not a count of six.
    const twenty = Array.from({ length: 20 }, (_, index) => `tag ${index}`)
    expect(tagsOf(parseMediaPool(`tags:${twenty.join(",")}`))).toHaveLength(20)
    const long = Array.from({ length: 12 }, (_, index) => `${"x".repeat(20)}${index}`)
    const kept = tagsOf(parseMediaPool(`tags:${long.join(",")}`))
    expect(tagsFit(kept)).toBe(true)
    expect(kept.length).toBeLessThan(12)
    expect(parseMediaPool("curated:rain")).toBeNull()
    expect(serializeMediaPool({ mode: "tags", tags: ["rain", "nature"] })).toBe(
      "tags:nature,rain"
    )
    expect(normalizeTag("  Lo-Fi   Beats ")).toBe("lo-fi beats")
    expect(normalizeTag("!!")).toBeNull()
  })

  it("draws tags from those tags only, and shuffle from everything the plan allows", () => {
    const tags = poolSounds(tagged, { mode: "tags", tags: ["nature"] }, true)
    expect(tags.map((sound) => sound.key)).toEqual(["rain", "forest"])
    // Forest birds is Pro, so a free account gets only rain.
    expect(
      poolSounds(tagged, { mode: "tags", tags: ["nature"] }, false).map((sound) => sound.key)
    ).toEqual(["rain"])
    expect(poolSounds(tagged, { mode: "shuffle" }, false)).toHaveLength(4)
    expect(poolSounds(tagged, { mode: "shuffle" }, true)).toHaveLength(8)
  })

  it("never plays the same one twice in a row when there is another", () => {
    const items = [{ key: "a" }, { key: "b" }]
    for (const roll of [0, 0.5, 0.99]) {
      expect(pickFromPool(items, () => roll, "a")?.key).toBe("b")
    }
    expect(pickFromPool([{ key: "a" }], () => 0, "a")?.key).toBe("a")
    expect(pickFromPool([], () => 0)).toBeNull()
  })

  it("counts the tags, and the free ones, for the chips", () => {
    expect(catalogTags(tagged.sounds)).toEqual([
      { tag: "nature", count: 2, free: 1 },
      { tag: "rain", count: 1, free: 1 },
    ])
  })
})

describe("the member's own files", () => {
  const own = [
    { mediaId: "a", name: "Desk rain", tags: ["rain", "desk"], url: "/a.mp3", kind: "audio" as const },
    { mediaId: "b", name: "Hum", tags: ["hum"], url: "/b.mp3", kind: "audio" as const },
  ]

  it("join a group through a ticked tag only, never through plain shuffle", () => {
    expect(poolOwnFiles(own, { mode: "shuffle" })).toEqual([])
    expect(poolOwnFiles(own, { mode: "tags", tags: ["rain"] }).map((file) => file.mediaId)).toEqual([
      "a",
    ])
    expect(poolOwnFiles(own, { mode: "tags", tags: ["piano"] })).toEqual([])
  })

  it("list only the tags the catalogue does not have, since a shared tag is one tag", () => {
    expect(ownOnlyTags(own, ["rain", "nature"])).toEqual([
      { tag: "desk", count: 1 },
      { tag: "hum", count: 1 },
    ])
    expect(ownTagCount(own, "rain")).toBe(1)
  })

  it("never empty the catalogue grid: a tag only they carry filters no card", () => {
    const cards = [{ key: "rain", tags: ["rain"] }, { key: "plain", tags: [] }]
    expect(filterByTags(cards, ["desk"])).toEqual(cards)
    expect(filterByTags(cards, ["desk", "rain"]).map((card) => card.key)).toEqual(["rain"])
  })
})
