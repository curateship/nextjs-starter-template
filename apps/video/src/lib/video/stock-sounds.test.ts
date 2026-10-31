import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { STOCK_SOUNDS, stockSoundUrl } from "./stock-sounds"

describe("the starter sounds", () => {
  it("has thirty, each with a unique name", () => {
    expect(STOCK_SOUNDS).toHaveLength(30)
    expect(new Set(STOCK_SOUNDS.map((sound) => sound.id)).size).toBe(30)
  })

  it("ships every one twice: for the browser and for the export", () => {
    for (const sound of STOCK_SOUNDS) {
      expect(existsSync(path.join("public", stockSoundUrl(sound.id)))).toBe(true)
      expect(existsSync(path.join("src/server/assets/sounds", `${sound.id}.mp3`))).toBe(true)
    }
  })
})
