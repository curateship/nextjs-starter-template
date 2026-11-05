import * as React from "react"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getViralKeyErrorMessage, loadViralKey, makeNewViralKey, type ViralKeyView } from "@/lib/api/social/viral-link"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** The key, read once per page, so coming back to the tab draws at once. */
let held: ViralKeyView | null = null

/**
 * Settings → Viral: the key the Viral app reads X, LinkedIn and Reddit
 * through Promo with, and leaves posts in Promo's drafts with
 * (`workspace/docs/viral-link.md`). Copy it into Viral's Settings → Promo
 * connection with this Promo's address, and press Test there. A new key ends
 * the old one at once, so it asks first. Copied from Settings → Video.
 */
function ViralLinkSettings() {
  const [view, setView] = React.useState<ViralKeyView | null>(held)
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
      (error: unknown) => showErrorToast(getViralKeyErrorMessage(error))
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function makeKey() {
    setBusy(true)
    dismissErrorToast()
    try {
      const next = await makeNewViralKey()
      held = next
      setView(next)
      setAsking(false)
      toast.success("New key made. Paste it into Viral's Settings → Promo connection.")
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
      toast.success("Key copied.")
    } catch {
      showErrorToast("The browser wouldn't copy it. Select the key and copy it by hand.")
    }
  }

  if (!view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the Viral key
      </p>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-viral-key"
        title="Viral app"
        description="Viral reads X, LinkedIn and Reddit through this Promo's search accounts and reader with this key, and leaves the posts it writes as drafts here."
        contentClassName="grid gap-4"
      >
        {view.key ? (
          <div className="grid gap-2">
            <FieldLabel htmlFor="promo-viral-key" hint="Paste it on Viral's Settings → Promo connection, with this Promo's address, then press Test there.">
              Key for Viral
            </FieldLabel>
            <div className="flex gap-2">
              <Input id="promo-viral-key" readOnly value={view.key} className="font-mono" onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
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
            ? `Viral at ${view.viralUrl} last checked in${view.lastUsedAt ? ` on ${formatDateTime(view.lastUsedAt)}` : ""}. Promo only calls that address back.`
            : "No Viral has pressed Test with this key yet. Promo only calls back the Viral address that pressed Test."}
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
        description="The old key stops working at once, so Viral can't read through Promo or leave posts here until the new key is pasted there."
        confirmLabel="Make a new key"
        loading={busy}
        onConfirm={() => void makeKey()}
      />
    </CardGroup>
  )
}

export default ViralLinkSettings
