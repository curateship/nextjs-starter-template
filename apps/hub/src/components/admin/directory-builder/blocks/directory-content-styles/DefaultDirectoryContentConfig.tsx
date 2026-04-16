"use client"

import { BlockEditorSection } from "@/components/admin/shared/BlockTabs"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import type { DirectoryContentStyleAdminProps } from "./index"

export function DefaultDirectoryContentConfig({ config, onConfigChange }: DirectoryContentStyleAdminProps) {
  const { currentSite } = useSiteSwitcher()
  const siteDefaultWidth = currentSite?.settings?.custom_width
  const alignment = config.alignment || 'center'
  const titleSize = config.titleSize || 'large'

  return (
    <div className="space-y-6">
      <BlockEditorSection heading="Content Alignment">
          <div className="flex gap-4">
            {(['left', 'center'] as const).map((option) => (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={`directory-alignment-${option}`}
                  checked={alignment === option}
                  onCheckedChange={() => onConfigChange('alignment', option)}
                />
                <Label htmlFor={`directory-alignment-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
              </div>
            ))}
          </div>
      </BlockEditorSection>

      <BlockEditorSection heading="Title Size">
          <div className="flex gap-4">
            {([
              { key: 'medium', label: 'Medium' },
              { key: 'large', label: 'Large' },
              { key: 'extra-large', label: 'Extra Large' },
            ] as const).map((option) => (
              <div key={option.key} className="flex items-center gap-2">
                <Checkbox
                  id={`directory-title-size-${option.key}`}
                  checked={titleSize === option.key}
                  onCheckedChange={() => onConfigChange('titleSize', option.key)}
                />
                <Label htmlFor={`directory-title-size-${option.key}`} className="text-sm cursor-pointer">{option.label}</Label>
              </div>
            ))}
          </div>
      </BlockEditorSection>

      <BlockEditorSection heading="Content Width">
          <div className="flex items-center gap-2">
            <Label htmlFor="directoryContentMaxWidth" className="text-sm">Max width</Label>
            <Input
              id="directoryContentMaxWidth"
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
      </BlockEditorSection>
    </div>
  )
}
