import * as React from "react"

import {
  parseBackgroundReference,
  resolveBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import type { MediaBootstrap } from "@/lib/pomodoro/media-pair"
import {
  MediaBootstrapContext,
  useRoomMedia,
} from "@/lib/pomodoro/room-media-store"

/**
 * The admin's break look: a theme drawn behind the page while a break is on,
 * and a message on the break card. See `workspace/docs/break-card.md`.
 *
 * "A break is on" means a break card is on screen, on the timer or in a room,
 * so the shell's backdrop follows whichever of the two is showing one. Zen
 * mode has no break card and passes the timer's own answer instead.
 */

let breakCardsShown = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Called by the break card: the break theme shows for as long as it is mounted. */
export function useMarkBreakShown() {
  React.useEffect(() => {
    breakCardsShown += 1
    for (const listener of listeners) listener()
    return () => {
      breakCardsShown -= 1
      for (const listener of listeners) listener()
    }
  }, [])
}

/** The admin's break message, or "" when none is written. */
export function useBreakMessage() {
  return React.useContext(MediaBootstrapContext)?.breakLook.message ?? ""
}

/**
 * The theme to draw: the admin's break theme while a break is on and one is
 * set, otherwise the room's own. `seed` is for the product shell, which sits
 * above the context it provides.
 */
export function useShownBackground({
  seed,
  onBreak,
}: { seed?: MediaBootstrap | null; onBreak?: boolean } = {}) {
  const media = useRoomMedia(seed)
  const fromContext = React.useContext(MediaBootstrapContext)
  const breakKey = (seed ?? fromContext)?.breakLook.background ?? null
  const cardShown = React.useSyncExternalStore(
    subscribe,
    () => breakCardsShown > 0,
    () => false
  )
  const breakTheme = React.useMemo<BackgroundReference | null>(
    () =>
      breakKey
        ? resolveBackgroundReference(media.catalog, parseBackgroundReference(breakKey))
        : null,
    [breakKey, media.catalog]
  )
  // A break theme that will not load goes back to the room's own for the rest
  // of the visit. The fallback that rewrites a member's pick is only for their
  // own theme, never for the admin's.
  const [broken, setBroken] = React.useState(false)
  const showBreak = (onBreak ?? cardShown) && breakTheme !== null && !broken
  return {
    background: showBreak ? breakTheme : media.background,
    fallBackToDefault: showBreak ? () => setBroken(true) : media.fallBackToDefault,
  }
}
