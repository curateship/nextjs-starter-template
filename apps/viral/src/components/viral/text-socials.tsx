import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CircleAlertIcon, CopyIcon, ExternalLinkIcon, Loader2Icon, MessagesSquareIcon, PlusIcon, RefreshCwIcon, XIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SocialIcon } from "@/components/viral/social-icon"
import type { TextSocialsState } from "@/components/viral/use-text-socials"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { askPromoForThread, loadSocialPostFn, refreshPromoReadFn } from "@/lib/api/viral/viral-promo"
import { addSocialWatchFn, readSocialWatchFn, removeSocialWatchFn } from "@/lib/api/viral/viral-socials"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { formatCount } from "@/lib/viral/creators"
import type { SocialPost } from "@/lib/viral/promo-link"
import {
  SOCIAL_NAMES,
  WATCH_KIND_WORDS,
  WATCH_VALUE_MAX,
  watchKinds,
  watchLabel,
  type SocialWatch,
  type TextSocial,
  type WatchKind,
} from "@/lib/viral/socials"
import { figureName, postAuthor, postHeadline } from "@/lib/viral/text-posts"
import { formatShortDay } from "@/lib/viral/viral-view"

const CARD_TITLES: Record<TextSocial, string> = {
  x: "X searches and accounts",
  reddit: "Reddit searches and subreddits",
  linkedin: "LinkedIn searches and people",
}

/** Where Promo's address and key are filled in. */
function PromoSettingsLink() {
  return (
    <Link to="/admin/settings/$tab" params={{ tab: "promo-connection" }} className="underline">
      Settings → Promo connection
    </Link>
  )
}

/**
 * The left panel's card for one of X, Reddit and LinkedIn: what the project
 * keeps reading there through Promo, and how each one's newest read went.
 * Picking a row is not a filter; the middle shows everything the social
 * found. Its arrow reads it again now, and its cross takes it off with the
 * posts only it brought.
 */
