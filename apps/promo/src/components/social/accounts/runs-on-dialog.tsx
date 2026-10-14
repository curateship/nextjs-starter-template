import * as React from "react"
import { Loader2Icon } from "lucide-react"
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
  setRedditAccountRunsOn,
  type RedditAccountRow,
} from "@/lib/api/social/reddit-accounts"
import { readRunsOn, runsOnValue } from "@/lib/social/runs-on"
import { showErrorToast } from "@/lib/toast/error-toast"

import { RunsOnSelect } from "./runs-on-select"

/**
 * Moves one account to another browser profile or phone. Whatever it ran on
 * before is cleared in the same save, so it is never on two at once. The
 * account then signs in again in the new place: cookies and app sign-ins do
 * not move with it.
 */
export function RunsOnDialog({
  account,
  profiles,
  phones,
  onClose,
  onSaved,
}: {
  /** Null when the window is closed. */
  account: RedditAccountRow | null
  /** Profiles and phones with no Reddit account on them. */
  profiles: Array<{ id: string; name: string }>
  phones: Array<{ id: string; name: string }>
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const initial = account
    ? runsOnValue({ profileId: account.profile?.id ?? null, phoneId: account.phone?.id ?? null })
    : ""
  const [value, setValue] = React.useState(initial)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const name = account?.handle ? `u/${account.handle}` : "this account"

  // The account's own profile or phone is not on the free lists, because it
  // holds this account. It goes back on, first, so the picker can show it.
  const allProfiles = account?.profile ? [account.profile, ...profiles] : profiles
  const allPhones = account?.phone ? [account.phone, ...phones] : phones

  async function save() {
    if (!account) return
    if (!value) {
      setInvalid(true)
      showErrorToast("Pick the browser profile or the phone the account runs on.")
      return
    }
    setSaving(true)
    try {
      await setRedditAccountRunsOn(account.id, readRunsOn(value))
      toast.success(`${name} moved. Sign in to Reddit there before it posts.`)
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
            <DialogTitle>Where {name} runs</DialogTitle>
            <DialogDescription>
              A browser profile or a phone, never both. Sign-ins do not move with it, so
              sign in to Reddit again in the new place.
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
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Runs on</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="runs-on-pick">Browser profile or phone</Label>
                    <RunsOnSelect
                      id="runs-on-pick"
                      value={value}
                      onChange={(next) => {
                        setValue(next)
                        setInvalid(false)
                      }}
                      profiles={allProfiles}
                      phones={allPhones}
                      invalid={invalid}
                    />
                  </div>
                </CardContent>
              </Card>
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
