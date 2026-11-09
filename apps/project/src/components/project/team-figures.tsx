import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { ImageUpload } from "@/components/shared/image-upload"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { saveTeamPhoto, type TeamFigures, type TeamSummary } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { cn } from "@/lib/utils"
import { useTeamId } from "@/lib/project/team-scope"
import { SKY_COVER } from "@/lib/notes/page-cover"

/**
 * The team's cover in the Teams table's Team settings window, behind the
 * left panel's header on its dashboard. A picture the site admin uploaded to
 * the media library, changed or taken away here. The team has no avatar
 * (Tyler, 7 Nov 2026: "we need to remove avatar").
 */
export function TeamPicturesCard({ team }: { team: Pick<TeamSummary, "photoUrl"> }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Cover photo</CardTitle>
      </CardHeader>
      <CardContent>
        {/* The drawn sky, picked on the team page's ⋮, is no picture here. */}
        {team.photoUrl === SKY_COVER ? (
          <p className="mb-2 text-sm text-muted-foreground">The cover is the sky now. A picture picked here takes its place.</p>
        ) : null}
        <ImageUpload
          label="Cover photo"
          showLabel={false}
          value={team.photoUrl === SKY_COVER ? "" : (team.photoUrl ?? "")}
          emptyLabel="Add a cover photo"
          className="max-w-48"
          disabled={busy}
          onChange={(url) =>
            void run(() => saveTeamPhoto(url, teamId), url ? "Cover saved." : "Cover removed.").then((ok) =>
              ok ? router.invalidate() : undefined
            )
          }
        />
      </CardContent>
    </Card>
  )
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The four figures in the This week card, as Tyler drew them on 16 Oct 2026:
 * a 2 by 2 grid with lines between, each a label, a big number and a small
 * line. The check-in rate is amber below 90 out of 100, with a bar.
 */
export function TeamFiguresGrid({ figures }: { figures: TeamFigures }) {
  const { checkedIn, expected } = figures.checkins
  const rate = expected ? Math.round((checkedIn / expected) * 100) : null
  const low = rate !== null && rate < 90
  return (
    // Out to the tile's edges, lines between, as Tyler drew it.
    <dl className="grid grid-cols-2 [&>div:nth-child(odd)]:border-r [&>div:nth-child(-n+2)]:border-b">
      <Figure
        label="Open tasks"
        value={String(figures.openTasks)}
        detail={`${figures.dueThisWeek} due this week`}
      />
      <Figure label="Completed" value={String(figures.completedThisWeek)} detail="this week" />
      <Figure
        label="Check-in rate"
        value={rate === null ? "None" : `${rate}%`}
        tone={low ? "text-amber-600 dark:text-amber-400" : undefined}
        detail={expected ? `${checkedIn} of ${expected}, last 7 days` : "No work days in the last 7 days"}
        bar={
          rate === null ? null : (
            <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", low ? "bg-amber-500" : "bg-foreground")}
                style={{ width: `${rate}%` }}
              />
            </span>
          )
        }
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

function Figure({
  label,
  value,
  detail,
  tone,
  bar,
}: {
  label: string
  value: string
  detail: string
  tone?: string
  bar?: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</dd>
      {bar ? <dd>{bar}</dd> : null}
      <dd className="text-xs break-words text-muted-foreground">{detail}</dd>
    </div>
  )
}
