import * as React from "react"
import {
  CaptionsIcon,
  CopyIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  PenLineIcon,
  ShapesIcon,
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
  type CaptionProvider,
} from "@/lib/api/captions"
import {
  getScriptErrorMessage,
  writeProjectScript,
  type ScriptBeat,
} from "@/lib/api/script-writer"
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
import { Textarea } from "@/components/ui/textarea"
import { useEditor, type EditorClip } from "@/pages/video-editor/editor-store"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatTimecode,
} from "@/pages/video-editor/timeline-utils"

// Right panel: shows the inspector for the selected clip, or the default
// Elements / AI Generation content when nothing is selected.
export function EditorSettingsPanel() {
  const [textOpen, setTextOpen] = React.useState(false)
  const [captionsOpen, setCaptionsOpen] = React.useState(false)
  const [scriptOpen, setScriptOpen] = React.useState(false)

  return (
    <section className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-xl bg-muted/60 lg:flex">
      {/* Element tools + AI helpers. Text clips are edited in a modal opened
          from the clip's right-click "Edit", not an inline inspector here. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <DefaultPanels
          onAddText={() => setTextOpen(true)}
          onAddCaptions={() => setCaptionsOpen(true)}
          onWriteScript={() => setScriptOpen(true)}
        />
      </div>
      <TextDialog open={textOpen} onOpenChange={setTextOpen} />
      <CaptionsDialog open={captionsOpen} onOpenChange={setCaptionsOpen} />
      <ScriptDialog open={scriptOpen} onOpenChange={setScriptOpen} />
    </section>
  )
}

// Edits a text clip's content/style in a modal, opened from the clip's
// right-click "Edit". Changes apply live (transient — no per-keystroke undo
// snapshot), matching the old inline inspector.
export function EditTextDialog({
  clip,
  open,
  onOpenChange,
}: {
  clip: EditorClip
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch } = useEditor()
  function patch(value: Partial<EditorClip>) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: value,
      transient: true,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Edit Text</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <TextClipFields
              idPrefix="edit"
              text={clip.text ?? ""}
              fontSize={clip.fontSize ?? 80}
              color={clip.color ?? "#ffffff"}
              onChange={patch}
            />
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// The content/size/color fields for a text clip, shared by the "Add Text"
// dialog and the selected-clip inspector. `idPrefix` keeps label ids unique
// across the two mount points.
function TextClipFields({
  idPrefix,
  text,
  fontSize,
  color,
  onChange,
}: {
  idPrefix: string
  text: string
  fontSize: number
  color: string
  onChange: (patch: { text?: string; fontSize?: number; color?: string }) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-text`}>Content</Label>
        <Textarea
          id={`${idPrefix}-text`}
          rows={3}
          value={text}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Font size</Label>
        <Slider
          value={[fontSize]}
          min={24}
          max={240}
          step={2}
          onValueChange={(value) => onChange({ fontSize: value[0] })}
          aria-label="Font size"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-color`}>Color</Label>
        <input
          id={`${idPrefix}-color`}
          type="color"
          value={color}
          onChange={(event) => onChange({ color: event.target.value })}
          className="h-8 w-full cursor-pointer rounded-md border bg-background"
        />
      </div>
    </>
  )
}

// Starting values for a brand-new text clip.
const DEFAULT_TEXT_DRAFT = { text: "Your text here", fontSize: 80, color: "#ffffff" }

// Building blocks the editor supports. Tiles with an `action` are wired up;
// the rest are placeholders for future element kinds.
const ELEMENT_TILES: {
  label: string
  icon: LucideIcon
  action?: "text" | "captions" | "script"
}[] = [
  { label: "Text", icon: TypeIcon, action: "text" },
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: VideoIcon },
  { label: "Audio", icon: MusicIcon },
  { label: "Captions", icon: CaptionsIcon, action: "captions" },
  { label: "AI Script", icon: PenLineIcon, action: "script" },
  { label: "Shapes", icon: ShapesIcon },
]

// Default (nothing selected): the element tile grid. Each wired tile opens its
// own dialog; placeholder tiles are disabled.
function DefaultPanels({
  onAddText,
  onAddCaptions,
  onWriteScript,
}: {
  onAddText: () => void
  onAddCaptions: () => void
  onWriteScript: () => void
}) {
  // Maps a tile's action to its handler.
  const actions = {
    text: onAddText,
    captions: onAddCaptions,
    script: onWriteScript,
  }

  // Captions and AI Script are project-only (they call project-scoped server
  // fns); hide those tiles when editing a template.
  const { kind } = useEditor()
  const tiles =
    kind === "template"
      ? ELEMENT_TILES.filter(
          (tile) => tile.action !== "captions" && tile.action !== "script"
        )
      : ELEMENT_TILES

  return (
    <div>
      <h2 className="text-sm font-semibold">Elements</h2>
      <p className="text-xs text-muted-foreground">
        Building blocks for your video.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={tile.action ? actions[tile.action] : undefined}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 text-xs font-medium transition-colors",
              tile.action ? "hover:bg-muted" : "opacity-50"
            )}
            disabled={!tile.action}
          >
            <tile.icon className="size-4 text-muted-foreground" />
            {tile.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Composes a text clip's content/style, then adds it at the playhead. The
// new clip is auto-selected, so closing this dialog drops the user into the
// ClipInspector for further tweaks.
function TextDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, clock } = useEditor()
  const [draft, setDraft] = React.useState(DEFAULT_TEXT_DRAFT)

  // Reset to defaults on close so the dialog starts fresh next open.
  function handleOpenChange(next: boolean) {
    if (!next) setDraft(DEFAULT_TEXT_DRAFT)
    onOpenChange(next)
  }

  function handleAdd() {
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "text",
        name: "Text",
        text: draft.text.trim() || "Your text here",
        fontSize: draft.fontSize,
        color: draft.color,
        trimStartMs: 0,
        startMs: 0, // the reducer resolves the actual placement
        durationMs: DEFAULT_TEXT_DURATION_MS,
      },
      atMs: clock.getTime(),
    })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add Text</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <TextClipFields
              idPrefix="text"
              text={draft.text}
              fontSize={draft.fontSize}
              color={draft.color}
              onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            <TypeIcon className="size-4" />
            Add Text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  // Captions are project-only, so this dialog only mounts in project mode.
  const { dispatch, documentId: projectId, flushSave } = useEditor()
  const [styleId, setStyleId] = React.useState(CAPTION_STYLES[0].id)
  const [provider, setProvider] = React.useState<CaptionProvider>("gemini")
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      // The server transcribes the SAVED timeline's audio source — persist
      // any edits still inside the autosave debounce first.
      await flushSave()
      const result = await generateProjectCaptions(projectId, provider)
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
              <Label htmlFor="caption-model">Model</Label>
              <Select
                value={provider}
                onValueChange={(value) => setProvider(value as CaptionProvider)}
              >
                <SelectTrigger id="caption-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

// Writes a beat-matched script from the source reel's analysis (projects
// created via "Use template" only). The result can be copied or inserted as
// a caption track at the beats' exact timings.
function ScriptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // AI Script is project-only, so this dialog only mounts in project mode.
  const { dispatch, documentId: projectId } = useEditor()
  const [topic, setTopic] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [beats, setBeats] = React.useState<ScriptBeat[] | null>(null)
  const [copied, setCopied] = React.useState(false)

  async function handleGenerate() {
    if (!topic.trim()) {
      setError("Enter a topic first.")
      return
    }
    setGenerating(true)
    setError(null)
    setCopied(false)
    try {
      const result = await writeProjectScript(
        projectId,
        topic.trim(),
        notes.trim() || undefined
      )
      setBeats(result.beats)
    } catch (generateError) {
      setError(getScriptErrorMessage(generateError))
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    if (!beats) return
    const script = beats
      .map((beat) => `[${beat.role}] ${beat.line}`)
      .join("\n\n")
    await navigator.clipboard.writeText(script).catch(() => undefined)
    setCopied(true)
  }

  // Drops the script onto the timeline as a caption track at the beat times.
  function handleAddAsCaptions() {
    if (!beats) return
    dispatch({
      type: "ADD_CAPTION_CLIPS",
      clips: beats.map((beat) => ({
        id: editorId(),
        kind: "text" as const,
        name: "Script",
        text: beat.line,
        fontSize: 64,
        color: "#ffffff",
        trimStartMs: 0,
        startMs: beat.startMs,
        durationMs: beat.endMs - beat.startMs,
      })),
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !generating && onOpenChange(next)}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Write Script</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Writes a new script for your topic that follows the source
              reel&apos;s analyzed beats — same structure, same pacing.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="script-topic">Your topic</Label>
              <Input
                id="script-topic"
                value={topic}
                placeholder="e.g. my coffee shop's new matcha menu"
                onChange={(event) => setTopic(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="script-notes">Notes (optional)</Label>
              <Textarea
                id="script-notes"
                rows={2}
                value={notes}
                placeholder="Anything the script must mention or avoid..."
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            {beats ? (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
                {beats.map((beat, index) => (
                  <div key={index} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {beat.role}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatTimecode(beat.startMs)} –{" "}
                        {formatTimecode(beat.endMs)}
                      </span>
                    </div>
                    <p className="text-sm">{beat.line}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          {beats ? (
            <>
              <Button type="button" variant="outline" onClick={handleCopy}>
                <CopyIcon className="size-4" />
                {copied ? "Copied" : "Copy Script"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PenLineIcon className="size-4" />
                )}
                Rewrite
              </Button>
              <Button type="button" onClick={handleAddAsCaptions}>
                <CaptionsIcon className="size-4" />
                Add as Captions
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={generating}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PenLineIcon className="size-4" />
                )}
                {generating ? "Writing…" : "Generate"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
