import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isRetiredReason, RETIRED_REASON_LABELS, RETIRED_REASONS, type RetiredReason } from "@/lib/bans/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Retire's confirm window asks why (Bans task, part 15): banned, sold, given
 * up, or other with a short note. A lost account can then be told apart from
 * a dropped one. Clean up after a ban fills in Banned by itself.
 */
export function RetireDialog({
  names,
  onClose,
  onRetire,
}: {
  /** The accounts it retires, in words, or null when the window is closed. */
  names: string[] | null
  onClose: () => void
  /** Retires them; false when it was refused, which keeps the window and the pick. */
  onRetire: (why: { reason: RetiredReason; note: string }) => Promise<boolean>
}) {
  const [reason, setReason] = React.useState<RetiredReason | "">("")
  const [note, setNote] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const many = (names?.length ?? 0) > 1

  async function retire() {
    if (!reason) {
      setInvalid(true)
      showErrorToast("Pick why it is retired: banned, sold, given up, or other.")
      return
    }
    setBusy(true)
    try {
      await onRetire({ reason, note: reason === "other" ? note.trim() : "" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={names !== null} dirty={Boolean(reason) || Boolean(note)} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{many ? `Retire ${names?.length} accounts` : `Retire ${names?.[0] ?? "this account"}`}</DialogTitle>
            <DialogDescription>
              A retired account leaves every list and picker, never posts and never warms up. Its comments stay. Bring it back with Show retired.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void retire()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Why</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="retire-reason">Reason</Label>
                    <Select
                      value={reason}
                      onValueChange={(value) => {
                        setReason(isRetiredReason(value) ? value : "")
                        setInvalid(false)
                      }}
                    >
                      <SelectTrigger id="retire-reason" className="w-full sm:w-fit sm:min-w-48" aria-invalid={invalid || undefined}>
                        <SelectValue placeholder="Pick a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {RETIRED_REASONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {RETIRED_REASON_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {reason === "other" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="retire-note">A short note</Label>
                      <Input id="retire-note" value={note} maxLength={200} placeholder="Lost the email" onChange={(event) => setNote(event.target.value)} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Retire
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
