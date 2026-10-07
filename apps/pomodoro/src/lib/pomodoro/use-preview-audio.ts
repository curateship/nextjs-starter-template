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

  return { previewing, playing, failed, toggle }
}
