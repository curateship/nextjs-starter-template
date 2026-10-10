import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { SafetyPauseLine } from "@/components/pomodoro/admin-safety-banner"
import { forgetMadeUpIds } from "@/components/pomodoro/admin-member-name"
import {
  getAppSettingsErrorMessage,
  loadPomodoroSettings,
  savePomodoroSetting,
} from "@/lib/api/pomodoro/app-settings"
import {
  getPixabayKeyErrorMessage,
  loadPixabayKeyStatus,
  savePixabayKey,
  type PixabayKeyStatus,
} from "@/lib/api/pomodoro/admin-pixabay"
import {
  getSimulatedErrorMessage,
  loadSimulatedMembers,
  makeSimulatedMembersNow,
  previewSimulatedVoice,
  removeAllSimulatedMembers,
  type SimulatedStatus,
} from "@/lib/api/pomodoro/admin-simulated"
import {
  BREAK_MESSAGE_MAX,
  SIMULATED_HOURS_MAX,
  SIMULATED_TARGET_MAX,
  VOICE_BRIEF_MAX,
  seasonsProblem,
  type AppSettingKey,
  type AppSettingValue,
  type MediaSeason,
} from "@/lib/pomodoro/app-settings"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * Pomoder's own tabs under Settings → App settings, one per group. See
 * `workspace/docs/admin-settings.md`.
 *
 * Tyler, 9 Oct 2026: "This settings page should be here and it has to be auto
 * save." So every tab is listed in `settings.tabs` in `src/app/options.ts`
 * and saves each change by itself: a switch or a pick at once, typing 700ms
 * after the last key or when the field is left. The page header says Saving…,
 * Saved or Not saved with the reason.
 *
 * Moving between tabs draws at once, the way the shell's own tabs do. The
 * shell holds its settings record in memory and writes every edit into it
 * before the save goes out (`shell-layout.tsx`); these tabs do the same with
 * `held`, read from the server once per page.
 */

type Settings = { [K in AppSettingKey]: AppSettingValue<K> }
type Loaded = { settings: Settings; catalog: MediaCatalog }
type Option = { key: string; label: string }

/** Typing waits this long after the last key, the same as the shell's own Settings. */
const SAVE_DELAY_MS = 700

/**
 * The settings as the admin last left them, held while the page is open.
 * Filled in the browser only: on the server a module is shared by every
 * request, so nothing is ever written to it there.
 */
let held: Loaded | null = null
let heldPixabay: PixabayKeyStatus | null = null
let heldMadeUp: SimulatedStatus | null = null

const inBrowser = () => typeof window !== "undefined"

/** One setting into `held` as it is edited. Returns what it replaced, to put back if the save is refused. */
function hold<K extends AppSettingKey>(key: K, value: Settings[K]): Settings[K] | undefined {
  if (!held) return undefined
  const before = held.settings[key]
  held = { ...held, settings: { ...held.settings, [key]: value } }
  return before
}

// ---------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------

export function SafetySettingsTab() {
  return (
    <SettingsTab>
      {({ settings }) => <SafetyGroup initial={settings["safety.pause"]} />}
    </SettingsTab>
  )
}

export function MediaSettingsTab() {
  return (
    <SettingsTab>
      {({ settings, catalog }) => <MediaDefaultsCard initial={settings} {...freeOptions(catalog)} />}
    </SettingsTab>
  )
}

export function SeasonsSettingsTab() {
  return (
    <SettingsTab>
      {({ settings, catalog }) => (
        <SeasonsCard initial={settings["media.seasons"]} {...freeOptions(catalog)} />
      )}
    </SettingsTab>
  )
}

export function BreaksSettingsTab() {
  return (
    <SettingsTab>
      {({ settings, catalog }) => (
        <BreakLookCard
          initial={settings["break.look"]}
          freeThemes={freeOptions(catalog).freeThemes}
        />
      )}
    </SettingsTab>
  )
}

export function NewAccountsSettingsTab() {
  return (
    <SettingsTab>
      {({ settings }) => <NewAccountTimerCard initial={settings["timer.newAccount"]} />}
    </SettingsTab>
  )
}

export function RoomsSettingsTab() {
  return (
    <SettingsTab>
      {({ settings }) => <RoomLimitsCard initial={settings["rooms.limits"]} />}
    </SettingsTab>
  )
}

export function ChatSettingsTab() {
  return (
    <SettingsTab>
      {({ settings }) => (
        <ChatCard
          initialWords={settings["chat.blockedWords"]}
          initialSpeed={settings["chat.speed"]}
        />
      )}
    </SettingsTab>
  )
}

export function PixabaySettingsTab() {
  return (
    <CardGroup>
      <PixabayCard />
    </CardGroup>
  )
}

