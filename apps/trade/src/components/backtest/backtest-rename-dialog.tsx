import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  getBacktestErrorMessage,
  renameBacktest,
} from "@/lib/api/backtests"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { BacktestListRow } from "@/lib/trade/backtest/result"

/**
 * Naming a run.
 *
 * More than a label: an unnamed run is replaced by the same flow's next one, so
 * typing a name here is how you say "keep this". The window says so, because
 * that is not something anybody would guess.
 */
export function BacktestRenameDialog({
  run,
  onOpenChange,
  onSaved,
}: {
  run: { id: string; name: string | null } | BacktestListRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return run ? (
    <RenameForm
      key={run.id}
      run={run}
      onClose={() => onOpenChange(false)}
      onSaved={onSaved}
    />
  ) : null
}

function RenameForm({
  run,
  onClose,
  onSaved,
}: {
  run: { id: string; name: string | null }
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState(run.name ?? "")
  const [saving, setSaving] = React.useState(false)

  async function save() {
    setSaving(true)
    dismissErrorToast()
    try {
      await renameBacktest(run.id, name.trim())
      toast.success(
        name.trim() === ""
          ? "Name cleared. This run can now be replaced by the flow's next one."
          : "Run renamed."
      )
      onSaved()
    } catch (error) {
      showErrorToast(getBacktestErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      dirty={name !== (run.name ?? "")}
      busy={saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Name this run</DialogTitle>
            <DialogDescription>
              A named run is kept. An unnamed one is replaced the next time the
              same flow finishes a backtest.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Name</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="backtest-name"
                    hint="Leave it empty to go back to being replaceable."
                  >
                    What to call it
                  </FieldLabel>
                  <Input
                    id="backtest-name"
                    value={name}
                    maxLength={120}
                    placeholder="e.g. Five rungs, base stop, 20 big coins"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" size="lg" onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
