"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface TrackingSettingsCardProps {
  trackingScripts?: string
  onTrackingScriptsChange?: (value: string) => void
}

export function TrackingSettingsCard({
  trackingScripts = "",
  onTrackingScriptsChange
}: TrackingSettingsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Tracking Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tracking Scripts */}
        {onTrackingScriptsChange && (
          <div className="space-y-2">
            <Label htmlFor="trackingScripts">Custom Tracking Scripts</Label>
            <Textarea
              id="trackingScripts"
              value={trackingScripts}
              onChange={(e) => onTrackingScriptsChange(e.target.value)}
              placeholder="Paste your tracking scripts here (PostHog, Google Analytics, etc.)..."
              className="font-mono text-sm"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Add any tracking scripts (PostHog, Google Analytics, Facebook Pixel, etc.). These will be added to the &lt;head&gt; section of your site.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}