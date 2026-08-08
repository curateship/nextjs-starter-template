import * as React from "react"
import { Loader2Icon, ScissorsIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import {
  getAiToolErrorMessage,
  loadClipTranscript,
  type ClipTranscript,
} from "@/lib/api/video/ai-tools"
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

/**
 * What the clip says, word by word.
 *
 * Picking a run of words and cutting them takes exactly that much out of the
 * video — editing the film by editing the writing. The words are held here for
 * as long as the panel is open rather than saved: the timeline changes under
 * them with every cut, and a stored transcript would quietly stop matching.
 */
export function TranscriptPanel() {
  const { projectId, dispatch } = useEditorRuntime()
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const tracks = useEditorSelector((state) => state.tracks)
  const [transcript, setTranscript] = React.useState<ClipTranscript | null>(
    null
  )
  const [loading, setLoading] = React.useState(false)
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

  async function write() {
    if (!selectedClipId) return
    setLoading(true)
    try {
      const answer = await loadClipTranscript(projectId, selectedClipId)
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
      <WorkspacePanelHeader
        icon={<TypeIcon className="size-4" />}
        title="Transcript"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-4">
          {!selectedClipId ? (
            <p className="text-sm text-muted-foreground">
              Pick a clip with sound in it on the timeline, and its words appear
              here.
            </p>
          ) : !forThisClip ? (
            <>
              <p className="text-sm text-muted-foreground">
                Writing down what a clip says costs a little of your AI budget,
                and lets you cut the video by crossing words out.
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void write()}
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : null}
                  {loading ? "Listening…" : "Write it down"}
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
                  onClick={() => void write()}
                  title="Listen again, so the words match the film as it is now"
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : null}
                  Write it down again
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
