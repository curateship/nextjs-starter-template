import * as React from "react"

import type { SeekRequest } from "@/components/note-library/library-dashboard"
import { saveNotePlayed } from "@/lib/api/note/notes"

/**
 * The player's remembered place and speed (Tyler's task 02, part 5): it
 * starts where it was stopped, at the speed last picked, and its place is
 * saved so it starts there next time.
 */

export const SPEEDS = [1, 1.25, 1.5, 2] as const
const SPEED_KEY = "note-library-playback-speed"
/** How often a playing video's place is saved, besides on pause and on leaving. */
const SAVE_EVERY_MS = 15_000
/** A place this close to the end counts as finished, so the next play starts at the start. */
const FINISHED_WITHIN_SECONDS = 5

/** The speed this browser last picked, for every video. */
export function readSpeed(): number {
  try {
    const stored = Number(window.localStorage.getItem(SPEED_KEY))
    return (SPEEDS as readonly number[]).includes(stored) ? stored : 1
  } catch {
    return 1
  }
}

export function keepSpeed(speed: number) {
  try {
    window.localStorage.setItem(SPEED_KEY, String(speed))
  } catch {
    // A blocked store only forgets the speed.
  }
}

/**
 * Starts the player where it was stopped (or at a quote's moment), at the
 * speed last picked, and saves its place on pause, every 15 seconds while it
 * plays, and when the note closes. Finishing it saves the start.
 */
export function usePlayerPlace({
  playerRef,
  noteId,
  playbackUrl,
  startSeconds,
  seekTo,
}: {
  playerRef: React.RefObject<HTMLMediaElement | null>
  noteId: string
  playbackUrl: string | null
  startSeconds: number | null
  seekTo: SeekRequest | null
}) {
  const startAt = React.useRef(startSeconds)
  React.useEffect(() => {
    const player = playerRef.current
    if (!player || !playbackUrl) return
    let saved = startAt.current ?? 0
    let savedAt = Date.now()
    const save = (seconds: number) => {
      const whole = Math.max(0, Math.floor(seconds))
      if (whole === saved) return
      saved = whole
      savedAt = Date.now()
      startAt.current = whole
      void saveNotePlayed(noteId, whole).catch(() => undefined)
    }
    const start = () => {
      player.playbackRate = readSpeed()
      const at = startAt.current
      if (at && (!Number.isFinite(player.duration) || at < player.duration - FINISHED_WITHIN_SECONDS)) {
        player.currentTime = at
      }
    }
    const onPause = () => {
      if (!player.ended) save(player.currentTime)
    }
    const onEnded = () => save(0)
    const onTime = () => {
      if (!player.paused && Date.now() - savedAt >= SAVE_EVERY_MS) save(player.currentTime)
    }
    // A speed picked in the player's own menu is kept too.
    const onRate = () => {
      if ((SPEEDS as readonly number[]).includes(player.playbackRate)) keepSpeed(player.playbackRate)
    }
    if (player.readyState >= 1) start()
    else player.addEventListener("loadedmetadata", start, { once: true })
    player.addEventListener("pause", onPause)
    player.addEventListener("ended", onEnded)
    player.addEventListener("timeupdate", onTime)
    player.addEventListener("ratechange", onRate)
    return () => {
      player.removeEventListener("loadedmetadata", start)
      player.removeEventListener("pause", onPause)
      player.removeEventListener("ended", onEnded)
      player.removeEventListener("timeupdate", onTime)
      player.removeEventListener("ratechange", onRate)
      if (!player.ended && player.currentTime > 0) save(player.currentTime)
    }
  }, [noteId, playbackUrl, playerRef])

  // A quote's moment, asked for from the Quotes list.
  React.useEffect(() => {
    const player = playerRef.current
    if (!player || !playbackUrl || !seekTo) return
    const go = () => {
      player.currentTime = seekTo.ms / 1000
      void player.play().catch(() => undefined)
    }
    if (player.readyState >= 1) go()
    else player.addEventListener("loadedmetadata", go, { once: true })
    return () => player.removeEventListener("loadedmetadata", go)
  }, [playbackUrl, playerRef, seekTo])
}
