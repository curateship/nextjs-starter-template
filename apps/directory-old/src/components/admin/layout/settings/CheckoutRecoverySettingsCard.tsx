"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface CheckoutRecoverySettingsCardProps {
  checkoutRecoveryEnabled: boolean
  onCheckoutRecoveryEnabledChange: (value: boolean) => void
}

export function CheckoutRecoverySettingsCard({
  checkoutRecoveryEnabled,
  onCheckoutRecoveryEnabledChange
}: CheckoutRecoverySettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkout Recovery</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="checkoutRecovery">Abandoned Checkout Emails</Label>
            <p className="text-xs text-muted-foreground">
              Someone who starts paying for a product and doesn&apos;t finish gets one follow-up email a day later with a link back to their checkout.
            </p>
          </div>
          <Switch
            id="checkoutRecovery"
            checked={checkoutRecoveryEnabled}
            onCheckedChange={onCheckoutRecoveryEnabledChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
