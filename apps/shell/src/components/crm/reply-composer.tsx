import * as React from "react"
import { PaperclipIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Textarea } from "@/components/ui/textarea"
import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { getCrmErrorMessage, sendReply } from "@/lib/api/crm/inbox"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { cn } from "@/lib/utils"
import { MediaPicker } from "@/components/media/media-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  className,
  threadId,
  body,
  canSend,
  replyFrom,
  onBodyChange,
  onSent,
  onDraft,
  status,
}: {
  /** The conversation's state in words, on the left of the last line: "Open". */
  status: string
  className?: string
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
  // Files from the media library, by the address the picker gave (CRM task
  // 22). Kept through a refused send; a sent reply clears them, and so does
  // opening another conversation.
  const [files, setFiles] = React.useState<string[]>([])
  const [filesFor, setFilesFor] = React.useState(threadId)
  if (filesFor !== threadId) {
    setFilesFor(threadId)
    setFiles([])
  }
  const [picking, setPicking] = React.useState(false)
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
      const { reopened } = await sendReply(threadId, body.trim(), files)
      setBody("")
      setFiles([])
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

  // Tyler, 7 Nov 2026: "clean up the right panel footer. move the send button
  // here ... move the draft with ai button beside it as well as file
  // attachemtn icon. Move the send as email right into the box bottom left".
  // So the box holds the words, the files and who it goes out as; the row
  // under it is the panel's last line, the state on the left and Draft with
  // AI, Attach and Send together on the right.
  return (
    <div className={cn("@container grid shrink-0 grid-cols-[minmax(0,1fr)]", className)}>
      <div className="min-w-0 p-3.75 pb-2">
        <div className="min-w-0 rounded-md border bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
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
            rows={3}
            // No ground of its own, in either theme: the box behind it is the
            // ground, so the "Sent as" line under it is not a darker bar
            // (Tyler, 7 Nov 2026: "why is there a black bar here").
            className="min-h-[4.5rem] resize-none rounded-b-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {files.length ? (
            <ul className="flex flex-wrap gap-1.5 px-3 pb-2" aria-label="Files going with the reply">
              {files.map((url) => (
                <li
                  key={url}
                  className="flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs"
                >
                  <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">{fileName(url)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Take off ${fileName(url)}`}
                    onClick={() => setFiles((current) => current.filter((item) => item !== url))}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {replyFrom ? (
            <p className="truncate px-3 pb-2 text-xs text-muted-foreground">Sent as {replyFrom}</p>
          ) : null}
        </div>
      </div>

      {/* No line between the box and this row (Tyler, 7 Nov 2026: "remove the
          divider"); the whole footer is one light grey ground. */}
      <div className="flex items-center gap-1 px-3.75 pb-2.5">
        <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground @xs:block">{status}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Draft with AI"
                onClick={draft}
                disabled={drafting}
              >
                <SparklesIcon className="size-4" />
                <span className="@max-[16rem]:hidden">{drafting ? "Writing…" : "Draft with AI"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Writes a reply from the conversation, under anything typed</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Attach a file from the media library, up to 10 MB in all"
                onClick={() => setPicking(true)}
              >
                <PaperclipIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach a file, up to 10 MB in all</TooltipContent>
          </Tooltip>
          <MediaPicker
            open={picking}
            onOpenChange={setPicking}
            onSelectMedia={(url) => {
              setPicking(false)
              setFiles((current) => (current.includes(url) || current.length >= 10 ? current : [...current, url]))
            }}
          />
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
    </div>
  )
}

/** A picked file's name, from the end of its address. */
function fileName(url: string) {
  const last = url.split("?")[0]?.split("/").pop() ?? url
  try {
    return decodeURIComponent(last) || url
  } catch {
    return last || url
  }
}
