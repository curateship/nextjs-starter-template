import { describe, expect, it } from "vitest"

import { curatedBackgrounds } from "@/lib/pomodoro/background-catalog"
import {
  guestMediaBootstrap,
  pairUsesPro,
  roomPairProblem,
  sceneFor,
  soundLabelFor,
} from "@/lib/pomodoro/media-pair"
import { curatedSounds } from "@/lib/pomodoro/sound-catalog"

describe("a guest's random pair", () => {
  it("is only ever a free scene and a free loop, whatever the dice say", () => {
    const freeScenes = curatedBackgrounds.filter((scene) => !scene.locked).map((scene) => `scene:${scene.key}`)
    const freeSounds = curatedSounds.filter((sound) => !sound.locked).map((sound) => `curated:${sound.key}`)
    for (const roll of [0, 0.1, 0.33, 0.5, 0.74, 0.999999]) {
      const { personal, room, canUsePremiumMedia } = guestMediaBootstrap(() => roll)
      expect(freeScenes).toContain(personal.background)
      expect(freeSounds).toContain(personal.sound)
      expect(room).toBeNull()
      expect(canUsePremiumMedia).toBe(false)
    }
  })

  it("lands on different pairs for different rolls", () => {
    const low = guestMediaBootstrap(() => 0).personal
    const high = guestMediaBootstrap(() => 0.99).personal
    expect(low.background).not.toBe(high.background)
    expect(low.sound).not.toBe(high.sound)
  })
})

describe("a hosted room's pair", () => {
  it("needs both a sound and a theme", () => {
    expect(roomPairProblem(null, "scene:plain")).toBe("no_sound")
    expect(roomPairProblem("curated:rain", null)).toBe("no_background")
    expect(roomPairProblem("curated:rain", "scene:plain")).toBeNull()
  })

  it("takes catalogue items only, never an upload", () => {
    const upload = "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10"
    expect(roomPairProblem(upload, "scene:plain")).toBe("bad_sound")
    expect(roomPairProblem("curated:rain", upload)).toBe("bad_background")
    expect(roomPairProblem("curated:nope", "scene:plain")).toBe("bad_sound")
  })

  it("knows when either half is Pro", () => {
    expect(pairUsesPro("curated:rain", "scene:plain")).toBe(false)
    expect(pairUsesPro("curated:piano", "scene:plain")).toBe(true)
    expect(pairUsesPro("curated:rain", "scene:fireplace")).toBe(true)
  })
})

describe("the names a person reads", () => {
  it("names a loop, an upload and silence", () => {
    expect(soundLabelFor("curated:rain")).toBe("Rain")
    expect(soundLabelFor("media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10")).toBe("Your audio")
    expect(soundLabelFor(null)).toBeNull()
  })

  it("finds a catalogue scene and nothing for an upload", () => {
    expect(sceneFor("scene:fireplace")?.label).toBe("Fireplace")
    expect(sceneFor("media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10")).toBeNull()
  })
})
