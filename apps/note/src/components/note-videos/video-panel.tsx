import * as React from "react"
import {
  AudioLinesIcon,
  ExternalLinkIcon,
  FilmIcon,
  Loader2Icon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { SampleBadge } from "@/components/note-videos/sample-badge"
import { SiteLogo } from "@/components/note-videos/site-logo"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  InspectorCard,
  InspectorCollapseAllButton,
  InspectorCollapseAllProvider,
  useInspectorCollapseAll,
} from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  analyseNoteVideo,
  getNoteErrorMessage,
  loadVideoDetail,
  retryNoteVideo,
  saveVideoNote,
  tickPlanStep,
} from "@/lib/api/note/videos"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { analysePriceLine } from "@/lib/note/analyse-price"
import { SAMPLE_VIDEO, SAMPLE_VIDEO_ID } from "@/lib/note/sample-video"
import {
  formatTimecode,
  isAnalysing,
  isMoving,
  NOTE_SAYS,
  NOTE_TEXT_MAX,
  planDone,
  statusWords,
  type NoteVideoCard,
  type NoteVideoDetail,
  type TranscriptLine,
} from "@/lib/note/videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import { siteName } from "@/lib/note/sites"
import { cn } from "@/lib/utils"

/**
 * The right panel: the picked video playing in the app's own player, the
 * Analyse button with its price above it, and what the AI wrote, in grey
 * cards that fold shut: Your note, Summary, Action plan, Key quotes and
 * Transcript. A transcript line or a quote jumps the player to that second,
 * and the line being played is lit and kept in view.
 *
 * Every source plays the same way, from the file the app saved, so the
 * transcript's times always belong to the file on screen.
 */

/** How long after an answer the panel asks again while the video is moving. */
const POLL_MS = 3_000
/** How long after the last keystroke the note saves itself. */
const NOTE_SAVE_DELAY_MS = 700
const NOT_ANALYSED = "Press Analyse to write the words down and plan from them."

