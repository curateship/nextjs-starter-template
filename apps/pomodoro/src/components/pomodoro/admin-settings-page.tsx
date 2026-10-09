import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { Textarea } from "@/components/ui/textarea"
import { SafetyPauseLine } from "@/components/pomodoro/admin-safety-banner"
import {
  getAppSettingsErrorMessage,
  savePomodoroSetting,
} from "@/lib/api/pomodoro/app-settings"
import {
  seasonsProblem,
  type AppSettingKey,
  type AppSettingValue,
  type MediaSeason,
} from "@/lib/pomodoro/app-settings"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Pomoder settings page, `/admin/pomodoro-settings`. See
 * `workspace/docs/admin-settings.md`.
 *
 * One card per group of settings, each saving on its own, so changing the
 * timer never resends the seasons. Later admin tasks add their cards here.
 */

type Settings = { [K in AppSettingKey]: AppSettingValue<K> }

export function AdminSettingsPage({
  initial,
  catalog,
}: {
  initial: Settings
  catalog: MediaCatalog
}) {
  const freeSounds = catalog.sounds.filter((sound) => !sound.locked)
  const freeThemes = catalog.themes.filter((theme) => !theme.locked)

  // Held here so the line at the top follows a switch the moment it saves.
  const [pauses, setPauses] = React.useState(initial["safety.pause"])

  return (
    <CardGroup>
      <SafetyPauseLine pauses={pauses} />
      <EmergencyCard pauses={pauses} onSaved={setPauses} />
      <MediaDefaultsCard initial={initial} freeSounds={freeSounds} freeThemes={freeThemes} />
      <SeasonsCard initial={initial["media.seasons"]} freeSounds={freeSounds} freeThemes={freeThemes} />
      <NewAccountTimerCard initial={initial["timer.newAccount"]} />
      <RoomLimitsCard initial={initial["rooms.limits"]} />
      <ChatCard
        initialWords={initial["chat.blockedWords"]}
        initialSpeed={initial["chat.speed"]}
      />
    </CardGroup>
  )
}

type Option = { key: string; label: string }

/** Saves one setting, says so, and reports a refusal in the error toast. */
function useSaveSetting() {
  const [saving, setSaving] = React.useState<AppSettingKey | null>(null)
  const save = React.useCallback(async (key: AppSettingKey, value: unknown, quiet = false) => {
    setSaving(key)
    try {
      await savePomodoroSetting(key, value)
      if (!quiet) toast.success("Settings saved.")
      return true
    } catch (error) {
      showErrorToast(getAppSettingsErrorMessage(error))
      return false
    } finally {
      setSaving(null)
    }
  }, [])
  return { saving, save }
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <Button type="button" disabled={busy} onClick={onClick}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </div>
  )
}

function PairSelect({
  id,
  label,
  hint,
  value,
  options,
  prefix,
  emptyLabel,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string | null
  options: Option[]
  prefix: "curated:" | "scene:"
  emptyLabel: string
  onChange: (value: string | null) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Select
        value={value ?? "none"}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
      >
        <SelectTrigger id={id} className="w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{emptyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.key} value={`${prefix}${option.key}`}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function MediaDefaultsCard({
  initial,
  freeSounds,
  freeThemes,
}: {
  initial: Settings
  freeSounds: Option[]
  freeThemes: Option[]
}) {
  const [shuffle, setShuffle] = React.useState(initial["media.shuffleUnset"])
  const [defaults, setDefaults] = React.useState(initial["media.defaults"])
  const { saving, save } = useSaveSetting()
  const switchId = React.useId()
  const soundId = React.useId()
  const themeId = React.useId()

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-media-defaults"
      title="Themes and sounds"
      description="What guests, and members who never picked their own, see and hear."
      contentClassName="grid gap-4"
    >
      <SettingsSwitchRow
        id={switchId}
        checked={shuffle}
        onCheckedChange={setShuffle}
        label="Shuffle themes and sounds for guests and for members who haven't picked their own"
        hint="A new sound and theme come each time the sound ends, from the free ones for guests. Off, they get the defaults below."
      />
      <div className="flex flex-wrap gap-4">
        <PairSelect
          id={soundId}
          label="Default sound"
          hint="Only free, Live sounds, because guests get it too."
          value={defaults.sound}
          options={freeSounds}
          prefix="curated:"
          emptyLabel="None: a random one for guests, silence for members"
          onChange={(sound) => setDefaults((current) => ({ ...current, sound }))}
        />
        <PairSelect
          id={themeId}
          label="Default theme"
          hint="Also what anybody gets when the theme they picked is made a Draft or deleted."
          value={defaults.background}
          options={freeThemes}
          prefix="scene:"
          emptyLabel="None: a random one for guests, Lofi girl for members"
          onChange={(background) =>
            setDefaults((current) => ({ ...current, background }))
          }
        />
      </div>
      <SaveButton
        busy={saving !== null}
        onClick={async () => {
          if (await save("media.shuffleUnset", shuffle, true))
            await save("media.defaults", defaults)
        }}
      />
    </CollapsibleSettingsCard>
  )
}

