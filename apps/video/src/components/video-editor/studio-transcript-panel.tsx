import * as React from "react"
import { Loader2Icon, ScissorsIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  getAiToolErrorMessage,
  loadAiToolsAvailability,
  loadClipTranscript,
  type AiToolsAvailability,
  type ClipTranscript,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { snapRangesToSilence } from "@/lib/video/jump-cuts"
import {
  getTranscriptWordPlacement,
  mapTranscriptWordSpanToClipRemoval,
} from "@/lib/video/transcript-editing"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { cn } from "@/lib/utils"
import { useSavedTranscripts } from "@/components/video-editor/use-saved-transcripts"
import type { TranscriberId } from "@/lib/video/ai-choices"
import {
  captionsCostCents,
  formatAiEstimate,
  transcribeCostCents,
} from "@/lib/video/ai-estimates"
import { sourceSpanMs } from "@/lib/video/clip-playback"
import { hasSavedWords } from "@/lib/video/transcripts"

/**
 * What the clip says, word by word.
 *
 * Picking a run of words and cutting them takes exactly that much out of the
 * video — editing the film by editing the writing. The server keeps the
 * file's words, timed against the file rather than the timeline, so they
 * never stop matching however the clip is cut; this panel holds the clip's
 * share of them while it is open. The first time a file is written down it
 * is paid for, after that it is free, and "Transcribe again" pays again.
 */
export function TranscriptPanel() {
  const { projectId, dispatch, saveNow } = useEditorRuntime()
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const tracks = useEditorSelector((state) => state.tracks)
  const [transcript, setTranscript] = React.useState<ClipTranscript | null>(
    null
  )
  const [loading, setLoading] = React.useState(false)
  const [available, setAvailable] = React.useState<AiToolsAvailability | null>(
    null
  )
  const [pickedTranscriber, setPickedTranscriber] = React.useState<
    TranscriberId | undefined
  >()

  React.useEffect(() => {
    let active = true
    loadAiToolsAvailability()
      .then((loaded) => {
        if (active) setAvailable(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const [anchor, setAnchor] = React.useState<number | null>(null)
  const [head, setHead] = React.useState<number | null>(null)
  // Words already taken out of the film. They stay in the list, greyed and
  // crossed through, so it is plain what was cut — and they come back if the
  // cut is undone, because this is worked out from the timeline itself.
  const cutWords = React.useMemo(() => {
    if (!transcript) return new Set<number>()
    const gone = new Set<number>()
    transcript.words.forEach((word, index) => {
      const still = getTranscriptWordPlacement(word, transcript.source, tracks)
      if (!still) gone.add(index)
    })
    return gone
  }, [transcript, tracks])

  // A transcript belongs to one clip. Picking another leaves it behind rather
  // than showing words that describe something else.
  const forThisClip = transcript?.clipId === selectedClipId ? transcript : null

  // Whether this clip's file is already written down, and what writing it
  // down costs when it is not: the whole file, the first time.
  const selectedClip = selectedClipId
    ? tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId)
    : undefined
  const mediaId = selectedClip?.mediaId
  const { saved, remember } = useSavedTranscripts(
    mediaId ? [mediaId] : [],
    !!mediaId
  )
  const transcriber =
    pickedTranscriber ?? (available?.transcriber as TranscriberId | null)
  const savedRow = saved.find((row) => row.mediaId === mediaId)
  const fileSoundMs = selectedClip
    ? (savedRow?.durationMs ??
      selectedClip.sourceDurationMs ??
      sourceSpanMs(selectedClip))
    : 0
  const isSaved =
    !!mediaId && !!transcriber && hasSavedWords(saved, mediaId, transcriber)
  const firstPriceCents =
    mediaId && transcriber
      ? captionsCostCents({ transcriber, fileSoundMs, saved: isSaved })
      : null
  const againPriceCents =
    mediaId && transcriber ? transcribeCostCents(transcriber, fileSoundMs) : null

  async function write(fresh = false) {
    if (!selectedClipId) return
    setLoading(true)
    try {
      // The server reads the saved timeline, so anything still waiting to be
      // sent goes first.
      await saveNow()
      const answer = await loadClipTranscript(projectId, selectedClipId, {
        fresh,
      })
      if (mediaId && transcriber && !isSaved) {
        remember({ mediaId, transcriber, durationMs: fileSoundMs })
      }
      dismissErrorToast()
      setTranscript(answer)
      setAnchor(null)
      setHead(null)
      if (!answer.words.length) {
        toast.success("Nothing was said in that clip.")
      }
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const from = anchor === null || head === null ? null : Math.min(anchor, head)
  const to = anchor === null || head === null ? null : Math.max(anchor, head)
  const picked = from === null || to === null ? 0 : to - from + 1

  function cut() {
    if (!forThisClip || from === null || to === null) return
    const removal = mapTranscriptWordSpanToClipRemoval(
      forThisClip.words,
      from,
      to,
      forThisClip.source,
      tracks
    )
    if (!removal) {
      showErrorToast(
        "Those words are no longer in one piece of the clip — pick a shorter run"
      )
      return
    }
    // Land on the real edges of the speech. The times a word was said are an
    // estimate; the quiet either side of it was measured.
    const tidied = snapRangesToSilence(
      removal.removals.map((one) => ({
        startMs: one.clipStartMs,
        endMs: one.clipEndMs,
      })),
      forThisClip.silences,
      forThisClip.source.durationMs
    )
    dispatch({
      type: "APPLY_JUMP_CUTS",
      clipId: removal.clipId,
      removals: tidied.map((one) => ({
        clipStartMs: one.startMs,
        clipEndMs: one.endMs,
      })),
      rippleClipIds: removal.rippleClipIds,
    })
    // The words are still true — they describe the recording, not the clip —
    // but the run just cut is gone from the film.
    setAnchor(null)
    setHead(null)
    toast.success(
      `${picked} ${plural(picked, "word", "words")} cut. Undo puts them back.`
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<TypeIcon className="size-4" />}
        title="Transcript"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 gap-3 p-4">
          {!selectedClipId ? (
            <p className="text-sm text-muted-foreground">
              Pick a clip with sound in it on the timeline, and its words appear
              here.
            </p>
          ) : !forThisClip ? (
            <>
              <p className="text-sm text-muted-foreground">
                {isSaved
                  ? "This recording is already written down, so its words cost nothing to show. Cross words out to cut the video."
                  : "Writing down what a clip says lets you cut the video by crossing words out. The whole recording is written down once and kept, so every clip of it is free after that."}
              </p>
              <AiChoiceField
                kind="transcriber"
                available={available}
                onChanged={(id) => setPickedTranscriber(id as TranscriberId)}
              />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void write()}
                  className="max-w-full min-w-0 shrink"
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : null}
                  {loading ? (
                    "Listening…"
                  ) : (
                    <PricedLabel
                      label={isSaved ? "Show the words" : "Write it down"}
                      cents={firstPriceCents}
                    />
                  )}
                </Button>
              </div>
            </>
          ) : forThisClip.words.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing was said in this clip.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Click a word, then shift-click another to take everything
                between them.
                {cutWords.size ? (
                  <>
                    {" "}
                    Greyed-out words have already gone from the film — undo
                    brings them back.
                  </>
                ) : null}
              </p>
              <p className="flex flex-wrap gap-x-1 gap-y-1.5 leading-relaxed">
                {forThisClip.words.map((word, index) => {
                  const inRun =
                    from !== null && to !== null && index >= from && index <= to
                  const gone = cutWords.has(index)
                  return (
                    <button
                      key={`${word.startMs}-${index}`}
                      type="button"
                      disabled={gone}
                      title={gone ? "Already cut" : undefined}
                      onClick={(event) => {
                        if (event.shiftKey && anchor !== null) setHead(index)
                        else {
                          setAnchor(index)
                          setHead(index)
                        }
                      }}
                      className={cn(
                        "rounded px-1 transition-colors",
                        gone
                          ? "text-muted-foreground/60 line-through"
                          : inRun
                            ? "bg-destructive/15 text-foreground line-through"
                            : "hover:bg-muted"
                      )}
                    >
                      {word.text}
                    </button>
                  )
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {picked > 0 ? (
                  <Button type="button" variant="outline" onClick={cut}>
                    <ScissorsIcon />
                    Cut {picked} {plural(picked, "word", "words")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => void write(true)}
                  className="max-w-full min-w-0 shrink"
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : null}
                  <PricedLabel label="Transcribe again" cents={againPriceCents} />
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * A button's words and its price. The panel can be dragged narrow, and then
 * the words shorten while the price stays whole, because the price is the
 * part that must never be hidden.
 */
function PricedLabel({ label, cents }: { label: string; cents: number | null }) {
  if (cents === null) return <>{label}</>
  return (
    <>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0">· {formatAiEstimate(cents)}</span>
    </>
  )
}
