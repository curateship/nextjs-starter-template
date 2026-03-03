"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useSiteContext } from "@/contexts/site-context"
import type { EventContentStyleAdminProps } from "./index"

export function DefaultEventContentConfig({ config, onConfigChange }: EventContentStyleAdminProps) {
  const { currentSite } = useSiteContext()
  const siteDefaultWidth = currentSite?.settings?.custom_width
  const alignment = config.alignment || 'center'
  const titleSize = config.titleSize || 'large'

  return (
    <div>
      {/* Content Alignment */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Content Alignment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {(['left', 'center'] as const).map((option) => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`event-alignment-${option}`}
                  checked={alignment === option}
                  onCheckedChange={() => onConfigChange('alignment', option)}
                />
                <Label htmlFor={`event-alignment-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Title Size */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Title Size</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {([
              { key: 'medium', label: 'Medium' },
              { key: 'large', label: 'Large' },
              { key: 'extra-large', label: 'Extra Large' },
            ] as const).map((option) => (
              <div key={option.key} className="flex items-center gap-2">
                <Checkbox
                  id={`event-title-size-${option.key}`}
                  checked={titleSize === option.key}
                  onCheckedChange={() => onConfigChange('titleSize', option.key)}
                />
                <Label htmlFor={`event-title-size-${option.key}`} className="text-sm cursor-pointer">{option.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Width */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Content Width</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Label htmlFor="eventContentMaxWidth" className="text-sm">Max width</Label>
            <input
              id="eventContentMaxWidth"
              type="number"
              min="480"
              max="1280"
              value={config.contentMaxWidth ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  onConfigChange('contentMaxWidth', undefined)
                } else {
                  const value = parseInt(raw)
                  if (!isNaN(value)) {
                    onConfigChange('contentMaxWidth', value)
                  }
                }
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value)
                if (isNaN(value)) return
                if (value < 480) onConfigChange('contentMaxWidth', 480)
                else if (value > 1280) onConfigChange('contentMaxWidth', 1280)
              }}
              placeholder={siteDefaultWidth ? String(siteDefaultWidth) : ''}
              className="w-20 px-2 py-1 border rounded-md text-sm"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {config.contentMaxWidth == null ? (siteDefaultWidth ? `Using site default (${siteDefaultWidth}px)` : 'Using site default width') : 'Clear to use site default width'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
