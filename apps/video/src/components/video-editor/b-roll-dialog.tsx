import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, FilmIcon, Loader2Icon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import type { AiToolsAvailability } from "@/lib/api/video/ai-tools"
import {
  getBrollErrorMessage,
  loadBrollStatus,
  saveBrollPicks,
  searchBroll,
  suggestBroll,
  type BrollRow,
  type BrollStatus,
  type PexelsBatch,
} from "@/lib/api/video/b-roll"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { TranscriberId, WriterId } from "@/lib/video/ai-choices"
import {
  brollPhrasesCostCents,
  transcribeCostCents,
  withEstimate,
} from "@/lib/video/ai-estimates"
import {
  BROLL_NO_KEY_MESSAGE,
  BROLL_NO_ROOM_MESSAGE,
  BROLL_NO_VOICE_MESSAGE,
  cleanPhrase,
  suggestedCandidate,
  type BrollCandidate,
} from "@/lib/video/b-roll"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import {
  MAX_TIMELINE_TRACKS,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import { formatClock } from "@/lib/video/timeline-utils"
import { cn } from "@/lib/utils"

/**
 * The B-roll window (see `workspace/docs/b-roll.md`): one row per sentence of
 * the voice line, four Pexels clips each, the suggested one ticked. Swap,
 * skip or search a row again, then Place. Nothing is downloaded before Place.
 */

type GridRow = BrollRow & {
  /** Which clip is ticked, or null for a row with none. */
  picked: number | null
  skipped: boolean
}

type Grid = {
  aspect: AspectRatio
  rows: GridRow[]
  stopped: PexelsBatch["stopped"]
}

/**
 * Each project's grid, held for the life of the page, so closing the window
 * or switching rail panels never throws away phrases that were paid for.
 */
const heldGrids = new Map<string, Grid>()

function withPick(row: BrollRow): GridRow {
  return {
    ...row,
    picked: row.candidates
      ? suggestedCandidate(row.candidates, row.endMs - row.startMs)
      : null,
    skipped: false,
  }
}

/** "Search the rest after 3:42 pm" from a stop, when it says when. */
function stopLine(stopped: NonNullable<Grid["stopped"]>, waiting: number) {
  const rows = `${waiting} ${plural(waiting, "row", "rows")} still to search`
  const when = stopped.retryAtMs
    ? `, after ${new Date(stopped.retryAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : ""
  return `${stopped.message} ${rows}. Search the rest${when}.`
}

export function BrollDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const { store, dispatch, projectId, saveNow } = useEditorRuntime()
  const { openSettings, refreshSpend } = useProjectSettings()
  const [status, setStatus] = React.useState<BrollStatus | null>(null)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [statusReads, setStatusReads] = React.useState(0)
  const [grid, setGridState] = React.useState<Grid | null>(
    () => heldGrids.get(projectId) ?? null
  )
  const [busy, setBusy] = React.useState<"finding" | "placing" | "rest" | null>(null)
  // The rows whose own search is running.
  const [searching, setSearching] = React.useState<ReadonlySet<string>>(new Set())

  const setGrid = React.useCallback(
    (update: (current: Grid | null) => Grid | null) => {
      setGridState((current) => {
        const next = update(current)
        if (next) heldGrids.set(projectId, next)
        else heldGrids.delete(projectId)
        return next
      })
    },
    [projectId]
  )

  // Asked every time the window opens, after any waiting edit is saved, so
  // the key and the voice line are read as they are now.
  React.useEffect(() => {
    if (!open) return
    let current = true
    saveNow()
      .then(() => loadBrollStatus(projectId))
      .then((loaded) => {
        if (!current) return
        setStatus(loaded)
        setStatusError(null)
      })
      .catch((error: unknown) => {
        if (current) setStatusError(getBrollErrorMessage(error))
      })
    return () => {
      current = false
    }
  }, [open, projectId, saveNow, statusReads])

  const reportError = React.useCallback(
    (error: unknown) => {
      const message = getBrollErrorMessage(error)
      if (message === BROLL_NO_KEY_MESSAGE) {
        setStatus((current) => (current ? { ...current, hasKey: false } : current))
        return
      }
      showErrorToast(
        message,
        isProjectSpendLimitMessage(message)
          ? { label: "Raise limit", onClick: openSettings }
          : undefined
      )
    },
    [openSettings]
  )

  const writer = available?.writer as WriterId | null | undefined
  const transcriber = available?.transcriber as TranscriberId | null | undefined
  const findCents =
    status?.voice && writer
      ? brollPhrasesCostCents({ writer, talkMs: status.voice.talkMs }) +
        (transcriber && status.voice.toWriteDownMs > 0
          ? transcribeCostCents(transcriber, status.voice.toWriteDownMs)
          : 0)
      : null

  async function find() {
    if (store.refuseIfLocked()) return
    setBusy("finding")
    dismissErrorToast()
    try {
      await saveNow()
      const found = await suggestBroll(projectId)
      setGrid(() => ({
        aspect: found.aspect,
        rows: found.rows.map(withPick),
        stopped: found.stopped,
      }))
      refreshSpend()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  function changeRow(id: string, patch: Partial<GridRow>) {
    setGrid((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          }
        : current
    )
  }

  /**
   * Lays a batch's answers into the grid, ticking each searched row's best.
   * One row searched on its own leaves an earlier stop standing, because the
   * rows it left waiting are still waiting.
   */
  function takeBatch(batch: PexelsBatch, { oneRow = false } = {}) {
    setGrid((current) =>
      current
        ? {
            ...current,
            stopped: oneRow ? (batch.stopped ?? current.stopped) : batch.stopped,
            rows: current.rows.map((row) =>
              batch.found[row.id]
                ? withPick({ ...row, candidates: batch.found[row.id] })
                : row
            ),
          }
        : current
    )
  }

  async function searchRow(row: GridRow) {
    const phrase = cleanPhrase(row.phrase)
    if (!phrase) {
      showErrorToast("Type one to three words to search for.")
      return
    }
    setSearching((current) => new Set(current).add(row.id))
    dismissErrorToast()
    try {
      const batch = await searchBroll(projectId, [{ id: row.id, phrase }])
      takeBatch(batch, { oneRow: true })
      if (batch.stopped) showErrorToast(batch.stopped.message)
    } catch (error) {
      reportError(error)
    } finally {
      setSearching((current) => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
    }
  }

  async function searchRest() {
    if (!grid) return
    const waiting = grid.rows.filter((row) => !row.candidates && !row.skipped)
    if (!waiting.length) return
    setBusy("rest")
    dismissErrorToast()
    try {
      takeBatch(
        await searchBroll(
          projectId,
          waiting.map((row) => ({ id: row.id, phrase: row.phrase }))
        )
      )
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  const picks =
    grid?.rows.flatMap((row) => {
      const candidate =
        !row.skipped && row.picked !== null ? row.candidates?.[row.picked] : undefined
      return candidate ? [{ row, candidate }] : []
    }) ?? []

  async function place() {
    if (!picks.length) {
      showErrorToast("Tick a clip in at least one row first.")
      return
    }
    if (store.refuseIfLocked()) return
    // Checked before anything is downloaded: the clips need a lane of their own.
    if (store.getSnapshot().state.tracks.length + 1 > MAX_TIMELINE_TRACKS) {
      showErrorToast(BROLL_NO_ROOM_MESSAGE)
      return
    }
    setBusy("placing")
    dismissErrorToast()
    try {
      const placements = await saveBrollPicks(
        projectId,
        picks.map(({ row, candidate }) => ({
          startMs: row.startMs,
          endMs: row.endMs,
          phrase: cleanPhrase(row.phrase) || "clip",
          candidate: {
            pexelsId: candidate.pexelsId,
            pageUrl: candidate.pageUrl,
            photographer: candidate.photographer,
            photographerUrl: candidate.photographerUrl,
            fileUrl: candidate.fileUrl,
            durationMs: candidate.durationMs,
          },
        }))
      )
      dispatch({ type: "PLACE_BROLL", placements })
      store.refreshMediaShelf()
      setGrid(() => null)
      toast.success(
        `Placed ${placements.length} ${plural(placements.length, "clip", "clips")} on a new lane. One Undo takes them all off.`
      )
      onOpenChange(false)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(null)
    }
  }

  const waitingCount =
    grid?.rows.filter((row) => !row.candidates && !row.skipped).length ?? 0

  return (
    <FormDialog
      open={open}
      dirty={false}
      busy={busy !== null}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>B-roll from Pexels</DialogTitle>
            <DialogDescription>
              Free stock clips under each sentence of the voice line. Nothing is
              downloaded until you press Place.{" "}
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Videos provided by Pexels
              </a>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {statusError ? (
              <ErrorRow
                message={statusError}
                onRetry={() => {
                  setStatusError(null)
                  setStatusReads((count) => count + 1)
                }}
              />
            ) : !status ? (
              <LoadingRow label="Checking the voice line and the Pexels key…" />
            ) : !status.hasKey ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{BROLL_NO_KEY_MESSAGE}</CardTitle>
                  <CardDescription>
                    B-roll searches Pexels, a free stock video library. A free
                    key from pexels.com/api goes in Settings → Pexels.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link to="/admin/settings/$tab" params={{ tab: "pexels" }}>
                      Open Settings → Pexels
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : !status.voice ? (
              <p className="text-sm text-muted-foreground">{BROLL_NO_VOICE_MESSAGE}</p>
            ) : !grid ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>How it works</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-muted-foreground">
                  <p>
                    The voice line is cut into sentences. The AI that writes words
                    names one search phrase for each, then Pexels offers four clips
                    per sentence.
                  </p>
                  <p>
                    {formatClock(status.voice.talkMs)} of talking.
                    {status.voice.toWriteDownMs > 0
                      ? " It is written down first, and kept, because no words are saved for it yet."
                      : ""}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {grid.stopped && waitingCount > 0 ? (
                  <Card size="sm">
                    <CardContent className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-sm">
                        {stopLine(grid.stopped, waitingCount)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void searchRest()}
                      >
                        {busy === "rest" ? <Loader2Icon className="animate-spin" /> : null}
                        Search the rest
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
                {grid.rows.map((row) => (
                  <BrollGridRow
                    key={row.id}
                    row={row}
                    aspect={grid.aspect}
                    searching={searching.has(row.id)}
                    onChange={(patch) => changeRow(row.id, patch)}
                    onSearch={() => void searchRow(row)}
                  />
                ))}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {grid && status?.hasKey && status.voice ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                disabled={busy !== null}
                onClick={() => void find()}
              >
                {busy === "finding" ? <Loader2Icon className="animate-spin" /> : null}
                {withEstimate("Find again", findCents)}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={requestClose}>
              {grid ? "Close" : "Cancel"}
            </Button>
            {status?.hasKey && status.voice ? (
              grid ? (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void place()}
                >
                  {busy === "placing" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <FilmIcon />
                  )}
                  {busy === "placing"
                    ? "Downloading…"
                    : `Place ${picks.length} ${plural(picks.length, "clip", "clips")}`}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void find()}
                >
                  {busy === "finding" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SearchIcon />
                  )}
                  {busy === "finding"
                    ? "Finding clips…"
                    : withEstimate("Find B-roll", findCents)}
                </Button>
              )
            ) : null}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function BrollGridRow({
  row,
  aspect,
  searching,
  onChange,
  onSearch,
}: {
  row: GridRow
  aspect: AspectRatio
  searching: boolean
  onChange: (patch: Partial<GridRow>) => void
  onSearch: () => void
}) {
  const phraseId = `broll-phrase-${row.id}`
  const candidates = row.candidates
  return (
    <Card size="sm">
      <CardContent className="grid gap-3">
        <div className="flex items-start gap-3">
          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatClock(row.startMs)}
          </span>
          <p
            className={cn(
              "min-w-0 flex-1 text-sm",
              row.skipped && "text-muted-foreground line-through"
            )}
          >
            {row.text}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={row.skipped}
            onClick={() => onChange({ skipped: !row.skipped })}
          >
            {row.skipped ? "Use this row" : "Skip"}
          </Button>
        </div>
        {row.skipped ? null : (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor={phraseId} className="sr-only">
                Search phrase for this sentence
              </label>
              <Input
                id={phraseId}
                value={row.phrase}
                maxLength={60}
                onChange={(event) => onChange({ phrase: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onSearch()
                  }
                }}
                className="w-full sm:max-w-xs"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Search this row again"
                    disabled={searching}
                    onClick={onSearch}
                  >
                    {searching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search this row again</TooltipContent>
              </Tooltip>
            </div>
            {!candidates ? (
              <p className="text-sm text-muted-foreground">Not searched yet.</p>
            ) : !candidates.length ? (
              <p className="text-sm text-muted-foreground">
                Pexels found nothing for &quot;{row.phrase}&quot;. Try other words.
              </p>
            ) : (
              <div
                className={cn(
                  "grid grid-cols-4 gap-2",
                  aspect === "9:16" && "max-w-sm",
                  aspect === "1:1" && "max-w-md"
                )}
              >
                {candidates.map((candidate, index) => (
                  <BrollThumb
                    key={candidate.pexelsId}
                    candidate={candidate}
                    aspect={aspect}
                    picked={row.picked === index}
                    onPick={() => onChange({ picked: index })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One clip: Pexels' still, and the clip itself only while the pointer is
 * over it or it has focus, so an idle grid fetches no video at all.
 */
function BrollThumb({
  candidate,
  aspect,
  picked,
  onPick,
}: {
  candidate: BrollCandidate
  aspect: AspectRatio
  picked: boolean
  onPick: () => void
}) {
  const [playing, setPlaying] = React.useState(false)
  const seconds = Math.round(candidate.durationMs / 1000)
  return (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={`${seconds} second clip by ${candidate.photographer}${picked ? ", ticked" : ""}`}
      onClick={onPick}
      onPointerEnter={() => setPlaying(true)}
      onPointerLeave={() => setPlaying(false)}
      onFocus={() => setPlaying(true)}
      onBlur={() => setPlaying(false)}
      className={cn(
        "relative overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
        aspect === "9:16" ? "aspect-[9/16]" : aspect === "1:1" ? "aspect-square" : "aspect-video",
        picked && "ring-2 ring-primary"
      )}
    >
      <img
        src={candidate.pictureUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />
      {playing ? (
        <video
          src={candidate.previewUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] tabular-nums">
        {seconds}s
      </span>
      {picked ? (
        <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3" />
        </span>
      ) : null}
    </button>
  )
}