export function MadeUpMembersSettingsTab() {
  return (
    <SettingsTab>
      {({ settings }) => (
        <>
          <MadeUpMembersCard initial={settings["simulated.accounts"]} />
          <HowTheySoundCard initial={settings["simulated.voice"]} />
        </>
      )}
    </SettingsTab>
  )
}

/**
 * The held settings, or the first read of them with a loading row. Every
 * later open draws from `held` at once and reads the server again quietly,
 * taking only the list of themes and sounds from it, so a theme made Live on
 * another page reaches the pickers. The settings themselves are read once,
 * like the shell's own record: an edit made here is already in `held`.
 */
function SettingsTab({ children }: { children: (loaded: Loaded) => React.ReactNode }) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(() => (inBrowser() ? held : null))
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let live = true
    // The Pixabay tab reads its key's status on its own; asked for here too,
    // so that tab draws at once the first time it is opened as well.
    if (!heldPixabay)
      loadPixabayKeyStatus().then(
        (status) => {
          heldPixabay ??= status
        },
        () => undefined
      )
    loadPomodoroSettings().then(
      (next) => {
        held = held ? { ...held, catalog: next.catalog } : next
        if (!live) return
        setLoaded(held)
        setError(null)
      },
      (failure) => {
        // Already drawn from `held`: a failed quiet read changes nothing.
        if (live && !held) setError(getAppSettingsErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [reloads])

  if (loaded) return <CardGroup>{children(loaded)}</CardGroup>
  return (
    <Card>
      <CardContent>
        {error ? (
          <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
        ) : (
          <LoadingRow label="Loading Pomoder settings…" />
        )}
      </CardContent>
    </Card>
  )
}

function freeOptions(catalog: MediaCatalog) {
  return {
    freeSounds: catalog.sounds.filter((sound) => !sound.locked),
    freeThemes: catalog.themes.filter((theme) => !theme.locked),
  }
}

// ---------------------------------------------------------------------------
// Saving by itself
// ---------------------------------------------------------------------------

type Pending = { timer: ReturnType<typeof setTimeout>; run: () => void }

/**
 * Every save on one tab: one after another on a queue, so two quick edits
 * reach the database in the order they were made, each reported in the page
 * header. A refused save says why there and in the error toast; what was
 * typed stays on screen.
 */
function useAutoSave(describeError: (error: unknown) => string) {
  const setStatus = useReportedSaveStatus()
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())
  const pending = React.useRef(new Map<string, Pending>())

  const cancel = React.useCallback((id: string) => {
    const waiting = pending.current.get(id)
    if (!waiting) return
    clearTimeout(waiting.timer)
    pending.current.delete(id)
  }, [])

  /** Saves now. Resolves true once it is stored; `undo` runs if it is refused. */
  const now = React.useCallback(
    (id: string, action: () => Promise<unknown>, undo?: () => void) => {
      cancel(id)
      const run = queue.current.then(async () => {
        setStatus("saving")
        try {
          await action()
          setStatus("saved")
          return true
        } catch (error) {
          undo?.()
          const message = describeError(error)
          setStatus({ blocked: message })
          showErrorToast(message)
          return false
        }
      })
      queue.current = run
      return run
    },
    [cancel, describeError, setStatus]
  )

  /** Saves once typing stops, replacing a save of the same thing still waiting. */
  const soon = React.useCallback(
    (id: string, action: () => Promise<unknown>, undo?: () => void) => {
      cancel(id)
      const run = () => {
        pending.current.delete(id)
        void now(id, action, undo)
      }
      pending.current.set(id, { timer: setTimeout(run, SAVE_DELAY_MS), run })
    },
    [cancel, now]
  )

  /** A waiting save goes at once, when its field is left or Enter is pressed. */
  const flush = React.useCallback((id: string) => {
    const waiting = pending.current.get(id)
    if (!waiting) return
    clearTimeout(waiting.timer)
    waiting.run()
  }, [])

  /** A value that fails its check is not sent, and the header says why. */
  const refuse = React.useCallback(
    (id: string, reason: string) => {
      cancel(id)
      setStatus({ blocked: reason })
    },
    [cancel, setStatus]
  )

  // Leaving the tab mid-typing still saves what was typed.
  React.useEffect(() => {
    const waiting = pending.current
    return () => {
      for (const save of waiting.values()) {
        clearTimeout(save.timer)
        save.run()
      }
    }
  }, [])

  return React.useMemo(
    () => ({ now, soon, flush, refuse, cancel }),
    [now, soon, flush, refuse, cancel]
  )
}

/**
 * One Pomoder setting through `useAutoSave`. The edit goes into `held` before
 * the save is sent, so a tab opened again straight away shows it, and comes
 * back out if the save is refused.
 */