function newSeason(): MediaSeason {
  const year = new Date().getUTCFullYear()
  return {
    id: crypto.randomUUID(),
    name: "",
    starts: `${year}-12-01`,
    ends: `${year}-12-31`,
    sound: null,
    background: null,
  }
}

function SeasonsCard({
  initial,
  freeSounds,
  freeThemes,
}: {
  initial: MediaSeason[]
  freeSounds: Option[]
  freeThemes: Option[]
}) {
  const [seasons, setSeasons] = React.useState(initial)
  const { saving, save } = useSaveSetting()
  const update = (id: string, change: Partial<MediaSeason>) =>
    setSeasons((current) =>
      current.map((season) => (season.id === id ? { ...season, ...change } : season))
    )

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-seasons"
      title="Seasons"
      description="A sound and theme that replace the defaults between two dates, such as a snow scene through December. Members who picked their own are not touched."
      contentClassName="grid gap-4"
    >
      {seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No seasons yet.</p>
      ) : null}
      {seasons.map((season) => (
        <SeasonRow
          key={season.id}
          season={season}
          freeSounds={freeSounds}
          freeThemes={freeThemes}
          onChange={(change) => update(season.id, change)}
          onRemove={() =>
            setSeasons((current) => current.filter((item) => item.id !== season.id))
          }
        />
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSeasons((current) => [...current, newSeason()])}
        >
          <PlusIcon className="size-4" />
          Add a season
        </Button>
        <SaveButton
          busy={saving !== null}
          onClick={() => {
            const unnamed = seasons.find((season) => !season.name.trim())
            if (unnamed) {
              showErrorToast("Give every season a name.")
              return
            }
            const problem = seasonsProblem(seasons)
            if (problem) {
              showErrorToast(problem)
              return
            }
            void save("media.seasons", seasons)
          }}
        />
      </div>
    </CollapsibleSettingsCard>
  )
}

