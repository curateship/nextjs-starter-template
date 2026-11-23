import * as React from "react"

export type PlaybackSeekMode = "fast" | "precise"

// Master transport clock for the editor. Lives outside React: per-frame time
// updates notify subscribers directly (playhead, readout, preview engine)
// instead of round-tripping through state, which keeps playback and scrubbing
// at frame rate no matter how big the timeline gets.
export class PlaybackClock {
  private timeMs = 0
  private durationMs = 0
  private rateValue = 1
  private playingValue = false
  private rafHandle = 0
  private lastTick = 0
  private listeners = new Set<() => void>()
  private scrubbingValue = false
  private resumeAfterScrub = false
  private scrubRafHandle = 0
  private pendingScrubMs: number | null = null
  private seekModeValue: PlaybackSeekMode | null = null
  // Optional time source: when set and it returns a finite value, the clock
  // follows it instead of advancing by wall time. The preview registers the
  // currently-playing video here so playback is driven by the actual decoded
  // video position — the clock never has to seek the video to catch up (seeking
  // mid-play is what made the picture stutter), and a buffering video simply
  // pauses the clock instead of letting it run ahead.
  private timeSource: (() => number | null) | null = null

  setTimeSource(source: (() => number | null) | null) {
    this.timeSource = source
  }

  get playing() {
    return this.playingValue
  }

  get rate() {
    return this.rateValue
  }

  get scrubbing() {
    return this.scrubbingValue
  }

  get seekMode() {
    return this.seekModeValue
  }

  getTime() {
    return this.timeMs
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(seekMode: PlaybackSeekMode | null = null) {
    this.seekModeValue = seekMode
    for (const listener of this.listeners) listener()
  }

  private clampTime(ms: number) {
    return Math.min(Math.max(0, ms), this.durationMs)
  }

  // Timeline length changes as clips are edited; keep the time inside it.
  setDuration(durationMs: number) {
    this.durationMs = durationMs
    if (this.pendingScrubMs != null) {
      this.pendingScrubMs = this.clampTime(this.pendingScrubMs)
    }
    if (this.timeMs > durationMs) {
      this.timeMs = durationMs
      this.emit()
    }
  }

  seek(ms: number) {
    this.timeMs = this.clampTime(ms)
    this.emit("precise")
  }

  // Scrubbing owns playback until release. Pointer updates are collapsed to
  // the latest requested position so the clock and preview run at most once
  // per animation frame.
  beginScrub(ms: number) {
    if (this.scrubbingValue) {
      this.updateScrub(ms)
      return
    }
    this.scrubbingValue = true
    this.resumeAfterScrub = this.playingValue
    if (this.playingValue) {
      this.playingValue = false
      cancelAnimationFrame(this.rafHandle)
    }
    this.updateScrub(ms)
  }

  updateScrub(ms: number) {
    if (!this.scrubbingValue) return
    this.pendingScrubMs = this.clampTime(ms)
    if (this.scrubRafHandle) return
    this.scrubRafHandle = requestAnimationFrame(() => {
      this.scrubRafHandle = 0
      if (this.pendingScrubMs == null || !this.scrubbingValue) return
      this.timeMs = this.pendingScrubMs
      this.pendingScrubMs = null
      this.emit("fast")
    })
  }

  endScrub(ms?: number) {
    if (!this.scrubbingValue) return
    const finalMs = this.clampTime(ms ?? this.pendingScrubMs ?? this.timeMs)
    if (this.scrubRafHandle) cancelAnimationFrame(this.scrubRafHandle)
    this.scrubRafHandle = 0
    this.pendingScrubMs = null
    this.scrubbingValue = false

    const shouldResume = this.resumeAfterScrub && finalMs < this.durationMs
    this.resumeAfterScrub = false
    this.timeMs = finalMs
    this.playingValue = shouldResume
    if (shouldResume) {
      this.lastTick = performance.now()
      this.rafHandle = requestAnimationFrame(this.tick)
    }
    this.emit("precise")
  }

  setRate(rate: number) {
    this.rateValue = rate
    this.emit()
  }

  play() {
    if (this.scrubbingValue) {
      this.resumeAfterScrub = true
      return
    }
    if (this.playingValue || this.durationMs === 0) return
    // Restart from the top when play is hit at the very end.
    if (this.timeMs >= this.durationMs) this.timeMs = 0
    this.playingValue = true
    this.lastTick = performance.now()
    this.rafHandle = requestAnimationFrame(this.tick)
    this.emit()
  }

  pause() {
    if (this.scrubbingValue) {
      this.resumeAfterScrub = false
      return
    }
    if (!this.playingValue) return
    this.playingValue = false
    cancelAnimationFrame(this.rafHandle)
    this.emit()
  }

  toggle() {
    if (this.playingValue) {
      this.pause()
    } else {
      this.play()
    }
  }

  private tick = (now: number) => {
    const elapsed = (now - this.lastTick) * this.rateValue
    this.lastTick = now

    // Follow the playing video if one is registered; otherwise advance by wall
    // time (gaps, image/text/audio-only stretches, or before the video starts).
    const sourced = this.timeSource ? this.timeSource() : null
    if (sourced != null && Number.isFinite(sourced)) {
      this.timeMs = Math.max(0, sourced)
    } else {
      this.timeMs += elapsed
    }

    // Stop at the end of the last clip.
    if (this.timeMs >= this.durationMs) {
      this.timeMs = this.durationMs
      this.playingValue = false
      this.emit()
      return
    }

    this.rafHandle = requestAnimationFrame(this.tick)
    this.emit()
  }
}

// Play/pause state only. It notifies per tick, but the value is stable while
// playing, so React bails out of the re-render.
export function usePlaybackPlaying(clock: PlaybackClock) {
  return React.useSyncExternalStore(
    clock.subscribe,
    () => clock.playing,
    () => clock.playing
  )
}
