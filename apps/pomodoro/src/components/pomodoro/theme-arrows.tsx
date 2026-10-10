import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { quickPillSurfaceClass } from "@/components/pomodoro/quick-controls-header"
import {
  sameBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { poolThemes } from "@/lib/pomodoro/media-pool"
import { stepPersonalBackground, useRoomMedia } from "@/lib/pomodoro/room-media-store"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * Back and forth arrows at the left and right edges of the dashboard's scene,
 * shown while the pointer is over it. Tyler, 9 Oct 2026: "can you add a hover
 * over back and forth arrow here to change themes". See "Changing the theme
 * from the dashboard" in `workspace/docs/backgrounds.md`.
 *
 * A screen with no pointer to hover, such as a phone, shows them all the
 * time. They hide in a hosted room, whose theme is the room's, during a break
 * theme, and when there is only one theme to step to.
 */
export function ThemeArrows({ shown }: { shown: BackgroundReference }) {
  const media = useRoomMedia()
  const [busy, setBusy] = React.useState(false)
  const reachable = media.personalBackgroundPool
    ? poolThemes(media.catalog, media.personalBackgroundPool, media.canUsePremiumMedia).length
    : media.catalog.themes.filter((theme) => media.canUsePremiumMedia || !theme.locked).length

  if (media.room || reachable < 2 || !sameBackgroundReference(shown, media.background))
    return null

  const step = async (direction: 1 | -1) => {
    setBusy(true)
    try {
      await stepPersonalBackground(direction)
    } catch {
      showErrorToast("That theme did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const arrow = (direction: 1 | -1) => {
    const Icon = direction === 1 ? ChevronRightIcon : ChevronLeftIcon
    return (
      <button
        type="button"
        disabled={busy}
        aria-label={direction === 1 ? "Next theme" : "Previous theme"}
        onClick={() => void step(direction)}
        className={cn(
          quickPillSurfaceClass,
          "pointer-events-auto grid size-12 cursor-pointer place-items-center text-foreground transition-opacity duration-200 hover:bg-[rgba(var(--p-fg-rgb),0.16)]",
          "opacity-0 group-hover/hero:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-wait"
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-4 top-[330px] z-[3] flex items-center justify-between sm:inset-x-6">
      {arrow(-1)}
      {arrow(1)}
    </div>
  )
}
