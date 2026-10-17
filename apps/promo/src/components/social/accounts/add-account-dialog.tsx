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
import { aNetwork, isNetwork, isPhoneAppNetwork, NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { readRunsOn } from "@/lib/social/runs-on"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The voice picker's value for "no voice". */
const NO_VOICE = "none"

/**
 * Adds an account: its network, where it runs, and the voice it drafts with.
 * Reddit runs on a browser profile or a phone; Instagram and TikTok on a
 * phone only. One account of a network per profile and per phone, so one
 * already holding one, and the reader browser, are not offered. Signing in
 * happens afterwards, in that profile's browser or in the app on that phone.
 */
export function AddAccountDialog({
  open,
  initialPlatform,
  profiles,
  phones,
  voices,
  onClose,
  onAdded,
}: {
  open: boolean
  /** The network the dashboard is filtered to, picked to begin with. */
  initialPlatform: Network
  profiles: Array<{ id: string; name: string }>
  /** The phones free for each network. */
  phones: Record<Network, Array<{ id: string; name: string; note?: string }>>
  voices: Array<{ id: string; name: string }>
  onClose: () => void
  onAdded: () => Promise<void>
}) {
  const [platform, setPlatform] = React.useState<Network>(initialPlatform)
  const [runsOn, setRunsOn] = React.useState("")
  const [voiceId, setVoiceId] = React.useState(NO_VOICE)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const phoneOnly = isPhoneAppNetwork(platform)
  const platformProfiles = phoneOnly ? [] : profiles
  const platformPhones = phones[platform]

  function reset() {
    setPlatform(initialPlatform)
    setRunsOn("")
    setVoiceId(NO_VOICE)
    setInvalid(false)
  }

  async function add() {
    if (!runsOn) {
      setInvalid(true)
      showErrorToast(phoneOnly ? "Pick the phone the account runs on." : "Pick the browser profile or the phone the account runs on.")
      return
    }
    const picked = readRunsOn(runsOn)
    setSaving(true)
    try {
      await addRedditAccount({ ...picked, voiceId: voiceId === NO_VOICE ? null : voiceId, platform })
      if (picked.phoneId) {
        const name = platformPhones.find((phone) => phone.id === picked.phoneId)?.name ?? "that phone"
        toast.success(`Account added. Sign in to the ${NETWORK_NAMES[platform]} app on ${name}, then press Check now.`)
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
      dirty={Boolean(runsOn) || voiceId !== NO_VOICE || platform !== initialPlatform}
      busy={saving}
      onClose={() => {
        reset()
        onClose()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Add an account</DialogTitle>
            <DialogDescription>
              A Reddit account runs on a browser profile or a phone of its own; an Instagram or
              TikTok account runs on a phone only. Put it in a project on the Projects dashboard
              afterwards.
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
                    <Label htmlFor="add-account-platform">Network</Label>
                    <Select
                      value={platform}
                      onValueChange={(value) => {
                        if (!isNetwork(value)) return
                        setPlatform(value)
                        // A pick from the other network's list may not be on this one.
                        setRunsOn("")
                        setInvalid(false)
                      }}
                    >
                      <SelectTrigger id="add-account-platform" className="w-full sm:w-fit sm:min-w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NETWORKS.map((network) => (
                          <SelectItem key={network} value={network}>
                            {NETWORK_NAMES[network]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-account-runs-on">Runs on</Label>
                    <RunsOnSelect
                      id="add-account-runs-on"
                      value={runsOn}
                      onChange={(value) => {
                        setRunsOn(value)
                        setInvalid(false)
                      }}
                      profiles={platformProfiles}
                      phones={platformPhones}
                      invalid={invalid}
                    />
                    {platformProfiles.length || platformPhones.length ? null : phoneOnly ? (
                      <p className="text-sm text-muted-foreground">
                        Every phone already holds {aNetwork(platform)} account. Add a phone on the{" "}
                        <Link
                          to="/admin/phones"
                          search={{ open: undefined }}
                          className="font-medium text-foreground underline underline-offset-2"
                        >
                          Phones dashboard
                        </Link>
                        .
                      </p>
                    ) : (
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
