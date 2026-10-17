import * as React from "react"
import { Loader2Icon, SendIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getPhoneAppErrorMessage,
  sendInboxAnswer,
  skipInboxItems,
  writeInboxDraft,
  type InboxRow,
} from "@/lib/api/social/phone-apps"
import { handleWords } from "@/lib/social/networks"
import { INBOX_STATUS_WORDS, replyMax } from "@/lib/social/phone-apps"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * One conversation or one comment, and the answer to it. Tyler, 16 Oct 2026:
 * nothing answers by itself. The AI's suggestion in the account's voice is
 * written into the box the first time it opens; Send sends what is in the
 * box, from the account's phone, once. Skip puts it away without a word: a
 * conversation is then deleted, words and all, and a comment marked skipped.
 */
export function InboxAnswer({
  item,
  onChanged,
}: {
  item: InboxRow
  /** Something was sent or skipped: the list is read again. */
  onChanged: (gone: boolean) => Promise<void>
}) {
  const open = item.status === "open"
  const [text, setText] = React.useState(item.draft)
  /** The first suggestion, asked for once when an open one is shown with nothing saved. */
  const [first, setFirst] = React.useState<"waiting" | "done">(open && !item.draft ? "waiting" : "done")
  const [pressed, setPressed] = React.useState(false)
  const [busy, setBusy] = React.useState<"send" | "skip" | null>(null)
  const max = replyMax(item.kind, item.platform)
  const asked = React.useRef(false)
  const drafting = pressed || first === "waiting"

  // Every state change lands in the answer's own callback, never in the
  // effect's body. The ref keeps a second run from paying for a second draft.
  React.useEffect(() => {
    if (first !== "waiting" || asked.current) return
    asked.current = true
    writeInboxDraft(item.id).then(
      ({ draft: written }) => {
        setText((current) => current || written)
        setFirst("done")
      },
      (failure: unknown) => {
        showErrorToast(getPhoneAppErrorMessage(failure))
        setFirst("done")
      }
    )
  }, [first, item.id])

  /** Write again: a fresh suggestion in place of what is in the box. */
  async function draft() {
    setPressed(true)
    try {
      const { draft: written } = await writeInboxDraft(item.id)
      setText(written)
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setPressed(false)
    }
  }

  async function send() {
    const words = text.trim()
    if (!words) {
      showErrorToast("Write the answer first.")
      return
    }
    if (words.length > max) {
      showErrorToast(`The answer is ${words.length} characters, and it may be ${max}. Shorten it first.`)
      return
    }
    setBusy("send")
    try {
      await sendInboxAnswer(item.id, words)
      toast.success("Sent to the phone. It types the answer in the app and presses Send once.")
      await onChanged(false)
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  async function skip() {
    setBusy("skip")
    try {
      await skipInboxItems([item.id])
      toast.success(item.kind === "message" ? "Skipped. The conversation was deleted from Promo." : "Skipped.")
      await onChanged(true)
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const account = handleWords(item.platform, item.account.handle) || "your account"

  return (
    <div className="grid gap-4">
      <ol className="grid gap-2" aria-label={item.kind === "message" ? "The conversation" : "The comment"}>
        {item.lines.map((line, index) => (
          <li
            key={`${index}-${line.from}`}
            className={cn("grid max-w-[85%] gap-0.5 rounded-lg px-3 py-2 text-sm", line.mine ? "justify-self-end bg-primary/10" : "justify-self-start bg-muted")}
          >
            <span className="text-xs text-muted-foreground">{line.mine ? account : line.from || "Them"}</span>
            <span className="whitespace-pre-wrap break-words">{line.text}</span>
          </li>
        ))}
      </ol>

      {item.status !== "open" ? (
        <p className="text-sm text-muted-foreground">
          {INBOX_STATUS_WORDS[item.status]}
          {item.replyText ? `: "${item.replyText}"` : "."}
        </p>
      ) : null}
      {item.lastError ? <p className="text-sm text-destructive">The last answer did not go out: {item.lastError}</p> : null}

      {open ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`answer-${item.id}`}>Your answer, as {account}</Label>
            <Textarea
              id={`answer-${item.id}`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={text.length > max || undefined}
              placeholder={drafting ? "Writing a suggestion in the account's voice" : "Write the answer"}
            />
            <p className={cn("text-xs", text.length > max ? "text-destructive" : "text-muted-foreground")}>
              {text.length.toLocaleString("en-US")} of {max.toLocaleString("en-US")} characters
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy !== null} onClick={() => void send()}>
              {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Send from phone
            </Button>
            <Button type="button" variant="outline" disabled={drafting} onClick={() => void draft()}>
              {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Write again
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void skip()}>
              {busy === "skip" ? <Loader2Icon className="animate-spin" /> : <XIcon />}
              Skip
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
