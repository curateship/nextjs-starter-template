import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  EyeOffIcon,
  LibraryBigIcon,
  Loader2Icon,
  Share2Icon,
  SquareArrowOutUpRightIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  approvePomodoroShares,
  copyPomodoroUploadToCatalogue,
  featurePomodoroUpload,
  getMemberFilesErrorMessage,
  unsharePomodoroUploads,
} from "@/lib/api/pomodoro/admin-uploads-tags"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { sharedFilePath, type ShareState } from "@/lib/pomodoro/shared-media"
import {
  UNSHARE_NOTE_MAX,
  UNSHARE_REASONS,
  type UnshareReasonId,
} from "@/lib/pomodoro/shared-media-reports"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The admin's controls for shared files (task 05): Unshare with a reason,
 * Approve a first share, Feature on the front page and Add to catalogue.
 * Used by Member uploads and by the report queue.
 */

/** What a sharing row needs to know about its file. */
export type ShareRow = {
  mediaId: string
  name: string
  share: ShareState
  featured: boolean
  handle: string | null
}

/** "Shared", "Waiting", "Taken off" or nothing, for a table cell. */
export function shareLabel(share: ShareState, featured: boolean) {
  const base =
    share === "on"
      ? "Shared"
      : share === "waiting"
        ? "Waiting for a check"
        : share === "taken_down"
          ? "Taken off"
          : null
  return base && featured ? `${base}, featured` : base
}

/**
 * The Unshare window and the two bulk actions, held by the page so a row's
 * menu and the toolbar open the same window.
 */
export function useShareActions({ onDone }: { onDone: () => Promise<void> }) {
  const [unsharing, setUnsharing] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  const approve = async (ids: string[]) => {
    setBusy(true)
    try {
      const { done, skipped } = await approvePomodoroShares(ids)
      const line = describeBulkResult({
        done: done.length,
        kept: skipped.length,
        one: "file",
        many: "files",
        verb: "approved",
        keptReason: "not waiting for a check",
      })
      if (done.length) toast.success(line)
      else showErrorToast(line)
      await onDone()
    } catch (cause) {
      showErrorToast(getMemberFilesErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return { unsharing, setUnsharing, approve, busy, onDone }
}

export type ShareActions = ReturnType<typeof useShareActions>

/** The toolbar's Approve and Unshare for the ticked rows. */
export function ShareBulkButtons({
  actions,
  ids,
}: {
  actions: ShareActions
  ids: string[]
}) {
  if (!ids.length) return null
  return (
    <>
      <DashboardToolbarButton
        type="button"
        variant="outline"
        disabled={actions.busy}
        onClick={() => void actions.approve(ids)}
      >
        <CheckIcon className="size-4" />
        Approve ({ids.length})
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        variant="outline"
        disabled={actions.busy}
        onClick={() => actions.setUnsharing(ids)}
      >
        <EyeOffIcon className="size-4" />
        Unshare ({ids.length})
      </DashboardToolbarButton>
    </>
  )
}

/** One row's sharing menu, before its Delete. */
export function ShareRowMenu({
  row,
  actions,
  onDeleteFile,
}: {
  row: ShareRow
  actions: ShareActions
  /** The report queue's "Delete the file", which Member uploads has as a row button. */
  onDeleteFile?: () => void
}) {
  const navigate = useNavigate()
  const [working, setWorking] = React.useState(false)
  const shared = row.share === "on"

  const feature = async (on: boolean) => {
    setWorking(true)
    try {
      await featurePomodoroUpload(on ? row.mediaId : null)
      toast.success(
        on
          ? `${row.name} is on the front page.`
          : "Nothing is featured on the front page now."
      )
      await actions.onDone()
    } catch (cause) {
      showErrorToast(getMemberFilesErrorMessage(cause))
    } finally {
      setWorking(false)
    }
  }

  const toCatalogue = async () => {
    setWorking(true)
    try {
      const { id, kind } = await copyPomodoroUploadToCatalogue(row.mediaId)
      toast.success(`${row.name} is a Draft in the catalogue.`)
      await navigate({
        to: kind === "sound" ? "/admin/pomodoro-sounds" : "/admin/pomodoro-themes",
        search: { open: id },
      })
    } catch (cause) {
      showErrorToast(getMemberFilesErrorMessage(cause))
    } finally {
      setWorking(false)
    }
  }

  const sharing = row.share === "on" || row.share === "waiting"
  if (!sharing && !onDeleteFile) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={working}
          aria-label={`Sharing for ${row.name}`}
        >
          {working ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <Share2Icon className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {row.share === "waiting" ? (
          <DropdownMenuItem onSelect={() => void actions.approve([row.mediaId])}>
            <CheckIcon />
            Approve
          </DropdownMenuItem>
        ) : null}
        {sharing ? (
          <DropdownMenuItem onSelect={() => actions.setUnsharing([row.mediaId])}>
            <EyeOffIcon />
            Unshare…
          </DropdownMenuItem>
        ) : null}
        {shared ? (
          <DropdownMenuItem onSelect={() => void feature(!row.featured)}>
            {row.featured ? <StarOffIcon /> : <StarIcon />}
            {row.featured ? "Stop featuring" : "Feature on the front page"}
          </DropdownMenuItem>
        ) : null}
        {shared ? (
          <DropdownMenuItem onSelect={() => void toCatalogue()}>
            <LibraryBigIcon />
            Add to catalogue
          </DropdownMenuItem>
        ) : null}
        {shared && row.handle ? (
          <DropdownMenuItem asChild>
            <a href={sharedFilePath(row.handle, row.mediaId)} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRightIcon />
              Open its page
            </a>
          </DropdownMenuItem>
        ) : null}
        {onDeleteFile ? (
          <DropdownMenuItem variant="destructive" onSelect={onDeleteFile}>
            <Trash2Icon />
            Delete the file…
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Unshare with a reason (task 05, part 4). The owner keeps the file but
 * cannot share it again, and their bell names the file and the reason.
 */
export function UnshareDialog({ actions }: { actions: ShareActions }) {
  const { unsharing, setUnsharing } = actions
  const [reason, setReason] = React.useState<UnshareReasonId>("copyright")
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const reasonId = React.useId()
  const noteId = React.useId()
  const count = unsharing.length

  const close = () => {
    setUnsharing([])
    setNote("")
    setReason("copyright")
  }

  const send = async () => {
    setSaving(true)
    try {
      const { done, skipped } = await unsharePomodoroUploads({
        ids: unsharing,
        reason,
        note,
      })
      const line = describeBulkResult({
        done: done.length,
        kept: skipped.length,
        one: "file",
        many: "files",
        verb: "taken off sharing",
        keptReason: "not shared",
      })
      if (done.length) toast.success(line)
      else showErrorToast(line)
      close()
      await actions.onDone()
    } catch (cause) {
      showErrorToast(getMemberFilesErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={count > 0} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Take {count === 1 ? "this file" : `${count} files`} off sharing?
          </DialogTitle>
          <DialogDescription>
            The owner keeps the file but cannot share it again. Their bell
            names the file and the reason you pick. Anybody using it falls back
            to the default scene or to silence.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor={reasonId}>Reason</Label>
                <Select
                  value={reason}
                  onValueChange={(value) => setReason(value as UnshareReasonId)}
                >
                  <SelectTrigger id={reasonId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNSHARE_REASONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={noteId}>A line for the owner (optional)</Label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={UNSHARE_NOTE_MAX}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void send()}>
            {saving ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            Take off sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
