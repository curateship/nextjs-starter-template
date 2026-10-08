import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import type { AdminListSelection } from "@/components/pomodoro/admin-list"
import {
  getPomodoroAdminErrorMessage,
  type AdminDeleteResult,
} from "@/lib/api/pomodoro/admin"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Delete on a pomodoro operator list: the row's bin, the toolbar's
 * "Delete (N)" over ticked rows, and the confirm window both lead to. Seven
 * lists share it, so they all ask the same way, report the same way and drop
 * the same ticks.
 *
 * A row's bin and the toolbar make the same one request with one id or many,
 * and the line afterwards always counts what went, because a delete can leave
 * some rows behind (a timer still running, a row somebody else removed first).
 */

/** The word typed into the window before a delete that cannot be taken back. */
const TYPED_WORD = "DELETE"

export function useAdminDelete({
  one,
  many,
  run,
  keptReason,
  selection,
  onDone,
}: {
  /** "room" */
  one: string
  /** "rooms" */
  many: string
  run: (ids: string[]) => Promise<AdminDeleteResult>
  /** Why a row can be left behind, for the line afterwards. */
  keptReason?: string
  selection: AdminListSelection["state"]
  /** Refetches the list once the delete has landed. */
  onDone: () => Promise<void>
}) {
  const [ids, setIds] = React.useState<string[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const { setSelected } = selection

  const confirm = React.useCallback(async () => {
    setDeleting(true)
    try {
      const { deleted, skipped } = await run(ids)
      const line = describeBulkResult({
        done: deleted.length,
        kept: skipped.length,
        one,
        many,
        verb: "deleted",
        keptReason,
      })
      if (deleted.length) toast.success(line)
      else showErrorToast(line)
      // Only the rows that went lose their tick. A row deleted on its own
      // leaves the rest of a selection as it was.
      const gone = new Set(deleted)
      setSelected((current) => new Set([...current].filter((id) => !gone.has(id))))
      setIds([])
      await onDone()
    } catch (error) {
      showErrorToast(getPomodoroAdminErrorMessage(error))
      // The answer was lost, not necessarily the delete, so the list is read
      // again and shows whatever is now true rather than rows that may be gone.
      await onDone()
    } finally {
      setDeleting(false)
    }
  }, [ids, keptReason, many, onDone, one, run, setSelected])

  return {
    /** The rows the open window is about; empty while it is shut. */
    ids,
    deleting,
    ask: setIds,
    close: () => setIds([]),
    confirm,
  }
}

export type AdminDelete = ReturnType<typeof useAdminDelete>

/** "Delete (3)" in the toolbar, shown only while rows are ticked. */
export function AdminBulkDeleteButton({
  del,
  ids,
}: {
  del: AdminDelete
  ids: string[]
}) {
  if (!ids.length) return null
  return (
    <DashboardToolbarButton
      type="button"
      variant="destructive"
      disabled={del.deleting}
      onClick={() => del.ask(ids)}
    >
      <Trash2Icon className="size-4" />
      Delete ({ids.length})
    </DashboardToolbarButton>
  )
}

/**
 * The bin at the end of a row. No tooltip: it repeats on every row, and the
 * accessible name says which row it belongs to.
 */
export function AdminRowDeleteButton({
  del,
  id,
  label,
}: {
  del: AdminDelete
  id: string
  label: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={del.deleting}
      onClick={() => del.ask([id])}
      aria-label={label}
    >
      <Trash2Icon className="size-4" />
    </Button>
  )
}

/**
 * The confirm window. `description` says what goes with the rows and what
 * stays. `typed` asks for DELETE to be typed first, for the one delete that
 * wipes something a member shows off.
 */
export function AdminDeleteConfirm({
  del,
  title,
  description,
  confirmLabel,
  typed = false,
}: {
  del: AdminDelete
  title: string
  description: React.ReactNode
  confirmLabel: string
  typed?: boolean
}) {
  const fieldId = React.useId()
  const open = del.ids.length > 0
  // What was typed belongs to the rows the window is about, so opening it
  // for other rows, or again after a delete, starts with an empty box.
  const askedFor = del.ids.join(",")
  const [typing, setTyping] = React.useState({ for: "", word: "", invalid: false })
  const current = typing.for === askedFor ? typing : { for: askedFor, word: "", invalid: false }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) del.close()
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      loading={del.deleting}
      onConfirm={() => {
        if (typed && current.word.trim() !== TYPED_WORD) {
          setTyping({ ...current, invalid: true })
          showErrorToast(`Type ${TYPED_WORD} to confirm.`)
          return
        }
        void del.confirm()
      }}
    >
      {typed ? (
        <div className="grid gap-2">
          <Label htmlFor={fieldId}>Type {TYPED_WORD} to confirm</Label>
          <Input
            id={fieldId}
            value={current.word}
            autoComplete="off"
            aria-invalid={current.invalid || undefined}
            onChange={(event) =>
              setTyping({ for: askedFor, word: event.target.value, invalid: false })
            }
          />
        </div>
      ) : null}
    </ConfirmDialog>
  )
}
