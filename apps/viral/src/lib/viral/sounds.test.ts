import { describe, expect, it } from "vitest"

import { isWinner, trendingSounds } from "@/lib/viral/sounds"
import type { ViralVideo } from "@/lib/viral/viral"

/** Trending sounds (task "Viral features", part 10): "A Sounds tab". */

function video(key: string, sound: ViralVideo["sound"], times: number | null, score = 10): ViralVideo {
  return { key, sound, outlier: { times, typicalViews: 1_000 }, score: { score } } as unknown as ViralVideo
}

describe("trending sounds", () => {
  it("lists a sound once, however its capitals were typed, with how many winners use it", () => {
    const sounds = trendingSounds([
      video("a", { name: "Original Sound", artist: "tiff" }, 3),
      video("b", { name: "original sound", artist: "Tiff" }, 2.5),
      video("c", { name: "Lo-fi beat", artist: null }, 1.2),
      video("d", null, 10),
    ])
    expect(sounds.map((one) => [one.sound.name, one.videos, one.winners])).toEqual([
      ["Original Sound", 2, 2],
      ["Lo-fi beat", 1, 0],
    ])
  })

  it("counts the Outlier badge or a score of 70 as a winner", () => {
    expect(isWinner(video("a", null, 2))).toBe(true)
    expect(isWinner(video("b", null, 1.9))).toBe(false)
    expect(isWinner(video("c", null, null, 70))).toBe(true)
  })
})