function useSettingSave() {
  const save = useAutoSave(getAppSettingsErrorMessage)
  return React.useMemo(() => {
    const send = <K extends AppSettingKey>(key: K, value: Settings[K]) => {
      const before = hold(key, value)
      return {
        action: () => savePomodoroSetting(key, value),
        undo: () => {
          if (before !== undefined) hold(key, before)
        },
      }
    }
    return {
      now: <K extends AppSettingKey>(key: K, value: Settings[K]) => {
        const { action, undo } = send(key, value)
        return save.now(key, action, undo)
      },
      soon: <K extends AppSettingKey>(key: K, value: Settings[K]) => {
        const { action, undo } = send(key, value)
        save.soon(key, action, undo)
      },
      flush: save.flush,
      refuse: save.refuse,
    }
  }, [save])
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

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
  const save = useSettingSave()
  const switchId = React.useId()
  const soundId = React.useId()
  const themeId = React.useId()
  const pick = (next: typeof defaults) => {
    setDefaults(next)
    void save.now("media.defaults", next)
  }

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
        onCheckedChange={(checked) => {
          setShuffle(checked)
          void save.now("media.shuffleUnset", checked)
        }}
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
          onChange={(sound) => pick({ ...defaults, sound })}
        />
        <PairSelect
          id={themeId}
          label="Default theme"
          hint="Also what anybody gets when the theme they picked is made a Draft or deleted."
          value={defaults.background}
          options={freeThemes}
          prefix="scene:"
          emptyLabel="None: a random one for guests, Lofi girl for members"
          onChange={(background) => pick({ ...defaults, background })}
        />
      </div>
    </CollapsibleSettingsCard>
  )
}

/**
 * The break theme and message. Tyler, 9 Oct 2026: "Add a feature for admin to
 * choose a theme that changes to it for break timer and an area for text so I
 * can put some encourgement text or tips."
 */
function BreakLookCard({
  initial,
  freeThemes,
}: {
  initial: AppSettingValue<"break.look">
  freeThemes: Option[]
}) {
  const [look, setLook] = React.useState(initial)
  const save = useSettingSave()
  const themeId = React.useId()
  const messageId = React.useId()
  const tooLong = look.message.length > BREAK_MESSAGE_MAX
  const tooLongReason = `The message can be at most ${BREAK_MESSAGE_MAX} characters.`

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-break-look"
      title="Breaks"
      description="What everybody sees while a short or long break is on, on the timer and in rooms."
      contentClassName="grid gap-4"
    >
      <PairSelect
        id={themeId}
        label="Break theme"
        hint="Replaces everybody's own theme until the break ends. Only free, Live themes, because guests take breaks too."
        value={look.background}
        options={freeThemes}
        prefix="scene:"
        emptyLabel="None: everybody keeps their own theme"
        onChange={(background) => {
          const next = { ...look, background }
          setLook(next)
          if (tooLong) save.refuse("break.look", tooLongReason)
          else void save.now("break.look", next)
        }}
      />
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={messageId}
          hint="Encouragement or a tip, shown on the break card under the heading. Line breaks are kept. Empty shows nothing."
        >
          Break message
        </FieldLabel>
        <Textarea
          id={messageId}
          rows={4}
          className="sm:max-w-xl"
          value={look.message}
          aria-invalid={tooLong ? true : undefined}
          placeholder="You're doing great. Drink some water before the next round."
          onChange={(event) => {
            const next = { ...look, message: event.target.value }
            setLook(next)
            if (next.message.length > BREAK_MESSAGE_MAX)
              save.refuse("break.look", tooLongReason)
            else save.soon("break.look", next)
          }}
          onBlur={() => save.flush("break.look")}
        />
        <p
          role={tooLong ? "alert" : undefined}
          className={cn("text-sm text-muted-foreground", tooLong && "text-destructive")}
        >
          {tooLong ? "Not saved. " : null}
          {look.message.length} of {BREAK_MESSAGE_MAX} characters
        </p>
      </div>
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

/** Why a list of seasons cannot be saved, or null. */
function seasonsRefusal(seasons: MediaSeason[]) {
  if (seasons.some((season) => !season.name.trim())) return "Give every season a name."
  return seasonsProblem(seasons)
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
  const save = useSettingSave()
  const problem = seasonsRefusal(seasons)
  const change = (next: MediaSeason[], { typing }: { typing: boolean }) => {
    setSeasons(next)
    const refusal = seasonsRefusal(next)
    if (refusal) save.refuse("media.seasons", refusal)
    else if (typing) save.soon("media.seasons", next)
    else void save.now("media.seasons", next)
  }
  const update = (id: string, patch: Partial<MediaSeason>, typing: boolean) =>
    change(
      seasons.map((season) => (season.id === id ? { ...season, ...patch } : season)),
      { typing }
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
          onChange={(patch, typing) => update(season.id, patch, typing)}
          onLeave={() => save.flush("media.seasons")}
          onRemove={() =>
            change(
              seasons.filter((item) => item.id !== season.id),
              { typing: false }
            )
          }
        />
      ))}
      {problem && seasons.length ? (
        <p role="alert" className="text-sm text-destructive">
          Not saved. {problem}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => change([...seasons, newSeason()], { typing: false })}
      >
        <PlusIcon className="size-4" />
        Add a season
      </Button>
    </CollapsibleSettingsCard>
  )
}

