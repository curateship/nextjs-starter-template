import { describe, expect, it } from "vitest"

import { seededCatalog } from "@/lib/pomodoro/catalog-fixture"
import {
  catalogTags,
  describeTags,
  normalizeTag,
  parseMediaPool,
  pickFromPool,
  poolSounds,
  serializeMediaPool,
} from "@/lib/pomodoro/media-pool"

const tagged = {
  ...seededCatalog,
  sounds: seededCatalog.sounds.map((sound) => ({
    ...sound,
    tags:
      sound.key === "rain" ? ["rain", "nature"] : sound.key === "forest" ? ["nature"] : [],
  })),
}

describe("a group choice", () => {
  it("reads and writes shuffle and tags, and nothing else", () => {
    expect(parseMediaPool("shuffle")).toEqual({ mode: "shuffle" })
    expect(parseMediaPool("tags: Nature ,rain,rain")).toEqual({
      mode: "tags",
      tags: ["nature", "rain"],
    })
    expect(parseMediaPool("tags:")).toBeNull()
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
    expect(describeTags(["rain", "nature", "piano"])).toBe("rain, nature or piano")
  })
})
