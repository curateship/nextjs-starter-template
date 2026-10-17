import * as React from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  getRedditAccountsErrorMessage,
  letRedditAccountRunAgain,
  setRedditAccountRunsOn,
  type RedditAccountRow,
} from "@/lib/api/social/reddit-accounts"
import { formatDateTime } from "@/lib/format/format-time"
import { handleWords, isNetwork, isPhoneAppNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import { readRunsOn, runsOnValue } from "@/lib/social/runs-on"
import { showErrorToast } from "@/lib/toast/error-toast"

import { AppProfileCard } from "./app-profile-card"
import { ImportanceCard } from "./importance-card"
import { RunsOnSelect } from "./runs-on-select"
import { TwoFactorCard } from "./two-factor-card"

/**
 * One account's settings, from the settings button on its row.
 *
 * Where it runs: moving it to another browser profile or phone clears what it
 * ran on before in the same save, so it is never on two at once, and it signs
 * in again in the new place: cookies and app sign-ins do not move with it.
 *
 * Its two-factor code: the authenticator secret is saved at once, encrypted,
 * apart from Save changes, and never shown again; only the current code is.
 *
 * A ban screen: when a phone found the app suspended, locked or asking to
 * confirm it's you, the account is stopped and the screen's words show here,
 * with the button that lets it run again once it is sorted.
 *
 * Important or throwaway: marking a phone account important, or moving a
 * throwaway from its browser profile to a phone (`importance-card.tsx`).
 *
 * An Instagram or TikTok account's profile: its name, bio, link and picture,
 * applied in the app by its phone (`app-profile-card.tsx`).
 */
export function AccountSettingsDialog({
  account,
  profiles,
  phones,
  onClose,
  onSaved,
  onChanged,
}: {
  /** Null when the window is closed. */
  account: RedditAccountRow | null
  /** Profiles and phones with no Reddit account on them. */
  profiles: Array<{ id: string; name: string }>
  phones: Array<{ id: string; name: string; note?: string }>
  onClose: () => void
  onSaved: () => Promise<void>
  /** The row changed without the window closing: a secret saved or removed. */
  onChanged: () => Promise<void>
}) {
  const initial = account
    ? runsOnValue({ profileId: account.profile?.id ?? null, phoneId: account.phone?.id ?? null })
    : ""
  const [value, setValue] = React.useState(initial)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [releasing, setReleasing] = React.useState(false)
  const name = account?.handle ? handleWords(account.platform, account.handle) : "this account"
  const appNetwork = account && isPhoneAppNetwork(account.platform) ? account.platform : null
  const networkName = account && isNetwork(account.platform) ? NETWORK_NAMES[account.platform] : "the network"

  async function runAgain() {
    if (!account) return
    setReleasing(true)
    try {
      await letRedditAccountRunAgain(account.id)
      toast.success(`${name} takes jobs again.`)
      await onChanged()
    } catch (error) {
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setReleasing(false)
    }
  }

  // The account's own profile or phone is not on the free lists, because it
  // holds this account. It goes back on, first, so the picker can show it.
  const allProfiles = account?.profile ? [account.profile, ...profiles] : profiles
  const allPhones = account?.phone ? [account.phone, ...phones] : phones

  async function save() {
    if (!account) return
    if (value === initial) {
      onClose()
      return
    }
    if (!value) {
      setInvalid(true)
      showErrorToast("Pick the browser profile or the phone the account runs on.")
      return
    }
    setSaving(true)
    try {
      await setRedditAccountRunsOn(account.id, readRunsOn(value))
      toast.success(`${name} moved. Sign in to ${networkName} there before it posts.`)
      await onSaved()
    } catch (error) {
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={account !== null} dirty={value !== initial} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Settings for {name}</DialogTitle>
            <DialogDescription>
              {appNetwork
                ? `Its ${NETWORK_NAMES[appNetwork]} profile, important or throwaway, the phone it runs on, and its two-factor code.`
                : "Important or throwaway, where it runs (a browser profile or a phone, never both), and its two-factor code."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <div className="grid gap-6">
              {account?.banScreen ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Stopped by a ban screen</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="text-sm">
                      On {formatDateTime(account.banScreen.at)} the phone showed: &ldquo;{account.banScreen.words}&rdquo;
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Its jobs are refused and the ones waiting were dropped. Sort it out on the phone
                      through its screen on the Phones dashboard, then let it run again.
                    </p>
                    <div>
                      <Button type="button" variant="outline" disabled={releasing} onClick={() => void runAgain()}>
                        {releasing ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                        Let it run again
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {account && appNetwork ? <AppProfileCard accountId={account.id} network={appNetwork} /> : null}
              {account ? <ImportanceCard account={account} phones={phones} onChanged={onChanged} /> : null}
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Runs on</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="runs-on-pick">{appNetwork ? "Phone" : "Browser profile or phone"}</Label>
                    <RunsOnSelect
                      id="runs-on-pick"
                      value={value}
                      onChange={(next) => {
                        setValue(next)
                        setInvalid(false)
                      }}
                      // An important account, and an Instagram or TikTok one, runs on a phone only.
                      profiles={account?.importance === "important" || appNetwork ? [] : allProfiles}
                      phones={allPhones}
                      invalid={invalid}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sign-ins do not move with it, so sign in to {networkName} again in the new place. A phone it
                    leaves needs wiping before another account goes on.
                  </p>
                </CardContent>
              </Card>
              {account ? (
                <TwoFactorCard accountId={account.id} saved={account.twoFactor} onChanged={onChanged} />
              ) : null}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
