import * as React from "react"
import { toast } from "sonner"

import { FocusRhythmPresets } from "@/components/pomodoro/focus-rhythm-presets"
import { RhythmMinutesFields } from "@/components/pomodoro/rhythm-minutes-fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  loadProductivity,
  updatePreferences,
} from "@/lib/api/pomodoro/productivity"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { enableCompletionAlerts } from "@/lib/pomodoro/completion-alerts"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  normalizeSessionsBeforeLongBreak,
  SESSIONS_BEFORE_LONG_BREAK_DEFAULT,
  SESSIONS_BEFORE_LONG_BREAK_MAX,
  SESSIONS_BEFORE_LONG_BREAK_MIN,
} from "@/lib/pomodoro/timer-presets"
import {
  applyDurations,
  DAILY_GOAL_LIMIT_REASON,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
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
  // Only the load failure is held in state, because it decides whether the
  // boxes are drawn at all. Saves report themselves through the toasts.
  const [loadFailed, setLoadFailed] = React.useState(false)
  // Bumped by Try again, which is what re-runs the load below.
  const [attempt, setAttempt] = React.useState(0)
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
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    attempt,
    known,
    authenticated,
    loaded,
    pomodoro.durations,
    pomodoro.dailyGoalSessions,
    pomodoro.sessionsBeforeLongBreak,
    pomodoro.autoStart,
  ])

  const save = async () => {
    if (!authenticated) {
      const applied = applyDurations({ focus, short, long }, autoStart, {
        dailyGoalSessions: dailyGoal,
        sessionsBeforeLongBreak: cycle,
      })
      if (applied) toast.success("Saved in this browser.")
      else showErrorToast("Reset or finish the timer first.")
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
      toast.success("Focus rhythm saved.")
    } catch {
      showErrorToast("The focus rhythm could not be saved.")
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
          {/* Until the saved row is here there is nothing true to put in the
              boxes, and three empty boxes read as a rhythm of nothing. */}
          {!loaded && !loadFailed ? (
            <LoadingRow label="Loading your focus rhythm…" />
          ) : null}
          {/* The failure stays in the card as well as in the toast. A toast
              can be dismissed, and a card with nothing in it and no word about
              why is the state this used to fall into. ErrorRow raises the
              shared toast itself, so nothing here fires a second one. */}
          {loadFailed ? (
            <ErrorRow
              message="Your timer settings could not be loaded."
              onRetry={() => {
                dismissErrorToast()
                setLoadFailed(false)
                setAttempt((count) => count + 1)
              }}
            />
          ) : null}
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
          {loaded ? (
            <>
              <RhythmMinutesFields
                idPrefix="timer"
                focusMinutes={focus}
                shortBreakMinutes={short}
                longBreakMinutes={long}
                onFocusMinutes={setFocus}
                onShortBreakMinutes={setShort}
                onLongBreakMinutes={setLong}
              />
              <NumberField
                id="timer-goal"
                label="Daily session goal"
                hint={`Only completed focus sessions count toward your daily goal and streak. ${DAILY_GOAL_LIMIT_REASON}`}
                value={dailyGoal}
                min={DAILY_GOAL_MIN}
                max={DAILY_GOAL_MAX}
                onChange={setDailyGoal}
                inputClassName="sm:max-w-40"
              />
              <NumberField
                id="timer-long-break-cycle"
                label="Sessions before long break"
                hint="How many focuses earn the long break. Four is the classic pattern; a 50-minute rhythm usually wants two."
                value={cycle}
                min={SESSIONS_BEFORE_LONG_BREAK_MIN}
                max={SESSIONS_BEFORE_LONG_BREAK_MAX}
                onChange={setCycle}
                inputClassName="sm:max-w-40"
              />
              <div className="flex items-center gap-2">
                <Switch
                  id="timer-auto-start"
                  checked={autoStart}
                  onCheckedChange={setAutoStart}
                />
                <Label htmlFor="timer-auto-start">Auto-start the next timer</Label>
              </div>
            </>
          ) : null}
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
            <Button disabled={saving || !loaded} onClick={() => void save()}>
              {saving ? "Saving…" : "Save focus rhythm"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
