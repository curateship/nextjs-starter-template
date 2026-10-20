import * as React from "react"
import { CaptionsIcon, Loader2Icon } from "lucide-react"
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
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getAiToolErrorMessage,
  writeCaptions,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { CaptionLookFields } from "@/components/video-editor/caption-look-fields"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import {
  captionClipStyle,
  DEFAULT_CAPTION_LOOK,
  type CaptionLook,
} from "@/lib/video/caption-look"
import { captionClipWordTimes } from "@/lib/video/caption-words"
import { captionClipName, findCaptionSource } from "@/lib/video/captions"
import { editorId } from "@/lib/video/timeline-utils"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { useSavedTranscripts } from "@/components/video-editor/use-saved-transcripts"
import { sourceSpanMs } from "@/lib/video/clip-playback"
import type { TranscriberId } from "@/lib/video/ai-choices"
import { captionsCostCents, withEstimate } from "@/lib/video/ai-estimates"
import { hasSavedWords } from "@/lib/video/transcripts"

/**
 * Writing the captions, and how they should look when they land.
 *
 * The look starts from the standard one every time the window opens. A change
 * made here is for this one run and is not kept. Any of it can still be
 * changed afterwards on a single caption in the inspector.
 */
export function CaptionsDialog({
  open,
  onOpenChange,
  available,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: AiToolsAvailability | null
}) {
  const { projectId, dispatch, saveNow } = useEditorRuntime()
  const tracks = useEditorSelector((state) => state.tracks)
  const [look, setLook] = React.useState<CaptionLook>(DEFAULT_CAPTION_LOOK)
  const [writing, setWriting] = React.useState(false)
  const [pickedTranscriber, setPickedTranscriber] = React.useState<
    TranscriberId | undefined
  >()

  // Every opening starts from the standard look again.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setLook(DEFAULT_CAPTION_LOOK)
      setPickedTranscriber(undefined)
    }
  }

  // The price before the press: the same clip the server will pick, the
  // whole file's sound the first time, and nothing once its words are saved.
  const source = findCaptionSource(tracks)
  const mediaId = source?.clip.mediaId
  const { saved } = useSavedTranscripts(mediaId ? [mediaId] : [], open)
  const transcriber =
    pickedTranscriber ?? (available?.transcriber as TranscriberId | null)
  const savedRow = saved.find((row) => row.mediaId === mediaId)
  const priceCents =
    source && mediaId && transcriber
      ? captionsCostCents({
          transcriber,
          fileSoundMs:
            savedRow?.durationMs ??
            source.clip.sourceDurationMs ??
            sourceSpanMs(source.clip),
          saved: hasSavedWords(saved, mediaId, transcriber),
        })
      : null

  async function write() {
    setWriting(true)
    try {
      // The server reads the saved timeline, so anything still waiting to be
      // sent goes first.
      await saveNow()
      const { captions } = await writeCaptions(projectId)
      dispatch({
        type: "INSERT_CAPTIONS",
        captions: captions.map((line) => ({
          id: editorId(),
          kind: "text" as const,
          name: captionClipName(line.text),
          text: line.text,
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
          trimStartMs: 0,
          wordTimes: captionClipWordTimes(line),
          ...captionClipStyle(look),
        })),
      })
      dismissErrorToast()
      toast.success(
        `${captions.length} ${plural(captions.length, "caption", "captions")} added. Undo takes them all back off.`
      )
      onOpenChange(false)
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setWriting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write the captions</DialogTitle>
          <DialogDescription>
            The talking on this project, laid over the picture. Undo takes them
            all back off.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Who does it</CardTitle>
              <CardDescription>
                The first time, the whole recording is written down and kept,
                so captioning it again costs nothing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AiChoiceField
                kind="transcriber"
                available={available}
                onChanged={(id) => setPickedTranscriber(id as TranscriberId)}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>How they look</CardTitle>
              <CardDescription>
                Starts from the standard look. Changes here are for this time
                only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CaptionLookFields
                idPrefix="captions"
                look={look}
                onChange={setLook}
              />
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={writing}
            onClick={() => void write()}
          >
            {writing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CaptionsIcon />
            )}
            {writing ? "Listening…" : withEstimate("Write them", priceCents)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
