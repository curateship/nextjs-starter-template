"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LeadMagnetStyleAdminProps } from "./index"

const ACCENT_COLORS = [
  { value: 'indigo', label: 'Indigo' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'rose', label: 'Rose' },
  { value: 'amber', label: 'Amber' },
  { value: 'violet', label: 'Violet' },
  { value: 'teal', label: 'Teal' },
]

export function DefaultLeadMagnetConfig({ config, onConfigChange }: LeadMagnetStyleAdminProps) {
  const accentColor = config.accentColor || 'indigo'
  const showMailIcon = config.showMailIcon ?? true
  const showPrivacyNote = config.showPrivacyNote ?? true

  return (
    <div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Accent Color</Label>
            <Select
              value={accentColor}
              onValueChange={(v) => onConfigChange('accentColor', v)}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENT_COLORS.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    {color.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showMailIcon"
              checked={showMailIcon}
              onChange={(e) => onConfigChange('showMailIcon', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="showMailIcon">Show mail icon</Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showPrivacyNote"
              checked={showPrivacyNote}
              onChange={(e) => onConfigChange('showPrivacyNote', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="showPrivacyNote">Show privacy note</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
