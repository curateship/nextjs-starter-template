import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { AccountHealthCard } from "./account-health-card"
import { BlockedSubredditsCard } from "./blocked-subreddits-card"
import { CommentExamplesCard } from "./comment-examples-card"
import {
  getAccountErrorMessage,
  loadRedditAccount,
  saveRedditAccount,
  type AccountSettings,
} from "@/lib/api/social/account"

/**
 * Settings for the one Reddit account: which browser profile it signs in
 * inside, and which voice it drafts with. Below those, how Reddit sees the
 * account, the sent comments drafts copy the voice of, and the subreddits
 * never shown.
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
  // Each pick saves the moment it is made, and the outcome shows in the
  // shared sticky header like every other settings save. There is no Save
  // button.
  const setSaveStatus = useReportedSaveStatus()

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

  // Both values ride in as arguments rather than being read from state, so a
  // save sends exactly the pick that started it. A refused pick goes back to
  // what is saved, so the picker never shows something that is not.
  //
  // Two picks in quick succession are two saves in flight, and they can
  // answer in either order. Only the newest one's answer is put on screen, so
  // an older answer arriving last never undoes the newer pick.
  const latestSave = React.useRef(0)
  async function save(next: { profileId: string; voiceId: string }) {
    const turn = ++latestSave.current
    setProfileId(next.profileId)
    setVoiceId(next.voiceId)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveRedditAccount({
        profileId: next.profileId === NONE ? null : next.profileId,
        voiceId: next.voiceId === NONE ? null : next.voiceId,
      })
      const saved = await loadRedditAccount()
      if (turn !== latestSave.current) return
      fill(saved)
      setSaveStatus("saved")
    } catch (error) {
      if (turn !== latestSave.current) return
      setSaveStatus("idle")
      if (data) fill(data)
      showErrorToast(getAccountErrorMessage(error))
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
    // The shell's own settings cards in a `CardGroup`, so the cards and the
    // gap between them follow Settings → Styling like every other settings
    // screen.
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-reddit-profile"
        title="The browser it signs in inside"
        description="Searches and comments run in this profile's browser, through its proxy."
        contentClassName="grid gap-4"
      >
          <div className="grid gap-2">
            <Label htmlFor="promo-profile">Browser profile</Label>
            <Select
              value={profileId}
              onValueChange={(value) => void save({ profileId: value, voiceId })}
            >
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
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-reddit-voice"
        title="How the AI should sound"
        description="The voice drafts are written in."
        contentClassName="grid gap-4"
      >
          <div className="grid gap-2">
            <Label htmlFor="promo-voice">Voice</Label>
            <Select
              value={voiceId}
              onValueChange={(value) => void save({ profileId, voiceId: value })}
            >
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
      </CollapsibleSettingsCard>

      {/* Each of these reads and writes on its own. */}
      <AccountHealthCard />
      <CommentExamplesCard />
      <BlockedSubredditsCard />
    </CardGroup>
  )
}

export default RedditAccountSettings