function SeasonRow({
  season,
  freeSounds,
  freeThemes,
  onChange,
  onLeave,
  onRemove,
}: {
  season: MediaSeason
  freeSounds: Option[]
  freeThemes: Option[]
  /** `typing` waits for the last key; a pick saves at once. */
  onChange: (patch: Partial<MediaSeason>, typing: boolean) => void
  onLeave: () => void
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
            aria-invalid={!season.name.trim() || undefined}
            onChange={(event) => onChange({ name: event.target.value }, true)}
            onBlur={onLeave}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={startsId}>Starts</FieldLabel>
          <Input
            id={startsId}
            type="date"
            value={season.starts}
            onChange={(event) => onChange({ starts: event.target.value }, true)}
            onBlur={onLeave}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={endsId}>Ends</FieldLabel>
          <Input
            id={endsId}
            type="date"
            value={season.ends}
            onChange={(event) => onChange({ ends: event.target.value }, true)}
            onBlur={onLeave}
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
          onChange={(sound) => onChange({ sound }, false)}
        />
        <PairSelect
          id={themeId}
          label="Theme"
          value={season.background}
          options={freeThemes}
          prefix="scene:"
          emptyLabel="Keep the default theme"
          onChange={(background) => onChange({ background }, false)}
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
  const save = useSettingSave()
  const field = (key: keyof typeof timer) => ({
    value: timer[key],
    onChange: (value: number) => {
      const next = { ...timer, [key]: value }
      setTimer(next)
      save.soon("timer.newAccount", next)
    },
    onCommit: () => save.flush("timer.newAccount"),
  })
  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-new-account-timer"
      title="New accounts"
      description="The timer a new account and a guest start with. Existing members keep their own settings."
      contentClassName="grid gap-4"
    >
      <div className="flex flex-wrap gap-4">
        <NumberField id="new-focus" label="Focus, minutes" min={1} max={90} {...field("focusMinutes")} />
        <NumberField id="new-short" label="Short break, minutes" min={1} max={30} {...field("shortBreakMinutes")} />
        <NumberField id="new-long" label="Long break, minutes" min={1} max={60} {...field("longBreakMinutes")} />
        <NumberField id="new-sessions" label="Sessions before a long break" min={2} max={8} {...field("sessionsBeforeLongBreak")} />
        <NumberField id="new-goal" label="Daily goal, sessions" min={1} max={20} {...field("dailyGoalSessions")} />
      </div>
    </CollapsibleSettingsCard>
  )
}

function RoomLimitsCard({ initial }: { initial: AppSettingValue<"rooms.limits"> }) {
  const [limits, setLimits] = React.useState(initial)
  const [peopleLimited, setPeopleLimited] = React.useState(initial.maxPeople !== null)
  const [people, setPeople] = React.useState(initial.maxPeople ?? 20)
  const save = useSettingSave()
  const switchId = React.useId()
  const stored = (next: { limits?: typeof limits; limited?: boolean; people?: number }) => {
    const value = next.limits ?? limits
    return {
      ...value,
      maxPeople: (next.limited ?? peopleLimited) ? (next.people ?? people) : null,
    }
  }
  const setLimit = (key: "maxRepeatsPerHost" | "maxInvitesPerRoom") => (value: number) => {
    const next = { ...limits, [key]: value }
    setLimits(next)
    save.soon("rooms.limits", stored({ limits: next }))
  }
  const commit = () => save.flush("rooms.limits")
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
        onCheckedChange={(checked) => {
          setPeopleLimited(checked)
          void save.now("rooms.limits", stored({ limited: checked }))
        }}
        label="Limit how many people one room holds"
        hint={'Off, a room has no limit, as before. The host can always come back into their own room. Somebody turned away is told "This room is full."'}
      />
      <div className="flex flex-wrap gap-4">
        {peopleLimited ? (
          <NumberField
            id="room-people"
            label="People in one room"
            value={people}
            min={2}
            max={500}
            onChange={(value) => {
              setPeople(value)
              save.soon("rooms.limits", stored({ people: value }))
            }}
            onCommit={commit}
          />
        ) : null}
        <NumberField
          id="room-repeats"
          label="Weekly rooms per host"
          value={limits.maxRepeatsPerHost}
          min={1}
          max={50}
          onChange={setLimit("maxRepeatsPerHost")}
          onCommit={commit}
        />
        <NumberField
          id="room-invites"
          label="Invitations per room"
          value={limits.maxInvitesPerRoom}
          min={1}
          max={200}
          onChange={setLimit("maxInvitesPerRoom")}
          onCommit={commit}
        />
      </div>
    </CollapsibleSettingsCard>
  )
}

