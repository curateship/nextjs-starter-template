import * as React from "react"
import {
  AlertTriangleIcon,
  ClockIcon,
  ExternalLinkIcon,
  LinkIcon,
  Loader2Icon,
  MessageCircleReplyIcon,
  RefreshCwIcon,
  Repeat2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  ThumbsUpIcon,
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
  checkLinkedinWords,
  draftLinkedinComments,
  getLinkedinErrorMessage,
  readLinkedinPostNow,
  rewriteLinkedinWords,
  saveLinkedinPostDraft,
  sendLinkedinComment,
  takeBackLinkedinComment,
  type LinkedinFindDetail,
  type LinkedinRulesVerdict,
} from "@/lib/api/social/linkedin"
import {
  LINKEDIN_COMMENT_CHARS,
  LINKEDIN_DRAFTS_PER_PRESS,
  LINKEDIN_REWRITE_WORDS,
  LINKEDIN_REWRITES,
  LINKEDIN_TIDY_AFTER_HOURS,
} from "@/lib/social/linkedin/options"
import { linkedinPaceLine, linkedinPaceWarning, linkedinPostingRefusal, linkedinWaitingText } from "@/lib/social/linkedin/wording"
import { WORKDAY_WORDS } from "@/lib/social/linkedin/workday"
import { holdsLink } from "@/lib/social/x/options"
import { shortCount } from "@/lib/social/x/wording"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XPanelFrame } from "../x/x-panel-frame"
import { countWord, upWords } from "../x/x-words"
import type { LinkedinAccount } from "./linkedin-account-picker"
import { LinkedinFindChips } from "./linkedin-finds"
import { linkedinAccountName, linkedinFollowersText, writerWords } from "./linkedin-words"

type Under = { id: string; name: string; text: string }

/**
 * One LinkedIn post in the right column, and the comment on it (parts 22 to
 * 27 and 33): the post, its top comments with Answer this instead, what the
 * picked account said before on posts like it, two drafts in its voice, Help
 * only, the three rewrites, the rules check, the characters against
 * LinkedIn's limit, and Post with ten seconds to take it back. Too similar
 * only warns (Tyler's answer), so Post still goes and the warning shows
 * afterwards. Nothing goes out until Post is pressed, and the comment waits
 * for the account's workday (part 7).
 */
