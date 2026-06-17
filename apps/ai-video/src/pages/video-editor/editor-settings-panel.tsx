import * as React from "react"
import {
  CaptionsIcon,
  CopyIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  MusicIcon,
  PauseIcon,
  PenLineIcon,
  PlayIcon,
  ShapesIcon,
  TypeIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
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
  generateVoiceover,
  getVoiceErrorMessage,
  listElevenLabsVoices,
  type ElevenLabsVoice,
  type VoiceModelId,
} from "@/lib/api/elevenlabs"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useEditor,
  type EditorClip,
} from "@/pages/video-editor/editor-store"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatTimecode,
} from "@/pages/video-editor/timeline-utils"

// Right panel: a contextual inspector for the selected clip.
export function EditorSettingsPanel({ clip }: { clip: EditorClip }) {
  return (
    <section className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl bg-muted/60">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <ClipInspector clip={clip} />
      </div>
    </section>
  )
}

// The selected clip's controls. Text clips expose the same content/style fields
// the Add Text dialog uses, with edits applied live (transient — no per-keystroke
// undo snapshot). Other kinds just show their name + timeline position (their
// timing is trimmed on the timeline; Duplicate/Delete live on the right-click
// menu). The fields are fully controlled from the store, so changing selection
// just re-renders them with the new clip's values.
function ClipInspector({ clip }: { clip: EditorClip }) {
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
    <div className="space-y-4">
      {/* Header: clip name + its span on the timeline. */}
      <div>
        <h2 className="truncate text-sm font-semibold" title={clip.name}>
          {clip.name}
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatTimecode(clip.startMs)} –{" "}
          {formatTimecode(clip.startMs + clip.durationMs)}
        </p>
      </div>
      {clip.kind === "text" ? (
        <TextClipFields
          idPrefix="inspector"
          text={clip.text ?? ""}
          fontSize={clip.fontSize ?? 80}
          color={clip.color ?? "#ffffff"}
          highlightColor={clip.highlightColor}
          onChange={patch}
        />
      ) : null}
    </div>
  )
}

// Partial style patch emitted by the style controls; TextClipFields also emits
// `text` from the Content field.
type TextStylePatch = {
  fontSize?: number
  color?: string
  highlightColor?: string
}

