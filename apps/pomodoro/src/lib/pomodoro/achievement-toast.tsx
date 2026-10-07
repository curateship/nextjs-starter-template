import { useNavigate, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { findAchievement } from "@/lib/pomodoro/achievements"

/** The id on History's badges card, which See it lands on. */
export const BADGES_CARD_ID = "badges"

/**
 * The toast's See it. Off History it opens History; on History it scrolls to
 * the badges card instead of loading the page again. The toast area sits
 * inside the router, so this can ask it where the reader is.
 */
function SeeBadges({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const onHistory = useRouterState({
    select: (state) => state.location.pathname === "/history",
  })
  const scrollToBadges = () =>
    document
      .getElementById(BADGES_CARD_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="ml-auto"
      onClick={() => {
        onDone()
        // On History, a scroll. Elsewhere the router opens History at the
        // card itself: scrolling after the navigation lost to the router's own
        // scroll to the top of the new page.
        if (onHistory) scrollToBadges()
        else void navigate({ to: "/history", hash: BADGES_CARD_ID })
      }}
    >
      See it
    </Button>
  )
}

function toastWithSeeIt(message: string) {
  const id = toast.success(message, {
    action: <SeeBadges onDone={() => toast.dismiss(id)} />,
  })
}

/**
 * A toast for the badges the finished focus just earned. The server answers
 * with the badges it actually recorded, never with the ones already on the
 * account, so a hundredth session that is reported twice congratulates you
 * once.
 *
 * Earning one at a time is the normal case and gets its own toast. Several at
 * once is not: it happens when an account has been imported, or when a new
 * badge ships and an account already passed its rule. A stack of six toasts
 * would bury the screen, so more than two become one line that sends you to
 * the panel. Every one carries See it, which opens the badges.
 */
export function announceAchievements(badgeIds: readonly string[]) {
  const badges = badgeIds
    .map(findAchievement)
    .filter((badge): badge is NonNullable<typeof badge> => badge !== null)
  if (!badges.length) return
  if (badges.length > 2) {
    toastWithSeeIt(`${badges.length} achievements earned.`)
    return
  }
  for (const badge of badges) toastWithSeeIt(`Achievement earned: ${badge.name}`)
}
