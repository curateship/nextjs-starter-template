"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import type { NavigationStyleAdminProps } from "./index"

export function DefaultNavigationConfig({ config, onConfigChange }: NavigationStyleAdminProps) {
  const hasCustomBg = config.backgroundColor !== '' && config.backgroundColor != null
  const hasCustomText = config.textColor !== '' && config.textColor != null
  const backgroundColor = hasCustomBg ? config.backgroundColor : '#ffffff'
  const textColor = hasCustomText ? config.textColor : '#000000'
  const blurEffect = config.blurEffect || 'none'

  return (
    <div className="">
      {/* Colors & Effects */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Colors & Effects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="customBgToggle"
                  checked={hasCustomBg}
                  onCheckedChange={(checked) => {
                    onConfigChange('backgroundColor', checked ? '#ffffff' : '')
                  }}
                />
                <Label htmlFor="customBgToggle">Custom Background Color</Label>
              </div>
              {!hasCustomBg && (
                <p className="text-xs text-muted-foreground">Using theme default — adapts to light/dark mode</p>
              )}
              {hasCustomBg && (
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
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="customTextToggle"
                  checked={hasCustomText}
                  onCheckedChange={(checked) => {
                    onConfigChange('textColor', checked ? '#000000' : '')
                  }}
                />
                <Label htmlFor="customTextToggle">Custom Text Color</Label>
              </div>
              {!hasCustomText && (
                <p className="text-xs text-muted-foreground">Using theme default — adapts to light/dark mode</p>
              )}
              {hasCustomText && (
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
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Glass Blur Effect</Label>
            <div className="flex gap-2">
              {(['none', 'light', 'medium', 'heavy'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onConfigChange('blurEffect', option)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    blurEffect === option
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    blurEffect === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}>
                    {blurEffect === option && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="capitalize">{option}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