/**
 * The two switches for a spam wave (admin task 05). Each saves the moment it
 * is flipped, every open room reads itself again, and the line above them
 * follows. A refused flip goes back.
 */
function SafetyGroup({ initial }: { initial: AppSettingValue<"safety.pause"> }) {
  const [pauses, setPauses] = React.useState(initial)
  const save = useSettingSave()
  const roomsId = React.useId()
  const chatId = React.useId()
  const flip = async (change: Partial<AppSettingValue<"safety.pause">>) => {
    const before = pauses
    const next = { ...pauses, ...change }
    setPauses(next)
    if (!(await save.now("safety.pause", next))) {
      setPauses(before)
      return
    }
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
  return (
    <>
      <SafetyPauseLine pauses={pauses} />
      <CollapsibleSettingsCard
        storageId="pomodoro-emergency"
        title="Emergency switches"
        description="For a spam wave. Each one works the moment it is flipped and stays on until switched off."
        contentClassName="grid gap-4"
      >
        <SettingsSwitchRow
          id={roomsId}
          checked={pauses.newRooms}
          onCheckedChange={(checked) => void flip({ newRooms: checked })}
          label="Pause new rooms"
          hint={'Opening or booking a room says "New rooms are paused for a little while." Rooms already open carry on.'}
        />
        <SettingsSwitchRow
          id={chatId}
          checked={pauses.chat}
          onCheckedChange={(checked) => void flip({ chat: checked })}
          label="Pause all chat"
          hint={'Every room\'s message box says "Chat is paused for a little while." and nothing can be sent.'}
        />
      </CollapsibleSettingsCard>
    </>
  )
}

/** The words as stored: one per line, lower case, no repeats. */
function blockedWords(text: string) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}

function blockedWordsRefusal(words: string[]) {
  if (words.some((word) => word.length > 40)) return "A blocked word can be at most 40 letters."
  if (words.length > 300) return "The list holds at most 300 words."
  return null
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
  const save = useSettingSave()
  const wordsId = React.useId()
  const ruleId = React.useId()
  const problem = blockedWordsRefusal(blockedWords(wordsText))

  const saveWords = (text: string, nextRule: typeof rule, typing: boolean) => {
    const words = blockedWords(text)
    const refusal = blockedWordsRefusal(words)
    if (refusal) save.refuse("chat.blockedWords", refusal)
    else if (typing) save.soon("chat.blockedWords", { words, rule: nextRule })
    else void save.now("chat.blockedWords", { words, rule: nextRule })
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
          aria-invalid={problem ? true : undefined}
          onChange={(event) => {
            setWordsText(event.target.value)
            saveWords(event.target.value, rule, true)
          }}
          onBlur={() => save.flush("chat.blockedWords")}
        />
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            Not saved. {problem}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ruleId}>A message with one</FieldLabel>
        <Select
          value={rule}
          onValueChange={(value) => {
            const next = value as typeof rule
            setRule(next)
            saveWords(wordsText, next, false)
          }}
        >
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
        onChange={(value) => {
          setSpeed(value)
          save.soon("chat.speed", { messagesPerMinute: value })
        }}
        onCommit={() => save.flush("chat.speed")}
      />
    </CollapsibleSettingsCard>
  )
}

const PIXABAY_KEY_PATTERN = /^[\x21-\x7e]{10,100}$/

/**
 * The Pixabay API key that "Import from Pixabay" on the Themes page uses. It
 * never reaches the browser: the card reads only whether one is saved and its
 * last four characters. A pasted key saves itself once it looks like a key;
 * removing one asks first.
 */
