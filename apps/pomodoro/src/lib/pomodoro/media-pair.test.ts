import { describe, expect, it } from "vitest"

import { seededCatalog as catalog } from "@/lib/pomodoro/catalog-fixture"
import {
  firstPicks,
  freeBreakLook,
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

  it("takes catalogue items and files, leaving which files to the server", () => {
    // Which shared files a host may pick is checked on the server
    // (`assertRoomFileUsable`); the shape alone passes here.
    const upload = "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10"
    expect(roomPairProblem(catalog, upload, "scene:plain")).toBeNull()
    expect(roomPairProblem(catalog, "curated:rain", upload)).toBeNull()
    expect(roomPairProblem(catalog, "media:not-a-uuid", "scene:plain")).toBe("bad_sound")
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
    expect(soundLabelFor(catalog, "media:0b6f3c1e-8a4d-4c55-9e0e-2f6a1b7c9d10")).toBe("A shared sound")
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

describe("the admin's break look", () => {
  const message = "Drink some water."

  it("keeps a Live theme and the message", () => {
    expect(freeBreakLook(catalog, { background: "scene:stars", message }, false)).toEqual({
      background: "scene:stars",
      message,
    })
  })

  it("drops a theme that is gone, or Pro for somebody without Pro, and keeps the message", () => {
    expect(freeBreakLook(catalog, { background: "scene:nope", message }, true).background).toBeNull()
    // Fireplace is Pro.
    expect(freeBreakLook(catalog, { background: "scene:fireplace", message }, false).background).toBeNull()
    expect(freeBreakLook(catalog, { background: "scene:fireplace", message }, true).background).toBe(
      "scene:fireplace"
    )
    expect(freeBreakLook(catalog, { background: "scene:nope", message }, false).message).toBe(message)
  })

  it("reaches a guest's page", () => {
    const boot = guestMediaBootstrap(catalog, () => 0, {
      shuffle: false,
      defaults: { sound: null, background: null },
      timer: null,
      breakLook: { background: "scene:plain", message },
    })
    expect(boot.breakLook).toEqual({ background: "scene:plain", message })
    expect(guestMediaBootstrap(catalog, () => 0).breakLook).toEqual({ background: null, message: "" })
  })
})

describe("the first pick from a group with the member's own files", () => {
  const tagged = {
    ...catalog,
    sounds: catalog.sounds.map((sound) => ({
      ...sound,
      tags: sound.key === "rain" ? ["rain"] : [],
    })),
  }
  const own = {
    sounds: [
      { mediaId: "0f0f0f0f-0000-4000-8000-000000000001", name: "Desk rain", tags: ["rain"], url: "/a.mp3", kind: "audio" as const },
    ],
    backgrounds: [
      { mediaId: "0f0f0f0f-0000-4000-8000-000000000002", name: "Desk", tags: ["desk"], url: "/a.jpg", kind: "image" as const },
    ],
  }

  it("can land on an own file whose tag is ticked", () => {
    // Two rain sounds, the catalogue's and the member's; a high roll takes the second.
    expect(firstPicks(tagged, "tags:rain", "tags:desk", true, () => 0.99, own)).toEqual({
      sound: "media:0f0f0f0f-0000-4000-8000-000000000001",
      background: "media:0f0f0f0f-0000-4000-8000-000000000002",
    })
    expect(firstPicks(tagged, "tags:rain", null, true, () => 0, own).sound).toBe("curated:rain")
  })

  it("never draws an own file for plain shuffle, or without the member's files", () => {
    for (const roll of [0, 0.5, 0.99]) {
      expect(firstPicks(tagged, "shuffle", "shuffle", true, () => roll, own).sound).toMatch(
        /^curated:/
      )
    }
    expect(firstPicks(tagged, "tags:rain", "tags:desk", true, () => 0.99)).toEqual({
      sound: "curated:rain",
      background: null,
    })
  })
})
