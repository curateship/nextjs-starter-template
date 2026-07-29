import { GuardianSettings } from "@/components/guardian-settings"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ShellConfig } from "@/lib/custom-shell"
import {
  clampLiquidationAlertThreshold,
  MAX_LIQUIDATION_ALERT_THRESHOLD_PCT,
} from "@/lib/trading/liquidation-risk"
import {
  clampDefaultLeverage,
  MAX_DEFAULT_LEVERAGE,
  MIN_DEFAULT_LEVERAGE,
} from "@/lib/trading/order-defaults"

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
            When on, every button that sends a real order asks &ldquo;Are you
            sure?&rdquo; first: placing an order (order ticket, chart trading,
            one-click panel), Close and Reverse in the positions table, and
            Cancel all orders. Turn it off and one click trades immediately,
            with no confirmation.
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
              Ask me to confirm before placing, closing, reversing, or
              cancelling orders
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
            <NumberInput
              id="liquidation-alert-threshold"
              min={0}
              max={MAX_LIQUIDATION_ALERT_THRESHOLD_PCT}
              step={0.5}
              value={config.liquidationAlertThresholdPct}
              disabled={isSaving}
              className="h-8 w-28"
              aria-label="Liquidation warning threshold percent"
              onValueChange={(next) =>
                onConfigChange({
                  ...config,
                  liquidationAlertThresholdPct:
                    clampLiquidationAlertThreshold(next),
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
      <Card>
        <CardHeader>
          <CardTitle>Default order settings</CardTitle>
          <CardDescription>
            What a fresh order ticket starts with, on the trade page and the
            chart right-click box. You can still change any of it per order.
            Leverage is capped by what the market allows; practice wallets
            always trade at 1x.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-2">
              <Label htmlFor="default-leverage">Leverage</Label>
              <div className="flex items-center gap-2">
                <NumberInput
                  id="default-leverage"
                  inputMode="numeric"
                  min={MIN_DEFAULT_LEVERAGE}
                  max={MAX_DEFAULT_LEVERAGE}
                  step={1}
                  value={config.orderDefaults.leverage}
                  disabled={isSaving}
                  className="w-24"
                  onValueChange={(next) =>
                    onConfigChange({
                      ...config,
                      orderDefaults: {
                        ...config.orderDefaults,
                        leverage: clampDefaultLeverage(next),
                      },
                    })
                  }
                  onBlur={() => void onSaveConfig(config)}
                />
                <span className="text-sm text-muted-foreground">x</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default-margin-mode">Margin mode</Label>
              <Select
                value={config.orderDefaults.marginMode}
                disabled={isSaving}
                onValueChange={(value) => {
                  const next = {
                    ...config,
                    orderDefaults: {
                      ...config.orderDefaults,
                      marginMode: value as "cross" | "isolated",
                    },
                  }
                  onConfigChange(next)
                  void onSaveConfig(next)
                }}
              >
                <SelectTrigger
                  id="default-margin-mode"
                  size="default"
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cross">Cross</SelectItem>
                  <SelectItem value="isolated">Isolated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default-order-type">Order type</Label>
              <Select
                value={config.orderDefaults.orderType}
                disabled={isSaving}
                onValueChange={(value) => {
                  const next = {
                    ...config,
                    orderDefaults: {
                      ...config.orderDefaults,
                      orderType: value as "market" | "limit",
                    },
                  }
                  onConfigChange(next)
                  void onSaveConfig(next)
                }}
              >
                <SelectTrigger
                  id="default-order-type"
                  size="default"
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="market">Market</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default-size-unit">Size entered in</Label>
              <Select
                value={config.orderDefaults.sizeUnit}
                disabled={isSaving}
                onValueChange={(value) => {
                  const next = {
                    ...config,
                    orderDefaults: {
                      ...config.orderDefaults,
                      sizeUnit: value as "usd" | "coin" | "pct",
                    },
                  }
                  onConfigChange(next)
                  void onSaveConfig(next)
                }}
              >
                <SelectTrigger
                  id="default-size-unit"
                  size="default"
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">Dollars</SelectItem>
                  <SelectItem value="coin">Coins</SelectItem>
                  <SelectItem value="pct">% of balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      <GuardianSettings />
    </CardGroup>
  )
}