export function SocialWatchesCard({
  projectId,
  social,
  data,
  sample,
  onChanged,
}: {
  projectId: string
  social: TextSocial
  data: TextSocialsState
  sample: boolean
  onChanged: () => void
}) {
  const kinds = watchKinds(social)
  const [fieldOpen, setFieldOpen] = React.useState(false)
  const [kind, setKind] = React.useState<WatchKind>(kinds[0])
  const [value, setValue] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const watches = data.state === "ready" ? data.watches.filter((watch) => watch.network === social) : []
  const connected = data.state === "ready" ? data.connected : true
  const name = SOCIAL_NAMES[social]

  async function add() {
    if (!value.trim()) {
      showErrorToast(`Type the ${WATCH_KIND_WORDS[kind].one} first, then press Enter or +.`)
      return
    }
    setBusy("add")
    try {
      const answer = await addSocialWatchFn({ projectId, network: social, kind, value })
      setValue("")
      onChanged()
      const label = watchLabel(answer.watch.kind, answer.watch.value)
      if (answer.readError) showErrorToast(`${label} is on ${name} here, but Promo couldn't read it: ${answer.readError}`)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function readAgain(watch: SocialWatch) {
    setBusy(watch.id)
    try {
      await readSocialWatchFn(watch.id)
      onChanged()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function remove(watch: SocialWatch) {
    setBusy(watch.id)
    try {
      await removeSocialWatchFn(watch.id)
      onChanged()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelCard storageId={`viral-project-watches-${social}`} title={CARD_TITLES[social]} meta={String(watches.length)}>
      {!connected && !sample ? (
        <p className="text-sm text-muted-foreground">
          Promo reads {name} for Viral, and it isn't connected yet. Fill in <PromoSettingsLink />.
        </p>
      ) : null}
      {data.state === "failed" ? <ErrorRow message={data.error} onRetry={onChanged} /> : null}
      {watches.length ? (
        <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {watches.map((watch) => (
            <WatchRow
              key={watch.id}
              watch={watch}
              busy={busy === watch.id}
              sample={sample}
              onReadAgain={() => void readAgain(watch)}
              onRemove={() => void remove(watch)}
            />
          ))}
        </ul>
      ) : data.state === "ready" ? (
        <p className="text-sm text-muted-foreground">
          Nothing read on {name} yet. Add a {kinds.map((one) => WATCH_KIND_WORDS[one].one).join(", ").replace(/, ([^,]*)$/, " or $1")}.
        </p>
      ) : null}
      {fieldOpen ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <Select value={kind} onValueChange={(next) => setKind(next as WatchKind)}>
            <SelectTrigger aria-label="What to read">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((one) => (
                <SelectItem key={one} value={one}>
                  {WATCH_KIND_WORDS[one].add}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              aria-label={WATCH_KIND_WORDS[kind].add}
              placeholder={WATCH_KIND_WORDS[kind].placeholder}
              autoFocus
              value={value}
              maxLength={WATCH_VALUE_MAX}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                event.preventDefault()
                setValue("")
                setFieldOpen(false)
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`${WATCH_KIND_WORDS[kind].add} and read it`}
                  disabled={busy === "add"}
                >
                  {busy === "add" ? <Loader2Icon className="animate-spin" /> : <PlusIcon className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Adds it, and Promo reads it with its own {name} account</TooltipContent>
            </Tooltip>
          </div>
        </form>
      ) : null}
      {sample ? null : (
        <Button type="button" variant="outline" className="w-full" aria-expanded={fieldOpen} onClick={() => setFieldOpen(true)}>
          <PlusIcon />
          Add to {name}
        </Button>
      )}
    </PanelCard>
  )
}

function WatchRow({
  watch,
  busy,
  sample,
  onReadAgain,
  onRemove,
}: {
  watch: SocialWatch
  busy: boolean
  sample: boolean
  onReadAgain: () => void
  onRemove: () => void
}) {
  const waiting = watch.status === "waiting"
  const line =
    watch.status === "waiting"
      ? "Promo is reading it"
      : watch.status === "failed"
        ? "Failed"
        : watch.status === "done"
          ? `${watch.found} found · ${formatShortDay(watch.readAt)}`
          : sample
            ? "Sample, never read"
            : "Not read yet"
  return (
    <li className="flex items-center gap-1 rounded-md pl-2">
      <div className="grid min-w-0 flex-1 py-1">
        <span className="truncate text-sm font-medium">{watchLabel(watch.kind, watch.value)}</span>
        <span
          className={cn(
            "flex items-center gap-1 truncate text-xs text-muted-foreground",
            watch.status === "failed" && "text-destructive"
          )}
        >
          {waiting ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {watch.status === "failed" ? <CircleAlertIcon className="size-3" /> : null}
          <span className="truncate">
            {WATCH_KIND_WORDS[watch.kind].one} · {line}
          </span>
        </span>
        {watch.status === "failed" && watch.error ? (
          <span className="text-xs whitespace-normal text-destructive">{watch.error}</span>
        ) : null}
      </div>
      {sample ? null : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Read ${watchLabel(watch.kind, watch.value)} again`}
                disabled={busy || waiting}
                onClick={onReadAgain}
              >
                <RefreshCwIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Promo reads it again now</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${watchLabel(watch.kind, watch.value)}`}
                disabled={busy}
                onClick={onRemove}
              >
                <XIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove it and the posts only it found</TooltipContent>
          </Tooltip>
        </>
      )}
    </li>
  )
}

/** One post's numbers in a line, in its social's words, leaving out the ones it never shows. */
function figuresLine(post: SocialPost): string {
  return (["views", "likes", "replies", "reposts"] as const)
    .flatMap((figure) => {
      const name = figureName(post.network, figure)
      const count = post[figure]
      return name && count !== null ? [`${formatCount(count)} ${name.toLowerCase()}`] : []
    })
    .join(" · ")
}

/**
 * The middle panel while X, Reddit or LinkedIn is picked: the posts its reads
 * found, already searched, filtered and sorted by the screen, under the
 * toolbar of search, Filter and Views the screen hands over.
 */
export function TextPostsMiddle({
  social,
  data,
  posts,
  filtered,
  toolbar,
  sample,
  openId,
  onPick,
  onRetry,
}: {
  social: TextSocial
  data: TextSocialsState
  /** This social's posts the search and filters leave, in the order picked. */
  posts: SocialPost[]
  /** Whether a search or filter is set, so an empty list says that instead. */
  filtered: boolean
  toolbar: React.ReactNode
  sample: boolean
  openId: string | null
  onPick: (post: SocialPost) => void
  onRetry: () => void
}) {
  const name = SOCIAL_NAMES[social]
  const watching = data.state === "ready" && data.watches.some((watch) => watch.network === social)
  return (
    <>
      <DashboardCardTitleHeader
        className="group/title @container"
        icon={<SocialIcon social={social} />}
        title={`${name} posts`}
        meta={data.state === "ready" ? `${posts.length} ${plural(posts.length, "post")}` : undefined}
        action={toolbar}
      />
      <ScrollArea className="min-h-0 flex-1">
        {data.state === "loading" ? (
          <LoadingRow label={`Reading the ${name} posts`} />
        ) : data.state === "failed" ? (
          <div className="p-3">
            <ErrorRow message={data.error} onRetry={onRetry} />
          </div>
        ) : posts.length ? (
          <ul aria-label={`${name} posts`} className="grid grid-cols-[minmax(0,1fr)]">
            {posts.map((post) => (
              <li key={post.id} className={cn("border-b", post.id === openId ? "bg-muted" : "hover:bg-muted/50")}>
                <button
                  type="button"
                  aria-current={post.id === openId ? "true" : undefined}
                  onClick={() => onPick(post)}
                  className={cn("grid w-full min-w-0 gap-1 px-3 py-3 text-left", focusRing)}
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {[postAuthor(post), post.community ? `r/${post.community}` : "", formatShortDay(post.postedAt ?? post.firstSeenAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className={cn("line-clamp-2 text-sm", post.title && "font-medium")}>{postHeadline(post)}</span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">{figuresLine(post)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : filtered && data.posts.some((post) => post.network === social) ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">No post matches this search or filter.</p>
        ) : !data.connected && !sample ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            Promo reads {name} for Viral. Fill in <PromoSettingsLink />, then add a search on the left.
          </p>
        ) : (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {watching
              ? `Nothing from ${name} yet. Promo's posts arrive here as each read finishes.`
              : `Add a search or an account to ${name} on the left; Promo reads it and its posts arrive here.`}
          </p>
        )}
      </ScrollArea>
    </>
  )
}

type ThreadRead = { state: "idle" } | { state: "reading"; readId: string } | { state: "failed"; error: string }

/** How often a thread Promo is still reading is asked about. */
const THREAD_POLL_MS = 20_000

/**
 * The right panel while a post is open: the post as a thread, its numbers,
 * then its top replies in order. Replies not read yet are asked of Promo the
 * first time the post opens, and arrive when Promo finishes.
 */
export function PostThreadPanel({
  post,
  sample,
  onThreadRead,
}: {
  post: SocialPost | null
  sample: boolean
  /** Promo finished reading the thread, so the list's copy is stale. */
  onThreadRead: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [fresh, setFresh] = React.useState<SocialPost | null>(null)
  const [read, setRead] = React.useState<ThreadRead>({ state: "idle" })
  const shown = fresh && post && fresh.id === post.id ? fresh : post
  const postId = post?.id ?? null
  const wantsThread = Boolean(post && !post.repliesReadAt && !sample)

  // The first open of a post asks Promo for its replies; an external answer,
  // so its state is set from the promise. Keyed on the post's id, so a reload
  // of the list never asks again.
  React.useEffect(() => {
    if (!postId || !wantsThread) return
    let live = true
    askPromoForThread(postId)
      .then((asked) => {
        if (!live) return
        setRead(asked.status === "failed" ? { state: "failed", error: asked.error } : { state: "reading", readId: asked.id })
      })
      .catch((error) => {
        if (live) setRead({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [postId, wantsThread])

  const readingId = read.state === "reading" ? read.readId : null
  React.useEffect(() => {
    if (!postId || !readingId) return
    const timer = window.setInterval(() => {
      void refreshPromoReadFn(readingId)
        .then(async (answer) => {
          if (answer.status === "waiting") return
          if (answer.status === "failed") {
            setRead({ state: "failed", error: answer.error })
            return
          }
          setFresh(await loadSocialPostFn(postId))
          setRead({ state: "idle" })
          onThreadRead()
        })
        .catch(() => undefined)
    }, THREAD_POLL_MS)
    return () => window.clearInterval(timer)
  }, [onThreadRead, postId, readingId])

  if (!shown) {
    return (
      <>
        <DashboardCardTitleHeader icon={<MessagesSquareIcon />} title="Post" />
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Click a post to read its thread here.</p>
      </>
    )
  }

  const current = shown
  const name = SOCIAL_NAMES[current.network]

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      showErrorToast("It could not be copied. Select it and copy it instead.")
    }
  }

  const figures = (["views", "likes", "replies", "reposts"] as const).flatMap((figure) => {
    const label = figureName(current.network, figure)
    return label ? [{ label, value: current[figure] }] : []
  })

  return (
    <>
      <DashboardCardTitleHeader
        icon={<SocialIcon social={current.network} />}
        title={
          <span className="grid leading-tight">
            <span className="truncate">{postAuthor(current)}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {[current.community ? `r/${current.community}` : name, formatShortDay(current.postedAt ?? current.firstSeenAt)].join(" · ")}
            </span>
          </span>
        }
        action={
          <FoldingMenu label="More for this post" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuAction
              icon={<ExternalLinkIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                window.open(current.url, "_blank", "noopener,noreferrer")
              }}
            >
              Open on {name}
            </MenuAction>
            <MenuAction
              icon={<CopyIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                void copy(current.url)
              }}
            >
              Copy link
            </MenuAction>
            <MenuAction
              icon={<CopyIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                void copy([current.title, current.text].filter(Boolean).join("\n\n"))
              }}
            >
              Copy the text
            </MenuAction>
          </FoldingMenu>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div data-side-panel-body="" className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          <PanelCard storageId="viral-post-words" title="The post">
            <div className="grid gap-2 text-sm break-words">
              {current.title ? <p className="font-medium">{current.title}</p> : null}
              <p className="whitespace-pre-wrap">{current.text || "This post has no words, only a picture or video."}</p>
              {current.link ? (
                <a href={current.link} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground underline">
                  {current.link}
                </a>
              ) : null}
            </div>
          </PanelCard>
          <PanelCard storageId="viral-post-numbers" title="Numbers">
            <dl className="grid gap-2 text-sm">
              {figures.map((figure) => (
                <Figure key={figure.label} label={figure.label} value={figure.value === null ? "-" : figure.value.toLocaleString("en-US")} />
              ))}
              <Figure
                label="Followers"
                value={current.authorFollowers === null ? "-" : current.authorFollowers.toLocaleString("en-US")}
              />
            </dl>
          </PanelCard>
          <PanelCard storageId="viral-post-replies" title={current.network === "x" ? "Top replies" : "Top comments"}>
            {current.topReplies.length ? (
              <ol className="grid gap-3 text-sm">
                {current.topReplies.map((reply, index) => (
                  <li key={`${reply.author}-${index}`} className="grid gap-1 break-words">
                    <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{reply.author}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatCount(reply.likes)} {figureName(current.network, "likes")?.toLowerCase()}
                      </span>
                    </span>
                    <p className="whitespace-pre-wrap">{reply.text}</p>
                  </li>
                ))}
              </ol>
            ) : read.state === "reading" || (wantsThread && read.state === "idle") ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Promo is reading the thread. The replies arrive here.
              </p>
            ) : read.state === "failed" ? (
              <ErrorRow message={read.error} />
            ) : (
              <p className="text-sm text-muted-foreground">No replies yet.</p>
            )}
          </PanelCard>
        </div>
      </ScrollArea>
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}
