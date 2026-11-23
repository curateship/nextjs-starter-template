import * as React from "react"
import { CalendarPlusIcon, CalendarX2Icon } from "lucide-react"

import { ProfileOption } from "./profiles"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { PickGroup, PickMenuRow, PickRow, RowButton } from "@/components/shared/notes/pick-rows"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { disconnectGoogleCalendar, loadGoogleCalendar, type CalendarConnection } from "@/lib/api/dating/chats"
import { renameProfile } from "@/lib/api/dating/profiles"
import { loadDatingSettings, saveDatingSettingsNow } from "@/lib/api/dating/settings"
import { datingErrorMessage } from "@/lib/dating/errors"
import { DATING_APP_WORDS, FACEBOOK_PACE, PROFILE_NAME_MAX } from "@/lib/dating/options"
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
import { focusRingInset } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The open profile's Dating settings, as tabs of the left page's ⋮ (task
 * "features/07-three-panel-design", Tyler, 18 Nov 2026: "THe left panel cog
 * needs to be changed to a 3 dot dropdown and the modal needs to be a
 * dropdown with the new dropdown ui"). They differ per profile (task
 * "features/06-profiles"), which is why they are here and not in Settings.
 *
 * Every field is a grouped row, as every settings ⋮ in the design is: a short
 * list of choices drops from its row, and a typed value opens a small box.
 * Every change saves by itself: typing 700ms after the last key or when the
 * box closes, a switch or a pick at once. The page header says Saving…, Saved
 * or Not saved. Tyler's choices of 17 Oct 2026 are the defaults.
 *
 * Read once per page and held for the profile they belong to, so moving
 * between the ⋮'s tabs draws at once.
 */

/** Typing waits this long after the last key, the same as the shell's own Settings. */
const SAVE_DELAY_MS = 700

/** The settings as last saved or edited, and whose, held while the page is open. Written in the browser only. */
let held: { accountId: string; values: DatingSettings } | null = null
const inBrowser = () => typeof window !== "undefined"

