"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface ListingWidgetsSettingsCardProps {
  listingWidgetsEnabled: boolean
  onListingWidgetsEnabledChange: (value: boolean) => void
}

export function ListingWidgetsSettingsCard({
  listingWidgetsEnabled,
  onListingWidgetsEnabledChange
}: ListingWidgetsSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Listing Widgets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="listingWidgets">Embeddable Listing Widgets</Label>
            <p className="text-xs text-muted-foreground">
              Let claimed listing owners embed a badge or mini-card on their own websites that links back here.
            </p>
          </div>
          <Switch
            id="listingWidgets"
            checked={listingWidgetsEnabled}
            onCheckedChange={onListingWidgetsEnabledChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
