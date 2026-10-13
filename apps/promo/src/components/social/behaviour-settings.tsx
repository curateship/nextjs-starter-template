import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getBehaviourErrorMessage,
  loadBehaviour,
  saveBehaviourFn,
  type BehaviourAccount,
  type BehaviourSettings,
  type BehaviourView,
} from "@/lib/api/social/behaviour"
import { BEHAVIOUR_RANGES } from "@/lib/social/options"
import { clockText, isAwake, nextWakeAt, zoneClockText } from "@/lib/social/waking"
import { accountAgeText, whenText } from "@/lib/social/wording"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → Behaviour: how every account acts, wherever it runs.
 *
 * Tyler, 9 Oct 2026: the fingerprint is probably not what gets an account
 * caught, the behaviour is. So the account never searches (a reader browser
 * does), keeps waking hours, warms up before its first comment, and while
 * young cannot comment faster than a set pace.
 *
 * Saves itself: a pick at once, a number 700ms after the last keystroke or
 * when the field is left, with the outcome in the sticky header. The settings
 * are read once per page and held here, so opening the tab again draws at
 * once (`docs/shell/settings-saving.md`).
 */

/** The picker's value for "no reader", since a Select item cannot be empty. */
const NONE = "none"
const SAVE_DELAY_MS = 700

/** The settings as last read or edited, held while the page is open. Browser only. */
let held: BehaviourView | null = null
/** The settings as the server last confirmed them, which a refused save goes back to. */
let saved: BehaviourView | null = null

