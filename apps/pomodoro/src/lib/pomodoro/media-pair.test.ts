import { describe, expect, it } from "vitest"

import { seededCatalog as catalog } from "@/lib/pomodoro/catalog-fixture"
import {
  guestMediaBootstrap,
  pairUsesPro,
  roomPairProblem,
  sceneFor,
  soundLabelFor,
} from "@/lib/pomodoro/media-pair"

describe("a guest's random pair", () => {
  it("is only ever a free scene and a free loop, whatever the dice say", () => {
    const freeScenes = catalog.themes.filter((scene) => !scene.locked).map((scene) => `scene:${scene.key}`)
    const freeSounds = catalog.sounds.filter((sound) => !sound.locked).map((sound) => `curated:${sound.key}`)
    for (const roll of [0, 0.1, 0.33, 0.5, 0.74, 0.999999]) {
      const { personal, room, canUsePremiumMedia } = guestMediaBootstrap(catalog, () => roll)
      expect(freeScenes).toContain(personal.background)
      expect(freeSounds).toContain(personal.sound)
      expect(room).toBeNull()
      expect(canUsePremiumMedia).toBe(false)
    }
  })

  it("lands on different pairs for different rolls", () => {
    const low = guestMediaBootstrap(catalog, () => 0).personal
    const high = guestMediaBootstrap(catalog, () => 0.99).personal
    expect(low.background).not.toBe(high.background)
    expect(low.sound).not.toBe(high.sound)
  })
})

describe("a hosted room's pair", () => {
  it("needs both a sound and a theme", () => {
    expect(roomPairProblem(catalog, null, "scene:plain")).toBe("no_sound")
    expect(roomPairProblem(catalog, "curated:rain", null)).toBe("no_background")
    expect(roomPairProblem(catalog, "curated:rain", "scene:plain")).toBeNull()
  })

  it("takes catalogue items only, never an upload", () => {
    const upload = "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10"
    expect(roomPairProblem(catalog, upload, "scene:plain")).toBe("bad_sound")
    expect(roomPairProblem(catalog, "curated:rain", upload)).toBe("bad_background")
    expect(roomPairProblem(catalog, "curated:nope", "scene:plain")).toBe("bad_sound")
  })

  it("refuses an item the catalogue no longer has, such as a Draft", () => {
    const withoutRain = {
      ...catalog,
      sounds: catalog.sounds.filter((sound) => sound.key !== "rain"),
    }
    expect(roomPairProblem(withoutRain, "curated:rain", "scene:plain")).toBe("bad_sound")
  })

  it("knows when either half is Pro", () => {
    expect(pairUsesPro(catalog, "curated:rain", "scene:plain")).toBe(false)
    expect(pairUsesPro(catalog, "curated:piano", "scene:plain")).toBe(true)
    expect(pairUsesPro(catalog, "curated:rain", "scene:fireplace")).toBe(true)
  })
})

describe("the names a person reads", () => {
  it("names a loop, an upload and silence", () => {
    expect(soundLabelFor(catalog, "curated:rain")).toBe("Rain")
    expect(soundLabelFor(catalog, "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10")).toBe("Your audio")
    expect(soundLabelFor(catalog, null)).toBeNull()
  })

  it("finds a catalogue scene and nothing for an upload", () => {
    expect(sceneFor(catalog, "scene:fireplace")?.label).toBe("Fireplace")
    expect(sceneFor(catalog, "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10")).toBeNull()
  })
})

describe("a guest with nothing free to pick", () => {
  it("gets silence and the default scene rather than a crash", () => {
    const { personal } = guestMediaBootstrap({ themes: [], sounds: [] }, () => 0.5)
    expect(personal.sound).toBeNull()
    expect(personal.background).toBeNull()
  })
})

describe("a guest with the admin's settings", () => {
  it("shuffles both with the shuffle switch on, and the server picks the first of each", () => {
    const boot = guestMediaBootstrap(catalog, () => 0, {
      shuffle: true,
      defaults: { sound: null, background: null },
      timer: null,
    })
    expect(boot.personal).toMatchObject({ sound: "shuffle", background: "shuffle" })
    expect(boot.picks.sound).toMatch(/^curated:/)
    expect(boot.picks.background).toMatch(/^scene:/)
  })

  it("gets the defaults when they are free, and a random free pair when one is Pro", () => {
    const boot = guestMediaBootstrap(catalog, () => 0, {
      shuffle: false,
      defaults: { sound: "curated:piano", background: "scene:stars" },
      timer: null,
    })
    expect(boot.personal.background).toBe("scene:stars")
    // Soft piano is Pro, which a guest cannot play.
    expect(boot.personal.sound).toBe("curated:lofi")
    expect(boot.fallbackBackground).toBe("scene:stars")
  })
})

describe("a hosted room that shuffles", () => {
  it("takes shuffle and tags for either half", () => {
    expect(roomPairProblem(catalog, "shuffle", "scene:plain")).toBeNull()
    expect(roomPairProblem(catalog, "curated:rain", "tags:night")).toBeNull()
    expect(roomPairProblem(catalog, "shuffle", "scene:nope")).toBe("bad_background")
    expect(soundLabelFor(catalog, "shuffle")).toBe("Shuffled sounds")
  })
})
