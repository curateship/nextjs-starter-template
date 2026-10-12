import * as React from "react"
import { Link } from "@tanstack/react-router"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addRedditAccount, getRedditAccountsErrorMessage } from "@/lib/api/social/reddit-accounts"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The voice picker's value for "no voice". */
const NO_VOICE = "none"

/**
 * Adds a Reddit account: the browser profile it signs in inside and the voice
 * it drafts with, the two choices Settings → Reddit account offers. One
 * Reddit account per profile, so a profile already holding one, and the
 * reader browser, are not offered. Signing in to Reddit happens afterwards,
 * in that profile's browser.
 */
export function AddAccountDialog({
  open,
  profiles,
  voices,
  onClose,
  onAdded,
}: {
  open: boolean
  profiles: Array<{ id: string; name: string }>
  voices: Array<{ id: string; name: string }>
  onClose: () => void
  onAdded: () => Promise<void>
}) {
  const [profileId, setProfileId] = React.useState("")
  const [voiceId, setVoiceId] = React.useState(NO_VOICE)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  function reset() {
    setProfileId("")
    setVoiceId(NO_VOICE)
    setInvalid(false)
  }

  async function add() {
    if (!profileId) {
      setInvalid(true)
      showErrorToast("Pick the browser profile the account signs in inside.")
      return
    }
    setSaving(true)
    try {
      await addRedditAccount({ profileId, voiceId: voiceId === NO_VOICE ? null : voiceId })
      const name = profiles.find((profile) => profile.id === profileId)?.name ?? "that profile"
      toast.success(`Account added. Sign in to Reddit in ${name}'s browser on the Browser profiles dashboard.`)
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
      dirty={Boolean(profileId) || voiceId !== NO_VOICE}
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
              The account signs in inside its own browser profile. Put it in a
              project on the Projects dashboard afterwards.
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
                    <Label htmlFor="add-account-profile">Browser profile</Label>
                    <Select
                      value={profileId}
                      onValueChange={(value) => {
                        setProfileId(value)
                        setInvalid(false)
                      }}
                    >
                      <SelectTrigger
                        id="add-account-profile"
                        className="w-full sm:w-fit sm:min-w-64"
                        aria-invalid={invalid || undefined}
                      >
                        <SelectValue placeholder="Pick a profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {profiles.length ? null : (
                      <p className="text-sm text-muted-foreground">
                        Every profile already holds an account or is the reader.
                        Make a new one on the{" "}
                        <Link
                          to="/admin/profiles"
                          search={{ open: undefined }}
                          className="font-medium text-foreground underline underline-offset-2"
                        >
                          Browser profiles dashboard
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
