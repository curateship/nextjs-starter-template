import * as React from "react"
import {
  CaptionsIcon,
  CopyIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  MusicIcon,
  PauseIcon,
  PenLineIcon,
  PlayIcon,
  RefreshCwIcon,
  ScissorsIcon,
  ShapesIcon,
  SparklesIcon,
  SplitIcon,
  Trash2Icon,
  TypeIcon,
  VideoIcon,
  Volume2Icon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ColorPicker } from "@/components/ui/color-picker"
import { FirstFrameCreateDialog } from "@/components/first-frame-create-dialog"
import { useShellRuntime } from "@/components/shell-runtime"
import { TextFontSelect } from "@/components/text-font-select"
import { cn } from "@/lib/utils"
import type { BrandKitColor, BrandKitConfig } from "@/lib/ai-video"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getFirstFrameErrorMessage,
  listFirstFrames,
  type FirstFrameAspectRatio,
  type FirstFrameItem,
} from "@/lib/api/first-frames"
import {
  getActorErrorMessage,
  listActors,
  type ActorItem,
} from "@/lib/api/actors"
import {
  createAiVideoGeneration,
  getAiVideoGeneration,
  getAiVideoGenerationErrorMessage,
  getLatestAiVideoGeneration,
  type AiVideoDurationSeconds,
  type AiVideoGenerationItem,
} from "@/lib/api/ai-video-generations"
import {
  generateProjectCaptions,
  getCaptionErrorMessage,
  type CaptionProvider,
} from "@/lib/api/captions"
import {
  generateVoiceover,
  getVoiceGenerationErrorMessage,
  getVoiceLoadErrorMessage,
  listElevenLabsVoices,
  saveVoiceDefaults,
  type ElevenLabsVoice,
  type VoiceoverResult,
} from "@/lib/api/elevenlabs"
import {
  createDefaultVoiceSettings,
  pickVoiceSettings,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  type VoiceDefaults,
  type VoiceModelId,
  type VoiceSettings,
} from "@/lib/voice-settings"
import { SOUND_EFFECTS, soundEffectUrl } from "@/lib/sound-effects"
import {
  DEFAULT_TEXT_FONT_ID,
  requireTextFont,
  type TextFontId,
} from "@/lib/text-fonts"
import {
  getBriefErrorMessage,
  getScriptErrorMessage,
  writeProjectBrief,
  writeProjectScript,
  type ProjectReelBriefResult,
  type ScriptBeat,
} from "@/lib/api/script-writer"
import {
  analyzeJumpCuts,
  getJumpCutErrorMessage,
  type JumpCutSensitivity,
  type JumpCutSuggestion,
} from "@/lib/api/jump-cuts"
import {
  getHookRewriteErrorMessage,
  rewriteHookLines,
} from "@/lib/api/hook-variants"
import {
  detectHook,
  hookWordBudget,
  type HookDetection,
} from "@/lib/hook-variants"
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
  findClip,
  useEditor,
  type EditorClip,
} from "@/pages/video-editor/editor-store"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatTimecode,
  loadMediaDurationMs,
} from "@/pages/video-editor/timeline-utils"
import { useAudioPreview } from "@/pages/video-editor/use-audio-preview"

// Right panel: a contextual inspector for the selected clip.
export function EditorSettingsPanel({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditor()

  return (
    <section className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl bg-muted/60">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-4">
          <div>
            <h2 className="truncate text-sm font-semibold" title={clip.name}>
              {clip.name}
            </h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatTimecode(clip.startMs)} –{" "}
              {formatTimecode(clip.startMs + clip.durationMs)}
            </p>
          </div>
          <TextClipSettings clip={clip} />
          {clip.soundEffectId ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => dispatch({ type: "DELETE_CLIP", clipId: clip.id })}
            >
              <Trash2Icon className="size-4" />
              Remove Sound Effect
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

// Text clip controls shared by the standalone editor inspector and the
// template slot inspector.
export function TextClipSettings({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditor()
  const { config } = useShellRuntime()

  if (clip.kind !== "text") return null

  function patch(value: Partial<EditorClip>) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: value,
      transient: true,
    })
  }

  return (
    <TextClipFields
      idPrefix="inspector"
      layout="card"
      text={clip.text ?? ""}
      fontId={requireTextFont(clip.fontId).id}
      fontSize={clip.fontSize ?? 80}
      color={clip.color ?? "#ffffff"}
      highlightColor={clip.highlightColor}
      onChange={patch}
      swatches={config.brandKit.colors}
    />
  )
}

// Partial style patch emitted by the style controls; TextClipFields also emits
// `text` from the Content field.
type TextStylePatch = {
  fontId?: TextFontId
  fontSize?: number
  color?: string
  highlightColor?: string
}
type TextFieldLayout = "plain" | "card"

function textFieldClassName(layout: TextFieldLayout) {
  return cn(
    "space-y-1.5",
    layout === "card" && "rounded-md border bg-background p-3"
  )
}

// The content/size/color fields for a text clip, shared by the "Add Text"
// dialog and the selected-clip inspector. `idPrefix` keeps label ids unique
// across the two mount points.
function TextClipFields({
  idPrefix,
  text,
  fontId,
  fontSize,
  color,
  highlightColor,
  onChange,
  layout = "plain",
  swatches,
}: {
  idPrefix: string
  text: string
  fontId: TextFontId
  fontSize: number
  color: string
  highlightColor?: string
  onChange: (patch: TextStylePatch & { text?: string }) => void
  layout?: TextFieldLayout
  swatches?: BrandKitColor[]
}) {
  return (
    <>
      <div className={textFieldClassName(layout)}>
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
        fontId={fontId}
        fontSize={fontSize}
        color={color}
        highlightColor={highlightColor}
        onChange={onChange}
        layout={layout}
        swatches={swatches}
      />
    </>
  )
}

