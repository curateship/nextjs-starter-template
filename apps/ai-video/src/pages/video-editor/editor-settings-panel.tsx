import * as React from "react"
import {
  CaptionsIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  ShapesIcon,
  SparklesIcon,
  TypeIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  generateProjectCaptions,
  getCaptionErrorMessage,
} from "@/lib/api/captions"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  findClip,
  useEditor,
  type EditorAction,
  type EditorClip,
} from "@/pages/video-editor/editor-store"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatTimecode,
} from "@/pages/video-editor/timeline-utils"

// Right panel: shows the inspector for the selected clip, or the default
// Elements / AI Generation content when nothing is selected.
export function EditorSettingsPanel() {
  const { state, dispatch, clock } = useEditor()
  const [captionsOpen, setCaptionsOpen] = React.useState(false)
  const selected = state.selectedClipId
    ? findClip(state.tracks, state.selectedClipId)
    : null

  // Adds a starter text clip at the playhead and selects it for editing.
  function addTextClip() {
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "text",
        name: "Text",
        text: "Your text here",
        fontSize: 80,
        color: "#ffffff",
        trimStartMs: 0,
        startMs: 0, // the reducer resolves the actual placement
        durationMs: DEFAULT_TEXT_DURATION_MS,
      },
      atMs: clock.getTime(),
    })
  }

  return (
    <section className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-xl bg-muted/60 lg:flex">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Only text clips need an inspector (content/style editing); media
            clips are managed on the timeline + right-click menu directly. */}
        {selected?.clip.kind === "text" ? (
          <ClipInspector clip={selected.clip} dispatch={dispatch} />
        ) : (
          <DefaultPanels
            onAddText={addTextClip}
            onAddCaptions={() => setCaptionsOpen(true)}
          />
        )}
      </div>
      <CaptionsDialog open={captionsOpen} onOpenChange={setCaptionsOpen} />
    </section>
  )
}

// Text-clip property editor (the only kind with editable content). Style
// edits are transient (no undo snapshots); structural changes stay on the
// timeline itself.
function ClipInspector({
  clip,
  dispatch,
}: {
  clip: EditorClip
  dispatch: React.Dispatch<EditorAction>
}) {
  function patch(value: Partial<EditorClip>) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: value,
      transient: true,
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Badge variant="secondary" className="capitalize">
          {clip.kind}
        </Badge>
        <h2 className="truncate text-sm font-semibold">Text clip</h2>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clip-text">Content</Label>
        <Textarea
          id="clip-text"
          rows={3}
          value={clip.text ?? ""}
          onChange={(event) => patch({ text: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Font size</Label>
        <Slider
          value={[clip.fontSize ?? 80]}
          min={24}
          max={240}
          step={2}
          onValueChange={(value) => patch({ fontSize: value[0] })}
          aria-label="Font size"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clip-color">Color</Label>
        <input
          id="clip-color"
          type="color"
          value={clip.color ?? "#ffffff"}
          onChange={(event) => patch({ color: event.target.value })}
          className="h-8 w-full cursor-pointer rounded-md border bg-background"
        />
      </div>

      {/* Timing readout */}
      <div className="space-y-1 rounded-md border bg-background p-3 text-xs">
        <TimingRow label="Start" value={formatTimecode(clip.startMs)} />
        <TimingRow
          label="End"
          value={formatTimecode(clip.startMs + clip.durationMs)}
        />
        <TimingRow label="Duration" value={formatTimecode(clip.durationMs)} />
      </div>
    </div>
  )
}

function TimingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

// Building blocks the editor supports. Text and Captions are wired up; the
// rest are placeholders for future element kinds.
const ELEMENT_TILES: { label: string; icon: LucideIcon; inert?: boolean }[] = [
  { label: "Text", icon: TypeIcon },
  { label: "Image", icon: ImageIcon, inert: true },
  { label: "Video", icon: VideoIcon, inert: true },
  { label: "Audio", icon: MusicIcon, inert: true },
  { label: "Captions", icon: CaptionsIcon },
  { label: "Shapes", icon: ShapesIcon, inert: true },
]

// Default (nothing selected): element tiles + static AI generation form.
function DefaultPanels({
  onAddText,
  onAddCaptions,
}: {
  onAddText: () => void
  onAddCaptions: () => void
}) {
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold">Elements</h2>
        <p className="text-xs text-muted-foreground">
          Building blocks for your video.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ELEMENT_TILES.map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={
                tile.inert
                  ? undefined
                  : tile.label === "Captions"
                    ? onAddCaptions
                    : onAddText
              }
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 text-xs font-medium transition-colors",
                tile.inert ? "opacity-50" : "hover:bg-muted"
              )}
              disabled={tile.inert}
            >
              <tile.icon className="size-4 text-muted-foreground" />
              {tile.label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* AI generation form (static placeholder) */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">AI Generation</h2>
          <p className="text-xs text-muted-foreground">
            Generate clips from a prompt.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-model">Model</Label>
          <Select defaultValue="veo-3">
            <SelectTrigger id="ai-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veo-3">Veo 3</SelectItem>
              <SelectItem value="sora-2">Sora 2</SelectItem>
              <SelectItem value="runway-gen-4">Runway Gen-4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-style">Style</Label>
          <Select defaultValue="cinematic">
            <SelectTrigger id="ai-style" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cinematic">Cinematic</SelectItem>
              <SelectItem value="photoreal">Photoreal</SelectItem>
              <SelectItem value="anime">Anime</SelectItem>
              <SelectItem value="3d">3D Render</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-prompt">Prompt</Label>
          <Textarea
            id="ai-prompt"
            rows={4}
            placeholder="Describe the clip you want to generate..."
          />
        </div>
        <Button type="button" className="w-full">
          <SparklesIcon />
          Generate
        </Button>
      </div>
    </>
  )
}

