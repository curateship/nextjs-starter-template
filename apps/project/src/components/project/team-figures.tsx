import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { ImageUpload } from "@/components/shared/image-upload"
import { saveTeamPhoto, type TeamFigures } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"

/**
 * The team logo at the top of the Team dashboard. The owner and admins drop
 * one in or take it away; everyone else sees it, or nothing when there is
 * none. Since 14 Oct 2026 it is a short box, as Tyler drew it, and a logo
 * shows whole rather than cropped. (It is stored as the team's photo.)
 */
export function TeamPhoto({
  teamName,
  photoUrl,
  canEdit,
}: {
  teamName: string
  photoUrl: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [broken, setBroken] = React.useState<string | null>(null)

  if (canEdit) {
    return (
      <ImageUpload
        label="Team logo"
        showLabel={false}
        value={photoUrl ?? ""}
        aspect="video"
        fit="contain"
        emptyLabel="Drop your team logo or browse files"
        // The shell's box is 16:9; a logo needs less height, so the left panel isn't all picture.
        className="[&_.aspect-video]:aspect-[3/1]"
        disabled={busy}
        onChange={async (next) => {
          const ok = await run(() => saveTeamPhoto(next), next ? "Team logo saved." : "Team logo removed.")
          if (ok) await router.invalidate()
        }}
      />
    )
  }
  // A photo whose file has since been deleted leaves no broken picture behind.
  if (!photoUrl || broken === photoUrl) return null
  return (
    <img
      src={photoUrl}
      alt={`${teamName}'s logo`}
      className="aspect-[3/1] w-full rounded-lg border object-contain"
      onError={() => setBroken(photoUrl)}
    />
  )
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The four figures in the This week card, as Tyler drew them on 14 Oct 2026:
 * open tasks, tasks finished this week, the check-in rate over the last 7
 * days, and members, each a label, a big number and a small line, with no
 * boxes of their own since the card frames them.
 */
export function TeamFiguresGrid({ figures }: { figures: TeamFigures }) {
  const { checkedIn, expected } = figures.checkins
  const rate = expected ? Math.round((checkedIn / expected) * 100) : null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Figure
        label="Open tasks"
        value={String(figures.openTasks)}
        detail={`${figures.dueThisWeek} due this week`}
      />
      <Figure label="Completed" value={String(figures.completedThisWeek)} detail="this week" />
      <Figure
        label="Check-in rate"
        value={rate === null ? "None" : `${rate}%`}
        detail={expected ? `${checkedIn} of ${expected}, last 7 days` : "No work days in the last 7 days"}
      />
      <Figure
        label="Members"
        value={String(figures.members)}
        detail={
          figures.pendingInvites
            ? plural(figures.pendingInvites, "pending invite", "pending invites")
            : "No pending invites"
        }
      />
    </dl>
  )
}

function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs break-words text-muted-foreground">{detail}</dd>
    </div>
  )
}
