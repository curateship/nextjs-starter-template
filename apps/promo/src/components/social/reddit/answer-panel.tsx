import * as React from "react"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  DRAFT_REWRITES,
  MAX_COMMENT_CHARS,
  PICK_AN_ACCOUNT,
  type DraftRewrite,
  type FindThread,
  type LinkPage,
} from "@/lib/social/options"
import { nearlyTheSame } from "@/lib/social/similar"
import {
  linkHostText,
  noWordsText,
  paceLineText,
  paceWarningText,
  postedDateText,
  splitIntoBlocks,
  subredditRemovalWarning,
  waitingCommentText,
  type BlockedReason,
} from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import type { RulesCheck } from "@/server/social/ai-tasks"
import type { PostingState } from "@/server/social/posting"
import type { PastAnswer } from "@/server/social/reddit/past-answers"
import type { RulesView } from "@/server/social/reddit/rules"

import { Hint } from "../hint"
import { SubredditRules } from "./subreddit-rules"

export type FindDetail = {
  id: string
  url: string
  subreddit: string
  title: string
  author: string
  score: number
  commentCount: number
  postedAt: Date | null
  body: string
  /** Where a link post points, or "" for a post with words or a picture. */
  linkUrl: string
  /** The linked page's title and opening, never the post's own words. */
  linkPage: LinkPage | null
  /** Null until the page has been tried. */
  linkReadAt: Date | null
  linkError: string
  thread: FindThread | null
  threadReadAt: Date | null
  /** A read of the replies is waiting or running. */
  threadReading: boolean
  /** The subreddit's own posted rules, shown above the box. */
  rules: RulesView
  /** Comments already sent on posts like this one, shown beside the box. */
  pastAnswers: PastAnswer[]
  /** How many of your checked comments in this subreddit are gone. */
  removals: { removed: number; checked: number }
  /** Set on a post found for one account's everyday subreddits: help alone, never the product. */
  helpAccountId: string | null
}

/** The words on the three rewrite buttons, in the order they sit. */
const REWRITE_LABELS: Record<DraftRewrite, string> = {
  shorter: "Shorter",
  plainer: "Plainer",
  no_product: "No product",
}

export type DraftView = {
  id: string
  text: string
  provider: string
  model: string
  status: string
}

/**
 * The post being answered and the comment being written, in one panel.
 *
 * One panel rather than two because they are one piece of work. The post, its
 * replies and the drafts scroll together, and the box you send from stays at
 * the bottom where it can always be reached.
 *
 * Nothing posts without the button below being pressed. There is no schedule
 * and no automatic retry. A comment pressed outside the account's waking hours
 * waits for its morning, says when it goes, and can be cancelled until then.
 */
