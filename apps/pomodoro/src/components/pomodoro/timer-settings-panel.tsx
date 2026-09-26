import * as React from "react"

import { FocusRhythmPresets } from "@/components/pomodoro/focus-rhythm-presets"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  loadProductivity,
  updatePreferences,
} from "@/lib/api/pomodoro/productivity"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { enableCompletionAlerts } from "@/lib/pomodoro/completion-alerts"
import { browserTimezone } from "@/lib/pomodoro/timer"
import {
  normalizeSessionsBeforeLongBreak,
  SESSIONS_BEFORE_LONG_BREAK_DEFAULT,
  SESSIONS_BEFORE_LONG_BREAK_MAX,
  SESSIONS_BEFORE_LONG_BREAK_MIN,
  validPresetMinutes,
  validSessionsBeforeLongBreak,
} from "@/lib/pomodoro/timer-presets"
import {
  applyDurations,
  reloadPomodoroData,
  usePomodoro,
} from "@/lib/pomodoro/use-pomodoro"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"

const DEFAULT_ALERT_HELP =
  "Plays a chime and shows a browser notification when a timer finishes."

/**
 * The Timer tab on the Settings screen (the shell's settings.tabs option):
 * the three durations, the daily goal, auto-start, and the rhythm presets —
 * the old app's "Focus rhythm" settings card. It edits the same saved
 * preferences the dashboard reads on load.
 */
