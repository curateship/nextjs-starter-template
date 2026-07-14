import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { ShellConfig } from "@/lib/custom-shell"

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
    </CardGroup>
  )
}
