import * as React from "react"
import { CaptionsIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  getAiToolErrorMessage,
  writeCaptions,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import {
  CAPTION_ANIMATIONS,
  DEFAULT_CAPTION_ANIMATION,
  resolveCaptionAnimation,
  type CaptionAnimationId,
} from "@/lib/video/caption-animations"
import { CAPTION_DEFAULTS, captionClipName } from "@/lib/video/captions"
import { editorId } from "@/lib/video/timeline-utils"
import { useEditorRuntime } from "@/components/video-editor/editor-store"

/**
 * Writing the captions, and how they should look when they land.
 *
 * The choices sit here rather than in the panel because they belong to this
 * one job: they are what the captions will be, and they are only ever read the
 * moment the button is pressed. Any of them can be changed afterwards on a
 * single caption in the inspector.
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
  const [entrance, setEntrance] = React.useState<CaptionAnimationId>(
    DEFAULT_CAPTION_ANIMATION
  )
  const [fontSize, setFontSize] = React.useState<number>(
    CAPTION_DEFAULTS.fontSize
  )
  const [color, setColor] = React.useState<string>(CAPTION_DEFAULTS.color)
  const [boxed, setBoxed] = React.useState(true)
  const [writing, setWriting] = React.useState(false)

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
          fontId: "inter" as const,
          animation: entrance,
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
          trimStartMs: 0,
          fontSize,
          color,
          highlightColor: boxed
            ? CAPTION_DEFAULTS.backgroundColor
            : undefined,
          x: CAPTION_DEFAULTS.x,
          y: CAPTION_DEFAULTS.y,
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
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="captions-size">Size</Label>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {fontSize} px
                  </span>
                </div>
                <Slider
                  id="captions-size"
                  min={40}
                  max={140}
                  step={2}
                  value={[fontSize]}
                  onValueChange={([next]) => setFontSize(next)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Label htmlFor="captions-colour">Colour</Label>
                <Input
                  id="captions-colour"
                  type="color"
                  className="w-16 p-1"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={boxed}
                    onChange={(event) => setBoxed(event.target.checked)}
                  />
                  On a dark block
                </label>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="captions-entrance">How they arrive</Label>
                <Select
                  value={entrance}
                  onValueChange={(next) =>
                    setEntrance(resolveCaptionAnimation(next))
                  }
                >
                  <SelectTrigger id="captions-entrance" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPTION_ANIMATIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} — {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
          <Button type="button" disabled={writing} onClick={() => void write()}>
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
