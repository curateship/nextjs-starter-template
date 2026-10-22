import * as React from "react"
import {
  AlertTriangleIcon,
  ClockIcon,
  ExternalLinkIcon,
  HeartIcon,
  LinkIcon,
  ListPlusIcon,
  Loader2Icon,
  MessageCircleReplyIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  addToXList,
  checkXWords,
  draftXReplies,
  getXErrorMessage,
  readXPostNow,
  rewriteXWords,
  sendXReply,
  takeBackXReply,
  type XFindDetail,
  type XRulesVerdict,
} from "@/lib/api/social/x"
import { holdsLink, X_DRAFTS_PER_PRESS, X_REWRITE_WORDS, X_REWRITES, X_TIDY_AFTER_HOURS, xLength, xPostLimit } from "@/lib/social/x/options"
import { shortCount, xPaceLine, xPaceWarning, xPostingRefusal, xWaitingText } from "@/lib/social/x/wording"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import type { XAccount } from "./x-account-picker"
import { FindChips } from "./x-finds"
import { XPanelFrame } from "./x-panel-frame"
import { authorWords, countWord, upWords, xFollowersText } from "./x-words"

type Kind = "reply" | "quote"

/**
 * One X post in the right column, and the reply or quote to it (parts 21 to
 * 28 and 34): the post, its top replies with Reply to this instead, what
 * you said before on posts like it, two drafts in the account's voice, Help
 * only, the three rewrites, the rules check, the characters against X's
 * limit, and Post with ten seconds to take it back. Too similar only warns
 * (Tyler's answer), so Post still goes and the warning shows afterwards.
 * Nothing goes out until Post is pressed.
 */
