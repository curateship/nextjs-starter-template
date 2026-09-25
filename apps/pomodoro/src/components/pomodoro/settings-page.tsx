import { Link } from "@tanstack/react-router"

import TimerSettingsPanel from "@/components/pomodoro/timer-settings-panel"
import ProfileSettingsPanel from "@/components/pomodoro/profile-settings-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useProductAuth } from "@/lib/pomodoro/auth-state"

/**
 * The product's Settings page, like the old app's: the focus rhythm (with
 * presets and completion alerts) and the profile. Account email, password
 * and deletion stay with the platform's own account area.
 */
export function SettingsPage() {
  const { authenticated } = useProductAuth()
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Your rhythm, your profile, your look.
        </p>
      </header>
      <TimerSettingsPanel />
      {authenticated ? (
        <ProfileSettingsPanel />
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Sync across devices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Everything here saves in this browser. Sign in to keep your
              focus history, join rooms and appear on the leaderboard.
            </p>
            <Button asChild className="rounded-full font-bold">
              <Link to="/register">Create free account</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
