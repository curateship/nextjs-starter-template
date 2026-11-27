import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import type { CommentRow } from "@/lib/api/social/comments"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"

/**
 * Changing a sent comment's words on Reddit.
 *
 * Save changes queues an edit from the account that sent it, which types the
 * new words into the comment's own edit box like a person. Reddit marks the
 * comment as edited. The words it first went out with are kept.
 */
export function EditCommentDialog({
  comment,
  onClose,
  onSave,
}: {
  /** The comment being changed, or null when the window is shut. */
  comment: CommentRow | null
  onClose: () => void
  /** Queues the edit. Throws with why when it is refused. */
  onSave: (commentId: string, text: string) => Promise<void>
}) {
  if (!comment) return null
  // Keyed by the comment, so one comment's words never carry into the next.
  return <EditWindow key={comment.id} comment={comment} onClose={onClose} onSave={onSave} />
}

function EditWindow({
  comment,
  onClose,
  onSave,
}: {
  comment: CommentRow
  onClose: () => void
  onSave: (commentId: string, text: string) => Promise<void>
}) {
  const [text, setText] = React.useState(comment.text)
  const [saving, setSaving] = React.useState(false)
  return (
    <FormDialog open dirty={text !== comment.text} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <EditForm
          comment={comment}
          text={text}
          saving={saving}
          onText={setText}
          requestClose={requestClose}
          onSubmit={async () => {
            setSaving(true)
            try {
              await onSave(comment.id, text.trim())
              onClose()
            } catch {
              // The caller has already said why in the error toast, and the
              // words stay in the box.
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </FormDialog>
  )
}

function EditForm({
  comment,
  text,
  saving,
  onText,
  requestClose,
  onSubmit,
}: {
  comment: CommentRow
  text: string
  saving: boolean
  onText: (text: string) => void
  requestClose: () => void
  onSubmit: () => Promise<void>
}) {
  const over = text.trim().length > MAX_COMMENT_CHARS
  const handle = comment.account.handle ? `u/${comment.account.handle}` : "the account that sent it"

  return (
    <DialogContent variant="admin">
      <DialogHeader>
        <DialogTitle>Edit your comment</DialogTitle>
        <DialogDescription>
          The new words go out from {handle} and replace the old ones on Reddit, which marks the
          comment as edited.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit()
        }}
      >
        <DialogBody>
          <div className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>On {comment.postTitle || "a post with no title"}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="promo-edit-comment">The comment</Label>
                  <Textarea
                    id="promo-edit-comment"
                    rows={1}
                    value={text}
                    aria-invalid={over || undefined}
                    onChange={(event) => onText(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {text.trim().length} of {MAX_COMMENT_CHARS} characters
                  </p>
                </div>
                {comment.originalText ? (
                  <div className="grid gap-1 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">It first went out as</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{comment.originalText}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
