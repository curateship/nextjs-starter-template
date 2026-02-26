"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { NavigationStyleAdminProps } from "./index"

export function DefaultNavigationConfig({ config, onConfigChange }: NavigationStyleAdminProps) {
  const containerWidth = config.containerWidth || 'custom'
  const customWidth = config.customWidth
  const showDarkModeToggle = config.showDarkModeToggle !== false
  const backgroundColor = config.backgroundColor || '#ffffff'
  const textColor = config.textColor || '#000000'
  const blurEffect = config.blurEffect || 'none'

  return (
    <div className="">
      {/* Navigation Width */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Navigation Width</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {containerWidth !== 'full' && (
                <div className="w-32">
                  <Input
                    type="number"
                    min="320"
                    max="2560"
                    value={customWidth || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === '') {
                        onConfigChange('customWidth', undefined)
                      } else {
                        const numValue = parseInt(value)
                        onConfigChange('customWidth', isNaN(numValue) ? undefined : numValue)
                      }
                    }}
                    placeholder="1152"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  checked={containerWidth === 'full'}
                  onCheckedChange={(checked) => onConfigChange('containerWidth', checked ? 'full' : 'custom')}
                />
                <Label className="text-sm">
                  Full Width
                </Label>
              </div>
            </div>

            {containerWidth !== 'full' && (
              <p className="text-xs text-muted-foreground">
                Default: 1152px • Range: 320-2560px
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dark Mode */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dark Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="showDarkModeToggle">Show Toggle</Label>
              <p className="text-sm text-muted-foreground">Display theme switcher in navigation</p>
            </div>
            <Switch
              id="showDarkModeToggle"
              checked={showDarkModeToggle}
              onCheckedChange={(checked) => onConfigChange('showDarkModeToggle', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Colors & Effects */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Colors & Effects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="navBgColor">Background Color</Label>
              <div className="flex gap-2">
                <input
                  id="navBgColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => onConfigChange('backgroundColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => onConfigChange('backgroundColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="navBlurEffect">Glass Blur Effect</Label>
              <Select
                value={blurEffect}
                onValueChange={(value) => onConfigChange('blurEffect', value)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="heavy">Heavy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="navTextColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  id="navTextColor"
                  type="color"
                  value={textColor}
                  onChange={(e) => onConfigChange('textColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer shadow-sm border-0 p-1"
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => onConfigChange('textColor', e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
