import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { RunsOnSelect } from "@/components/social/accounts/runs-on-select"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addRedditAccount, getRedditAccountsErrorMessage } from "@/lib/api/social/reddit-accounts"
import { readRunsOn } from "@/lib/social/runs-on"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The voice picker's value for "no voice". */
const NO_VOICE = "none"

/**
 * Adds a Reddit account: where it runs, a browser profile or a phone, and the
 * voice it drafts with. One Reddit account per profile and per phone, so one
 * already holding one, and the reader browser, are not offered. Signing in to
 * Reddit happens afterwards, in that profile's browser or on that phone.
 */
export function AddAccountDialog({
  open,
  profiles,
  phones,
  voices,
  onClose,
  onAdded,
}: {
  open: boolean
  profiles: Array<{ id: string; name: string }>
  phones: Array<{ id: string; name: string }>
  voices: Array<{ id: string; name: string }>
  onClose: () => void
  onAdded: () => Promise<void>
}) {
  const [runsOn, setRunsOn] = React.useState("")
  const [voiceId, setVoiceId] = React.useState(NO_VOICE)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setRunsOn("")
    setVoiceId(NO_VOICE)
    setInvalid(false)
  }

  async function add() {
    if (!runsOn) {
      setInvalid(true)
      showErrorToast("Pick the browser profile or the phone the account runs on.")
      return
    }
    const picked = readRunsOn(runsOn)
    setSaving(true)
    try {
      await addRedditAccount({ ...picked, voiceId: voiceId === NO_VOICE ? null : voiceId })
      if (picked.phoneId) {
        const name = phones.find((phone) => phone.id === picked.phoneId)?.name ?? "that phone"
        toast.success(`Account added. Sign in to the Reddit app on ${name}.`)
      } else {
        const name = profiles.find((profile) => profile.id === picked.profileId)?.name ?? "that profile"
        toast.success(`Account added. Sign in to Reddit in ${name}'s browser on the Browser profiles dashboard.`)
      }
      reset()
      await onAdded()
    } catch (error) {
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={Boolean(runsOn) || voiceId !== NO_VOICE}
      busy={saving}
      onClose={() => {
        reset()
        onClose()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Add a Reddit account</DialogTitle>
            <DialogDescription>
              The account runs on a browser profile or a phone of its own. Put it
              in a project on the Projects dashboard afterwards.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The account</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="add-account-runs-on">Runs on</Label>
                    <RunsOnSelect
                      id="add-account-runs-on"
                      value={runsOn}
                      onChange={(value) => {
                        setRunsOn(value)
                        setInvalid(false)
                      }}
                      profiles={profiles}
                      phones={phones}
                      invalid={invalid}
                    />
                    {profiles.length || phones.length ? null : (
                      <p className="text-sm text-muted-foreground">
                        Every profile and phone already holds an account, or is the
                        reader. Make a new profile on the{" "}
                        <Link
                          to="/admin/profiles"
                          search={{ open: undefined }}
                          className="font-medium text-foreground underline underline-offset-2"
                        >
                          Browser profiles dashboard
                        </Link>{" "}
                        or add a phone on the{" "}
                        <Link
                          to="/admin/phones"
                          search={{ open: undefined }}
                          className="font-medium text-foreground underline underline-offset-2"
                        >
                          Phones dashboard
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-account-voice">Voice</Label>
                    <Select value={voiceId} onValueChange={setVoiceId}>
                      <SelectTrigger id="add-account-voice" className="w-full sm:w-fit sm:min-w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VOICE}>No voice</SelectItem>
                        {voices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                Add account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
