import { describe, expect, it } from "vitest"

import { cleanSoundKey, isVoiceCleanStrength, voiceCleanFilter } from "./voice-clean"

describe("cleaning up the voice", () => {
  it("drops the hum, then takes the hiss down harder at each strength", () => {
    expect(voiceCleanFilter("light")).toBe("highpass=f=80,afftdn=nr=12:nf=-40:tn=1")
    expect(voiceCleanFilter("medium")).toBe("highpass=f=80,afftdn=nr=24:nf=-35:tn=1")
    expect(voiceCleanFilter("strong")).toBe("highpass=f=80,afftdn=nr=40:nf=-30:tn=1")
  })

  it("keeps one copy per file and strength", () => {
    expect(cleanSoundKey("m1", "strong")).toBe("m1:strong")
    expect(isVoiceCleanStrength("strong")).toBe(true)
    expect(isVoiceCleanStrength("loud")).toBe(false)
  })
})
