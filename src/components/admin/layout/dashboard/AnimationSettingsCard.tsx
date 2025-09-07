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
        {/* Master Toggle and Controls Row */}
        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-3">
            <Switch
              id="animations-enabled"
              checked={animations.enabled}
              onCheckedChange={(enabled) =>
                onAnimationsChange({ ...animations, enabled })
              }
            />
            <div className="space-y-1">
              <Label htmlFor="animations-enabled" className="text-sm font-medium">
                Enable Animations
              </Label>
            </div>
          </div>

          {animations.enabled && (
            <>
              {/* Animation Style */}
              <div className="flex items-center space-x-2">
                <Label className="text-sm font-medium whitespace-nowrap">Style:</Label>
                <Select
                  value={animations.preset}
                  onValueChange={(preset: any) =>
                    onAnimationsChange({ ...animations, preset })
                  }
                >
                  <SelectTrigger className="w-32">
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
              <div className="flex items-center space-x-2">
                <Label className="text-sm font-medium whitespace-nowrap">Intensity:</Label>
                <Select
                  value={animations.intensity}
                  onValueChange={(intensity: any) =>
                    onAnimationsChange({ ...animations, intensity })
                  }
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Subtle</SelectItem>
                    <SelectItem value="medium">Normal</SelectItem>
                    <SelectItem value="high">Dramatic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        
        {/* Description */}
        <p className="text-xs text-muted-foreground">
          Add smooth animations to all page blocks. {animations.enabled && "Controls the distance and scale of animation effects."}
        </p>
      </CardContent>
    </Card>
  )
}