import * as React from "react"
import { ExternalLinkIcon, FileTextIcon, Loader2Icon, PlusIcon, QuoteIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  changeOnX,
  checkXNow,
  getXErrorMessage,
  saveXPostDraft,
  writeXPostWords,
  type XModuleView,
  type XPostsTab,
  type XPostView,
} from "@/lib/api/social/x"
import { X_POST_STATUS_WORDS } from "@/lib/social/x/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import type { XAccount } from "./x-account-picker"
import { XListError, XPanelFrame } from "./x-panel-frame"
import { XPostComposer } from "./x-post-composer"
import { XIncomingAnswer } from "./x-replies"
import { counted, figure, numbersLine, postsAtText, upWords, xAccountName } from "./x-words"

type Quote = XPostsTab["quotes"][number]

const NONE = "none"

const rowClass = (selected: boolean) =>
  cn(
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
  )

/** A post's state in a few words, for its row. */
function stateWords(post: XPostView): string {
  if (post.deletedAt) return "Deleted"
  if (post.status === "waiting" && post.scheduledFor) return postsAtText(post.scheduledFor)
  if (post.status === "failed" && post.piecesUp > 0) return `Stopped after post ${post.piecesUp} of ${post.pieces.length}`
  return X_POST_STATUS_WORDS[post.status]
}

/** "41 votes", once a poll's votes have been read. */
function votesWords(post: XPostView): string | null {
  if (!post.poll) return null
  if (!post.poll.votes) return "Poll"
  const total = post.poll.votes.reduce((sum, votes) => sum + votes, 0)
  return `Poll, ${total} ${total === 1 ? "vote" : "votes"}`
}

/**
 * The Posts tab's list (parts 29 to 36): the project's own posts and threads
 * with their state, the hour one waits for, a thread that stopped halfway,
 * their numbers and poll votes; then the quote posts; then the accounts on
 * the accounts' public X lists. New post makes a draft and opens it on the
 * right.
 */
