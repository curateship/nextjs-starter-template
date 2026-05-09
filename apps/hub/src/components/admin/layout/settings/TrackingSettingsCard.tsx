"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

interface TrackingSettingsCardProps {
  trackingScripts?: string
  customAnalyticsEnabled?: boolean
  onTrackingScriptsChange?: (value: string) => void
  onCustomAnalyticsEnabledChange?: (value: boolean) => void
}

export function TrackingSettingsCard({
  trackingScripts = "",
  customAnalyticsEnabled = false,
  onTrackingScriptsChange,
  onCustomAnalyticsEnabledChange
}: TrackingSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracking Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Custom Analytics */}
        {onCustomAnalyticsEnabledChange && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="customAnalytics">Built-in Analytics</Label>
              <p className="text-xs text-muted-foreground">
                Track page views, visitors, and engagement without third-party tools.
              </p>
            </div>
            <Switch
              id="customAnalytics"
              checked={customAnalyticsEnabled}
              onCheckedChange={onCustomAnalyticsEnabledChange}
            />
          </div>
        )}

        {/* Custom Tracking Scripts */}
        {onTrackingScriptsChange && (
          <div className="space-y-2">
            <Label htmlFor="trackingScripts">Custom Tracking Scripts</Label>
            <Textarea
              id="trackingScripts"
              value={trackingScripts}
              onChange={(e) => onTrackingScriptsChange(e.target.value)}
              placeholder="Paste any additional tracking scripts here (Facebook Pixel, Hotjar, etc.)..."
              className="font-mono text-sm"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              For any other tracking scripts not listed above. These will be added to the &lt;head&gt; section of your
              site.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