const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${hour}:00` }))

/** The open profile's settings, read once and saved as they change; a save still waiting when the tab closes goes then. */
function useDatingSettings(accountId: string) {
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

  const set = <K extends keyof DatingSettings>(key: K, value: DatingSettings[K], at: "now" | "soon" = "soon") => {
    if (values) change({ ...values, [key]: value }, at)
  }
  const commit = () => {
    if (timer.current && values) void save(values)
  }
  return { values, error, retry: () => setReloads((count) => count + 1), change, set, commit }
}

/** What a tab shows while the settings are read, or when they could not be. */
function Waiting({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading your Dating settings" />
}

/** A switch as a row of a grouped list: its name on the left, muted, the switch on the right. */
function SwitchRow({ id, label, checked, onCheckedChange }: { id: string; label: string; checked: boolean; onCheckedChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
      <Label htmlFor={id} className="min-w-0 flex-1 font-normal text-muted-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

/** A short line under a group's list, for what a field needs said. */
function GroupNote({ children }: { children: React.ReactNode }) {
  return <p className="px-0.5 text-xs text-muted-foreground">{children}</p>
}

/** The first words of a typed value, or None. */
function shortWords(text: string): { value: string; empty: boolean } {
  const trimmed = text.trim()
  return trimmed ? { value: trimmed, empty: false } : { value: "None", empty: true }
}

/**
 * The You tab: what the AI is told about the member, the voice it writes in,
 * and who they are looking for.
 */
export function DatingYouTab({ profile }: { profile: DatingDashboard["profile"] }) {
  const { values, error, retry, set, commit } = useDatingSettings(profile.id)
  if (!values) return <Waiting error={error} onRetry={retry} />
  const examples = Array.from({ length: MAX_EXAMPLES }, (_, index) => values.examples[index] ?? "")
  const written = examples.filter((example) => example.trim()).length
  const appName = DATING_APP_WORDS[profile.app].name
  return (
    <div className="grid gap-3 p-3">
      <PickGroup title="About you" after={<GroupNote>The AI uses only these facts about you, and never makes one up.</GroupNote>}>
        <PickRow label="About me" {...shortWords(values.aboutMe)}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="date-about-me" hint="Your job, where you live, what you like doing. Answers to the AI's questions are added here too.">
              About me
            </FieldLabel>
            <Textarea id="date-about-me" rows={4} value={values.aboutMe} onChange={(event) => set("aboutMe", event.target.value)} onBlur={commit} />
          </div>
        </PickRow>
        <PickRow label="Example messages" value={written ? `${written} of ${MAX_EXAMPLES}` : "None"} empty={!written}>
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
        </PickRow>
        <SwitchRow
          id="date-learn-from-sends"
          label="Learn from my last 10 sends"
          checked={values.learnFromSends}
          onCheckedChange={(on) => set("learnFromSends", on, "now")}
        />
        <PickMenuRow
          label="Style"
          value={DATING_STYLE_WORDS[values.style]}
          options={DATING_STYLES.map((style) => ({ value: style, label: DATING_STYLE_WORDS[style] }))}
          selected={values.style}
          onPick={(style) => set("style", style as DatingStyle, "now")}
        />
      </PickGroup>
      <PickGroup
        title="Who you are looking for"
        after={<GroupNote>The AI scores each card out of 100 against this. The phone copies the ages and distance into {appName}'s own settings.</GroupNote>}
      >
        <PickRow label="Looking for" {...shortWords(values.lookingFor)}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="date-looking-for">Looking for</FieldLabel>
            <Textarea id="date-looking-for" rows={4} value={values.lookingFor} onChange={(event) => set("lookingFor", event.target.value)} onBlur={commit} />
          </div>
        </PickRow>
        <PickRow label="Dealbreakers" {...shortWords(values.dealbreakers)}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="date-dealbreakers" hint="A card that clearly hits one of these is always passed, whatever its score.">
              Dealbreakers
            </FieldLabel>
            <Textarea id="date-dealbreakers" rows={4} value={values.dealbreakers} onChange={(event) => set("dealbreakers", event.target.value)} onBlur={commit} />
          </div>
        </PickRow>
        <PickRow label="Ages" value={`${values.ageMin} to ${values.ageMax}`}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="date-age-min" label="Youngest" value={values.ageMin} min={18} max={99} onChange={(value) => set("ageMin", value)} onCommit={commit} />
            <NumberField id="date-age-max" label="Oldest" value={values.ageMax} min={18} max={99} onChange={(value) => set("ageMax", value)} onCommit={commit} />
          </div>
        </PickRow>
        <PickRow label="Furthest away" value={`${values.maxDistanceKm} km`}>
          <NumberField
            id="date-max-distance"
            label="Furthest away, in km"
            value={values.maxDistanceKm}
            min={2}
            max={160}
            onChange={(value) => set("maxDistanceKm", value)}
            onCommit={commit}
          />
        </PickRow>
        <PickRow
          label="People I know"
          value={values.knownPeople.length ? `${values.knownPeople.length} ${values.knownPeople.length === 1 ? "person" : "people"}` : "None"}
          empty={!values.knownPeople.length}
        >
          <KnownPeopleField people={values.knownPeople} onChange={(people) => set("knownPeople", people)} onCommit={commit} />
        </PickRow>
      </PickGroup>
    </div>
  )
}

/**
 * The Rules tab: how the AI swipes and replies, the limits that keep the
 * account looking like one person with a phone, and the monthly AI cap.
 */
export function DatingRulesTab({ profile }: { profile: DatingDashboard["profile"] }) {
  const { values, error, retry, change, set, commit } = useDatingSettings(profile.id)
  if (!values) return <Waiting error={error} onRetry={retry} />
  const facebook = profile.app === "facebook"
  const scheduleOptions = [{ value: "none", label: "No schedule" }, ...HOURS]
  const pickSchedule = (side: "start" | "end", picked: string) => {
    if (picked === "none") return change({ ...values, scheduleStart: null, scheduleEnd: null }, "now")
    const hour = Number(picked)
    // Picking one hour when neither is set fills the other three hours away.
    change(
      side === "start"
        ? { ...values, scheduleStart: hour, scheduleEnd: values.scheduleEnd ?? (hour + 3) % 24 }
        : { ...values, scheduleEnd: hour, scheduleStart: values.scheduleStart ?? (hour + 21) % 24 },
      "now"
    )
  }
  const noSchedule = values.scheduleStart === null || values.scheduleEnd === null
  return (
    <div className="grid gap-3 p-3">
      <PickGroup
        title="Swiping"
        after={
          <GroupNote>
            {noSchedule
              ? "No schedule: swiping runs when you press Start."
              : `Swiping starts by itself at ${values.scheduleStart}:00 and stops at ${values.scheduleEnd}:00, on the phone's own clock. Stop inside those hours holds it until the next day.`}
          </GroupNote>
        }
      >
        <PickRow label="Like at" value={`${values.likeAbove} or more`}>
          <NumberField
            id="date-like-above"
            label="Like when the score is this or more"
            hint="A card scoring 95 or more gets a Super Like instead, at most one a day."
            value={values.likeAbove}
            min={0}
            max={100}
            onChange={(value) => set("likeAbove", value)}
            onCommit={commit}
          />
        </PickRow>
        <PickMenuRow
          label="Swipe every day from"
          value={values.scheduleStart === null ? "No schedule" : `${values.scheduleStart}:00`}
          empty={values.scheduleStart === null}
          options={scheduleOptions}
          selected={values.scheduleStart === null ? "none" : String(values.scheduleStart)}
          onPick={(picked) => pickSchedule("start", picked)}
        />
        <PickMenuRow
          label="Until"
          value={values.scheduleEnd === null ? "No schedule" : `${values.scheduleEnd}:00`}
          empty={values.scheduleEnd === null}
          options={scheduleOptions}
          selected={values.scheduleEnd === null ? "none" : String(values.scheduleEnd)}
          onPick={(picked) => pickSchedule("end", picked)}
        />
      </PickGroup>
      <PickGroup
        title="Replies"
        after={
          <GroupNote>
            {values.automate
              ? `The AI sends its replies without waiting for you, ${values.replyDelayMin} to ${values.replyDelayMax} minutes after theirs.`
              : "You press Send on each reply."}
          </GroupNote>
        }
      >
        <SwitchRow id="date-automate" label="The AI sends replies by itself" checked={values.automate} onCheckedChange={(on) => set("automate", on, "now")} />
        <PickRow label="Reply after" value={`${values.replyDelayMin} to ${values.replyDelayMax} min`}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="date-delay-min" label="Soonest, in minutes" value={values.replyDelayMin} min={0} max={1_440} onChange={(value) => set("replyDelayMin", value)} onCommit={commit} />
            <NumberField id="date-delay-max" label="Latest, in minutes" value={values.replyDelayMax} min={0} max={1_440} onChange={(value) => set("replyDelayMax", value)} onCommit={commit} />
          </div>
        </PickRow>
      </PickGroup>
      <PickGroup
        title="Limits"
        after={
          <GroupNote>
            {values.quietStart === values.quietEnd
              ? "No quiet hours: the phone may work at any hour."
              : `Nothing happens on the phone from ${values.quietStart}:00 to ${values.quietEnd}:00, on the phone's own clock.`}{" "}
            {facebook
              ? `On Facebook Dating never more than ${FACEBOOK_PACE.swipesPerDay} swipes a day and ${FACEBOOK_PACE.swipesPerHour} an hour, because a ban there loses the whole Facebook account.`
              : "Swipes are kept 4 to 9 seconds apart."}
          </GroupNote>
        }
      >
        <PickRow label="Swipes an hour" value={String(values.swipesPerHour)}>
          <NumberField
            id="date-swipes-hour"
            label="Swipes an hour"
            value={values.swipesPerHour}
            min={1}
            max={facebook ? FACEBOOK_PACE.swipesPerHour : 300}
            onChange={(value) => set("swipesPerHour", value)}
            onCommit={commit}
          />
        </PickRow>
        <PickRow label="Swipes a day" value={String(values.swipesPerDay)}>
          <NumberField
            id="date-swipes-day"
            label="Swipes a day"
            hint="Counted from midnight on the phone's own clock. At this number swiping stops until midnight."
            value={values.swipesPerDay}
            min={1}
            max={facebook ? FACEBOOK_PACE.swipesPerDay : 2_000}
            onChange={(value) => set("swipesPerDay", value)}
            onCommit={commit}
          />
        </PickRow>
        <PickRow label="Messages an hour" value={String(values.messagesPerHour)}>
          <NumberField
            id="date-messages-hour"
            label="Messages an hour"
            value={values.messagesPerHour}
            min={1}
            max={100}
            onChange={(value) => set("messagesPerHour", value)}
            onCommit={commit}
          />
        </PickRow>
        <PickMenuRow
          label="Quiet from"
          value={`${values.quietStart}:00`}
          options={HOURS}
          selected={String(values.quietStart)}
          onPick={(hour) => set("quietStart", Number(hour), "now")}
        />
        <PickMenuRow
          label="Quiet until"
          value={`${values.quietEnd}:00`}
          options={HOURS}
          selected={String(values.quietEnd)}
          onPick={(hour) => set("quietEnd", Number(hour), "now")}
        />
      </PickGroup>
      <PickGroup
        title="AI spend"
        after={<GroupNote>Once this month's AI spend reaches the cap, the AI stops and swiping stops, until the 1st or until the cap is raised.</GroupNote>}
      >
        <PickRow label="Monthly cap" value={`$${values.spendCapDollars}`}>
          <NumberField
            id="date-spend-cap"
            label="Monthly cap, in dollars"
            value={values.spendCapDollars}
            min={0}
            max={1_000}
            onChange={(value) => set("spendCapDollars", value)}
            onCommit={commit}
          />
        </PickRow>
      </PickGroup>
    </div>
  )
}

