// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"

/**
 * While you are in a room, only the room's clock may start or fade the sound
 * (rooms task 03). Tyler, 10 Oct 2026: pausing the personal timer in a room
 * "just pauses the sound but the timer still goes on in the room I joined".
 */

const fader = vi.hoisted(() => ({
  playSource: vi.fn(),
  fadeOutPause: vi.fn(),
  fadeOutStop: vi.fn(),
  setUserGain: vi.fn(),
  setMuted: vi.fn(),
  setFadeMs: vi.fn(),
}))

vi.mock("@/lib/pomodoro/sound-fade", () => ({
  DEFAULT_FADE_MS: 0,
  SoundFader: class {
    constructor() {
      return fader
    }
  },
}))
vi.mock("@/lib/api/pomodoro/sounds", () => ({
  loadSoundPreferences: vi.fn(() => new Promise(() => {})),
  saveSoundPreferences: vi.fn(() => Promise.resolve()),
}))

window.matchMedia = vi.fn(() => ({
  matches: false,
  addEventListener: () => {},
})) as unknown as typeof window.matchMedia

const personalTimer = (running: boolean) =>
  window.dispatchEvent(
    new CustomEvent("pomodoro:timer-running", { detail: { running, mode: "focus" } })
  )

const engine = await import("@/lib/pomodoro/sound-engine")
// A sound is chosen and paused, as on arriving at a page.
engine.followSound({ type: "curated", key: "cafe", url: "/cafe.mp3" }, "prime")

/** Both clocks stopped and no room on, before each test. */
function resetClocks() {
  engine.setRoomClockActive(false)
  personalTimer(false)
  engine.followRoomRunning(false, true)
  for (const spy of Object.values(fader)) spy.mockClear()
}

describe("the sound while you are in a room", () => {
  it("ignores the personal timer stopping during the room's focus", () => {
    resetClocks()
    engine.setRoomClockActive(true)
    engine.followRoomRunning(true)
    expect(fader.playSource).toHaveBeenCalledTimes(1)

    personalTimer(true)
    personalTimer(false)
    expect(fader.fadeOutPause).not.toHaveBeenCalled()
    expect(fader.playSource).toHaveBeenCalledTimes(1)

    // The room's own break still fades it out.
    engine.followRoomRunning(false)
    expect(fader.fadeOutPause).toHaveBeenCalledTimes(1)
  })

  it("lets the personal timer drive the sound again after leaving", () => {
    resetClocks()
    engine.setRoomClockActive(true)
    // Started and paused in the room: recorded, not acted on.
    personalTimer(true)
    personalTimer(false)
    expect(fader.playSource).not.toHaveBeenCalled()

    engine.setRoomClockActive(false)
    personalTimer(true)
    expect(fader.playSource).toHaveBeenCalledTimes(1)
  })

  it("plays for the personal timer when no room is on", () => {
    resetClocks()
    personalTimer(true)
    expect(fader.playSource).toHaveBeenCalledTimes(1)
    personalTimer(false)
    expect(fader.fadeOutPause).toHaveBeenCalledTimes(1)
  })
})
