import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  loadStreakReminder,
  saveStreakReminder,
} from "@/lib/api/pomodoro/streak-reminder"
import {
  formatReminderHour,
  STREAK_REMINDER_HOURS,
} from "@/lib/pomodoro/streak-reminder"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Reminder = { bell: boolean; hour: number }

/**
 * Settings → Timer: the evening nudge in the bell when a streak is alive and
 * today is still empty. Off until switched on. Signed-in members only,
 * because a guest's streak lives in one browser that nothing can reach.
 */
export function StreakReminderCard() {
  const [draft, setDraft] = React.useState<Reminder | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadStreakReminder()
      .then((saved) => {
        if (cancelled) return
        setDraft({ bell: saved.bell, hour: saved.hour })
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await saveStreakReminder(draft)
      toast.success("Streak reminder saved.")
    } catch {
      showErrorToast("The streak reminder could not be saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Streak reminder</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loadFailed ? (
          <ErrorRow
            message="Your streak reminder could not be loaded."
            onRetry={() => {
              dismissErrorToast()
              setLoadFailed(false)
              setAttempt((count) => count + 1)
            }}
          />
        ) : !draft ? (
          <LoadingRow label="Loading your streak reminder…" />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              When your streak is alive and today has no finished focus by
              the hour below, one nudge. Never twice in a day, and nothing at
              all once you have focused.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="streak-reminder-bell"
                checked={draft.bell}
                onCheckedChange={(bell) => setDraft({ ...draft, bell })}
              />
              <Label htmlFor="streak-reminder-bell">Remind me in the bell</Label>
            </div>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="streak-reminder-hour"
                hint="Your own local time, from the timezone on your profile."
              >
                Remind me from
              </FieldLabel>
              <Select
                value={String(draft.hour)}
                onValueChange={(value) =>
                  setDraft({ ...draft, hour: Number(value) })
                }
              >
                <SelectTrigger id="streak-reminder-hour" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STREAK_REMINDER_HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {formatReminderHour(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save reminder"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
