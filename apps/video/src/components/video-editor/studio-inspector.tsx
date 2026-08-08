import * as React from "react"
import { FilmIcon, Replace, SlidersHorizontal } from "lucide-react"

import {
  ColorField,
  FieldLabel,
  InspectorCard,
  SliderField,
  SwitchField,
} from "@/components/broadcasts/inspector-fields"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
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
      <WorkspacePanelHeader
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
