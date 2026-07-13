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
import { usePersistedState } from "@/lib/use-persisted-state"

export function TradingSettings() {
  // Same key + default the order ticket reads, saved per-browser.
  const [confirmEnabled, setConfirmEnabled] = usePersistedState<boolean>(
    "trading:order-confirmation",
    true
  )

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Order confirmation</CardTitle>
          <CardDescription>
            When on, placing a manual order opens a confirmation box first so you
            can review it before it goes through. Turn it off to send orders
            straight away. This choice is saved only in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Checkbox
              id="order-confirmation"
              checked={confirmEnabled}
              onCheckedChange={(checked) => setConfirmEnabled(checked === true)}
            />
            <Label htmlFor="order-confirmation" className="font-normal">
              Ask me to confirm before placing an order
            </Label>
          </div>
        </CardContent>
      </Card>
    </CardGroup>
  )
}
