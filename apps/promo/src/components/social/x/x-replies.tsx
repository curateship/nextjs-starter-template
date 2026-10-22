import * as React from "react"
import { AlertTriangleIcon, AtSignIcon, ClockIcon, ExternalLinkIcon, HeartIcon, Loader2Icon, RefreshCwIcon, SettingsIcon, SparklesIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  changeOnX,
  checkXNow,
  dealWithFailedXReply,
  draftXAnswer,
  getXErrorMessage,
  sendXAnswer,
  takeBackXReply,
  type XMentionView,
  type XReplyView,
} from "@/lib/api/social/x"
import { xLength, xPostLimit, type XIncoming, type XReplyKind } from "@/lib/social/x/options"
import { postedDateText } from "@/lib/social/wording"
import { shortCount, xWaitingText } from "@/lib/social/x/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XListError, XPanelFrame } from "./x-panel-frame"
import { numbersLine, upWords } from "./x-words"

const KIND_WORDS: Record<XReplyKind, string> = { reply: "Reply", quote: "Quote", answer: "Answer" }

const rowClass = (selected: boolean) =>
  cn(
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
  )

/**
 * The Replies tab's list (parts 37 to 40): every reply, quote and answer this
 * project's accounts sent, newest first, with its views, likes and replies
 * and whether it is still up, or under Failed the ones that did not go out.
 * The numbers are null until a check reads them, and say so rather than 0.
 * Under the sent ones are the posts that named the project's accounts
 * (part 39), each with Answer.
 */
