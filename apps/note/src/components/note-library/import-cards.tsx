import * as React from "react"
import { ExternalLinkIcon, FilmIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react"

import { PlanCard } from "@/components/note-library/plan-card"
import { PostWords } from "@/components/note-library/post-words"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { analysePriceLine } from "@/lib/note/library/analyse-price"
import { addHighlight, removeHighlight, type Highlight } from "@/lib/note/library/highlights"
import {
  distinctName,
  formatTimecode,
  isAnalysing,
  isImporting,
  noteTitle,
  SOURCE_SITE,
  type NoteDetail,
  type PictureView,
  type PlanStep,
} from "@/lib/note/library/notes"
import { cn } from "@/lib/utils"

/**
 * The cards an imported note adds under its own text: the Video card (or the
 * Post card for X) with the player, the facts and the Analyse button, then
 * the Summary, Action plan and Quotes the AI writes (Tyler, 20 Oct 2026:
 * "Cards on the right"). A note's own text stays its own; Analyse never
 * writes into it.
 */

const NOT_ANALYSED = "Not analysed yet. Analyse writes this."

/** "YouTube · jawed · 0:19 · Apr 23, 2005", the line under the video in Tyler's picture. */
function factsLine(detail: NoteDetail) {
  return [
    SOURCE_SITE[detail.source],
    detail.source === "x" ? (detail.authorHandle ? `@${detail.authorHandle}` : null) : detail.authorName,
    detail.durationSeconds ? formatTimecode(detail.durationSeconds * 1000) : null,
    detail.postedAt ? formatDate(detail.postedAt) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function SourceCard({
  detail,
  busy,
  readOnly,
  playerRef,
  onAnalyse,
  onRetry,
  onRetryVideo,
  onRemove,
  onHighlights,
}: {
  detail: NoteDetail
  busy: string | null
  readOnly: boolean
  playerRef: React.RefObject<HTMLMediaElement | null>
  onAnalyse: () => void
  onRetry: () => void
  onRetryVideo: () => void
  onRemove: () => void
  onHighlights: (highlights: Highlight[]) => void
}) {
  const site = SOURCE_SITE[detail.source]
  const x = detail.source === "x"
  // Each change is worked out from the newest list, so two quick highlights both stay.
  const latest = React.useRef(detail.highlights)
  React.useEffect(() => {
    latest.current = detail.highlights
  }, [detail.highlights])
  const highlightProps = readOnly
    ? { highlights: detail.highlights }
    : {
        highlights: detail.highlights,
        onHighlight: (highlight: Highlight) => onHighlights(addHighlight(latest.current, highlight)),
        onRemove: (highlight: Highlight) => onHighlights(removeHighlight(latest.current, highlight)),
      }

  return (
    <PanelCard
      storageId={x ? "note-library-post" : "note-library-video"}
      title={x ? "Post" : "Video"}
      // The icons and the arrow show only while the card is pointed at
      // (Tyler, 20 Oct 2026), and always on a screen that cannot hover.
      quiet
      action={
        <span className="flex items-center">
          {detail.sourceUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" asChild>
                  <a href={detail.sourceUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open on ${site}`}>
                    <ExternalLinkIcon className="size-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open on {site}</TooltipContent>
            </Tooltip>
          ) : null}
          {readOnly ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={x ? "Remove the post" : "Remove the video"}
                  disabled={busy !== null}
                  onClick={onRemove}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{x ? "Remove the post, keep the note" : "Remove the video, keep the note"}</TooltipContent>
            </Tooltip>
          )}
        </span>
      }
    >
      {x ? (
        detail.postText !== null ? (
          // One column that may shrink, so a long post wraps inside the card.
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <AuthorLine detail={detail} />
            <PostWords text={detail.postText} part="post" {...highlightProps} />
            <Pictures pictures={detail.pictures} />
            <PostVideo detail={detail} playerRef={playerRef} busy={busy === "video"} onRetry={onRetryVideo} />
            {detail.quoted ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md border bg-background p-3">
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
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-l-2 pl-3">
                <p className="text-xs text-muted-foreground">
                  The rest of the thread, {detail.thread.length} more {plural(detail.thread.length, "post")}
                </p>
                {detail.thread.map((post, index) => (
                  <div key={post.postId} className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <PostWords text={post.text} part={`thread-${index}`} {...highlightProps} />
                    <Pictures pictures={post.pictures} />
                  </div>
                ))}
              </div>
            ) : null}
            {detail.threadStatus === "cut" ? (
              <p className="text-xs text-muted-foreground">Couldn't read the rest of the thread.</p>
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
        ) : (
          <Placeholder detail={detail} />
        )
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Player detail={detail} playerRef={playerRef} />
          {detail.importStatus === "saved" ? (
            <div className="grid gap-0.5">
              <p className="text-sm font-medium break-words">{noteTitle(detail.title)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{factsLine(detail)}</p>
            </div>
          ) : null}
        </div>
      )}
      <AnalyseBox detail={detail} busy={busy} onAnalyse={onAnalyse} onRetry={onRetry} />
    </PanelCard>
  )
}

/** Before the file or the words have arrived: where the import has got to, or why it stopped. */
function Placeholder({ detail }: { detail: NoteDetail }) {
  return (
    <div className="grid aspect-video w-full place-items-center rounded-md bg-muted text-center text-sm text-muted-foreground">
      {isImporting(detail.importStatus) ? (
        <span className="flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" />
          {detail.source === "x" ? "Reading the post…" : "Downloading…"}
        </span>
      ) : (
        <FilmIcon className="size-8" aria-hidden />
      )}
    </div>
  )
}

/** The app's own player: the saved file plays from the bucket, sound under a plain fill. */
function Player({ detail, playerRef }: { detail: NoteDetail; playerRef: React.RefObject<HTMLMediaElement | null> }) {
  if (detail.playbackUrl && detail.mediaKind === "audio") {
    return (
      <audio
        ref={(element) => {
          playerRef.current = element
        }}
        src={detail.playbackUrl}
        controls
        preload="metadata"
        className="w-full"
      />
    )
  }
  if (detail.playbackUrl) {
    return (
      <video
        ref={(element) => {
          playerRef.current = element
        }}
        src={detail.playbackUrl}
        poster={detail.coverUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className={cn(
          "w-full rounded-md bg-black object-contain",
          detail.source === "youtube_long" ? "aspect-video" : "max-h-[60vh]"
        )}
      />
    )
  }
  return <Placeholder detail={detail} />
}

/** An X post's own video: playing once saved, else where its download has got to. */
function PostVideo({
  detail,
  playerRef,
  busy,
  onRetry,
}: {
  detail: NoteDetail
  playerRef: React.RefObject<HTMLMediaElement | null>
  busy: boolean
  onRetry: () => void
}) {
  if (detail.videoStatus === "none") return null
  if (detail.videoStatus === "saved" && detail.playbackUrl) return <Player detail={detail} playerRef={playerRef} />
  const words =
    detail.videoStatus === "too_long"
      ? "The video is longer than 30 minutes, so only the words are kept."
      : detail.videoStatus === "failed"
        ? `The video couldn't be saved: ${detail.videoError ?? "something went wrong"}`
        : "Saving the video…"
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3 text-sm">
      {detail.videoStatus === "waiting" || detail.videoStatus === "downloading" ? (
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <FilmIcon className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className={cn("min-w-0 flex-1", detail.videoStatus === "failed" && "text-destructive")}>{words}</span>
      {detail.videoStatus === "failed" ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Try the video again
        </Button>
      ) : null}
    </div>
  )
}

function AuthorLine({ detail }: { detail: NoteDetail }) {
  const name = distinctName(detail.authorName, detail.authorHandle) ?? detail.authorName
  return (
    <p className="text-xs text-muted-foreground">
      {[name, detail.authorHandle ? `@${detail.authorHandle}` : null, detail.postedAt ? formatDate(detail.postedAt) : null]
        .filter(Boolean)
        .join(" · ")}
    </p>
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

/**
 * The Analyse button with its price beside it, as in Tyler's picture. While a
 * job runs it says where it has got to; a failure says why and offers Try again.
 */
function AnalyseBox({
  detail,
  busy,
  onAnalyse,
  onRetry,
}: {
  detail: NoteDetail
  busy: string | null
  onAnalyse: () => void
  onRetry: () => void
}) {
  if (isImporting(detail.importStatus)) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {detail.source === "x" ? "Reading the post…" : "Downloading the video…"}
      </p>
    )
  }
  if (detail.importStatus === "failed") {
    return (
      <div className="grid gap-2">
        <p role="alert" className="text-sm text-destructive">
          Import failed: {detail.importError ?? "something went wrong"}
        </p>
        <div>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onRetry}>
            {busy === "retry" ? <Loader2Icon className="animate-spin" /> : null}
            Try again
          </Button>
        </div>
      </div>
    )
  }
  if (isAnalysing(detail.analyseStatus)) {
    return (
      <div>
        <Button type="button" disabled>
          <Loader2Icon className="animate-spin" />
          {detail.analyseStatus === "queued" ? "Queued" : detail.analyseStatus === "transcribing" ? "Writing down the words…" : "Summarising…"}
        </Button>
      </div>
    )
  }
  const again = detail.analysed
  return (
    <div className="grid gap-2">
      {detail.analyseStatus === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          Analysis failed: {detail.analyseError ?? "something went wrong"}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" disabled={busy !== null} onClick={onAnalyse}>
          {busy === "analyse" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {detail.analyseStatus === "failed" ? "Try again" : again ? "Analyse again" : "Analyse"}
        </Button>
        <span className="text-xs text-muted-foreground">{analysePriceLine(detail.analyse, again)}</span>
      </div>
    </div>
  )
}

/** What an AI card says before there is anything in it, or when nothing came back. */
function EmptyLine({ detail }: { detail: NoteDetail }) {
  const words = isAnalysing(detail.analyseStatus)
    ? "Being analysed now. This fills in by itself when it is done."
    : detail.analysed
      ? detail.source !== "x" && detail.transcript.length === 0
        ? "Nobody speaks in this video, so there is nothing to write down."
        : "Nothing came back for this one."
      : NOT_ANALYSED
  return <p className="text-sm text-muted-foreground">{words}</p>
}

/** The AI's three cards: Summary, Action plan with tick boxes, and Quotes. */
export function AiCards({
  detail,
  playable,
  busy,
  onSeek,
  onPlan,
  onRetryMerge,
}: {
  detail: NoteDetail
  playable: boolean
  busy: boolean
  onSeek: (ms: number) => void
  onPlan: (steps: PlanStep[]) => void
  /** Writes a failed One plan from many again. */
  onRetryMerge: () => void
}) {
  const merged = detail.mergedFrom.length > 0 || (detail.source === "note" && detail.analyseStatus !== null)
  return (
    <>
      {merged ? null : (
        <PanelCard quiet storageId="note-library-summary" title="Summary">
          {detail.summary.length ? (
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">
              {detail.summary.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <EmptyLine detail={detail} />
          )}
        </PanelCard>
      )}
      <PanelCard
        quiet
        storageId="note-library-plan"
        title="Action plan"
        meta={detail.actionPlan.length ? `${detail.actionPlan.filter((step) => step.done).length} of ${detail.actionPlan.length} done` : undefined}
      >
        {detail.actionPlan.length || detail.analysed ? (
          <PlanCard
            noteId={detail.id}
            steps={detail.actionPlan}
            locked={isAnalysing(detail.analyseStatus)}
            copyable={{
              title: noteTitle(detail.title),
              url: detail.sourceUrl,
              summary: detail.summary,
              actionPlan: detail.actionPlan,
            }}
            onChange={onPlan}
          />
        ) : merged && detail.analyseStatus === "failed" ? (
          <div className="grid gap-2">
            <p role="alert" className="text-sm text-destructive">
              Writing the plan failed: {detail.analyseError ?? "something went wrong"}
            </p>
            <div>
              <Button type="button" variant="outline" disabled={busy} onClick={onRetryMerge}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <EmptyLine detail={detail} />
        )}
      </PanelCard>
      {merged ? null : (
        <PanelCard quiet storageId="note-library-quotes" title="Quotes">
          {detail.quotes.length ? (
            <div className="grid gap-2">
              {detail.quotes.map((quote, index) =>
                quote.startMs !== null && playable ? (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onSeek(quote.startMs ?? 0)}
                    className={cn("grid gap-1 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted", focusRing)}
                  >
                    <span>“{quote.text}”</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTimecode(quote.startMs)}</span>
                  </button>
                ) : (
                  <blockquote key={index} className="rounded-md border bg-background px-3 py-2 text-sm">
                    “{quote.text}”
                  </blockquote>
                )
              )}
            </div>
          ) : (
            <EmptyLine detail={detail} />
          )}
        </PanelCard>
      )}
    </>
  )
}
