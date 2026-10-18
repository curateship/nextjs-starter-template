import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { loadDatingSettings, saveDatingSettingsNow } from "@/lib/api/dating/settings"
import { datingErrorMessage } from "@/lib/dating/errors"
import { DATING_STYLES, DATING_STYLE_WORDS, datingSettingsProblem, MAX_EXAMPLES, type DatingSettings, type DatingStyle } from "@/lib/dating/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → App settings → Dating: what the AI is told about the member and
 * what they want, how it decides, and the limits on the phone. Every change
 * saves by itself: typing 700ms after the last key or when the field is left,
 * a switch or a pick at once. The page header says Saving…, Saved or Not saved.
 *
 * Read once per page and held, so coming back to the tab draws at once, the
 * way the shell's own tabs do (Pomoder's `admin-settings-tabs.tsx` is the
 * pattern). Tyler's choices of 17 Oct 2026 are the defaults.
 */

/** Typing waits this long after the last key, the same as the shell's own Settings. */
const SAVE_DELAY_MS = 700

/** The settings as last saved or edited, held while the page is open. Written in the browser only. */
let held: DatingSettings | null = null
const inBrowser = () => typeof window !== "undefined"

function DatingSettingsTab() {
  const [values, setValues] = React.useState<DatingSettings | null>(() => (inBrowser() ? held : null))
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => {
    let live = true
    loadDatingSettings().then(
      (next) => {
        // An edit made while this was on its way wins.
        held = held ?? next
        if (live) {
          setValues(held)
          setError(null)
        }
      },
      (failure: unknown) => {
        if (live && !held) setError(datingErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [reloads])

  // A save still waiting when the tab closes goes now, so nothing typed is lost.
  React.useEffect(
    () => () => {
      if (timer.current && held) {
        clearTimeout(timer.current)
        void saveDatingSettingsNow(held).catch(() => {})
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
    held = next
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
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="date-settings-swiping"
        title="Swiping"
        description="A card the AI scores at this number or more is liked; below it, passed."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="date-like-above"
          label="Like when the score is this or more"
          value={values.likeAbove}
          min={0}
          max={100}
          inputClassName="w-full sm:w-32"
          onChange={(value) => set("likeAbove", value)}
          onCommit={commit}
        />
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
    </CardGroup>
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

export default DatingSettingsTab