function PixabayCard() {
  const [status, setShownStatus] = React.useState<PixabayKeyStatus | null>(() =>
    inBrowser() ? heldPixabay : null
  )
  const setStatus = (next: PixabayKeyStatus) => {
    heldPixabay = next
    setShownStatus(next)
  }
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [draft, setDraft] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [removeBusy, setRemoveBusy] = React.useState(false)
  const save = useAutoSave(getPixabayKeyErrorMessage)
  const keyId = React.useId()

  React.useEffect(() => {
    let live = true
    loadPixabayKeyStatus().then(
      (next) => {
        heldPixabay = next
        if (!live) return
        setShownStatus(next)
        setLoadError(null)
      },
      (error) => {
        if (live && !heldPixabay) setLoadError(getPixabayKeyErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [reloads])

  // `typed` rides in as an argument: the waiting save stores exactly what was
  // typed when it was scheduled, and clears the field only if it still says so.
  const store = (typed: string) => async () => {
    setStatus(await savePixabayKey(typed.trim()))
    setDraft((current) => (current === typed ? "" : current))
  }

  const check = (typed: string) => {
    if (!typed.trim()) return
    if (PIXABAY_KEY_PATTERN.test(typed.trim())) return
    setInvalid(true)
    save.refuse(
      "pixabay",
      "That does not look like a Pixabay key. Copy the whole key from pixabay.com/api/docs, with no spaces."
    )
  }

  const remove = async () => {
    setRemoveBusy(true)
    try {
      setStatus(await savePixabayKey(null))
      setRemoving(false)
      toast.success("Pixabay key removed.")
    } catch (error) {
      showErrorToast(getPixabayKeyErrorMessage(error))
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-pixabay"
      title="Pixabay"
      description="The API key Import from Pixabay uses to copy pictures and films onto the Themes page. A free one comes with a Pixabay account at pixabay.com/api/docs. Music links need no key. Pasting a key saves it."
      contentClassName="grid gap-4"
    >
      {loadError ? (
        <ErrorRow message={loadError} onRetry={() => setReloads((count) => count + 1)} />
      ) : !status ? (
        <LoadingRow label="Loading the Pixabay key…" />
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <FieldLabel
              htmlFor={keyId}
              hint="It is scrambled before it is stored, and only its last four characters are ever shown again."
            >
              API key
            </FieldLabel>
            <span className="text-sm text-muted-foreground">
              {status.configured ? `Saved ${status.maskedTail}` : "Not set"}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={keyId}
              className="sm:flex-1"
              type="password"
              autoComplete="off"
              placeholder={
                status.configured ? "Paste a new key to replace it" : "Paste your Pixabay API key"
              }
              value={draft}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                const typed = event.target.value
                setInvalid(false)
                setDraft(typed)
                // Half a key is not sent; leaving the field says what is wrong.
                if (PIXABAY_KEY_PATTERN.test(typed.trim())) save.soon("pixabay", store(typed))
                else save.cancel("pixabay")
              }}
              onBlur={() => {
                check(draft)
                save.flush("pixabay")
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                check(draft)
                save.flush("pixabay")
              }}
            />
            {status.configured || status.unreadable ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={removeBusy}
                onClick={() => setRemoving(true)}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {status.unreadable ? (
            <p role="alert" className="text-sm text-destructive">
              The saved key can no longer be unscrambled, because the server's
              secret storage key changed or went missing. Paste the key again.
            </p>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false)
        }}
        title="Remove the Pixabay key?"
        description="Import from Pixabay stops fetching pictures and films until a key is saved again. Links already importing are refused with that reason."
        confirmLabel="Remove key"
        loading={removeBusy}
        onConfirm={() => void remove()}
      />
    </CollapsibleSettingsCard>
  )
}

/** How often the card reads the count again while Make them now is going. */
const MAKING_POLL_MS = 3_000

/**
 * The made-up members (live activity task 01). Tyler, 9 Oct 2026: "We just
 * need real accounts that mimic live activities." How many, Hours a day and
 * Pause everything save themselves like every setting; Make them now and
 * Remove all are actions, and only Remove all asks first. See
 * `workspace/docs/made-up-members.md`.
 */
function MadeUpMembersCard({ initial }: { initial: AppSettingValue<"simulated.accounts"> }) {
  const [dial, setDial] = React.useState(initial)
  const [status, setShownStatus] = React.useState<SimulatedStatus | null>(() =>
    inBrowser() ? heldMadeUp : null
  )
  const setStatus = (next: SimulatedStatus) => {
    heldMadeUp = next
    setShownStatus(next)
  }
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [makeBusy, setMakeBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [removeBusy, setRemoveBusy] = React.useState(false)
  const save = useSettingSave()
  const pauseId = React.useId()
  const making = status?.making ?? false

  // Read on open, and every few seconds while a batch is being made so the
  // count climbs on screen.
  React.useEffect(() => {
    let live = true
    const read = () =>
      loadSimulatedMembers().then(
        (next) => {
          heldMadeUp = next
          if (!live) return
          setShownStatus(next)
          setLoadError(null)
        },
        (error) => {
          if (live && !heldMadeUp) setLoadError(getSimulatedErrorMessage(error))
        }
      )
    void read()
    const timer = making ? setInterval(read, MAKING_POLL_MS) : null
    return () => {
      live = false
      if (timer) clearInterval(timer)
    }
  }, [reloads, making])

  // Whether a typed number may not be stored yet when Make them now is pressed.
  const typed = React.useRef(false)
  const change = (patch: Partial<typeof dial>, typing: boolean) => {
    const next = { ...dial, ...patch }
    setDial(next)
    typed.current ||= typing
    if (typing) save.soon("simulated.accounts", next)
    else void save.now("simulated.accounts", next)
  }

  const makeNow = async () => {
    setMakeBusy(true)
    try {
      // A number just typed is stored first, so the batch aims at it.
      if (typed.current) {
        typed.current = false
        if (!(await save.now("simulated.accounts", dial))) return
      }
      const result = await makeSimulatedMembersNow()
      setStatus(result)
      if (result.queued)
        toast.success(`Making ${result.target - result.made} made-up members. It takes about a minute.`)
      else toast.success(`All ${result.target} are made already. Raise How many to make more.`)
    } catch (error) {
      showErrorToast(getSimulatedErrorMessage(error))
    } finally {
      setMakeBusy(false)
    }
  }

  const removeAll = async () => {
    setRemoveBusy(true)
    try {
      const { removed, leaving } = await removeAllSimulatedMembers()
      forgetMadeUpIds()
      setRemoving(false)
      toast.success(
        `Removed ${removed} made-up member${removed === 1 ? "" : "s"}.` +
          (leaving
            ? ` ${leaving} host${leaving === 1 ? " stays" : "s stay"} until the real people in ${leaving === 1 ? "its room" : "their rooms"} leave.`
            : "")
      )
      setReloads((count) => count + 1)
    } catch (error) {
      showErrorToast(getSimulatedErrorMessage(error))
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-made-up-members"
      title="Made-up members"
      description="Ordinary-looking accounts that focus every day on a habit of their own, so the site never looks empty. Nobody can sign in as one and none is ever emailed. Admin lists mark them Made up; members never see the mark."
      contentClassName="grid gap-4"
    >
      {loadError ? (
        <ErrorRow message={loadError} onRetry={() => setReloads((count) => count + 1)} />
      ) : !status ? (
        <LoadingRow label="Counting made-up members…" />
      ) : (
        <p className="flex items-center gap-2 text-sm" role="status">
          {making ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
          {making
            ? `${status.made} of ${status.target} made`
            : `${status.made} made${status.focusingNow ? `, ${status.focusingNow} focusing now` : ""}`}
          {status.leaving
            ? `. ${status.leaving} removed host${status.leaving === 1 ? " is" : "s are"} waiting for real people to leave ${status.leaving === 1 ? "its room" : "their rooms"}`
            : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <NumberField
          id="made-up-target"
          label="How many"
          hint="Below this, a new one arrives every three to five days. Lowering it never removes anybody."
          value={dial.target}
          min={0}
          max={SIMULATED_TARGET_MAX}
          onChange={(target) => change({ target }, true)}
          onCommit={() => save.flush("simulated.accounts")}
        />
        <NumberField
          id="made-up-hours"
          label="Hours a day"
          hint="The most any of them focuses in one day. At three, a real member who works hard can still reach the top."
          value={dial.hoursCap}
          min={1}
          max={SIMULATED_HOURS_MAX}
          onChange={(hoursCap) => change({ hoursCap }, true)}
          onCommit={() => save.flush("simulated.accounts")}
        />
      </div>
      <SettingsSwitchRow
        id={pauseId}
        checked={dial.paused}
        onCheckedChange={(paused) => change({ paused }, false)}
        label="Pause everything: no new sessions start and no new faces arrive"
        hint="Sessions already running finish. Make them now still works."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={makeBusy} onClick={() => void makeNow()}>
          {makeBusy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
          Make them now
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={removeBusy}
          onClick={() => {
            if (status && status.made === 0) toast.success("There are no made-up members to remove.")
            else setRemoving(true)
          }}
        >
          Remove all
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        A new account can take up to five minutes to show on /users.
      </p>
      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false)
        }}
        title="Remove all made-up members?"
        description={`Removes ${status?.made ?? "the"} made-up accounts and everything they did. Real members are untouched. A host with a real person in its room stays until they leave.`}
        confirmLabel="Remove all"
        loading={removeBusy}
        onConfirm={() => void removeAll()}
      />
    </CollapsibleSettingsCard>
  )
}

type Voice = AppSettingValue<"simulated.voice">
type VoicePreview = Awaited<ReturnType<typeof previewSimulatedVoice>>

const CHATTINESS_LABELS: Record<Voice["chattiness"], string> = {
  quiet: "Quiet: greetings and the odd reply",
  normal: "Normal",
  talkative: "Talkative: most breaks, every reply",
}
const LENGTH_LABELS: Record<Voice["length"], string> = {
  few: "A few words",
  one: "One line",
  two: "Two lines",
}
const TYPO_LABELS: Record<Voice["typo"], string> = {
  off: "Never",
  "1in20": "One line in 20",
  "1in10": "One line in 10",
}

/**
 * How the made-up members sound in rooms (live activity task 03). Tyler, 9 Oct
 * 2026: "There should be options to adjust how the ai sounds too so it doesnt
 * sound like ai." Every field saves itself; Preview writes five lines with the
 * values on the card and sends them nowhere, and the rooms stay silent until
 * it has been pressed once.
 */
function HowTheySoundCard({ initial }: { initial: Voice }) {
  const [voice, setVoice] = React.useState(initial)
  const [neverSayText, setNeverSayText] = React.useState(initial.neverSay.join("\n"))
  const [preview, setPreview] = React.useState<VoicePreview | null>(null)
  const [previewBusy, setPreviewBusy] = React.useState(false)
  const save = useSettingSave()
  const briefId = React.useId()
  const chattyId = React.useId()
  const lengthId = React.useId()
  const typoId = React.useId()
  const lowerId = React.useId()
  const emojiId = React.useId()
  const neverId = React.useId()
  const briefTooLong = voice.brief.length > VOICE_BRIEF_MAX

  const change = (patch: Partial<Voice>, typing: boolean) => {
    const next = { ...voice, ...patch }
    setVoice(next)
    if (next.brief.length > VOICE_BRIEF_MAX) {
      save.refuse("simulated.voice", `The style brief is ${next.brief.length - VOICE_BRIEF_MAX} characters too long.`)
      return
    }
    if (typing) save.soon("simulated.voice", next)
    else void save.now("simulated.voice", next)
  }

  const runPreview = async () => {
    setPreviewBusy(true)
    try {
      setPreview(await previewSimulatedVoice(voice))
    } catch (error) {
      showErrorToast(getSimulatedErrorMessage(error))
    } finally {
      setPreviewBusy(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="pomodoro-made-up-voice"
      title="How they sound"
      description="The style every line in a room is written in, by Claude Haiku 4.5 when an Anthropic key is saved on Settings → AI, or from fixed lines when not. Rooms stay quiet until Preview has been pressed once."
      contentClassName="grid gap-4"
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor={briefId} hint="In your own words. Each account's own personality line, set in its member window, is added to this.">
          Style brief
        </FieldLabel>
        <Textarea
          id={briefId}
          className="sm:max-w-xl"
          value={voice.brief}
          aria-invalid={briefTooLong || undefined}
          onChange={(event) => change({ brief: event.target.value }, true)}
          onBlur={() => save.flush("simulated.voice")}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-2">
          <FieldLabel htmlFor={chattyId}>How often they talk</FieldLabel>
          <Select value={voice.chattiness} onValueChange={(chattiness) => change({ chattiness: chattiness as Voice["chattiness"] }, false)}>
            <SelectTrigger id={chattyId} className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHATTINESS_LABELS) as Voice["chattiness"][]).map((key) => (
                <SelectItem key={key} value={key}>
                  {CHATTINESS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={lengthId}>How long a line is</FieldLabel>
          <Select value={voice.length} onValueChange={(length) => change({ length: length as Voice["length"] }, false)}>
            <SelectTrigger id={lengthId} className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LENGTH_LABELS) as Voice["length"][]).map((key) => (
                <SelectItem key={key} value={key}>
                  {LENGTH_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={typoId} hint="Two letters swapped in one word, never in a name.">
            Typos
          </FieldLabel>
          <Select value={voice.typo} onValueChange={(typo) => change({ typo: typo as Voice["typo"] }, false)}>
            <SelectTrigger id={typoId} className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPO_LABELS) as Voice["typo"][]).map((key) => (
                <SelectItem key={key} value={key}>
                  {TYPO_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SettingsSwitchRow
        id={lowerId}
        checked={voice.lowercase}
        onCheckedChange={(lowercase) => change({ lowercase }, false)}
        label="Write every line in lowercase"
      />
      <SettingsSwitchRow
        id={emojiId}
        checked={voice.emoji}
        onCheckedChange={(emoji) => change({ emoji }, false)}
        label="Allow an emoji now and then"
      />
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={neverId}
          hint={'One phrase per line, matched anywhere in a line, ignoring case. A line holding just "!" means no line may end with an exclamation mark. A line that says one of these is written again, then replaced by a fixed line.'}
        >
          Never say
        </FieldLabel>
        <Textarea
          id={neverId}
          className="sm:max-w-xl"
          value={neverSayText}
          onChange={(event) => {
            setNeverSayText(event.target.value)
            const neverSay = event.target.value
              .split("\n")
              .map((phrase) => phrase.trim())
              .filter(Boolean)
              .slice(0, 100)
              .map((phrase) => phrase.slice(0, 80))
            change({ neverSay }, true)
          }}
          onBlur={() => save.flush("simulated.voice")}
        />
      </div>
      <div>
        <Button type="button" variant="outline" disabled={previewBusy} onClick={() => void runPreview()}>
          {previewBusy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
          Preview
        </Button>
      </div>
      {preview ? (
        <div className="grid gap-2" aria-live="polite">
          {!preview.hasKey ? (
            <p className="text-sm text-muted-foreground">
              Add the Anthropic key on Settings → AI first. These are the fixed lines the rooms use without one.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">As {preview.speaker}, sent to no room:</p>
          <ul className="grid gap-2">
            {preview.lines.map((row) => (
              <li key={row.kind} className="grid gap-0.5 border-b pb-2 last:border-b-0 last:pb-0">
                <span className="text-xs text-muted-foreground">
                  {row.label}
                  {row.source === "fixed" && preview.hasKey ? " · fixed line, the written one failed the checks" : ""}
                </span>
                <span className="text-sm">{row.line ?? "Nothing passed the checks."}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CollapsibleSettingsCard>
  )
}
