import * as React from "react"
import { Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { AnswerPanel, PostsAs, type DraftView, type FindDetail } from "@/components/social/reddit/answer-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  cancelComment,
  checkRules,
  getDraftErrorMessage,
  getPostErrorMessage,
  rewriteWords,
  sendComment,
  writeDrafts,
} from "@/lib/api/social/reddit/drafts"
import {
  getHelpErrorMessage,
  loadHelpPage,
  readHelpPostsFor,
  type HelpPage,
} from "@/lib/api/social/reddit/help-posts"
import {
  getRedditErrorMessage,
  loadFind,
  readSubredditRules,
  readThread,
  setFindsStatus,
} from "@/lib/api/social/reddit/keywords"
import { postButtonWords, postedDateText, postingBlockedReason, waitingCommentText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"

/** How often to ask again while a read is on its way. */
const POLL_MS = 3_000

/**
 * Helpful comments that build karma: the newest posts in the subreddits one
 * account has joined, answered with help and never a word about what you
 * make. Tyler, 12 Oct 2026: it lives on the Reddit accounts dashboard.
 *
 * The list, then a post in the same comment box the Projects dashboard has,
 * with every rule Post has. Drafts here are told to help and to mention
 * nothing. Nothing posts without the button being pressed.
 */
export function HelpPostsDialog({
  accountId,
  onClose,
}: {
  /** The account whose posts are open, or null when the window is shut. */
  accountId: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={accountId !== null} onOpenChange={(open) => (open ? null : onClose())}>
      {accountId ? <HelpWindow key={accountId} accountId={accountId} onClose={onClose} /> : null}
    </Dialog>
  )
}

function HelpWindow({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [page, setPage] = React.useState<HelpPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<{ findId: string; find: FindDetail; drafts: DraftView[] } | null>(null)
  const [asking, setAsking] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadHelpPage(accountId).then(
        (next) => {
          setPage(next)
          setError(null)
        },
        (failure: unknown) => setError(getHelpErrorMessage(failure))
      ),
    [accountId]
  )

  const refreshDetail = React.useCallback(
    (findId: string): Promise<void> =>
      loadFind(findId).then(
        (found) => {
          if (!found) {
            setDetail(null)
            setSelected(null)
            return
          }
          setDetail({
            findId,
            find: {
              id: found.id,
              url: found.url,
              subreddit: found.subreddit,
              title: found.title,
              author: found.author,
              score: found.score,
              commentCount: found.commentCount,
              postedAt: found.postedAt,
              body: found.body,
              linkUrl: found.linkUrl,
              linkPage: found.linkPage,
              linkReadAt: found.linkReadAt,
              linkError: found.linkError,
              thread: found.thread,
              threadReadAt: found.threadReadAt,
              threadReading: found.threadReading,
              rules: found.rules,
              pastAnswers: found.pastAnswers,
              removals: found.removals,
              helpAccountId: found.helpAccountId,
            },
            drafts: found.drafts,
          })
        },
        (failure: unknown) => showErrorToast(getRedditErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!selected) return
    void refreshDetail(selected)
  }, [refreshDetail, selected])

  // A read of the subreddits, a post's replies or a subreddit's rules takes
  // the reader browser a minute, so the window asks again until it lands.
  const busy =
    Boolean(page?.reading) ||
    Boolean(detail && detail.findId === selected && (detail.find.threadReading || detail.find.rules.reading))
  React.useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => {
      void refresh()
      if (selected) void refreshDetail(selected)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [busy, refresh, refreshDetail, selected])

  const account = page?.account ?? null
  const name = account?.handle ? `u/${account.handle}` : "this account"
  const open = selected && detail?.findId === selected ? detail : null

  if (selected) {
    return (
      <DialogContent variant="admin">
        <DialogTitle className="sr-only">A post for {name} to help with</DialogTitle>
        <DialogDescription className="sr-only">
          Drafts here only help, and never mention what you make.
        </DialogDescription>
        {/* The comment box needs a height of its own to keep Post in reach
            while the post scrolls, as it has in its column on the Projects
            dashboard. */}
        <div className="flex h-[min(80vh,720px)] min-h-0 flex-col">
          <AnswerPanel
            find={open?.find ?? null}
            handle={account?.handle || null}
            postWords={postButtonWords(account)}
            drafts={open?.drafts ?? []}
            loading={!open}
            working={busy}
            disabledReason={account ? postingBlockedReason(account, open?.find ?? null) : null}
            postingState={account?.posting ?? null}
            voiceName={account?.voice?.name ?? null}
            accountPicker={<PostsAs handle={account?.handle || null} postingState={account?.posting ?? null} />}
            onBack={() => {
              setSelected(null)
              void refresh()
            }}
            onRead={async (findId) => {
              try {
                await readThread(findId)
                await refreshDetail(findId)
              } catch (failure) {
                showErrorToast(getRedditErrorMessage(failure))
              }
            }}
            onReadRules={async (findId) => {
              try {
                await readSubredditRules(findId)
                await refreshDetail(findId)
              } catch (failure) {
                showErrorToast(getRedditErrorMessage(failure))
              }
            }}
            onDraft={async (findId) => {
              try {
                const written = await writeDrafts({ findId, accountId })
                setDetail((current) =>
                  current
                    ? { ...current, drafts: [...written.map((draft) => ({ ...draft, status: "draft" })), ...current.drafts] }
                    : current
                )
              } catch (failure) {
                showErrorToast(getDraftErrorMessage(failure))
              }
            }}
            onCheckRules={async (findId, text) => {
              try {
                return await checkRules({ findId, accountId, text })
              } catch (failure) {
                showErrorToast(getDraftErrorMessage(failure))
                return null
              }
            }}
            onRewrite={async (findId, text, how) => {
              try {
                return await rewriteWords({ findId, accountId, text, how })
              } catch (failure) {
                showErrorToast(getDraftErrorMessage(failure))
                return null
              }
            }}
            onPost={async (input) => {
              try {
                const { runAfter, undoUntil } = await sendComment({ ...input, accountId })
                if (runAfter) toast.success(waitingCommentText(new Date(runAfter), account?.handle || null))
                await refresh()
                return { undoUntil }
              } catch (failure) {
                showErrorToast(getPostErrorMessage(failure))
                await refresh()
                return null
              }
            }}
            onUndo={async (findId) => {
              try {
                await cancelComment(findId)
                toast.success("Taken back. Nothing was sent.")
                await refresh()
                return true
              } catch (failure) {
                showErrorToast(getPostErrorMessage(failure))
                return false
              }
            }}
            onCancelWaiting={async (findId) => {
              try {
                await cancelComment(findId)
                toast.success("Cancelled. Nothing was sent.")
              } catch (failure) {
                showErrorToast(getPostErrorMessage(failure))
              }
              await refresh()
            }}
            onSkip={async (findId) => {
              try {
                setSelected(null)
                await setFindsStatus([findId], "skipped")
                await refresh()
              } catch (failure) {
                showErrorToast(getRedditErrorMessage(failure))
              }
            }}
          />
        </div>
      </DialogContent>
    )
  }

  return (
    <DialogContent variant="admin">
      <DialogHeader>
        <DialogTitle>Help-only posts for {name}</DialogTitle>
        <DialogDescription>
          New posts in the subreddits {name} has joined. A comment here only helps and never
          mentions what you make, so the account reads as a person and earns karma.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Subreddits it has joined</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {page
                  ? page.account.joinedSubreddits.length
                    ? `${page.account.joinedSubreddits.slice(0, 6).map((sub) => `r/${sub}`).join(", ")}${page.account.joinedSubreddits.length > 6 ? " and more" : ""}. ${page.answered} answered so far.`
                    : "None yet. Its daily warm-up joins some."
                  : "Reading the account"}
              </p>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={asking || Boolean(page?.reading)}
                onClick={async () => {
                  setAsking(true)
                  try {
                    await readHelpPostsFor(accountId)
                    toast.success("Reading the newest posts. They show here as they land.")
                    await refresh()
                  } catch (failure) {
                    showErrorToast(getHelpErrorMessage(failure))
                  } finally {
                    setAsking(false)
                  }
                }}
              >
                {asking || page?.reading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                {page?.reading ? "Reading" : "Read new posts"}
              </Button>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Posts to help with</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {error ? (
                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">The posts could not be read. {error}</p>
                  <Button type="button" variant="outline" className="justify-self-start" onClick={() => void refresh()}>
                    <RefreshCwIcon />
                    Try again
                  </Button>
                </div>
              ) : !page ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Reading the posts
                </p>
              ) : !page.posts.length ? (
                <p className="text-sm text-muted-foreground">
                  {page.reading
                    ? "Reading the newest posts. Each subreddit takes the reader browser a minute."
                    : "No posts waiting. Press Read new posts."}
                </p>
              ) : (
                <div className="grid gap-2">
                  {page.posts.map((post) => (
                    <div key={post.id} className="flex min-w-0 items-start gap-2 rounded-lg border p-3">
                      <button
                        type="button"
                        onClick={() => setSelected(post.id)}
                        className="grid min-w-0 flex-1 gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Hint label={post.title}>
                          <span className="block truncate text-sm font-medium">{post.title}</span>
                        </Hint>
                        <span className="block text-xs text-muted-foreground">
                          r/{post.subreddit} · {postedDateText(post.postedAt ? new Date(post.postedAt) : null)} ·{" "}
                          {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}
                          {post.fit === "strong" ? " · Strong fit" : ""}
                        </span>
                      </button>
                      <Hint label="Skip this post">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Skip ${post.title}`}
                          onClick={async () => {
                            try {
                              await setFindsStatus([post.id], "skipped")
                              await refresh()
                            } catch (failure) {
                              showErrorToast(getRedditErrorMessage(failure))
                            }
                          }}
                        >
                          <XIcon />
                        </Button>
                      </Hint>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
