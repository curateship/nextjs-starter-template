import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, MessageSquareReplyIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { replyToBlocker, type BlockerReply } from "@/lib/api/project/checkins"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The replies under one blocker on the Check-ins tab, and a Reply button that
 * opens one line to answer it. Each reply is one line, so this never grows
 * into a second chat. A reply to a Stuck task also lands in its chat.
 */
export function BlockerReplies({
  replies,
  checkinId,
  taskId,
  blockedName,
  canReply,
}: {
  replies: BlockerReply[]
  checkinId: string | null
  /** The Stuck task this answers; null for the Blocker note. */
  taskId: string | null
  blockedName: string
  canReply: boolean
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const frame = React.useRef<HTMLFormElement>(null)
  const boxId = `reply-${checkinId}-${taskId ?? "note"}`
  const close = React.useCallback(() => {
    setOpen(false)
    setText("")
  }, [])
  useEscapeCancels(frame, close)

  async function send() {
    const body = text.trim()
    if (!body || !checkinId) {
      showErrorToast("Write the reply first.")
      return
    }
    const ok = await run(
      () => replyToBlocker({ checkinId, taskId, body }),
      taskId ? `Replied. ${blockedName} has been told, and it's in the task's chat.` : `Replied. ${blockedName} has been told.`
    )
    if (!ok) return
    close()
    await router.invalidate()
  }

  if (replies.length === 0 && !canReply) return null
  return (
    <div className="grid gap-2 pl-3">
      {replies.length ? (
        <ul className="grid gap-2" aria-label="Replies">
          {replies.map((reply) => (
            <li key={reply.id} className="flex gap-2 text-sm">
              <PersonAvatar name={reply.author?.name ?? "Former member"} avatarUrl={reply.author?.avatarUrl} />
              <div className="grid min-w-0 gap-0.5">
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{reply.author?.name ?? "Former member"}</span>{" "}
                  ·{" "}
                  <time dateTime={reply.createdAt} title={formatDateTime(reply.createdAt)}>
                    {formatTimeAgo(reply.createdAt)}
                  </time>
                </span>
                <span className="break-words">{reply.body}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {canReply && checkinId ? (
        open ? (
          <form
            ref={frame}
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <Label htmlFor={boxId} className="sr-only">
              Reply to {blockedName}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={boxId}
                value={text}
                maxLength={LIMITS.blockerReply}
                autoFocus
                placeholder="I have it, sending now"
                onChange={(event) => setText(event.target.value)}
              />
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Reply
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
              <MessageSquareReplyIcon className="size-4" />
              Reply
            </Button>
          </div>
        )
      ) : null}
    </div>
  )
}