// Caption style presets: plain fontSize/color combos applied at insert time —
// caption lines are ordinary text clips afterwards.
const CAPTION_STYLES = [
  { id: "standard", label: "Standard", fontSize: 64, color: "#ffffff" },
  { id: "bold", label: "Big Bold", fontSize: 96, color: "#ffffff" },
  { id: "yellow", label: "Yellow Pop", fontSize: 72, color: "#facc15" },
  { id: "subtle", label: "Subtle", fontSize: 48, color: "#e5e7eb" },
]

// Transcribes the project's audio with Gemini and inserts the result as a new
// top track of word-timed text clips (one undo step).
function CaptionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, projectId, flushSave } = useEditor()
  const [styleId, setStyleId] = React.useState(CAPTION_STYLES[0].id)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      // The server transcribes the SAVED timeline's audio source — persist
      // any edits still inside the autosave debounce first.
      await flushSave()
      const result = await generateProjectCaptions(projectId)
      if (result.captions.length === 0) {
        setError("No speech found to caption.")
        return
      }
      const style =
        CAPTION_STYLES.find((s) => s.id === styleId) ?? CAPTION_STYLES[0]
      dispatch({
        type: "ADD_CAPTION_CLIPS",
        clips: result.captions.map((line) => ({
          id: editorId(),
          kind: "text" as const,
          name: "Caption",
          text: line.text,
          fontSize: style.fontSize,
          color: style.color,
          trimStartMs: 0,
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
        })),
      })
      onOpenChange(false)
    } catch (generateError) {
      setError(getCaptionErrorMessage(generateError))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !generating && onOpenChange(next)}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Generate Captions</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Transcribes the project&apos;s audio and adds the lines as a new
              caption track. Each caption is a normal text clip you can edit
              afterwards.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="caption-style">Style</Label>
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger id="caption-style" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPTION_STYLES.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={generating}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={generating} onClick={handleGenerate}>
            {generating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CaptionsIcon className="size-4" />
            )}
            {generating ? "Transcribing…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
