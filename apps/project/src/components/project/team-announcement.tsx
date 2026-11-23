import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { EllipsisIcon, Loader2Icon, MegaphoneIcon, XIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  hideTeamAnnouncement,
  markTeamAnnouncementSeen,
  postTeamAnnouncement,
  takeDownTeamAnnouncement,
  type Announcement,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatTimeAgo } from "@/lib/format/format-time"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_KIND_LABEL, LIMITS, type AnnouncementKind } from "@/lib/project/rules"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * Each importance's bar and megaphone (Tyler, 7 Nov 2026: "make this a
 * different color depending on the importance of the announcements"): the
 * same light tints as the app's urgency colours, with the words kept in the
 * usual colour so they read on all four. A small label names the importance
 * too, so the colour is never the only sign.
 */
const KIND_LOOK: Record<AnnouncementKind, { bar: string; icon: string; chip: string; dot: string }> = {
  info: {
    bar: "bg-blue-500/10",
    icon: "text-blue-600 dark:text-blue-400",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  good: {
    bar: "bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  warning: {
    bar: "bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  urgent: {
    bar: "bg-red-500/10",
    icon: "text-red-600 dark:text-red-400",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
}

/**
 * The team's announcement, pinned at the top of the Team dashboard's middle
 * panel: one message from the owner or an admin, for everyone on the team.
 * Hide takes it away for me alone until the next one; the owner and admins
 * can post a new one, which replaces it, or take it down for everyone.
 * See `workspace/docs/teams-and-invites.md`, "The team's announcement".
 */
export function AnnouncementCard({
  announcement,
  canRun,
  onReplace,
}: {
  announcement: Announcement
  canRun: boolean
  onReplace: () => void
}) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [confirmTakeDown, setConfirmTakeDown] = React.useState(false)
  const by = announcement.by?.name ?? "A former member"
  const look = KIND_LOOK[announcement.kind]

  // Showing it here is seeing it, for the owner's "Read by" count.
  React.useEffect(() => {
    markTeamAnnouncementSeen(announcement.id, teamId).catch(() => undefined)
  }, [announcement.id, teamId])

  async function act(work: () => Promise<unknown>) {
    const ok = await run(work)
    if (ok) await router.invalidate()
    return ok
  }

  // One thin bar under the header, as Tyler drew it on 14 Oct 2026: the words,
  // who and when, Read by, then "..." with Post a new one and Take down, and
  // the cross that hides it for me.
  return (
    <section
      aria-label={`Team announcement, ${ANNOUNCEMENT_KIND_LABEL[announcement.kind]}`}
      className={cn("flex items-center gap-3 border-b px-4 py-2", look.bar)}
    >
      <MegaphoneIcon className={cn("size-4 shrink-0", look.icon)} aria-hidden />
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-sm">
        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium", look.chip)}>
          {ANNOUNCEMENT_KIND_LABEL[announcement.kind]}
        </span>
        <span className="font-medium break-words whitespace-pre-wrap">{announcement.text}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {by} · <time dateTime={announcement.postedAt}>{formatTimeAgo(announcement.postedAt)}</time>
          {announcement.readers ? (
            <>
              {" · "}
              <ReadBy readers={announcement.readers} />
            </>
          ) : null}
        </span>
      </p>
      {canRun ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Announcement options" disabled={busy}>
              <EllipsisIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onReplace}>Post a new one</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmTakeDown(true)}>
              Take down
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Hide the announcement for me"
            disabled={busy}
            onClick={() =>
              void act(
                () => hideTeamAnnouncement(announcement.id, teamId)
              )
            }
          >
            <XIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hide for me</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirmTakeDown}
        onOpenChange={(open) => (open || busy ? undefined : setConfirmTakeDown(false))}
        title="Take the announcement down?"
        description="It goes for everyone on the team. Post a new one any time."
        confirmLabel="Take down"
        destructive
        loading={busy}
        onConfirm={() =>
          void act(() => takeDownTeamAnnouncement(teamId)).then((ok) => {
            if (ok) setConfirmTakeDown(false)
          })
        }
      />
    </section>
  )
}

type Readers = NonNullable<Announcement["readers"]>

/** "Read by 4 of 6", opening the names of who has seen it and who hasn't. Owner and admins only. */
function ReadBy({ readers }: { readers: Readers }) {
  const total = readers.seen.length + readers.notYet.length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Read by {readers.seen.length} of {total}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <ScrollArea viewportClassName="max-h-72">
          <div className="grid gap-3 p-3">
            <ReaderList title="Seen it" people={readers.seen} empty="Nobody yet." />
            <ReaderList title="Not yet" people={readers.notYet} empty="Everyone on the team has seen it." />
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function ReaderList({ title, people, empty }: { title: string; people: Readers["seen"]; empty: string }) {
  return (
    <section className="grid gap-1.5" aria-label={title}>
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} ({people.length})
      </h3>
      {people.length ? (
        <ul className="grid gap-1.5">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2 text-sm">
              <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
              <span className="truncate">{person.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

/** Writing the announcement. Posting rings everyone's bell and replaces the one up now. */
export function AnnouncementDialog({
  open,
  replacing,
  onClose,
}: {
  open: boolean
  /** One is up now, which the new one replaces. */
  replacing: boolean
  onClose: () => void
}) {
  const teamId = useTeamId()
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [kind, setKind] = React.useState<AnnouncementKind>("info")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setText("")
    setKind("info")
    setInvalid(false)
    onClose()
  }

  async function post() {
    if (!text.trim()) {
      setInvalid(true)
      showErrorToast("Write the announcement first.")
      return
    }
    const ok = await run(() => postTeamAnnouncement(text.trim(), kind, teamId))
    if (!ok) return
    await router.invalidate()
    close()
  }

  return (
    <FormDialog open={open} dirty={Boolean(text.trim())} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Post an announcement</DialogTitle>
            <DialogDescription>
              One message pinned at the top of the Team dashboard, and a notice in everyone's bell.
              {replacing ? " It replaces the one up now." : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void post()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Announcement</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="announcement-text">What everyone should know</Label>
                    <Textarea
                      id="announcement-text"
                      rows={1}
                      value={text}
                      maxLength={LIMITS.announcement}
                      autoFocus
                      placeholder="Office closed Friday."
                      aria-invalid={invalid || undefined}
                      aria-describedby="announcement-count"
                      onChange={(event) => {
                        setText(event.target.value)
                        setInvalid(false)
                      }}
                    />
                    <p id="announcement-count" className="text-xs text-muted-foreground">
                      {text.length} of {LIMITS.announcement} characters
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="announcement-kind">Importance</Label>
                    <Select value={kind} onValueChange={(value) => setKind(value as AnnouncementKind)}>
                      <SelectTrigger id="announcement-kind" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANNOUNCEMENT_KINDS.map((option) => (
                          <SelectItem key={option} value={option}>
                            <span aria-hidden className={cn("size-2.5 rounded-full", KIND_LOOK[option].dot)} />
                            {ANNOUNCEMENT_KIND_LABEL[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Post announcement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
