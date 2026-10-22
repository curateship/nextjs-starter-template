import * as React from "react"
import { AlertTriangleIcon, ClockIcon, Loader2Icon, PlusIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  actOnXPost,
  checkXWords,
  getXErrorMessage,
  saveXPostDraft,
  writeXPostWords,
  type XModuleView,
  type XPostSource,
  type XPostView,
  type XRulesVerdict,
} from "@/lib/api/social/x"
import { MAX_THREAD_PIECES, POLL_CHOICE_CHARS, POLL_CHOICES, X_POST_STATUS_WORDS, xLength, xPostLimit } from "@/lib/social/x/options"
import { xPostingRefusal, xWaitingText } from "@/lib/social/x/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import type { XAccount } from "./x-account-picker"
import { XPanelFrame } from "./x-panel-frame"
import { xAccountName } from "./x-words"

/** How long a poll stays open, as X offers it. */
const POLL_LENGTHS: Array<{ minutes: number; label: string }> = [
  { minutes: 60, label: "1 hour" },
  { minutes: 24 * 60, label: "1 day" },
  { minutes: 3 * 24 * 60, label: "3 days" },
  { minutes: 7 * 24 * 60, label: "7 days" },
]

/** The Select values for "nothing", since an item cannot be empty. */
const NONE = "none"
const OWN_PAGE = "own"

const SAVE_DELAY_MS = 700

type Fields = {
  accountId: string | null
  pieces: Array<{ text: string; pictureUrl: string }>
  pollOn: boolean
  choices: string[]
  minutes: number
  communityId: string
  source: string
  /** A datetime-local value in the reader's own clock, or "". */
  scheduledFor: string
}

/** A date as a datetime-local box writes it, in the reader's own clock. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The poll as it is saved: only when it has two to four filled choices short enough for X. */
function pollToSave(fields: Fields): { choices: string[]; minutes: number } | null {
  if (!fields.pollOn) return null
  const choices = fields.choices.map((choice) => choice.trim()).filter(Boolean)
  if (choices.length < POLL_CHOICES.min || choices.length > POLL_CHOICES.max) return null
  if (choices.some((choice) => choice.length > POLL_CHOICE_CHARS)) return null
  return { choices, minutes: fields.minutes }
}

/** What the X app on a phone cannot send, in the server's words, or null. */
function phoneRefusal(account: XAccount | null, fields: Fields): string | null {
  if (!account?.onPhone) return null
  const what = [fields.pieces.length > 1 ? "A thread" : null, fields.pollOn ? "A poll" : null, fields.communityId ? "Posting into a community" : null].filter(Boolean)
  if (!what.length) return null
  return `${account.handle ? `@${account.handle}` : "This account"} runs on a phone, and the X app there replies, quotes, posts and follows only. ${what.join(", ")} needs an X account on a browser profile.`
}

/**
 * A post or thread of the account's own that has not gone to X yet, or did
 * not finish (parts 29 to 33 and 35): who posts it, one box per post of the
 * thread with a picture each, what it starts from and what it is about for
 * the AI, a poll, a community, and an hour to post at. It saves itself 700ms
 * after the last change. Post goes through every check, then ten seconds to
 * take it back, or waits for its hour. A thread that stopped halfway carries
 * on from where it stopped with Try again and cannot be changed.
 */
