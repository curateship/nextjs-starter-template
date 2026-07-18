export type SoundFaderCallbacks = {
  onPlaying: () => void
  onPause: () => void
  onWaiting: () => void
  onBlocked: () => void
  onError: () => void
}

export const DEFAULT_FADE_MS = 1400

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

type Deck = {
  el: HTMLAudioElement
  src: string | null
  gain: number
  target: number
  unloadAtZero: boolean
}

function makeDeck(el: HTMLAudioElement): Deck {
  el.loop = true
  el.preload = "none"
  return { el, src: null, gain: 0, target: 0, unloadAtZero: false }
}

// Fades ambient audio in and out and crossfades between two <audio> decks so
// starting, stopping, and switching sounds glide instead of snapping. Only the
// current deck reports playback status; the outgoing deck is silenced quietly
// without disturbing the player state machine.
export class SoundFader {
  private readonly decks: [Deck, Deck]
  private current = 0
  private userGain = 1
  private muted = false
  private fadeMs = DEFAULT_FADE_MS
  private frame: number | null = null
  private backstop: number | null = null
  private lastTs: number | null = null
  private disposed = false
  private readonly cb: SoundFaderCallbacks
  private readonly listeners: Array<() => void> = []

  constructor(a: HTMLAudioElement, b: HTMLAudioElement, cb: SoundFaderCallbacks) {
    this.cb = cb
    this.decks = [makeDeck(a), makeDeck(b)]
    this.decks.forEach((deck, index) => this.wire(deck, index))
  }

  private wire(deck: Deck, index: number) {
    const isCurrent = () => !this.disposed && this.current === index
    const on = (type: string, handler: () => void) => {
      deck.el.addEventListener(type, handler)
      this.listeners.push(() => deck.el.removeEventListener(type, handler))
    }
    on("playing", () => { if (isCurrent()) this.cb.onPlaying() })
    on("pause", () => { if (isCurrent()) this.cb.onPause() })
    on("waiting", () => { if (isCurrent()) this.cb.onWaiting() })
    on("stalled", () => { if (isCurrent()) this.cb.onWaiting() })
    on("error", () => {
      // A src we unloaded ourselves reports an error; ignore it, and only let
      // the active deck surface a failure to the state machine.
      if (!deck.src || !isCurrent()) return
      this.unload(deck)
      this.cb.onError()
    })
  }

  setFadeMs(ms: number) {
    this.fadeMs = Math.max(0, ms)
  }

  setUserGain(gain: number) {
    this.userGain = clamp01(gain)
    this.decks.forEach((deck) => this.applyVolume(deck))
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.decks.forEach((deck) => { deck.el.muted = muted })
  }

  // Ensure `src` is playing and faded in, crossfading from any other audible
  // deck. Resumes in place when the current deck already holds this source.
  playSource(src: string) {
    if (this.disposed) return
    const cur = this.decks[this.current]
    if (cur.src === src) {
      cur.target = 1
      cur.unloadAtZero = false
      this.playDeck(cur)
      this.startLoop()
      return
    }
    if (cur.src) {
      cur.target = 0
      cur.unloadAtZero = true
    }
    const next = this.decks[1 - this.current]
    this.load(next, src)
    next.gain = 0
    next.target = 1
    next.unloadAtZero = false
    this.applyVolume(next)
    this.current = (1 - this.current) as 0 | 1
    this.playDeck(next)
    this.startLoop()
  }

  // Fade the current deck out and pause it, keeping the source for a later
  // resume. Used for the pause button and the sleep timer.
  fadeOutPause() {
    const cur = this.decks[this.current]
    cur.target = 0
    cur.unloadAtZero = false
    if (cur.gain === 0) { cur.el.pause(); return }
    this.startLoop()
  }

  // Fade every audible deck out and release its source. Used when the user
  // stops or clears the sound entirely.
  fadeOutStop() {
    let animating = false
    for (const deck of this.decks) {
      if (!deck.src) continue
      if (deck.gain === 0) { this.unload(deck); continue }
      deck.target = 0
      deck.unloadAtZero = true
      animating = true
    }
    if (animating) this.startLoop()
  }

  // Stop immediately with no fade, e.g. when a source is broken or gone.
  hardStop() {
    this.stopLoop()
    this.decks.forEach((deck) => this.unload(deck))
  }

  dispose() {
    this.disposed = true
    this.stopLoop()
    this.listeners.forEach((off) => off())
    this.decks.forEach((deck) => { deck.el.pause(); deck.el.removeAttribute("src") })
  }

  private load(deck: Deck, src: string) {
    deck.src = src
    deck.el.src = src
    deck.el.loop = true
  }

  private unload(deck: Deck) {
    deck.src = null
    deck.gain = 0
    deck.target = 0
    deck.unloadAtZero = false
    deck.el.pause()
    deck.el.removeAttribute("src")
    deck.el.load()
  }

  private playDeck(deck: Deck) {
    deck.el.loop = true
    deck.el.muted = this.muted
    const src = deck.src
    const attempt = deck.el.play()
    if (!attempt || typeof attempt.catch !== "function") return
    attempt.catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      if (this.decks[this.current] !== deck || deck.src !== src) return
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        deck.gain = 0
        this.applyVolume(deck)
        this.cb.onBlocked()
        return
      }
      this.unload(deck)
      this.cb.onError()
    })
  }

  private applyVolume(deck: Deck) {
    deck.el.volume = clamp01(this.userGain * deck.gain)
  }

  private settleSilent(deck: Deck) {
    if (deck.unloadAtZero) this.unload(deck)
    else deck.el.pause()
  }

  private startLoop() {
    if (this.disposed) return
    if (this.frame === null) {
      this.lastTs = null
      this.frame = requestAnimationFrame(this.tick)
    }
    // requestAnimationFrame is suspended in background tabs, so a fade could
    // stall forever there — which would leave the sleep timer unable to stop
    // the audio. A wall-clock backstop guarantees every fade reaches its target.
    // Reset it for each fade command so a crossfade started mid-fade still gets
    // its full duration instead of being cut short by an earlier deadline.
    if (this.backstop !== null) clearTimeout(this.backstop)
    this.backstop = window.setTimeout(this.finalize, this.fadeMs + 120)
  }

  private stopLoop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.lastTs = null
    if (this.backstop !== null) {
      clearTimeout(this.backstop)
      this.backstop = null
    }
  }

  private finalize = () => {
    this.backstop = null
    for (const deck of this.decks) {
      if (deck.gain === deck.target) continue
      deck.gain = deck.target
      this.applyVolume(deck)
      if (deck.target === 0) this.settleSilent(deck)
    }
    this.stopLoop()
  }

  private tick = (ts: number) => {
    const dt = this.lastTs === null ? 16 : ts - this.lastTs
    this.lastTs = ts
    const step = this.fadeMs > 0 ? dt / this.fadeMs : 1
    let animating = false
    for (const deck of this.decks) {
      if (deck.gain === deck.target) continue
      const direction = deck.target > deck.gain ? 1 : -1
      let next = deck.gain + direction * step
      if ((direction === 1 && next >= deck.target) || (direction === -1 && next <= deck.target)) {
        next = deck.target
      }
      deck.gain = next
      this.applyVolume(deck)
      if (deck.gain === deck.target) {
        if (deck.target === 0) this.settleSilent(deck)
      } else {
        animating = true
      }
    }
    if (animating && !this.disposed) this.frame = requestAnimationFrame(this.tick)
    else this.stopLoop()
  }
}
