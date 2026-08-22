import * as React from "react"
import { EyeIcon } from "lucide-react"

import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
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
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DEFAULT_CHART_OPTIONS,
  type ChartOptions,
  type ChartOptionToggle,
} from "@/lib/trade/chart-options"
import { TRADING_ZONES, readTradingZone } from "@/lib/trade/chart-timezone"
import { showErrorToast } from "@/lib/toast/error-toast"

const CHART_OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "grid", label: "Chart grid" },
  { key: "volume", label: "Volume" },
  { key: "crosshair", label: "Crosshair" },
]
const ACTIVITY_OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "orderArrows", label: "Order arrows" },
  { key: "drawings", label: "Your drawings" },
]

function ToggleGrid({
  options,
  draft,
  onChange,
}: {
  options: { key: ChartOptionToggle; label: string }[]
  draft: ChartOptions
  onChange: (key: ChartOptionToggle, checked: boolean) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={`chart-option-${key}`}
            checked={draft[key]}
            onCheckedChange={(checked) => onChange(key, checked === true)}
          />
          <label
            htmlFor={`chart-option-${key}`}
            className="text-sm leading-none"
          >
            {label}
          </label>
        </div>
      ))}
    </div>
  )
}

export function ChartOptionsMenu({
  control,
}: {
  control: ChartOptionsControl
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(control.options)
  const [trades, setTrades] = React.useState(
    control.options.orderArrowTrades?.toString() ?? ""
  )

  function openDialog(next: boolean) {
    if (next) {
      setDraft(control.options)
      setTrades(control.options.orderArrowTrades?.toString() ?? "")
    }
    setOpen(next)
  }

  function save() {
    const amount = trades === "" ? null : Number(trades)
    if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) {
      showErrorToast(
        "Previous trades must be a whole number greater than zero."
      )
      return
    }
    control.replace({ ...draft, orderArrowTrades: amount })
    setOpen(false)
  }

  function reset() {
    setDraft(DEFAULT_CHART_OPTIONS)
    setTrades(DEFAULT_CHART_OPTIONS.orderArrowTrades?.toString() ?? "")
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="View options"
            onClick={() => openDialog(true)}
          >
            <EyeIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View options</TooltipContent>
      </Tooltip>
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>View options</DialogTitle>
          <DialogDescription>
            What the chart draws and how it reads time. Applies to every market
            you open.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Chart</CardTitle>
              <p className="text-sm text-muted-foreground">
                Furniture drawn under the price.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ToggleGrid
                options={CHART_OPTIONS}
                draft={draft}
                onChange={(key, checked) =>
                  setDraft((current) => ({ ...current, [key]: checked }))
                }
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Your activity</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your own orders and markings, drawn over the price.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ToggleGrid
                options={ACTIVITY_OPTIONS}
                draft={draft}
                onChange={(key, checked) =>
                  setDraft((current) => ({ ...current, [key]: checked }))
                }
              />
              {draft.orderArrows ? (
                <div className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-end">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="chart-option-order-arrow-trades"
                      hint="Enter how many of the newest finished trades should keep their arrows. Leave this empty to show every finished trade."
                    >
                      Previous trades
                    </FieldLabel>
                    <Input
                      id="chart-option-order-arrow-trades"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      placeholder="All"
                      value={trades}
                      aria-invalid={
                        trades !== "" &&
                        (!Number.isSafeInteger(Number(trades)) ||
                          Number(trades) <= 0)
                      }
                      onChange={(event) => setTrades(event.target.value)}
                    />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">
                    most recent trades
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                <FieldLabel
                  htmlFor="chart-option-zone"
                  hint="Every time on the chart uses this clock, including the axis and session starts."
                >
                  Timezone
                </FieldLabel>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Select
                value={draft.zone}
                onValueChange={(zone) =>
                  setDraft((current) => ({
                    ...current,
                    zone: readTradingZone(zone),
                  }))
                }
              >
                <SelectTrigger id="chart-option-zone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADING_ZONES.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Candle times and session breaks follow this.
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={reset}
          >
            Reset to defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
