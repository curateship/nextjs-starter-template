import { describe, expect, it, vi } from "vitest"

import {
  createTradeSoundPlayer,
  ensureTradeSoundSetting,
  readRememberedTradeSoundSetting,
  rememberTradeSoundSetting,
  TRADE_SOUND_FILES,
} from "@/lib/trade/trade-sounds"

describe("trade sound playback", () => {
  it("stays silent before this tab has been used", () => {
    const audio = vi.fn(() => ({ play: vi.fn(() => Promise.resolve()) }))
    const play = createTradeSoundPlayer({ audio })

    expect(play("fill", false)).toBe(false)
    expect(audio).not.toHaveBeenCalled()
  })

  it("collapses a burst per kind while keeping stop distinct from fill", () => {
    let now = 10_000
    const playAudio = vi.fn(() => Promise.resolve())
    const audio = vi.fn(() => ({ play: playAudio }))
    const play = createTradeSoundPlayer({ audio, now: () => now })

    expect(play("fill", true)).toBe(true)
    now += 1_000
    expect(play("fill", true)).toBe(false)
    expect(play("stop", true)).toBe(true)
    now += 1_000
    expect(play("fill", true)).toBe(true)

    expect(audio).toHaveBeenNthCalledWith(1, TRADE_SOUND_FILES.fill)
    expect(audio).toHaveBeenNthCalledWith(2, TRADE_SOUND_FILES.stop)
    expect(audio).toHaveBeenNthCalledWith(3, TRADE_SOUND_FILES.fill)
  })
})

describe("the remembered sound setting", () => {
  it("keeps a newer tab update when the first database read finishes", async () => {
    rememberTradeSoundSetting(undefined)
    let finishLoad: ((answer: { enabled: boolean }) => void) | undefined
    const loading = ensureTradeSoundSetting(
      () =>
        new Promise((resolve) => {
          finishLoad = resolve
        })
    )

    rememberTradeSoundSetting(true)
    finishLoad?.({ enabled: false })

    await expect(loading).resolves.toBe(true)
    expect(readRememberedTradeSoundSetting()).toBe(true)
  })
})
