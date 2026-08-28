import { describe, expect, it, vi } from "vitest"

import {
  consumeTradeSoundBootstrap,
  createTradeSoundPlayer,
  ensureTradeSoundSetting,
  readTradeSoundBootstrap,
  readRememberedTradeSoundSetting,
  rememberTradeSoundSetting,
  seedTradeSounds,
  TRADE_SOUND_FILES,
} from "@/lib/trade/trade-sounds"

describe("trade sound playback", () => {
  it("stays silent before this tab has been used", async () => {
    const audio = vi.fn(() => ({ play: vi.fn(() => Promise.resolve()) }))
    const play = createTradeSoundPlayer({ audio })

    await expect(play("fill", false)).resolves.toBe(false)
    expect(audio).not.toHaveBeenCalled()
  })

  it("collapses a burst per kind while keeping stop distinct from fill", async () => {
    let now = 10_000
    const playAudio = vi.fn(() => Promise.resolve())
    const audio = vi.fn(() => ({ play: playAudio }))
    const play = createTradeSoundPlayer({ audio, now: () => now })

    await expect(play("fill", true)).resolves.toBe(true)
    now += 1_000
    await expect(play("fill", true)).resolves.toBe(false)
    await expect(play("stop", true)).resolves.toBe(true)
    now += 1_000
    await expect(play("fill", true)).resolves.toBe(true)

    expect(audio).toHaveBeenNthCalledWith(1, TRADE_SOUND_FILES.fill)
    expect(audio).toHaveBeenNthCalledWith(2, TRADE_SOUND_FILES.stop)
    expect(audio).toHaveBeenCalledTimes(2)
    expect(playAudio).toHaveBeenCalledTimes(3)
  })

  it("reuses the same audio element and lets a refused sound retry", async () => {
    let now = 10_000
    const playAudio = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"))
      .mockResolvedValue(undefined)
    const audio = vi.fn(() => ({ play: playAudio }))
    const play = createTradeSoundPlayer({ audio, now: () => now })

    await expect(play("fill", true)).resolves.toBe(false)
    now += 100
    await expect(play("fill", true)).resolves.toBe(true)

    expect(audio).toHaveBeenCalledOnce()
    expect(playAudio).toHaveBeenCalledTimes(2)
  })

  it("does not collapse an explicit Settings preview", async () => {
    const playAudio = vi.fn(() => Promise.resolve())
    const audio = vi.fn(() => ({ play: playAudio }))
    const play = createTradeSoundPlayer({ audio, now: () => 10_000 })

    await expect(play("fill", true)).resolves.toBe(true)
    await expect(play("fill", true, false)).resolves.toBe(true)

    expect(audio).toHaveBeenCalledOnce()
    expect(playAudio).toHaveBeenCalledTimes(2)
  })

  it("readies both retained elements during the Settings click", async () => {
    const players = new Map<
      string,
      {
        currentTime: number
        pause: ReturnType<typeof vi.fn>
        play: ReturnType<typeof vi.fn<() => Promise<void>>>
        volume: number
      }
    >()
    const audio = vi.fn((src: string) => {
      const player = {
        currentTime: 12,
        pause: vi.fn(),
        play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        volume: 1,
      }
      players.set(src, player)
      return player
    })
    const play = createTradeSoundPlayer({ audio })

    await expect(play.prime()).resolves.toBe(true)
    await expect(play("stop", true)).resolves.toBe(true)

    const stop = players.get(TRADE_SOUND_FILES.stop)!
    expect(audio).toHaveBeenCalledTimes(2)
    expect(stop.play).toHaveBeenCalledTimes(2)
    expect(stop.pause).toHaveBeenCalledOnce()
    expect(stop.currentTime).toBe(0)
    expect(stop.volume).toBe(1)
  })
})

describe("the remembered sound setting", () => {
  it("offers one cached dashboard answer to one screen mount", () => {
    const answer = {
      enabled: true,
      events: [{ id: "fill-1", kind: "fill" as const, createdAt: 1_000 }],
      cursor: { afterAt: 1_000, afterId: "fill-1" },
      error: null,
    }

    seedTradeSounds(answer)
    expect(readTradeSoundBootstrap()).toBe(answer)
    consumeTradeSoundBootstrap(answer)
    expect(readTradeSoundBootstrap()).toBeNull()

    // A route-cache rerender hands back the same object. Its event must not be
    // offered to a later screen mount and played a second time.
    seedTradeSounds(answer)
    expect(readTradeSoundBootstrap()).toBeNull()
  })

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
