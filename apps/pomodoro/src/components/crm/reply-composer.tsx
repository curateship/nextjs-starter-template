import * as React from "react"
import { ImageIcon, Loader2Icon, PaperclipIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Textarea } from "@/components/ui/textarea"
import {
  changeReplyDraft,
  changeReplyFiles,
  holdReply,
  replyDraftOf,
  replyFilesOf,
  useReplyStore,
  type ReplyFile,
} from "@/components/crm/reply-store"
import {
  CRM_MAX_BODY_LENGTH,
  CRM_REPLY_FILES_MAX,
  CRM_REPLY_UPLOAD_MAX_BYTES,
  crmFileNameFromUrl,
} from "@/lib/crm/crm"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { getCrmErrorMessage, scheduleConversationReply, uploadReplyFile } from "@/lib/api/crm/inbox"
import { SendLaterButton } from "@/components/crm/send-later"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
 * What is typed comes back to the box when a send fails. Losing it would
 * throw the words away over something the person could just try again.
 *
 * The words, the files and a reply waiting out its ten seconds live in the
 * CRM's reply store (`reply-store.ts`), not here, because this component is
 * thrown away and rebuilt every time another conversation is opened.
 */
export function ReplyComposer({
  className,
  threadId,
  canSend,
  replyFrom,
  onDraft,
  onScheduled,
  status,
}: {
  /** The conversation's status dropdown, on the left of the last line. */
  status: React.ReactNode
  className?: string
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
  onDraft: () => Promise<string>
  /** A reply was put off to a later time, so the conversation reads it again to draw it. */
  onScheduled: () => void
}) {
  // The words, the files and a reply waiting to send all live in the CRM's
  // reply store, keyed by conversation, because this box is rebuilt for every
  // conversation opened and the Inbox and Leads sections each draw their own
  // (`reply-store.ts`).
  const store = useReplyStore()
  const body = replyDraftOf(store, threadId)
  const files = replyFilesOf(store, threadId)
  const held = store.pending[threadId] ?? null
  const [picking, setPicking] = React.useState(false)
  const [drafting, setDrafting] = React.useState(false)
  // How many files from the computer are still on their way up.
  const [uploading, setUploading] = React.useState(0)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Each file goes up as it is picked and joins the reply once it is kept.
  // One that is refused says why and joins nothing; the rest still go. The
  // 10 MB is checked here first only to save sending a file that cannot go.
  const uploadPicked = async (picked: File[]) => {
    const room = CRM_REPLY_FILES_MAX - files.length
    if (picked.length > room) {
      showErrorToast(`A reply carries ${CRM_REPLY_FILES_MAX} files at most. Only the first ${Math.max(0, room)} were added.`)
    }
    for (const file of picked.slice(0, Math.max(0, room))) {
      if (file.size > CRM_REPLY_UPLOAD_MAX_BYTES) {
        showErrorToast(`${file.name} is over 10 MB, the most one reply can carry.`)
        continue
      }
      setUploading((count) => count + 1)
      try {
        const kept = await uploadReplyFile(file)
        changeReplyFiles(threadId, (current) => [
          ...current,
          { kind: "upload", key: kept.key, name: kept.name },
        ])
      } catch (error) {
        showErrorToast(`${file.name}: ${getCrmErrorMessage(error)}`)
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }
  const boxRef = React.useRef<HTMLTextAreaElement | null>(null)

  const setBody = (update: ReplyDraftUpdate) => changeReplyDraft(threadId, update)

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

  // Send holds the reply for ten seconds with Undo in the conversation, then
  // it goes (CRM task 38, part 1). A refused send puts the words and files
  // back here with the reason.
  // A file still on its way up is not in `files` yet, so a reply sent now
  // would go without it. Send and Send later wait for it.
  const waitingForFiles = uploading > 0

  const send = () => {
    if (!body.trim() || held || waitingForFiles) return
    holdReply(threadId, body.trim(), files)
  }

  // Send later (CRM task 38, part 6): the words and files go to the server
  // with the moment, and the box empties. Cancel on the scheduled reply puts
  // them back.
  const [scheduling, setScheduling] = React.useState(false)
  const scheduleFor = async (sendAt: Date) => {
    if (!body.trim() || scheduling || waitingForFiles) return
    setScheduling(true)
    try {
      await scheduleConversationReply({
        threadId,
        body: body.trim(),
        files: files.flatMap((file) => (file.kind === "media" ? [file.url] : [])),
        uploads: files.flatMap((file) => (file.kind === "upload" ? [{ key: file.key, name: file.name }] : [])),
        sendAt: sendAt.toISOString(),
      })
      changeReplyDraft(threadId, "")
      changeReplyFiles(threadId, () => [])
      onScheduled()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setScheduling(false)
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
              {files.map((file) => (
                <li
                  key={replyFileKey(file)}
                  className="flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs"
                >
                  <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Take off ${file.name}`}
                    onClick={() =>
                      changeReplyFiles(threadId, (current) =>
                        current.filter((item) => replyFileKey(item) !== replyFileKey(file))
                      )
                    }
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
      {/* Wraps rather than overlapping: in a narrow right panel the buttons
          go to a line of their own under the status, at the right. */}
      <div className="flex flex-wrap items-center gap-1 px-3.75 pb-2.5">
        <div className="flex min-w-fit flex-1">{status}</div>
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
          {/* Two ways in (CRM task 38, part 3): the media library, or any
              file from the computer, such as a PDF quote. */}
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Attach a file, up to 10 MB in all"
                    disabled={uploading > 0}
                  >
                    {uploading > 0 ? <Loader2Icon className="size-4 animate-spin" /> : <PaperclipIcon className="size-4" />}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Attach a file, up to 10 MB in all</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="w-52">
              <DropdownMenuItem onSelect={() => setPicking(true)}>
                <ImageIcon className="size-4" />
                From the media library
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <UploadIcon className="size-4" />
                From your computer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? [])
              event.target.value = ""
              void uploadPicked(picked)
            }}
          />
          <MediaPicker
            open={picking}
            onOpenChange={setPicking}
            onSelectMedia={(url) => {
              setPicking(false)
              changeReplyFiles(threadId, (current) =>
                current.some((file) => file.kind === "media" && file.url === url) || current.length >= CRM_REPLY_FILES_MAX
                  ? current
                  : [...current, { kind: "media", url, name: crmFileNameFromUrl(url) }]
              )
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
              disabled={noAddress || held !== null || scheduling || waitingForFiles || !body.trim() || !canSend}
            >
              Send
            </Button>
          </DisabledReason>
          <SendLaterButton
            disabled={noAddress || held !== null || scheduling || waitingForFiles || !body.trim() || !canSend}
            onPick={(sendAt) => void scheduleFor(sendAt)}
          />
        </div>
      </div>
    </div>
  )
}

/** One picked file, told apart from the others however it was picked. */
function replyFileKey(file: ReplyFile) {
  return file.kind === "media" ? `media:${file.url}` : `upload:${file.key}`
}
