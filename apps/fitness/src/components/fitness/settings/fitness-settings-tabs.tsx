import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { WeightInput } from "@/components/fitness/weight-input"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  changeCalendarFeed,
  loadCalendarFeed,
  loadFitnessSettings,
  saveFitnessSetting,
} from "@/lib/api/fitness/profile"
import type { AppSettingKey, AppSettingValue, FitnessAppSettings } from "@/lib/fitness/app-settings"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { fromKg, toKg, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Fitness's own tabs under Settings, App settings. Tyler, 18 Oct 2026: "all
 * these settings live in settings page in the app settings reserved for the
 * app." Each is one answer for the whole app, set by the site admin, and
 * saves by itself: a switch or a pick at once, typing 700ms after the last key
 * or when the field is left. The page header says Saving…, Saved or Not saved.
 *
 * Moving between tabs draws at once, the way the shell's own tabs do: the
 * settings are read from the server once per page and held in `held`, and
 * every edit goes into `held` before its save is sent (the same as Pomoder's
 * `admin-settings-tabs.tsx`).
 */

const SAVE_DELAY_MS = 700

/** The settings as the admin last left them, held while the page is open. Browser only. */
let held: FitnessAppSettings | null = null
/** The admin's own calendar feed address, once read. Undefined means not read yet. */
let heldFeed: string | null | undefined

const inBrowser = () => typeof window !== "undefined"

function hold<K extends AppSettingKey>(key: K, value: AppSettingValue<K>) {
  if (!held) return undefined
  const before = held[key]
  held = { ...held, [key]: value }
  return before
}

// ---------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------

export function UnitsSettingsTab() {
  return <SettingsTab>{(settings) => <UnitsCard initial={settings.units} />}</SettingsTab>
}

export function WorkoutsSettingsTab() {
  return (
    <SettingsTab>
      {(settings) => <WorkoutsCard initial={settings.workouts} />}
    </SettingsTab>
  )
}

export function RemindersSettingsTab() {
  return <SettingsTab>{(settings) => <RemindersCard initial={settings.reminders} />}</SettingsTab>
}

export function CalendarFeedSettingsTab() {
  return (
    <CardGroup>
      <CalendarFeedCard />
    </CardGroup>
  )
}

/**
 * The held settings, or the first read of them with a loading row. Every
 * later open draws from `held` at once.
 */
function SettingsTab({ children }: { children: (settings: FitnessAppSettings) => React.ReactNode }) {
  const [loaded, setLoaded] = React.useState<FitnessAppSettings | null>(() => (inBrowser() ? held : null))
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    if (held) return
    let live = true
    loadFitnessSettings().then(
      (settings) => {
        held = settings
        if (!live) return
        setLoaded(settings)
        setError(null)
      },
      (failure) => {
        if (live) setError(getFitnessErrorMessage(failure))
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
          <LoadingRow label="Loading Fitness settings…" />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Saving by itself
// ---------------------------------------------------------------------------

/**
 * Every save on one tab, one after another, each reported in the page header.
 * A refused save says why there and in the error toast, and its edit comes
 * back out of `held`.
 */
function useSettingSave() {
  const setStatus = useReportedSaveStatus()
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())
  const pending = React.useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>())

  const now = React.useCallback(
    <K extends AppSettingKey>(key: K, value: AppSettingValue<K>) => {
      const waiting = pending.current.get(key)
      if (waiting) {
        clearTimeout(waiting.timer)
        pending.current.delete(key)
      }
      const before = hold(key, value)
      queue.current = queue.current.then(async () => {
        setStatus("saving")
        try {
          await saveFitnessSetting(key, value)
          setStatus("saved")
        } catch (error) {
          if (before !== undefined) hold(key, before)
          const message = getFitnessErrorMessage(error)
          setStatus({ blocked: message })
          showErrorToast(message)
        }
      })
    },
    [setStatus]
  )

  const soon = React.useCallback(
    <K extends AppSettingKey>(key: K, value: AppSettingValue<K>) => {
      const waiting = pending.current.get(key)
      if (waiting) clearTimeout(waiting.timer)
      const run = () => {
        pending.current.delete(key)
        now(key, value)
      }
      pending.current.set(key, { timer: setTimeout(run, SAVE_DELAY_MS), run })
    },
    [now]
  )

  const flush = React.useCallback((key: AppSettingKey) => {
    const waiting = pending.current.get(key)
    if (!waiting) return
    clearTimeout(waiting.timer)
    waiting.run()
  }, [])

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

  return React.useMemo(() => ({ now, soon, flush }), [now, soon, flush])
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

function UnitsCard({ initial }: { initial: AppSettingValue<"units"> }) {
  const [units, setUnits] = React.useState(initial)
  const save = useSettingSave()
  const ids = { unit: React.useId(), step: React.useId(), bar: React.useId(), plates: React.useId() }
  const unit = units.unit
  const change = (next: AppSettingValue<"units">) => {
    setUnits(next)
    save.now("units", next)
  }
  return (
    <CollapsibleSettingsCard
      storageId="fitness-units"
      title="Units and plates"
      description="How every weight in the app is shown, and the bar and plates the warm-ups and plate lists use. Weights are always stored in kilograms, so switching units changes what is shown and nothing that was logged."
      contentClassName="grid gap-4"
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.unit}>Weights in</FieldLabel>
        <Select value={unit} onValueChange={(value) => change({ ...units, unit: value as WeightUnit })}>
          <SelectTrigger id={ids.unit} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kg">Kilograms (kg)</SelectItem>
            <SelectItem value="lb">Pounds (lb)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={ids.step}
            hint="The smallest jump your plates allow. Weights are rounded to it, so with 2.5 kg a lighter week of 61 kg loads as 60 kg."
          >
            {`Smallest jump (${unit})`}
          </FieldLabel>
          <WeightInput
            id={ids.step}
            valueKg={units.stepKg}
            unit={unit}
            onCommit={(kg) => {
              if (kg === null || kg < 0.1) {
                showErrorToast("Type the smallest jump your plates allow, such as 2.5.")
                return
              }
              change({ ...units, stepKg: kg })
            }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={ids.bar}>{`Empty bar (${unit})`}</FieldLabel>
          <WeightInput
            id={ids.bar}
            valueKg={units.barKg}
            unit={unit}
            onCommit={(kg) => change({ ...units, barKg: kg ?? 0 })}
          />
        </div>
      </div>
      <PlatesField
        id={ids.plates}
        platesKg={units.platesKg}
        unit={unit}
        onCommit={(platesKg) => change({ ...units, platesKg })}
      />
    </CollapsibleSettingsCard>
  )
}

/** The plates on hand, typed as a list in the app's unit: "25, 20, 15, 10, 5, 2.5". */
function PlatesField({
  id,
  platesKg,
  unit,
  onCommit,
}: {
  id: string
  platesKg: number[]
  unit: WeightUnit
  onCommit: (platesKg: number[]) => void
}) {
  // Two decimals, not the one every other weight shows: a 1.25 kg plate is a
  // real plate, and "1.3" saved back would be a plate nobody owns.
  const shown = platesKg.map((plate) => String(Math.round(fromKg(plate, unit) * 100) / 100)).join(", ")
  const [draft, setDraft] = React.useState(shown)
  const [lastShown, setLastShown] = React.useState(shown)
  if (shown !== lastShown) {
    setLastShown(shown)
    setDraft(shown)
  }
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    if (draft.trim() === shown) return
    const values = draft
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((part) => Number(part.replace(",", ".")))
    const kgs = values.map((value) => toKg(value, unit))
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0) || kgs.some((kg) => kg > 60)) {
      setInvalid(true)
      showErrorToast(`List the plates you have, separated by commas, each up to ${Math.round(fromKg(60, unit))} ${unit}.`)
      return
    }
    setInvalid(false)
    onCommit(kgs)
  }

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint="One of each size you have, heaviest first or in any order. The plate list under each set is worked out from these.">
        {`Plates (${unit})`}
      </FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={draft}
        aria-invalid={invalid || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}

function WorkoutsCard({ initial }: { initial: AppSettingValue<"workouts"> }) {
  const [workouts, setWorkouts] = React.useState(initial)
  const save = useSettingSave()
  const ids = { warmups: React.useId(), goal: React.useId(), sex: React.useId() }
  return (
    <CollapsibleSettingsCard
      storageId="fitness-workouts"
      title="Workouts"
      description="What every workout starts with and the weekly goal the Programs dashboard counts against."
      contentClassName="grid gap-4"
    >
      <SettingsSwitchRow
        id={ids.warmups}
        checked={workouts.warmupsOn}
        onCheckedChange={(warmupsOn) => {
          const next = { ...workouts, warmupsOn }
          setWorkouts(next)
          save.now("workouts", next)
        }}
        label="Add warm-up sets before each heavy lift"
        hint="The empty bar for 10, then 40, 60 and 80 out of 100 of the working weight. Warm-ups never count toward records."
      />
      <NumberField
        id={ids.goal}
        label="Workouts a week"
        hint="The weekly goal. Weeks in a row at or above it make the streak."
        min={1}
        max={14}
        value={workouts.weeklyGoal}
        onChange={(weeklyGoal) => {
          const next = { ...workouts, weeklyGoal }
          setWorkouts(next)
          save.soon("workouts", next)
        }}
        onCommit={() => save.flush("workouts")}
      />
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.sex} hint="Only used to compare a lift with others of the same size and sex. Not set hides those comparisons.">
          Sex
        </FieldLabel>
        <Select
          value={workouts.sex ?? "none"}
          onValueChange={(value) => {
            const next = { ...workouts, sex: value === "none" ? null : (value as "male" | "female") }
            setWorkouts(next)
            save.now("workouts", next)
          }}
        >
          <SelectTrigger id={ids.sex} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CollapsibleSettingsCard>
  )
}

