"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LeadMagnetStyleAdminProps } from "."
import { BlockEditorSection } from "@/components/ui/tabs"

const ACCENT_COLORS = [
  { value: 'indigo', label: 'Indigo' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'rose', label: 'Rose' },
  { value: 'amber', label: 'Amber' },
  { value: 'violet', label: 'Violet' },
  { value: 'teal', label: 'Teal' },
]

export function CardLeadMagnetConfig({ config, onConfigChange }: LeadMagnetStyleAdminProps) {
  const accentColor = config.accentColor || 'indigo'
  const showMailIcon = config.showMailIcon ?? true
  const showPrivacyNote = config.showPrivacyNote ?? true

  return (
    <div>
      <BlockEditorSection heading="Appearance">
          <div className="space-y-2">
            <Label className="text-xs">Accent Color</Label>
            <Select
              value={accentColor}
              onValueChange={(v) => onConfigChange('accentColor', v)}
            >
              <SelectTrigger size="button" className="w-40">
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
            <Checkbox
              id="showMailIcon"
              checked={showMailIcon}
              onCheckedChange={(checked) => onConfigChange('showMailIcon', !!checked)}
            />
            <Label htmlFor="showMailIcon">Show mail icon</Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="showPrivacyNote"
              checked={showPrivacyNote}
              onCheckedChange={(checked) => onConfigChange('showPrivacyNote', !!checked)}
            />
            <Label htmlFor="showPrivacyNote">Show privacy note</Label>
          </div>
      </BlockEditorSection>
    </div>
  )
}
