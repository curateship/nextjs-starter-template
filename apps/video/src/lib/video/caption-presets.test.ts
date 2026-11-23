import { describe, expect, it } from "vitest"

import { DEFAULT_CAPTION_LOOK } from "./caption-look"
import {
  applyCaptionPreset,
  CAPTION_PRESETS,
  matchingCaptionPreset,
} from "./caption-presets"

describe("caption presets", () => {
  it("gives today's exact standard look for Plain", () => {
    // Written out by hand, so a change to the standard look cannot quietly
    // move Plain with it.
    expect(applyCaptionPreset(DEFAULT_CAPTION_LOOK, "plain")).toEqual({
      fontId: "inter",
      fontSize: 64,
      color: "#ffffff",
      capitals: false,
      strokeColor: "#000000",
      strokeWidth: 0,
      boxed: true,
      boxColor: "#000000",
      animation: "none",
      wordHighlight: false,
      wordColor: "#facc15",
      wordsPerCaption: 4,
      y: 0.78,
      platform: null,
    })
  })

  it("makes Karaoke three words at a time, lit word by word", () => {
    const look = applyCaptionPreset(DEFAULT_CAPTION_LOOK, "karaoke")
    expect(look.wordsPerCaption).toBe(3)
    expect(look.wordHighlight).toBe(true)
  })

  it("makes Bold heavy capitals with a yellow outline that pop in", () => {
    expect(applyCaptionPreset(DEFAULT_CAPTION_LOOK, "bold")).toMatchObject({
      fontId: "anton",
      capitals: true,
      strokeColor: "#facc15",
      animation: "pop",
    })
  })

  it("keeps the platform the look already had", () => {
    const look = { ...DEFAULT_CAPTION_LOOK, platform: "tiktok" as const }
    expect(applyCaptionPreset(look, "bold").platform).toBe("tiktok")
  })

  it("says which preset a look still matches, and none once it is changed", () => {
    for (const preset of CAPTION_PRESETS) {
      expect(
        matchingCaptionPreset(applyCaptionPreset(DEFAULT_CAPTION_LOOK, preset.id))
      ).toBe(preset.id)
    }
    const bold = applyCaptionPreset(DEFAULT_CAPTION_LOOK, "bold")
    expect(matchingCaptionPreset({ ...bold, fontSize: 90 })).toBeNull()
  })

  it("ignores the colour of an outline that is switched off", () => {
    // Plain with a yellow outline colour left over from Bold, outline off.
    const plain = applyCaptionPreset(DEFAULT_CAPTION_LOOK, "plain")
    expect(
      matchingCaptionPreset({ ...plain, strokeColor: "#facc15", strokeWidth: 0 })
    ).toBe("plain")
  })
})