export function XPostsList({
  projectId,
  accounts,
  data,
  loading,
  error,
  selectedId,
  onSelect,
  onOpenQuote,
  onRetry,
  onChanged,
}: {
  projectId: string
  accounts: XAccount[]
  data: XPostsTab | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (postRowId: string) => void
  onOpenQuote: (quote: Quote) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [checking, setChecking] = React.useState(false)
  const posts = data?.posts ?? []
  const quotes = data?.quotes ?? []
  const list = data?.list ?? []
  const posted = posts.filter((post) => post.status === "posted" && !post.deletedAt).map((post) => post.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {posted.length ? (
          <Hint label="Read the numbers of the 50 newest posted ones again now">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkXNow({ postIds: posted.slice(0, 50) })
                  toast.success(queued ? "Reading the numbers again." : "Every post is being read already.")
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
        <span className="flex-1" />
        <NewPostButton
          projectId={projectId}
          accounts={accounts}
          sources={data?.sources ?? []}
          onCreated={async (id) => {
            await onChanged()
            onSelect(id)
          }}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <XListError what="posts" error={error} onRetry={onRetry} />
        ) : loading && !data ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the posts
          </p>
        ) : (
          <div className="grid gap-4 py-1.5">
            {posts.length ? (
              <div>
                {posts.map((post) => (
                  <button key={post.id} type="button" onClick={() => onSelect(post.id)} aria-current={post.id === selectedId || undefined} className={rowClass(post.id === selectedId)}>
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">{post.pieces[0]?.text || "Nothing written yet"}</span>
                      <span className={cn("truncate text-xs", post.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        {[
                          stateWords(post),
                          post.account ? `@${post.account.handle}` : "No account picked",
                          post.pieces.length > 1 ? `Thread of ${post.pieces.length}` : null,
                          votesWords(post),
                          post.postedAt ? postedDateText(new Date(post.postedAt)) : null,
                          post.toAnswer ? `${post.toAnswer} to answer` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {post.status === "posted" && !post.deletedAt ? (
                      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">{numbersLine(post)}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 pt-3 text-sm text-muted-foreground">No posts of your own yet. Press New post to write one, or a thread of several.</p>
            )}

            <section aria-label="Quote posts" className="grid gap-1 border-t pt-3">
              <p className="px-3 text-xs font-medium text-muted-foreground">Quote posts</p>
              {quotes.length ? (
                quotes.map((quote) => (
                  <button key={quote.id} type="button" onClick={() => onOpenQuote(quote)} className={rowClass(false)}>
                    <QuoteIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">{quote.text}</span>
                      <span className={cn("truncate text-xs", quote.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        {[
                          `@${quote.handle} quoting @${quote.targetHandle}`,
                          upWords(quote),
                          quote.postedAt ? postedDateText(new Date(quote.postedAt)) : null,
                          quote.status === "posted" && !quote.deletedAt ? (quote.views === null && quote.likes === null ? "Views and likes not read yet" : `${counted(quote.views, "view", "views")} · ${counted(quote.likes, "like", "likes")}`) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 text-sm text-muted-foreground">No quote posts yet. Pick Quote instead of Reply on a post to make one.</p>
              )}
            </section>

            <section aria-label="On the accounts' public X lists" className="grid gap-2 border-t px-3 pt-3">
              <p className="text-xs font-medium text-muted-foreground">On the accounts&apos; public X lists</p>
              {list.length ? (
                list.map((item) => (
                  <div key={item.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {item.name ? `${item.name} @${item.handle}` : `@${item.handle}`}
                    </a>
                    {item.status === "failed" ? (
                      <Hint label={item.lastError || "It did not go on the list."}>
                        <span className="shrink-0 text-xs text-destructive">Did not go on</span>
                      </Hint>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.status === "added" ? `On @${item.account.handle}'s list` : "On its way"}</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nobody yet. Put a good poster on a list from their post, with the list button.</p>
              )}
            </section>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * New post as a dropdown, the way every dashboard's New button works
 * (Ui-standards): what it is about first, then who posts it and what it
 * starts from, and Create post at the bottom right. With something to go on,
 * the AI writes the first post straight away; the draft opens on the right
 * either way.
 */
function NewPostButton({
  projectId,
  accounts,
  sources,
  onCreated,
}: {
  projectId: string
  accounts: XAccount[]
  sources: XPostsTab["sources"]
  onCreated: (id: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [about, setAbout] = React.useState("")
  const [accountId, setAccountId] = React.useState(NONE)
  const [source, setSource] = React.useState(NONE)
  const [busy, setBusy] = React.useState(false)

  async function create(event?: React.FormEvent) {
    event?.preventDefault()
    setBusy(true)
    try {
      const account = accountId === NONE ? null : accountId
      const from = source === NONE ? "" : source
      const draft = { accountId: account, poll: null, communityId: "", source: from, scheduledFor: null }
      const { id } = await saveXPostDraft({ projectId, postRowId: null, post: { ...draft, pieces: [{ text: "", pictureUrl: "" }] } })
      if (about.trim() || from) {
        try {
          const written = await writeXPostWords({ projectId, accountId: account, about: about.trim(), pieces: 1, source: from, communityId: "", poll: false })
          if (written.pieces.length) {
            await saveXPostDraft({ projectId, postRowId: id, post: { ...draft, pieces: written.pieces.map((text) => ({ text, pictureUrl: "" })) } })
          }
        } catch (failure) {
          showErrorToast(`The draft is made, but the AI did not write it. ${getXErrorMessage(failure)}`)
        }
      }
      setOpen(false)
      setAbout("")
      setAccountId(NONE)
      setSource(NONE)
      await onCreated(id)
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button">
          <PlusIcon className="size-4" />
          New post
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <form className="grid gap-4" onSubmit={create}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="x-new-about" hint="A line or two. Leave it empty to write the post yourself.">
              What it is about
            </FieldLabel>
            <Input id="x-new-about" autoFocus value={about} placeholder="Why small teams drop their task tool" onChange={(event) => setAbout(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="x-new-account">Post as</FieldLabel>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="x-new-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Pick later</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {xAccountName(account.handle)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="x-new-source" hint="A published Medium article becomes a thread ending with its link. A Reddit comment that did well gives the AI its words.">
              Start from
            </FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="x-new-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nothing, start from scratch</SelectItem>
                {sources.map((item) => (
                  <SelectItem key={item.source} value={item.source}>
                    {item.label.slice(0, 60)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create post
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** The right column on the Posts tab: a draft to write, or a post that went out. */
export function XPostPanel({
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
  post: XPostView | null
  accounts: XAccount[]
  communities: XModuleView["communities"]
  sources: XPostsTab["sources"]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  if (!post) {
    return (
      <XPanelFrame title="A post of your own" onBack={onBack}>
        <p className="p-4 text-sm text-muted-foreground">Click a post to write it or to see how it is doing, or press New post.</p>
      </XPanelFrame>
    )
  }
  // Keyed by the post, so words typed on one never carry over to another.
  return post.status === "posted" ? (
    <PostedPost key={post.id} projectId={projectId} post={post} accounts={accounts} onBack={onBack} onChanged={onChanged} />
  ) : (
    <XPostComposer
      key={post.id}
      projectId={projectId}
      post={post}
      accounts={accounts}
      communities={communities}
      sources={sources}
      onBack={onBack}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

/** A post or thread that is on X: its words and pictures, numbers, poll votes, the replies under it, Check now and Delete from X. */
function PostedPost({
  projectId,
  post,
  accounts,
  onBack,
  onChanged,
}: {
  projectId: string
  post: XPostView
  accounts: XAccount[]
  onBack?: () => void
  onChanged: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const account = accounts.find((item) => item.id === post.account?.id) ?? null

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

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {post.deletedAt ? "Deleted" : "Posted"}
        {post.account ? ` · @${post.account.handle}` : ""}
      </span>
      {!post.deletedAt ? (
        <>
          <Hint label="Read its numbers, poll votes and the replies under it again now">
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  const { queued } = await checkXNow({ postIds: [post.id] })
                  toast.success(queued ? "Checking it now." : "It is being checked already.")
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check now
            </Button>
          </Hint>
          <Hint label="Delete it from X">
            <Button type="button" size="icon" variant="ghost" aria-label="Delete from X" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
            </Button>
          </Hint>
        </>
      ) : null}
      {post.url ? (
        <Hint label="Open it on X">
          <Button type="button" size="icon" variant="ghost" asChild>
            <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open it on X">
              <ExternalLinkIcon />
            </a>
          </Button>
        </Hint>
      ) : null}
    </>
  )

  const votes = post.poll?.votes ?? null
  const totalVotes = votes ? votes.reduce((sum, value) => sum + value, 0) : 0

  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {post.pieces.map((piece, index) => (
            <div key={index} className="grid gap-2">
              {post.pieces.length > 1 ? <p className="text-xs text-muted-foreground">Post {index + 1} of {post.pieces.length}</p> : null}
              <p className="text-sm whitespace-pre-wrap">{piece.text}</p>
              {piece.pictureUrl ? <img src={piece.pictureUrl} alt={`The picture on post ${index + 1}`} className="aspect-video w-full rounded-lg border object-cover" /> : null}
            </div>
          ))}
          {post.poll ? (
            <div className="grid gap-1 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Poll{votes ? `, ${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}` : ", votes not read yet"}
              </p>
              {post.poll.choices.map((choice, index) => (
                <p key={index} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{choice}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{votes ? (votes[index] ?? 0) : "?"}</span>
                </p>
              ))}
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {(
              [
                ["Views", post.views],
                ["Likes", post.likes],
                ["Replies", post.replyCount],
                ["Reposts", post.reposts],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{figure(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {upWords(post)}
            {post.checkedAt ? `. Checked ${postedDateText(new Date(post.checkedAt)).toLowerCase()}.` : ". Its numbers are read with the daily check."}
          </p>

          {post.incoming === null ? (
            <p className="border-t pt-4 text-sm text-muted-foreground">The replies under it are read on the next check.</p>
          ) : post.incoming.length ? (
            <div className="grid gap-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Replies under it</p>
              {post.incoming.map((item) =>
                post.account ? (
                  <XIncomingAnswer
                    key={item.id}
                    projectId={projectId}
                    accountId={post.account.id}
                    handle={post.account.handle}
                    paid={account?.paid ?? false}
                    under={{ postRowId: post.id }}
                    mine={post.pieces.map((piece) => piece.text).join("\n\n").slice(0, 2_000)}
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
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post from X?"
        description={
          post.pieces.length > 1
            ? "The account's browser deletes every post of the thread on X, looking before and after. Promo keeps its record and its numbers."
            : "The account's browser deletes it on X, looking before and after. Promo keeps its record and its numbers."
        }
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            await changeOnX({ postRowId: post.id, action: "delete" })
            setConfirmDelete(false)
            toast.success("On its way to being deleted on X.")
          })
        }
      />
    </XPanelFrame>
  )
}
