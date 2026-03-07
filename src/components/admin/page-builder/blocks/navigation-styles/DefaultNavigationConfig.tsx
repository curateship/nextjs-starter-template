"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { NavigationStyleAdminProps } from "./index"

export function DefaultNavigationConfig({ config, onConfigChange }: NavigationStyleAdminProps) {
  const backgroundColor = config.backgroundColor || '#ffffff'
  const textColor = config.textColor || '#000000'
  const blurEffect = config.blurEffect || 'none'

  return (
    <div className="">
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
