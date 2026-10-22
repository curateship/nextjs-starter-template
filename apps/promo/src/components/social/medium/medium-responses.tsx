import * as React from "react"
import { ArrowLeftIcon, ExternalLinkIcon, HandIcon, Loader2Icon, MessageSquareIcon, RefreshCwIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  changeOnMedium,
  checkMediumNow,
  dealWithFailedResponse,
  draftMediumAnswer,
  getMediumErrorMessage,
  sendMediumAnswer,
  type MediumResponseView,
} from "@/lib/api/social/medium"
import { MAX_RESPONSE_CHARS, type MediumIncoming } from "@/lib/social/medium/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** "Still up", "Gone", "Not checked yet". */
function visibleWords(row: MediumResponseView): string {
  if (row.deletedAt) return "Deleted"
  if (row.status === "waiting") return "Waiting to go"
  if (row.status === "failed") return "Did not go out"
  if (row.stillVisible === null) return "Not checked yet"
  return row.stillVisible ? "Still up" : "Gone"
}

/**
 * The Responses tab's list (parts 35 and 38): every response this project's
 * accounts sent, newest first, with its claps, the responses under it and
 * whether it is still up, or under Failed the ones that did not go out. The
 * numbers are null until the reader checks them, and say so rather than 0.
 */
export function MediumResponsesList({
  list,
  rows,
  loading,
  error,
  selectedId,
  onList,
  onSelect,
  onRetry,
  onChanged,
}: {
  list: "sent" | "failed"
  rows: MediumResponseView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onList: (list: "sent" | "failed") => void
  onSelect: (responseId: string) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [checking, setChecking] = React.useState(false)
  const checkable = rows.filter((row) => row.status === "posted" && !row.deletedAt).map((row) => row.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {(["sent", "failed"] as const).map((item) => (
          <Button key={item} type="button" size="sm" variant={list === item ? "secondary" : "ghost"} aria-pressed={list === item} onClick={() => onList(item)}>
            {item === "sent" ? "Sent" : "Failed"}
          </Button>
        ))}
        <span className="flex-1" />
        {list === "sent" && checkable.length ? (
          <Hint label="Read every response here again now: claps, responses under it, and whether it is still up">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkMediumNow({ responseIds: checkable.slice(0, 50) })
                  toast.success(queued ? `Checking ${queued} ${queued === 1 ? "response" : "responses"}.` : "Every one is being checked already.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getMediumErrorMessage(failure))
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check
            </Button>
          </Hint>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="grid justify-items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The responses could not be read. {error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the responses
          </p>
        ) : !rows.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {list === "failed" ? "Nothing failed. A response that does not go out shows here, with Try again." : "Nothing sent from this project on Medium yet. Respond to a story and it shows here."}
          </p>
        ) : (
          <div className="py-1.5">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={row.id === selectedId || undefined}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  row.id === selectedId && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
                )}
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{row.isAnswer ? `Answer to @${row.replyTo?.writer || "a reader"}` : row.storyTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[row.account ? `@${row.account.handle}` : null, postedDateText(row.postedAt ?? row.createdAt), visibleWords(row), row.toAnswer ? `${row.toAnswer} to answer` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <HandIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">Claps </span>
                  {row.claps ?? "?"}
                </span>
                <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <MessageSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">Responses under it </span>
                  {row.incoming ? row.incoming.length : "?"}
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * One sent response in the right column (parts 36 to 38): what it said, the
 * responses people wrote under it with an answer box for each, Edit and
 * Delete on Medium, and for a failed one Try again or Dismiss.
 */
export function MediumResponsePanel({
  projectId,
  row,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  row: MediumResponseView | null
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [words, setWords] = React.useState(row?.text ?? "")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {row ? (row.account ? `@${row.account.handle}` : "A response") : "A response and the answers to it"}
        </span>
        {row?.status === "posted" && !row.deletedAt ? (
          <>
            <Hint label="Change its words on Medium">
              <Button type="button" size="icon" variant="ghost" aria-label="Edit on Medium" onClick={() => setEditing((open) => !open)}>
                <SettingsIcon />
              </Button>
            </Hint>
            <Hint label="Delete it from Medium">
              <Button type="button" size="icon" variant="ghost" aria-label="Delete from Medium" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon />
              </Button>
            </Hint>
          </>
        ) : null}
        {row?.responseUrl ? (
          <Hint label="Open it on Medium">
            <Button type="button" size="icon" variant="ghost" asChild>
              <a href={row.responseUrl} target="_blank" rel="noreferrer" aria-label="Open it on Medium">
                <ExternalLinkIcon />
              </a>
            </Button>
          </Hint>
        ) : null}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {!row ? (
          <p className="p-4 text-sm text-muted-foreground">Click a response to see what it said, how it is doing, and the responses people wrote under it.</p>
        ) : (
          <div className="grid gap-4 p-4">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">
                {row.isAnswer ? `Answering @${row.replyTo?.writer || "a reader"}` : "On"}{" "}
                <a href={row.storyUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {row.isAnswer ? "their response" : row.storyTitle}
                </a>
              </p>
              {row.isAnswer && row.replyTo ? <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{row.replyTo.text}</p> : null}
            </div>
            {editing ? (
              <div className="grid gap-2">
                <Textarea aria-label="The new words" value={words} onChange={(event) => setWords(event.target.value)} aria-invalid={words.length > MAX_RESPONSE_CHARS || undefined} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("edit", async () => {
                        await changeOnMedium({ responseId: row.id, action: "edit", text: words.trim() })
                        setEditing(false)
                        toast.success("The new words are on their way to Medium.")
                      })
                    }
                  >
                    {busy === "edit" ? <Loader2Icon className="animate-spin" /> : null}
                    Save changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-1">
                <p className="text-sm whitespace-pre-wrap">{row.text}</p>
                {row.line ? <p className="text-xs text-muted-foreground">Answered the line &quot;{row.line}&quot;</p> : null}
                {row.editedAt ? <p className="text-xs text-muted-foreground">Edited {postedDateText(row.editedAt).toLowerCase()}</p> : null}
              </div>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{visibleWords(row)}</span>
              <span>{row.claps === null ? "Claps not read yet" : `${row.claps} ${row.claps === 1 ? "clap" : "claps"}`}</span>
              {row.checkedAt ? <span>Checked {postedDateText(row.checkedAt).toLowerCase()}</span> : null}
            </p>

            {row.status === "failed" ? (
              <div className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm text-destructive">{row.lastError}</p>
                {row.mayHaveLanded ? <p className="text-xs text-muted-foreground">It may be on Medium anyway. Try again looks for it under the story first, and never sends it twice.</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void run("dismiss", async () => { await dealWithFailedResponse(row.id, "dismiss"); onClose() })}>
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("retry", async () => {
                        await dealWithFailedResponse(row.id, "retry")
                        toast.success("Sent again. It goes through every check a first press does.")
                        onClose()
                      })
                    }
                  >
                    {busy === "retry" ? <Loader2Icon className="animate-spin" /> : null}
                    Try again
                  </Button>
                </div>
              </div>
            ) : null}

            {row.incoming === null ? (
              <p className="border-t pt-4 text-sm text-muted-foreground">The responses under it are read on the next check.</p>
            ) : row.incoming.length ? (
              <div className="grid gap-3 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">Responses under it</p>
                {row.incoming.map((item) =>
                  row.account ? (
                    <IncomingAnswer
                      key={item.id}
                      projectId={projectId}
                      accountId={row.account.id}
                      under={{ responseId: row.id }}
                      title={row.storyTitle}
                      mine={row.text}
                      item={item}
                      onChanged={onChanged}
                    />
                  ) : null
                )}
              </div>
            ) : (
              <p className="border-t pt-4 text-sm text-muted-foreground">Nobody has responded to it yet.</p>
            )}
          </div>
        )}
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this response from Medium?"
        description="The account's browser deletes it on Medium. Promo keeps its record."
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          row
            ? void run("delete", async () => {
                await changeOnMedium({ responseId: row.id, action: "delete" })
                setConfirmDelete(false)
                toast.success("On its way to being deleted on Medium.")
              })
            : undefined
        }
      />
    </div>
  )
}

/**
 * Somebody's response under one of ours or under one of our articles, with
 * a drafted answer and Send (part 36). Nothing goes out until Send.
 */
export function IncomingAnswer({
  projectId,
  accountId,
  under,
  title,
  mine,
  item,
  onChanged,
}: {
  projectId: string
  accountId: string
  under: { responseId: string } | { articleId: string }
  title: string
  mine: string
  item: MediumIncoming
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState<null | "draft" | "send">(null)
  const [sent, setSent] = React.useState(false)
  return (
    <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{item.writer ? `@${item.writer}` : "a reader"}</span>
        <span className="inline-flex items-center gap-0.5">
          <HandIcon className="size-3" aria-hidden="true" />
          {item.claps}
        </span>
      </p>
      <p className="text-sm whitespace-pre-wrap">{item.text}</p>
      {sent ? (
        <p className="text-xs text-muted-foreground">Your answer is on its way.</p>
      ) : (
        <div className="grid grid-cols-1 rounded-lg border bg-background">
          <Textarea
            aria-label={`Your answer to ${item.writer || "this reader"}`}
            className="min-h-[calc(2lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your answer"
          />
          <div className="flex items-center gap-1 p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("draft")
                try {
                  setText((await draftMediumAnswer({ projectId, accountId, title, mine, theirs: item.text, writer: item.writer })).text)
                } catch (failure) {
                  showErrorToast(getMediumErrorMessage(failure))
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Write with AI
            </Button>
            <span className="flex-1" />
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                if (!text.trim()) {
                  showErrorToast("Write the answer first, or press Write with AI.")
                  return
                }
                setBusy("send")
                try {
                  await sendMediumAnswer({ under, incomingId: item.id, text: text.trim() })
                  setSent(true)
                  toast.success("Sent. It goes out in ten seconds, or in the account's morning.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getMediumErrorMessage(failure))
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "send" ? <Loader2Icon className="animate-spin" /> : null}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
