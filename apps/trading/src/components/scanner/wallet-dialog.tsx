import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateScannerWallet, type ScannerWalletInfo } from "@/lib/api/scanner"
import { shortAddress } from "@/lib/format"

/**
 * Label / track / ignore controls for a scanner wallet. Works for wallets
 * that have not been discovered yet — saving upserts the row.
 */
export function WalletDialog({
  address,
  wallet,
  open,
  onOpenChange,
  onSaved,
}: {
  address: string
  wallet: ScannerWalletInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (info: ScannerWalletInfo) => void
}) {
  const [label, setLabel] = React.useState(wallet?.label ?? "")
  const [tracked, setTracked] = React.useState(wallet?.tracked ?? false)
  const [ignored, setIgnored] = React.useState(wallet?.ignored ?? false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Re-seed the form fields whenever the dialog opens (render-time adjust).
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setLabel(wallet?.label ?? "")
      setTracked(wallet?.tracked ?? false)
      setIgnored(wallet?.ignored ?? false)
      setError(null)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const info = await updateScannerWallet({
        address,
        label: label.trim() === "" ? null : label.trim(),
        tracked,
        ignored,
      })
      onSaved?.(info)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{wallet?.label || shortAddress(address)}</DialogTitle>
          <DialogDescription className="font-mono">{address}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Label and tracking</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="scanner-wallet-label">Label</Label>
                <Input
                  id="scanner-wallet-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. BTC mega whale"
                />
              </div>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={tracked}
                  onCheckedChange={(checked) => setTracked(checked === true)}
                />
                <span className="text-sm">
                  Track this wallet
                  <span className="block text-xs text-muted-foreground">
                    Tracked wallets get priority stats refreshes and the
                    tracked-only feed filter.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={ignored}
                  onCheckedChange={(checked) => setIgnored(checked === true)}
                />
                <span className="text-sm">
                  Ignore this wallet
                  <span className="block text-xs text-muted-foreground">
                    Ignored wallets (e.g. market makers) are hidden from feeds
                    and never trigger alerts.
                  </span>
                </span>
              </label>
              <Link
                to="/scanner/whales/$address"
                params={{ address }}
                className="inline-block text-sm text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                View wallet detail →
              </Link>
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
