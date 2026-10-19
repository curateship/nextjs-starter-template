import * as React from "react"
import {
  CheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilmIcon,
  Loader2Icon,
  MessageSquareQuoteIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PlanCard } from "@/components/note-posts/plan-card"
import { PostWords } from "@/components/note-posts/post-words"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  InspectorCard,
  InspectorCollapseAllButton,
  InspectorCollapseAllProvider,
  useInspectorCollapseAll,
} from "@/components/shared/inspector-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  analyseNotePost,
  bringInPostArticle,
  dropPostFolderSuggestion,
  getPostErrorMessage,
  loadPostDetail,
  moveNotePost,
  retryNotePost,
  retryNotePostVideo,
  savePostHighlights,
  savePostPlan,
} from "@/lib/api/note/posts"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { postPriceLine } from "@/lib/note/posts/analyse-price"
import { addHighlight, removeHighlight } from "@/lib/note/posts/highlights"
import {
  analyseRefusal,
  distinctName,
  isPostAnalysing,
  isPostMoving,
  planProgress,
  postStatusWords,
  POST_SAYS,
  type Highlight,
  type NotePostCard,
  type NotePostDetail,
  type PictureView,
  type PlanStep,
} from "@/lib/note/posts/posts"
import { formatTimecode } from "@/lib/note/videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The right panel: the picked post as it was saved (its words with
 * highlights, pictures, video, the post it quotes and the rest of its thread),
 * the article button, the Analyse button with its price above it, the AI's
 * folder suggestion and similar-post warning, and the Summary, Action plan,
 * Tags and Transcript in grey cards that fold shut.
 */

const POLL_MS = 3_000

type Busy = "analyse" | "article" | "folder" | "video"
const NOT_ANALYSED = "Press Analyse to summarise this post and plan from it."

export function PostPanel({
  pickedId,
  pickedCard,
  similarCount,
  onCardChanged,
  onDelete,
  onClose,
  onOpen,
  onTag,
  onMoved,
}: {
  pickedId: string | null
  pickedCard: NotePostCard | null
  similarCount: number
  onCardChanged: (card: NotePostCard) => void
  onDelete: (card: NotePostCard) => void
  onClose: () => void
  /** Opens another post: the similar one, or one a merged plan came from. */
  onOpen: (id: string) => void
  onTag: (tag: string) => void
  /** The AI's folder suggestion was kept; the list and the folder counts follow. */
  onMoved: (card: NotePostCard) => void
}) {
  if (!pickedId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<MessageSquareQuoteIcon />} title="Post" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Pick a post</p>
      </>
    )
  }
  // Keyed on the post, so picking another starts from nothing.
  return (
    <PostBody
      key={pickedId}
      postId={pickedId}
      pickedCard={pickedCard}
      similarCount={similarCount}
      onCardChanged={onCardChanged}
      onDelete={onDelete}
      onClose={onClose}
      onOpen={onOpen}
      onTag={onTag}
      onMoved={onMoved}
    />
  )
}

