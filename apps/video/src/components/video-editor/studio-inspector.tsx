import * as React from "react"
import { FilmIcon, Replace, RotateCcw, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import {
  ColorField,
  FieldLabel,
  InspectorCard,
  SliderField,
  SwitchField,
} from "@/components/broadcasts/inspector-fields"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CLIP_SPEED_STEP,
  CLIP_VOLUME_STEP,
  clipSpeed,
  clipVolume,
  DEFAULT_CLIP_VOLUME,
  MAX_CLIP_SPEED,
  MAX_CLIP_VOLUME,
  MIN_CLIP_SPEED,
  MIN_CLIP_VOLUME,
  sourceSpanMs,
  storedPlaybackValue,
} from "@/lib/video/clip-playback"
import {
  clipFit,
  CLIP_FIT_OPTIONS,
  storedClipFit,
  type ClipFit,
} from "@/lib/video/clip-frame-fit"
import {
  CLIP_SCALE_STEP,
  clipScale,
  MAX_CLIP_SCALE,
  MIN_CLIP_SCALE,
  storedClipScale,
} from "@/lib/video/clip-size"
import {
  CLIP_COLOUR_STEP,
  clipColour,
  isColourTouched,
  MAX_CLIP_BRIGHTNESS,
  MAX_CLIP_CONTRAST,
  MAX_CLIP_SATURATION,
  MIN_CLIP_BRIGHTNESS,
  MIN_CLIP_CONTRAST,
  MIN_CLIP_SATURATION,
  UNTOUCHED_COLOUR,
  type ClipColour,
} from "@/lib/video/clip-colour"
import {
  clipMotion,
  CLIP_MOTION_OPTIONS,
  type ClipMotion,
} from "@/lib/video/clip-motion"
import {
  CAPTION_ANIMATIONS,
  resolveCaptionAnimation,
} from "@/lib/video/caption-animations"
import {
  clampTransitionMs,
  DEFAULT_TRANSITION_MS,
  isTransitionableKind,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  precedingClipOnTrack,
  TRANSITION_ADJACENCY_EPS_MS,
  TRANSITION_OPTIONS,
  type TransitionKind,
} from "@/lib/video/clip-transitions"
import { MUSIC_FADE_OUT_MS } from "@/lib/video/background-music"
import { formatClock } from "@/lib/video/timeline-utils"
import { cn } from "@/lib/utils"
import {
  ReplaceMediaDialog,
  type ReplacementMedia,
} from "@/components/video-editor/replace-media-dialog"
import {
  findClip,
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type AspectRatio,
  type EditorClip,
} from "@/components/video-editor/editor-store"

/**
 * The right-hand panel: what the selected clip is, and every setting on it.
 * With nothing selected it shows the project's own facts instead.
 *
 * It is built from the app's own options-panel parts — the same cards, sliders,
 * colour rows and switches the newsletter editor uses — so a setting here looks
 * and behaves like a setting anywhere else in the app.
 */

const RESOLUTION: Record<AspectRatio, string> = {
  "9:16": "1080 × 1920",
  "16:9": "1920 × 1080",
  "1:1": "1080 × 1080",
  "4:3": "1440 × 1080",
}

const CLIP_KIND_LABEL: Record<EditorClip["kind"], string> = {
  video: "Video",
  audio: "Audio",
  image: "Picture",
  text: "Text",
}

