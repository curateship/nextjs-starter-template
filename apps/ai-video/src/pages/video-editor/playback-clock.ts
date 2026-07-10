import * as React from "react"

// Master transport clock for the editor. Lives outside React: per-frame time
// updates notify subscribers directly (playhead, readout, preview engine)
// instead of round-tripping through state, which keeps playback and
// scrubbing at frame rate no matter how big the timeline gets.
export class PlaybackClock {
  private timeMs = 0
  private durationMs = 0
  private rateValue = 1
  private playingValue = false
  private rafHandle = 0
  private lastTick = 0
  private listeners = new Set<() => void>()
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

  getTime() {
    return this.timeMs
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  // Timeline length changes as clips are edited; keep the time inside it.
  setDuration(durationMs: number) {
    this.durationMs = durationMs
    if (this.timeMs > durationMs) {
      this.timeMs = durationMs
      this.emit()
    }
  }

  seek(ms: number) {
    this.timeMs = Math.min(Math.max(0, ms), this.durationMs)
    this.emit()
  }

  setRate(rate: number) {
    this.rateValue = rate
    this.emit()
  }

  play() {
    if (this.playingValue || this.durationMs === 0) return
    // Restart from the top when play is hit at the very end.
    if (this.timeMs >= this.durationMs) this.timeMs = 0
    this.playingValue = true
    this.lastTick = performance.now()
    this.rafHandle = requestAnimationFrame(this.tick)
    this.emit()
  }

  pause() {
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

// Subscribe to play/pause state only (doesn't re-render per frame... it does
// notify per tick, but the snapshot is stable while playing so React bails).
export function usePlaybackPlaying(clock: PlaybackClock) {
  return React.useSyncExternalStore(
    clock.subscribe,
    () => clock.playing,
    () => clock.playing
  )
}

// Subscribe to the playback rate.
export function usePlaybackRate(clock: PlaybackClock) {
  return React.useSyncExternalStore(
    clock.subscribe,
    () => clock.rate,
    () => clock.rate
  )
}