export function XFindPanel({
  projectId,
  find,
  loading,
  account,
  accountPicker,
  onBack,
  onSkip,
  onChanged,
}: {
  projectId: string
  find: XFindDetail | null
  loading: boolean
  account: XAccount | null
  /** The Reply as dropdown, drawn on its own row above the box. */
  accountPicker: React.ReactNode
  onBack?: () => void
  onSkip: (findId: string) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [kind, setKind] = React.useState<Kind>("reply")
  const [under, setUnder] = React.useState<{ id: string; handle: string; text: string } | null>(null)
  const [fromDraft, setFromDraft] = React.useState<string | null>(null)
  const [helpOnly, setHelpOnly] = React.useState(account?.helpNext ?? false)
  // Help only starts as the picked account's mix says (part 24), and follows
  // a change of account; the person can still flip it.
  const [helpFor, setHelpFor] = React.useState(account?.id ?? null)
  if ((account?.id ?? null) !== helpFor) {
    setHelpFor(account?.id ?? null)
    setHelpOnly(account?.helpNext ?? false)
  }
  const [busy, setBusy] = React.useState<null | "draft" | "check" | "post" | "skip" | "read" | "list" | "rewrite">(null)
  const [verdict, setVerdict] = React.useState<{ text: string; result: XRulesVerdict } | null>(null)
  const [undo, setUndo] = React.useState<{ replyId: string; text: string; until: number } | null>(null)
  const [similar, setSimilar] = React.useState("")
  const [clock, setClock] = React.useState(() => Date.now())

  // The countdown on Take it back, ticking only while one shows.
  React.useEffect(() => {
    if (!undo) return
    const timer = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= undo.until) setUndo(null)
    }, 250)
    return () => clearInterval(timer)
  }, [undo])

  if (loading && !find) {
    return (
      <XPanelFrame title="The post and your reply" onBack={onBack}>
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the post
        </p>
      </XPanelFrame>
    )
  }
  if (!find) {
    return (
      <XPanelFrame title="The post and your reply" onBack={onBack}>
        <p className="p-4 text-sm text-muted-foreground">Pick a post from the list and it opens here, with its top replies and the reply you would send.</p>
      </XPanelFrame>
    )
  }

  const post = find
  const refusal = account ? xPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const paceWarning = account ? xPaceWarning(account.posting) : null
  const held = account?.held.find((item) => post.sentHere.some((row) => row.id === item.replyId)) ?? null
  const undoSeconds = undo ? Math.max(0, Math.ceil((undo.until - clock) / 1000)) : 0
  const limit = xPostLimit(account?.paid ?? false)
  const length = xLength(text)
  const linked = holdsLink(text)
  const what = kind === "reply" ? "reply" : "quote"
  const drafts = post.drafts.filter((draft) => !draft.rewrite && draft.kind === kind).slice(0, X_DRAFTS_PER_PRESS)

  async function run<T>(which: NonNullable<typeof busy>, action: () => Promise<T>): Promise<T | null> {
    setBusy(which)
    try {
      return await action()
    } catch (error) {
      showErrorToast(getXErrorMessage(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  function pickKind(next: Kind) {
    setKind(next)
    setFromDraft(null)
    setVerdict(null)
    // A quote sits on the account's own page, so it never answers one reply.
    if (next === "quote") setUnder(null)
  }

  function send() {
    const words = text.trim()
    if (!words) {
      showErrorToast(`Write the ${what} first, or press Write with AI.`)
      return
    }
    if (!account) {
      showErrorToast(`Pick an account beside ${kind === "reply" ? "Reply as" : "Quote as"}.`)
      return
    }
    if (length > limit) {
      showErrorToast(
        account.paid
          ? `The ${what} is ${length} characters. Posts from here stop at ${limit}.`
          : `The ${what} is ${length} characters. X lets a free account post ${limit}. Shorten it, or mark the account as paid on the Accounts dashboard.`
      )
      return
    }
    if (linked) {
      showErrorToast(`A ${what} never carries a link. Take the link out first.`)
      return
    }
    void run("post", async () => {
      const sent = await sendXReply({
        findId: post.id,
        accountId: account.id,
        text: words,
        kind,
        ...(under ? { underReplyId: under.id } : {}),
        helpOnly,
        draftId: fromDraft,
      })
      if (sent.undoUntil) {
        setUndo({ replyId: sent.replyId, text: words, until: new Date(sent.undoUntil).getTime() })
        setClock(Date.now())
      } else if (sent.runAfter) {
        toast.success(xWaitingText(new Date(sent.runAfter), account.handle))
      }
      setSimilar(sent.similarTo)
      if (sent.similarTo) toast.warning(`It still goes. ${sent.similarTo}`)
      setText("")
      setUnder(null)
      setFromDraft(null)
      setVerdict(null)
      await onChanged()
    })
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{authorWords(post)}</span>
      {post.status !== "commented" ? (
        <Button type="button" variant="outline" disabled={busy === "skip"} onClick={() => void run("skip", () => onSkip(post.id))}>
          {busy === "skip" ? <Loader2Icon className="animate-spin" /> : null}
          Skip
        </Button>
      ) : null}
      {account?.handle ? (
        <Hint label={`Put @${post.author.handle} on @${account.handle}'s public X list`}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Put @${post.author.handle} on @${account.handle}'s public X list`}
            disabled={busy === "list"}
            onClick={() =>
              void run("list", async () => {
                await addToXList({ accountId: account.id, findId: post.id })
                toast.success(`On its way to @${account.handle}'s X list. It shows on the Posts tab.`)
                await onChanged()
              })
            }
          >
            {busy === "list" ? <Loader2Icon className="animate-spin" /> : <ListPlusIcon />}
          </Button>
        </Hint>
      ) : null}
      <Hint label="Open this post on X">
        <Button type="button" size="icon" variant="ghost" asChild>
          <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open this post on X">
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
          <div className="grid gap-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <FindChips find={post} />
              <span>{authorWords(post)}</span>
              {xFollowersText(post.author.followers) ? <span>{xFollowersText(post.author.followers)}</span> : null}
              {post.postedAt ? <span>{postedDateText(new Date(post.postedAt))}</span> : null}
            </p>
            {post.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.text}</p> : <p className="text-sm text-muted-foreground">X gave none of this post&apos;s words.</p>}
            {post.link ? (
              <a href={post.link} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                <LinkIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{post.link}</span>
              </a>
            ) : null}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>{post.views === null ? "Views not read" : `${shortCount(post.views)} ${countWord(post.views, "view", "views")}`}</span>
              <span>
                {shortCount(post.likes)} {countWord(post.likes, "like", "likes")}
              </span>
              <span>
                {shortCount(post.replies)} {countWord(post.replies, "reply", "replies")}
              </span>
              <span>
                {shortCount(post.reposts)} {countWord(post.reposts, "repost", "reposts")}
              </span>
              {post.old ? <span>Older than {X_TIDY_AFTER_HOURS} hours</span> : null}
            </p>
            {post.keywords.length ? <p className="text-xs text-muted-foreground">Found by {post.keywords.join(", ")}</p> : null}
          </div>

          <TopReplies
            find={post}
            reading={post.reading || busy === "read"}
            under={under?.id ?? null}
            onRead={() =>
              void run("read", async () => {
                await readXPostNow(post.id)
                await onChanged()
              })
            }
            onReplyTo={(reply) => {
              pickKind("reply")
              setUnder(reply)
            }}
          />

          {post.past.length ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">What you said before on posts like this</p>
              {post.past.map((past) => (
                <div key={past.id} className="grid gap-1 rounded-lg bg-muted/50 p-3">
                  <p className="truncate text-xs text-muted-foreground">
                    On &quot;{past.targetText}&quot;{past.likes !== null ? ` · ${past.likes} ${countWord(past.likes, "like", "likes")}` : ""}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{past.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {post.sentHere.length ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Sent on this post</p>
              {post.sentHere.map((row) => (
                <div key={row.id} className="grid gap-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {row.account ? `@${row.account.handle}` : "An account"} · {row.kind === "quote" ? "Quote" : "Reply"} ·{" "}
                    {upWords(row)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{row.text}</p>
                  {row.status === "failed" ? <p className="text-xs text-destructive">{row.lastError}</p> : null}
                  {row.similarTo ? <p className="text-xs text-amber-700 dark:text-amber-400">{row.similarTo}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-1 gap-3 border-t p-4">
        <div role="radiogroup" aria-label="Reply or quote" className="flex items-center gap-1">
          {(["reply", "quote"] as const).map((item) => (
            <Button key={item} type="button" size="sm" variant={kind === item ? "secondary" : "ghost"} role="radio" aria-checked={kind === item} onClick={() => pickKind(item)}>
              {item === "reply" ? "Reply" : "Quote"}
            </Button>
          ))}
          <span className="min-w-0 flex-1 truncate pl-2 text-xs text-muted-foreground">
            {kind === "quote" ? "Reposts it with your words on top, on the account's own page for good." : "Goes under the post."}
          </span>
        </div>

        {drafts.length ? (
          <div className="grid grid-cols-2 gap-2">
            {drafts.map((draft) => (
              <Hint key={draft.id} label={draft.text}>
                <button
                  type="button"
                  onClick={() => {
                    setText(draft.text)
                    setFromDraft(draft.id)
                    setHelpOnly(draft.helpOnly)
                    setVerdict(null)
                    const top = post.topReplies?.find((reply) => reply.id === draft.replyToId)
                    setUnder(top ? { id: top.id, handle: top.handle, text: top.text } : null)
                  }}
                  className={cn(
                    "h-16 overflow-hidden rounded-lg border bg-background p-2 text-left text-xs leading-relaxed",
                    fromDraft === draft.id ? "border-foreground bg-muted" : null
                  )}
                >
                  {draft.text}
                </button>
              </Hint>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="x-help-only" className="text-sm font-normal">
            Help only, never name the product
          </Label>
          <Switch id="x-help-only" checked={helpOnly} onCheckedChange={setHelpOnly} />
        </div>

        {under ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">Replies to @{under.handle}&apos;s reply </span>&quot;{under.text.slice(0, 140)}&quot;
            </span>
            <Hint label="Reply to the post itself instead">
              <button type="button" aria-label="Reply to the post itself instead" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setUnder(null)}>
                <XIcon className="size-3.5" />
              </button>
            </Hint>
          </div>
        ) : null}

        {text.trim() ? (
          <div className="flex flex-wrap items-center gap-1">
            {X_REWRITES.map((how) => (
              <Button
                key={how}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("rewrite", async () => {
                    const rewritten = await rewriteXWords({ findId: post.id, accountId: account?.id ?? null, text: text.trim(), how })
                    setText(rewritten.text)
                    setFromDraft(rewritten.id)
                    setVerdict(null)
                  })
                }
              >
                {X_REWRITE_WORDS[how]}
              </Button>
            ))}
          </div>
        ) : null}

        {verdict && verdict.text === text.trim() ? (
          verdict.result.ok ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Breaks none of X&apos;s rules, as far as the AI can tell.
            </p>
          ) : (
            <div className="grid gap-1 text-xs text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                X&apos;s rules
              </p>
              <ul className="grid list-disc gap-0.5 pl-5">
                {verdict.result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {undo ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-start gap-1.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Sending in {undoSeconds} {undoSeconds === 1 ? "second" : "seconds"}.
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void run("post", async () => {
                  await takeBackXReply(undo.replyId)
                  setText(undo.text)
                  setUndo(null)
                  setSimilar("")
                  toast.success("Taken back. Nothing was sent.")
                  await onChanged()
                })
              }
            >
              <Undo2Icon />
              Take it back
            </Button>
          </div>
        ) : null}

        {similar ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>It still goes. {similar}</span>
          </p>
        ) : null}

        {held ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-start gap-1.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {xWaitingText(new Date(held.runAfter), account?.handle ?? null)}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void run("post", async () => {
                  await takeBackXReply(held.replyId)
                  toast.success("Cancelled. Nothing was sent.")
                  await onChanged()
                })
              }
            >
              Cancel it
            </Button>
          </div>
        ) : null}

        {paceWarning ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{paceWarning}</span>
          </p>
        ) : null}

        <div className="flex min-w-0 items-center gap-2">
          <Hint label={account ? xPaceLine(account.posting) : null}>
            <span className="shrink-0 text-xs text-muted-foreground">{kind === "reply" ? "Reply as" : "Quote as"}</span>
          </Hint>
          {accountPicker}
        </div>

        <div className="@container/box grid grid-cols-1 rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
          <Textarea
            id="x-reply-text"
            aria-label={kind === "reply" ? "What to reply" : "What to say on top of the quote"}
            className="min-h-[calc(3lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            aria-invalid={length > limit || linked || undefined}
            onChange={(event) => {
              setText(event.target.value)
              setVerdict(null)
              const source = post.drafts.find((draft) => draft.id === fromDraft)
              if (source && source.text !== event.target.value) setFromDraft(null)
            }}
            placeholder={drafts.length ? `Pick a draft above, or write your ${what}` : `Write your ${what}`}
          />
          <div className="flex items-center gap-1 p-1.5">
            <Hint label={account?.voice ? `Write with AI, in the voice ${account.voice.name}` : "Write with AI. No voice picked for this account, so drafts are plain"}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Write with AI"
                disabled={busy !== null}
                onClick={() =>
                  void run("draft", async () => {
                    await draftXReplies({ findId: post.id, accountId: account?.id ?? null, helpOnly, kind, ...(under ? { underReplyId: under.id } : {}) })
                    await onChanged()
                  })
                }
              >
                {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                <span className="hidden @[20rem]/box:inline">Write with AI</span>
              </Button>
            </Hint>
            {text.trim() ? (
              <Hint label="Check the words against X's rules">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Check"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("check", async () => {
                      const words = text.trim()
                      setVerdict({ text: words, result: await checkXWords({ projectId, text: words, isReply: kind === "reply" }) })
                    })
                  }
                >
                  {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                  <span className="hidden @[24rem]/box:inline">Check</span>
                </Button>
              </Hint>
            ) : null}
            <span className={cn("flex-1 text-right text-xs tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
              {length}/{limit}
            </span>
            <Button type="button" size="sm" disabled={busy === "post"} onClick={send}>
              {busy === "post" ? <Loader2Icon className="animate-spin" /> : null}
              Post
            </Button>
          </div>
        </div>

        {linked ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>A {what} never carries a link. Take it out first.</span>
          </p>
        ) : null}
        {account && !account.handle ? (
          <p className="text-xs text-muted-foreground">This account is not signed in to X yet. Sign it in, then press Check now on the Accounts dashboard.</p>
        ) : refusal ? (
          <p className="text-xs text-muted-foreground">{refusal}</p>
        ) : null}
      </div>
    </XPanelFrame>
  )
}

/** The post's top replies, or a press to read them (part 22), each with Reply to this instead (part 26). */
function TopReplies({
  find,
  reading,
  under,
  onRead,
  onReplyTo,
}: {
  find: XFindDetail
  reading: boolean
  under: string | null
  onRead: () => void
  onReplyTo: (reply: { id: string; handle: string; text: string }) => void
}) {
  if (!find.topReplies && reading) {
    return (
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the replies…
      </p>
    )
  }
  if (!find.topReplies) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {find.replies ? `${shortCount(find.replies)} ${find.replies === 1 ? "reply" : "replies"}, not read yet` : "No replies yet, as of the last search"}
        </p>
        <Button type="button" variant="outline" onClick={onRead}>
          Read the replies
        </Button>
      </div>
    )
  }
  const readAgain = (
    <Hint label="Read the post and its replies again now, through a search account">
      <Button type="button" size="sm" variant="ghost" disabled={reading} onClick={onRead}>
        {reading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        Read again
      </Button>
    </Hint>
  )
  if (!find.topReplies.length) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {find.replies ? "X counts replies here, and none of them could be read." : "Nobody has replied. Yours would be the first."}
        </p>
        {readAgain}
      </div>
    )
  }
  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Top replies{find.readAt ? `, read ${postedDateText(new Date(find.readAt)).toLowerCase()}` : ""}. The AI adds something they do not say.
        </p>
        {readAgain}
      </div>
      {find.topReplies.map((reply) => (
        <div key={reply.id} className={cn("grid gap-1 rounded-lg bg-muted/50 p-3", under === reply.id && "ring-2 ring-ring")}>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{reply.name ? `${reply.name} @${reply.handle}` : `@${reply.handle}`}</span>
            <span className="inline-flex items-center gap-0.5">
              <HeartIcon className="size-3" aria-hidden="true" />
              {shortCount(reply.likes)}
            </span>
          </p>
          <p className="text-sm whitespace-pre-wrap">{reply.text}</p>
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => onReplyTo({ id: reply.id, handle: reply.handle, text: reply.text })}>
              <MessageCircleReplyIcon />
              Reply to this instead
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
