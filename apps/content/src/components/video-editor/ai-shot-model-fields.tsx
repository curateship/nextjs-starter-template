import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { VideoChoices } from "@/lib/api/video/generations"
import { pickCompany, type ShotMakingPick } from "@/lib/video/shot-making"
import {
  sizeOptionLabel,
  videoQualityName,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import {
  isKeyedCompany,
  VIDEO_COMPANIES,
  VIDEO_MODELS,
  type VideoCompany,
} from "@/lib/video/video-models"

/**
 * Who makes a shot and how: the model, the size, and on Seedance whether it
 * makes its own sound (`workspace/docs/wan-and-seedance.md`). The AI clip
 * panel and Make it move both draw these, so a shot is picked the same way
 * wherever it is asked for.
 */
export function ShotModelFields({
  idPrefix,
  choices,
  pick,
  onPick,
  lengthSeconds,
  disabled,
}: {
  idPrefix: string
  choices: VideoChoices
  pick: ShotMakingPick
  onPick: (pick: ShotMakingPick) => void
  lengthSeconds: ShotLengthSeconds
  disabled: boolean
}) {
  const model = VIDEO_MODELS[pick.company]
  const sound = model.soundSwitch ? pick.sound : true
  return (
    <>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <Select
          value={pick.company}
          onValueChange={(value) => onPick(pickCompany(choices, value as VideoCompany))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-model`} className="max-w-full min-w-0">
            <SelectValue>{model.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VIDEO_COMPANIES.map((company) => (
              <SelectItem key={company} value={company} disabled={!choices.ready[company]}>
                {VIDEO_MODELS[company].label}
                {choices.ready[company]
                  ? ""
                  : isKeyedCompany(company)
                    ? " · add a key in Settings → AI video"
                    : " · add a Gemini key in Settings → AI"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <Label htmlFor={`${idPrefix}-quality`}>Quality</Label>
        <Select
          value={pick.quality}
          onValueChange={(value) => onPick({ ...pick, quality: value as VideoQuality })}
          disabled={disabled}
        >
          {/* The closed list shows the size alone; the prices are in the
              open list and the line below, which have the room. */}
          <SelectTrigger id={`${idPrefix}-quality`} className="max-w-full min-w-0">
            <SelectValue>
              {pick.company === "gemini" ? videoQualityName(pick.quality) : pick.quality}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {model.sizes.map((size) => (
              <SelectItem key={size} value={size}>
                {sizeOptionLabel(pick.company, size, lengthSeconds, sound)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {model.soundSwitch ? (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${idPrefix}-sound`}>Make its own sound</Label>
          <Switch
            id={`${idPrefix}-sound`}
            checked={pick.sound}
            disabled={disabled}
            onCheckedChange={(on) => onPick({ ...pick, sound: on })}
          />
        </div>
      ) : null}
    </>
  )
}

/** "Anywhere" in the Ends on list. */
const NO_END_FRAME = "none"
/** "Nothing" in the Says list: the shot makes its own sound. */
const NO_VOICE = "none"

/** A picture the shot can land on, or a voiceover the person can say. */
export type PickOption = { id: string; name: string }

export function EndFrameField({
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string
  options: PickOption[]
  value: string | null
  onChange: (value: string | null) => void
  disabled: boolean
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <Label htmlFor={id}>Ends on</Label>
      <Select
        value={value ?? NO_END_FRAME}
        onValueChange={(next) => onChange(next === NO_END_FRAME ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="max-w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_END_FRAME}>Anywhere</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function VoiceField({
  id,
  options,
  value,
  onChange,
  disabled,
  note,
}: {
  id: string
  options: PickOption[]
  value: string | null
  onChange: (value: string | null) => void
  disabled: boolean
  /** Why some voiceovers are missing from the list, when they are. */
  note: string | null
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <Label htmlFor={id}>Says</Label>
      <Select
        value={value ?? NO_VOICE}
        onValueChange={(next) => onChange(next === NO_VOICE ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="max-w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_VOICE}>Nothing</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}