export function LinkedinFindPanel({
  projectId,
  find,
  loading,
  account,
  asPageId,
  accountPicker,
  onBack,
  onSkip,
  onRepost,
  onChanged,
}: {
  projectId: string
  find: LinkedinFindDetail | null
  loading: boolean
  account: LinkedinAccount | null
  /** The company page picked to speak as, or "" for the person (part 38). */
  asPageId: string
  /** The Comment as dropdown, drawn on its own row above the box. */
  accountPicker: React.ReactNode
  onBack?: () => void
  onSkip: (findId: string) => Promise<void>
  /** Opens a repost draft on the Posts tab (part 33). */
  onRepost: (postRowId: string) => void
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [under, setUnder] = React.useState<Under | null>(null)
  const [fromDraft, setFromDraft] = React.useState<string | null>(null)
  const [helpOnly, setHelpOnly] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "draft" | "check" | "post" | "skip" | "read" | "rewrite" | "repost">(null)
  const [verdict, setVerdict] = React.useState<{ text: string; result: LinkedinRulesVerdict } | null>(null)
  const [undo, setUndo] = React.useState<{ commentRowId: string; text: string; until: number } | null>(null)
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
      <XPanelFrame title="The post and your comment" onBack={onBack}>
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the post
        </p>
      </XPanelFrame>
    )
  }
  if (!find) {
    return (
      <XPanelFrame title="The post and your comment" onBack={onBack}>
        <p className="p-4 text-sm text-muted-foreground">Pick a post from the list and it opens here, with its top comments and the comment you would send.</p>
      </XPanelFrame>
    )
  }

  const post = find
  const page = account?.pages.find((item) => item.pageId === asPageId) ?? null
  const refusal = account ? linkedinPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const paceWarning = account ? linkedinPaceWarning(account.posting) : null
  const held = account?.held.find((item) => post.sentHere.some((row) => row.id === item.commentRowId)) ?? null
  const undoSeconds = undo ? Math.max(0, Math.ceil((undo.until - clock) / 1000)) : 0
  const length = text.trim().length
  const linked = holdsLink(text)
  const drafts = post.drafts.filter((draft) => !draft.rewrite).slice(0, LINKEDIN_DRAFTS_PER_PRESS)
  const otherFeed = post.feedAccount && account && post.feedAccount.id !== account.id

  async function run<T>(which: NonNullable<typeof busy>, action: () => Promise<T>): Promise<T | null> {
    setBusy(which)
    try {
      return await action()
    } catch (error) {
      showErrorToast(getLinkedinErrorMessage(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  function send() {
    const words = text.trim()
    if (!words) {
      showErrorToast("Write the comment first, or press Write with AI.")
      return
    }
    if (!account) {
      showErrorToast("Pick an account beside Comment as.")
      return
    }
    if (length > LINKEDIN_COMMENT_CHARS) {
      showErrorToast(`The comment is ${length} characters. LinkedIn takes ${LINKEDIN_COMMENT_CHARS}.`)
      return
    }
    if (linked) {
      showErrorToast("A comment never carries a link. Take the link out first.")
      return
    }
    void run("post", async () => {
      const sent = await sendLinkedinComment({
        findId: post.id,
        accountId: account.id,
        text: words,
        ...(under ? { underCommentId: under.id } : {}),
        helpOnly,
        ...(asPageId ? { asPageId } : {}),
        draftId: fromDraft,
      })
      if (sent.undoUntil) {
        setUndo({ commentRowId: sent.commentRowId, text: words, until: new Date(sent.undoUntil).getTime() })
        setClock(Date.now())
      } else if (sent.runAfter) {
        toast.success(linkedinWaitingText(new Date(sent.runAfter), linkedinAccountName(account.handle)))
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

  function repost() {
    void run("repost", async () => {
      const saved = await saveLinkedinPostDraft({
        projectId,
        postRowId: null,
        accountId: account?.id ?? null,
        kind: "repost",
        text: "",
        title: "",
        pictureUrl: "",
        videoUrl: "",
        poll: null,
        tags: [],
        repostFindId: post.id,
        groupId: "",
        asPageId: "",
        source: "",
        scheduledFor: null,
      })
      toast.success("A repost draft is open on the Posts tab. Write your line on top, then post it.")
      onRepost(saved.postRowId)
    })
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{post.author.name || "A LinkedIn post"}</span>
      {post.status !== "commented" ? (
        <Button type="button" variant="outline" disabled={busy === "skip"} onClick={() => void run("skip", () => onSkip(post.id))}>
          {busy === "skip" ? <Loader2Icon className="animate-spin" /> : null}
          Skip
        </Button>
      ) : null}
      <Hint label="Repost with your thoughts on top">
        <Button type="button" size="icon" variant="ghost" aria-label="Repost with your thoughts on top" disabled={busy === "repost"} onClick={repost}>
          {busy === "repost" ? <Loader2Icon className="animate-spin" /> : <Repeat2Icon />}
        </Button>
      </Hint>
      <Hint label="Open this post on LinkedIn">
        <Button type="button" size="icon" variant="ghost" asChild>
          <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open this post on LinkedIn">
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
              <LinkedinFindChips find={post} />
              <span>{writerWords(post)}</span>
              {linkedinFollowersText(post.author.followers) ? <span>{linkedinFollowersText(post.author.followers)}</span> : null}
              {post.postedAt ? <span>{postedDateText(new Date(post.postedAt))}</span> : null}
            </p>
            {post.text ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{post.text}</p>
            ) : (
              <p className="text-sm text-muted-foreground">LinkedIn gave none of this post&apos;s words.</p>
            )}
            {post.link ? (
              <a href={post.link} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                <LinkIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{post.link}</span>
              </a>
            ) : null}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>
                {shortCount(post.reactions)} {countWord(post.reactions, "reaction", "reactions")}
              </span>
              <span>
                {shortCount(post.comments)} {countWord(post.comments, "comment", "comments")}
              </span>
              <span>
                {shortCount(post.reposts)} {countWord(post.reposts, "repost", "reposts")}
              </span>
              {post.old ? <span>Older than {LINKEDIN_TIDY_AFTER_HOURS / 24} days</span> : null}
            </p>
            {post.keywords.length ? <p className="text-xs text-muted-foreground">Found by {post.keywords.join(", ")}</p> : null}
            {!post.canComment ? (
              <p className="text-xs text-destructive">The writer turned comments off or limited them to connections, so it can&apos;t be answered.</p>
            ) : null}
          </div>

          <TopComments
            find={post}
            reading={post.reading || busy === "read"}
            under={under?.id ?? null}
            onRead={() =>
              void run("read", async () => {
                await readLinkedinPostNow(post.id)
                await onChanged()
              })
            }
            onAnswer={(comment) => setUnder(comment)}
          />

          {post.past.length ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                What {account ? linkedinAccountName(account.handle) : "your accounts"} said before on posts like this
              </p>
              {post.past.map((past) => (
                <div key={past.id} className="grid gap-1 rounded-lg bg-muted/50 p-3">
                  <p className="truncate text-xs text-muted-foreground">
                    On &quot;{past.targetText}&quot;{past.reactions !== null ? ` · ${past.reactions} ${countWord(past.reactions, "reaction", "reactions")}` : ""}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{past.text}</p>
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
                    {row.account ? linkedinAccountName(row.account.handle) : "An account"} · {row.kind === "reply" ? `Reply to ${row.targetName || "a comment"}` : "Comment"} ·{" "}
                    {upWords(row)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{row.text}</p>
                  {row.status === "failed" ? <p className="text-xs text-destructive">{row.lastError}</p> : null}
                  {row.similarTo ? <p className="text-xs text-amber-700 dark:text-amber-400">{row.similarTo}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-1 gap-3 border-t p-4">
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
                    const top = post.topComments?.find((comment) => comment.id === draft.replyToId)
                    setUnder(top ? { id: top.id, name: top.name, text: top.text } : null)
                  }}
                  className={cn("h-16 overflow-hidden rounded-lg border bg-background p-2 text-left text-xs leading-relaxed", fromDraft === draft.id ? "border-foreground bg-muted" : null)}
                >
                  {draft.text}
                </button>
              </Hint>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="linkedin-help-only" className="text-sm font-normal">
            Help only, never name the product
          </Label>
          <Switch id="linkedin-help-only" checked={helpOnly} onCheckedChange={setHelpOnly} />
        </div>

        {under ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">Replies to {under.name || "a comment"}&apos;s comment </span>&quot;{under.text.slice(0, 140)}&quot;
            </span>
            <Hint label="Comment on the post itself instead">
              <button type="button" aria-label="Comment on the post itself instead" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setUnder(null)}>
                <XIcon className="size-3.5" />
              </button>
            </Hint>
          </div>
        ) : null}

        {text.trim() ? (
          <div className="flex flex-wrap items-center gap-1">
            {LINKEDIN_REWRITES.map((how) => (
              <Button
                key={how}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("rewrite", async () => {
                    const rewritten = await rewriteLinkedinWords({ findId: post.id, text: text.trim(), how })
                    setText(rewritten.text)
                    setFromDraft(rewritten.id)
                    setVerdict(null)
                  })
                }
              >
                {LINKEDIN_REWRITE_WORDS[how]}
              </Button>
            ))}
          </div>
        ) : null}

        {verdict && verdict.text === text.trim() ? (
          verdict.result.ok ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Breaks none of LinkedIn&apos;s rules, as far as the AI can tell.
            </p>
          ) : (
            <div className="grid gap-1 text-xs text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                LinkedIn&apos;s rules
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
              disabled={busy !== null}
              onClick={() =>
                void run("post", async () => {
                  await takeBackLinkedinComment(undo.commentRowId)
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
              {linkedinWaitingText(new Date(held.runAfter), account ? linkedinAccountName(account.handle) : null)}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("post", async () => {
                  await takeBackLinkedinComment(held.commentRowId)
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
          <Hint label={account ? linkedinPaceLine(account.posting) : null}>
            <span className="shrink-0 text-xs text-muted-foreground">Comment as</span>
          </Hint>
          {accountPicker}
        </div>

        <div className="@container/box grid grid-cols-1 rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
          <Textarea
            id="linkedin-comment-text"
            aria-label={under ? "What to reply to the comment" : "What to comment"}
            className="min-h-[calc(3lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            aria-invalid={length > LINKEDIN_COMMENT_CHARS || linked || undefined}
            onChange={(event) => {
              setText(event.target.value)
              setVerdict(null)
              const source = post.drafts.find((draft) => draft.id === fromDraft)
              if (source && source.text !== event.target.value) setFromDraft(null)
            }}
            placeholder={drafts.length ? "Pick a draft above, or write your comment" : "Write your comment"}
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
                    await draftLinkedinComments({
                      findId: post.id,
                      accountId: account?.id ?? null,
                      helpOnly,
                      ...(under ? { underCommentId: under.id } : {}),
                      ...(page ? { asPage: page.name } : {}),
                    })
                    await onChanged()
                  })
                }
              >
                {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                <span className="hidden @[20rem]/box:inline">Write with AI</span>
              </Button>
            </Hint>
            {text.trim() ? (
              <Hint label="Check the words against LinkedIn's rules">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Check"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("check", async () => {
                      const words = text.trim()
                      setVerdict({ text: words, result: await checkLinkedinWords({ projectId, text: words, isComment: true }) })
                    })
                  }
                >
                  {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                  <span className="hidden @[24rem]/box:inline">Check</span>
                </Button>
              </Hint>
            ) : null}
            <span className={cn("flex-1 text-right text-xs tabular-nums", length > LINKEDIN_COMMENT_CHARS ? "text-destructive" : "text-muted-foreground")}>
              {length}/{LINKEDIN_COMMENT_CHARS}
            </span>
            <Button type="button" size="sm" disabled={busy === "post"} onClick={send}>
              {busy === "post" ? <Loader2Icon className="animate-spin" /> : null}
              Post
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {under
            ? `A reply goes under that comment. ${WORKDAY_WORDS}.`
            : `The account likes the post a few seconds before it comments, as a person would. ${WORKDAY_WORDS}.`}
        </p>
        {linked ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>A comment never carries a link. Take it out first.</span>
          </p>
        ) : null}
        {otherFeed ? (
          <p className="text-xs text-muted-foreground">
            This post came from {post.feedAccount?.handle ? `in/${post.feedAccount.handle}` : "another account"}&apos;s own feed, so only that account comments on it.
          </p>
        ) : null}
        {account && !account.handle ? (
          <p className="text-xs text-muted-foreground">This account is not signed in to LinkedIn yet. Sign it in, then press Check now on the Accounts dashboard.</p>
        ) : refusal ? (
          <p className="text-xs text-muted-foreground">{refusal}</p>
        ) : account && !account.posting.working && account.posting.nextWorkAt ? (
          <p className="text-xs text-muted-foreground">{linkedinWaitingText(new Date(account.posting.nextWorkAt), linkedinAccountName(account.handle))}</p>
        ) : null}
      </div>
    </XPanelFrame>
  )
}

/** The post's top comments, or a press to read them (part 22), each with Answer this instead (part 25). */
function TopComments({
  find,
  reading,
  under,
  onRead,
  onAnswer,
}: {
  find: LinkedinFindDetail
  reading: boolean
  under: string | null
  onRead: () => void
  onAnswer: (comment: Under) => void
}) {
  if (!find.topComments && reading) {
    return (
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the comments
      </p>
    )
  }
  if (!find.topComments) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {find.comments ? `${shortCount(find.comments)} ${find.comments === 1 ? "comment" : "comments"}, not read yet` : "No comments yet, as of the last search"}
        </p>
        <Button type="button" variant="outline" onClick={onRead}>
          Read the comments
        </Button>
      </div>
    )
  }
  const readAgain = (
    <Hint label="Read the post and its comments again now, through a search account">
      <Button type="button" size="sm" variant="ghost" disabled={reading} onClick={onRead}>
        {reading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        Read again
      </Button>
    </Hint>
  )
  if (!find.topComments.length) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {find.comments ? "LinkedIn counts comments here, and none of them could be read." : "Nobody has commented. Yours would be the first."}
        </p>
        {readAgain}
      </div>
    )
  }
  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Top comments{find.readAt ? `, read ${postedDateText(new Date(find.readAt)).toLowerCase()}` : ""}. The AI adds something they do not say.
        </p>
        {readAgain}
      </div>
      {find.topComments.map((comment) => (
        <div key={comment.id} className={cn("grid gap-1 rounded-lg bg-muted/50 p-3", under === comment.id && "ring-2 ring-ring")}>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{comment.headline ? `${comment.name}, ${comment.headline}` : comment.name || "Someone"}</span>
            <span className="inline-flex items-center gap-0.5">
              <ThumbsUpIcon className="size-3" aria-hidden="true" />
              {shortCount(comment.reactions)}
            </span>
          </p>
          <p className="text-sm whitespace-pre-wrap break-words">{comment.text}</p>
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => onAnswer({ id: comment.id, name: comment.name, text: comment.text })}>
              <MessageCircleReplyIcon />
              Answer this instead
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