function SeasonRow({
  season,
  freeSounds,
  freeThemes,
  onChange,
  onRemove,
}: {
  season: MediaSeason
  freeSounds: Option[]
  freeThemes: Option[]
  onChange: (change: Partial<MediaSeason>) => void
  onRemove: () => void
}) {
  const nameId = React.useId()
  const startsId = React.useId()
  const endsId = React.useId()
  const soundId = React.useId()
  const themeId = React.useId()
  return (
    <div className="grid gap-4 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-48 flex-1 gap-2">
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            id={nameId}
            maxLength={60}
            value={season.name}
            placeholder="Winter"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={startsId}>Starts</FieldLabel>
          <Input
            id={startsId}
            type="date"
            value={season.starts}
            onChange={(event) => onChange({ starts: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={endsId}>Ends</FieldLabel>
          <Input
            id={endsId}
            type="date"
            value={season.ends}
            onChange={(event) => onChange({ ends: event.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove the ${season.name || "new"} season`}
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-4">
        <PairSelect
          id={soundId}
          label="Sound"
          value={season.sound}
          options={freeSounds}
          prefix="curated:"
          emptyLabel="Keep the default sound"
          onChange={(sound) => onChange({ sound })}
        />
        <PairSelect
          id={themeId}
          label="Theme"
          value={season.background}
          options={freeThemes}
          prefix="scene:"
          emptyLabel="Keep the default theme"
          onChange={(background) => onChange({ background })}
        />
      </div>
    </div>
  )
}

function NewAccountTimerCard({
  initial,
}: {
  initial: AppSettingValue<"timer.newAccount">
}) {
  const [timer, setTimer] = React.useState(initial)
  const { saving, save } = useSaveSetting()
  const set = (key: keyof typeof timer) => (value: number) =>
    setTimer((current) => ({ ...current, [key]: value }))
  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-new-account-timer"
      title="New accounts"
      description="The timer a new account and a guest start with. Existing members keep their own settings."
      contentClassName="grid gap-4"
    >
      <div className="flex flex-wrap gap-4">
        <NumberField id="new-focus" label="Focus, minutes" value={timer.focusMinutes} min={1} max={90} onChange={set("focusMinutes")} />
        <NumberField id="new-short" label="Short break, minutes" value={timer.shortBreakMinutes} min={1} max={30} onChange={set("shortBreakMinutes")} />
        <NumberField id="new-long" label="Long break, minutes" value={timer.longBreakMinutes} min={1} max={60} onChange={set("longBreakMinutes")} />
        <NumberField id="new-sessions" label="Sessions before a long break" value={timer.sessionsBeforeLongBreak} min={2} max={8} onChange={set("sessionsBeforeLongBreak")} />
        <NumberField id="new-goal" label="Daily goal, sessions" value={timer.dailyGoalSessions} min={1} max={20} onChange={set("dailyGoalSessions")} />
      </div>
      <SaveButton
        busy={saving !== null}
        onClick={() => void save("timer.newAccount", timer)}
      />
    </CollapsibleSettingsCard>
  )
}

function RoomLimitsCard({ initial }: { initial: AppSettingValue<"rooms.limits"> }) {
  const [limits, setLimits] = React.useState(initial)
  const [peopleLimited, setPeopleLimited] = React.useState(initial.maxPeople !== null)
  const [people, setPeople] = React.useState(initial.maxPeople ?? 20)
  const { saving, save } = useSaveSetting()
  const switchId = React.useId()
  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-room-limits"
      title="Rooms"
      description="How big a room can get, and how much one host can set up. Lowering a limit never takes anybody out of a room; it only refuses the next one."
      contentClassName="grid gap-4"
    >
      <SettingsSwitchRow
        id={switchId}
        checked={peopleLimited}
        onCheckedChange={setPeopleLimited}
        label="Limit how many people one room holds"
        hint={'Off, a room has no limit, as before. The host can always come back into their own room. Somebody turned away is told "This room is full."'}
      />
      <div className="flex flex-wrap gap-4">
        {peopleLimited ? (
          <NumberField id="room-people" label="People in one room" value={people} min={2} max={500} onChange={setPeople} />
        ) : null}
        <NumberField
          id="room-repeats"
          label="Weekly rooms per host"
          value={limits.maxRepeatsPerHost}
          min={1}
          max={50}
          onChange={(value) => setLimits((current) => ({ ...current, maxRepeatsPerHost: value }))}
        />
        <NumberField
          id="room-invites"
          label="Invitations per room"
          value={limits.maxInvitesPerRoom}
          min={1}
          max={200}
          onChange={(value) => setLimits((current) => ({ ...current, maxInvitesPerRoom: value }))}
        />
      </div>
      <SaveButton
        busy={saving !== null}
        onClick={() =>
          void save("rooms.limits", { ...limits, maxPeople: peopleLimited ? people : null })
        }
      />
    </CollapsibleSettingsCard>
  )
}

/**
 * The two switches for a spam wave (admin task 05). Each saves the moment it
 * is flipped, and every open room reads itself again.
 */
function EmergencyCard({
  pauses,
  onSaved,
}: {
  pauses: AppSettingValue<"safety.pause">
  onSaved: (value: AppSettingValue<"safety.pause">) => void
}) {
  const { saving, save } = useSaveSetting()
  const roomsId = React.useId()
  const chatId = React.useId()
  const flip = async (change: Partial<AppSettingValue<"safety.pause">>) => {
    const next = { ...pauses, ...change }
    if (await save("safety.pause", next, true)) {
      onSaved(next)
      toast.success(
        "newRooms" in change
          ? change.newRooms
            ? "New rooms are paused."
            : "New rooms can be opened again."
          : change.chat
            ? "Chat is paused in every room."
            : "Chat is back on in every room."
      )
    }
  }
  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-emergency"
      title="Emergency switches"
      description="For a spam wave. Each one works the moment it is flipped and stays on until switched off."
      contentClassName="grid gap-4"
    >
      <SettingsSwitchRow
        id={roomsId}
        checked={pauses.newRooms}
        disabled={saving !== null}
        onCheckedChange={(checked) => void flip({ newRooms: checked })}
        label="Pause new rooms"
        hint={'Opening or booking a room says "New rooms are paused for a little while." Rooms already open carry on.'}
      />
      <SettingsSwitchRow
        id={chatId}
        checked={pauses.chat}
        disabled={saving !== null}
        onCheckedChange={(checked) => void flip({ chat: checked })}
        label="Pause all chat"
        hint={'Every room\'s message box says "Chat is paused for a little while." and nothing can be sent.'}
      />
    </CollapsibleSettingsCard>
  )
}

/** Blocked words and chat speed (admin task 05). */
function ChatCard({
  initialWords,
  initialSpeed,
}: {
  initialWords: AppSettingValue<"chat.blockedWords">
  initialSpeed: AppSettingValue<"chat.speed">
}) {
  const [wordsText, setWordsText] = React.useState(initialWords.words.join("\n"))
  const [rule, setRule] = React.useState(initialWords.rule)
  const [speed, setSpeed] = React.useState(initialSpeed.messagesPerMinute)
  const { saving, save } = useSaveSetting()
  const wordsId = React.useId()
  const ruleId = React.useId()
  const saveAll = async () => {
    // One per line, ignoring case and repeats.
    const words = [...new Set(wordsText.split("\n").map((word) => word.trim().toLowerCase()).filter(Boolean))]
    if (words.some((word) => word.length > 40)) {
      showErrorToast("A blocked word can be at most 40 letters.")
      return
    }
    if (words.length > 300) {
      showErrorToast("The list holds at most 300 words.")
      return
    }
    const savedWords = await save("chat.blockedWords", { words, rule }, true)
    const savedSpeed = savedWords && (await save("chat.speed", { messagesPerMinute: speed }, true))
    if (savedWords && savedSpeed) {
      setWordsText(words.join("\n"))
      toast.success("Settings saved.")
    }
  }
  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-chat"
      title="Room chat"
      description="Words a message may not carry, and how fast one person may write."
      contentClassName="grid gap-4"
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={wordsId}
          hint={'One per line. Whole words only, ignoring case, so "class" is never caught by "ass". Empty means no filter.'}
        >
          Blocked words
        </FieldLabel>
        <Textarea
          id={wordsId}
          rows={5}
          className="sm:max-w-md"
          value={wordsText}
          onChange={(event) => setWordsText(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ruleId}>A message with one</FieldLabel>
        <Select value={rule} onValueChange={(value) => setRule(value as typeof rule)}>
          <SelectTrigger id={ruleId} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hold">Is held for review: the writer sees it, nobody else does until an admin lets it through</SelectItem>
            <SelectItem value="replace">Goes out with the word turned into stars</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <NumberField
        id="chat-speed"
        label="Messages per minute, per person, in one room"
        value={speed}
        min={1}
        max={120}
        onChange={setSpeed}
      />
      <SaveButton busy={saving !== null} onClick={() => void saveAll()} />
    </CollapsibleSettingsCard>
  )
}