function RemindersCard({ initial }: { initial: AppSettingValue<"reminders"> }) {
  const [reminders, setReminders] = React.useState(initial)
  const [time, setTime] = React.useState(initial.time)
  const save = useSettingSave()
  const ids = {
    on: React.useId(),
    nudge: React.useId(),
    checkIn: React.useId(),
    photo: React.useId(),
    time: React.useId(),
    channel: React.useId(),
  }
  const change = (next: AppSettingValue<"reminders">) => {
    setReminders(next)
    save.now("reminders", next)
  }

  function commitTime() {
    if (time === reminders.time) return
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      showErrorToast("Pick a time of day, such as 07:00.")
      return
    }
    change({ ...reminders, time })
  }

  return (
    <CollapsibleSettingsCard
      storageId="fitness-reminders"
      title="Reminders"
      description="A notice on the days a person's active program has a workout, a nudge the day after one they missed, the weekly check-in and the photo day reminder. Each person gets them on their own clock."
      contentClassName="grid gap-4"
    >
      <SettingsSwitchRow
        id={ids.on}
        checked={reminders.remindersOn}
        onCheckedChange={(remindersOn) => change({ ...reminders, remindersOn })}
        label="Remind people on workout days"
      />
      <SettingsSwitchRow
        id={ids.nudge}
        checked={reminders.nudgeOn}
        onCheckedChange={(nudgeOn) => change({ ...reminders, nudgeOn })}
        label="Nudge people the day after a missed workout"
        hint="One nudge per missed workout, never one a day after it."
      />
      <SettingsSwitchRow
        id={ids.checkIn}
        checked={reminders.checkInOn}
        onCheckedChange={(checkInOn) => change({ ...reminders, checkInOn })}
        label="Ask people with a coach for a weekly check-in"
        hint="On Sundays: bodyweight, sleep, stress, how training felt and a note to the coach."
      />
      <SettingsSwitchRow
        id={ids.photo}
        checked={reminders.photoReminderOn}
        onCheckedChange={(photoReminderOn) => change({ ...reminders, photoReminderOn })}
        label="Remind people when a photo day is due"
        hint="Four weeks after their last photo day, once, until they save the next one."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor={ids.time}>Send at</FieldLabel>
          <Input
            id={ids.time}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            onBlur={commitTime}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitTime()
              }
            }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={ids.channel}>Send it by</FieldLabel>
          <Select
            value={reminders.channel}
            onValueChange={(value) => change({ ...reminders, channel: value as "bell" | "email" | "both" })}
          >
            <SelectTrigger id={ids.channel} className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bell">The bell in the app</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="both">The bell and email</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </CollapsibleSettingsCard>
  )
}

