import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getViralErrorMessage,
  loadYoutubeKeyStatus,
  removeYoutubeKey,
  saveYoutubeKey,
  type YoutubeKeyStatus,
} from "@/lib/api/video/viral"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → YouTube: the one key the Viral page searches with, saved
 * encrypted beside the other video settings. The browser only ever sees the
 * key's last four characters. Removing the saved key falls back to the
 * VIDEO_YOUTUBE_API_KEY env var, if the deployment sets one.
 */
export default function YoutubeSettings() {
  const [status, setStatus] = React.useState<YoutubeKeyStatus | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadYoutubeKeyStatus()
      .then((loaded) => {
        if (!cancelled) setStatus(loaded)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getViralErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function save() {
    if (busy) return
    if (!draft.trim()) {
      showErrorToast("Paste a key before saving.")
      return
    }
    setBusy(true)
    try {
      setStatus(await saveYoutubeKey(draft))
      setDraft("")
      toast.success("YouTube key saved.")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      setStatus(await removeYoutubeKey())
      setRemoving(false)
      toast.success("YouTube key removed.")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-youtube-key"
        title="YouTube"
        description="The Viral page searches YouTube with this key. Get one free at console.cloud.google.com by switching on the YouTube Data API v3. It is scrambled before it is stored, and only its last four characters are ever shown again."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !status ? (
          <LoadingRow label="Checking for a saved key…" />
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {status.unreadable
                ? "A key is saved but can no longer be read — the server's encryption key changed. Paste the key again."
                : status.source === "settings"
                  ? `A key ending ${status.maskedKey} is saved here.`
                  : status.source === "env"
                    ? `The deployment's VIDEO_YOUTUBE_API_KEY is in use (ending ${status.maskedKey}). Saving one here overrides it.`
                    : "No key yet. The Viral page cannot search until one is saved."}
            </p>
            <div className="grid gap-2">
              <FieldLabel htmlFor="youtube-api-key">API key</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="youtube-api-key"
                  type="password"
                  placeholder="Paste your YouTube API key"
                  autoComplete="off"
                  maxLength={200}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void save()
                    }
                  }}
                  className="w-full max-w-sm"
                />
                <Button type="button" onClick={() => void save()}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Save key
                </Button>
                {status.source === "settings" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRemoving(true)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(false)
        }}
        title="Remove the saved YouTube key?"
        description="The Viral page stops searching unless the deployment's VIDEO_YOUTUBE_API_KEY env var is set. The key can be pasted again at any time."
        confirmLabel="Remove key"
        loading={busy}
        onConfirm={remove}
      />
    </CardGroup>
  )
}