/**
 * The General tab's own groups, after the shell's Page group: the open
 * profile, picked here to switch (Tyler, 18 Nov 2026: "move the profile
 * swicher inside the 3 dotted dropdown"), its name, which saves as every
 * setting here does, and Google Calendar.
 */
export function DatingGeneralGroups({
  data,
  onPickProfile,
  onRenamed,
}: {
  data: DatingDashboard
  onPickProfile: (accountId: string) => void
  onRenamed: () => void
}) {
  const profile = data.profile
  return (
    <>
      <PickGroup title="Profile" after={<GroupNote>One {DATING_APP_WORDS[profile.app].name} account. Every setting in this menu is this profile's own.</GroupNote>}>
        <PickMenuRow
          label="Open profile"
          value={profile.name}
          options={data.profiles.map((item) => ({ value: item.id, label: <ProfileOption profile={item} /> }))}
          selected={profile.id}
          onPick={onPickProfile}
        />
        <PickRow label="Name" value={profile.name}>
          <ProfileName profile={profile} onRenamed={onRenamed} />
        </PickRow>
      </PickGroup>
      <GoogleCalendarGroup />
    </>
  )
}

function ProfileName({ profile, onRenamed }: { profile: DatingDashboard["profile"]; onRenamed: () => void }) {
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
  )
}

