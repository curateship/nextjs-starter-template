import * as React from "react"
import {
  AlertTriangleIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  SettingsIcon,
  SparklesIcon,
  ThumbsUpIcon,
  Trash2Icon,
  Undo2Icon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  changeOnLinkedin,
  checkLinkedinNow,
  dealWithFailedLinkedinComment,
  draftLinkedinAnswer,
  draftLinkedinConnectNote,
  getLinkedinErrorMessage,
  sendLinkedinAnswer,
  sendLinkedinConnect,
  setLinkedinCommentExample,
  takeBackLinkedinComment,
  type LinkedinCommentView,
  type LinkedinModuleView,
} from "@/lib/api/social/linkedin"
import { CONNECT_NOTE_CHARS, LINKEDIN_COMMENT_CHARS, type LinkedinCommentKind, type LinkedinIncoming } from "@/lib/social/linkedin/options"
import { linkedinWaitingText } from "@/lib/social/linkedin/wording"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XListError, XPanelFrame } from "../x/x-panel-frame"
import { counted, upWords } from "../x/x-words"
import { linkedinAccountName } from "./linkedin-words"

type Account = LinkedinModuleView["accounts"][number]

const KIND_WORDS: Record<LinkedinCommentKind, string> = { comment: "Comment", reply: "Reply", answer: "Answer" }

const CONNECT_WORDS: Record<NonNullable<LinkedinCommentView["connect"]>, string> = {
  waiting: "Connect request on its way",
  sent: "Connect request sent",
  failed: "Connect request did not go",
}

const rowClass = (selected: boolean) =>
  cn(
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
  )

/** "in/jane-doe", or what to say before a look has seen it signed in. */
/** Reactions and replies in one line, or one "not read yet" when neither has been read. */
function numbersLine(row: { reactions: number | null; replyCount: number | null }): string {
  if (row.reactions === null && row.replyCount === null) return "Reactions and replies not read yet"
  return [counted(row.reactions, "reaction", "reactions"), counted(row.replyCount, "reply", "replies")].join(" · ")
}

/**
 * The Comments tab's list (parts 43 to 45): every comment, reply and answer
 * this project's LinkedIn accounts sent, newest first, with its reactions
 * and replies, whether it is still up, and the connection request it led to;
 * or under Failed the ones that did not go out. The numbers are null until a
 * check reads them, and say so rather than 0.
 */