// Font size + text color + optional highlight box. Shared by the Edit/Add Text
// dialogs and the caption generator so caption styling can be tuned up front.
function TextStyleFields({
  idPrefix,
  fontId,
  fontSize,
  color,
  highlightColor,
  onChange,
  layout = "plain",
  swatches,
}: {
  idPrefix: string
  fontId: TextFontId
  fontSize: number
  color: string
  highlightColor?: string
  onChange: (patch: TextStylePatch) => void
  layout?: TextFieldLayout
  swatches?: BrandKitColor[]
}) {
  return (
    <>
      <div className={textFieldClassName(layout)}>
        <Label htmlFor={`${idPrefix}-font`}>Font</Label>
        <TextFontSelect
          id={`${idPrefix}-font`}
          value={fontId}
          triggerClassName="w-full"
          onChange={(value) => onChange({ fontId: value })}
        />
      </div>
      <div className={textFieldClassName(layout)}>
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
      <div className={textFieldClassName(layout)}>
        <Label htmlFor={`${idPrefix}-color`}>Text Color</Label>
        <ColorPicker
          id={`${idPrefix}-color`}
          value={color}
          onChange={(value) => onChange({ color: value })}
          swatches={swatches}
        />
      </div>
      <div className={textFieldClassName(layout)}>
        {/* Optional highlight box behind the text. The toggle adds/removes the
            background; the picker sets its color (defaults to white). */}
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-highlight-toggle`}>Highlight</Label>
          <Switch
            id={`${idPrefix}-highlight-toggle`}
            checked={!!highlightColor}
            onCheckedChange={(on) =>
              onChange({
                highlightColor: on ? highlightColor || "#ffffff" : undefined,
              })
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
            swatches={swatches}
          />
        ) : null}
      </div>
    </>
  )
}

// Starting values for a brand-new text clip.
type TextDraft = {
  text: string
  fontId: TextFontId
  fontSize: number
  color: string
  highlightColor?: string
}

function brandColor(brandKit: BrandKitConfig, name: string, fallback: string) {
  return (
    brandKit.colors.find(
      (color) => color.name.toLowerCase() === name.toLowerCase()
    )?.value ?? fallback
  )
}

function defaultTextDraft(brandKit: BrandKitConfig): TextDraft {
  return {
    text: "Your text here",
    fontId: brandKit.fonts.body,
    fontSize: 20,
    color: brandColor(brandKit, "Primary", "#000000"),
  }
}

function captionStyleFromBrandKit(brandKit: BrandKitConfig) {
  return {
    fontId: brandKit.captionStyle.fontId,
    fontSize: brandKit.captionStyle.fontSize,
    color: brandKit.captionStyle.color,
    highlightColor: brandKit.captionStyle.highlightColor ?? undefined,
    y: 0.78,
  }
}

// Building blocks the editor supports. Tiles with an `action` are wired up;
// the rest are placeholders for future element kinds.
type ElementTileAction =
  | "text"
  | "captions"
  | "script"
  | "voice"
  | "sound-effect"
  | "ai-video"
  | "brief"
  | "jump-cut"
  | "hook"

const PROJECT_ONLY_TILE_ACTIONS = new Set<ElementTileAction>([
  "captions",
  "script",
  "brief",
  "ai-video",
  "jump-cut",
])

type EditorTile = {
  label: string
  icon: LucideIcon
  action?: ElementTileAction
}

const ELEMENT_TILES: EditorTile[] = [
  { label: "Text", icon: TypeIcon, action: "text" },
  { label: "Sound Effect", icon: Volume2Icon, action: "sound-effect" },
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: VideoIcon },
  { label: "Audio", icon: MusicIcon },
  { label: "Shapes", icon: ShapesIcon },
]

const AI_TILES: EditorTile[] = [
  { label: "Captions", icon: CaptionsIcon, action: "captions" },
  { label: "Voice", icon: MicIcon, action: "voice" },
  { label: "Hook", icon: SplitIcon, action: "hook" },
  { label: "Jump Cut", icon: ScissorsIcon, action: "jump-cut" },
  { label: "Brief to Reel", icon: FileTextIcon, action: "brief" },
  { label: "AI Video", icon: SparklesIcon, action: "ai-video" },
  { label: "AI Script", icon: PenLineIcon, action: "script" },
]

export function ElementsPanel() {
  return (
    <EditorToolTilesPanel
      title="Elements"
      description="Building blocks for your video."
      tiles={ELEMENT_TILES}
    />
  )
}

export function AiPanel() {
  return (
    <EditorToolTilesPanel
      title="Ai"
      description="AI tools for captions, voice, scripts, and video."
      tiles={AI_TILES}
    />
  )
}

// Left-panel tile grid plus the Add / generate dialogs each wired tile opens.
// Placeholder tiles are disabled.
function EditorToolTilesPanel({
  title,
  description,
  tiles: panelTiles,
}: {
  title: string
  description: string
  tiles: EditorTile[]
}) {
  const [textOpen, setTextOpen] = React.useState(false)
  const [captionsOpen, setCaptionsOpen] = React.useState(false)
  const [voiceOpen, setVoiceOpen] = React.useState(false)
  const [scriptOpen, setScriptOpen] = React.useState(false)
  const [briefOpen, setBriefOpen] = React.useState(false)
  const [soundEffectOpen, setSoundEffectOpen] = React.useState(false)
  const [aiVideoOpen, setAiVideoOpen] = React.useState(false)
  const [jumpCutOpen, setJumpCutOpen] = React.useState(false)
  const [hookOpen, setHookOpen] = React.useState(false)

  const actions: Record<ElementTileAction, () => void> = {
    text: () => setTextOpen(true),
    captions: () => setCaptionsOpen(true),
    voice: () => setVoiceOpen(true),
    script: () => setScriptOpen(true),
    brief: () => setBriefOpen(true),
    "sound-effect": () => setSoundEffectOpen(true),
    "ai-video": () => setAiVideoOpen(true),
    "jump-cut": () => setJumpCutOpen(true),
    hook: () => setHookOpen(true),
  }

  // Project-scoped generation tiles call project-only server fns, so hide them
  // when editing a template.
  const { kind, mode } = useEditor()
  const tiles =
    kind === "template"
      ? panelTiles.filter(
          (tile) => !tile.action || !PROJECT_ONLY_TILE_ACTIONS.has(tile.action)
        )
      : panelTiles

  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const unavailable =
            tile.action === "brief" && mode !== "fill-template"
              ? "Template project only"
              : null
          return (
            <button
              key={tile.label}
              type="button"
              onClick={
                tile.action && !unavailable ? actions[tile.action] : undefined
              }
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-background p-3 text-center text-xs font-medium transition-colors",
                tile.action && !unavailable ? "hover:bg-muted" : "opacity-50"
              )}
              disabled={!tile.action || !!unavailable}
              title={unavailable ?? undefined}
            >
              <tile.icon className="size-4 text-muted-foreground" />
              <span>{tile.label}</span>
              {unavailable ? (
                <span className="text-[10px] font-normal text-muted-foreground">
                  Template only
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <TextDialog open={textOpen} onOpenChange={setTextOpen} />
      <CaptionsDialog open={captionsOpen} onOpenChange={setCaptionsOpen} />
      <VoiceDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
      <HookDialog open={hookOpen} onOpenChange={setHookOpen} />
      <BriefToReelDialog open={briefOpen} onOpenChange={setBriefOpen} />
      <ScriptDialog open={scriptOpen} onOpenChange={setScriptOpen} />
      <JumpCutDialog open={jumpCutOpen} onOpenChange={setJumpCutOpen} />
      <SoundEffectDialog
        open={soundEffectOpen}
        onOpenChange={setSoundEffectOpen}
      />
      <AiVideoDialog open={aiVideoOpen} onOpenChange={setAiVideoOpen} />
    </div>
  )
}

// Composes a text clip's content/style, then adds it at the playhead. The
// new clip is auto-selected, so closing this dialog drops the user into the
// text settings inspector for further tweaks.
function TextDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, clock } = useEditor()
  const { config } = useShellRuntime()
  const [draft, setDraft] = React.useState(() =>
    defaultTextDraft(config.brandKit)
  )

  // Reset to defaults on close so the dialog starts fresh next open.
  function handleOpenChange(next: boolean) {
    if (!next) setDraft(defaultTextDraft(config.brandKit))
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
        fontId: draft.fontId,
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
              fontId={draft.fontId}
              fontSize={draft.fontSize}
              color={draft.color}
              highlightColor={draft.highlightColor}
              onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
              swatches={config.brandKit.colors}
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

function SoundEffectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, clock, kind } = useEditor()
  const { previewingId, stopPreview, togglePreview } = useAudioPreview()

  function handleOpenChange(next: boolean) {
    if (!next) stopPreview()
    onOpenChange(next)
  }

  function handlePreview(effect: (typeof SOUND_EFFECTS)[number]) {
    togglePreview(effect.id, soundEffectUrl(effect.fileName))
  }

  function handleAdd(effect: (typeof SOUND_EFFECTS)[number]) {
    stopPreview()
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "audio",
        name: effect.label,
        url: soundEffectUrl(effect.fileName),
        soundEffectId: effect.id,
        sourceDurationMs: effect.durationMs,
        trimStartMs: 0,
        startMs: 0,
        durationMs: effect.durationMs,
        replaceable: kind === "template" ? true : undefined,
        segmentLabel: kind === "template" ? effect.label : undefined,
      },
      atMs: clock.getTime(),
    })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add Sound Effect</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-2">
            {SOUND_EFFECTS.map((effect) => {
              const previewing = previewingId === effect.id
              return (
                <div
                  key={effect.id}
                  className="flex items-center gap-3 rounded-md border bg-background p-3"
                >
                  <Volume2Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {effect.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(effect.durationMs / 10) / 100}s
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(effect)}
                  >
                    {previewing ? (
                      <PauseIcon className="size-4" />
                    ) : (
                      <PlayIcon className="size-4" />
                    )}
                    {previewing ? "Stop" : "Preview"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAdd(effect)}
                  >
                    Add
                  </Button>
                </div>
              )
            })}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type JumpCutApplyMode = "review" | "auto"

const JUMP_CUT_SENSITIVITY_OPTIONS: {
  value: JumpCutSensitivity
  label: string
}[] = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "tight", label: "Tight" },
]

const JUMP_CUT_APPLY_MODE_OPTIONS: {
  value: JumpCutApplyMode
  label: string
}[] = [
  { value: "review", label: "Review first" },
  { value: "auto", label: "Auto cut dead air" },
]

function JumpCutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch, clock, documentId, flushSave } = useEditor()
  const [sensitivity, setSensitivity] =
    React.useState<JumpCutSensitivity>("balanced")
  const [applyMode, setApplyMode] = React.useState<JumpCutApplyMode>("review")
  const [suggestions, setSuggestions] = React.useState<JumpCutSuggestion[]>([])
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [analyzing, setAnalyzing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = React.useState(false)
  const [applied, setApplied] = React.useState<{
    count: number
    removedMs: number
  } | null>(null)

  const selectedClip =
    state.selectedClipId !== null
      ? (findClip(state.tracks, state.selectedClipId)?.clip ?? null)
      : null
  const selectedSuggestions = suggestions.filter((suggestion) =>
    selectedIds.has(suggestion.id)
  )
  const totalRemovedMs = totalJumpCutRemovedMs(selectedSuggestions)
  const hasReviewSuggestions = suggestions.length > 0 && applyMode === "review"
  const analyzeButtonText = applyMode === "auto" ? "Auto Cut" : "Analyze"

  function clearAnalysisResults() {
    setSuggestions([])
    setSelectedIds(new Set())
    setError(null)
    setHasAnalyzed(false)
    setApplied(null)
  }

  function reset() {
    setSensitivity("balanced")
    setApplyMode("review")
    setAnalyzing(false)
    clearAnalysisResults()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function applySuggestions(items: JumpCutSuggestion[]) {
    if (!selectedClip || !items.length) return
    dispatch({
      type: "APPLY_JUMP_CUTS",
      clipId: selectedClip.id,
      removals: items.map((suggestion) => ({
        clipStartMs: suggestion.clipStartMs,
        clipEndMs: suggestion.clipEndMs,
      })),
      rippleClipIds: [],
    })
    setApplied({
      count: items.length,
      removedMs: totalJumpCutRemovedMs(items),
    })
    setSuggestions([])
    setSelectedIds(new Set())
  }

  async function handleAnalyze() {
    if (!isJumpCutSelection(selectedClip)) {
      setError("Select a video or audio clip first")
      return
    }

    setAnalyzing(true)
    clearAnalysisResults()

    try {
      await flushSave()
      const result = await analyzeJumpCuts({
        projectId: documentId,
        clipId: selectedClip.id,
        sensitivity,
      })
      setHasAnalyzed(true)
      if (applyMode === "auto") {
        applySuggestions(result.suggestions)
        return
      }
      setSuggestions(result.suggestions)
      setSelectedIds(
        new Set(result.suggestions.map((suggestion) => suggestion.id))
      )
    } catch (analyzeError) {
      setError(getJumpCutErrorMessage(analyzeError))
    } finally {
      setAnalyzing(false)
    }
  }

  function toggleSuggestion(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function previewSuggestion(suggestion: JumpCutSuggestion) {
    clock.pause()
    clock.seek(suggestion.timelineStartMs)
  }

  const emptyAfterAnalyze =
    hasAnalyzed && !analyzing && !suggestions.length && !applied && !error

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>AI Jump Cut</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-3">
              <div className="text-sm font-medium">
                {selectedClip ? selectedClip.name : "No clip selected"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedClip
                  ? `${selectedClip.kind} · ${formatTimecode(selectedClip.durationMs)}`
                  : "Select a video or audio clip."}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="jump-cut-sensitivity">Sensitivity</Label>
                <Select
                  value={sensitivity}
                  onValueChange={(value) =>
                    setSensitivity(value as JumpCutSensitivity)
                  }
                >
                  <SelectTrigger id="jump-cut-sensitivity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JUMP_CUT_SENSITIVITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jump-cut-mode">Mode</Label>
                <Select
                  value={applyMode}
                  onValueChange={(value) =>
                    setApplyMode(value as JumpCutApplyMode)
                  }
                >
                  <SelectTrigger id="jump-cut-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JUMP_CUT_APPLY_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {applied ? (
              <div className="rounded-md border bg-background p-3 text-sm">
                <div className="font-medium">Applied {applied.count} cuts</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Removed {formatDurationShort(applied.removedMs)}. Undo is
                  available from the editor toolbar.
                </div>
              </div>
            ) : null}

            {emptyAfterAnalyze ? (
              <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                No removable dead air found.
              </div>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex gap-3 rounded-md border bg-background p-3"
                  >
                    <Checkbox
                      checked={selectedIds.has(suggestion.id)}
                      onCheckedChange={(checked) =>
                        toggleSuggestion(suggestion.id, checked === true)
                      }
                      aria-label={`Select cut at ${formatTimecode(
                        suggestion.timelineStartMs
                      )}`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatTimecode(suggestion.timelineStartMs)} -{" "}
                          {formatTimecode(suggestion.timelineEndMs)}
                        </span>
                        <Badge variant="outline">{suggestion.reason}</Badge>
                        <Badge variant="secondary">
                          {formatDurationShort(suggestion.removedDurationMs)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {suggestion.confidence} confidence
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => previewSuggestion(suggestion)}
                    >
                      <PlayIcon className="size-4" />
                      Preview
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
          {hasReviewSuggestions ? (
            <Button
              type="button"
              disabled={selectedSuggestions.length === 0}
              onClick={() => applySuggestions(selectedSuggestions)}
            >
              <ScissorsIcon className="size-4" />
              Apply {selectedSuggestions.length}
              {totalRemovedMs
                ? ` · ${formatDurationShort(totalRemovedMs)}`
                : ""}
            </Button>
          ) : (
            <Button type="button" disabled={analyzing} onClick={handleAnalyze}>
              {analyzing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ScissorsIcon className="size-4" />
              )}
              {analyzeButtonText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isJumpCutSelection(
  clip: EditorClip | null
): clip is EditorClip & { mediaId: string } {
  return (
    !!clip?.mediaId &&
    (clip.kind === "video" || clip.kind === "audio")
  )
}

function totalJumpCutRemovedMs(suggestions: JumpCutSuggestion[]) {
  return suggestions.reduce(
    (sum, suggestion) => sum + suggestion.removedDurationMs,
    0
  )
}

function formatDurationShort(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(2)}s`
}

type AiVideoStep = "frame" | "motion" | "review"

const AI_VIDEO_DURATIONS: AiVideoDurationSeconds[] = [4, 6, 8]
const AI_VIDEO_ASPECTS: FirstFrameAspectRatio[] = ["9:16", "16:9"]

function AiVideoDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch, clock, documentId } = useEditor()
  const projectAspect = getAiVideoProjectAspect(state.aspect)
  const [step, setStep] = React.useState<AiVideoStep>("frame")
  const [firstFrames, setFirstFrames] = React.useState<FirstFrameItem[]>([])
  const [actors, setActors] = React.useState<ActorItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [selectedFrameId, setSelectedFrameId] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [motionPrompt, setMotionPrompt] = React.useState("")
  const [durationSeconds, setDurationSeconds] =
    React.useState<AiVideoDurationSeconds>(4)
  const [generation, setGeneration] =
    React.useState<AiVideoGenerationItem | null>(null)
  const [generationError, setGenerationError] = React.useState<string | null>(
    null
  )
  const [startingGeneration, setStartingGeneration] = React.useState(false)
  const [inserting, setInserting] = React.useState(false)
  const ignoreCreateDialogCloseRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) return
    let active = true

    Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoading(true)
        setLoadError(null)
        return Promise.all([
          listFirstFrames(),
          listActors(),
          getLatestAiVideoGeneration(documentId),
        ])
      })
      .then((result) => {
        if (!result) return
        const [frameData, actorData, latest] = result
        if (!active) return
        setFirstFrames(frameData.firstFrames)
        setActors(actorData.actors)
        setGeneration(latest)
        if (isAiVideoReviewStepGeneration(latest)) {
          setStep("review")
        }
        setSelectedFrameId(
          (current) =>
            current || defaultFirstFrameId(frameData.firstFrames, projectAspect)
        )
      })
      .catch((error) => {
        if (!active) return
        setLoadError(
          getFirstFrameErrorMessage(error) ||
            getActorErrorMessage(error) ||
            getAiVideoGenerationErrorMessage(error)
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [documentId, open, projectAspect])

  React.useEffect(() => {
    if (!open || !isAiVideoActiveGeneration(generation)) return
    const timer = window.setInterval(() => {
      getAiVideoGeneration(generation.id)
        .then(setGeneration)
        .catch((error) =>
          setGenerationError(getAiVideoGenerationErrorMessage(error))
        )
    }, 4_000)
    return () => window.clearInterval(timer)
  }, [generation, open])

  const actorOptions = React.useMemo(
    () => actors.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [actors]
  )
  const createInitialValues = React.useMemo(
    () => ({
      aspectRatio: projectAspect,
      referenceSource: "actor" as const,
    }),
    [projectAspect]
  )
  const selectedFrame =
    firstFrames.find((frame) => frame.id === selectedFrameId) ?? null
  const visibleFrames = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return firstFrames
      .filter((frame) => {
        if (!query) return true
        return `${frame.name} ${frame.actor.name} ${frame.tags.join(" ")}`
          .toLowerCase()
          .includes(query)
      })
      .sort((a, b) => {
        const aSupported = isAiVideoFirstFrameSupported(a)
        const bSupported = isAiVideoFirstFrameSupported(b)
        if (aSupported !== bSupported) return aSupported ? -1 : 1
        const aMatch = a.aspect_ratio === projectAspect
        const bMatch = b.aspect_ratio === projectAspect
        if (aMatch !== bMatch) return aMatch ? -1 : 1
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      })
  }, [firstFrames, projectAspect, search])

  function handleOpenChange(next: boolean) {
    if (!next && (createOpen || ignoreCreateDialogCloseRef.current)) return
    if (!next) resetAiVideoDialog()
    onOpenChange(next)
  }

  function handleCreateOpenChange(next: boolean) {
    if (!next) {
      ignoreCreateDialogCloseRef.current = true
      window.setTimeout(() => {
        ignoreCreateDialogCloseRef.current = false
      }, 300)
    }
    setCreateOpen(next)
  }

  function resetAiVideoDialog() {
    setStep("frame")
    setSearch("")
    setCreateOpen(false)
    setMotionPrompt("")
    setDurationSeconds(4)
    setGeneration(null)
    setGenerationError(null)
    setStartingGeneration(false)
    setInserting(false)
  }

  async function handleGenerateVideo() {
    if (!selectedFrame) return
    setStartingGeneration(true)
    setGenerationError(null)
    try {
      const created = await createAiVideoGeneration({
        projectId: documentId,
        firstFrameId: selectedFrame.id,
        prompt: motionPrompt,
        durationSeconds,
        requestedPlayheadMs: clock.getTime(),
      })
      setGeneration(created)
      setStep("review")
    } catch (error) {
      setGenerationError(getAiVideoGenerationErrorMessage(error))
    } finally {
      setStartingGeneration(false)
    }
  }

  async function handleInsertGeneratedVideo() {
    if (!generation?.media) return
    setInserting(true)
    setGenerationError(null)
    try {
      const durationMs = await loadMediaDurationMs(
        generation.media.url,
        "video"
      )
      dispatch({
        type: "ADD_CLIP",
        clip: {
          id: editorId(),
          kind: "video",
          name: generation.media.original_name,
          mediaId: generation.media.id,
          url: generation.media.url,
          muted: true,
          sourceDurationMs: durationMs,
          trimStartMs: 0,
          startMs: 0,
          durationMs,
        },
        atMs: generation.requested_playhead_ms,
      })
      handleOpenChange(false)
    } catch (error) {
      setGenerationError(getAiVideoGenerationErrorMessage(error))
    } finally {
      setInserting(false)
    }
  }

  function startOver() {
    setStep("frame")
    setGeneration(null)
    setGenerationError(null)
    setMotionPrompt("")
  }

  function handleFirstFrameCreated(created: FirstFrameItem) {
    setFirstFrames((current) => [created, ...current])
    setSelectedFrameId(created.id)
  }

  const canContinue =
    selectedFrame && isAiVideoFirstFrameSupported(selectedFrame)
  const canGenerate = canContinue && motionPrompt.trim() && !startingGeneration

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>AI Video</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                {(["frame", "motion", "review"] as AiVideoStep[]).map(
                  (item, index) => (
                    <div
                      key={item}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-center font-medium capitalize",
                        step === item
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground"
                      )}
                    >
                      {index + 1}. {item}
                    </div>
                  )
                )}
              </div>

              {loadError ? (
                <p role="alert" className="text-sm text-destructive">
                  {loadError}
                </p>
              ) : null}

              {step === "frame" ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ai-video-frame-search">First Frame</Label>
                    <Input
                      id="ai-video-frame-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search first frames..."
                    />
                  </div>

                  <div className="overflow-x-auto rounded-md border p-6">
                    {loading ? (
                      <div className="grid h-32 place-items-center sm:h-40 lg:h-[180px]">
                        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : visibleFrames.length ? (
                      <div className="flex min-w-max items-center gap-8">
                        {visibleFrames.map((frame) => {
                          const supported = isAiVideoFirstFrameSupported(frame)
                          const mismatch =
                            supported && frame.aspect_ratio !== projectAspect
                          return (
                            <button
                              key={frame.id}
                              type="button"
                              disabled={!supported}
                              onClick={() => setSelectedFrameId(frame.id)}
                              className={cn(
                                "group relative h-32 shrink-0 overflow-hidden rounded-sm border bg-background text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-40 lg:h-[180px]",
                                aiVideoFrameAspectClass(frame.aspect_ratio),
                                selectedFrameId === frame.id &&
                                  "border-2 border-green-500 ring-2 ring-green-500/25"
                              )}
                            >
                              {frame.image_url ? (
                                <img
                                  src={frame.image_url}
                                  alt={frame.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="grid h-full w-full place-items-center bg-muted">
                                  <ImageIcon className="size-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                <div className="truncate text-xs font-medium text-white">
                                  {frame.name}
                                </div>
                              </div>
                              <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                                <Badge variant="secondary">
                                  {frame.aspect_ratio}
                                </Badge>
                                {mismatch ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-background/90"
                                  >
                                    Mismatch
                                  </Badge>
                                ) : null}
                                {!supported ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-background/90"
                                  >
                                    Unsupported
                                  </Badge>
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
                        <div>
                          <ImageIcon className="mx-auto mb-2 size-8" />
                          <p>No first frames found.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium">
                          Create First Frame
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Save a new First Frame asset, then use it here.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "motion" ? (
                <div className="space-y-4">
                  {selectedFrame ? (
                    <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <div className="flex h-40 items-center justify-center rounded-md bg-muted p-2 sm:h-36">
                        <div
                          className={cn(
                            "h-full max-w-full overflow-hidden rounded-sm bg-muted",
                            aiVideoFrameAspectClass(selectedFrame.aspect_ratio)
                          )}
                        >
                          {selectedFrame.image_url ? (
                            <img
                              src={selectedFrame.image_url}
                              alt={selectedFrame.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center">
                              <ImageIcon className="size-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">
                          {selectedFrame.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {selectedFrame.actor.name} ·{" "}
                          {selectedFrame.aspect_ratio}
                        </p>
                        {selectedFrame.aspect_ratio !== projectAspect ? (
                          <p className="mt-2 text-xs text-amber-700">
                            This frame does not match the project aspect.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <Label htmlFor="ai-video-motion">Motion Prompt</Label>
                    <Textarea
                      id="ai-video-motion"
                      rows={5}
                      value={motionPrompt}
                      onChange={(event) => setMotionPrompt(event.target.value)}
                      placeholder="Describe camera movement, subject motion, lighting changes, and mood."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Duration</Label>
                    <Select
                      value={String(durationSeconds)}
                      onValueChange={(value) =>
                        setDurationSeconds(
                          Number(value) as AiVideoDurationSeconds
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_VIDEO_DURATIONS.map((duration) => (
                          <SelectItem key={duration} value={String(duration)}>
                            {duration}s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {generationError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {generationError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === "review" ? (
                <div className="space-y-4">
                  {generation?.status === "ready" && generation.media ? (
                    <>
                      <video
                        src={generation.media.url}
                        controls
                        muted
                        className="max-h-[420px] w-full rounded-md border bg-black"
                      />
                      <div className="text-sm">
                        <p className="font-medium">
                          {generation.media.original_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {generation.duration_seconds}s ·{" "}
                          {generation.aspect_ratio} · muted on insert
                        </p>
                      </div>
                    </>
                  ) : generation?.status === "error" ? (
                    <p role="alert" className="text-sm text-destructive">
                      {generation.error_message ?? "AI video generation failed"}
                    </p>
                  ) : (
                    <div className="grid h-52 place-items-center rounded-md border bg-background text-center">
                      <div>
                        <Loader2Icon className="mx-auto mb-3 size-8 animate-spin text-muted-foreground" />
                        <p className="text-sm font-medium">Generating video</p>
                        <p className="text-xs text-muted-foreground">
                          This can take a few minutes.
                        </p>
                      </div>
                    </div>
                  )}
                  {generationError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {generationError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            {step === "frame" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setStep("motion")}
                >
                  Continue
                </Button>
              </>
            ) : step === "motion" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={startingGeneration}
                  onClick={() => setStep("frame")}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!canGenerate}
                  onClick={handleGenerateVideo}
                >
                  {startingGeneration ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <VideoIcon className="size-4" />
                  )}
                  {startingGeneration ? "Starting" : "Generate"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Done
                </Button>
                <Button type="button" variant="outline" onClick={startOver}>
                  Start Over
                </Button>
                <Button
                  type="button"
                  disabled={
                    inserting ||
                    generation?.status !== "ready" ||
                    !generation.media
                  }
                  onClick={handleInsertGeneratedVideo}
                >
                  {inserting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <VideoIcon className="size-4" />
                  )}
                  {inserting ? "Inserting" : "Insert Clip"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FirstFrameCreateDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        actors={actorOptions}
        initialValues={createInitialValues}
        defaultAspectRatio={projectAspect}
        allowedAspectRatios={AI_VIDEO_ASPECTS}
        onCreated={handleFirstFrameCreated}
      />
    </>
  )
}

function getAiVideoProjectAspect(aspect: string): "9:16" | "16:9" {
  return aspect === "16:9" ? "16:9" : "9:16"
}

function isAiVideoFirstFrameSupported(frame: FirstFrameItem) {
  return (
    !!frame.generated_media_id &&
    !!frame.image_url &&
    (frame.aspect_ratio === "9:16" || frame.aspect_ratio === "16:9")
  )
}

function isAiVideoActiveGeneration(generation: AiVideoGenerationItem | null) {
  return generation?.status === "queued" || generation?.status === "processing"
}

function isAiVideoReviewStepGeneration(
  generation: AiVideoGenerationItem | null
) {
  return isAiVideoActiveGeneration(generation) || generation?.status === "ready"
}

function aiVideoFrameAspectClass(aspectRatio: FirstFrameAspectRatio) {
  if (aspectRatio === "16:9") return "aspect-video"
  if (aspectRatio === "1:1") return "aspect-square"
  return "aspect-[9/16]"
}

function defaultFirstFrameId(
  frames: FirstFrameItem[],
  projectAspect: "9:16" | "16:9"
) {
  return (
    frames.find(
      (frame) =>
        isAiVideoFirstFrameSupported(frame) &&
        frame.aspect_ratio === projectAspect
    )?.id ??
    frames.find((frame) => isAiVideoFirstFrameSupported(frame))?.id ??
    ""
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
  fontId: TextFontId
  fontSize: number
  color: string
  highlightColor?: string
  y: number
}[] = [
  {
    id: "boxed",
    label: "Boxed",
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 20,
    color: "#000000",
    highlightColor: "#ffffff",
    y: 0.78,
  },
  {
    id: "white",
    label: "White",
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 64,
    color: "#ffffff",
    y: 0.78,
  },
  {
    id: "bold",
    label: "Big Bold",
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 96,
    color: "#ffffff",
    y: 0.78,
  },
  {
    id: "yellow",
    label: "Yellow Pop",
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 72,
    color: "#facc15",
    y: 0.78,
  },
]

// Caption style state shared by the Captions and Voice dialogs: the selected
// preset plus the editable font size / color / highlight. `y` (lower-third
// position) stays per-preset and isn't user-editable.
function useCaptionStyle() {
  const { config } = useShellRuntime()
  const brandStyle = captionStyleFromBrandKit(config.brandKit)
  const captionStyles = [
    {
      id: "brand-kit",
      label: "Brand Kit",
      ...brandStyle,
    },
    ...CAPTION_STYLES,
  ]
  const [styleId, setStyleId] = React.useState(captionStyles[0].id)
  const [fontId, setFontId] = React.useState(captionStyles[0].fontId)
  const [fontSize, setFontSize] = React.useState(captionStyles[0].fontSize)
  const [color, setColor] = React.useState(captionStyles[0].color)
  const [highlightColor, setHighlightColor] = React.useState<
    string | undefined
  >(captionStyles[0].highlightColor)

  // Picking a preset refills the editable controls.
  function applyPreset(id: string) {
    const preset = captionStyles.find((s) => s.id === id) ?? captionStyles[0]
    setStyleId(id)
    setFontId(preset.fontId)
    setFontSize(preset.fontSize)
    setColor(preset.color)
    setHighlightColor(preset.highlightColor)
  }

  // Applies a single edit from the TextStyleFields controls.
  function patch(value: TextStylePatch) {
    if (value.fontId !== undefined) setFontId(value.fontId)
    if (value.fontSize !== undefined) setFontSize(value.fontSize)
    if (value.color !== undefined) setColor(value.color)
    if ("highlightColor" in value) setHighlightColor(value.highlightColor)
  }

  // Position is fixed per preset (not user-editable) — read it for the clip.
  const y = (captionStyles.find((s) => s.id === styleId) ?? captionStyles[0]).y

  return {
    styleId,
    fontId,
    fontSize,
    color,
    highlightColor,
    y,
    swatches: config.brandKit.colors,
    presets: captionStyles,
    applyPreset,
    patch,
  }
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
            {style.presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextStyleFields
        idPrefix={idPrefix}
        fontId={style.fontId}
        fontSize={style.fontSize}
        color={style.color}
        highlightColor={style.highlightColor}
        onChange={style.patch}
        swatches={style.swatches}
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
          fontId: captionStyle.fontId,
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
    <Dialog
      open={open}
      onOpenChange={(next) => !generating && onOpenChange(next)}
    >
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
const ELEVENLABS_NOT_CONFIGURED_MESSAGE = "ElevenLabs is not configured"

// Request-level ElevenLabs voice style controls, shared by the Voice dialog
// and the Brief to Reel voice step. Values are sent as `voice_settings` once
// saved defaults load or the user adjusts a control (untouched dialogs omit
// them entirely); the stored ElevenLabs account voice is never edited.
const VOICE_STYLE_SLIDERS = [
  { key: "stability", label: "Stability", min: 0, max: 1 },
  { key: "similarityBoost", label: "Similarity boost", min: 0, max: 1 },
  { key: "styleExaggeration", label: "Style exaggeration", min: 0, max: 1 },
  { key: "speed", label: "Speed", min: VOICE_SPEED_MIN, max: VOICE_SPEED_MAX },
] as const

function VoiceStyleFields({
  idPrefix,
  style,
  onChange,
}: {
  idPrefix: string
  style: VoiceSettings
  onChange: (style: VoiceSettings) => void
}) {
  return (
    <div className="space-y-3">
      {VOICE_STYLE_SLIDERS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-style-${field.key}`}>
              {field.label}
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {style[field.key].toFixed(2)}
            </span>
          </div>
          <Slider
            id={`${idPrefix}-style-${field.key}`}
            value={[style[field.key]]}
            min={field.min}
            max={field.max}
            step={0.05}
            onValueChange={(value) =>
              onChange({ ...style, [field.key]: value[0] })
            }
            aria-label={field.label}
          />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-style-speaker-boost`}>Speaker boost</Label>
        <Switch
          id={`${idPrefix}-style-speaker-boost`}
          checked={style.speakerBoost}
          onCheckedChange={(checked) =>
            onChange({ ...style, speakerBoost: checked })
          }
          aria-label="Speaker boost"
        />
      </div>
    </div>
  )
}

// The voice a voiceover flow should select once voices load: the saved
// default while it still exists in the loaded list (it may have been removed
// from the ElevenLabs account), else the previous selection, else the first
// voice. Called inside a functional state update so `previousVoiceId` is
// never a stale closure value.
function prefillVoiceId(
  defaults: VoiceDefaults | null,
  voices: ElevenLabsVoice[],
  previousVoiceId: string
) {
  const savedVoiceId =
    defaults && voices.some((voice) => voice.id === defaults.voiceId)
      ? defaults.voiceId
      : ""
  return savedVoiceId || previousVoiceId || voices[0]?.id || ""
}

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
  // Request-level style for this generation; prefilled from saved defaults.
  // null = untouched with no saved default — generation then omits
  // voice_settings so the ElevenLabs account voice settings keep applying.
  const [voiceStyle, setVoiceStyle] = React.useState<VoiceSettings | null>(null)
  const styleValues = voiceStyle ?? createDefaultVoiceSettings()
  const [text, setText] = React.useState("")
  // Captions on by default — the point is a synced, captioned voiceover.
  const [addCaptions, setAddCaptions] = React.useState(true)
  // Caption style (shared controls/state with the Captions dialog).
  const captionStyle = useCaptionStyle()
  const [generating, setGenerating] = React.useState(false)
  const [savingDefault, setSavingDefault] = React.useState(false)
  const [savedDefault, setSavedDefault] = React.useState(false)
  const [voiceLoadError, setVoiceLoadError] = React.useState<string | null>(
    null
  )
  const [generateError, setGenerateError] = React.useState<string | null>(null)
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
    setVoiceLoadError(null)
    listElevenLabsVoices()
      .then((result) => {
        if (!active) return
        setVoices(result.voices)
        setVoiceId((prev) =>
          prefillVoiceId(result.defaults, result.voices, prev)
        )
        if (result.defaults) {
          setModelId(result.defaults.modelId)
          setVoiceStyle(pickVoiceSettings(result.defaults))
        }
        setVoiceLoadError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setVoices([])
        setVoiceId("")
        setVoiceLoadError(getVoiceLoadErrorMessage(loadError))
      })
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
      setVoiceLoadError(null)
      setGenerateError(null)
      setSavedDefault(false)
    }
    onOpenChange(next)
  }

  // Persists the current voice/model/style as the workspace default. Only AI
  // Video settings change — the ElevenLabs account voice is not edited.
  async function handleSaveDefault() {
    if (!voiceId) return
    setSavingDefault(true)
    setGenerateError(null)
    try {
      await saveVoiceDefaults({
        ...styleValues,
        voiceId,
        voiceName: selectedVoice?.name ?? "",
        modelId,
      })
      setSavedDefault(true)
    } catch {
      setGenerateError("Could not save the voice defaults.")
    } finally {
      setSavingDefault(false)
    }
  }

  async function handleGenerate() {
    if (!voiceId || !text.trim()) {
      setGenerateError("Pick a voice and enter some text.")
      return
    }
    setGenerating(true)
    setGenerateError(null)
    stopPreview()
    try {
      const result = await generateVoiceover({
        voiceId,
        text: text.trim(),
        modelId,
        voiceSettings: voiceStyle ?? undefined,
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
            fontId: captionStyle.fontId,
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
      setGenerateError(getVoiceGenerationErrorMessage(generateError))
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
  const notConfigured =
    voiceLoadError === ELEVENLABS_NOT_CONFIGURED_MESSAGE ||
    generateError === ELEVENLABS_NOT_CONFIGURED_MESSAGE
  const voicePlaceholder = !voices
    ? "Loading…"
    : voices.length
      ? "Select a voice"
      : "No voices available"
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
                        setSavedDefault(false)
                      }}
                      disabled={
                        !voices || voices.length === 0 || !!voiceLoadError
                      }
                    >
                      <SelectTrigger
                        id="voice-voice"
                        className="min-w-0 flex-1"
                      >
                        <SelectValue placeholder={voicePlaceholder} />
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
                    onValueChange={(value) => {
                      setModelId(value as VoiceModelId)
                      setSavedDefault(false)
                    }}
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
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">Voice style</div>
                    <p className="text-xs text-muted-foreground">
                      Adjustments apply to this generation only. Save as default
                      keeps them as this workspace&apos;s AI Video default —
                      your ElevenLabs account voice settings are not edited.
                    </p>
                  </div>
                  <VoiceStyleFields
                    idPrefix="voice"
                    style={styleValues}
                    onChange={(style) => {
                      setVoiceStyle(style)
                      setSavedDefault(false)
                    }}
                  />
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
            {voiceLoadError && !notConfigured ? (
              <p role="alert" className="text-sm text-destructive">
                {voiceLoadError}
              </p>
            ) : null}
            {generateError && !notConfigured ? (
              <p role="alert" className="text-sm text-destructive">
                {generateError}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            className="mr-auto"
            disabled={
              generating ||
              savingDefault ||
              notConfigured ||
              !!voiceLoadError ||
              !voiceId
            }
            onClick={handleSaveDefault}
          >
            {savingDefault ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {savedDefault ? "Saved as default" : "Save as default"}
          </Button>
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
            disabled={
              generating ||
              notConfigured ||
              !!voiceLoadError ||
              !voiceId ||
              !text.trim()
            }
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

// One rewritten hook line in the Hook dialog. `voice` caches the generated
// voiceover for exactly `voicedText`, so editing the line after a preview
// forces a fresh generation before it can be applied.
type HookLine = {
  id: string
  text: string
  voice: VoiceoverResult | null
  voicedText: string
}

const HOOK_LINE_COUNT = 3

// Rewrites just the video's opening hook line a few ways, previews each line
// in the chosen ElevenLabs voice, and swaps the picked one into the timeline
// (hook audio + karaoke captions) as a single undoable edit. Nothing is
// created outside the editor — pick first, commit later.
function HookDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, dispatch } = useEditor()
  const [voices, setVoices] = React.useState<ElevenLabsVoice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>(VOICE_MODELS[0].id)
  // Prefilled from saved defaults; null keeps the ElevenLabs account settings.
  const [voiceStyle, setVoiceStyle] = React.useState<VoiceSettings | null>(null)
  const [notes, setNotes] = React.useState("")
  const [lines, setLines] = React.useState<HookLine[]>([])
  const [writing, setWriting] = React.useState(false)
  // The line with a rewrite/voice/apply call in flight (one at a time).
  const [busy, setBusy] = React.useState<{
    lineId: string
    task: "rewrite" | "voice" | "apply"
  } | null>(null)
  const [voiceLoadError, setVoiceLoadError] = React.useState<string | null>(
    null
  )
  const [error, setError] = React.useState<string | null>(null)
  const { previewingId, stopPreview, togglePreview } = useAudioPreview()

  // Detect the hook from the LIVE editor timeline (unsaved edits included).
  // The dialog is modal, so the timeline can't change while it's open.
  const detection = React.useMemo(() => {
    if (!open) return null
    try {
      return {
        hook: detectHook({ tracks: state.tracks, aspect: state.aspect }),
        error: null as string | null,
      }
    } catch (detectError) {
      return {
        hook: null as HookDetection | null,
        error:
          detectError instanceof Error
            ? detectError.message
            : "No hook found in this timeline.",
      }
    }
  }, [open, state.tracks, state.aspect])
  const hook = detection?.hook ?? null

  // Load voices + saved defaults on open (same prefill as the Voice dialog).
  React.useEffect(() => {
    if (!open) return
    let active = true
    setVoiceLoadError(null)
    listElevenLabsVoices()
      .then((result) => {
        if (!active) return
        setVoices(result.voices)
        setVoiceId((prev) =>
          prefillVoiceId(result.defaults, result.voices, prev)
        )
        if (result.defaults) {
          setModelId(result.defaults.modelId)
          setVoiceStyle(pickVoiceSettings(result.defaults))
        }
      })
      .catch((loadError) => {
        if (!active) return
        setVoices([])
        setVoiceId("")
        setVoiceLoadError(getVoiceLoadErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [open])

  React.useEffect(() => stopPreview, [stopPreview])

  function handleClose(next: boolean) {
    if (!next) {
      stopPreview()
      setLines([])
      setNotes("")
      setError(null)
      setVoiceLoadError(null)
    }
    onOpenChange(next)
  }

  // Later on-screen lines give the model the video's topic and payoff.
  function contextLines(detected: HookDetection): string[] {
    const hookIds = new Set(detected.textClips.map(({ clipId }) => clipId))
    const found: { startMs: number; text: string }[] = []
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.kind !== "text" || hookIds.has(clip.id)) continue
        const text = (clip.text ?? "").replace(/\s+/g, " ").trim()
        if (text) found.push({ startMs: clip.startMs, text: text.slice(0, 500) })
      }
    }
    return found
      .sort((a, b) => a.startMs - b.startMs)
      .slice(0, 10)
      .map((line) => line.text)
  }

  async function requestLines(count: number, avoid: string[]) {
    if (!hook) return []
    const result = await rewriteHookLines({
      hookText: hook.hookText,
      contextLines: contextLines(hook),
      audioDurationMs: hook.audioClip.durationMs,
      count,
      notes: notes.trim() || undefined,
      avoid,
    })
    return result.lines
  }

  // First write and "rewrite all": fresh set, steered away from what's shown.
  async function handleWrite() {
    setWriting(true)
    setError(null)
    stopPreview()
    try {
      const avoid = lines.map((line) => line.text.trim()).filter(Boolean)
      const texts = await requestLines(HOOK_LINE_COUNT, avoid.slice(0, 4))
      setLines(
        texts.map((text) => ({
          id: editorId(),
          text,
          voice: null,
          voicedText: "",
        }))
      )
    } catch (writeError) {
      setError(getHookRewriteErrorMessage(writeError))
    } finally {
      setWriting(false)
    }
  }

  async function handleRegenerateLine(line: HookLine) {
    setBusy({ lineId: line.id, task: "rewrite" })
    setError(null)
    try {
      const avoid = lines
        .map((item) => item.text.trim())
        .filter(Boolean)
        .slice(0, 4)
      const [text] = await requestLines(1, avoid)
      setLines((current) =>
        current.map((item) =>
          item.id === line.id ? { ...item, text, voice: null } : item
        )
      )
    } catch (writeError) {
      setError(getHookRewriteErrorMessage(writeError))
    } finally {
      setBusy(null)
    }
  }

  // Generates (or reuses) the voiceover for the line's current text.
  async function ensureVoice(line: HookLine): Promise<VoiceoverResult> {
    const text = line.text.trim()
    if (line.voice && line.voicedText === text) return line.voice
    const voice = await generateVoiceover({
      voiceId,
      text,
      modelId,
      voiceSettings: voiceStyle ?? undefined,
    })
    setLines((current) =>
      current.map((item) =>
        item.id === line.id ? { ...item, voice, voicedText: text } : item
      )
    )
    return voice
  }

  async function handlePreview(line: HookLine) {
    if (previewingId === line.id) {
      stopPreview()
      return
    }
    setError(null)
    setBusy({ lineId: line.id, task: "voice" })
    try {
      const voice = await ensureVoice(line)
      togglePreview(line.id, voice.media.url)
    } catch (voiceError) {
      setError(getVoiceGenerationErrorMessage(voiceError))
    } finally {
      setBusy(null)
    }
  }

  // Swap the hook in the open timeline — a normal edit, cmd+Z undoes it.
  async function handleUse(line: HookLine) {
    setError(null)
    stopPreview()
    setBusy({ lineId: line.id, task: "apply" })
    try {
      const voice = await ensureVoice(line)
      dispatch({
        type: "APPLY_HOOK_VARIANT",
        variant: {
          text: line.text.trim(),
          audio: {
            mediaId: voice.media.id,
            url: voice.media.url,
            durationMs: voice.durationMs,
          },
          captions: voice.captions,
        },
      })
      handleClose(false)
    } catch (voiceError) {
      setError(getVoiceGenerationErrorMessage(voiceError))
    } finally {
      setBusy(null)
    }
  }

  const notConfigured = voiceLoadError === ELEVENLABS_NOT_CONFIGURED_MESSAGE
  const blocked = writing || busy !== null

  return (
    <Dialog open={open} onOpenChange={(next) => !blocked && handleClose(next)}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Hook Variants</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {detection?.error ? (
              <p className="text-sm text-muted-foreground">{detection.error}</p>
            ) : hook ? (
              <>
                <div className="space-y-1.5">
                  <Label>Current hook</Label>
                  <blockquote className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                    “{hook.hookText}”
                  </blockquote>
                  <p className="text-xs text-muted-foreground">
                    New lines aim for ~
                    {hookWordBudget(hook.audioClip.durationMs)} words so they
                    fit the same opening. Only this line and its voice change —
                    the rest of the video stays untouched.
                  </p>
                </div>
                {notConfigured ? (
                  <p className="text-sm text-muted-foreground">
                    ElevenLabs isn&apos;t configured yet. Add an ElevenLabs API
                    key in Settings → AI Providers to voice and apply hooks.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="hook-voice">Voice</Label>
                      <Select
                        value={voiceId}
                        onValueChange={(value) => {
                          stopPreview()
                          setVoiceId(value)
                          // A different voice needs fresh previews.
                          setLines((current) =>
                            current.map((line) => ({ ...line, voice: null }))
                          )
                        }}
                        disabled={!voices || voices.length === 0}
                      >
                        <SelectTrigger id="hook-voice" className="w-full">
                          <SelectValue
                            placeholder={!voices ? "Loading…" : "Select a voice"}
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
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hook-model">Model</Label>
                      <Select
                        value={modelId}
                        onValueChange={(value) => {
                          setModelId(value as VoiceModelId)
                          setLines((current) =>
                            current.map((line) => ({ ...line, voice: null }))
                          )
                        }}
                      >
                        <SelectTrigger id="hook-model" className="w-full">
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
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="hook-notes">
                    Notes for the writer (optional)
                  </Label>
                  <Textarea
                    id="hook-notes"
                    rows={2}
                    value={notes}
                    maxLength={500}
                    placeholder="Angle, audience, words to use or avoid..."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                {lines.map((line) => {
                  const lineBusy = busy?.lineId === line.id ? busy.task : null
                  const previewing = previewingId === line.id
                  return (
                    <div
                      key={line.id}
                      className="space-y-1.5 rounded-md border p-2"
                    >
                      <Textarea
                        rows={2}
                        value={line.text}
                        maxLength={300}
                        aria-label="Hook line"
                        onChange={(event) => {
                          stopPreview()
                          setLines((current) =>
                            current.map((item) =>
                              item.id === line.id
                                ? { ...item, text: event.target.value }
                                : item
                            )
                          )
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Rewrite this line"
                              disabled={blocked}
                              onClick={() => handleRegenerateLine(line)}
                            >
                              {lineBusy === "rewrite" ? (
                                <Loader2Icon className="size-4 animate-spin" />
                              ) : (
                                <RefreshCwIcon className="size-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Rewrite this line</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={
                                previewing ? "Stop preview" : "Preview voice"
                              }
                              disabled={
                                notConfigured ||
                                !voiceId ||
                                !line.text.trim() ||
                                (blocked && !previewing)
                              }
                              onClick={() => handlePreview(line)}
                            >
                              {lineBusy === "voice" ? (
                                <Loader2Icon className="size-4 animate-spin" />
                              ) : previewing ? (
                                <PauseIcon className="size-4" />
                              ) : (
                                <PlayIcon className="size-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {previewing ? "Stop preview" : "Preview voice"}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          type="button"
                          size="sm"
                          className="ml-auto"
                          disabled={
                            notConfigured ||
                            !voiceId ||
                            !line.text.trim() ||
                            blocked
                          }
                          onClick={() => handleUse(line)}
                        >
                          {lineBusy === "apply" ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <SplitIcon className="size-4" />
                          )}
                          Use this hook
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </>
            ) : null}
            {voiceLoadError && !notConfigured ? (
              <p role="alert" className="text-sm text-destructive">
                {voiceLoadError}
              </p>
            ) : null}
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
            disabled={blocked}
            onClick={() => handleClose(false)}
          >
            {detection?.error ? "Close" : "Cancel"}
          </Button>
          {hook ? (
            <Button type="button" disabled={blocked} onClick={handleWrite}>
              {writing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PenLineIcon className="size-4" />
              )}
              {writing
                ? "Writing…"
                : lines.length
                  ? "Write new hooks"
                  : "Write hooks"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type BriefStep = "topic" | "brief" | "voice" | "insert"

const BRIEF_STEPS: { id: BriefStep; label: string }[] = [
  { id: "topic", label: "Topic" },
  { id: "brief", label: "Brief" },
  { id: "voice", label: "Voice" },
  { id: "insert", label: "Insert" },
]

function BriefToReelDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, documentId: projectId } = useEditor()
  const captionStyle = useCaptionStyle()
  const [step, setStep] = React.useState<BriefStep>("topic")
  const [topic, setTopic] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [brief, setBrief] = React.useState<ProjectReelBriefResult | null>(null)
  const [voiceoverText, setVoiceoverText] = React.useState("")
  const [voices, setVoices] = React.useState<ElevenLabsVoice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [modelId, setModelId] = React.useState<VoiceModelId>(VOICE_MODELS[0].id)
  // Request-level style for this generation; prefilled from saved defaults.
  // null = untouched with no saved default — generation then omits
  // voice_settings so the ElevenLabs account voice settings keep applying.
  const [voiceStyle, setVoiceStyle] = React.useState<VoiceSettings | null>(null)
  const [addCaptions, setAddCaptions] = React.useState(true)
  const [voiceover, setVoiceover] = React.useState<VoiceoverResult | null>(null)
  const [generatingBrief, setGeneratingBrief] = React.useState(false)
  const [generatingVoice, setGeneratingVoice] = React.useState(false)
  const [briefError, setBriefError] = React.useState<string | null>(null)
  const [voiceLoadError, setVoiceLoadError] = React.useState<string | null>(
    null
  )
  const [voiceGenerateError, setVoiceGenerateError] = React.useState<
    string | null
  >(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open || step !== "voice" || voices) return
    let active = true
    setVoiceLoadError(null)
    listElevenLabsVoices()
      .then((result) => {
        if (!active) return
        setVoices(result.voices)
        setVoiceId((prev) =>
          prefillVoiceId(result.defaults, result.voices, prev)
        )
        if (result.defaults) {
          setModelId(result.defaults.modelId)
          setVoiceStyle(pickVoiceSettings(result.defaults))
        }
        setVoiceLoadError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setVoices([])
        setVoiceId("")
        setVoiceLoadError(getVoiceLoadErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [open, step, voices])

  function reset() {
    setStep("topic")
    setTopic("")
    setNotes("")
    setBrief(null)
    setVoiceoverText("")
    setVoiceover(null)
    setBriefError(null)
    setVoiceLoadError(null)
    setVoiceGenerateError(null)
    setCopied(false)
  }

  function handleClose(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleGenerateBrief() {
    if (!topic.trim()) {
      setBriefError("Enter a topic first.")
      return
    }
    setGeneratingBrief(true)
    setBriefError(null)
    setCopied(false)
    try {
      const result = await writeProjectBrief(
        projectId,
        topic.trim(),
        notes.trim() || undefined
      )
      setBrief(result)
      setVoiceoverText(result.voiceoverText)
      setVoiceover(null)
      setStep("brief")
    } catch (generateError) {
      setBriefError(getBriefErrorMessage(generateError))
    } finally {
      setGeneratingBrief(false)
    }
  }

  async function handleCopyBrief() {
    if (!brief) return
    const text = [
      `Hook: ${brief.brief.hook}`,
      `Angle: ${brief.brief.angle}`,
      `Audience: ${brief.brief.audience}`,
      `Promise: ${brief.brief.promise}`,
      `CTA: ${brief.brief.cta}`,
      "",
      ...brief.beats.map(
        (beat) =>
          `[${formatTimecode(beat.startMs)}-${formatTimecode(beat.endMs)}] ${beat.role}: ${beat.line}`
      ),
    ].join("\n")
    await navigator.clipboard.writeText(text).catch(() => undefined)
    setCopied(true)
  }

  async function handleGenerateVoice() {
    if (!voiceId || !voiceoverText.trim()) {
      setVoiceGenerateError("Pick a voice and keep voiceover text.")
      return
    }
    setGeneratingVoice(true)
    setVoiceGenerateError(null)
    try {
      const result = await generateVoiceover({
        voiceId,
        text: voiceoverText.trim(),
        modelId,
        voiceSettings: voiceStyle ?? undefined,
      })
      setVoiceover(result)
      setStep("insert")
    } catch (generateError) {
      setVoiceGenerateError(getVoiceGenerationErrorMessage(generateError))
    } finally {
      setGeneratingVoice(false)
    }
  }

  function handleInsert() {
    if (!voiceover) return
    dispatch({
      type: "INSERT_VOICEOVER_BUNDLE",
      audioClip: {
        id: editorId(),
        kind: "audio",
        name: voiceover.media.original_name,
        mediaId: voiceover.media.id,
        url: voiceover.media.url,
        sourceDurationMs: voiceover.durationMs,
        trimStartMs: 0,
        startMs: 0,
        durationMs: voiceover.durationMs,
      },
      captionClips:
        addCaptions && voiceover.captions.length
          ? voiceover.captions.map((line) => ({
              id: editorId(),
              kind: "text" as const,
              name: "Caption",
              text: line.text,
              words: line.words,
              fontId: captionStyle.fontId,
              fontSize: captionStyle.fontSize,
              color: captionStyle.color,
              highlightColor: captionStyle.highlightColor,
              y: captionStyle.y,
              trimStartMs: 0,
              startMs: line.startMs,
              durationMs: line.endMs - line.startMs,
            }))
          : [],
    })
    handleClose(false)
  }

  const busy = generatingBrief || generatingVoice
  const notConfigured =
    voiceLoadError === ELEVENLABS_NOT_CONFIGURED_MESSAGE ||
    voiceGenerateError === ELEVENLABS_NOT_CONFIGURED_MESSAGE
  const voicePlaceholder = !voices
    ? "Loading…"
    : voices.length
      ? "Select a voice"
      : "No voices available"

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && handleClose(next)}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Brief to Reel</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              {BRIEF_STEPS.map((item, index) => {
                const active = item.id === step
                return (
                  <span
                    key={item.id}
                    className={cn(
                      "rounded-md border px-2 py-1",
                      active ? "bg-foreground text-background" : "bg-background"
                    )}
                  >
                    {index + 1}. {item.label}
                  </span>
                )
              })}
            </div>

            {step === "topic" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Generate a brief from this template&apos;s analyzed source
                  reel.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="brief-topic">Topic</Label>
                  <Input
                    id="brief-topic"
                    value={topic}
                    placeholder="e.g. founding member offer for a local gym"
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brief-notes">Notes (optional)</Label>
                  <Textarea
                    id="brief-notes"
                    rows={3}
                    value={notes}
                    placeholder="Mention what must be included or avoided..."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                {briefError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {briefError}
                  </p>
                ) : null}
              </>
            ) : null}

            {step === "brief" && brief ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Hook", brief.brief.hook],
                    ["Angle", brief.brief.angle],
                    ["Audience", brief.brief.audience],
                    ["Promise", brief.brief.promise],
                    ["CTA", brief.brief.cta],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border bg-background p-3"
                    >
                      <div className="text-xs text-muted-foreground">
                        {label}
                      </div>
                      <p className="text-sm">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
                  {brief.beats.map((beat, index) => (
                    <div key={index} className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {beat.role}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatTimecode(beat.startMs)} –{" "}
                          {formatTimecode(beat.endMs)}
                        </span>
                      </div>
                      <p className="text-sm">{beat.line}</p>
                      <p className="text-xs text-muted-foreground">
                        {beat.visual} · {beat.asset}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">
                    Asset checklist
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {brief.assetChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs text-muted-foreground">
                    Caption draft
                  </div>
                  <p className="mt-1 text-sm">{brief.captionDraft}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brief-voiceover">Voiceover script</Label>
                  <Textarea
                    id="brief-voiceover"
                    rows={5}
                    value={voiceoverText}
                    onChange={(event) => setVoiceoverText(event.target.value)}
                  />
                </div>
              </>
            ) : null}

            {step === "voice" ? (
              notConfigured ? (
                <p className="text-sm text-muted-foreground">
                  ElevenLabs isn&apos;t configured yet. Add an ElevenLabs API
                  key in Settings → AI Providers to generate voiceovers.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="brief-voice">Voice</Label>
                    <Select
                      value={voiceId}
                      onValueChange={setVoiceId}
                      disabled={
                        !voices || voices.length === 0 || !!voiceLoadError
                      }
                    >
                      <SelectTrigger id="brief-voice" className="w-full">
                        <SelectValue placeholder={voicePlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {(voices ?? []).map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brief-model">Model</Label>
                    <Select
                      value={modelId}
                      onValueChange={(value) =>
                        setModelId(value as VoiceModelId)
                      }
                    >
                      <SelectTrigger id="brief-model" className="w-full">
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
                  <VoiceStyleFields
                    idPrefix="brief"
                    style={voiceStyle ?? createDefaultVoiceSettings()}
                    onChange={setVoiceStyle}
                  />
                  <div className="flex items-center justify-between">
                    <Label htmlFor="brief-captions-toggle">Add captions</Label>
                    <Switch
                      id="brief-captions-toggle"
                      checked={addCaptions}
                      onCheckedChange={setAddCaptions}
                      aria-label="Add synced captions"
                    />
                  </div>
                  {addCaptions ? (
                    <CaptionStyleFields idPrefix="brief" style={captionStyle} />
                  ) : null}
                  {voiceLoadError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {voiceLoadError}
                    </p>
                  ) : null}
                  {voiceGenerateError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {voiceGenerateError}
                    </p>
                  ) : null}
                </>
              )
            ) : null}

            {step === "insert" && voiceover ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-background p-3">
                  <p className="text-sm font-medium">
                    {voiceover.media.original_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {addCaptions ? voiceover.captions.length : 0} synced caption
                    clips
                  </p>
                  <audio
                    controls
                    src={voiceover.media.url}
                    className="mt-3 w-full"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  The original template audio will be muted when this voiceover
                  is inserted.
                </p>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          {step === "topic" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={generatingBrief}
                onClick={handleGenerateBrief}
              >
                {generatingBrief ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FileTextIcon className="size-4" />
                )}
                {generatingBrief ? "Generating…" : "Generate Brief"}
              </Button>
            </>
          ) : null}
          {step === "brief" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("topic")}
              >
                Back
              </Button>
              <Button type="button" variant="outline" onClick={handleCopyBrief}>
                <CopyIcon className="size-4" />
                {copied ? "Copied" : "Copy Brief"}
              </Button>
              <Button type="button" onClick={() => setStep("voice")}>
                Next
              </Button>
            </>
          ) : null}
          {step === "voice" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={generatingVoice}
                onClick={() => setStep("brief")}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={
                  generatingVoice ||
                  notConfigured ||
                  !!voiceLoadError ||
                  !voiceId ||
                  !voiceoverText.trim()
                }
                onClick={handleGenerateVoice}
              >
                {generatingVoice ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <MicIcon className="size-4" />
                )}
                {generatingVoice ? "Generating…" : "Generate Voice"}
              </Button>
            </>
          ) : null}
          {step === "insert" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("voice")}
              >
                Back
              </Button>
              <Button type="button" onClick={handleInsert}>
                Insert Into Timeline
              </Button>
            </>
          ) : null}
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
  const { config } = useShellRuntime()
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
        ...captionStyleFromBrandKit(config.brandKit),
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
                      <span className="text-xs text-muted-foreground tabular-nums">
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
