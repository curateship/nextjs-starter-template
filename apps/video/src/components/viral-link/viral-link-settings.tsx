import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { getViralKeyErrorMessage, loadViralKey, makeNewViralKey, type ViralKeyView } from "@/lib/api/video/viral-link"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** The key, read once per page, so coming back to the tab draws at once. */
let held: ViralKeyView | null = null

/**
 * Settings → Viral: the key the Viral app sends drafts from its vault into
 * Video with (`workspace/docs/viral-connection.md`). Copy it into Viral's
 * Settings → Video connection with this Video's address, and press Test
 * there. A new key ends the old one at once, so it asks first. Copied from
 * Promo's Settings → Video.
 */
function ViralLinkSettings() {
  const [view, setView] = React.useState<ViralKeyView | null>(held)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [asking, setAsking] = React.useState(false)

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadViralKey().then(
      (loaded) => {
        held = loaded
        if (!cancelled) setView(loaded)
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getViralKeyErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function makeKey() {
    setBusy(true)
    dismissErrorToast()
    try {
      const next = await makeNewViralKey()
      held = next
      setView(next)
      setAsking(false)
    } catch (error) {
      showErrorToast(getViralKeyErrorMessage(error))
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

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-viral-key"
        title="Viral app"
        description="Send to Video in the Viral app makes a draft in one of your projects with this key, with the script, your notes and the original video in its Media."
        contentClassName="grid gap-4"
      >
        {/* A failed read says why and offers Retry, inside the card, as Settings → Promo does. */}
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !view ? (
          <LoadingRow label="Reading the Viral key…" />
        ) : (
          <ViralKey view={view} busy={busy} onCopy={() => void copy()} onMake={() => (view.key ? setAsking(true) : void makeKey())} />
        )}
      </CollapsibleSettingsCard>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Make a new key?"
        description="The old key stops working at once, so Send to Video in Viral stops until the new key is pasted there."
        confirmLabel="Make a new key"
        loading={busy}
        onConfirm={() => void makeKey()}
      />
    </CardGroup>
  )
}

/** The key and where Viral last checked in from, once both are read. */
function ViralKey({
  view,
  busy,
  onCopy,
  onMake,
}: {
  view: ViralKeyView
  busy: boolean
  onCopy: () => void
  onMake: () => void
}) {
  return (
    <>
      {view.key ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="video-viral-key" hint="Paste it on Viral's Settings → Video connection, with this Video's address, then press Test there.">
            Key for Viral
          </FieldLabel>
          <div className="flex gap-2">
            <Input id="video-viral-key" readOnly value={view.key} className="font-mono" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={onCopy}>
              <CopyIcon className="size-4" />
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">There is no key yet. Make one, then paste it into Viral.</p>
      )}
      <p className="text-sm text-muted-foreground">
        {view.viralUrl
          ? `Viral at ${view.viralUrl} last checked in${view.lastUsedAt ? ` on ${formatDateTime(view.lastUsedAt)}` : ""}. Videos are only fetched from that address.`
          : "No Viral has pressed Test with this key yet. Video only fetches videos from the Viral address that pressed Test."}
      </p>
      <div>
        <Button type="button" variant={view.key ? "outline" : "default"} disabled={busy} onClick={onMake}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {view.key ? "Make a new key" : "Make a key"}
        </Button>
      </div>
    </>
  )
}

export default ViralLinkSettings
