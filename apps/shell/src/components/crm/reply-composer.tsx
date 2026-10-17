import * as React from "react"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Textarea } from "@/components/ui/textarea"
import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { getCrmErrorMessage, sendReply } from "@/lib/api/crm/inbox"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
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
 *
 * The words themselves live on the CRM screen, not here, because this
 * component is thrown away and rebuilt every time another conversation is
 * opened. See `src/lib/crm/reply-drafts.ts`.
 */
export function ReplyComposer({
  threadId,
  body,
  canSend,
  replyFrom,
  onBodyChange,
  onSent,
  onDraft,
}: {
  threadId: string
  /** What is in the box, held by the screen so it survives a switch. */
  body: string
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
  /**
   * Carries the conversation's id, so a send that lands late cannot empty the
   * box of whichever conversation is open by then.
   */
  onBodyChange: (threadId: string, update: ReplyDraftUpdate) => void
  onSent: () => void
  onDraft: () => Promise<string>
}) {
  const [sending, setSending] = React.useState(false)
  const [drafting, setDrafting] = React.useState(false)
  const boxRef = React.useRef<HTMLTextAreaElement | null>(null)

  const setBody = (update: ReplyDraftUpdate) => onBodyChange(threadId, update)

  // Coming back to a conversation you left half answered puts the caret after
  // the last word, so you carry on typing instead of hunting for the end.
  // Before the paint, so the caret is never seen at the start first.
  //
  // Only when there is something to come back to: a conversation opened with
  // an empty box should not take the focus off the list you are arrowing
  // through.
  useEffectBeforePaint(() => {
    const box = boxRef.current
    if (!box || !box.value) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }, [threadId])

  const send = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      const { reopened } = await sendReply(threadId, body.trim())
      setBody("")
      // The conversation was closed or snoozed and answering it put it back in
      // the inbox. Said out loud, because a status changing under somebody
      // without a word is its own surprise.
      if (reopened) toast.success("Reopened, because you answered it.")
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
        ref={boxRef}
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