// The content/size/color fields for a text clip, shared by the "Add Text"
// dialog and the selected-clip inspector. `idPrefix` keeps label ids unique
// across the two mount points.
function TextClipFields({
  idPrefix,
  text,
  fontSize,
  color,
  highlightColor,
  onChange,
}: {
  idPrefix: string
  text: string
  fontSize: number
  color: string
  highlightColor?: string
  onChange: (patch: TextStylePatch & { text?: string }) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-text`}>Content</Label>
        <Textarea
          id={`${idPrefix}-text`}
          rows={1}
          // The base Textarea has min-h-24 (~3 rows); drop the floor so rows=1
          // actually opens at one row. Still draggable/grows as needed.
          className="min-h-0"
          value={text}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </div>
      <TextStyleFields
        idPrefix={idPrefix}
        fontSize={fontSize}
        color={color}
        highlightColor={highlightColor}
        onChange={onChange}
      />
    </>
  )
}

// Font size + text color + optional highlight box. Shared by the Edit/Add Text
// dialogs and the caption generator so caption styling can be tuned up front.
function TextStyleFields({
  idPrefix,
  fontSize,
  color,
  highlightColor,
  onChange,
}: {
  idPrefix: string
  fontSize: number
  color: string
  highlightColor?: string
  onChange: (patch: TextStylePatch) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Font size</Label>
        <Slider
          value={[fontSize]}
          min={8}
          max={240}
          step={2}
          onValueChange={(value) => onChange({ fontSize: value[0] })}
          aria-label="Font size"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-color`}>Text Color</Label>
        <ColorPicker
          id={`${idPrefix}-color`}
          value={color}
          onChange={(value) => onChange({ color: value })}
        />
      </div>
      <div className="space-y-1.5">
        {/* Optional highlight box behind the text. The toggle adds/removes the
            background; the picker sets its color (defaults to white). */}
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-highlight-toggle`}>Highlight</Label>
          <Switch
            id={`${idPrefix}-highlight-toggle`}
            checked={!!highlightColor}
            onCheckedChange={(on) =>
              onChange({ highlightColor: on ? highlightColor || "#ffffff" : undefined })
            }
            aria-label="Toggle highlight background"
          />
        </div>
        {highlightColor ? (
          <ColorPicker
            id={`${idPrefix}-highlight`}
            value={highlightColor}
            onChange={(value) => onChange({ highlightColor: value })}
            aria-label="Highlight color"
          />
        ) : null}
      </div>
    </>
  )
}

// Starting values for a brand-new text clip.
const DEFAULT_TEXT_DRAFT: {
  text: string
  fontSize: number
  color: string
  highlightColor?: string
} = {
  // Matches the default "Boxed" caption look: dark text on a white box.
  text: "Your text here",
  fontSize: 20,
  color: "#000000",
  highlightColor: "#ffffff",
}

// Building blocks the editor supports. Tiles with an `action` are wired up;
// the rest are placeholders for future element kinds.
const ELEMENT_TILES: {
  label: string
  icon: LucideIcon
  action?: "text" | "captions" | "script" | "voice"
}[] = [
  { label: "Text", icon: TypeIcon, action: "text" },
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: VideoIcon },
  { label: "Audio", icon: MusicIcon },
  { label: "Captions", icon: CaptionsIcon, action: "captions" },
  { label: "Voice", icon: MicIcon, action: "voice" },
  { label: "AI Script", icon: PenLineIcon, action: "script" },
  { label: "Shapes", icon: ShapesIcon },
]

// The Elements tab (left panel): the building-block tile grid plus the Add /
// generate dialogs each wired tile opens. Placeholder tiles are disabled.
export function ElementsPanel() {
  const [textOpen, setTextOpen] = React.useState(false)
  const [captionsOpen, setCaptionsOpen] = React.useState(false)
  const [voiceOpen, setVoiceOpen] = React.useState(false)
  const [scriptOpen, setScriptOpen] = React.useState(false)

  // Maps a tile's action to its dialog opener.
  const actions = {
    text: () => setTextOpen(true),
    captions: () => setCaptionsOpen(true),
    voice: () => setVoiceOpen(true),
    script: () => setScriptOpen(true),
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

      <TextDialog open={textOpen} onOpenChange={setTextOpen} />
      <CaptionsDialog open={captionsOpen} onOpenChange={setCaptionsOpen} />
      <VoiceDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
      <ScriptDialog open={scriptOpen} onOpenChange={setScriptOpen} />
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
        highlightColor: draft.highlightColor,
        // Lower-third by default, like captions (draggable afterwards).
        y: 0.78,
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
              highlightColor={draft.highlightColor}
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

// Caption style presets applied at insert time — caption lines are ordinary
// text clips afterwards. `y` places them in the lower third (reel convention);
// `highlightColor` adds the background box. The default ("Boxed") matches the
// burnt-in reel look: dark text on a white box, with karaoke dimming upcoming
// words to gray on the box.
const CAPTION_STYLES: {
  id: string
  label: string
  fontSize: number
  color: string
  highlightColor?: string
  y: number
}[] = [
  {
    id: "boxed",
    label: "Boxed",
    fontSize: 20,
    color: "#000000",
    highlightColor: "#ffffff",
    y: 0.78,
  },
  { id: "white", label: "White", fontSize: 64, color: "#ffffff", y: 0.78 },
  { id: "bold", label: "Big Bold", fontSize: 96, color: "#ffffff", y: 0.78 },
  { id: "yellow", label: "Yellow Pop", fontSize: 72, color: "#facc15", y: 0.78 },
]

// Caption style state shared by the Captions and Voice dialogs: the selected
// preset plus the editable font size / color / highlight. `y` (lower-third
// position) stays per-preset and isn't user-editable.
function useCaptionStyle() {
  const [styleId, setStyleId] = React.useState(CAPTION_STYLES[0].id)
  const [fontSize, setFontSize] = React.useState(CAPTION_STYLES[0].fontSize)
  const [color, setColor] = React.useState(CAPTION_STYLES[0].color)
  const [highlightColor, setHighlightColor] = React.useState<
    string | undefined
  >(CAPTION_STYLES[0].highlightColor)

  // Picking a preset refills the editable controls.
  function applyPreset(id: string) {
    const preset = CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0]
    setStyleId(id)
    setFontSize(preset.fontSize)
    setColor(preset.color)
    setHighlightColor(preset.highlightColor)
  }

  // Applies a single edit from the TextStyleFields controls.
  function patch(value: TextStylePatch) {
    if (value.fontSize !== undefined) setFontSize(value.fontSize)
    if (value.color !== undefined) setColor(value.color)
    if ("highlightColor" in value) setHighlightColor(value.highlightColor)
  }

  // Position is fixed per preset (not user-editable) — read it for the clip.
  const y = (CAPTION_STYLES.find((s) => s.id === styleId) ?? CAPTION_STYLES[0]).y

  return { styleId, fontSize, color, highlightColor, y, applyPreset, patch }
}

// The caption style preset picker + adjustable font/color/highlight controls,
// driven by useCaptionStyle. `idPrefix` keeps label ids unique across dialogs.
function CaptionStyleFields({
  idPrefix,
  style,
}: {
  idPrefix: string
  style: ReturnType<typeof useCaptionStyle>
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-style`}>Style</Label>
        <Select value={style.styleId} onValueChange={style.applyPreset}>
          <SelectTrigger id={`${idPrefix}-style`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAPTION_STYLES.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextStyleFields
        idPrefix={idPrefix}
        fontSize={style.fontSize}
        color={style.color}
        highlightColor={style.highlightColor}
        onChange={style.patch}
      />
    </>
  )
}

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
  const captionStyle = useCaptionStyle()
  // Default to OpenAI: it returns per-word timestamps, which the karaoke
  // (two-color, word-by-word) captions need. Gemini is line-level only.
  const [provider, setProvider] = React.useState<CaptionProvider>("openai")
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
      dispatch({
        type: "ADD_CAPTION_CLIPS",
        clips: result.captions.map((line) => ({
          id: editorId(),
          kind: "text" as const,
          name: "Caption",
          text: line.text,
          // Per-word timings (OpenAI captions) enable the karaoke highlight.
          words: line.words,
          // Editable style from the shared controls; position stays per-preset.
          fontSize: captionStyle.fontSize,
          color: captionStyle.color,
          highlightColor: captionStyle.highlightColor,
          y: captionStyle.y,
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
            {/* Style preset + adjustable styling (shared with the Voice dialog). */}
            <CaptionStyleFields idPrefix="caption" style={captionStyle} />
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

// ElevenLabs TTS models offered in the Voice dialog (id → label). All return
// the word-level timestamps the karaoke captions need.
const VOICE_MODELS: { id: VoiceModelId; label: string }[] = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5" },
]

// Generates an ElevenLabs voiceover, drops the audio at the playhead, and —
// when "Add captions" is on — a synced karaoke caption track built from the
// voice's word timings (reusing the same text-clip styling as the Captions
// feature). Voiceovers have no project dependency, so this works in both
// project and template editing.
function VoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, clock } = useEditor()
  // Voice list loaded from ElevenLabs when the dialog opens (null = loading).
  const [voices, setVoices] = React.useState<ElevenLabsVoice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>(VOICE_MODELS[0].id)
  const [text, setText] = React.useState("")
  // Captions on by default — the point is a synced, captioned voiceover.
  const [addCaptions, setAddCaptions] = React.useState(true)
  // Caption style (shared controls/state with the Captions dialog).
  const captionStyle = useCaptionStyle()
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null)
  const [previewing, setPreviewing] = React.useState(false)
  const selectedVoice = voices?.find((voice) => voice.id === voiceId) ?? null
  const previewUrl = selectedVoice?.previewUrl || ""

  const stopPreview = React.useCallback(() => {
    const audio = previewAudioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      previewAudioRef.current = null
    }
    setPreviewing(false)
  }, [])

  // Load voices each time the dialog opens. A missing key surfaces as the
  // "not configured" message (which hides the form and disables Generate). All
  // state updates happen in the async callbacks (never synchronously in the
  // effect body) to avoid cascading renders.
  React.useEffect(() => {
    if (!open) return
    let active = true
    listElevenLabsVoices()
      .then((result) => {
        if (!active) return
        setVoices(result.voices)
        setVoiceId((prev) => prev || result.voices[0]?.id || "")
        setError(null)
      })
      .catch((loadError) => active && setError(getVoiceErrorMessage(loadError)))
    return () => {
      active = false
    }
  }, [open])

  React.useEffect(() => stopPreview, [stopPreview])

  // Clears the text on close so the dialog reopens fresh (keeps voice/model).
  function handleClose(next: boolean) {
    if (!next) {
      stopPreview()
      setText("")
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleGenerate() {
    if (!voiceId || !text.trim()) {
      setError("Pick a voice and enter some text.")
      return
    }
    setGenerating(true)
    setError(null)
    stopPreview()
    try {
      const result = await generateVoiceover({
        voiceId,
        text: text.trim(),
        modelId,
      })
      // Anchor the audio and its captions to the same playhead so they stay in
      // sync: ADD_CLIP places the audio at exactly atMs, and each caption's
      // clip-relative start is shifted by that same atMs.
      const atMs = clock.getTime()
      dispatch({
        type: "ADD_CLIP",
        clip: {
          id: editorId(),
          kind: "audio",
          name: result.media.original_name,
          mediaId: result.media.id,
          url: result.media.url,
          sourceDurationMs: result.durationMs,
          trimStartMs: 0,
          startMs: 0, // the reducer resolves the actual placement
          durationMs: result.durationMs,
        },
        atMs,
      })
      if (addCaptions && result.captions.length > 0) {
        dispatch({
          type: "ADD_CAPTION_CLIPS",
          clips: result.captions.map((line) => ({
            id: editorId(),
            kind: "text" as const,
            name: "Caption",
            text: line.text,
            // Per-word timings drive the karaoke highlight.
            words: line.words,
            fontSize: captionStyle.fontSize,
            color: captionStyle.color,
            highlightColor: captionStyle.highlightColor,
            y: captionStyle.y,
            trimStartMs: 0,
            // Shift into timeline time so captions line up with the audio.
            startMs: atMs + line.startMs,
            durationMs: line.endMs - line.startMs,
          })),
        })
      }
      handleClose(false)
    } catch (generateError) {
      setError(getVoiceErrorMessage(generateError))
    } finally {
      setGenerating(false)
    }
  }

  function handlePreview() {
    if (previewing) {
      stopPreview()
      return
    }
    if (!previewUrl) return

    stopPreview()
    const audio = new Audio(previewUrl)
    previewAudioRef.current = audio
    audio.addEventListener("ended", stopPreview, { once: true })
    audio.addEventListener("error", stopPreview, { once: true })
    setPreviewing(true)
    void audio.play().catch(stopPreview)
  }

  // True when the voice load failed because no key is configured — show a
  // helpful message instead of the form.
  const notConfigured = error === "ElevenLabs is not configured"
  const previewLabel = previewUrl
    ? previewing
      ? "Stop preview"
      : "Preview voice"
    : "No preview available"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !generating && handleClose(next)}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add Voice</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {notConfigured ? (
              <p className="text-sm text-muted-foreground">
                ElevenLabs isn&apos;t configured yet. Add an ElevenLabs API key
                in Settings → AI Providers to generate voiceovers.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-voice">Voice</Label>
                  <div className="flex gap-2">
                    <Select
                      value={voiceId}
                      onValueChange={(value) => {
                        stopPreview()
                        setVoiceId(value)
                      }}
                      disabled={!voices || voices.length === 0}
                    >
                      <SelectTrigger
                        id="voice-voice"
                        className="min-w-0 flex-1"
                      >
                        <SelectValue
                          placeholder={voices ? "Select a voice" : "Loading…"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(voices ?? []).map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label={previewLabel}
                          disabled={!previewUrl}
                          onClick={handlePreview}
                        >
                          {previewing ? (
                            <PauseIcon className="size-4" />
                          ) : (
                            <PlayIcon className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{previewLabel}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-model">Model</Label>
                  <Select
                    value={modelId}
                    onValueChange={(value) => setModelId(value as VoiceModelId)}
                  >
                    <SelectTrigger id="voice-model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-text">Text</Label>
                  <Textarea
                    id="voice-text"
                    rows={3}
                    value={text}
                    placeholder="What should the voice say?"
                    onChange={(event) => setText(event.target.value)}
                  />
                </div>
                {/* Optional synced captions, styled with the same caption UI. */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="voice-captions-toggle">Add captions</Label>
                  <Switch
                    id="voice-captions-toggle"
                    checked={addCaptions}
                    onCheckedChange={setAddCaptions}
                    aria-label="Add synced captions"
                  />
                </div>
                {addCaptions ? (
                  <CaptionStyleFields idPrefix="voice" style={captionStyle} />
                ) : null}
              </>
            )}
            {error && !notConfigured ? (
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
            onClick={() => handleClose(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={generating || notConfigured || !voiceId || !text.trim()}
            onClick={handleGenerate}
          >
            {generating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <MicIcon className="size-4" />
            )}
            {generating ? "Generating…" : "Generate"}
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