export function XRepliesList({
  list,
  rows,
  mentions,
  loading,
  error,
  selectedId,
  onList,
  onSelect,
  onRetry,
  onChanged,
}: {
  list: "sent" | "failed"
  rows: XReplyView[]
  mentions: XMentionView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onList: (list: "sent" | "failed") => void
  onSelect: (id: string) => void
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
          <Hint label="Read the 50 newest replies here again now: views, likes, the replies under each, and whether each is still up">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkXNow({ replyIds: checkable.slice(0, 50) })
                  toast.success(queued ? `Checking ${queued} ${queued === 1 ? "reply" : "replies"}.` : "Every one is being checked already.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getXErrorMessage(failure))
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
          <XListError what="replies" error={error} onRetry={onRetry} />
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the replies
          </p>
        ) : (
          <div className="grid gap-3 py-1.5">
            {rows.length ? (
              <div>
                {rows.map((row) => (
                  <button key={row.id} type="button" onClick={() => onSelect(row.id)} aria-current={row.id === selectedId || undefined} className={rowClass(row.id === selectedId)}>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">{KIND_WORDS[row.kind]}</span>
                        <span className="truncate text-sm">{row.text}</span>
                        {row.similarTo ? (
                          <Hint label={row.similarTo}>
                            <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" role="img" aria-label="Close to another account's words" />
                          </Hint>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          row.account ? `@${row.account.handle}` : null,
                          `to @${row.targetHandle}: ${row.targetText.slice(0, 80)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          postedDateText(new Date(row.postedAt ?? row.createdAt)),
                          upWords(row),
                          row.status === "posted" ? numbersLine(row) : null,
                          row.editedAt ? "Edited" : null,
                          row.toAnswer ? `${row.toAnswer} to answer` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 pt-3 text-sm text-muted-foreground">
                {list === "failed"
                  ? "Nothing failed. A reply that does not go out shows here, with Try again."
                  : "Nothing sent from this project on X yet. Reply to a post and it shows here."}
              </p>
            )}
            {list === "sent" ? (
              <section aria-label="Posts naming your accounts" className="grid gap-1 border-t pt-3">
                <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
                  <AtSignIcon className="size-3.5" aria-hidden="true" />
                  Posts naming your accounts
                  <span className="font-normal text-muted-foreground tabular-nums">{mentions.length}</span>
                </h3>
                {mentions.length ? (
                  mentions.map((mention) => (
                    <button
                      key={mention.id}
                      type="button"
                      onClick={() => onSelect(mention.id)}
                      aria-current={mention.id === selectedId || undefined}
                      className={rowClass(mention.id === selectedId)}
                    >
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">Mention</span>
                          <span className="truncate text-sm">{mention.text}</span>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[
                            `@${mention.handle} named @${mention.account.handle}`,
                            mention.postedAt ? postedDateText(new Date(mention.postedAt)) : null,
                            mention.answered ? "Answered" : "Not answered",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 text-sm text-muted-foreground">No post has named your accounts yet. They are read with the daily check.</p>
                )}
              </section>
            ) : null}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * One sent reply, quote or answer in the right column (parts 37, 38 and
 * 40): what it said and what it answered, its numbers, the replies people
 * wrote under it with an answer box for each, Check now, Edit (a paid
 * account inside X's hour) and Delete on X, and for a failed one Try again or
 * Dismiss.
 */
export function XReplyPanel({
  projectId,
  row,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  row: XReplyView | null
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
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const limit = xPostLimit(row?.account?.paid ?? false)
  const live = row?.status === "posted" && !row.deletedAt
  // The server never tries a phone's failure again when it may be on X, so the panel offers no button for it.
  const phoneMayHaveLanded = Boolean(row?.mayHaveLanded && row.account?.onPhone)

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {row ? `${KIND_WORDS[row.kind]}${row.account ? ` from @${row.account.handle}` : ""}` : "A reply and the answers to it"}
      </span>
      {row && live ? (
        <>
          <Hint label="Check now: read its views, likes, the replies under it, and whether it is still up">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Check now"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  const { queued } = await checkXNow({ replyIds: [row.id] })
                  toast.success(queued ? "Checking it now." : "It is being checked already.")
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            </Button>
          </Hint>
          {row.canEdit ? (
            <Hint label="Change its words on X. A paid account may, within the hour after it went out">
              <Button type="button" size="icon" variant="ghost" aria-label="Edit on X" onClick={() => setEditing((open) => !open)}>
                <SettingsIcon />
              </Button>
            </Hint>
          ) : null}
          <Hint label="Delete it from X">
            <Button type="button" size="icon" variant="ghost" aria-label="Delete from X" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
            </Button>
          </Hint>
        </>
      ) : null}
      {row?.postUrl ? (
        <Hint label="Open it on X">
          <Button type="button" size="icon" variant="ghost" asChild>
            <a href={row.postUrl} target="_blank" rel="noreferrer" aria-label="Open it on X">
              <ExternalLinkIcon />
            </a>
          </Button>
        </Hint>
      ) : null}
    </>
  )

  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        {!row ? (
          <p className="p-4 text-sm text-muted-foreground">Click a reply to see what it said, how it is doing, and the replies people wrote under it.</p>
        ) : (
          <div className="grid gap-4 p-4">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">
                {row.kind === "quote" ? "Quoting" : "Answering"}{" "}
                <a href={row.targetUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  @{row.targetHandle}&apos;s post
                </a>
              </p>
              <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{row.targetText}</p>
            </div>
            {editing ? (
              <div className="grid gap-2">
                <Textarea aria-label="The new words" value={words} onChange={(event) => setWords(event.target.value)} aria-invalid={xLength(words) > limit || undefined} />
                <p className={cn("text-xs tabular-nums", xLength(words) > limit ? "text-destructive" : "text-muted-foreground")}>
                  {xLength(words)}/{limit}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("edit", async () => {
                        if (!words.trim()) throw new Error("Write the new words first, or delete it instead.")
                        const changed = await changeOnX({ replyId: row.id, action: "edit", text: words.trim() })
                        setEditing(false)
                        toast.success("The new words are on their way to X.")
                        if (changed.similarTo) toast.warning(`It still goes. ${changed.similarTo}`)
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
                {row.helpOnly ? <p className="text-xs text-muted-foreground">Help only: it never named the product.</p> : null}
                {row.editedAt ? <p className="text-xs text-muted-foreground">Edited {postedDateText(new Date(row.editedAt)).toLowerCase()}</p> : null}
              </div>
            )}
            {row.similarTo ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{row.similarTo}</span>
              </p>
            ) : null}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{upWords(row)}</span>
              {row.status === "posted" ? <span>{numbersLine(row)}</span> : null}
              {row.checkedAt ? <span>Checked {postedDateText(new Date(row.checkedAt)).toLowerCase()}</span> : null}
            </p>

            {row.status === "failed" ? (
              <div className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm text-destructive">{row.lastError}</p>
                {row.mayHaveLanded ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {phoneMayHaveLanded
                        ? "This went from a phone and may already be on X. Look under the post on X first. If it isn't there, Dismiss this one and write it again."
                        : "It may be on X anyway. Try again looks for it under the post first, and never sends it twice."}
                    </span>
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("dismiss", async () => {
                        await dealWithFailedXReply(row.id, "dismiss")
                        onClose()
                      })
                    }
                  >
                    Dismiss
                  </Button>
                  {phoneMayHaveLanded ? null : (
                  <Button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("retry", async () => {
                        const queued = await dealWithFailedXReply(row.id, "retry")
                        toast.success(
                          queued?.runAfter && !queued.undoUntil
                            ? xWaitingText(new Date(queued.runAfter), row.account?.handle ?? null)
                            : "Sent again. It goes through every check a first press does."
                        )
                        if (queued?.similarTo) toast.warning(`It still goes. ${queued.similarTo}`)
                        onClose()
                      })
                    }
                  >
                    {busy === "retry" ? <Loader2Icon className="animate-spin" /> : null}
                    Try again
                  </Button>
                  )}
                </div>
              </div>
            ) : null}

            {row.status !== "posted" ? null : row.incoming === null ? (
              <p className="border-t pt-4 text-sm text-muted-foreground">The replies under it are read on the next check.</p>
            ) : row.incoming.length ? (
              <div className="grid gap-3 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">Replies under it</p>
                {row.incoming.map((item) =>
                  row.account ? (
                    <XIncomingAnswer
                      key={item.id}
                      projectId={projectId}
                      accountId={row.account.id}
                      handle={row.account.handle}
                      paid={row.account.paid}
                      under={{ replyId: row.id }}
                      mine={row.text}
                      item={item}
                      answered={item.answered}
                      onChanged={onChanged}
                    />
                  ) : null
                )}
              </div>
            ) : (
              <p className="border-t pt-4 text-sm text-muted-foreground">Nobody has replied to it yet.</p>
            )}
          </div>
        )}
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this from X?"
        description="The account's browser deletes it on X, looking before and after. Promo keeps its record."
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          row
            ? void run("delete", async () => {
                await changeOnX({ replyId: row.id, action: "delete" })
                setConfirmDelete(false)
                toast.success("On its way to being deleted on X.")
              })
            : undefined
        }
      />
    </XPanelFrame>
  )
}

/** A post that named one of the project's accounts, with a drafted answer and Send (part 39). */
export function XMentionPanel({
  projectId,
  mention,
  onBack,
  onChanged,
}: {
  projectId: string
  mention: XMentionView
  onBack?: () => void
  onChanged: () => Promise<void>
}) {
  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        @{mention.handle} named @{mention.account.handle}
      </span>
      <Hint label="Open it on X">
        <Button type="button" size="icon" variant="ghost" asChild>
          <a href={mention.url} target="_blank" rel="noreferrer" aria-label="Open it on X">
            <ExternalLinkIcon />
          </a>
        </Button>
      </Hint>
    </>
  )
  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <XIncomingAnswer
            projectId={projectId}
            accountId={mention.account.id}
            handle={mention.account.handle}
            paid={mention.account.paid}
            under={{ mentionId: mention.id }}
            mine=""
            item={{ id: mention.postId, handle: mention.handle, name: mention.name, text: mention.text, likes: mention.likes, postedAt: mention.postedAt ? new Date(mention.postedAt).toISOString() : null, mention: true }}
            answered={mention.answered}
            onChanged={onChanged}
          />
        </div>
      </ScrollArea>
    </XPanelFrame>
  )
}

/** What became of an answer sent from this box: ten seconds to take it back, waiting for the account's morning, or gone to X. */
type SentAnswer =
  | { state: "undo"; replyId: string; text: string; until: number }
  | { state: "morning"; replyId: string; text: string; runAfter: Date }
  | { state: "going" }

/**
 * Somebody's reply under one of ours, under one of our own posts, or a post
 * naming the account, with a drafted answer and Send (parts 38 and 39).
 * Nothing goes out until Send, and it goes from the account they answered,
 * with ten seconds to take it back, or a wait for the account's waking hours.
 * One answered already shows as answered, with no box.
 */
export function XIncomingAnswer({
  projectId,
  accountId,
  handle,
  paid,
  under,
  mine,
  item,
  answered = false,
  onChanged,
}: {
  projectId: string
  accountId: string
  /** The account the answer goes from, for the waiting line. */
  handle: string | null
  paid: boolean
  under: { replyId: string } | { postRowId: string } | { mentionId: string }
  /** Our words they answered, or "" for a mention. */
  mine: string
  item: XIncoming
  answered?: boolean
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState<null | "draft" | "send" | "undo">(null)
  const [sent, setSent] = React.useState<SentAnswer | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())
  const limit = xPostLimit(paid)
  const length = xLength(text)

  // The countdown on Take it back, ticking only while one shows.
  React.useEffect(() => {
    if (sent?.state !== "undo") return
    const until = sent.until
    const timer = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= until) setSent({ state: "going" })
    }, 250)
    return () => clearInterval(timer)
  }, [sent])

  /** Takes a waiting answer back before it goes, and puts its words back in the box. */
  async function takeBack(waiting: { replyId: string; text: string }, said: string) {
    setBusy("undo")
    try {
      await takeBackXReply(waiting.replyId)
      setText(waiting.text)
      setSent(null)
      toast.success(said)
      await onChanged()
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const undoSeconds = sent?.state === "undo" ? Math.max(0, Math.ceil((sent.until - clock) / 1000)) : 0
  return (
    <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{item.name ? `${item.name} @${item.handle}` : `@${item.handle}`}</span>
        <span className="inline-flex items-center gap-0.5">
          <HeartIcon className="size-3" aria-hidden="true" />
          {shortCount(item.likes)}
        </span>
        {item.postedAt ? <span>{postedDateText(new Date(item.postedAt))}</span> : null}
      </p>
      <p className="text-sm whitespace-pre-wrap">{item.text}</p>
      {sent?.state === "undo" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-start gap-1.5">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Sending in {undoSeconds} {undoSeconds === 1 ? "second" : "seconds"}.
          </span>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void takeBack(sent, "Taken back. Nothing was sent.")}>
            {busy === "undo" ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
            Take it back
          </Button>
        </div>
      ) : sent?.state === "morning" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-start gap-1.5">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {xWaitingText(sent.runAfter, handle)}
          </span>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void takeBack(sent, "Cancelled. Nothing was sent.")}>
            {busy === "undo" ? <Loader2Icon className="animate-spin" /> : null}
            Cancel it
          </Button>
        </div>
      ) : sent?.state === "going" ? (
        <p className="text-xs text-muted-foreground">Your answer is on its way to X.</p>
      ) : answered ? (
        <p className="text-xs text-muted-foreground">Answered already.</p>
      ) : (
        <div className="grid grid-cols-1 rounded-lg border bg-background">
          <Textarea
            aria-label={`Your answer to @${item.handle}`}
            className="min-h-[calc(2lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            aria-invalid={length > limit || undefined}
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
                  setText(await draftXAnswer({ projectId, accountId, mine, theirs: item.text, author: item.handle }))
                } catch (failure) {
                  showErrorToast(getXErrorMessage(failure))
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Write with AI
            </Button>
            <span className={cn("flex-1 text-right text-xs tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
              {length}/{limit}
            </span>
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
                  const words = text.trim()
                  const queued = await sendXAnswer({ under, ...("mentionId" in under ? {} : { incomingId: item.id }), text: words })
                  if (queued.undoUntil) {
                    setSent({ state: "undo", replyId: queued.replyId, text: words, until: new Date(queued.undoUntil).getTime() })
                    setClock(Date.now())
                  } else if (queued.runAfter) {
                    setSent({ state: "morning", replyId: queued.replyId, text: words, runAfter: new Date(queued.runAfter) })
                  } else {
                    setSent({ state: "going" })
                  }
                  setText("")
                  if (queued.similarTo) toast.warning(`It still goes. ${queued.similarTo}`)
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getXErrorMessage(failure))
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