export function AnswerPanel({
  find,
  prefill = null,
  handle,
  postWords = "Post comment",
  drafts,
  loading,
  working,
  disabledReason,
  postingState,
  voiceName,
  onRead,
  onReadRules,
  onDraft,
  onCheckRules,
  onRewrite,
  onPost,
  onUndo,
  onCancelWaiting,
  onSkip,
  onBack,
}: {
  /** Null when no post is selected. */
  find: FindDetail | null
  /**
   * Words to start the box with when this post opens: a failed comment's,
   * from Try again. Only filled in, never sent.
   */
  prefill?: { findId: string; text: string } | null
  /**
   * The Reddit account it posts as, without the u/: the one clicked on the
   * Projects dashboard. Null when none is clicked, or the clicked one was
   * never seen signed in.
   */
  handle: string | null
  /**
   * The Post button's words, naming the device the comment goes from:
   * "Post from phone · slot 4" or "Post from browser" (`postButtonWords`).
   */
  postWords?: string
  drafts: DraftView[]
  loading: boolean
  /** A browser job is waiting or running. */
  working: boolean
  /** Why posting is impossible right now, in words, or null. */
  disabledReason: BlockedReason | null
  /** The clicked account's pace and the comments waiting for its morning. Null with none clicked. */
  postingState: PostingState | null
  /** The voice drafts are written in, or null when the account has none. */
  voiceName: string | null
  onRead: (findId: string) => Promise<void>
  /** Reads the rules of the subreddit the post is in. */
  onReadRules: (findId: string) => Promise<void>
  onDraft: (findId: string) => Promise<void>
  /** Reads the words in the box against the rules, on a press of Check. Null when it failed. */
  onCheckRules: (findId: string, text: string) => Promise<RulesCheck | null>
  /** Rewrites the words in the box and stores the result as a draft. Null when it failed. */
  onRewrite: (findId: string, text: string, how: DraftRewrite) => Promise<{ id: string; text: string } | null>
  /**
   * Sends the comment. Answers with when Undo stops working, or null when it
   * waits for the account's morning instead, or the press failed.
   */
  onPost: (input: {
    findId: string
    text: string
    draftId: string | null
  }) => Promise<{ undoUntil: Date | null } | null>
  /** Takes back a comment inside its ten seconds. True when it was taken back. */
  onUndo: (findId: string) => Promise<boolean>
  /** Cancels this post's comment while it waits for the account's morning. */
  onCancelWaiting: (findId: string) => Promise<void>
  onSkip: (findId: string) => Promise<void>
  /**
   * Closes the post and goes back to the list, leaving the keyword and the
   * tab where they were. Passed only by the narrow layout, where the post
   * covers the list. On the wide one the list is beside it and there is
   * nowhere to go back to.
   */
  onBack?: () => void
}) {
  /** Whether the starting words have been put in the box already. They go in once. */
  const [prefillUsed, setPrefillUsed] = React.useState(() =>
    Boolean(prefill && find && prefill.findId === find.id)
  )
  const [text, setText] = React.useState(() =>
    prefill && find && prefill.findId === find.id ? prefill.text : ""
  )
  const [fromDraft, setFromDraft] = React.useState<string | null>(null)
  const [drafting, setDrafting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [skipping, setSkipping] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  /** The last rules check, and the words it read. Stale once the words change. */
  const [check, setCheck] = React.useState<{ text: string; result: RulesCheck } | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [checkOpen, setCheckOpen] = React.useState(false)
  const [rewriting, setRewriting] = React.useState<DraftRewrite | null>(null)
  /** The words before the last rewrite, so it can be undone. */
  const [beforeRewrite, setBeforeRewrite] = React.useState<{ text: string; draftId: string | null } | null>(null)
  const [pastOpen, setPastOpen] = React.useState(false)
  /** A comment just pressed, still inside its ten seconds, with what it said. */
  const [undo, setUndo] = React.useState<{
    findId: string
    text: string
    draftId: string | null
    until: number
  } | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())
  const [undoing, setUndoing] = React.useState(false)

  // A different post is a different comment. Worked out during this render
  // rather than in an effect, so the box is never briefly showing the words
  // meant for the post before it.
  const [lastFindId, setLastFindId] = React.useState(find?.id ?? null)
  if ((find?.id ?? null) !== lastFindId) {
    setLastFindId(find?.id ?? null)
    const refill = !prefillUsed && prefill && find && prefill.findId === find.id
    setText(refill ? prefill.text : "")
    if (refill) setPrefillUsed(true)
    setFromDraft(null)
    setCheck(null)
    setBeforeRewrite(null)
    setPastOpen(false)
  }

  // The countdown on Undo, ticking only while one is showing. The state is
  // set from the timer's own callback, never in the effect's body.
  React.useEffect(() => {
    if (!undo) return
    const timer = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= undo.until) setUndo(null)
    }, 250)
    return () => clearInterval(timer)
  }, [undo])
  const undoHere = undo && find && undo.findId === find.id && undo.until > clock ? undo : null
  const undoSeconds = undoHere ? Math.max(1, Math.ceil((undoHere.until - clock) / 1000)) : 0

  const freshCheck = check && check.text === text.trim() ? check.result : null
  const similar = find && text.trim()
    ? (find.pastAnswers.find((past) => nearlyTheSame(text, past.text)) ?? null)
    : null
  const removalWarning = find ? subredditRemovalWarning(find.subreddit, find.removals) : null

  const over = text.length > MAX_COMMENT_CHARS
  // A comment inside its ten seconds is drawn as Undo, not as a waiting one.
  const waiting =
    find && !undoHere ? (postingState?.waiting.find((item) => item.findId === find.id) ?? null) : null
  const paceWarning = postingState ? paceWarningText(postingState) : null
  // Every reason Post can be off, in the order a person fixes them.
  const postReason =
    (waiting
      ? "Your comment on this post is already waiting to go. Cancel it to send a different one."
      : null) ??
    disabledReason?.text ??
    (over
      ? `That is ${text.length} characters, and a comment stops at ${MAX_COMMENT_CHARS}.`
      : null)
  const postOff = posting || Boolean(postReason)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The subreddit is the header's title, quiet, with Skip and the way to
          Reddit beside it. Tyler's design, 13 Oct 2026. On a phone the
          header also carries the way back to the list. */}
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {find ? `r/${find.subreddit}` : "The post and your comment"}
        </span>
        {find ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={skipping}
              onClick={async () => {
                setSkipping(true)
                try {
                  await onSkip(find.id)
                } finally {
                  setSkipping(false)
                }
              }}
            >
              {skipping ? <Loader2Icon className="animate-spin" /> : null}
              Skip
            </Button>
            <Hint label="Open this post on Reddit">
              <Button type="button" size="icon" variant="ghost" asChild>
                <a href={find.url} target="_blank" rel="noreferrer" aria-label="Open this post on Reddit">
                  <ExternalLinkIcon />
                </a>
              </Button>
            </Hint>
          </>
        ) : null}
      </DashboardCardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Reading the post
            </p>
          ) : !find ? (
            <p className="text-sm text-muted-foreground">
              Pick a post from the list and it opens here, with whatever people
              have already replied and the comment you would send.
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                <h3 className="text-xl leading-snug font-semibold">
                  {find.title}
                </h3>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {find.author ? <span>u/{find.author}</span> : null}
                  {find.postedAt ? <span>{postedDateText(find.postedAt)}</span> : null}
                  <span className="inline-flex items-center gap-0.5">
                    <ArrowUpIcon className="size-3" />
                    {find.score}
                  </span>
                  <span>
                    {find.commentCount}{" "}
                    {find.commentCount === 1 ? "reply" : "replies"}
                  </span>
                </p>
              </div>

              {find.body ? (
                <PostBody body={find.body} />
              ) : find.linkPage ? (
                <LinkedPage page={find.linkPage} />
              ) : (
                <p className="text-sm text-muted-foreground">{noWordsText(find)}</p>
              )}

              <Replies find={find} working={working} onRead={onRead} />
            </>
          )}
        </div>
      </ScrollArea>

      {find ? (
        // A light ground, the same muted tone the shell's table headers and
        // footers use, so the writing area reads as its own section under
        // the post. The box and the drafts keep the page colour on it.
        // `grid-cols-1` is a column that may shrink below its widest line.
        // A plain grid sized itself to the rules row and its button, 301px
        // inside the 290px panel at a 1440px window, and pushed the post off
        // the panel's left edge. Measured 12 Oct 2026.
        <div className="grid grid-cols-1 gap-3 border-t p-4">
          {/* First in the writing area, because the rules are the thing to
              read before writing, not after. */}
          <SubredditRules
            subreddit={find.subreddit}
            rules={find.rules}
            working={working}
            onRead={() => onReadRules(find.id)}
          />
          {removalWarning ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{removalWarning} Post still works.</span>
            </p>
          ) : null}
          {find.helpAccountId ? (
            <p className="text-xs text-muted-foreground">
              A post from this account&apos;s everyday subreddits. Drafts only help, and never
              mention what you make.
            </p>
          ) : null}
          {drafts.length ? (
            <div className="grid grid-cols-2 gap-2">
              {drafts.slice(0, 2).map((draft) => (
                <Hint key={draft.id} label={draft.text}>
                  <button
                    type="button"
                    onClick={() => {
                      setText(draft.text)
                      setFromDraft(draft.id)
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

          {text.trim() ? (
            <div className="flex flex-wrap items-center gap-1">
              {DRAFT_REWRITES.map((how) => (
                <Hint
                  key={how}
                  label={
                    how === "no_product"
                      ? "Rewrite it with no mention of what you make"
                      : `Rewrite it ${REWRITE_LABELS[how].toLowerCase()}`
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rewriting !== null}
                    onClick={async () => {
                      setRewriting(how)
                      try {
                        const before = { text, draftId: fromDraft }
                        const answer = await onRewrite(find.id, text.trim(), how)
                        if (answer) {
                          setBeforeRewrite(before)
                          setText(answer.text)
                          setFromDraft(answer.id)
                        }
                      } finally {
                        setRewriting(null)
                      }
                    }}
                  >
                    {rewriting === how ? <Loader2Icon className="animate-spin" /> : null}
                    {REWRITE_LABELS[how]}
                  </Button>
                </Hint>
              ))}
              {beforeRewrite ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rewriting !== null}
                  onClick={() => {
                    setText(beforeRewrite.text)
                    setFromDraft(beforeRewrite.draftId)
                    setBeforeRewrite(null)
                  }}
                >
                  <Undo2Icon />
                  Undo rewrite
                </Button>
              ) : null}
            </div>
          ) : null}

          {similar ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>
                This is nearly the same as your comment on &quot;{similar.postTitle}&quot;. The
                same words twice reads like a bot.
              </span>
            </p>
          ) : null}

          {find.pastAnswers.length ? (
            <div className="grid gap-2">
              <button
                type="button"
                aria-expanded={pastOpen}
                onClick={() => setPastOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-sm text-left text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <HistoryIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  You answered {find.pastAnswers.length === 1 ? "a post" : `${find.pastAnswers.length} posts`} like
                  this before
                </span>
                <ChevronDownIcon
                  className={cn("size-3.5 shrink-0 transition-transform", pastOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {pastOpen
                ? find.pastAnswers.map((past) => (
                    <div key={past.id} className="grid gap-1 rounded-lg border bg-background p-2 text-xs">
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Hint label={past.postTitle}>
                          <span className="min-w-0 flex-1 truncate">
                            r/{past.subreddit} · {past.postTitle}
                          </span>
                        </Hint>
                        {past.upvotes !== null ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5">
                            <ArrowUpIcon className="size-3" />
                            {past.upvotes}
                          </span>
                        ) : null}
                      </p>
                      <p className="line-clamp-4 whitespace-pre-wrap">{past.text}</p>
                    </div>
                  ))
                : null}
            </div>
          ) : null}

          {freshCheck ? (
            freshCheck.broken.length ? (
              <div className="grid gap-1 text-xs text-amber-600 dark:text-amber-400">
                <button
                  type="button"
                  aria-expanded={checkOpen}
                  onClick={() => setCheckOpen((open) => !open)}
                  className="flex items-start gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    May break {freshCheck.broken.length === 1 ? "a rule" : `${freshCheck.broken.length} rules`}:{" "}
                    {freshCheck.broken[0].rule}. Post still works.
                  </span>
                  <ChevronDownIcon
                    className={cn("mt-px size-3.5 shrink-0 transition-transform", checkOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                {checkOpen ? (
                  <ul className="grid gap-1 pl-5">
                    {freshCheck.broken.map((item) => (
                      <li key={item.rule}>
                        <span className="font-medium">{item.rule}.</span> {item.why}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {freshCheck.subredditRulesRead
                  ? `Breaks none of r/${find.subreddit}'s rules or your own, as far as the AI can tell.`
                  : `Breaks none of your own rules. r/${find.subreddit}'s rules have not been read, so they were not checked.`}
              </p>
            )
          ) : null}

          {undoHere ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-start gap-1.5">
                <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Sending in {undoSeconds} {undoSeconds === 1 ? "second" : "seconds"}.
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={undoing}
                onClick={async () => {
                  setUndoing(true)
                  try {
                    if (await onUndo(undoHere.findId)) {
                      setText(undoHere.text)
                      setFromDraft(undoHere.draftId)
                      setUndo(null)
                    }
                  } finally {
                    setUndoing(false)
                  }
                }}
              >
                {undoing ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
                Undo
              </Button>
            </div>
          ) : null}

          {waiting ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-start gap-1.5">
                <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {waitingCommentText(waiting.runAfter, handle)}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true)
                  try {
                    await onCancelWaiting(find.id)
                  } finally {
                    setCancelling(false)
                  }
                }}
              >
                {cancelling ? <Loader2Icon className="animate-spin" /> : null}
                Cancel comment
              </Button>
            </div>
          ) : null}

          {/* Past the per-hour number it warns in amber and in words, and Post
              still works: pace is a judgement. A young account's hard limit
              shows in Post's own tooltip instead. */}
          {paceWarning ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{paceWarning}</span>
            </p>
          ) : null}

          {/* The box, with what to do with it along its bottom edge: Write
              with AI and Check on the left, who it posts as and Post on the
              right. Tyler's design, 13 Oct 2026. */}
          {/* `grid-cols-1` is a column that may shrink below its widest line,
              so who it posts as gives up its room rather than pushing Post
              past the box's edge. */}
          <div className="grid grid-cols-1 rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
            <Textarea
              id="promo-comment-text"
              aria-label="What to post"
              // Three lines tall before anything is typed, then it grows.
              // Tyler asked for three rows on 6 Oct 2026. The box around it
              // draws the border, so the field itself has none.
              className="min-h-[calc(3lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                // Edited past the draft it came from, so the record stops
                // claiming the AI wrote what actually went out.
                if (fromDraft) {
                  const source = drafts.find((draft) => draft.id === fromDraft)
                  if (source && source.text !== event.target.value) {
                    setFromDraft(null)
                  }
                }
              }}
              placeholder={drafts.length ? "Pick a draft above, or write your comment" : "Write your comment"}
            />
            {/* One row that never wraps: who it posts as gives up its room
                first, so Post always sits on the box's bottom right. */}
            <div className="flex items-center gap-1 p-1.5">
              <Hint
                label={
                  voiceName
                    ? `Drafts in the voice ${voiceName}`
                    : "No voice picked for this account, so drafts are plain"
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={drafting}
                  onClick={async () => {
                    setDrafting(true)
                    try {
                      await onDraft(find.id)
                    } finally {
                      setDrafting(false)
                    }
                  }}
                >
                  {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Write with AI
                </Button>
              </Hint>
              {/* Only on a press: Tyler, 12 Oct 2026, "let me click the check
                  button". Offered once there are words to check. */}
              {text.trim() ? (
                <Hint label="Check the words against the subreddit's rules and your own">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={checking}
                    onClick={async () => {
                      setChecking(true)
                      try {
                        const words = text.trim()
                        const result = await onCheckRules(find.id, words)
                        if (result) {
                          setCheck({ text: words, result })
                          setCheckOpen(false)
                        }
                      } finally {
                        setChecking(false)
                      }
                    }}
                  >
                    {checking ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                    Check
                  </Button>
                </Hint>
              ) : null}
              <Hint label={postingState ? paceLineText(postingState) : PICK_AN_ACCOUNT}>
                <span
                  className="ml-auto min-w-0 truncate px-1 text-xs text-muted-foreground"
                >
                  {handle ? `as u/${handle}` : postingState ? "as an account not signed in" : "No account picked"}
                </span>
              </Hint>
              {/* Why Post is off lives in the button's own tooltip rather than a
                  line under the box, which Tyler asked to be removed on 6 Oct
                  2026. An empty box never turns it off: pressing it then says
                  what is missing. */}
              <DisabledReason reason={postReason ?? "Posting now."} disabled={postOff}>
                <Button
                  type="button"
                  size="sm"
                  disabled={postOff}
                  onClick={async () => {
                    const words = text.trim()
                    if (!words) {
                      showErrorToast("Write the comment first, or press Write with AI.")
                      return
                    }
                    setPosting(true)
                    try {
                      const answer = await onPost({ findId: find.id, text: words, draftId: fromDraft })
                      if (!answer) return
                      if (answer.undoUntil) {
                        setUndo({
                          findId: find.id,
                          text: words,
                          draftId: fromDraft,
                          until: new Date(answer.undoUntil).getTime(),
                        })
                        setClock(Date.now())
                      }
                      setText("")
                      setFromDraft(null)
                      setCheck(null)
                      setBeforeRewrite(null)
                    } finally {
                      setPosting(false)
                    }
                  }}
                >
                  {posting ? <Loader2Icon className="animate-spin" /> : null}
                  {postWords}
                </Button>
              </DisabledReason>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The post's own words.
 *
 * Reddit's words are markdown, and the one piece of it worth drawing here is
 * the quote: a line beginning with `>` is somebody else being quoted, and this
 * post is almost entirely quotes. Left raw it reads as a wall of stray angle
 * brackets. Nothing else is interpreted, because a quote is the only mark that
 * changes what a paragraph means rather than how it looks.
 */
function PostBody({ body }: { body: string }) {
  const blocks = React.useMemo(() => splitIntoBlocks(body), [body])

  return (
    <div className="grid gap-3 text-sm leading-relaxed">
      {blocks.map((block, index) =>
        block.quoted ? (
          <blockquote
            key={index}
            className="border-l-2 pl-3 whitespace-pre-wrap text-muted-foreground"
          >
            {block.text}
          </blockquote>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {block.text}
          </p>
        )
      )}
    </div>
  )
}

/**
 * The page a link post points to, in place of the words the post does not
 * have. Its own box and its own label, because these are somebody else's
 * words and must never read as the poster's.
 */
function LinkedPage({ page }: { page: LinkPage }) {
  return (
    <div className="grid gap-1.5 rounded-lg border p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        The page this post links to,{" "}
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {linkHostText(page.url)}
        </a>
      </p>
      {page.title ? <p className="font-medium">{page.title}</p> : null}
      {page.text ? <p className="leading-relaxed">{page.text}</p> : null}
    </div>
  )
}

function Replies({
  find,
  working,
  onRead,
}: {
  find: FindDetail
  working: boolean
  onRead: (findId: string) => Promise<void>
}) {
  // Three separate answers, and they must never be confused: the replies have
  // not been read, they were read and there were none, or here they are.
  if (!find.thread && find.threadReading) {
    // Queued by a press or by the read after a search. A second press would
    // only wait behind the first, so there is no button until it lands.
    return (
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the replies…
      </p>
    )
  }

  if (!find.thread) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">Replies not read yet</p>
        <Button
          type="button"
          variant="outline"
          disabled={working}
          onClick={() => onRead(find.id)}
        >
          {working ? <Loader2Icon className="animate-spin" /> : null}
          Read the replies
        </Button>
      </div>
    )
  }

  if (!find.thread.replies.length) {
    // Reddit counts replies from deleted accounts and this does not, so the
    // two numbers can disagree. Saying "nobody has replied" under a post that
    // says 2 replies would read as a bug, so each case says what it means.
    return (
      <p className="border-t pt-4 text-sm text-muted-foreground">
        {find.commentCount > 0
          ? `Reddit counts ${find.commentCount} ${
              find.commentCount === 1 ? "reply" : "replies"
            } here, and none of them could be read. They are from deleted accounts.`
          : "Nobody has replied to this post. Your comment would be the first."}
      </p>
    )
  }

  return (
    <div className="grid gap-2 border-t pt-4">
      <p className="text-xs font-medium text-muted-foreground">Top replies</p>
      {find.thread.replies.map((reply, index) => (
        <div
          key={`${reply.author}-${index}`}
          className="grid gap-1 rounded-lg bg-muted/50 p-3"
        >
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{reply.author ? `u/${reply.author}` : "someone"}</span>
            <span className="inline-flex items-center gap-0.5">
              <ArrowUpIcon className="size-3" />
              {reply.score}
            </span>
          </p>
          <p className="text-sm whitespace-pre-wrap">{reply.text}</p>
        </div>
      ))}
    </div>
  )
}