/**
 * The signed-in person's own calendar feed. The on and off switch is the
 * person's, because the address carries their own secret, but it lives here
 * with the other settings.
 */
function CalendarFeedCard() {
  const [url, setUrl] = React.useState<string | null | undefined>(() => (inBrowser() ? heldFeed : undefined))
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const addressId = React.useId()

  React.useEffect(() => {
    if (heldFeed !== undefined) return
    let live = true
    loadCalendarFeed().then(
      (result) => {
        heldFeed = result.url
        if (live) setUrl(result.url)
      },
      (failure) => {
        if (live) setError(getFitnessErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [reloads])

  async function run(action: "reset" | "off") {
    setBusy(true)
    try {
      const result = await changeCalendarFeed(action)
      heldFeed = result.url
      setUrl(result.url)
      toast.success(
        action === "off"
          ? "Calendar feed turned off."
          : url
            ? "New address made. The old one has stopped working."
            : "Calendar feed turned on."
      )
    } catch (failure) {
      reportFitnessError(failure)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Address copied.")
    } catch {
      showErrorToast("The address couldn't be copied. Select it and copy it by hand.")
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="fitness-calendar-feed"
      title="Calendar feed"
      description="Your planned workouts in Google Calendar or Apple Calendar. It only goes one way: moving an event there doesn't move the workout. The address is yours alone."
      contentClassName="grid gap-4"
    >
      {error ? (
        <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
      ) : url === undefined ? (
        <LoadingRow label="Loading your calendar feed…" />
      ) : url ? (
        <>
          <div className="grid gap-2">
            <FieldLabel htmlFor={addressId}>Your address</FieldLabel>
            <div className="flex gap-2">
              <Input id={addressId} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="Copy the address" onClick={() => void copy()}>
                    <CopyIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy the address</TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground">Paste this into Google Calendar, Other calendars, From URL.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void run("reset")}>
              Reset address
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void run("off")}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" disabled={busy} onClick={() => void run("reset")}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Turn on
          </Button>
        </div>
      )}
    </CollapsibleSettingsCard>
  )
}