export function StudioInspector() {
  const clip = useEditorSelector((state) =>
    state.selectedClipId
      ? (findClip(state.tracks, state.selectedClipId)?.clip ?? null)
      : null
  )

  return (
    <div data-screen-label="Inspector" className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<SlidersHorizontal className="size-4" />}
        title={clip ? CLIP_KIND_LABEL[clip.kind] : "Inspector"}
        meta={clip ? clip.name : undefined}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid auto-rows-min gap-3 p-4">
          {!clip ? (
            <ProjectProps />
          ) : clip.kind === "text" ? (
            <TextInspector clip={clip} />
          ) : (
            <MediaInspector clip={clip} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Facts about the project or clip: name on the left, value on the right.
 *
 * They sit close together on purpose. The gap a card puts between its fields
 * is right for things you type into and wrong for a list of one-line facts,
 * which drift apart and stop reading as one thing.
 */
function ReadOnlyRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-medium">{label}</span>
          <span className="text-[15px] text-muted-foreground tabular-nums">
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ProjectProps() {
  const durationMs = useEditorDurationMs()
  const aspect = useEditorSelector((state) => state.aspect)

  return (
    <>
      <div className="grid place-items-center gap-2 px-2 py-6 text-center">
        <FilmIcon className="size-7 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Select a clip on the timeline to edit it.
        </p>
      </div>
      <InspectorCard title="Project">
        <ReadOnlyRows
          rows={[
            ["Shape", aspect],
            ["Size", RESOLUTION[aspect]],
            ["Frame rate", "30 fps"],
            ["Length", formatClock(durationMs)],
          ]}
        />
      </InspectorCard>
    </>
  )
}

function TextInspector({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()

  function patch(next: Partial<EditorClip>) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: next,
      transient: true,
    })
  }

  const boxed = !!clip.highlightColor

  return (
    <>
      <InspectorCard
        title="The words"
        description="What this appears as on the picture."
      >
        <div className="grid gap-2.5">
          <FieldLabel htmlFor="clip-text">Words on it</FieldLabel>
          <Textarea
            id="clip-text"
            rows={1}
            value={clip.text ?? ""}
            onChange={(event) => patch({ text: event.target.value })}
          />
        </div>
        <SliderField
          id="clip-font-size"
          label="Size"
          value={clip.fontSize ?? 78}
          min={40}
          max={140}
          onChange={(fontSize) => patch({ fontSize })}
        />
        <ColorField
          label="Colour"
          value={clip.color ?? "#ffffff"}
          onChange={(color) => patch({ color })}
        />
      </InspectorCard>

      <InspectorCard
        title="How it arrives"
        description="What the words do the moment they appear."
      >
        <div className="grid gap-2.5">
          <FieldLabel htmlFor="clip-animation">Entrance</FieldLabel>
          <Select
            value={resolveCaptionAnimation(clip.animation)}
            onValueChange={(animation) =>
              patch({ animation: resolveCaptionAnimation(animation) })
            }
          >
            <SelectTrigger id="clip-animation" className="w-full">
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
      </InspectorCard>

      <InspectorCard title="Behind it">
        <SwitchField
          id="clip-highlight"
          label="Highlight box"
          description="A block of colour behind the words."
          checked={boxed}
          onChange={(on) => patch({ highlightColor: on ? "#111827" : undefined })}
        />
        {boxed ? (
          <ColorField
            label="Box colour"
            value={clip.highlightColor ?? "#111827"}
            onChange={(highlightColor) => patch({ highlightColor })}
          />
        ) : null}
      </InspectorCard>

      <Timing clip={clip} />
    </>
  )
}

/**
 * A setting that lives between two fractions, with its value spelled out.
 *
 * The panel's own `SliderField` steps in whole numbers, which is right for a
 * font size and useless for a volume between 0 and 1. This is the same row in
 * the same sizes, taking a step and writing the number the way that setting is
 * read: "20%" of full, "2x" as fast.
 *
 * `onChange` is told whether this is the first value of a drag. Only that
 * first one is worth remembering for undo: it is the moment the clip still
 * held the value it started with, so one press of undo puts the whole drag
 * back rather than the last position the handle passed through.
 */
function FractionSliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number, firstOfDrag: boolean) => void
}) {
  const dragging = React.useRef(false)

  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="text-[15px] text-muted-foreground tabular-nums">
          {format(value)}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        aria-valuetext={format(value)}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          const first = !dragging.current
          dragging.current = true
          onChange(round(next), first)
        }}
        onValueCommit={() => {
          dragging.current = false
        }}
      />
    </div>
  )
}

/** Slider maths lands on values like 0.30000000000000004. */
function round(value: number) {
  return Math.round(value * 100) / 100
}

