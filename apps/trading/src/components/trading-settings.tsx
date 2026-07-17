import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ShellConfig } from "@/lib/custom-shell"
import {
  clampLiquidationAlertThreshold,
  MAX_LIQUIDATION_ALERT_THRESHOLD_PCT,
} from "@/lib/trading/liquidation-risk"

export function TradingSettings({
  config,
  isSaving,
  onConfigChange,
  onSaveConfig,
}: {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: (config: ShellConfig) => Promise<boolean>
}) {
  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Order confirmation</CardTitle>
          <CardDescription>
            When on, entering, exiting, or cancelling all orders opens a
            confirmation box first. Turn it off to send those actions straight
            away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Checkbox
              id="order-confirmation"
              checked={config.orderConfirmation}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                const next = {
                  ...config,
                  orderConfirmation: checked === true,
                }
                onConfigChange(next)
                void onSaveConfig(next)
              }}
            />
            <Label htmlFor="order-confirmation" className="font-normal">
              Ask me to confirm before entering, exiting, or cancelling all orders
            </Label>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Liquidation warning</CardTitle>
          <CardDescription>
            Get a notification when any position's distance to forced
            liquidation drops to this percent of the current price. Checked
            once a minute by the background worker; repeated warnings for the
            same position are limited to one every 30 minutes. Set 0 to turn
            it off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              id="liquidation-alert-threshold"
              type="number"
              min={0}
              max={MAX_LIQUIDATION_ALERT_THRESHOLD_PCT}
              step={0.5}
              value={config.liquidationAlertThresholdPct}
              disabled={isSaving}
              className="h-8 w-28"
              aria-label="Liquidation warning threshold percent"
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  liquidationAlertThresholdPct: clampLiquidationAlertThreshold(
                    Number(event.target.value)
                  ),
                })
              }
              onBlur={() => void onSaveConfig(config)}
            />
            <Label
              htmlFor="liquidation-alert-threshold"
              className="font-normal"
            >
              % away from liquidation
            </Label>
          </div>
        </CardContent>
      </Card>
    </CardGroup>
  )
}
