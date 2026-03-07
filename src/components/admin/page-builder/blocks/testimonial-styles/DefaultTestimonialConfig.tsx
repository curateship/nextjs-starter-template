"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import type { TestimonialStyleAdminProps } from "./index"

export function DefaultTestimonialConfig({ config, onConfigChange }: TestimonialStyleAdminProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="testimonial-speed">Scroll Speed</Label>
        <Input
          id="testimonial-speed"
          type="number"
          step={0.1}
          min={0.1}
          max={3}
          value={config.speed ?? 0.7}
          onChange={(e) => onConfigChange('speed', parseFloat(e.target.value) || 0.7)}
        />
        <p className="text-xs text-muted-foreground">Auto-scroll speed (0.1 - 3.0)</p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="testimonial-second-row"
          checked={config.showSecondRow ?? true}
          onCheckedChange={(checked) => onConfigChange('showSecondRow', !!checked)}
        />
        <Label htmlFor="testimonial-second-row" className="cursor-pointer">
          Show second carousel row
        </Label>
      </div>
    </div>
  )
}
