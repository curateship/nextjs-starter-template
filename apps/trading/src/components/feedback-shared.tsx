import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  SaveIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableHead } from "@/components/ui/table"
import type { FeedbackType } from "@/lib/api/feedback"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-meta"
import { cn } from "@/lib/utils"

export function FeedbackTypeBadge({ type }: { type: FeedbackType }) {
  return (
    <Badge
      variant={feedbackTypeBadgeVariants[type]}
      className={feedbackTypeClassNames[type]}
    >
      {feedbackTypeLabels[type]}
    </Badge>
  )
}

export function ErrorAlert({
  error,
  className,
}: {
  error: string | null
  className?: string
}) {
  if (!error) return null
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className
      )}
    >
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )
}

/** Header checkbox that selects/deselects every row on the current page. */
export function SelectVisibleHead({
  allSelected,
  partiallySelected,
  onToggle,
  ariaLabel,
}: {
  allSelected: boolean
  partiallySelected: boolean
  onToggle: () => void
  ariaLabel: string
}) {
  return (
    <TableHead column="select">
      <Checkbox
        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
        onCheckedChange={onToggle}
        aria-label={ariaLabel}
      />
    </TableHead>
  )
}

/** Toolbar delete button shown only while rows are selected. */
export function MassDeleteToolbarButton({
  count,
  deleting,
  onClick,
}: {
  count: number
  deleting: boolean
  onClick: () => void
}) {
  if (!count) return null
  return (
    <DashboardToolbarButton
      type="button"
      variant="destructive"
      onClick={onClick}
      disabled={deleting}
    >
      {deleting ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <Trash2Icon className="size-4" />
      )}
      Delete ({count})
    </DashboardToolbarButton>
  )
}

/** Line-clamped message text that opens the row's edit dialog. */
export function RowMessageButton({
  message,
  onClick,
}: {
  message: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="line-clamp-2 max-w-full whitespace-normal text-left text-xs font-medium group-hover:underline sm:text-sm"
      onClick={onClick}
      title={message}
    >
      {message}
    </button>
  )
}

/** Ghost settings + delete icon buttons at the end of a row. */
export function RowActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  editLabel: string
  deleteLabel: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onEdit}
        title={editLabel}
        aria-label={editLabel}
      >
        <SettingsIcon className="h-4 w-4" />
        <span className="sr-only">{editLabel}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
      >
        <Trash2Icon className="h-4 w-4" />
        <span className="sr-only">{deleteLabel}</span>
      </Button>
    </div>
  )
}

/** "N rows on this page are selected — select all M" helper banner. */
export function SelectAllBanner({
  visibleCount,
  totalCount,
  noun,
  onSelectAll,
}: {
  visibleCount: number
  totalCount: number
  noun: string
  onSelectAll: () => void
}) {
  return (
    <div className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      {visibleCount} {noun}
      {visibleCount === 1 ? "" : "s"} on this page are selected.{" "}
      <button
        type="button"
        className="font-medium text-foreground underline underline-offset-2"
        onClick={onSelectAll}
      >
        Select all {totalCount}
      </button>
    </div>
  )
}

/** Confirm-delete dialog shared by the feedback admin tables. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  body,
  deleting,
  confirmDisabled,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  body: React.ReactNode
  deleting: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">{body}</p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting || confirmDisabled}
            >
              {deleting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Delete + Save footer for the edit dialogs. */
export function DeleteSaveFooter({
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  saving: boolean
  deleting: boolean
  onSave: () => void
  onDelete: () => void
}) {
  const busy = saving || deleting
  return (
    <DialogFooter variant="plain">
      <>
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={busy}
        >
          {deleting ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2Icon className="h-4 w-4" />
          )}
          Delete
        </Button>
        <Button type="button" onClick={onSave} disabled={busy}>
          {saving ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <SaveIcon className="h-4 w-4" />
          )}
          Save
        </Button>
      </>
    </DialogFooter>
  )
}