export function XPostComposer({
  projectId,
  post,
  accounts,
  communities,
  sources,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  post: XPostView
  accounts: XAccount[]
  communities: XModuleView["communities"]
  sources: XPostSource[]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [fields, setFields] = React.useState<Fields>(() => ({
    accountId: post.account?.id ?? null,
    pieces: post.pieces.length ? post.pieces.map((piece) => ({ text: piece.text, pictureUrl: piece.pictureUrl })) : [{ text: "", pictureUrl: "" }],
    pollOn: Boolean(post.poll),
    choices: post.poll?.choices.length ? post.poll.choices : ["", ""],
    minutes: post.poll?.minutes ?? 24 * 60,
    communityId: post.communityId,
    source: post.source,
    scheduledFor: toLocalInput(post.scheduledFor),
  }))
  const [about, setAbout] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState<"saved" | "saving" | "not saved">("saved")
  const [verdict, setVerdict] = React.useState<{ words: string; result: XRulesVerdict } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [undoUntil, setUndoUntil] = React.useState<number | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())
  const latest = React.useRef(fields)
  const dirty = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The save going out right now, so Post and the next save wait for it instead of racing it. */
  const running = React.useRef<Promise<void> | null>(null)

  const waiting = post.status === "waiting"
  const stoppedHalfway = post.status === "failed" && post.piecesUp > 0
  const locked = waiting || stoppedHalfway

  // The countdown on Take it back, ticking only while one shows.
  React.useEffect(() => {
    if (undoUntil === null) return
    const tick = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= undoUntil) setUndoUntil(null)
    }, 250)
    return () => clearInterval(tick)
  }, [undoUntil])

  /**
   * Saves the draft as it stands. A save already going out is waited for
   * first, then whatever changed since goes too, so when this resolves the
   * server holds every change. A refused save stays waiting for the next try
   * and throws, so Post stops rather than going out with what was saved
   * before.
   */
  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    while (running.current) {
      try {
        await running.current
      } catch {
        // Whoever started that save reports its failure. The change is still
        // marked unsaved, so it is tried once more below.
      }
    }
    if (!dirty.current) return
    dirty.current = false
    const next = latest.current
    setSaving("saving")
    const save = (async () => {
      try {
        await saveXPostDraft({
          projectId,
          postRowId: post.id,
          post: {
            accountId: next.accountId,
            pieces: next.pieces,
            poll: pollToSave(next),
            communityId: next.communityId,
            source: next.source,
            scheduledFor: next.scheduledFor ? new Date(next.scheduledFor).toISOString() : null,
          },
        })
        if (!dirty.current) setSaving("saved")
      } catch (failure) {
        dirty.current = true
        setSaving("not saved")
        throw failure
      }
    })()
    running.current = save
    try {
      await save
    } finally {
      if (running.current === save) running.current = null
    }
  }, [post.id, projectId])

  /** A save nobody waits on: after a pause in typing, on leaving a field, on leaving the draft. */
  const saveSoon = React.useCallback(() => {
    flush().catch((failure: unknown) => showErrorToast(getXErrorMessage(failure)))
  }, [flush])

  React.useEffect(
    () => () => {
      if (timer.current) saveSoon()
    },
    [saveSoon]
  )

  function change(patch: Partial<Fields>, now = false) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setFields(next)
    setVerdict(null)
    dirty.current = true
    setSaving("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(saveSoon, now ? 0 : SAVE_DELAY_MS)
  }

  function changePiece(index: number, patch: Partial<Fields["pieces"][number]>, now = false) {
    change({ pieces: latest.current.pieces.map((piece, at) => (at === index ? { ...piece, ...patch } : piece)) }, now)
  }

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const account = accounts.find((item) => item.id === fields.accountId) ?? null
  const limit = xPostLimit(account?.paid ?? false)
  const refusal = account ? xPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const onPhone = phoneRefusal(account, fields)
  const pollInvalid = fields.pollOn && pollToSave(fields) === null
  const undoSeconds = undoUntil ? Math.max(0, Math.ceil((undoUntil - clock) / 1000)) : 0
  const allWords = fields.pieces.map((piece) => piece.text.trim()).join("\n\n")
  const community = communities.find((item) => item.communityId === fields.communityId) ?? null

  function publish() {
    if (!account) {
      showErrorToast("Pick the account it goes out as.")
      return
    }
    if (!stoppedHalfway) {
      if (fields.pieces.some((piece) => !piece.text.trim())) {
        showErrorToast("Write every post of the thread first, or take the empty one out.")
        return
      }
      const tooLong = fields.pieces.findIndex((piece) => xLength(piece.text) > limit)
      if (tooLong >= 0) {
        showErrorToast(`Post ${tooLong + 1} is ${xLength(fields.pieces[tooLong]?.text ?? "")} characters. ${account.paid ? "Posts from here stop" : "X lets a free account post"} at ${limit}.`)
        return
      }
      if (pollInvalid) {
        showErrorToast(`A poll has ${POLL_CHOICES.min} to ${POLL_CHOICES.max} choices, each at most ${POLL_CHOICE_CHARS} characters.`)
        return
      }
    }
    void run("publish", async () => {
      await flush()
      const queued = await actOnXPost(post.id, "publish")
      if (queued?.undoUntil) {
        setUndoUntil(new Date(queued.undoUntil).getTime())
        setClock(Date.now())
      } else if (queued?.runAfter) {
        toast.success(xWaitingText(new Date(queued.runAfter), account.handle || null))
      }
      if (queued?.similarTo) toast.warning(`It still goes. ${queued.similarTo}`)
      await onChanged()
    })
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {X_POST_STATUS_WORDS[post.status]}
        {!locked ? (
          <>
            {" "}
            · <span aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Not saved"}</span>
          </>
        ) : null}
      </span>
      {!locked && post.piecesUp === 0 ? (
        <Hint label="Delete this draft">
          <Button type="button" size="icon" variant="ghost" aria-label="Delete this draft" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
          </Button>
        </Hint>
      ) : null}
    </>
  )

  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-4">
          {post.status === "failed" ? (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {post.lastError}
                {stoppedHalfway
                  ? ` Posts 1 to ${post.piecesUp} of this thread are on X. Try again carries on from post ${post.piecesUp + 1} and never sends the earlier ones again.`
                  : ""}
              </span>
            </p>
          ) : null}

          <section className="grid gap-4" aria-label="Who posts it and where">
            <div className="grid gap-2">
              <FieldLabel htmlFor="x-post-account">Post as</FieldLabel>
              <Select value={fields.accountId ?? NONE} disabled={locked} onValueChange={(value) => change({ accountId: value === NONE ? null : value }, true)}>
                <SelectTrigger id="x-post-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Pick an account</SelectItem>
                  {accounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {xAccountName(item.handle)}
                      {item.paid ? " (paid)" : ""}
                      {item.onPhone ? " (on a phone)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="x-post-community"
                hint="Only communities on the Communities tab are offered. A community that has not let the account in refuses the post, and says so."
              >
                Community
              </FieldLabel>
              <Select value={fields.communityId || OWN_PAGE} disabled={locked} onValueChange={(value) => change({ communityId: value === OWN_PAGE ? "" : value }, true)}>
                <SelectTrigger id="x-post-community">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OWN_PAGE}>Your own page</SelectItem>
                  {communities.map((item) => (
                    <SelectItem key={item.communityId} value={item.communityId}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="x-post-at" hint="Leave it empty to post when you press Post. A time outside the account's waking hours is refused, because it would never post then.">
                Post at
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="x-post-at"
                  type="datetime-local"
                  className="w-full sm:w-fit"
                  value={fields.scheduledFor}
                  disabled={locked}
                  onChange={(event) => change({ scheduledFor: event.target.value }, true)}
                />
                {fields.scheduledFor && !locked ? (
                  <Hint label="Post when Post is pressed instead">
                    <Button type="button" size="icon" variant="ghost" aria-label="Clear the time" onClick={() => change({ scheduledFor: "" }, true)}>
                      <XIcon />
                    </Button>
                  </Hint>
                ) : null}
              </div>
            </div>
          </section>

          {!locked ? (
            <section className="grid gap-4" aria-label="Write it with AI">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="x-post-source"
                  hint="A published Medium article becomes a thread that ends with its link. A Reddit comment of yours that did well gives the AI its words to start from."
                >
                  Start from
                </FieldLabel>
                <Select value={fields.source || NONE} onValueChange={(value) => change({ source: value === NONE ? "" : value }, true)}>
                  <SelectTrigger id="x-post-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nothing, start from scratch</SelectItem>
                    {sources.map((item) => (
                      <SelectItem key={item.source} value={item.source}>
                        {item.label.slice(0, 80)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="x-post-about" hint="A line or two. The AI writes in the account's voice, one post or as many as the thread has boxes.">
                  What it is about
                </FieldLabel>
                <Textarea id="x-post-about" value={about} placeholder="Why small teams drop their task tool after a month" onChange={(event) => setAbout(event.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("write", async () => {
                      if (!about.trim() && !fields.source) throw new Error("Say what it is about, or pick something to start from.")
                      const written = await writeXPostWords({
                        projectId,
                        accountId: fields.accountId,
                        about: about.trim(),
                        pieces: fields.pieces.length,
                        source: fields.source,
                        communityId: fields.communityId,
                        poll: fields.pollOn,
                      })
                      const pieces = written.pieces.slice(0, MAX_THREAD_PIECES).map((text, index) => ({ text, pictureUrl: latest.current.pieces[index]?.pictureUrl ?? "" }))
                      change(
                        {
                          ...(pieces.length ? { pieces } : {}),
                          ...(latest.current.pollOn && written.choices.length ? { choices: written.choices.slice(0, POLL_CHOICES.max) } : {}),
                        },
                        true
                      )
                      toast.success("Written. Read it through and change what you like.")
                    })
                  }
                >
                  {busy === "write" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Write with AI
                </Button>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4" aria-label="The posts">
            {fields.pieces.map((piece, index) => {
              const length = xLength(piece.text)
              const up = index < post.piecesUp
              return (
                <div key={index} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`x-post-piece-${index}`} className="flex-1">
                      {fields.pieces.length > 1 ? `Post ${index + 1} of ${fields.pieces.length}` : "The post"}
                      {up ? <span className="font-normal text-muted-foreground"> · On X</span> : null}
                    </Label>
                    {fields.pieces.length > 1 && !locked ? (
                      <Hint label="Take this post out of the thread">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Take post ${index + 1} out of the thread`}
                          onClick={() => change({ pieces: latest.current.pieces.filter((_, at) => at !== index) }, true)}
                        >
                          <Trash2Icon />
                        </Button>
                      </Hint>
                    ) : null}
                  </div>
                  <Textarea
                    id={`x-post-piece-${index}`}
                    value={piece.text}
                    disabled={locked}
                    aria-invalid={length > limit || undefined}
                    placeholder={index === 0 ? "What the post says. It may carry a link." : "What comes next in the thread"}
                    onChange={(event) => changePiece(index, { text: event.target.value })}
                    onBlur={saveSoon}
                  />
                  <p className={cn("text-right text-xs tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
                    {length}/{limit}
                  </p>
                  <ImageUpload
                    label={fields.pieces.length > 1 ? `Picture on post ${index + 1}` : "Picture"}
                    value={piece.pictureUrl}
                    aspect="video"
                    disabled={locked}
                    emptyLabel="Add a picture"
                    hint="Pick one from the media library. X shows it under the post's words."
                    onChange={(value) => changePiece(index, { pictureUrl: value }, true)}
                  />
                </div>
              )
            })}
            {!locked && fields.pieces.length < MAX_THREAD_PIECES ? (
              <div>
                <Button type="button" variant="outline" onClick={() => change({ pieces: [...latest.current.pieces, { text: "", pictureUrl: "" }] }, true)}>
                  <PlusIcon />
                  Add a post to the thread
                </Button>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4" aria-label="Poll">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="x-post-poll" className="text-sm font-normal">
                A poll on the first post
              </Label>
              <Switch id="x-post-poll" checked={fields.pollOn} disabled={locked} onCheckedChange={(checked) => change({ pollOn: checked }, true)} />
            </div>
            {fields.pollOn ? (
              <div className="grid gap-4">
                {fields.choices.map((choice, index) => (
                  <div key={index} className="grid gap-2">
                    <Label htmlFor={`x-poll-choice-${index}`}>Choice {index + 1}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`x-poll-choice-${index}`}
                        value={choice}
                        disabled={locked}
                        maxLength={POLL_CHOICE_CHARS * 2}
                        aria-invalid={choice.trim().length > POLL_CHOICE_CHARS || undefined}
                        onChange={(event) => change({ choices: latest.current.choices.map((item, at) => (at === index ? event.target.value : item)) })}
                        onBlur={saveSoon}
                      />
                      {fields.choices.length > POLL_CHOICES.min && !locked ? (
                        <Hint label="Take this choice out">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Take choice ${index + 1} out`}
                            onClick={() => change({ choices: latest.current.choices.filter((_, at) => at !== index) }, true)}
                          >
                            <XIcon />
                          </Button>
                        </Hint>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-end gap-4">
                  {fields.choices.length < POLL_CHOICES.max && !locked ? (
                    <Button type="button" variant="outline" onClick={() => change({ choices: [...latest.current.choices, ""] }, true)}>
                      <PlusIcon />
                      Add a choice
                    </Button>
                  ) : null}
                  <div className="grid gap-2">
                    <Label htmlFor="x-poll-length">Open for</Label>
                    <Select value={String(fields.minutes)} disabled={locked} onValueChange={(value) => change({ minutes: Number(value) }, true)}>
                      <SelectTrigger id="x-poll-length" className="w-full sm:w-fit sm:min-w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(POLL_LENGTHS.some((item) => item.minutes === fields.minutes)
                          ? POLL_LENGTHS
                          : [...POLL_LENGTHS, { minutes: fields.minutes, label: `${fields.minutes} minutes` }]
                        ).map((item) => (
                          <SelectItem key={item.minutes} value={String(item.minutes)}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className={cn("text-xs", pollInvalid ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                  {POLL_CHOICES.min} to {POLL_CHOICES.max} choices, each at most {POLL_CHOICE_CHARS} characters. The votes are read back with the daily check.
                </p>
              </div>
            ) : null}
          </section>

          {verdict && verdict.words === allWords ? (
            verdict.result.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Breaks none of X&apos;s rules{community ? " or the community's" : ""}, as far as the AI can tell.
              </p>
            ) : (
              <ul className="grid list-disc gap-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
                {verdict.result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </ScrollArea>

      <div className="grid gap-3 border-t p-4">
        {onPhone ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{onPhone}</span>
          </p>
        ) : null}
        {!locked && refusal ? <p className="text-xs text-muted-foreground">{refusal}</p> : null}
        {waiting ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 items-start gap-1.5 text-sm">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {undoUntil
                ? `Posting in ${undoSeconds} ${undoSeconds === 1 ? "second" : "seconds"}.`
                : post.scheduledFor
                  ? `Posts at ${new Date(post.scheduledFor).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${account ? ` as @${account.handle}` : ""}.`
                  : `Waiting to post${account ? ` as @${account.handle}` : ""}.`}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("cancel", async () => {
                  await actOnXPost(post.id, "cancel")
                  setUndoUntil(null)
                  toast.success("Taken back. It is a draft again.")
                  await onChanged()
                })
              }
            >
              <Undo2Icon />
              Take it back
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!locked ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run("check", async () => {
                    if (!allWords.trim()) throw new Error("Write the post first, then check it.")
                    setVerdict({ words: allWords, result: await checkXWords({ projectId, text: allWords, communityId: fields.communityId || undefined, isReply: false }) })
                  })
                }
              >
                {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                Check X&apos;s rules
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button type="button" disabled={busy === "publish"} onClick={publish}>
              {busy === "publish" ? <Loader2Icon className="animate-spin" /> : null}
              {post.status === "failed" ? "Try again" : fields.scheduledFor ? "Post at that time" : "Post"}
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="It never went to X, so it is only deleted here."
        confirmLabel="Delete draft"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = null
            dirty.current = false
            await actOnXPost(post.id, "delete_draft")
            setConfirmDelete(false)
            onClose()
            await onChanged()
          })
        }
      />
    </XPanelFrame>
  )
}
