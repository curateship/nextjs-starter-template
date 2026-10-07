// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"

import {
  CHIMES,
  DEFAULT_CHIME,
  findChime,
  normalizeChime,
} from "@/lib/pomodoro/chimes"
import {
  fireCompletionAlert,
  previewChime,
  setCompletionAlertsEnabled,
  setCompletionChimes,
} from "@/lib/pomodoro/completion-alerts"
import {
  initialSoundPlayerState,
  soundPlayerReducer,
} from "@/lib/pomodoro/sound-player"

/** The pitches each chime played, one list per chime, in the order heard. */
let played: number[][] = []

/** Just enough of an AudioContext to hear which tones were asked for. */
class FakeAudioContext {
  state = "running"
  currentTime = 0
  destination = {}
  private current: number[] | null = null
  createOscillator() {
    if (!this.current) {
      this.current = []
      played.push(this.current)
      queueMicrotask(() => (this.current = null))
    }
    const tones = this.current
    return {
      type: "sine",
      frequency: {
        set value(hz: number) {
          tones.push(hz)
        },
      },
      connect() {},
      start() {},
      stop() {},
    }
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    }
  }
  resume() {
    return Promise.resolve()
  }
}

beforeEach(() => {
  played = []
  ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
})

const pitches = (id: Parameters<typeof findChime>[0]) =>
  findChime(id).tones.map((tone) => tone.frequency)

describe("the chimes", () => {
  it("starts both moments on the original two-tone chime", () => {
    expect(DEFAULT_CHIME).toBe("two-tone")
    expect(pitches("two-tone")).toEqual([659.26, 987.77])
    expect(initialSoundPlayerState.focusChime).toBe("two-tone")
    expect(initialSoundPlayerState.breakChime).toBe("two-tone")
  })

  it("reads an unknown saved value as the default rather than failing", () => {
    expect(normalizeChime("soft-gong")).toBe("soft-gong")
    expect(normalizeChime("air-horn")).toBe("two-tone")
    expect(normalizeChime(undefined)).toBe("two-tone")
  })

  it("has silence, which makes no sound at all", () => {
    expect(findChime("none").tones).toEqual([])
    expect(new Set(CHIMES.map((chime) => chime.id)).size).toBe(CHIMES.length)
  })
})

describe("which chime plays", () => {
  it("plays the focus chime when a focus ends and the break chime when a break ends", async () => {
    setCompletionAlertsEnabled(true)
    setCompletionChimes({ focus: "soft-gong", break: "bright-ding" })

    fireCompletionAlert("focus:1", "Focus done", "focus")
    await Promise.resolve()
    fireCompletionAlert("short:2", "Break done", "short")
    await Promise.resolve()

    expect(played).toEqual([pitches("soft-gong"), pitches("bright-ding")])
  })

  it("plays nothing for Silent", async () => {
    setCompletionAlertsEnabled(true)
    setCompletionChimes({ focus: "none", break: "two-tone" })
    fireCompletionAlert("focus:3", "Focus done", "focus")
    await Promise.resolve()
    expect(played).toEqual([])
  })

  it("previews with alerts off and no timer running", async () => {
    setCompletionAlertsEnabled(false)
    expect(previewChime("rising")).toBe(true)
    await Promise.resolve()
    expect(played).toEqual([pitches("rising")])
  })
})

describe("the saved choice", () => {
  it("keeps each moment's chime separately and reads stored values safely", () => {
    const focus = soundPlayerReducer(initialSoundPlayerState, {
      type: "set-chime",
      moment: "focus",
      chime: "soft-gong",
    })
    const both = soundPlayerReducer(focus, {
      type: "set-chime",
      moment: "break",
      chime: "bright-ding",
    })
    expect([both.focusChime, both.breakChime]).toEqual(["soft-gong", "bright-ding"])

    const hydrated = soundPlayerReducer(initialSoundPlayerState, {
      type: "hydrate",
      selected: null,
      label: null,
      volume: 50,
      muted: false,
      completionAlerts: true,
      focusChime: "rising",
      breakChime: "something-old",
    })
    expect([hydrated.focusChime, hydrated.breakChime]).toEqual(["rising", "two-tone"])
  })
})