export default function TimerSettingsPanel() {
  const player = useSoundPlayer()
  const { authenticated, known } = useProductAuth()
  const pomodoro = usePomodoro()
  const [alertHelp, setAlertHelp] = React.useState(DEFAULT_ALERT_HELP)
  const [focus, setFocus] = React.useState(25)
  const [short, setShort] = React.useState(5)
  const [long, setLong] = React.useState(15)
  const [dailyGoal, setDailyGoal] = React.useState(4)
  const [cycle, setCycle] = React.useState(SESSIONS_BEFORE_LONG_BREAK_DEFAULT)
  const [autoStart, setAutoStart] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!known || loaded) return
    if (!authenticated) {
      // A guest's values are already in the engine, hydrated from the
      // browser by the layout.
      setFocus(pomodoro.durations.focus)
      setShort(pomodoro.durations.short)
      setLong(pomodoro.durations.long)
      setDailyGoal(pomodoro.dailyGoalSessions)
      setCycle(pomodoro.sessionsBeforeLongBreak)
      setAutoStart(pomodoro.autoStart)
      setLoaded(true)
      return
    }
    let cancelled = false
    void loadProductivity(browserTimezone())
      .then((data) => {
        if (cancelled) return
        setFocus(data.preferences.focusMinutes)
        setShort(data.preferences.shortBreakMinutes)
        setLong(data.preferences.longBreakMinutes)
        setDailyGoal(data.preferences.dailyGoalSessions)
        setCycle(
          normalizeSessionsBeforeLongBreak(
            data.preferences.sessionsBeforeLongBreak
          )
        )
        setAutoStart(data.preferences.autoStart)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled)
          setError("Your timer settings could not be loaded. Reload to retry.")
      })
    return () => {
      cancelled = true
    }
  }, [
    known,
    authenticated,
    loaded,
    pomodoro.durations,
    pomodoro.dailyGoalSessions,
    pomodoro.sessionsBeforeLongBreak,
    pomodoro.autoStart,
  ])

  const valid =
    [focus, short, long].every(validPresetMinutes) &&
    Number.isInteger(dailyGoal) &&
    dailyGoal >= 1 &&
    dailyGoal <= 20 &&
    validSessionsBeforeLongBreak(cycle)

  const save = async () => {
    setNotice("")
    setError("")
    if (!authenticated) {
      const applied = applyDurations({ focus, short, long }, autoStart, {
        dailyGoalSessions: dailyGoal,
        sessionsBeforeLongBreak: cycle,
      })
      if (applied) setNotice("Focus rhythm saved locally.")
      else setError("Reset or finish the timer first.")
      return
    }
    setSaving(true)
    try {
      await updatePreferences({
        focusMinutes: focus,
        shortBreakMinutes: short,
        longBreakMinutes: long,
        dailyGoalSessions: dailyGoal,
        sessionsBeforeLongBreak: cycle,
        autoStart,
      })
      // The engine holds the rhythm the timer counts on, so the saved row is
      // read straight back. Without it the cycle would keep the old number
      // until some other screen mounted and reloaded it.
      void reloadPomodoroData()
      setNotice("Focus rhythm saved.")
    } catch {
      setError("The focus rhythm could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Focus rhythm</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loaded ? (
            <FocusRhythmPresets
              current={{
                focusMinutes: focus,
                shortBreakMinutes: short,
                longBreakMinutes: long,
                sessionsBeforeLongBreak: cycle,
                autoStart,
              }}
              dailyGoalSessions={dailyGoal}
              onApplied={(values) => {
                setFocus(values.focusMinutes)
                setShort(values.shortBreakMinutes)
                setLong(values.longBreakMinutes)
                setCycle(values.sessionsBeforeLongBreak)
                setAutoStart(values.autoStart)
                // The preset wrote the preferences row itself, so the engine
                // reads it back rather than being told twice.
                void reloadPomodoroData()
              }}
              onApplyLocally={(values) => {
                const applied = applyDurations(
                  {
                    focus: values.focusMinutes,
                    short: values.shortBreakMinutes,
                    long: values.longBreakMinutes,
                  },
                  values.autoStart,
                  {
                    dailyGoalSessions: dailyGoal,
                    sessionsBeforeLongBreak: values.sessionsBeforeLongBreak,
                  }
                )
                if (applied) {
                  setFocus(values.focusMinutes)
                  setShort(values.shortBreakMinutes)
                  setLong(values.longBreakMinutes)
                  setCycle(values.sessionsBeforeLongBreak)
                  setAutoStart(values.autoStart)
                }
                return applied
              }}
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Focus minutes", "timer-focus", focus, setFocus, 90],
                ["Short break", "timer-short", short, setShort, 90],
                ["Long break", "timer-long", long, setLong, 90],
              ] as const
            ).map(([label, id, value, setValue, max]) => (
              <div key={id} className="grid gap-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={max}
                  value={Number.isFinite(value) ? value : ""}
                  aria-invalid={validPresetMinutes(value) ? undefined : true}
                  onChange={(event) => setValue(event.target.valueAsNumber)}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timer-goal">Daily session goal</Label>
            <Input
              id="timer-goal"
              type="number"
              min={1}
              max={20}
              value={Number.isFinite(dailyGoal) ? dailyGoal : ""}
              aria-describedby="timer-goal-help"
              aria-invalid={
                Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 20
                  ? undefined
                  : true
              }
              onChange={(event) => setDailyGoal(event.target.valueAsNumber)}
              className="sm:max-w-40"
            />
            <span id="timer-goal-help" className="text-xs text-muted-foreground">
              Only completed focus sessions count toward your daily goal and
              streak.
            </span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timer-long-break-cycle">
              Sessions before long break
            </Label>
            <Input
              id="timer-long-break-cycle"
              type="number"
              min={SESSIONS_BEFORE_LONG_BREAK_MIN}
              max={SESSIONS_BEFORE_LONG_BREAK_MAX}
              value={Number.isFinite(cycle) ? cycle : ""}
              aria-describedby="timer-long-break-cycle-help"
              aria-invalid={validSessionsBeforeLongBreak(cycle) ? undefined : true}
              onChange={(event) => setCycle(event.target.valueAsNumber)}
              className="sm:max-w-40"
            />
            <span
              id="timer-long-break-cycle-help"
              className="text-xs text-muted-foreground"
            >
              How many focuses earn the long break. Four is the classic
              pattern; a 50-minute rhythm usually wants two.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="timer-auto-start"
              checked={autoStart}
              onCheckedChange={setAutoStart}
            />
            <Label htmlFor="timer-auto-start">Auto-start next phase</Label>
          </div>
          <div className="grid gap-2">
            {/* This checkbox is the one place notification permission is
                asked for; the click also unlocks the chime's audio context. */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="timer-completion-alerts"
                checked={player.state.completionAlerts}
                aria-describedby="completion-alert-help"
                onCheckedChange={(checked) => {
                  const enabled = checked === true
                  player.setCompletionAlerts(enabled)
                  if (!enabled) {
                    setAlertHelp(DEFAULT_ALERT_HELP)
                    return
                  }
                  void enableCompletionAlerts().then((permission) =>
                    setAlertHelp(
                      permission === "granted"
                        ? "You'll hear a chime and get a notification when a timer finishes."
                        : permission === "denied"
                          ? "Notifications are blocked in this browser, so you'll only hear the chime."
                          : "You'll hear a chime when a timer finishes."
                    )
                  )
                }}
              />
              <Label htmlFor="timer-completion-alerts">Completion alerts</Label>
            </div>
            <span
              id="completion-alert-help"
              className="text-xs text-muted-foreground"
            >
              {alertHelp}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={!valid || saving || !loaded} onClick={() => void save()}>
              {saving ? "Saving…" : "Save focus rhythm"}
            </Button>
            {notice ? (
              <span role="status" className="text-sm text-muted-foreground">
                {notice}
              </span>
            ) : null}
            {error ? (
              <span role="alert" className="text-sm text-destructive">
                {error}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
