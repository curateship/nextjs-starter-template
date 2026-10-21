import * as React from "react"
import { CalendarPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { renameProfile } from "@/lib/api/dating/profiles"
import { disconnectGoogleCalendar, loadGoogleCalendar, type CalendarConnection } from "@/lib/api/dating/chats"
import { loadDatingSettings, saveDatingSettingsNow } from "@/lib/api/dating/settings"
import { datingErrorMessage } from "@/lib/dating/errors"
import { DATING_APP_WORDS, PROFILE_NAME_MAX } from "@/lib/dating/options"
import {
  DATING_STYLES,
  DATING_STYLE_WORDS,
  datingSettingsProblem,
  knownPeopleText,
  MAX_EXAMPLES,
  parseKnownPeople,
  type DatingSettings,
  type DatingStyle,
  type KnownPerson,
} from "@/lib/dating/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Dating settings, shown in the window the cog on the Dating dashboard
 * opens (`dating-settings-dialog.tsx`); they left Settings → App settings on
 * 20 Oct 2026, because they differ per profile (task "features/06-profiles"):
 * these are the open profile's. What the AI is told about the member and what they want, how it
 * decides, the limits on the phone, and Google Calendar. Every change saves
 * by itself: typing 700ms after the last key or when the field is left, a
 * switch or a pick at once. The page header says Saving…, Saved or Not saved.
 *
 * Read once per page and held for the profile they belong to, so opening
 * the window again draws at once.
 * Tyler's choices of 17 Oct 2026 are the defaults.
 */

/** Typing waits this long after the last key, the same as the shell's own Settings. */
const SAVE_DELAY_MS = 700

/** The settings as last saved or edited, and whose, held while the page is open. Written in the browser only. */
let held: { accountId: string; values: DatingSettings } | null = null
const inBrowser = () => typeof window !== "undefined"

function DatingSettingsTab({ profile, onRenamed }: { profile: DatingDashboard["profile"]; onRenamed: () => void }) {
  const accountId = profile.id
  const [values, setValues] = React.useState<DatingSettings | null>(() => (inBrowser() && held?.accountId === accountId ? held.values : null))
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => {
    let live = true
    loadDatingSettings().then(
      (next) => {
        // An edit made while this was on its way wins.
        if (held?.accountId !== accountId) held = { accountId, values: next }
        if (live) {
          setValues(held.values)
          setError(null)
        }
      },
      (failure: unknown) => {
        if (live && held?.accountId !== accountId) setError(datingErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [reloads, accountId])

  // A save still waiting when the tab closes goes now, so nothing typed is lost.
  React.useEffect(
    () => () => {
      if (timer.current && held) {
        clearTimeout(timer.current)
        void saveDatingSettingsNow(held.values).catch(() => {})
      }
    },
    []
  )

  async function save(next: DatingSettings) {
    clearTimeout(timer.current)
    timer.current = undefined
    const problem = datingSettingsProblem(next)
    if (problem) {
      setSaveStatus({ blocked: problem })
      showErrorToast(problem)
      return
    }
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveDatingSettingsNow(next)
      setSaveStatus("saved")
    } catch (failure) {
      const words = datingErrorMessage(failure)
      setSaveStatus({ blocked: words })
      showErrorToast(words)
    }
  }

  function change(next: DatingSettings, at: "now" | "soon") {
    held = { accountId, values: next }
    setValues(next)
    clearTimeout(timer.current)
    if (at === "now") void save(next)
    else timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS)
  }

  if (!values) {
    return error ? <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} /> : <LoadingRow label="Reading your Dating settings" />
  }

  const set = <K extends keyof DatingSettings>(key: K, value: DatingSettings[K], at: "now" | "soon" = "soon") => change({ ...values, [key]: value }, at)
  const commit = () => {
    if (timer.current) void save(values)
  }
  const examples = Array.from({ length: MAX_EXAMPLES }, (_, index) => values.examples[index] ?? "")

  return (
    <CardGroup>
      <ProfileCard profile={profile} onRenamed={onRenamed} />
      <CollapsibleSettingsCard
        storageId="date-settings-you"
        title="About you"
        description="The AI uses only these facts about you, and writes in the voice of your examples. It never makes a fact up."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="date-about-me" hint="Your job, where you live, what you like doing. Answers to the AI's questions are added here too.">
            About me
          </FieldLabel>
          <Textarea id="date-about-me" rows={1} value={values.aboutMe} onChange={(event) => set("aboutMe", event.target.value)} onBlur={commit} />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="date-example-0" hint="Three to five messages you have sent, as you wrote them. The AI matches their length, capitals and emoji.">
            Your example messages
          </FieldLabel>
          {examples.map((example, index) => (
            <Textarea
              key={index}
              id={`date-example-${index}`}
              rows={1}
              aria-label={`Example message ${index + 1}`}
              value={example}
              onChange={(event) => {
                const next = [...examples]
                next[index] = event.target.value
                set("examples", next)
              }}
              onBlur={commit}
            />
          ))}
        </div>
        <SettingsSwitchRow
          id="date-learn-from-sends"
          checked={values.learnFromSends}
          onCheckedChange={(on) => set("learnFromSends", on, "now")}
          label="Also learn from my last 10 sent messages"
          hint="Messages you write yourself, or change before sending, become extra examples of your voice. The AI's own messages, drafts sent unchanged and anything with a phone number are left out."
        />
        <div className="grid gap-2">
          <FieldLabel htmlFor="date-style">Style</FieldLabel>
          <Select value={values.style} onValueChange={(style) => set("style", style as DatingStyle, "now")}>
            <SelectTrigger id="date-style" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATING_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {DATING_STYLE_WORDS[style]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-looking-for"
        title="Who you are looking for"
        description="The AI scores each card out of 100 against this, from the photos and the words."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="date-looking-for">Looking for</FieldLabel>
          <Textarea id="date-looking-for" rows={1} value={values.lookingFor} onChange={(event) => set("lookingFor", event.target.value)} onBlur={commit} />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="date-dealbreakers" hint="A card that clearly hits one of these is always passed, whatever its score.">
            Dealbreakers
          </FieldLabel>
          <Textarea id="date-dealbreakers" rows={1} value={values.dealbreakers} onChange={(event) => set("dealbreakers", event.target.value)} onBlur={commit} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="date-age-min"
            label="Youngest"
            value={values.ageMin}
            min={18}
            max={99}
            onChange={(value) => set("ageMin", value)}
            onCommit={commit}
          />
          <NumberField id="date-age-max" label="Oldest" value={values.ageMax} min={18} max={99} onChange={(value) => set("ageMax", value)} onCommit={commit} />
        </div>
        <NumberField
          id="date-max-distance"
          label="Furthest away, in km"
          hint="The phone copies this and your ages into Tinder's own settings, so Tinder stops showing cards Date would pass anyway."
          value={values.maxDistanceKm}
          min={2}
          max={160}
          inputClassName="w-full sm:w-32"
          onChange={(value) => set("maxDistanceKm", value)}
          onCommit={commit}
        />
        <KnownPeopleField people={values.knownPeople} onChange={(people) => set("knownPeople", people)} onCommit={commit} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-swiping"
        title="Swiping"
        description="A card the AI scores at this number or more is liked; below it, passed. Swiping can start and stop by itself each day."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="date-like-above"
          label="Like when the score is this or more"
          hint="A card scoring 95 or more gets a Super Like instead, at most one a day."
          value={values.likeAbove}
          min={0}
          max={100}
          inputClassName="w-full sm:w-32"
          onChange={(value) => set("likeAbove", value)}
          onCommit={commit}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ScheduleHourPick
            id="date-schedule-start"
            label="Swipe every day from"
            value={values.scheduleStart}
            onChange={(hour) =>
              change(
                hour === null
                  ? { ...values, scheduleStart: null, scheduleEnd: null }
                  : { ...values, scheduleStart: hour, scheduleEnd: values.scheduleEnd ?? (hour + 3) % 24 },
                "now"
              )
            }
          />
          <ScheduleHourPick
            id="date-schedule-end"
            label="Until"
            value={values.scheduleEnd}
            onChange={(hour) =>
              change(
                hour === null
                  ? { ...values, scheduleStart: null, scheduleEnd: null }
                  : { ...values, scheduleEnd: hour, scheduleStart: values.scheduleStart ?? (hour + 21) % 24 },
                "now"
              )
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {values.scheduleStart === null || values.scheduleEnd === null
            ? "No schedule: swiping runs when you press Start."
            : `Swiping starts by itself at ${values.scheduleStart}:00 and stops at ${values.scheduleEnd}:00, on the phone's own clock. Stop inside those hours holds it until the next day.`}
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-replies"
        title="Replies"
        description={`On: the AI sends its replies without waiting for you, ${values.replyDelayMin} to ${values.replyDelayMax} minutes after theirs. Off: you press Send.`}
        contentClassName="grid gap-4"
      >
        <SettingsSwitchRow id="date-automate" checked={values.automate} onCheckedChange={(on) => set("automate", on, "now")} label="The AI sends its replies by itself" />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="date-delay-min"
            label="Soonest, in minutes"
            value={values.replyDelayMin}
            min={0}
            max={1_440}
            onChange={(value) => set("replyDelayMin", value)}
            onCommit={commit}
          />
          <NumberField id="date-delay-max" label="Latest, in minutes" value={values.replyDelayMax} min={0} max={1_440} onChange={(value) => set("replyDelayMax", value)} onCommit={commit} />
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-limits"
        title="Limits"
        description="What keeps the account looking like one person with a phone. Swipes are also kept 4 to 9 seconds apart."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="date-swipes-hour" label="Swipes an hour" value={values.swipesPerHour} min={1} max={300} onChange={(value) => set("swipesPerHour", value)} onCommit={commit} />
          <NumberField
            id="date-swipes-day"
            label="Swipes a day"
            hint="Counted from midnight on the phone's own clock. At this number swiping stops until midnight."
            value={values.swipesPerDay}
            min={1}
            max={2_000}
            onChange={(value) => set("swipesPerDay", value)}
            onCommit={commit}
          />
          <NumberField
            id="date-messages-hour"
            label="Messages an hour"
            value={values.messagesPerHour}
            min={1}
            max={100}
            onChange={(value) => set("messagesPerHour", value)}
            onCommit={commit}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <HourPick id="date-quiet-start" label="Quiet from" value={values.quietStart} onChange={(hour) => set("quietStart", hour, "now")} />
          <HourPick id="date-quiet-end" label="Quiet until" value={values.quietEnd} onChange={(hour) => set("quietEnd", hour, "now")} />
        </div>
        <p className="text-sm text-muted-foreground">
          {values.quietStart === values.quietEnd
            ? "No quiet hours: the phone may work at any hour."
            : `Nothing happens on the phone from ${values.quietStart}:00 to ${values.quietEnd}:00, on the phone's own clock.`}
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-spend"
        title="AI spend"
        description="Once this month's AI spend reaches the cap, the AI stops calling and swiping stops, until the 1st or until the cap is raised."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="date-spend-cap"
          label="Monthly cap, in dollars"
          value={values.spendCapDollars}
          min={0}
          max={1_000}
          inputClassName="w-full sm:w-32"
          onChange={(value) => set("spendCapDollars", value)}
          onCommit={commit}
        />
      </CollapsibleSettingsCard>

      <GoogleCalendarCard />
    </CardGroup>
  )
}

/**
 * Google Calendar, one way (part 15 of "features/01-chats-and-replies"):
 * Date adds, moves and removes its own event for each date with a time, and
 * never reads the calendar. Connect goes to Google and back; Disconnect asks
 * first.
 */
function GoogleCalendarCard() {
  const [google, setGoogle] = React.useState<CalendarConnection | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadGoogleCalendar().then(
      (next) => live && setGoogle(next),
      (failure: unknown) => live && setError(datingErrorMessage(failure))
    )
    return () => {
      live = false
    }
  }, [reloads])

  return (
    <CollapsibleSettingsCard
      storageId="date-settings-google"
      title="Google Calendar"
      description="Each date you give a time goes into your Google Calendar too, and moves or goes with it. Date only writes its own events and never reads your calendar."
      contentClassName="grid gap-4"
    >
      {!google ? (
        error ? (
          <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
        ) : (
          <LoadingRow label="Checking Google Calendar" />
        )
      ) : google.connected ? (
        <>
          <p className="text-sm">Connected{google.email ? ` as ${google.email}` : ""}.</p>
          {google.lastError ? <p className="text-sm text-destructive">Last time Google refused: {google.lastError}</p> : null}
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
        </>
      ) : google.available ? (
        <Button asChild className="justify-self-start">
          <a href="/api/dating/google-calendar">
            <CalendarPlusIcon /> Connect Google Calendar
          </a>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not set up on this server yet. It needs the Google app's two keys, the same ones Continue with Google uses, with the Calendar API switched on and
          /api/dating/google-calendar/callback listed as a redirect address.
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Disconnect Google Calendar?"
        description="Date stops adding dates to it. Events already there stay in your calendar."
        confirmLabel="Disconnect"
        loading={busy}
        onConfirm={() => {
          setBusy(true)
          dismissErrorToast()
          disconnectGoogleCalendar()
            .then(async () => {
              setConfirming(false)
              setGoogle(await loadGoogleCalendar())
              toast.success("Google Calendar is disconnected.")
            })
            .catch((failure: unknown) => showErrorToast(datingErrorMessage(failure)))
            .finally(() => setBusy(false))
        }}
      />
    </CollapsibleSettingsCard>
  )
}

/**
 * People I know: one person a line, a name and an age, such as "Sarah, 31".
 * A card with that name and age is passed without an AI call. The box keeps
 * what is typed; only a list that reads cleanly is saved, and a line that does
 * not read is marked and named in a toast when the box is left.
 */
function KnownPeopleField({ people, onChange, onCommit }: { people: KnownPerson[]; onChange: (people: KnownPerson[]) => void; onCommit: () => void }) {
  const [text, setText] = React.useState(() => knownPeopleText(people))
  const parsed = parseKnownPeople(text)
  const problem = "problem" in parsed ? parsed.problem : null
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="date-known-people"
        hint="One a line, a name and an age, such as Sarah, 31. A card with that name and age is passed without the AI reading it. Names match whatever their capitals or accents."
      >
        People I know
      </FieldLabel>
      <Textarea
        id="date-known-people"
        rows={1}
        value={text}
        aria-invalid={problem ? true : undefined}
        placeholder="Sarah, 31"
        onChange={(event) => {
          setText(event.target.value)
          const next = parseKnownPeople(event.target.value)
          if ("people" in next) onChange(next.people)
        }}
        onBlur={() => {
          if (problem) showErrorToast(problem)
          else onCommit()
        }}
      />
    </div>
  )
}

/** An hour of the swiping schedule, or none. Picking one hour when neither is set fills the other three hours away. */
function ScheduleHourPick({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (hour: number | null) => void }) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value === null ? "none" : String(value)} onValueChange={(hour) => onChange(hour === "none" ? null : Number(hour))}>
        <SelectTrigger id={id} className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No schedule</SelectItem>
          {Array.from({ length: 24 }, (_, hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hour}:00
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function HourPick({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (hour: number) => void }) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(hour) => onChange(Number(hour))}>
        <SelectTrigger id={id} className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 24 }, (_, hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hour}:00
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Which profile these settings are, and its name, which saves the way every
 * setting here does: 700ms after the last key, or when the field is left.
 */
function ProfileCard({ profile, onRenamed }: { profile: DatingDashboard["profile"]; onRenamed: () => void }) {
  const [name, setName] = React.useState(profile.name)
  const [invalid, setInvalid] = React.useState(false)
  const saved = React.useRef(profile.name)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setSaveStatus = useReportedSaveStatus()

  async function save(next: string) {
    clearTimeout(timer.current)
    timer.current = undefined
    if (next.trim() === saved.current) return
    if (!next.trim()) {
      setInvalid(true)
      setSaveStatus({ blocked: "Give the profile a name." })
      showErrorToast("Give the profile a name.")
      return
    }
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await renameProfile(next)
      saved.current = next.trim()
      setInvalid(false)
      setSaveStatus("saved")
      onRenamed()
    } catch (failure) {
      const words = datingErrorMessage(failure)
      setSaveStatus({ blocked: words })
      showErrorToast(words)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="date-settings-profile"
      title="Profile"
      description={`One ${DATING_APP_WORDS[profile.app].name} account. Every setting in this window is this profile's own.`}
      contentClassName="grid gap-4"
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="date-profile-name">Name</FieldLabel>
        <Input
          id="date-profile-name"
          value={name}
          maxLength={PROFILE_NAME_MAX}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const next = event.target.value
            setName(next)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS)
          }}
          onBlur={() => void save(name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save(name)
          }}
        />
      </div>
    </CollapsibleSettingsCard>
  )
}

export default DatingSettingsTab
