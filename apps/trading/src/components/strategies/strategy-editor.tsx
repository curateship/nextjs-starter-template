import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { StrategyConfigFields } from "@/components/strategies/strategy-config-fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  saveStrategy,
  type SavedStrategyConfig,
  type StrategyListItem,
} from "@/lib/api/strategies"
import {
  defaultStrategyConfig,
  strategyKindOf,
  type StrategyConfig,
  type StrategyTypeId,
} from "@/lib/strategies/strategy-config"

/**
 * Create/edit one saved strategy: a name plus the full config form (shared
 * with the backtest re-run dialog — a template is just a saved starting
 * point). Everything type-specific renders off the strategy-kind registry,
 * so new kinds need no edits here.
 */
export function StrategyEditorDialog({
  open,
  target,
  initialType,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** null = create new. */
  target: StrategyListItem | null
  /** Seeds a new strategy's type (e.g. from a scoped New Run dialog). */
  initialType?: StrategyTypeId
  onOpenChange: (open: boolean) => void
  onSaved: (saved: StrategyListItem) => void
}) {
  const [name, setName] = React.useState("")
  const [config, setConfig] = React.useState<StrategyConfig>(() =>
    defaultStrategyConfig("qqe", "15m")
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName(target?.name ?? "")
    setConfig(
      target
        ? target.config
        : defaultStrategyConfig(initialType ?? "qqe", "15m")
    )
    setError(null)
  }, [open, target, initialType])

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError("Give the strategy a name.")
      return
    }
    if (config.kind === "automation") {
      setError("Automations must be edited from the Automations canvas.")
      return
    }
    // Parse the kind's own branch for precise error messages (the union's
    // aggregated errors are unreadable).
    const parsed = strategyKindOf(config).configSchema.safeParse(config)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid configuration")
      return
    }
    setBusy(true)
    try {
      const { strategy } = await saveStrategy({
        strategyId: target?.id,
        name: name.trim(),
        config: parsed.data as SavedStrategyConfig,
      })
      onOpenChange(false)
      onSaved(strategy)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{target ? "Edit strategy" : "New strategy"}</DialogTitle>
          <DialogDescription>
            An indicator strategy trades its chart signals with one settings
            block; other engines (like the DCA ladder) bring their own knobs.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1.5">
                <Label htmlFor="strategy-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="strategy-name"
                  value={name}
                  placeholder="e.g. QQE 15m BTC"
                  className="h-8 text-xs"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <StrategyConfigFields value={config} onChange={setConfig} />
            </CardContent>
          </Card>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {target ? "Save changes" : "Create strategy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
