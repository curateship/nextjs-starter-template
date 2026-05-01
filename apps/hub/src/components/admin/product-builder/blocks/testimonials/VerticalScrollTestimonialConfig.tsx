"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { TestimonialStyleAdminProps } from "./index"

function parseDurationInput(value: string) {
  return value === '' ? '' : Number(value)
}

export function VerticalScrollTestimonialConfig({ config, onConfigChange }: TestimonialStyleAdminProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="testimonial-column-one-duration">Column 1 Duration</Label>
        <Input
          id="testimonial-column-one-duration"
          type="number"
          min={5}
          max={60}
          value={config.firstColumnDuration ?? 15}
          onChange={(e) => onConfigChange('firstColumnDuration', parseDurationInput(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="testimonial-column-two-duration">Column 2 Duration</Label>
        <Input
          id="testimonial-column-two-duration"
          type="number"
          min={5}
          max={60}
          value={config.secondColumnDuration ?? 19}
          onChange={(e) => onConfigChange('secondColumnDuration', parseDurationInput(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="testimonial-column-three-duration">Column 3 Duration</Label>
        <Input
          id="testimonial-column-three-duration"
          type="number"
          min={5}
          max={60}
          value={config.thirdColumnDuration ?? 17}
          onChange={(e) => onConfigChange('thirdColumnDuration', parseDurationInput(e.target.value))}
        />
      </div>
    </div>
  )
}