/**
 * Google Calendar, one way (part 15 of "features/01-chats-and-replies"):
 * Date adds, moves and removes its own event for each date with a time, and
 * never reads the calendar. Connect goes to Google and back; Disconnect asks
 * first.
 */
function GoogleCalendarGroup() {
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

  let row: React.ReactNode
  let note: React.ReactNode = "Each date you give a time goes into your Google Calendar too. Date never reads your calendar."
  if (!google) {
    row = error ? (
      <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
    ) : (
      <RowButton label="Google Calendar" value="Checking…" empty disabled open={false} />
    )
  } else if (google.connected) {
    // Connected: the row's box says as whom and holds Disconnect, which asks first.
    row = (
      <PickRow label="Google Calendar" value={google.email || "Connected"}>
        <p className="text-sm">Connected{google.email ? ` as ${google.email}` : ""}.</p>
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setConfirming(true)}>
          <CalendarX2Icon /> Disconnect
        </Button>
      </PickRow>
    )
    if (google.lastError) note = <span className="text-destructive">Last time Google refused: {google.lastError}</span>
  } else if (google.available) {
    row = (
      <a href="/api/dating/google-calendar" className={cn("flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-muted", focusRingInset)}>
        <span className="shrink-0 text-muted-foreground">Google Calendar</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <CalendarPlusIcon className="size-4" aria-hidden /> Connect
        </span>
      </a>
    )
  } else {
    row = <RowButton label="Google Calendar" value="Not set up" empty disabled open={false} />
    note =
      "Not set up on this server yet. It needs the Google app's two keys, the same ones Continue with Google uses, with the Calendar API switched on and /api/dating/google-calendar/callback listed as a redirect address."
  }

  return (
    <>
      <PickGroup title="Calendar" after={<GroupNote>{note}</GroupNote>}>
        {row}
      </PickGroup>
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
            })
            .catch((failure: unknown) => showErrorToast(datingErrorMessage(failure)))
            .finally(() => setBusy(false))
        }}
      />
    </>
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
        rows={4}
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
