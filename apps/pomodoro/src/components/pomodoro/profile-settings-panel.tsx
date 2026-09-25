import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  loadPomodoroProfile,
  updatePomodoroProfile,
} from "@/lib/api/pomodoro/profile"
import { browserTimezone } from "@/lib/pomodoro/timer"

/**
 * The Profile tab on Settings: the public display name (the only name other
 * users ever see), the timezone that anchors the day boundary for goals and
 * streaks, and the leaderboard opt-in. Account name, email, password and
 * deletion stay with the shell's account dialog.
 */
export default function ProfileSettingsPanel() {
  const [displayName, setDisplayName] = React.useState("")
  const [timezone, setTimezone] = React.useState("")
  const [leaderboard, setLeaderboard] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void loadPomodoroProfile(browserTimezone())
      .then((profile) => {
        if (cancelled) return
        setDisplayName(profile.publicDisplayName ?? "")
        setTimezone(profile.timezone)
        setLeaderboard(profile.leaderboardOptIn)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled)
          setError("Your profile could not be loaded. Reload to retry.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    setNotice("")
    setError("")
    setSaving(true)
    try {
      await updatePomodoroProfile({
        publicDisplayName: displayName.trim() || null,
        timezone: timezone.trim(),
        leaderboardOptIn: leaderboard,
      })
      setNotice("Profile saved.")
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      setError(
        text.includes("INVALID_TIMEZONE")
          ? "That timezone is not recognised. Use an IANA name like Europe/Berlin."
          : "The profile could not be saved."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-display-name">Public display name</Label>
            <Input
              id="profile-display-name"
              maxLength={50}
              value={displayName}
              placeholder="Shown on the leaderboard and in rooms"
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              The only name other people ever see. Leave it empty to stay
              unnamed.
            </span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-timezone">Timezone</Label>
            <Input
              id="profile-timezone"
              maxLength={80}
              value={timezone}
              aria-describedby="profile-timezone-help"
              onChange={(event) => setTimezone(event.target.value)}
            />
            <span
              id="profile-timezone-help"
              className="text-xs text-muted-foreground"
            >
              Your days, goals and streaks roll over at midnight in this
              timezone. Yours right now is {browserTimezone()}.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="profile-leaderboard"
              checked={leaderboard}
              onCheckedChange={setLeaderboard}
            />
            <Label htmlFor="profile-leaderboard">
              Show me on the leaderboard
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Button
              disabled={!loaded || saving || !timezone.trim()}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save profile"}
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
