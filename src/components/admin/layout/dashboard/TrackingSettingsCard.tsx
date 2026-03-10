"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface TrackingSettingsCardProps {
  trackingScripts?: string
  posthogApiKey?: string
  posthogHost?: string
  onTrackingScriptsChange?: (value: string) => void
  onPosthogApiKeyChange?: (value: string) => void
  onPosthogHostChange?: (value: string) => void
}

export function TrackingSettingsCard({
  trackingScripts = "",
  posthogApiKey = "",
  posthogHost = "",
  onTrackingScriptsChange,
  onPosthogApiKeyChange,
  onPosthogHostChange
}: TrackingSettingsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Tracking Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PostHog */}
        {onPosthogApiKeyChange && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="posthogApiKey">PostHog API Key</Label>
              <Input
                id="posthogApiKey"
                value={posthogApiKey}
                onChange={(e) => onPosthogApiKeyChange(e.target.value)}
                placeholder="phc_..."
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="posthogHost">PostHog Host</Label>
              <Input
                id="posthogHost"
                value={posthogHost}
                onChange={(e) => onPosthogHostChange?.(e.target.value)}
                placeholder="https://us.i.posthog.com"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default PostHog US cloud host.
              </p>
            </div>
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
              For any other tracking scripts not listed above. These will be added to the &lt;head&gt; section of your site.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}