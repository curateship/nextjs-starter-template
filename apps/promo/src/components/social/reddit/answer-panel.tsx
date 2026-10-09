import * as React from "react"
import {
  ArrowUpIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MessageSquareIcon,
  SparklesIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { MAX_COMMENT_CHARS, type FindThread } from "@/lib/social/options"
import {
  postedDateText,
  splitIntoBlocks,
  type BlockedReason,
} from "@/lib/social/wording"
import { cn } from "@/lib/utils"

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
  thread: FindThread | null
  threadReadAt: Date | null
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
 * Nothing posts without the button below being pressed. There is no schedule,
 * no queue of approved comments going out later, and no automatic retry.
 */
export function AnswerPanel({
  find,
  handle,
  drafts,
  loading,
  working,
  disabledReason,
  voiceName,
  onRead,
  onDraft,
  onPost,
  onSkip,
  onBack,
}: {
  /** Null when no post is selected. */
  find: FindDetail | null
  /** The Reddit account it posts as, or null when none is set up. */
  handle: string | null
  drafts: DraftView[]
  loading: boolean
  /** A browser job is waiting or running. */
  working: boolean
  /** Why posting is impossible right now, in words, or null. */
  disabledReason: BlockedReason | null
  /** The voice drafts are written in, or null when the account has none. */
  voiceName: string | null
  onRead: (findId: string) => Promise<void>
  onDraft: (findId: string) => Promise<void>
  onPost: (input: {
    findId: string
    text: string
    draftId: string | null
  }) => Promise<void>
  onSkip: (findId: string) => Promise<void>
  /**
   * Closes the post and goes back to the list, leaving the keyword and the
   * tab where they were. Passed only by the narrow layout, where the post
   * covers the list. On the wide one the list is beside it and there is
   * nowhere to go back to.
   */
  onBack?: () => void
}) {
  const [text, setText] = React.useState("")
  const [fromDraft, setFromDraft] = React.useState<string | null>(null)
  const [drafting, setDrafting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [skipping, setSkipping] = React.useState(false)

  // A different post is a different comment. Worked out during this render
  // rather than in an effect, so the box is never briefly showing the words
  // meant for the post before it.
  const [lastFindId, setLastFindId] = React.useState(find?.id ?? null)
  if ((find?.id ?? null) !== lastFindId) {
    setLastFindId(find?.id ?? null)
    setText("")
    setFromDraft(null)
  }

  const over = text.length > MAX_COMMENT_CHARS
  // Every reason Post can be off, in the order a person fixes them.
  const postReason =
    disabledReason?.text ??
    (over
      ? `That is ${text.length} characters, and a comment stops at ${MAX_COMMENT_CHARS}.`
      : !text.trim()
        ? "Write the comment first, or pick a draft."
        : null)
  const postOff = posting || Boolean(postReason)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The shell's title header rather than `CardTop`, which draws the
          same row but has no way to turn its icon into a back arrow. */}
      <DashboardCardTitleHeader
        icon={<MessageSquareIcon className="size-4" />}
        back={onBack ? { label: "Back to the list", onClick: onBack } : undefined}
        title="The post and your comment"
        meta={
          find ? <span className="shrink-0 font-normal">r/{find.subreddit}</span> : null
        }
        action={
          find ? (
            <div className="flex items-center gap-2">
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
              <Button type="button" size="icon" variant="outline" asChild>
                <a
                  href={find.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this post on Reddit"
                >
                  <ExternalLinkIcon />
                </a>
              </Button>
            </div>
          ) : null
        }
      />

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
                <h3 className="text-lg leading-snug font-semibold">
                  {find.title}
                </h3>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {find.author ? <span>u/{find.author}</span> : null}
                  <span>{postedDateText(find.postedAt).toLowerCase()}</span>
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  This post has no words of its own. It is a link or a picture.
                </p>
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
        <div className="grid gap-3 border-t bg-muted/50 p-4">
          {drafts.length ? (
            <div className="grid grid-cols-2 gap-2">
              {drafts.slice(0, 2).map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  title={draft.text}
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
              ))}
            </div>
          ) : null}

          <Textarea
            id="promo-comment-text"
            aria-label="What to post"
            // Three lines tall before anything is typed, then it grows. The
            // shared Textarea sizes itself to its content, so `rows` alone
            // does nothing; this is three lines of text plus its padding and
            // border. Tyler asked for three rows on 6 Oct 2026.
            className="min-h-[calc(3lh+1rem+2px)] bg-background"
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
            placeholder={
              drafts.length
                ? "Pick a draft above, or write it yourself."
                : "Write it yourself, or press Write with AI."
            }
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              {/* Said beside the button, because a plain draft that never
                  mentions what you make is otherwise a puzzle. */}
              {voiceName === null ? (
                <span className="text-xs text-muted-foreground">
                  No voice picked, so drafts are plain
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={drafting}
                title={voiceName ? `Drafts in the voice ${voiceName}` : undefined}
                onClick={async () => {
                  setDrafting(true)
                  try {
                    await onDraft(find.id)
                  } finally {
                    setDrafting(false)
                  }
                }}
              >
                {drafting ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                Write with AI
              </Button>
              {/* Why Post is off lives in the button's own tooltip rather than a
                  line under the box, which Tyler asked to be removed on 6 Oct
                  2026. */}
              <DisabledReason reason={postReason ?? "Posting now."} disabled={postOff}>
              <Button
                type="button"
                disabled={postOff}
                title={handle ? `Posts as u/${handle}` : undefined}
                onClick={async () => {
                  setPosting(true)
                  try {
                    await onPost({
                      findId: find.id,
                      text: text.trim(),
                      draftId: fromDraft,
                    })
                    setText("")
                    setFromDraft(null)
                  } finally {
                    setPosting(false)
                  }
                }}
              >
                {posting ? <Loader2Icon className="animate-spin" /> : null}
                Post to Reddit
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
  if (!find.thread) {
    return (
      <div className="grid gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          The replies have not been read yet.
        </p>
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
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