function BehaviourSettingsPanel() {
  const [view, setView] = React.useState<BehaviourView | null>(() =>
    typeof window === "undefined" ? null : held
  )
  const [error, setError] = React.useState<string | null>(null)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestSave = React.useRef(0)

  // Read on every open, quietly when something is already held.
  React.useEffect(() => {
    let live = true
    loadBehaviour().then(
      (next) => {
        held = next
        saved = next
        if (live) setView(next)
      },
      (failure: unknown) => {
        if (live && !held) setError(getBehaviourErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  // The whole settings ride in as an argument, so a save sends exactly what
  // was on screen when it was asked for. Only the newest save's answer is
  // drawn; a refused one puts back what the server last confirmed, since the
  // held copy already carries the refused edit.
  async function save(next: BehaviourSettings) {
    clearTimeout(timer.current)
    const turn = ++latestSave.current
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const answer = await saveBehaviourFn(next)
      saved = answer
      if (turn !== latestSave.current) return
      held = answer
      setView(answer)
      setSaveStatus("saved")
    } catch (failure) {
      if (turn !== latestSave.current) return
      held = saved
      setView(saved)
      setSaveStatus("idle")
      showErrorToast(getBehaviourErrorMessage(failure))
    }
  }

  /** Into the held copy at once; saved now, or after the typing stops. */
  function change(patch: Partial<BehaviourSettings>, later = false) {
    if (!view) return
    const next = { ...view, settings: { ...view.settings, ...patch } }
    held = next
    setView(next)
    clearTimeout(timer.current)
    if (later) timer.current = setTimeout(() => void save(next.settings), SAVE_DELAY_MS)
    else void save(next.settings)
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">The settings could not be read. {error}</p>
  }
  if (!view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the behaviour settings
      </p>
    )
  }

  const { settings, readers, accounts } = view
  const reader = readers.find((profile) => profile.id === settings.readerProfileId) ?? null

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-behaviour-reader"
        title="The reader browser"
        description="A browser signed in to nobody, which searches so your accounts never do."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="promo-reader">Reader</Label>
          <Select
            value={settings.readerProfileId ?? NONE}
            onValueChange={(value) => change({ readerProfileId: value === NONE ? null : value })}
          >
            <SelectTrigger id="promo-reader" className="w-full sm:w-fit sm:min-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No reader</SelectItem>
              {readers.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          {reader
            ? `Keyword searches, reading a post's replies, a subreddit's rules, checks on sent comments and the stranger's look at your profile all run in ${reader.name}. Your account's own browser only opens a post when it is about to comment on it.`
            : "With no reader, searches and reply reads are refused rather than run in your account's own browser."}{" "}
          Profiles that hold an account are not offered. Make a new one, with a proxy of its
          own, on the{" "}
          <Link
            to="/admin/profiles"
            search={{ open: undefined }}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Browser profiles dashboard
          </Link>
          , and leave it signed out.
        </p>
        <NumberField
          id="promo-search-every-hours"
          label="Search every keyword every this many hours"
          hint="In the reader, while it is awake. 0 means keywords only search when you press their button."
          value={settings.searchEveryHours}
          min={BEHAVIOUR_RANGES.searchEveryHours.min}
          max={BEHAVIOUR_RANGES.searchEveryHours.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ searchEveryHours: value }, true)}
          onCommit={() => void save(settings)}
        />
        <p className="text-sm text-muted-foreground">
          {settings.searchEveryHours === 0
            ? "Off. A keyword searches only when you press its button."
            : `Every switched-on keyword searches Reddit again ${settings.searchEveryHours === 1 ? "an hour" : `${settings.searchEveryHours} hours`} after its last search, in the reader, while the reader is awake. A keyword's switch on its card turns this off for that keyword alone. Nothing is ever posted by itself.`}
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-behaviour-hours"
        title="Waking hours"
        description="When accounts comment and warm up, on each account's own clock."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <HourPicker
            id="promo-wake-from"
            label="Wakes at"
            value={settings.wakeFromMinute}
            onChange={(minute) => change({ wakeFromMinute: minute })}
          />
          <HourPicker
            id="promo-wake-until"
            label="Goes to sleep at"
            value={settings.wakeUntilMinute}
            onChange={(minute) => change({ wakeUntilMinute: minute })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          A comment pressed outside these hours waits for the account&apos;s morning, and the
          Projects dashboard says when it goes. A health check may run at any hour, because it
          only reads.
        </p>
        <AccountLines accounts={accounts} render={(account) => clockLine(account, settings)} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-behaviour-warm-up"
        title="Warm-up"
        description="A new account builds a normal history before its first comment."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-warm-up-days"
          label="Days of warm-up"
          hint="Counted from the day Reddit made the account. 0 switches the warm-up off."
          value={settings.warmUpDays}
          min={BEHAVIOUR_RANGES.warmUpDays.min}
          max={BEHAVIOUR_RANGES.warmUpDays.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ warmUpDays: value }, true)}
          onCommit={() => void save(settings)}
        />
        <p className="text-sm text-muted-foreground">
          {settings.warmUpDays === 0
            ? "Off. Accounts may comment from their first day."
            : "While it warms up, Post is refused and once a day, inside its waking hours, the account scrolls its feed, opens a few posts and joins a subreddit or two that Promo has found posts in. It never comments or votes. A profile with no label shows Warming, and moves to Ready when the warm-up ends."}
        </p>
        <AccountLines accounts={accounts} render={warmUpLine} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-behaviour-pace"
        title="Pace"
        description="How many comments go out, and how fast a young account may send them."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-warn-per-hour"
          label="Warn past this many comments an hour"
          hint="Any account. The line beside Post turns amber past it, and Post still works."
          value={settings.warnPerHour}
          min={BEHAVIOUR_RANGES.warnPerHour.min}
          max={BEHAVIOUR_RANGES.warnPerHour.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ warnPerHour: value }, true)}
          onCommit={() => void save(settings)}
        />
        <NumberField
          id="promo-young-days"
          label="Young until this many days old"
          hint="Counted from the day Reddit made the account. 0 means no account is young."
          value={settings.youngDays}
          min={BEHAVIOUR_RANGES.youngDays.min}
          max={BEHAVIOUR_RANGES.youngDays.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ youngDays: value }, true)}
          onCommit={() => void save(settings)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="promo-young-per-hour"
            label="A young account's comments an hour"
            value={settings.youngPerHour}
            min={BEHAVIOUR_RANGES.youngPerHour.min}
            max={BEHAVIOUR_RANGES.youngPerHour.max}
            inputClassName="w-full sm:w-32"
            onChange={(value) => change({ youngPerHour: value }, true)}
            onCommit={() => void save(settings)}
          />
          <NumberField
            id="promo-young-per-day"
            label="A young account's comments a day"
            value={settings.youngPerDay}
            min={BEHAVIOUR_RANGES.youngPerDay.min}
            max={BEHAVIOUR_RANGES.youngPerDay.max}
            inputClassName="w-full sm:w-32"
            onChange={(value) => change({ youngPerDay: value }, true)}
            onCommit={() => void save(settings)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {settings.youngDays === 0
            ? `No account counts as young, so Post is never refused for pace. Past ${settings.warnPerHour} comments in an hour the line beside Post warns.`
            : `An account under ${settings.youngDays} days old may send ${settings.youngPerHour} comments an hour and ${settings.youngPerDay} a day. Past either, Post is refused and says when the next one is allowed. Comments waiting for the account's morning count too. Older accounts only get the warning past ${settings.warnPerHour} in an hour.`}
        </p>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

/** One select of the hours of the day, plus the saved time if it is not on the hour. */
function HourPicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (minute: number) => void
}) {
  const minutes = Array.from({ length: 24 }, (_, hour) => hour * 60)
  if (!minutes.includes(value)) minutes.push(value)
  minutes.sort((a, b) => a - b)
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id} className="w-full sm:w-fit sm:min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((minute) => (
            <SelectItem key={minute} value={String(minute)}>
              {clockText(minute)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** One line per account, or a line saying there are none. */
function AccountLines({
  accounts,
  render,
}: {
  accounts: BehaviourAccount[]
  render: (account: BehaviourAccount) => string
}) {
  if (!accounts.length) {
    return <p className="text-sm text-muted-foreground">No Reddit account is set up yet.</p>
  }
  return (
    <ul className="grid gap-1 text-sm">
      {accounts.map((account) => (
        <li key={account.id}>{render(account)}</li>
      ))}
    </ul>
  )
}

function accountName(account: BehaviourAccount): string {
  return account.handle ? `u/${account.handle}` : "The account (not signed in)"
}

function clockLine(account: BehaviourAccount, settings: BehaviourSettings): string {
  const now = new Date()
  const from = settings.wakeFromMinute
  const until = settings.wakeUntilMinute
  const clock = zoneClockText(now, account.timeZone)
  if (from === until) return `${accountName(account)} keeps ${account.timeZone} time.`
  if (isAwake(now, account.timeZone, from, until)) {
    return `${accountName(account)}: it is ${clock}, so it is awake until ${clockText(until)}.`
  }
  const wakes = nextWakeAt(now, account.timeZone, from, until)
  return `${accountName(account)}: it is ${clock}, so it is asleep until ${wakes ? whenText(wakes, now) : clockText(from)} your time.`
}

function warmUpLine(account: BehaviourAccount): string {
  const name = accountName(account)
  if (account.ageUnknown) {
    return `${name}: Promo has not read how old it is yet, so its warm-up cannot be counted. Tick it on the Reddit accounts dashboard and press Check now.`
  }
  const age = account.redditCreatedAt ? `is ${accountAgeText(account.redditCreatedAt)}` : "has no age read"
  if (!account.warmUpEndsAt) return `${name} ${age} and past its warm-up.`
  return `${name} ${age}. Its warm-up ends ${whenText(account.warmUpEndsAt)} your time.`
}

export default BehaviourSettingsPanel