function formatVolume(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatSpeed(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}x`
}

/**
 * How loud this clip's own sound plays. Nothing for a picture, which has none.
 *
 * Full is as loud as it goes, because that is as loud as the browser can play
 * a file in the preview, and a slider that promised more would be right only
 * after an export.
 *
 * The slider reports while it is dragged and again when it is let go. The
 * reports during the drag are marked as one continuous edit, so undo steps
 * back over the whole drag rather than over every value it passed through.
 */
function VolumeField({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  if (clip.kind !== "video" && clip.kind !== "audio") return null

  return (
    <FractionSliderField
      id="clip-volume"
      label="Volume"
      value={clipVolume(clip)}
      min={MIN_CLIP_VOLUME}
      max={MAX_CLIP_VOLUME}
      step={CLIP_VOLUME_STEP}
      format={formatVolume}
      onChange={(volume, firstOfDrag) =>
        dispatch({
          type: "UPDATE_CLIP",
          clipId: clip.id,
          patch: { volume: storedPlaybackValue(volume, DEFAULT_CLIP_VOLUME) },
          transient: !firstOfDrag,
        })
      }
    />
  )
}

/**
 * How fast this clip plays, and therefore how much of the timeline it takes.
 *
 * The line under the slider is the point: the clip keeps the same stretch of
 * recording and changes how long it takes to play it, so the number people
 * actually want to see is the new length.
 */
function SpeedSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  if (clip.kind !== "video" && clip.kind !== "audio") return null

  return (
    <InspectorCard
      title="Speed"
      description="Playing it faster leaves it less room on the timeline."
    >
      <FractionSliderField
        id="clip-speed"
        label="How fast"
        value={clipSpeed(clip)}
        min={MIN_CLIP_SPEED}
        max={MAX_CLIP_SPEED}
        step={CLIP_SPEED_STEP}
        format={formatSpeed}
        onChange={(speed, firstOfDrag) =>
          dispatch({
            type: "SET_CLIP_SPEED",
            clipId: clip.id,
            speed,
            transient: !firstOfDrag,
          })
        }
      />
      <ReadOnlyRows
        rows={[
          ["Footage used", `${(sourceSpanMs(clip) / 1000).toFixed(1)}s`],
          ["Room on the timeline", `${(clip.durationMs / 1000).toFixed(1)}s`],
        ]}
      />
    </InspectorCard>
  )
}

/**
 * Whether this picture fits inside the frame or fills it.
 *
 * Fitting keeps all of the footage and pays for it with black at two edges,
 * which is what a wide clip does in a tall project. Filling has no black and
 * pays for it by cutting the sides off. Only a clip with a picture gets the
 * choice.
 *
 * A still picture can also be smaller than the frame, which is how a picture
 * sticker arrives. Below full size it is dragged around the preview like text.
 * Video stays the whole frame (see clip-size.ts).
 */
function FrameFitSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  if (clip.kind !== "video" && clip.kind !== "image") return null

  return (
    <InspectorCard
      title="The frame"
      description="Filling crops whatever hangs over the edges."
    >
      <Tabs
        value={clipFit(clip)}
        onValueChange={(next) =>
          dispatch({
            type: "UPDATE_CLIP",
            clipId: clip.id,
            patch: { fit: storedClipFit(next as ClipFit) },
          })
        }
      >
        <TabsList aria-label="How this clip meets the frame">
          {CLIP_FIT_OPTIONS.map((option) => (
            <TabsTrigger key={option.id} value={option.id}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {clip.kind === "image" ? (
        <FractionSliderField
          id="clip-scale"
          label="Size"
          value={clipScale(clip)}
          min={MIN_CLIP_SCALE}
          max={MAX_CLIP_SCALE}
          step={CLIP_SCALE_STEP}
          format={formatPercent}
          onChange={(scale, firstOfDrag) =>
            dispatch({
              type: "UPDATE_CLIP",
              clipId: clip.id,
              patch: { scale: storedClipScale(scale) },
              transient: !firstOfDrag,
            })
          }
        />
      ) : null}
    </InspectorCard>
  )
}

/**
 * A slow move across a still picture. Only a picture gets the choice: footage
 * already moves, and sound and text have no picture to move.
 */
function MotionSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  if (clip.kind !== "image") return null

  return (
    <InspectorCard
      title="Movement"
      description="A slow move across the picture while it is on screen."
    >
      <div className="grid gap-2.5">
        <FieldLabel htmlFor="clip-motion">Move</FieldLabel>
        <Select
          value={clipMotion(clip) ?? "none"}
          onValueChange={(next) =>
            dispatch({
              type: "UPDATE_CLIP",
              clipId: clip.id,
              patch: {
                motion: next === "none" ? undefined : (next as ClipMotion),
              },
            })
          }
        >
          <SelectTrigger id="clip-motion" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIP_MOTION_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </InspectorCard>
  )
}

function formatBrightness(value: number) {
  const amount = Math.round(value * 100)
  return amount > 0 ? `+${amount}` : String(amount)
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

/**
 * Brightness, contrast and saturation on a clip with a picture. The preview
 * and the export use the same three numbers, so what is set here is what the
 * finished film shows.
 *
 * Each slider is one undo step per drag, like volume. The reset clears all
 * three in one step, so one undo brings all three back.
 */
function ColourSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  if (clip.kind !== "video" && clip.kind !== "image") return null
  const colour = clipColour(clip)

  function set(key: keyof ClipColour, value: number, firstOfDrag: boolean) {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: { [key]: storedPlaybackValue(value, UNTOUCHED_COLOUR[key]) },
      transient: !firstOfDrag,
    })
  }

  function reset() {
    if (!isColourTouched(colour)) {
      toast("This clip's colour is already untouched.")
      return
    }
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: {
        brightness: undefined,
        contrast: undefined,
        saturation: undefined,
      },
    })
  }

  return (
    <InspectorCard
      title="Colour"
      description="Lift a dark shot, or make the colours stronger or softer."
    >
      <FractionSliderField
        id="clip-brightness"
        label="Brightness"
        value={colour.brightness}
        min={MIN_CLIP_BRIGHTNESS}
        max={MAX_CLIP_BRIGHTNESS}
        step={CLIP_COLOUR_STEP}
        format={formatBrightness}
        onChange={(value, first) => set("brightness", value, first)}
      />
      <FractionSliderField
        id="clip-contrast"
        label="Contrast"
        value={colour.contrast}
        min={MIN_CLIP_CONTRAST}
        max={MAX_CLIP_CONTRAST}
        step={CLIP_COLOUR_STEP}
        format={formatPercent}
        onChange={(value, first) => set("contrast", value, first)}
      />
      <FractionSliderField
        id="clip-saturation"
        label="Saturation"
        value={colour.saturation}
        min={MIN_CLIP_SATURATION}
        max={MAX_CLIP_SATURATION}
        step={CLIP_COLOUR_STEP}
        format={formatPercent}
        onChange={(value, first) => set("saturation", value, first)}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={reset}
      >
        <RotateCcw />
        Reset colour
      </Button>
    </InspectorCard>
  )
}

function MediaInspector({ clip }: { clip: EditorClip }) {
  const track = useEditorSelector(
    (state) => findClip(state.tracks, clip.id)?.track
  )
  const { dispatch } = useEditorRuntime()
  const [replaceOpen, setReplaceOpen] = React.useState(false)

  function handleReplace(media: ReplacementMedia) {
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: clip.id, media })
    setReplaceOpen(false)
  }

  return (
    <>
      <InspectorCard title="The footage">
        {/* Whatever shape the file is. A box of a fixed shape either crops a
            tall picture down to a slice of itself or leaves a video floating
            in grey, and neither shows you what you picked. So the box takes
            its height from the media, up to the point where it would take over
            the panel. Video shows its first frame, which is why it is a paused
            player rather than a picture. */}
        <div className="grid place-items-center overflow-hidden rounded-lg bg-muted">
          {clip.kind === "video" && clip.url ? (
            <video
              src={clip.url}
              preload="metadata"
              muted
              playsInline
              className="max-h-64 w-full object-contain"
            />
          ) : clip.url ? (
            <img
              src={clip.url}
              alt={clip.name}
              className="max-h-64 w-full object-contain"
            />
          ) : (
            <span className="grid h-24 place-items-center text-sm text-muted-foreground">
              No file on this clip
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setReplaceOpen(true)}
        >
          <Replace />
          Replace media
        </Button>
      </InspectorCard>

      <FrameFitSection clip={clip} />

      <MotionSection clip={clip} />

      <ColourSection clip={clip} />

      <InspectorCard title="Sound">
        <SwitchField
          id="clip-muted"
          label="Mute this clip"
          description="Its own sound is silenced."
          checked={!!clip.muted}
          onChange={(muted) =>
            dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: { muted } })
          }
        />
        <VolumeField clip={clip} />
        {clip.kind === "audio" || clip.kind === "video" ? (
          <SwitchField
            id="clip-fade-out"
            label="Fade out at the end"
            description="Its sound fades away over the last two seconds."
            checked={!!clip.fadeOutMs}
            onChange={(on) =>
              dispatch({
                type: "UPDATE_CLIP",
                clipId: clip.id,
                patch: { fadeOutMs: on ? MUSIC_FADE_OUT_MS : undefined },
              })
            }
          />
        ) : null}
        {track ? (
          <SwitchField
            id="track-duck"
            label="Duck under voice"
            description="This whole track drops while another one is playing."
            checked={!!track.duck}
            onChange={() =>
              dispatch({ type: "TOGGLE_TRACK_DUCK", trackId: track.id })
            }
          />
        ) : null}
      </InspectorCard>

      <SpeedSection clip={clip} />

      <TransitionSection clip={clip} />

      <Timing clip={clip} />

      <ReplaceMediaDialog
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        onReplace={handleReplace}
      />
    </>
  )
}

/**
 * The blend coming into this clip from the one before it. Shown only when the
 * clip is visual and butts directly against another visual clip — the same test
 * the preview applies — so a blend can never be set where none would be drawn.
 */
function TransitionSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const prevClip = useEditorSelector((state) => {
    const found = findClip(state.tracks, clip.id)
    return found ? precedingClipOnTrack(found.track.clips, clip) : null
  })

  const eligible =
    isTransitionableKind(clip.kind) &&
    !!prevClip &&
    isTransitionableKind(prevClip.kind) &&
    Math.abs(clip.startMs - (prevClip.startMs + prevClip.durationMs)) <=
      TRANSITION_ADJACENCY_EPS_MS
  if (!eligible || !prevClip) return null

  const active = clip.transition ?? null
  const currentId: TransitionKind | "none" = active?.kind ?? "none"
  const maxMs = Math.max(
    MIN_TRANSITION_MS,
    Math.min(MAX_TRANSITION_MS, prevClip.durationMs, clip.durationMs)
  )
  const durationMs = clampTransitionMs(
    active?.durationMs ?? DEFAULT_TRANSITION_MS,
    prevClip.durationMs,
    clip.durationMs
  )

  return (
    <InspectorCard
      title="Coming in"
      description="How this clip arrives over the one before it."
    >
      <div className="grid gap-2.5">
        <FieldLabel>Blend</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {TRANSITION_OPTIONS.map((option) => {
            const on = currentId === option.id
            return (
              <button
                key={option.id}
                type="button"
                title={option.description}
                aria-pressed={on}
                onClick={() =>
                  dispatch({
                    type: "UPDATE_CLIP",
                    clipId: clip.id,
                    patch: {
                      transition:
                        option.id === "none"
                          ? undefined
                          : { kind: option.id, durationMs },
                    },
                  })
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/10 bg-background hover:border-foreground/25"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      {active ? (
        <SliderField
          id="clip-transition-ms"
          label="How long"
          unit="ms"
          value={durationMs}
          min={MIN_TRANSITION_MS}
          max={maxMs}
          onChange={(ms) =>
            dispatch({
              type: "UPDATE_CLIP",
              clipId: clip.id,
              patch: {
                transition: {
                  kind: active.kind,
                  durationMs: clampTransitionMs(
                    ms,
                    prevClip.durationMs,
                    clip.durationMs
                  ),
                },
              },
              transient: true,
            })
          }
        />
      ) : null}
    </InspectorCard>
  )
}

function Timing({ clip }: { clip: EditorClip }) {
  return (
    <InspectorCard title="Timing">
      <ReadOnlyRows
        rows={[
          ["Starts at", formatClock(clip.startMs)],
          ["Runs for", `${(clip.durationMs / 1000).toFixed(1)}s`],
        ]}
      />
    </InspectorCard>
  )
}
