import * as React from "react"

import {
  sameSoundReference,
  soundSourceUrl,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { soundEngineState } from "@/lib/pomodoro/sound-engine"

/**
 * A preview player that belongs to the Sounds page and nothing else.
 *
 * Tyler, 7 Oct 2026: clicking a sound used to play it through the header's
 * player, which is the same player the timer's Start drives, so the two
 * fought. A preview plays on its own `<audio>` element, made when the page
 * opens and stopped when it closes. It never touches the header's player, the
 * timer, or what is saved. One preview plays at a time.
 *
 * Tyler, 9 Oct 2026: a card plays while the pointer is over it (`start` and
 * `stop`). A browser refuses sound until the page has been clicked or tapped
 * once, so a hover before that stays quiet without saying it failed; a click
 * on the card (`toggle`) always plays.
 */
export function usePreviewAudio() {
  const audio = React.useRef<HTMLAudioElement | null>(null)
  const [previewing, setPreviewing] = React.useState<SoundReference | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    const element = new Audio()
    element.loop = true
    element.addEventListener("playing", () => setPlaying(true))
    element.addEventListener("pause", () => setPlaying(false))
    element.addEventListener("error", () => {
      setPlaying(false)
      setFailed(true)
    })
    audio.current = element
    return () => {
      element.pause()
      element.removeAttribute("src")
      element.load()
      audio.current = null
    }
  }, [])

  /** Plays this sound, or pauses it when it is the one already playing. */
  const toggle = React.useCallback(
    (reference: SoundReference) => {
      const element = audio.current
      if (!element) return
      setFailed(false)
      if (sameSoundReference(previewing, reference)) {
        if (element.paused) void element.play().catch(() => setFailed(true))
        else element.pause()
        return
      }
      const engine = soundEngineState()
      // The header's volume and mute, so a preview is never louder than the
      // sound it might replace.
      element.volume = engine.muted ? 0 : engine.volume / 100
      element.src = soundSourceUrl(reference)
      setPreviewing(reference)
      void element.play().catch(() => setFailed(true))
    },
    [previewing]
  )

  /** Plays this sound from hovering. A refusal stays quiet: see above. */
  const start = React.useCallback((reference: SoundReference) => {
    const element = audio.current
    if (!element) return
    setFailed(false)
    const engine = soundEngineState()
    element.volume = engine.muted ? 0 : engine.volume / 100
    element.src = soundSourceUrl(reference)
    setPreviewing(reference)
    void element.play().catch((cause: unknown) => {
      // NotAllowedError is the browser waiting for a first click; AbortError
      // is the pointer leaving before the sound started. Neither is a fault.
      const quiet =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "AbortError")
      if (!quiet) setFailed(true)
    })
  }, [])

  /** Stops whatever is playing, when the pointer leaves its card. */
  const stop = React.useCallback(() => {
    audio.current?.pause()
    setPreviewing(null)
  }, [])

  return { previewing, playing, failed, toggle, start, stop }
}
