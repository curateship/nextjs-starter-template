import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { formatAiEstimate } from "@/lib/video/ai-estimates"
import { AI_SOUND_MAX_SECONDS, AI_SOUND_MIN_SECONDS } from "@/lib/video/ai-sound-effects"
import { flowNodeMakingCents } from "@/lib/video/flow/estimates"
import {
  FLOW_CLIP_SECONDS,
  FLOW_MUSIC_SECONDS_MAX,
  FLOW_MUSIC_SECONDS_MIN,
  FLOW_MUSIC_SERVICE_NAMES,
  FLOW_MUSIC_SERVICES,
  FLOW_MUSIC_TRACKS_MAX,
  type FlowMusicService,
  type FlowNodeSettings,
} from "@/lib/video/flow/node-kinds"
import { sizeFor, VIDEO_COMPANIES, VIDEO_MODELS, type VideoCompany, type VideoSize } from "@/lib/video/video-models"

type MakingKind = "ai-clip" | "ai-music" | "ai-sound"

/**
 * What an AI clip, music or sound node makes, beside its prompt (task 04):
 * the clip's model, size, length, loop and sound; the music's service, how
 * many tracks and how long each; the sound's length and loop. Under them,
 * what it costs a run, the price each run shows again before paying.
 */
export function FlowMakingCard({
  nodeId,
  kind,
  settings,
  set,
}: {
  nodeId: string
  kind: MakingKind
  settings: FlowNodeSettings
  set: (change: Partial<FlowNodeSettings>) => void
}) {
  const id = (field: string) => `flow-node-${field}-${nodeId}`
  const cents = flowNodeMakingCents(kind, settings)
  return (
    <PanelCard storageId="video-flow-node-making" icon={<SlidersHorizontalIcon />} title="What it makes">
      <div className="@container grid gap-4">
        {kind === "ai-clip" ? <ClipFields id={id} settings={settings} set={set} /> : null}
        {kind === "ai-music" ? <MusicFields id={id} settings={settings} set={set} /> : null}
        {kind === "ai-sound" ? <SoundFields id={id} settings={settings} set={set} /> : null}
        <p className="text-xs text-muted-foreground">
          {formatAiEstimate(cents).replace(/^about/, "About")} a run. Each run shows the price and waits for your OK before paying.
        </p>
      </div>
    </PanelCard>
  )
}

type FieldsProps = { id: (field: string) => string; settings: FlowNodeSettings; set: (change: Partial<FlowNodeSettings>) => void }

function ClipFields({ id, settings, set }: FieldsProps) {
  const clip = settings.clip
  const model = VIDEO_MODELS[clip.company]
  const setClip = (change: Partial<FlowNodeSettings["clip"]>) => set({ clip: { ...clip, ...change } })
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor={id("model")}>Video model</FieldLabel>
        <Select
          value={clip.company}
          onValueChange={(next) => {
            const company = next as VideoCompany
            // A model that can't end on its start can't loop; its own sizes only.
            setClip({ company, size: sizeFor(company, clip.size), loops: VIDEO_MODELS[company].endFrame ? clip.loops : false })
          }}
        >
          <SelectTrigger id={id("model")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_COMPANIES.map((company) => (
              <SelectItem key={company} value={company}>
                {VIDEO_MODELS[company].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 @[18rem]:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor={id("size")}>Quality</FieldLabel>
          <Select value={clip.size} onValueChange={(next) => setClip({ size: next as VideoSize })}>
            <SelectTrigger id={id("size")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {model.sizes.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={id("seconds")}>Length</FieldLabel>
          <Select value={String(clip.seconds)} onValueChange={(next) => setClip({ seconds: Number(next) as FlowNodeSettings["clip"]["seconds"] })}>
            <SelectTrigger id={id("seconds")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOW_CLIP_SECONDS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {seconds} seconds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel
          htmlFor={id("loops")}
          hint={
            model.endFrame
              ? "On, the clip ends on the picture it starts on, so it repeats with no join."
              : `${model.label} can't end on its start. Pick Seedance or Wan to loop.`
          }
        >
          Ends on its start
        </FieldLabel>
        <Switch id={id("loops")} checked={clip.loops} disabled={!model.endFrame} onCheckedChange={(loops) => setClip({ loops })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id("sound")} hint={model.soundSwitch ? undefined : `${model.label} always makes sound with its clips.`}>
          With sound
        </FieldLabel>
        <Switch
          id={id("sound")}
          checked={model.soundSwitch ? clip.sound : true}
          disabled={!model.soundSwitch}
          onCheckedChange={(sound) => setClip({ sound })}
        />
      </div>
    </>
  )
}

function MusicFields({ id, settings, set }: FieldsProps) {
  const music = settings.music
  const setMusic = (change: Partial<FlowNodeSettings["music"]>) => set({ music: { ...music, ...change } })
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor={id("service")} hint="Suno joins this list once it has an API that can be relied on.">
          Service
        </FieldLabel>
        <Select value={music.service} onValueChange={(next) => setMusic({ service: next as FlowMusicService })}>
          <SelectTrigger id={id("service")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLOW_MUSIC_SERVICES.map((service) => (
              <SelectItem key={service} value={service}>
                {FLOW_MUSIC_SERVICE_NAMES[service]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 @[18rem]:grid-cols-2">
        <NumberField
          id={id("tracks")}
          label="Tracks"
          hint={`Each a little different, up to ${FLOW_MUSIC_TRACKS_MAX}.`}
          value={music.tracks}
          min={1}
          max={FLOW_MUSIC_TRACKS_MAX}
          step={1}
          onCommit={(tracks) => setMusic({ tracks })}
        />
        <NumberField
          id={id("track-seconds")}
          label="Seconds each"
          hint={`${FLOW_MUSIC_SECONDS_MIN} to ${FLOW_MUSIC_SECONDS_MAX} seconds.`}
          value={music.seconds}
          min={FLOW_MUSIC_SECONDS_MIN}
          max={FLOW_MUSIC_SECONDS_MAX}
          step={1}
          onCommit={(seconds) => setMusic({ seconds })}
        />
      </div>
    </>
  )
}

function SoundFields({ id, settings, set }: FieldsProps) {
  const sound = settings.sound
  const setSound = (change: Partial<FlowNodeSettings["sound"]>) => set({ sound: { ...sound, ...change } })
  return (
    <>
      <NumberField
        id={id("sound-seconds")}
        label="Seconds"
        hint={`${AI_SOUND_MIN_SECONDS} to ${AI_SOUND_MAX_SECONDS} seconds.`}
        value={sound.seconds}
        min={AI_SOUND_MIN_SECONDS}
        max={AI_SOUND_MAX_SECONDS}
        step={0.5}
        onCommit={(seconds) => setSound({ seconds })}
      />
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id("sound-loops")} hint="On, it is made to repeat with no join, for an ambience under a whole video.">
          Loops
        </FieldLabel>
        <Switch id={id("sound-loops")} checked={sound.loops} onCheckedChange={(loops) => setSound({ loops })} />
      </div>
    </>
  )
}

/**
 * A number typed freely and saved when the field is left or Enter is pressed,
 * held to its range then (UI standard: "Validation runs when the field is
 * left"), so typing 120 never stops at a minimum on the way.
 */
function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const typed = Number(draft)
    setDraft(null)
    if (draft.trim() && Number.isFinite(typed)) onCommit(Math.min(max, Math.max(min, typed)))
  }
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
      />
    </div>
  )
}
