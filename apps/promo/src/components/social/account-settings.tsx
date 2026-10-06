import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  getAccountErrorMessage,
  loadRedditAccount,
  saveRedditAccount,
  type AccountSettings,
} from "@/lib/api/social/account"

/**
 * Settings for the one Reddit account: which browser profile it signs in
 * inside, and which voice it drafts with.
 *
 * Neither lives here. The browser belongs to the profile, on the Browser
 * profiles dashboard, and the words belong to the voice, on the Voices
 * dashboard, because the next network uses the same browsers and may share
 * the same voice. Tyler, 5 Oct 2026: "proxy and browser isolation is an app
 * wide feature, not just a reddit feature."
 */

/** The picker's value for "no profile", since a Select item cannot be empty. */
const NONE = "none"

function RedditAccountSettings() {
  const [data, setData] = React.useState<AccountSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const [profileId, setProfileId] = React.useState(NONE)
  const [voiceId, setVoiceId] = React.useState(NONE)

  const fill = React.useCallback((next: AccountSettings) => {
    setData(next)
    setProfileId(next.account?.profile?.id ?? NONE)
    setVoiceId(next.account?.voice?.id ?? NONE)
  }, [])

  // Every `setState` happens in the fetch's own callbacks, never in the body
  // of the effect. `loading` starts true, so nothing switches on first.
  React.useEffect(() => {
    loadRedditAccount().then(
      (next) => {
        fill(next)
        setLoading(false)
      },
      (error: unknown) => {
        showErrorToast(getAccountErrorMessage(error))
        setLoading(false)
      }
    )
  }, [fill])

  async function save() {
    setSaving(true)
    try {
      await saveRedditAccount({
        profileId: profileId === NONE ? null : profileId,
        voiceId: voiceId === NONE ? null : voiceId,
      })
      fill(await loadRedditAccount())
      toast.success("Reddit account saved.")
    } catch (error) {
      showErrorToast(getAccountErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading your Reddit account
      </p>
    )
  }

  const profiles = data?.profiles ?? []
  const chosen = profiles.find((profile) => profile.id === profileId) ?? null
  const voices = data?.voices ?? []
  const chosenVoice = voices.find((voice) => voice.id === voiceId) ?? null

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>The browser it signs in inside</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="promo-profile">Browser profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger id="promo-profile" className="w-full sm:w-fit sm:min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No profile</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {chosen ? (
              <>
                Searches and comments run in this profile&apos;s browser, through
                its proxy.{" "}
                <Link
                  to="/admin/profiles"
                  search={{ open: chosen.id }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Open {chosen.name}
                </Link>{" "}
                on the Browser profiles dashboard to sign in or clear a captcha.
              </>
            ) : (
              <>
                Without a profile nothing can be searched or posted. A profile
                that already holds a Reddit account is not offered. Make a new
                one on the{" "}
                <Link
                  to="/admin/profiles"
                  search={{ open: undefined }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Browser profiles dashboard
                </Link>
                .
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>How the AI should sound</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="promo-voice">Voice</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger id="promo-voice" className="w-full sm:w-fit sm:min-w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No voice</SelectItem>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {chosenVoice ? (
              <>
                Drafts use this voice&apos;s words, what you make and your rules.{" "}
                <Link
                  to="/admin/voices"
                  search={{ open: chosenVoice.id }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Open {chosenVoice.name}
                </Link>{" "}
                on the Voices dashboard to change them. Every account using it changes
                with it.
              </>
            ) : (
              <>
                Without a voice, drafts are written plainly and never mention what
                you make. Write one on the{" "}
                <Link
                  to="/admin/voices"
                  search={{ open: undefined }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Voices dashboard
                </Link>
                .
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  )
}

export default RedditAccountSettings