export function VideoPanel({
  pickedId,
  pickedCard,
  onCardChanged,
  onDelete,
  onClose,
}: {
  pickedId: string | null
  /** The card that was clicked, so the title shows while the rest loads. */
  pickedCard: NoteVideoCard | null
  /** Something about the video changed; the middle panel's card follows. */
  onCardChanged: (card: NoteVideoCard) => void
  onDelete: (card: NoteVideoCard) => void
  onClose: () => void
}) {
  if (!pickedId) {
    return (
      <>
        <DashboardCardTitleHeader icon={<PlayIcon />} title="Video" />
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Pick a video</p>
      </>
    )
  }
  // Keyed on the video, so picking another starts from nothing and no word
  // of the last video can show under this one's title.
  return (
    <VideoBody
      key={pickedId}
      videoId={pickedId}
      pickedCard={pickedCard}
      onCardChanged={onCardChanged}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}

function VideoBody({
  videoId,
  pickedCard,
  onCardChanged,
  onDelete,
  onClose,
}: {
  videoId: string
  pickedCard: NoteVideoCard | null
  onCardChanged: (card: NoteVideoCard) => void
  onDelete: (card: NoteVideoCard) => void
  onClose: () => void
}) {
  const wide = useWideScreen()
  const sample = videoId === SAMPLE_VIDEO_ID
  const [detail, setDetail] = React.useState<NoteVideoDetail | null>(sample ? SAMPLE_VIDEO : null)
  const [failure, setFailure] = React.useState<unknown>(null)
  const [busy, setBusy] = React.useState(false)
  const [atMs, setAtMs] = React.useState<number | undefined>(undefined)
  const playerRef = React.useRef<HTMLMediaElement | null>(null)
  const collapse = useInspectorCollapseAll()

  const tellCard = React.useRef(onCardChanged)
  React.useEffect(() => {
    tellCard.current = onCardChanged
  })

  /** An answer from the server: on screen here, and on the card in the middle. */
  const show = React.useCallback((fresh: NoteVideoDetail) => {
    setDetail(fresh)
    setFailure(null)
    tellCard.current(fresh)
  }, [])

  const [reloads, setReloads] = React.useState(0)

  // Try again pressed on the card in the middle moves the video on without
  // this panel asking, and a failed video is not asked about by itself. A card
  // whose status is no longer the one shown here means it is time to look.
  const cardStatus = pickedCard?.status
  const [seenCardStatus, setSeenCardStatus] = React.useState(cardStatus)
  if (cardStatus !== seenCardStatus) {
    setSeenCardStatus(cardStatus)
    if (detail && cardStatus && cardStatus !== detail.status) setReloads((count) => count + 1)
  }

  React.useEffect(() => {
    if (sample) return
    let live = true
    loadVideoDetail(videoId)
      .then((fresh) => {
        if (live) show(fresh)
      })
      .catch((error) => {
        if (live) setFailure(error)
      })
    return () => {
      live = false
    }
  }, [sample, show, videoId, reloads])

  // While the video is moving, ask again three seconds after each answer, so
  // two asks are never in the air at once. Every answer, and every missed
  // one, starts the next wait; a video that settles stops it, and so does one
  // that has gone (deleted, or folded into the same video saved earlier).
  const [missed, setMissed] = React.useState(0)
  React.useEffect(() => {
    if (sample || !detail || !isMoving(detail.status)) return
    let live = true
    const timer = setTimeout(() => {
      loadVideoDetail(videoId)
        .then((fresh) => {
          if (live) show(fresh)
        })
        .catch((error) => {
          if (!live) return
          if (getNoteErrorMessage(error) === NOTE_SAYS.videoNotFound) {
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
  }, [sample, show, videoId, detail, missed])

  async function run(action: () => Promise<NoteVideoDetail>) {
    if (busy) return
    setBusy(true)
    try {
      show(await action())
    } catch (error) {
      showErrorToast(getNoteErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function seek(ms: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
  }

  /** A tick, saved at once. The screen moves first and comes back if refused. */
  async function tick(index: number, done: boolean) {
    if (!detail) return
    const setStep = (value: boolean) =>
      setDetail((current) => {
        if (!current) return current
        const plan = current.actionPlan.map((step, at) =>
          at === index ? { ...step, done: value } : step
        )
        return { ...current, actionPlan: plan, done: planDone(plan) }
      })
    setStep(done)
    if (sample) return
    try {
      const card = await tickPlanStep(detail.id, index, done)
      tellCard.current(card)
    } catch (error) {
      // Only this step goes back, so a tick of another step made meanwhile stays.
      setStep(!done)
      showErrorToast(getNoteErrorMessage(error))
    }
  }

  const title = detail?.title ?? pickedCard?.title ?? "Video"
  const back = wide ? undefined : { label: "Back to the videos", onClick: onClose }

  if (!detail) {
    return (
      <>
        <DashboardCardTitleHeader icon={<PlayIcon />} back={back} title={title} />
        {failure ? (
          <ErrorRow
            message={getNoteErrorMessage(failure)}
            onRetry={() => {
              setFailure(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : (
          <LoadingRow label="Loading the video" />
        )}
      </>
    )
  }

  const analysed = detail.analysedAt !== null || detail.transcript.length > 0
  const playable = detail.playbackUrl !== null

  return (
    <>
      <DashboardCardTitleHeader
        icon={<PlayIcon />}
        back={back}
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="truncate">{detail.title}</span>
            {sample ? <SampleBadge /> : null}
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
          <Player detail={detail} playerRef={playerRef} onTime={setAtMs} />
          <MetaLine detail={detail} />

          <div className="grid gap-3 p-3">
            {sample ? (
              <p className="text-sm text-muted-foreground">
                This is a made-up sample, so it has nothing to play and nothing here is saved.
                Paste a link in the middle to save your own.
              </p>
            ) : (
              <AnalyseBox
                detail={detail}
                busy={busy}
                onAnalyse={() => void run(() => analyseNoteVideo(detail.id))}
                onRetry={() => void run(() => retryNoteVideo(detail.id))}
              />
            )}

            <InspectorCollapseAllProvider signal={collapse.signal}>
              <InspectorCard storageId="note-video-note" title="Your note">
                <NoteBox
                  key={detail.id}
                  videoId={detail.id}
                  initial={detail.note}
                  sample={sample}
                  onTyped={(note) =>
                    setDetail((current) => (current ? { ...current, note } : current))
                  }
                  onSaved={(card) => tellCard.current(card)}
                />
              </InspectorCard>

              <InspectorCard storageId="note-video-summary" title="Summary">
                {analysed && detail.summary.length ? (
                  <ul className="grid list-disc gap-1.5 pl-5 text-sm">
                    {detail.summary.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <EmptyCard detail={detail} analysed={analysed} />
                )}
              </InspectorCard>

              <InspectorCard storageId="note-video-plan" title="Action plan">
                {analysed && detail.actionPlan.length ? (
                  <div className="grid gap-3">
                    {detail.actionPlan.map((step, index) => (
                      <PlanStep
                        key={index}
                        id={`note-plan-${detail.id}-${index}`}
                        text={step.text}
                        done={step.done}
                        sample={sample}
                        onTick={(done) => void tick(index, done)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyCard detail={detail} analysed={analysed} />
                )}
              </InspectorCard>

              <InspectorCard storageId="note-video-quotes" title="Key quotes">
                {analysed && detail.quotes.length ? (
                  <div className="grid gap-2">
                    {detail.quotes.map((quote, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={!playable}
                        onClick={() => seek(quote.startMs)}
                        className={cn(
                          "grid gap-1 rounded-md border bg-background px-3 py-2 text-left text-sm",
                          playable && "hover:bg-muted",
                          focusRing
                        )}
                      >
                        <span>“{quote.text}”</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatTimecode(quote.startMs)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyCard detail={detail} analysed={analysed} />
                )}
              </InspectorCard>

              <InspectorCard storageId="note-video-transcript" title="Transcript">
                {analysed && detail.transcript.length ? (
                  <Transcript
                    lines={detail.transcript}
                    atMs={atMs}
                    onSeek={playable ? seek : undefined}
                  />
                ) : (
                  <EmptyCard detail={detail} analysed={analysed} />
                )}
              </InspectorCard>
            </InspectorCollapseAllProvider>
          </div>

          {sample ? null : (
            <div className="flex border-t p-3">
              <Button type="button" variant="destructive" onClick={() => onDelete(detail)}>
                <Trash2Icon />
                Delete video
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
}

/** What an AI card says when it has nothing to show yet, or ever. */
function EmptyCard({ detail, analysed }: { detail: NoteVideoDetail; analysed: boolean }) {
  const words = isAnalysing(detail.status)
    ? "Being analysed now. This fills in by itself when it is done."
    : analysed && detail.transcript.length === 0
      ? "Nobody speaks in this video, so there is nothing to write down."
      : analysed
        ? "Nothing came back for this one."
        : NOT_ANALYSED
  return <p className="text-sm text-muted-foreground">{words}</p>
}

/**
 * The app's own player for every source: a video plays in `<video>`, a sound
 * file in `<audio>` under a sound mark. Before the file is saved the cover
 * stands in, or a plain fill saying where it has got to.
 */
function Player({
  detail,
  playerRef,
  onTime,
}: {
  detail: NoteVideoDetail
  playerRef: React.RefObject<HTMLMediaElement | null>
  onTime: (ms: number) => void
}) {
  const reportTime = (event: React.SyntheticEvent<HTMLMediaElement>) =>
    onTime(Math.round(event.currentTarget.currentTime * 1000))

  if (detail.playbackUrl && detail.kind === "audio") {
    return (
      <div className="grid justify-items-center gap-3 border-b bg-muted p-4">
        <AudioLinesIcon className="size-10 text-muted-foreground" aria-hidden="true" />
        <audio
          ref={(element) => {
            playerRef.current = element
          }}
          src={detail.playbackUrl}
          controls
          preload="metadata"
          className="w-full"
          onTimeUpdate={reportTime}
        />
      </div>
    )
  }
  if (detail.playbackUrl) {
    return (
      <video
        ref={(element) => {
          playerRef.current = element
        }}
        src={detail.playbackUrl}
        controls
        playsInline
        preload="metadata"
        className="aspect-video max-h-[50vh] w-full border-b bg-black object-contain"
        onTimeUpdate={reportTime}
      />
    )
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden border-b bg-muted">
      {detail.coverUrl ? (
        <img src={detail.coverUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center">
          {detail.kind === "audio" ? (
            <AudioLinesIcon className="size-10 text-muted-foreground" aria-hidden="true" />
          ) : (
            <FilmIcon className="size-10 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
      )}
    </div>
  )
}

/** Site, channel, length, posted date, and the way out to the original. */
function MetaLine({ detail }: { detail: NoteVideoDetail }) {
  const facts = [
    detail.channelName,
    detail.durationSeconds ? formatTimecode(detail.durationSeconds * 1000) : null,
    detail.postedAt ? formatDate(detail.postedAt) : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <SiteLogo source={detail.source} />
        {siteName(detail.source)}
      </span>
      {facts.map((fact) => (
        <span key={fact} className="tabular-nums">
          · {fact}
        </span>
      ))}
      {detail.sourceUrl ? (
        <a
          href={detail.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={cn("ml-auto flex items-center gap-1 rounded-sm hover:text-foreground", focusRing)}
        >
          Open on {siteName(detail.source)}
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

/**
 * The one Analyse button and the price above it. While the job runs it shows
 * where it has got to; a failure says why and offers Try again.
 */
function AnalyseBox({
  detail,
  busy,
  onAnalyse,
  onRetry,
}: {
  detail: NoteVideoDetail
  busy: boolean
  onAnalyse: () => void
  onRetry: () => void
}) {
  if (detail.status === "waiting" || detail.status === "downloading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {statusWords(detail)}
      </p>
    )
  }

  if (detail.status === "failed") {
    const canRetry = detail.hasFile || detail.sourceUrl !== null
    return (
      <div className="grid gap-2">
        <p role="alert" className="text-sm text-destructive">
          {statusWords(detail)}
        </p>
        {detail.hasFile ? (
          <p className="text-xs text-muted-foreground">
            {analysePriceLine(detail.durationSeconds, false)}
          </p>
        ) : null}
        {canRetry ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Try again
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Upload the file again to analyse it.</p>
        )}
      </div>
    )
  }

  if (isAnalysing(detail.status)) {
    return (
      <Button type="button" disabled>
        <Loader2Icon className="animate-spin" />
        {statusWords(detail)}
      </Button>
    )
  }

  const again = detail.status === "ready"
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        {analysePriceLine(detail.durationSeconds, again)}
      </p>
      <Button type="button" disabled={busy} onClick={onAnalyse}>
        {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {again ? "Analyse again" : "Analyse"}
      </Button>
    </div>
  )
}

/**
 * The person's own note. It saves 700ms after the last keystroke and at once
 * on leaving the box, and the header says Saving… and Saved the way every
 * auto-saving screen in the shell does. A note on the sample stays on screen.
 *
 * Shutting the card takes the box off the page, so every keystroke is handed
 * up as well: opening the card again starts from what was typed, not from the
 * note as it was when the video was opened.
 */
function NoteBox({
  videoId,
  initial,
  sample,
  onTyped,
  onSaved,
}: {
  videoId: string
  initial: string
  sample: boolean
  onTyped: (note: string) => void
  onSaved: (card: NoteVideoCard) => void
}) {
  const [text, setText] = React.useState(initial)
  const latest = React.useRef(initial)
  const saved = React.useRef(initial)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  const setSaveStatus = useReportedSaveStatus()
  const fieldId = `note-video-note-${videoId}`

  const tellSaved = React.useRef(onSaved)
  React.useEffect(() => {
    tellSaved.current = onSaved
  })

  const save = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (sample) return
    // One save at a time, each sending whatever the box says when its turn
    // comes, so a slow answer never lands after a newer one.
    queue.current = queue.current.then(async () => {
      const value = latest.current
      if (value === saved.current) return
      setSaveStatus("saving")
      try {
        const card = await saveVideoNote(videoId, value)
        saved.current = value
        setSaveStatus("saved")
        tellSaved.current(card)
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getNoteErrorMessage(error))
      }
    })
  }, [sample, setSaveStatus, videoId])

  // Picking another video mid-sentence still saves what was typed.
  React.useEffect(() => () => save(), [save])

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>Note</Label>
      <Textarea
        id={fieldId}
        value={text}
        rows={1}
        maxLength={NOTE_TEXT_MAX}
        placeholder="For the course launch"
        onChange={(event) => {
          setText(event.target.value)
          onTyped(event.target.value)
          latest.current = event.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(save, NOTE_SAVE_DELAY_MS)
        }}
        onBlur={save}
      />
    </div>
  )
}

function PlanStep({
  id,
  text,
  done,
  sample,
  onTick,
}: {
  id: string
  text: string
  done: boolean
  sample: boolean
  onTick: (done: boolean) => void
}) {
  const box = (
    <Checkbox id={id} checked={done} onCheckedChange={(checked) => onTick(checked === true)} />
  )
  return (
    <div className="flex items-start gap-2.5">
      {sample ? (
        // The hover sits on a box around the checkbox, because a tooltip's
        // trigger writes its own open/shut state over the checkbox's ticked one.
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex pt-0.5">{box}</span>
          </TooltipTrigger>
          <TooltipContent>This is a sample, so ticks are not saved.</TooltipContent>
        </Tooltip>
      ) : (
        <span className="flex pt-0.5">{box}</span>
      )}
      <Label
        htmlFor={id}
        className={cn("leading-snug font-normal", done && "text-muted-foreground line-through")}
      >
        {text}
      </Label>
    </div>
  )
}

/**
 * Every line with its time. A click jumps the player there, and the line being
 * played is lit and scrolled into view as the video plays.
 */
function Transcript({
  lines,
  atMs,
  onSeek,
}: {
  lines: TranscriptLine[]
  atMs?: number
  onSeek?: (ms: number) => void
}) {
  const playing =
    atMs === undefined ? -1 : lines.findIndex((line) => atMs >= line.startMs && atMs < line.endMs)
  const rows = React.useRef<(HTMLButtonElement | null)[]>([])

  React.useEffect(() => {
    if (playing < 0) return
    rows.current[playing]?.scrollIntoView({ block: "nearest" })
  }, [playing])

  return (
    <div className="-mx-1 grid">
      {lines.map((line, index) => (
        <button
          key={`${line.startMs}-${index}`}
          ref={(element) => {
            rows.current[index] = element
          }}
          type="button"
          disabled={!onSeek}
          aria-current={index === playing ? "true" : undefined}
          onClick={() => onSeek?.(line.startMs)}
          className={cn(
            "flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-sm",
            onSeek && "hover:bg-muted",
            index === playing && "bg-muted font-medium",
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
  )
}
