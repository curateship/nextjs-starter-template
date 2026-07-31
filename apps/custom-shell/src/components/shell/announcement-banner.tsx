import * as React from "react"
import {
  AlertCircleIcon,
  MegaphoneIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  announcementLevelBannerClassNames,
  announcementLevelLabels,
  type AnnouncementLevel,
  type UserAnnouncement,
} from "@/lib/announcement"
import {
  dismissAnnouncementBanner,
  getAnnouncementErrorMessage,
} from "@/lib/api/announcements"
import { showErrorToast } from "@/lib/error-toast"
import { cn } from "@/lib/utils"

/**
 * What an admin broadcast looks like: a card at the top of the page, on every
 * screen until the reader closes it. Closing it is per person and remembered —
 * nobody else's card moves, and it does not come back on the next page.
 *
 * Each one is a plain `Card` rendered straight into `DashboardContent`, so it
 * sits on the content gutter and takes the workspace's own card border,
 * rounding and flat mode exactly like every other card on the page. Only the
 * background and text colour are the announcement's own.
 */

const levelIcons: Record<AnnouncementLevel, React.ComponentType<{ className?: string }>> =
  {
    info: MegaphoneIcon,
    warning: TriangleAlertIcon,
    critical: AlertCircleIcon,
  }

export function AnnouncementBanners({
  announcements,
}: {
  announcements: UserAnnouncement[]
}) {
  // Server data is the starting list; dismissing takes one out of it straight
  // away rather than waiting on the round trip, and a failure puts it back.
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(
    () => new Set()
  )

  const visible = announcements.filter((item) => !dismissedIds.has(item.id))
  if (!visible.length) {
    return null
  }

  async function dismiss(announcementId: string) {
    setDismissedIds((current) => new Set(current).add(announcementId))

    try {
      await dismissAnnouncementBanner(announcementId)
    } catch (error) {
      setDismissedIds((current) => {
        const next = new Set(current)
        next.delete(announcementId)
        return next
      })
      showErrorToast(getAnnouncementErrorMessage(error))
    }
  }

  // A fragment, not a wrapper: each card has to be its own child of the content
  // area or the gap between it and the page below is not the site gutter.
  return (
    <>
      {visible.map((item) => (
        <AnnouncementBanner
          key={item.id}
          announcement={item}
          onDismiss={() => void dismiss(item.id)}
        />
      ))}
    </>
  )
}

function AnnouncementBanner({
  announcement,
  onDismiss,
}: {
  announcement: UserAnnouncement
  onDismiss: () => void
}) {
  const Icon = levelIcons[announcement.level]

  return (
    <Card
      size="sm"
      role="region"
      // Never colour alone: the level is in the icon and, for a screen reader,
      // in the label on the card itself.
      aria-label={`${announcementLevelLabels[announcement.level]}: ${announcement.title}`}
      className={cn(
        "shrink-0",
        announcementLevelBannerClassNames[announcement.level]
      )}
    >
      <CardContent className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 whitespace-pre-line">
          <strong className="font-semibold">{announcement.title}</strong>{" "}
          {announcement.body}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-1 shrink-0 hover:bg-foreground/10"
          title="Dismiss"
          aria-label={`Dismiss ${announcement.title}`}
          onClick={onDismiss}
        >
          <XIcon className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