export function LinkedinCommentsList({
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
  rows: LinkedinCommentView[]
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
          <Hint label="Read the 50 newest comments here again now: reactions, the replies under each, and whether each is still up">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkLinkedinNow({ commentRowIds: checkable.slice(0, 50) })
                  toast.success(queued ? `Checking ${queued} ${queued === 1 ? "comment" : "comments"}.` : "Every one is being checked already.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getLinkedinErrorMessage(failure))
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
          <XListError what="comments" error={error} onRetry={onRetry} />
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the comments
          </p>
        ) : rows.length ? (
          <div className="py-1.5">
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
                    {[row.account ? linkedinAccountName(row.account.handle) : null, `to ${row.targetName || "a post"}: ${row.targetText.slice(0, 80)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className={cn("truncate text-xs", row.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {[
                      postedDateText(new Date(row.postedAt ?? row.createdAt)),
                      upWords(row),
                      row.status === "posted" ? numbersLine(row) : null,
                      row.editedAt ? "Edited" : null,
                      row.toAnswer ? `${row.toAnswer} to answer` : null,
                      row.connect ? CONNECT_WORDS[row.connect] : null,
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
              ? "Nothing failed. A comment that does not go out shows here, with Try again."
              : "Nothing sent from this project on LinkedIn yet. Comment on a post and it shows here."}
          </p>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * One sent comment, reply or answer in the right column (parts 24, 39, 43,
 * 44 and 45): what it said and the post it sits under, its numbers, the
 * replies people wrote under it with an answer box for each, Check now, Edit
 * and Delete on LinkedIn, the switch that keeps it out of the AI's examples,
 * Connect with the post's writer, and for a failed one Try again or Dismiss.
 */
export function LinkedinCommentPanel({
  projectId,
  row,
  accounts,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  row: LinkedinCommentView | null
  accounts: Account[]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [words, setWords] = React.useState(row?.text ?? "")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [notExample, setNotExample] = React.useState(row?.notExample ?? false)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const live = row?.status === "posted" && !row.deletedAt
  // The server never tries a phone's failure again when it may be on LinkedIn, so the panel offers no button for it.
  const phoneMayHaveLanded = Boolean(row?.mayHaveLanded && row.account?.onPhone)
  const account = accounts.find((item) => item.id === row?.account?.id) ?? null
  // Somebody LinkedIn named a page for; a company page's post is refused with why when Send is pressed.
  const canConnect = Boolean(live && row && row.kind !== "answer" && !row.connect && row.targetSlug)

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {row ? `${KIND_WORDS[row.kind]}${row.account ? ` from ${linkedinAccountName(row.account.handle)}` : ""}` : "A comment and the replies to it"}
      </span>
      {row && live ? (
        <>
          <Hint label="Check now: read its reactions, the replies under it, and whether it is still up">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Check now"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  const { queued } = await checkLinkedinNow({ commentRowIds: [row.id] })
                  toast.success(queued ? "Checking it now." : "It is being checked already.")
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            </Button>
          </Hint>
          {/* The LinkedIn app on a phone neither edits nor deletes; those need a browser account. */}
          {!row.account?.onPhone ? (
            <>
              <Hint label="Change its words on LinkedIn">
                <Button type="button" size="icon" variant="ghost" aria-label="Edit on LinkedIn" onClick={() => setEditing((open) => !open)}>
                  <SettingsIcon />
                </Button>
              </Hint>
              <Hint label="Delete it from LinkedIn">
                <Button type="button" size="icon" variant="ghost" aria-label="Delete from LinkedIn" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon />
                </Button>
              </Hint>
            </>
          ) : null}
        </>
      ) : null}
      {row?.commentUrl || row?.targetUrl ? (
        <Hint label="Open it on LinkedIn">
          <Button type="button" size="icon" variant="ghost" asChild>
            <a href={row.commentUrl || row.targetUrl} target="_blank" rel="noreferrer" aria-label="Open it on LinkedIn">
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
          <p className="p-4 text-sm text-muted-foreground">Click a comment to see what it said, how it is doing, and the replies people wrote under it.</p>
        ) : (
          <div className="grid gap-4 p-4">
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">
                {row.kind === "comment" ? "On" : "Answering"}{" "}
                <a href={row.targetUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {row.targetName ? `${row.targetName}'s ${row.kind === "comment" ? "post" : "comment"}` : "a post"}
                </a>
                {row.asPageId ? " · as a company page" : ""}
              </p>
              <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words">{row.targetText}</p>
            </div>
            {editing ? (
              <div className="grid gap-2">
                <Textarea
                  aria-label="The new words"
                  value={words}
                  onChange={(event) => setWords(event.target.value)}
                  aria-invalid={words.trim().length > LINKEDIN_COMMENT_CHARS || undefined}
                />
                <p className={cn("text-xs tabular-nums", words.trim().length > LINKEDIN_COMMENT_CHARS ? "text-destructive" : "text-muted-foreground")}>
                  {words.trim().length}/{LINKEDIN_COMMENT_CHARS}
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
                        const changed = await changeOnLinkedin({ commentRowId: row.id, action: "edit", text: words.trim() })
                        setEditing(false)
                        toast.success("The new words are on their way to LinkedIn.")
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
                <p className="text-sm whitespace-pre-wrap break-words">{row.text}</p>
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

            {row.status === "posted" && row.kind !== "answer" ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`linkedin-not-example-${row.id}`} className="grid gap-0.5 font-normal">
                  <span className="text-sm">Keep it out of the AI&apos;s examples</span>
                  <span className="text-xs text-muted-foreground">The comments people liked most are shown to the AI as the account&apos;s voice. This one never will be.</span>
                </Label>
                <Switch
                  id={`linkedin-not-example-${row.id}`}
                  checked={notExample}
                  onCheckedChange={(checked) => {
                    setNotExample(checked)
                    void run("example", async () => {
                      try {
                        await setLinkedinCommentExample(row.id, checked)
                      } catch (failure) {
                        setNotExample(!checked)
                        throw failure
                      }
                    })
                  }}
                />
              </div>
            ) : null}

            {row.connect ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserPlusIcon className="size-3.5" aria-hidden="true" />
                {CONNECT_WORDS[row.connect]}
              </p>
            ) : canConnect && account ? (
              <div>
                <Button type="button" variant="outline" onClick={() => setConnecting(true)}>
                  <UserPlusIcon />
                  Connect with {row.targetName || "the writer"}
                </Button>
              </div>
            ) : null}

            {row.status === "failed" ? (
              <div className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm text-destructive">{row.lastError}</p>
                {row.mayHaveLanded ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {phoneMayHaveLanded
                        ? "This went from a phone and may already be on LinkedIn. Look under the post first. If it isn't there, Dismiss this one and write it again."
                        : "It may be on LinkedIn anyway. Try again looks for it under the post first, and never sends it twice."}
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
                        await dealWithFailedLinkedinComment(row.id, "dismiss")
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
                          const queued = await dealWithFailedLinkedinComment(row.id, "retry")
                          toast.success(
                            queued?.runAfter && !queued.undoUntil
                              ? linkedinWaitingText(new Date(queued.runAfter), row.account ? linkedinAccountName(row.account.handle) : null)
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
                    <LinkedinIncomingAnswer
                      key={item.id}
                      projectId={projectId}
                      accountId={row.account.id}
                      handle={row.account.handle}
                      under={{ commentRowId: row.id }}
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
        title="Delete this from LinkedIn?"
        description="The account's browser deletes it on LinkedIn, looking before and after. Promo keeps its record."
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          row
            ? void run("delete", async () => {
                await changeOnLinkedin({ commentRowId: row.id, action: "delete" })
                setConfirmDelete(false)
                toast.success("On its way to being deleted on LinkedIn.")
              })
            : undefined
        }
      />
      {row && account && connecting ? (
        <LinkedinConnectDialog
          accountId={account.id}
          accountName={linkedinAccountName(account.handle)}
          personName={row.targetName}
          from={{ commentRowId: row.id }}
          onClose={() => setConnecting(false)}
          onSent={onChanged}
        />
      ) : null}
    </XPanelFrame>
  )
}

/**
 * The window for one connection request (part 39). Tyler, 22 Oct 2026: the
 * AI writes a short note and he can edit it before Send. The note is asked
 * for when the window opens, and a request goes out only on Send, under the
 * week's number in Settings → Behaviour.
 */
export function LinkedinConnectDialog({
  accountId,
  accountName,
  personName,
  from,
  onClose,
  onSent,
}: {
  accountId: string
  accountName: string
  personName: string
  from: { commentRowId: string } | { viewerId: string }
  onClose: () => void
  onSent: () => Promise<void>
}) {
  const [note, setNote] = React.useState("")
  const [written, setWritten] = React.useState("")
  const [drafting, setDrafting] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const byComment = "commentRowId" in from
  const fromKey = byComment ? from.commentRowId : from.viewerId

  /** Asks the AI for the note. Its answer is kept as the words the window opened with, so only a person's edit counts as one. */
  const ask = React.useCallback(
    () => draftLinkedinConnectNote({ accountId, from: byComment ? { commentRowId: fromKey } : { viewerId: fromKey } }),
    [accountId, byComment, fromKey]
  )

  // The note is asked for once, when the window opens.
  React.useEffect(() => {
    let live = true
    ask().then(
      (words) => {
        if (!live) return
        setNote(words)
        setWritten(words)
        setDrafting(false)
      },
      (failure: unknown) => {
        if (!live) return
        showErrorToast(getLinkedinErrorMessage(failure))
        setDrafting(false)
      }
    )
    return () => {
      live = false
    }
  }, [ask])

  async function draftAgain() {
    setDrafting(true)
    try {
      const words = await ask()
      setNote(words)
      setWritten(words)
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setDrafting(false)
    }
  }

  const length = note.trim().length
  return (
    <FormDialog open dirty={note !== written} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Connect with {personName || "this person"}</DialogTitle>
            <DialogDescription>
              The request goes from {accountName}, with the note below. Change it as you like, or empty it to send none.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()
              if (drafting) {
                showErrorToast("The note is still being written. Send it once it shows, or clear it to send no note.")
                return
              }
              if (length > CONNECT_NOTE_CHARS) {
                showErrorToast(`The note is ${length} characters. LinkedIn takes ${CONNECT_NOTE_CHARS} on most accounts.`)
                return
              }
              setSending(true)
              try {
                const queued = await sendLinkedinConnect({ accountId, note: note.trim(), from })
                toast.success(
                  queued.runAfter ? linkedinWaitingText(new Date(queued.runAfter), accountName) : `The request to ${personName || "them"} is on its way.`
                )
                await onSent()
                onClose()
              } catch (failure) {
                showErrorToast(getLinkedinErrorMessage(failure))
              } finally {
                setSending(false)
              }
            }}
          >
            <DialogBody>
              <div className="grid gap-6">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The note</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="linkedin-connect-note">What it says</Label>
                      <Textarea
                        id="linkedin-connect-note"
                        rows={1}
                        value={note}
                        placeholder={drafting ? "The AI is writing a note" : "No note"}
                        aria-invalid={length > CONNECT_NOTE_CHARS || undefined}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <p className={cn("text-xs tabular-nums", length > CONNECT_NOTE_CHARS ? "text-destructive" : "text-muted-foreground")}>
                        {length} of {CONNECT_NOTE_CHARS} characters
                      </p>
                    </div>
                    <div>
                      <Button type="button" variant="outline" disabled={drafting} onClick={() => void draftAgain()}>
                        {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                        Write it again
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={sending} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2Icon className="animate-spin" /> : null}
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** What became of an answer sent from this box: ten seconds to take it back, waiting for the workday, or gone to LinkedIn. */
type SentAnswer =
  | { state: "undo"; commentRowId: string; text: string; until: number }
  | { state: "later"; commentRowId: string; text: string; runAfter: Date }
  | { state: "going" }

/**
 * Somebody's reply under one of our comments, or a comment under one of our
 * own posts, with a drafted answer and Send (part 44). Nothing goes out until
 * Send, and it goes from the account they answered, with ten seconds to take
 * it back, or a wait for the account's workday. One answered already shows
 * as answered, with no box.
 */
export function LinkedinIncomingAnswer({
  projectId,
  accountId,
  handle,
  under,
  mine,
  item,
  answered = false,
  onChanged,
}: {
  projectId: string
  accountId: string
  /** The account the answer goes from, for the waiting line. */
  handle: string
  under: { commentRowId: string } | { postRowId: string }
  /** Our words they answered. */
  mine: string
  item: LinkedinIncoming
  answered?: boolean
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState<null | "draft" | "send" | "undo">(null)
  const [sent, setSent] = React.useState<SentAnswer | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())
  const length = text.trim().length

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
  async function takeBack(waiting: { commentRowId: string; text: string }, said: string) {
    setBusy("undo")
    try {
      await takeBackLinkedinComment(waiting.commentRowId)
      setText(waiting.text)
      setSent(null)
      toast.success(said)
      await onChanged()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const undoSeconds = sent?.state === "undo" ? Math.max(0, Math.ceil((sent.until - clock) / 1000)) : 0
  return (
    <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{item.headline ? `${item.name}, ${item.headline}` : item.name || "Someone"}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5">
          <ThumbsUpIcon className="size-3" aria-hidden="true" />
          {item.reactions}
        </span>
        {item.postedAt ? <span className="shrink-0">{postedDateText(new Date(item.postedAt))}</span> : null}
      </p>
      <p className="text-sm whitespace-pre-wrap break-words">{item.text}</p>
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
      ) : sent?.state === "later" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-start gap-1.5">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {linkedinWaitingText(sent.runAfter, handle ? linkedinAccountName(handle) : null)}
          </span>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void takeBack(sent, "Cancelled. Nothing was sent.")}>
            {busy === "undo" ? <Loader2Icon className="animate-spin" /> : null}
            Cancel it
          </Button>
        </div>
      ) : sent?.state === "going" ? (
        <p className="text-xs text-muted-foreground">Your answer is on its way to LinkedIn.</p>
      ) : answered ? (
        <p className="text-xs text-muted-foreground">Answered already.</p>
      ) : (
        <div className="grid grid-cols-1 rounded-lg border bg-background">
          <Textarea
            aria-label={`Your answer to ${item.name || "them"}`}
            className="min-h-[calc(2lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            aria-invalid={length > LINKEDIN_COMMENT_CHARS || undefined}
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
                  setText(await draftLinkedinAnswer({ projectId, accountId, mine, theirs: item.text, author: item.name }))
                } catch (failure) {
                  showErrorToast(getLinkedinErrorMessage(failure))
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Write with AI
            </Button>
            <span className={cn("flex-1 text-right text-xs tabular-nums", length > LINKEDIN_COMMENT_CHARS ? "text-destructive" : "text-muted-foreground")}>
              {length}/{LINKEDIN_COMMENT_CHARS}
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
                  const queued = await sendLinkedinAnswer({ under, incomingId: item.id, text: words })
                  if (queued.undoUntil) {
                    setSent({ state: "undo", commentRowId: queued.commentRowId, text: words, until: new Date(queued.undoUntil).getTime() })
                    setClock(Date.now())
                  } else if (queued.runAfter) {
                    setSent({ state: "later", commentRowId: queued.commentRowId, text: words, runAfter: new Date(queued.runAfter) })
                  } else {
                    setSent({ state: "going" })
                  }
                  setText("")
                  if (queued.similarTo) toast.warning(`It still goes. ${queued.similarTo}`)
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getLinkedinErrorMessage(failure))
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
