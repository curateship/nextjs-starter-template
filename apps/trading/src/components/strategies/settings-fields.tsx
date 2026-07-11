import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StrategySettings } from "@/lib/strategies/settings"

/**
 * THE settings form — the one block every strategy carries (direction, order
 * size, TP/SL, flip, compounding). Used by the strategy editor, and later the
 * bot editor and backtest run dialog, so the fields can never drift apart.
 */
export function SettingsFields({
  value,
  onChange,
}: {
  value: StrategySettings
  onChange: (next: StrategySettings) => void
}) {
  const num = (raw: string): number | undefined => {
    const parsed = Number(raw)
    return raw === "" || !(parsed > 0) ? undefined : parsed
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Direction</Label>
        <Select
          value={value.direction}
          onValueChange={(direction) =>
            onChange({ ...value, direction: direction as StrategySettings["direction"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Long + short</SelectItem>
            <SelectItem value="long">Long only</SelectItem>
            <SelectItem value="short">Short only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="set-size" className="text-xs">
          Order size (USD)
        </Label>
        <Input
          id="set-size"
          type="number"
          min={1}
          value={value.orderSizeUsd}
          className="h-8 text-xs"
          onChange={(event) =>
            onChange({ ...value, orderSizeUsd: Number(event.target.value) || 0 })
          }
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="set-tp" className="text-xs">
          Take profit % (empty = none)
        </Label>
        <Input
          id="set-tp"
          type="number"
          min={0}
          step={0.1}
          value={value.takeProfitPct ?? ""}
          className="h-8 text-xs"
          onChange={(event) =>
            onChange({ ...value, takeProfitPct: num(event.target.value) })
          }
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="set-sl" className="text-xs">
          Stop loss % (empty = none)
        </Label>
        <Input
          id="set-sl"
          type="number"
          min={0}
          step={0.1}
          value={value.stopLossPct ?? ""}
          className="h-8 text-xs"
          onChange={(event) =>
            onChange({ ...value, stopLossPct: num(event.target.value) })
          }
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={value.flipOnOppositeSignal}
          onCheckedChange={(checked) =>
            onChange({ ...value, flipOnOppositeSignal: checked === true })
          }
        />
        Flip on opposite signal
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={value.compounding}
          onCheckedChange={(checked) =>
            onChange({ ...value, compounding: checked === true })
          }
        />
        Compound (bet full balance)
      </label>
    </div>
  )
}
