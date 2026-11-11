import * as React from "react"
import { toast } from "sonner"
import { GitMergeIcon, Loader2Icon, SaveIcon, Trash2Icon } from "lucide-react"

import { FeedbackTagsSelect } from "@/components/feedback/feedback-tags-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
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
import { Textarea } from "@/components/ui/textarea"
import {
  deleteFeedback,
  getFeedbackErrorMessage,
  mergeFeedback,
  updateFeedback,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/api/feedback"
import { FEEDBACK_STATUSES, feedbackStatusLabels, type FeedbackStatus } from "@/lib/feedback/feedback-status"
import type { FeedbackTag } from "@/lib/feedback/feedback-tags"
import { feedbackTypeLabels } from "@/lib/feedback/feedback-type"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/*
 * The two windows the Admin dashboard's Feedback tab opens from a thread's ⋮
 * or a row's right-click: Feedback settings and Merge (Tyler, 8 Nov 2026).
 */

export function EditFeedbackModal({
  feedback,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  feedback: FeedbackItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (feedback: FeedbackItem) => void
  onDeleted: (feedbackId: string) => void
}) {
  const [feedbackType, setFeedbackType] =
    React.useState<FeedbackType>(feedback?.type ?? "suggestion")
  const [feedbackStatus, setFeedbackStatus] =
    React.useState<FeedbackStatus>(feedback?.status ?? "open")
  const [feedbackTags, setFeedbackTags] = React.useState<FeedbackTag[]>(
    feedback?.tags ?? []
  )
  const [message, setMessage] = React.useState(feedback?.message ?? "")
  const [run, saving] = useAsyncAction(getFeedbackErrorMessage)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const handleSave = async () => {
    if (!feedback) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      showErrorToast("Feedback message is required.")
      return
    }

    await run(async () => {
      const updated = await updateFeedback({
        feedbackId: feedback.id,
        type: feedbackType,
        status: feedbackStatus,
        tags: feedbackTags,
        message: trimmedMessage,
      })
      onUpdated(updated)
      onOpenChange(false)
    }, "Feedback updated.")
  }

  const handleDelete = async () => {
    if (!feedback) return

    setDeleting(true)
    dismissErrorToast()
    try {
      await deleteFeedback(feedback.id)
      onDeleted(feedback.id)
      toast.success("Feedback deleted.")
      setConfirmingDelete(false)
      onOpenChange(false)
    } catch (deleteError) {
      // The question stays up on a failure, so the answer is still one click
      // away once the error toast says what went wrong.
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const dirty = feedback
    ? message !== feedback.message ||
      feedbackType !== feedback.type ||
      feedbackStatus !== feedback.status ||
      // Compared as sets: picking the same tags in another order is no change.
      [...feedbackTags].sort().join() !== [...feedback.tags].sort().join()
    : false

  return (
    <>
      {/* A save or delete in flight holds the window open, and an edited message
          is asked about before the X, the overlay or Escape can drop it. */}
      <FormDialog
        open={open}
        dirty={dirty}
        busy={busy}
        onClose={() => onOpenChange(false)}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Edit feedback</DialogTitle>
              <DialogDescription>
                Update the message and feedback type.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Feedback</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="feedback-message">Feedback</Label>
                    <Textarea
                      id="feedback-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={1}
                      disabled={busy}
                      autoFocus
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="feedback-type">Type</Label>
                    <Select
                      value={feedbackType}
                      onValueChange={(value) =>
                        setFeedbackType(value as FeedbackType)
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        id="feedback-type"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(feedbackTypeLabels).map(
                          ([type, label]) => (
                            <SelectItem key={type} value={type}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="feedback-status">Status</Label>
                    <Select
                      value={feedbackStatus}
                      onValueChange={(value) =>
                        setFeedbackStatus(value as FeedbackStatus)
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        id="feedback-status"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {feedbackStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label id="feedback-tags-label">Tags</Label>
                    <FeedbackTagsSelect
                      value={feedbackTags}
                      onChange={setFeedbackTags}
                      disabled={busy}
                      className="w-full sm:w-fit"
                    />
                  </div>

                  {feedback?.attachment_url ? (
                    <div className="grid gap-2">
                      <Label>Screenshot</Label>
                      <a
                        href={feedback.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-fit rounded-lg"
                        aria-label="Open the screenshot at full size"
                      >
                        <img
                          src={feedback.attachment_url}
                          alt="Screenshot attached to this feedback"
                          loading="lazy"
                          className="max-h-48 max-w-full rounded-lg border"
                        />
                      </a>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              {/* Delete asks first, exactly as the thread's ⋮ does; the
                  spinner lives on the confirmation that is running the delete. */}
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                <Trash2Icon className="h-4 w-4" />
                Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy}>
                {saving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4" />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this feedback item?"
        description={
          feedback
            ? `${quoteOneLine(feedback.message)} goes, along with its comments and votes. ${feedback.author_name} is not told. This cannot be undone.`
            : null
        }
        confirmLabel="Delete item"
        loading={deleting}
        disabled={!feedback}
        onConfirm={handleDelete}
      />
    </>
  )
}

/**
 * Folds a duplicate into the item it repeats. One window does the whole job:
 * pick the survivor, read exactly what will happen, and confirm. Its votes
 * combine counting each person once, its comments move across, its author is
 * pointed at the surviving item, and the duplicate itself is deleted.
 */
export function MergeFeedbackDialog({
  feedback,
  candidates,
  open,
  onOpenChange,
  onMerged,
}: {
  /** The duplicate that goes away. */
  feedback: FeedbackItem | null
  /** Everything on the board; the survivor is picked from these. */
  candidates: FeedbackItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerged: (sourceId: string, target: FeedbackItem) => void
}) {
  const [targetId, setTargetId] = React.useState("")
  const [run, merging] = useAsyncAction(getFeedbackErrorMessage)

  // A fresh pick every time the window opens on a new duplicate: a survivor
  // chosen for one merge means nothing for the next. Adjusted during render
  // rather than in an effect so the stale pick never paints first.
  const [lastFeedbackId, setLastFeedbackId] = React.useState<string | null>(
    null
  )
  const feedbackId = feedback?.id ?? null
  if (feedbackId !== lastFeedbackId) {
    setLastFeedbackId(feedbackId)
    setTargetId("")
  }

  const targets = candidates.filter((item) => item.id !== feedback?.id)
  const target = targets.find((item) => item.id === targetId) ?? null

  const handleMerge = async () => {
    if (!feedback || !target) return

    await run(async () => {
      const updated = await mergeFeedback({
        sourceId: feedback.id,
        targetId: target.id,
      })
      onMerged(feedback.id, updated)
      onOpenChange(false)
    }, "Feedback merged.")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // A merge in flight holds the window open, same as every save.
        if (!nextOpen && merging) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge this feedback into another item?</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {feedback?.message ?? ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Where it goes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="merge-target">Merge into</Label>
                <Select
                  value={targetId}
                  onValueChange={setTargetId}
                  disabled={merging || targets.length === 0}
                >
                  <SelectTrigger id="merge-target" className="w-full sm:w-fit">
                    <SelectValue
                      placeholder={
                        targets.length
                          ? "Pick the item that stays"
                          : "There is no other feedback to merge into"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="block max-w-96 truncate">
                          {`${feedbackTypeLabels[item.type]} · ${item.message}`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                The votes from both items combine, counting each person once,
                and every comment moves across.{" "}
                {feedback ? `${feedback.author_name} is ` : "The author is "}
                sent a notice pointing at the surviving item, and this
                duplicate is deleted. This cannot be undone.
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            Cancel
          </Button>
          {/* Merging deletes the duplicate for good, so the button wears the
              irreversible colour, and stays quiet rather than greyed-out
              until a survivor is picked. */}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!target) {
                showErrorToast("Pick the item this one merges into first.")
                return
              }
              void handleMerge()
            }}
            disabled={merging}
          >
            {merging ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <GitMergeIcon className="h-4 w-4" />
            )}
            Merge items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
