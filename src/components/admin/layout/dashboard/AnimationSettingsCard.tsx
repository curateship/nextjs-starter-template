"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { AnimationSettings } from "@/lib/actions/sites/site-actions"

interface AnimationSettingsCardProps {
  animations: AnimationSettings
  onAnimationsChange: (value: AnimationSettings) => void
}

export function AnimationSettingsCard({
  animations,
  onAnimationsChange,
}: AnimationSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Page Animations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="animations-enabled" className="text-sm font-medium">
              Enable Animations
            </Label>
            <p className="text-xs text-muted-foreground">
              Add smooth animations to all page blocks
            </p>
          </div>
          <Switch
            id="animations-enabled"
            checked={animations.enabled}
            onCheckedChange={(enabled) =>
              onAnimationsChange({ ...animations, enabled })
            }
          />
        </div>

        {animations.enabled && (
          <>
            {/* Animation Style */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Animation Style</Label>
              <Select
                value={animations.preset}
                onValueChange={(preset: any) =>
                  onAnimationsChange({ ...animations, preset })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fade">Fade In</SelectItem>
                  <SelectItem value="slide">Slide Up</SelectItem>
                  <SelectItem value="scale">Scale Up</SelectItem>
                  <SelectItem value="blur">Blur to Focus</SelectItem>
                  <SelectItem value="blur-slide">Blur + Slide</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Animation Intensity */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Animation Intensity</Label>
              <Select
                value={animations.intensity}
                onValueChange={(intensity: any) =>
                  onAnimationsChange({ ...animations, intensity })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Subtle</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="high">Dramatic</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Controls the distance and scale of animation effects
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}