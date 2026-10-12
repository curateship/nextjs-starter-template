import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, MegaphoneIcon, Trash2Icon, XIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  hideTeamAnnouncement,
  postTeamAnnouncement,
  takeDownTeamAnnouncement,
  type Announcement,
} from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

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
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [confirmTakeDown, setConfirmTakeDown] = React.useState(false)
  const by = announcement.by?.name ?? "A former member"

  async function act(work: () => Promise<unknown>, successText: string) {
    const ok = await run(work, successText)
    if (ok) await router.invalidate()
    return ok
  }

  return (
    <section aria-label="Team announcement" className="grid gap-2 rounded-lg border bg-muted/60 p-3">
      <div className="flex items-start gap-3">
        <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap">{announcement.text}</p>
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
                  () => hideTeamAnnouncement(announcement.id),
                  "Hidden for you. A new announcement will show again."
                )
              }
            >
              <XIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hide for me</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted-foreground">
        <PersonAvatar name={by} avatarUrl={announcement.by?.avatarUrl} />
        <span>
          {by} ·{" "}
          <time dateTime={announcement.postedAt} title={formatDateTime(announcement.postedAt)}>
            {formatTimeAgo(announcement.postedAt)}
          </time>
        </span>
        {canRun ? (
          confirmTakeDown ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-foreground">Take it down for everyone?</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmTakeDown(false)}>
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(() => takeDownTeamAnnouncement(), "Announcement taken down.").then((ok) => {
                    if (ok) setConfirmTakeDown(false)
                  })
                }
              >
                Take down
              </Button>
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onReplace}>
                <MegaphoneIcon className="size-4" />
                Post a new one
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmTakeDown(true)}>
                <Trash2Icon className="size-4" />
                Take down
              </Button>
            </span>
          )
        ) : null}
      </div>
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
  const router = useRouter()
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setText("")
    setInvalid(false)
    onClose()
  }

  async function post() {
    if (!text.trim()) {
      setInvalid(true)
      showErrorToast("Write the announcement first.")
      return
    }
    const ok = await run(() => postTeamAnnouncement(text.trim()), "Announcement posted. Everyone on the team is told.")
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
