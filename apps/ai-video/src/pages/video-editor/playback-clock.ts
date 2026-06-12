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
    this.timeMs += elapsed

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

// Subscribe a component to the clock's current time (re-renders per tick
// while playing — use only in small leaf components like the playhead).
// The third argument is the SSR snapshot (the clock is freshly created on
// the server, so its current values are correct).
export function usePlaybackTime(clock: PlaybackClock) {
  return React.useSyncExternalStore(
    clock.subscribe,
    () => clock.getTime(),
    () => clock.getTime()
  )
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
