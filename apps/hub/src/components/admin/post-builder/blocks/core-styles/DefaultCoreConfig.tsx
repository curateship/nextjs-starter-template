"use client"

import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import type { CoreStyleAdminProps } from "./index"

export function DefaultCoreConfig({ config, onConfigChange }: CoreStyleAdminProps) {
  const { currentSite } = useSiteSwitcher()
  const siteDefaultWidth = currentSite?.settings?.custom_width
  const alignment = config.alignment || 'center'
  const titleSize = config.titleSize || 'large'

  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">Content Alignment</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex gap-4">
            {(['left', 'center'] as const).map((option) => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`post-alignment-${option}`}
                  checked={alignment === option}
                  onCheckedChange={() => onConfigChange('alignment', option)}
                />
                <Label htmlFor={`post-alignment-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">Title Size</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex gap-4">
            {([
              { key: 'medium', label: 'Medium' },
              { key: 'large', label: 'Large' },
              { key: 'extra-large', label: 'Extra Large' },
            ] as const).map((option) => (
              <div key={option.key} className="flex items-center gap-2">
                <Checkbox
                  id={`title-size-${option.key}`}
                  checked={titleSize === option.key}
                  onCheckedChange={() => onConfigChange('titleSize', option.key)}
                />
                <Label htmlFor={`title-size-${option.key}`} className="text-sm cursor-pointer">{option.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">Content Width</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center gap-2">
            <Label htmlFor="contentMaxWidth" className="text-sm">Max width</Label>
            <Input
              id="contentMaxWidth"
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
              className="h-auto w-20 px-2 py-1 text-sm"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {config.contentMaxWidth == null ? (siteDefaultWidth ? `Using site default (${siteDefaultWidth}px)` : 'Using site default width') : 'Clear to use site default width'}
          </p>
        </CardContent>
      </Card>
    </CardGroup>
  )
}
