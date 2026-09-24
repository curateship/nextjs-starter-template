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
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAiToolErrorMessage,
  writeCaptions,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { CaptionLookFields } from "@/components/video-editor/caption-look-fields"
import { useSavedCaptionLook } from "@/components/video-editor/use-saved-caption-look"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { captionClipStyle } from "@/lib/video/caption-look"
import { captionClipWordTimes } from "@/lib/video/caption-words"
import { captionClipName } from "@/lib/video/captions"
import { editorId } from "@/lib/video/timeline-utils"
import { useEditorRuntime } from "@/components/video-editor/editor-store"

/**
 * Writing the captions, and how they should look when they land.
 *
 * The look starts from the one saved in the brand kit every time the window
 * opens. A change made here is for this one run and is not saved back; the
 * brand kit is where the look is kept. Any of it can still be changed
 * afterwards on a single caption in the inspector.
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
  const [look, setLook] = useSavedCaptionLook(open)
  const [writing, setWriting] = React.useState(false)

  async function write() {
    if (!look) return
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
            </CardHeader>
            <CardContent>
              <AiChoiceField kind="transcriber" available={available} />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>How they look</CardTitle>
              <CardDescription>
                Starts from the look saved in the brand kit. Changes here are
                for this time only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {look ? (
                <CaptionLookFields
                  idPrefix="captions"
                  look={look}
                  onChange={setLook}
                />
              ) : (
                <LoadingRow label="Reading the saved look…" />
              )}
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
            disabled={writing || !look}
            onClick={() => void write()}
          >
            {writing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CaptionsIcon />
            )}
            {writing ? "Listening…" : "Write them"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
