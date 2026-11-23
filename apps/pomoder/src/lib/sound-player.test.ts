import { describe, expect, it } from "vitest"

import {
  initialSoundPlayerState,
  MEDIA_UNAVAILABLE_NOTICE,
  soundPlayerReducer,
  type SoundPlayerEvent,
  type SoundPlayerState,
} from "@/lib/sound-player"

const curated = { type: "curated", key: "rain" } as const
const media = { type: "media", mediaId: "9f8f6a52-1234-4abc-9def-aaaabbbbcccc" } as const

function play(events: SoundPlayerEvent[], from: SoundPlayerState = initialSoundPlayerState) {
  return events.reduce(soundPlayerReducer, from)
}

describe("sound player state machine", () => {
  it("selects, loads, and plays a sound", () => {
    const loading = play([{ type: "select", reference: curated, label: "Rain" }])
    expect(loading).toMatchObject({ selected: curated, label: "Rain", status: "loading", notice: null })

    const playing = play([{ type: "media-playing" }], loading)
    expect(playing.status).toBe("playing")

    const paused = play([{ type: "media-paused" }], playing)
    expect(paused.status).toBe("paused")
  })

  it("hydrates into a paused state without autoplay", () => {
    const state = play([{ type: "hydrate", selected: curated, label: "Rain", volume: 55, muted: true, completionAlerts: true }])
    expect(state).toMatchObject({ selected: curated, status: "paused", volume: 55, muted: true, completionAlerts: true })
  })

  it("treats autoplay rejection as a recoverable blocked state", () => {
    const blocked = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "media-blocked" },
    ])
    expect(blocked.status).toBe("blocked")
    expect(blocked.selected).toEqual(curated)
    expect(blocked.notice).toContain("play")

    const recovered = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "media-playing" },
    ], blocked)
    expect(recovered).toMatchObject({ status: "playing", notice: null })
  })

  it("keeps a curated selection on playback errors so it can be retried", () => {
    const state = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "media-error" },
    ])
    expect(state.status).toBe("error")
    expect(state.selected).toEqual(curated)
    expect(state.notice).toBeTruthy()
  })

  it("stops and clears the selection when user media fails or disappears", () => {
    for (const event of [{ type: "media-error" } as const, { type: "media-unavailable" } as const]) {
      const state = play([
        { type: "select", reference: media, label: "My loop" },
        { type: "media-playing" },
        event,
      ])
      expect(state).toMatchObject({ selected: null, status: "idle", notice: MEDIA_UNAVAILABLE_NOTICE })
    }
  })

  it("ignores media-unavailable for curated selections", () => {
    const state = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "media-playing" },
      { type: "media-unavailable" },
    ])
    expect(state.status).toBe("playing")
  })

  it("shows loading again when playback rebuffers", () => {
    const state = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "media-playing" },
      { type: "media-waiting" },
    ])
    expect(state.status).toBe("loading")
  })

  it("clamps volume changes and clears state on clear", () => {
    const state = play([
      { type: "select", reference: curated, label: "Rain" },
      { type: "set-volume", volume: 250 },
      { type: "set-muted", muted: true },
      { type: "clear" },
    ])
    expect(state).toMatchObject({ selected: null, label: null, status: "idle", volume: 100, muted: true, notice: null })
  })

  it("ignores stray media events when nothing is selected", () => {
    for (const event of ["media-playing", "media-paused", "media-waiting", "media-blocked", "media-error"] as const) {
      expect(play([{ type: event }])).toEqual(initialSoundPlayerState)
    }
  })

  it("resolves labels only while the selection is active", () => {
    const labelled = play([
      { type: "select", reference: media, label: "Your audio" },
      { type: "resolve-label", label: "Thunder loop" },
    ])
    expect(labelled.label).toBe("Thunder loop")
    expect(play([{ type: "resolve-label", label: "Ghost" }]).label).toBeNull()
  })
})
