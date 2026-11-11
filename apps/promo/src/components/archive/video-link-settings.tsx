import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getVideoKeyErrorMessage, loadVideoKey, makeNewVideoKey, type VideoKeyView } from "@/lib/api/archive/video-link"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** The key, read once per page, so coming back to the tab draws at once. */
let held: VideoKeyView | null = null

/**
 * Settings → Video: the key the Video app sends videos, carousels and
 * pictures into the Archive with (`workspace/docs/archive.md`). Copy it into
 * Video's Settings → Promo with this Promo's address, and press Test there.
 * A new key ends the old one at once, so it asks first.
 */
function VideoLinkSettings() {
  const [view, setView] = React.useState<VideoKeyView | null>(held)
  const [busy, setBusy] = React.useState(false)
  const [asking, setAsking] = React.useState(false)

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadVideoKey().then(
      (loaded) => {
        held = loaded
        if (!cancelled) setView(loaded)
      },
      (error: unknown) => showErrorToast(getVideoKeyErrorMessage(error))
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function makeKey() {
    setBusy(true)
    dismissErrorToast()
    try {
      const next = await makeNewVideoKey()
      held = next
      setView(next)
      setAsking(false)
    } catch (error) {
      showErrorToast(getVideoKeyErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!view?.key) return
    try {
      await navigator.clipboard.writeText(view.key)
    } catch {
      showErrorToast("The browser wouldn't copy it. Select the key and copy it by hand.")
    }
  }

  if (!view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the Video key
      </p>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-video-key"
        title="Video app"
        description="Send to Promo in the Video app puts videos, carousels and pictures into this Promo's Archive with this key."
        contentClassName="grid gap-4"
      >
        {view.key ? (
          <div className="grid gap-2">
            <FieldLabel htmlFor="promo-video-key" hint="Paste it on Video's Settings → Promo, with this Promo's address, then press Test there.">
              Key for Video
            </FieldLabel>
            <div className="flex gap-2">
              <Input id="promo-video-key" readOnly value={view.key} className="font-mono" onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                <CopyIcon className="size-4" />
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">There is no key yet. Make one, then paste it into Video.</p>
        )}
        <p className="text-sm text-muted-foreground">
          {view.videoUrl
            ? `Video at ${view.videoUrl} last checked in${view.lastUsedAt ? ` on ${formatDateTime(view.lastUsedAt)}` : ""}. Files are only fetched from that address.`
            : "No Video has pressed Test with this key yet. Promo only fetches files from the Video address that pressed Test."}
        </p>
        <div>
          <Button type="button" variant={view.key ? "outline" : "default"} disabled={busy} onClick={() => (view.key ? setAsking(true) : void makeKey())}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {view.key ? "Make a new key" : "Make a key"}
          </Button>
        </div>
      </CollapsibleSettingsCard>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Make a new key?"
        description="The old key stops working at once, so Send to Promo in Video stops until the new key is pasted there."
        confirmLabel="Make a new key"
        loading={busy}
        onConfirm={() => void makeKey()}
      />
    </CardGroup>
  )
}

export default VideoLinkSettings
