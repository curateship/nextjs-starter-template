import * as React from "react"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Textarea } from "@/components/ui/textarea"
import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import { getCrmErrorMessage, sendReply } from "@/lib/api/crm/inbox"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The box at the foot of the conversation.
 *
 * A plain box, not the newsletter's block editor. A reply is a person typing,
 * so it goes out with no blocks, no branding frame and no unsubscribe footer —
 * that footer belongs on a newsletter, and offering to unsubscribe somebody
 * from a conversation they started would be absurd.
 *
 * What is typed stays in the box when a send fails. Clearing it would lose the
 * words over something the person could just try again.
 */
export function ReplyComposer({
  threadId,
  canSend,
  replyFrom,
  onSent,
  onDraft,
}: {
  threadId: string
  canSend: boolean
  /**
   * The whole From line the reply will carry, worked out on the server. Shown
   * as typed there rather than rebuilt here, so the footnote cannot promise a
   * sender the mail does not use.
   *
   * Null when the workspace has no address for mail to arrive at, which is the
   * one thing that stops a reply going at all, so it is also what disables
   * Send.
   */
  replyFrom: string | null
  onSent: () => void
  onDraft: () => Promise<string>
}) {
  const [body, setBody] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [drafting, setDrafting] = React.useState(false)

  // A different conversation is a different reply, so the box empties. Checked
  // during the render rather than in an effect: an effect would paint the old
  // conversation's words once before clearing them, and setting state in an
  // effect body is what `react-hooks/set-state-in-effect` refuses.
  const [lastThreadId, setLastThreadId] = React.useState(threadId)
  if (lastThreadId !== threadId) {
    setLastThreadId(threadId)
    setBody("")
  }

  const send = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      await sendReply(threadId, body.trim())
      setBody("")
      onSent()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const draft = async () => {
    if (drafting) return
    setDrafting(true)
    try {
      const written = await onDraft()
      // Added under anything already typed rather than over it. Nobody's
      // words are thrown away by a button that writes some more.
      setBody((current) =>
        current.trim() ? `${current.trim()}\n\n${written}` : written
      )
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setDrafting(false)
    }
  }

  const noAddress = !replyFrom

  return (
    <div className="grid shrink-0 gap-2 border-t p-3">
      <Textarea
        value={body}
        maxLength={CRM_MAX_BODY_LENGTH}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          noAddress
            ? "Add the address mail arrives at in Settings → Email before replying"
            : "Write a reply"
        }
        aria-label="Your reply"
        rows={4}
        className="min-h-[5.5rem] resize-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={draft}
          disabled={drafting}
        >
          <SparklesIcon className="size-4" />
          {drafting ? "Writing…" : "Draft with AI"}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <DisabledReason
            disabled={noAddress}
            reason="No address is set for mail to arrive at, so a reply would have nowhere to come back to. Settings → Email is where that goes."
          >
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={noAddress || sending || !body.trim() || !canSend}
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </DisabledReason>
        </div>
      </div>

      {replyFrom ? (
        <p className="text-xs text-muted-foreground">
          Sent as {replyFrom}
        </p>
      ) : null}
    </div>
  )
}
