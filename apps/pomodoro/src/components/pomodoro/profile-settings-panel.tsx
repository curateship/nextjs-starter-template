import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import BlockedAccountsCard from "@/components/pomodoro/blocked-accounts-card"
import PublicProfileSettingsPanel from "@/components/pomodoro/public-profile-settings-panel"
import StreakBadgeCard from "@/components/pomodoro/streak-badge-card"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import { TimezonePicker } from "@/components/pomodoro/timezone-picker"
import { getAuthErrorMessage, updateProfile } from "@/lib/api/auth/auth"
import {
  loadPomodoroProfile,
  updatePomodoroProfile,
} from "@/lib/api/pomodoro/profile"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const productLayout = getRouteApi("/_pomodoro")

/**
 * The account's photo: the one the header's account menu and the public page
 * both draw. It is the shell's own `avatarUrl`, saved through the shell's own
 * `updateProfile`, which refuses a picture this account did not upload.
 *
 * It saves the moment a picture is picked or removed, unlike the fields below
 * it, because picking from the media window is already the deliberate step.
 * The layout is reloaded afterwards so the menu changes without a page reload.
 */
function AccountPhotoField() {
  const { user } = productLayout.useLoaderData()
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  if (!user) return null

  const save = async (avatarUrl: string) => {
    setSaving(true)
    try {
      await updateProfile(user.name, avatarUrl)
      await router.invalidate()
      toast.success(avatarUrl ? "Photo saved." : "Photo removed.")
    } catch (cause) {
      showErrorToast(getAuthErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ImageUpload
      label="Photo"
      value={user.avatarUrl}
      onChange={(avatarUrl) => void save(avatarUrl)}
      aspect="square"
      emptyLabel="Add photo"
      hint="Shown on your account menu and on your public page. With no photo, your initials are drawn instead. It saves as soon as you pick or remove one."
      disabled={saving}
      // The media window opens over the page, so the field only needs room
      // for the square itself.
      className="max-w-20"
    />
  )
}

/**
 * The Profile tab on Settings: the account photo, the public display name,
 * the timezone that anchors the day boundary for goals and streaks, and the
 * leaderboard opt-in, then the public page and the streak badge in their own
 * cards below. Account name, email, password and deletion stay with the
 * shell's account dialog.
 */
export default function ProfileSettingsPanel() {
  const [displayName, setDisplayName] = React.useState("")
  const [timezone, setTimezone] = React.useState("")
  const [leaderboard, setLeaderboard] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  // Only the load failure is held, because it decides whether the fields are
  // drawn. Saves report themselves through the toasts.
  const [loadFailed, setLoadFailed] = React.useState(false)
  // Bumped by Try again, which is what re-runs the load below.
  const [attempt, setAttempt] = React.useState(0)
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
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const save = async () => {
    if (!timezone.trim()) {
      showErrorToast(
        "Pick a timezone before saving. It decides when your day rolls over."
      )
      return
    }
    setSaving(true)
    try {
      await updatePomodoroProfile({
        publicDisplayName: displayName.trim() || null,
        timezone: timezone.trim(),
        leaderboardOptIn: leaderboard,
      })
      toast.success("Profile saved.")
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("INVALID_TIMEZONE")
          ? "That timezone is not recognised. Pick another one from the list."
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
          <AccountPhotoField />
          {/* The fields arrive with the saved profile in them, so they are not
              offered before it lands: typing into an empty name and having the
              load overwrite it a moment later is the worse outcome. */}
          {!loaded && !loadFailed ? (
            <LoadingRow label="Loading your profile…" />
          ) : null}
          {/* The failure stays in the card as well as in the toast, because a
              toast can be dismissed and an empty card explains nothing.
              ErrorRow raises the shared toast itself. */}
          {loadFailed ? (
            <ErrorRow
              message="Your profile could not be loaded."
              onRetry={() => {
                dismissErrorToast()
                setLoadFailed(false)
                setAttempt((count) => count + 1)
              }}
            />
          ) : null}
          {loaded ? (
            <>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="profile-display-name"
                  hint="The name other people see on the leaderboard, in rooms and on your public page. Leave it empty and your handle is used instead."
                >
                  Public display name
                </FieldLabel>
                <Input
                  id="profile-display-name"
                  maxLength={50}
                  value={displayName}
                  placeholder="Shown on the leaderboard and in rooms"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="profile-timezone"
                  hint={`Your days, goals and streaks roll over at midnight in this timezone. Yours right now is ${browserTimezone()}.`}
                >
                  Timezone
                </FieldLabel>
                <TimezonePicker
                  id="profile-timezone"
                  value={timezone}
                  browserZone={browserTimezone()}
                  invalid={!timezone.trim()}
                  onChange={setTimezone}
                />
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
            </>
          ) : null}
          <div className="flex items-center gap-3">
            {/* Enabled with an empty timezone on purpose: the rulebook keeps
                the action pressable and names the problem on the press, so an
                empty box gets a sentence instead of a dead button. */}
            <Button disabled={!loaded || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <PublicProfileSettingsPanel />
      <BlockedAccountsCard />
      <StreakBadgeCard />
    </div>
  )
}