function PostBody({
  postId,
  pickedCard,
  similarCount,
  onCardChanged,
  onDelete,
  onClose,
  onOpen,
  onTag,
  onMoved,
}: {
  postId: string
  pickedCard: NotePostCard | null
  similarCount: number
  onCardChanged: (card: NotePostCard) => void
  onDelete: (card: NotePostCard) => void
  onClose: () => void
  onOpen: (id: string) => void
  onTag: (tag: string) => void
  /** The AI's folder suggestion was kept; the list and the folder counts follow. */
  onMoved: (card: NotePostCard) => void
}) {
  const wide = useWideScreen()
  const [detail, setDetail] = React.useState<NotePostDetail | null>(null)
  const [failure, setFailure] = React.useState<unknown>(null)
  const [busy, setBusy] = React.useState<Busy | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const playerRef = React.useRef<HTMLVideoElement | null>(null)
  const collapse = useInspectorCollapseAll()

  const tellCard = React.useRef(onCardChanged)
  React.useEffect(() => {
    tellCard.current = onCardChanged
  })

  /**
   * What the server last kept of the plan and the highlights, which a refused
   * save goes back to, and what is on screen now, which each queued save sends.
   */
  const savedPlan = React.useRef<PlanStep[]>([])
  const latestPlan = React.useRef<PlanStep[]>([])
  const savedHighlights = React.useRef<Highlight[]>([])
  const latestHighlights = React.useRef<Highlight[]>([])

  const show = React.useCallback((fresh: NotePostDetail) => {
    savedPlan.current = latestPlan.current = fresh.actionPlan
    savedHighlights.current = latestHighlights.current = fresh.highlights
    setDetail(fresh)
    setFailure(null)
    tellCard.current(fresh)
  }, [])

  // Try again or Analyse pressed in the middle panel moves the post on without
  // this panel asking. A card whose status is not the one shown here means it
  // is time to look again.
  const cardStatus = pickedCard ? `${pickedCard.status}:${pickedCard.videoStatus}` : undefined
  const [seenCardStatus, setSeenCardStatus] = React.useState(cardStatus)
  if (cardStatus !== seenCardStatus) {
    setSeenCardStatus(cardStatus)
    if (detail && cardStatus && cardStatus !== `${detail.status}:${detail.videoStatus}`) {
      setReloads((count) => count + 1)
    }
  }

  React.useEffect(() => {
    let live = true
    loadPostDetail(postId)
      .then((fresh) => {
        if (live) show(fresh)
      })
      .catch((error) => {
        if (live) setFailure(error)
      })
    return () => {
      live = false
    }
  }, [show, postId, reloads])

  // While the post is moving, ask again three seconds after each answer.
  const [missed, setMissed] = React.useState(0)
  React.useEffect(() => {
    if (!detail || !isPostMoving(detail)) return
    let live = true
    const timer = setTimeout(() => {
      loadPostDetail(postId)
        .then((fresh) => {
          if (live) show(fresh)
        })
        .catch((error) => {
          if (!live) return
          if (getPostErrorMessage(error) === POST_SAYS.postNotFound) {
            setDetail(null)
            setFailure(error)
          } else {
            setMissed((count) => count + 1)
          }
        })
    }, POLL_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [show, postId, detail, missed])

  async function run(kind: Busy, action: () => Promise<NotePostDetail>, done?: string) {
    if (busy) return
    setBusy(kind)
    try {
      show(await action())
      if (done) toast.success(done)
    } catch (error) {
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  // The plan and the highlights save one change at a time, each sending what
  // is on screen when its turn comes, so a slow answer never lands after a
  // newer one. A refused save puts back what the server last kept, unless a
  // newer change is still on its way, whose own save then decides.
  const planQueue = React.useRef<Promise<void>>(Promise.resolve())
  function changePlan(steps: PlanStep[]) {
    latestPlan.current = steps
    setDetail((current) => (current ? { ...current, actionPlan: steps, progress: planProgress(steps) } : current))
    planQueue.current = planQueue.current.then(async () => {
      const sending = latestPlan.current
      if (sending === savedPlan.current) return
      try {
        const card = await savePostPlan(postId, sending)
        savedPlan.current = sending
        tellCard.current(card)
      } catch (error) {
        showErrorToast(getPostErrorMessage(error))
        if (latestPlan.current !== sending) return
        const back = (latestPlan.current = savedPlan.current)
        setDetail((current) => (current ? { ...current, actionPlan: back, progress: planProgress(back) } : current))
      }
    })
  }

  const highlightQueue = React.useRef<Promise<void>>(Promise.resolve())
  function changeHighlights(next: Highlight[]) {
    latestHighlights.current = next
    setDetail((current) => (current ? { ...current, highlights: next } : current))
    highlightQueue.current = highlightQueue.current.then(async () => {
      const sending = latestHighlights.current
      if (sending === savedHighlights.current) return
      try {
        tellCard.current(await savePostHighlights(postId, sending))
        savedHighlights.current = sending
      } catch (error) {
        showErrorToast(getPostErrorMessage(error))
        if (latestHighlights.current !== sending) return
        const back = (latestHighlights.current = savedHighlights.current)
        setDetail((current) => (current ? { ...current, highlights: back } : current))
      }
    })
  }

  function seek(ms: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
  }

  const back = wide ? undefined : { label: "Back to the posts", onClick: onClose }
  const title = detail?.title ?? pickedCard?.title ?? "Post"

  if (!detail) {
    return (
      <>
        <DashboardCardTitleHeader icon={<MessageSquareQuoteIcon />} back={back} title={title} />
        {failure ? (
          <ErrorRow
            message={getPostErrorMessage(failure)}
            onRetry={() => {
              setFailure(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : (
          <LoadingRow label="Loading the post" />
        )}
      </>
    )
  }

  const merged = detail.kind === "merged"
  const analysed = detail.analysedAt !== null
  const analysing = isPostAnalysing(detail.status)
  const highlightProps = {
    highlights: detail.highlights,
    onHighlight: (highlight: Highlight) => changeHighlights(addHighlight(latestHighlights.current, highlight)),
    onRemove: (highlight: Highlight) => changeHighlights(removeHighlight(latestHighlights.current, highlight)),
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<MessageSquareQuoteIcon />}
        back={back}
        title={
          <span className="truncate">
            {merged ? detail.title : (distinctName(detail.authorName, detail.authorHandle) ?? detail.title)}
          </span>
        }
        action={
          <InspectorCollapseAllButton
            nextOpen={collapse.nextOpen}
            onPress={() => collapse.setAll(collapse.nextOpen)}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {merged ? (
            <Sources detail={detail} onOpen={onOpen} />
          ) : (
            <>
              <AuthorLine detail={detail} />
              {detail.hasText ? (
                <div className="grid gap-3 border-b p-3">
                  <PostWords text={detail.text} part="post" {...highlightProps} />
                  <Pictures pictures={detail.pictures} />
                  <Video detail={detail} playerRef={playerRef} busy={busy === "video"} onRetry={() => void run("video", () => retryNotePostVideo(detail.id))} />
                  {detail.quoted ? (
                    <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Quoting{" "}
                        {[
                          distinctName(detail.quoted.authorName, detail.quoted.authorHandle),
                          detail.quoted.authorHandle ? `@${detail.quoted.authorHandle}` : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        {detail.quoted.postedAt ? ` · ${formatDate(detail.quoted.postedAt)}` : ""}
                      </p>
                      <PostWords text={detail.quoted.text} part="quoted" {...highlightProps} />
                      <Pictures pictures={detail.quoted.pictures} />
                    </div>
                  ) : null}
                  {detail.thread.length ? (
                    <p className="text-xs text-muted-foreground">
                      This post opens a thread. The other {detail.thread.length}{" "}
                      {plural(detail.thread.length, "post is", "posts are")} in the Thread card below.
                    </p>
                  ) : null}
                  {detail.threadStatus === "cut" ? (
                    <p className="text-xs text-muted-foreground">Couldn't read the rest of the thread</p>
                  ) : null}
                  {detail.likesWhenSaved !== null ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {detail.likesWhenSaved.toLocaleString("en-US")} {plural(detail.likesWhenSaved, "like")}
                      {detail.repostsWhenSaved !== null
                        ? ` and ${detail.repostsWhenSaved.toLocaleString("en-US")} ${plural(detail.repostsWhenSaved, "repost")}`
                        : ""}{" "}
                      when saved
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          <div className="grid gap-3 p-3">
            {merged ? null : (
              <>
                <ArticleBox
                  detail={detail}
                  busy={busy === "article"}
                  onBringIn={() =>
                    void run(
                      "article",
                      () => bringInPostArticle(detail.id),
                      analysed ? "Article added. Analyse again to use it." : "Article added. Analyse reads it."
                    )
                  }
                />
                <AnalyseBox
                  detail={detail}
                  similarCount={similarCount}
                  busy={busy === "analyse"}
                  onAnalyse={() => void run("analyse", () => analyseNotePost(detail.id))}
                  onRetry={() => void run("analyse", () => retryNotePost(detail.id))}
                />
              </>
            )}
            {merged && detail.status === "failed" ? (
              <div className="grid gap-2">
                <p role="alert" className="text-sm text-destructive">
                  {postStatusWords(detail)}
                </p>
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("analyse", () => retryNotePost(detail.id))}>
                  Try again
                </Button>
              </div>
            ) : null}
            {merged && analysing ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {postStatusWords(detail)}
              </p>
            ) : null}

            {detail.suggestedFolder ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 pl-3 text-sm">
                <SparklesIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">Move to {detail.suggestedFolder.name}?</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    const folder = detail.suggestedFolder
                    if (!folder) return
                    void run(
                      "folder",
                      async () => {
                        onMoved(await moveNotePost(detail.id, folder.id))
                        return loadPostDetail(detail.id)
                      },
                      `Moved to “${folder.name}”.`
                    )
                  }}
                >
                  <CheckIcon />
                  Move
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void run("folder", () => dropPostFolderSuggestion(detail.id))}
                >
                  <XIcon />
                  No thanks
                </Button>
              </div>
            ) : null}

            {detail.similar ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 pl-3 text-sm">
                <span className="min-w-0 flex-1">
                  You saved something like this on {formatDate(detail.similar.savedAt)}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpen(detail.similar!.id)}>
                  Open {detail.similar.title}
                </Button>
              </div>
            ) : null}

            <InspectorCollapseAllProvider signal={collapse.signal}>
              {detail.thread.length ? (
                <InspectorCard storageId="note-post-thread" title={`Thread · ${detail.thread.length} more ${plural(detail.thread.length, "post")}`}>
                  <div className="grid gap-4">
                    {detail.thread.map((post, index) => (
                      <div key={post.postId} className="grid gap-2">
                        <PostWords text={post.text} part={`thread-${index}`} {...highlightProps} />
                        <Pictures pictures={post.pictures} />
                      </div>
                    ))}
                  </div>
                </InspectorCard>
              ) : null}
              {merged ? null : (
                <InspectorCard storageId="note-post-summary" title="Summary">
                  {analysed && detail.summary.length ? (
                    <ul className="grid list-disc gap-1.5 pl-5 text-sm">
                      {detail.summary.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyCard analysing={analysing} analysed={analysed} />
                  )}
                </InspectorCard>
              )}

              <InspectorCard storageId="note-post-plan" title="Action plan">
                {analysed || detail.actionPlan.length ? (
                  <PlanCard
                    postId={detail.id}
                    steps={detail.actionPlan}
                    locked={analysing}
                    copyable={{
                      title: merged
                        ? detail.title
                        : [distinctName(detail.authorName, detail.authorHandle), detail.title].filter(Boolean).join(" "),
                      url: detail.url,
                      summary: detail.summary,
                      actionPlan: detail.actionPlan,
                    }}
                    onChange={changePlan}
                  />
                ) : (
                  <EmptyCard analysing={analysing} analysed={analysed} />
                )}
              </InspectorCard>

              {merged ? null : (
                <InspectorCard storageId="note-post-tags" title="Tags">
                  {detail.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {detail.tags.map((tag) => (
                        <button key={tag} type="button" className={cn("rounded-md", focusRing)} onClick={() => onTag(tag)}>
                          <Badge variant="secondary" className="font-normal hover:bg-secondary/70">
                            {tag}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyCard analysing={analysing} analysed={analysed} />
                  )}
                </InspectorCard>
              )}

              {detail.transcript.length ? (
                <InspectorCard storageId="note-post-transcript" title="What the video says">
                  <div className="-mx-1 grid">
                    {detail.transcript.map((line, index) => (
                      <button
                        key={`${line.startMs}-${index}`}
                        type="button"
                        disabled={!detail.videoUrl}
                        onClick={() => seek(line.startMs)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-sm",
                          detail.videoUrl && "hover:bg-muted",
                          focusRing
                        )}
                      >
                        <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatTimecode(line.startMs)}
                        </span>
                        <span className="min-w-0 flex-1">{line.text}</span>
                      </button>
                    ))}
                  </div>
                </InspectorCard>
              ) : null}
            </InspectorCollapseAllProvider>
          </div>

          <div className="flex flex-wrap justify-between gap-2 border-t p-3">
            <Button type="button" variant="destructive" onClick={() => onDelete(detail)}>
              <Trash2Icon />
              {merged ? "Delete plan" : "Delete post"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

function EmptyCard({ analysing, analysed }: { analysing: boolean; analysed: boolean }) {
  const words = analysing
    ? "Being analysed now. This fills in by itself when it is done."
    : analysed
      ? "Nothing came back for this one."
      : NOT_ANALYSED
  return <p className="text-sm text-muted-foreground">{words}</p>
}

/** Who wrote it, when, and the way out to X. */
function AuthorLine({ detail }: { detail: NotePostDetail }) {
  const [broken, setBroken] = React.useState(false)
  return (
    <div className="flex items-center gap-2.5 border-b px-3 py-2">
      {detail.authorPictureUrl && !broken ? (
        <img
          src={detail.authorPictureUrl}
          alt=""
          className="size-9 shrink-0 rounded-full bg-muted object-cover"
          onError={() => setBroken(true)}
        />
      ) : null}
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">
          {distinctName(detail.authorName, detail.authorHandle) ?? detail.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {detail.authorHandle ? `@${detail.authorHandle}` : postStatusWords(detail)}
          {detail.postedAt ? ` · ${formatDate(detail.postedAt)}` : ""}
        </span>
      </span>
      {detail.url ? (
        <a
          href={detail.url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn("flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground", focusRing)}
        >
          Open on X
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

function Pictures({ pictures }: { pictures: PictureView[] }) {
  if (!pictures.length) return null
  return (
    <div className={cn("grid gap-1.5", pictures.length > 1 && "grid-cols-2")}>
      {pictures.map((picture) => (
        <a
          key={picture.url}
          href={picture.url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn("block overflow-hidden rounded-md border bg-muted", focusRing)}
          aria-label="Open the picture full size"
        >
          <img
            src={picture.url}
            alt=""
            loading="lazy"
            className={cn("w-full object-cover", pictures.length > 1 ? "aspect-square" : "max-h-96 object-contain")}
          />
        </a>
      ))}
    </div>
  )
}

function Video({
  detail,
  playerRef,
  busy,
  onRetry,
}: {
  detail: NotePostDetail
  playerRef: React.RefObject<HTMLVideoElement | null>
  busy: boolean
  onRetry: () => void
}) {
  if (detail.videoStatus === "none") return null
  if (detail.videoStatus === "saved" && detail.videoUrl) {
    return (
      <video
        ref={(element) => {
          playerRef.current = element
        }}
        src={detail.videoUrl}
        poster={detail.videoCoverUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="aspect-video max-h-[50vh] w-full rounded-md border bg-black object-contain"
      />
    )
  }
  const words =
    detail.videoStatus === "too_long"
      ? "The video is longer than 30 minutes, so only the words are kept."
      : detail.videoStatus === "failed"
        ? `The video couldn't be saved: ${detail.videoError ?? "something went wrong"}`
        : "Saving the video…"
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
      {detail.videoStatus === "waiting" || detail.videoStatus === "downloading" ? (
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <FilmIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={cn("min-w-0 flex-1", detail.videoStatus === "failed" && "text-destructive")}>{words}</span>
      {detail.videoStatus === "failed" ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Try the video again
        </Button>
      ) : null}
      {detail.videoSeconds ? (
        <span className="text-xs text-muted-foreground tabular-nums">{formatTimecode(detail.videoSeconds * 1000)}</span>
      ) : null}
    </div>
  )
}

/** "Bring in the article", only when pressed (Tyler, 19 Oct 2026). */
function ArticleBox({
  detail,
  busy,
  onBringIn,
}: {
  detail: NotePostDetail
  busy: boolean
  onBringIn: () => void
}) {
  if (!detail.articleLink) return null
  let host = detail.articleLink
  try {
    host = new URL(detail.articleLink).hostname.replace(/^www\./, "")
  } catch {
    // Shown as it was saved.
  }
  if (detail.hasArticleText) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          Article added:{" "}
          <a href={detail.articleLink} target="_blank" rel="noreferrer noopener" className={cn("underline", focusRing)}>
            {detail.articleTitle ?? host}
          </a>
        </span>
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">Links to {host}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => (isPostAnalysing(detail.status) ? showErrorToast(POST_SAYS.stillAnalysing) : onBringIn())}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />}
        Bring in the article
      </Button>
    </div>
  )
}

/** The one Analyse button and the price above it. */
function AnalyseBox({
  detail,
  similarCount,
  busy,
  onAnalyse,
  onRetry,
}: {
  detail: NotePostDetail
  similarCount: number
  busy: boolean
  onAnalyse: () => void
  onRetry: () => void
}) {
  if (detail.status === "waiting" || detail.status === "reading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the post on X…
      </p>
    )
  }
  if (detail.status === "failed") {
    return (
      <div className="grid gap-2">
        <p role="alert" className="text-sm text-destructive">
          {postStatusWords(detail)}
        </p>
        {detail.hasText ? (
          <p className="text-xs text-muted-foreground">{postPriceLine(detail.analyse, similarCount, false)}</p>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Try again
        </Button>
      </div>
    )
  }
  if (isPostAnalysing(detail.status)) {
    return (
      <Button type="button" disabled>
        <Loader2Icon className="animate-spin" />
        {postStatusWords(detail)}
      </Button>
    )
  }
  const again = detail.status === "ready"
  const refusal = analyseRefusal(detail)
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        {refusal ?? postPriceLine(detail.analyse, similarCount, again)}
      </p>
      <Button
        type="button"
        disabled={busy}
        onClick={() => (refusal ? showErrorToast(refusal) : onAnalyse())}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {again ? "Analyse again" : "Analyse"}
      </Button>
    </div>
  )
}

/** A merged plan's posts, as they are now. A deleted one is left out. */
function Sources({ detail, onOpen }: { detail: NotePostDetail; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-2 border-b p-3">
      <p className="text-xs text-muted-foreground">
        {detail.sources.length
          ? `Made from ${detail.sources.length === 1 ? "this post" : "these posts"}`
          : "The posts this plan was made from have been deleted"}
        {detail.analysedAt ? ` · ${formatDate(detail.analysedAt)}` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {detail.sources.map((source) => (
          <Button key={source.id} type="button" variant="outline" size="xs" onClick={() => onOpen(source.id)}>
            {source.title}
          </Button>
        ))}
      </div>
    </div>
  )
}
