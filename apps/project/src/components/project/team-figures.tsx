import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ImageIcon, SettingsIcon, XIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { initialsFor } from "@/lib/crm/inbox-time"
import { saveTeamAvatar, saveTeamPhoto, type TeamFigures, type TeamSummary } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { cn } from "@/lib/utils"

/**
 * The top of the Team dashboard's left panel, as Tyler drew it on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792200037598390000.png`): the team's
 * photo as a wide cover fading into the panel, the cog over it, and
 * the team's square avatar overlapping its foot beside the name. The site
 * admin changes either picture by clicking it, which opens the media library,
 * and takes one away with its ×. Everyone else sees them, the initials when
 * there is no avatar, and a plain fade when there is no cover.
 */
export function TeamCover({
  team,
  created,
  canEdit,
  onSettings,
}: {
  team: Pick<TeamSummary, "name" | "photoUrl" | "avatarUrl">
  /** "Created Oct 10, 2026 · Toronto". */
  created: string
  canEdit: boolean
  onSettings: (() => void) | null
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [picking, setPicking] = React.useState<"cover" | "avatar" | null>(null)
  const [broken, setBroken] = React.useState<string[]>([])
  const cover = team.photoUrl && !broken.includes(team.photoUrl) ? team.photoUrl : null
  const avatar = team.avatarUrl && !broken.includes(team.avatarUrl) ? team.avatarUrl : null
  const lose = (url: string) => setBroken((was) => [...was, url])

  async function save(which: "cover" | "avatar", url: string) {
    const ok = await run(
      () => (which === "cover" ? saveTeamPhoto(url) : saveTeamAvatar(url)),
      which === "cover" ? (url ? "Cover saved." : "Cover removed.") : url ? "Avatar saved." : "Avatar removed."
    )
    if (ok) await router.invalidate()
  }

  const coverPicture = cover ? (
    <div className="relative h-36 overflow-hidden">
      <img src={cover} alt="" className="size-full object-cover" onError={() => lose(cover)} />
      {/* Light at the top so the cog shows, and fading into the panel at the foot. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/10 to-background" />
    </div>
  ) : null

  // Shown while the top of the panel is pointed at (Tyler, 16 Oct 2026); always on a touch screen.
  const onHover =
    "opacity-0 transition-opacity group-hover/team:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
  const buttons = (
    <div className="flex shrink-0 items-center gap-1">
      {canEdit && !cover ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add a cover photo"
              disabled={busy}
              className={onHover}
              onClick={() => setPicking("cover")}
            >
              <ImageIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add a cover photo</TooltipContent>
        </Tooltip>
      ) : null}
      {onSettings ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Team settings"
          className={cn("pointer-events-auto", onHover)}
          onClick={onSettings}
        >
          <SettingsIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="group/team relative">
      {cover ? (
        <>
          {canEdit ? (
            <div className="group/cover relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Change the cover photo"
                    disabled={busy}
                    onClick={() => setPicking("cover")}
                    className="block w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  >
                    {coverPicture}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Change the cover photo</TooltipContent>
              </Tooltip>
              <RemoveButton label="Remove the cover photo" className="top-12 right-3" onClick={() => void save("cover", "")} />
            </div>
          ) : (
            coverPicture
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-3 py-3">{buttons}</div>
        </>
      ) : null}
      {/* px-3 lines the avatar's edge up with the cards under it; pb-5 leaves room
          above them. With no cover the row moves up to fill its place (Tyler, 16 Oct 2026). */}
      <div className={cn("relative flex min-w-0 items-center gap-3 px-3 pb-5", cover ? "-mt-12" : "pt-3")}>
        <div className="group/avatar relative shrink-0">
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={avatar ? "Change the team's avatar" : "Add the team's avatar"}
                  disabled={busy}
                  onClick={() => setPicking("avatar")}
                  className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AvatarBox name={team.name} url={avatar} onBroken={lose} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{avatar ? "Change the team's avatar" : "Add the team's avatar"}</TooltipContent>
            </Tooltip>
          ) : (
            <AvatarBox name={team.name} url={avatar} onBroken={lose} />
          )}
          {canEdit && avatar ? (
            <RemoveButton label="Remove the team's avatar" className="-top-1.5 -right-1.5" onClick={() => void save("avatar", "")} />
          ) : null}
        </div>
        {/* The name and date sit level with the middle of the avatar. */}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 className="text-lg leading-tight font-semibold break-words">{team.name}</h3>
          <p className="text-sm text-muted-foreground">{created}</p>
        </div>
      </div>
      {/* With no cover they sit in the panel's corner, taking no room from the name. */}
      {cover ? null : <div className="absolute top-1 right-1">{buttons}</div>}
      {canEdit ? (
        <MediaPicker
          open={picking !== null}
          onOpenChange={(open) => (open ? null : setPicking(null))}
          onSelectMedia={(url) => {
            const which = picking
            setPicking(null)
            if (which) void save(which, url)
          }}
          currentMediaUrl={(picking === "cover" ? team.photoUrl : team.avatarUrl) ?? undefined}
          showVideos={false}
          defaultCropAspect={picking === "avatar" ? "square" : "wide"}
        />
      ) : null}
    </div>
  )
}

/** The square avatar with a white edge, or the team's initials. */
function AvatarBox({ name, url, onBroken }: { name: string; url: string | null; onBroken: (url: string) => void }) {
  return (
    <span className="flex size-20 items-center justify-center overflow-hidden rounded-xl border-4 border-background bg-muted text-2xl font-medium text-muted-foreground shadow-sm">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => onBroken(url)} />
      ) : (
        initialsFor(name, name)
      )}
    </span>
  )
}

/** The small × on a picture's corner, shown while the picture is pointed at or focused. */
function RemoveButton({ label, className, onClick }: { label: string; className: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute size-6 rounded-full opacity-0 transition-opacity group-hover/avatar:opacity-100 group-hover/cover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        className
      )}
    >
      <XIcon className="size-3.5" />
    </Button>
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
    // Out to the card's edges, under a line, as Tyler drew it.
    <dl className="-mx-4 -mb-4 grid grid-cols-2 border-t [&>div:nth-child(odd)]:border-r [&>div:nth-child(-n+2)]:border-b">
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
