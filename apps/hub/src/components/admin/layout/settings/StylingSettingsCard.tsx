"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ImageIcon, Sun, Moon, Monitor } from "lucide-react"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { FontSelector } from "@/components/admin/page-builder/layout/FontSelector"

interface StylingSettingsCardProps {
  fontFamily?: string
  secondaryFontFamily?: string
  favicon?: string
  siteWidth?: "full" | "custom"
  customWidth?: number
  defaultTheme?: "system" | "light" | "dark"
  onFontFamilyChange?: (value: string) => void
  onSecondaryFontFamilyChange?: (value: string) => void
  onFaviconChange?: (value: string) => void
  onSiteWidthChange?: (value: "full" | "custom") => void
  onCustomWidthChange?: (value: number | undefined) => void
  onDefaultThemeChange?: (value: "system" | "light" | "dark") => void
}

export function StylingSettingsCard({
  fontFamily = "playfair-display",
  secondaryFontFamily = "inter",
  favicon = "",
  siteWidth = "custom",
  customWidth,
  defaultTheme = "system",
  onFontFamilyChange,
  onSecondaryFontFamilyChange,
  onFaviconChange,
  onSiteWidthChange,
  onCustomWidthChange,
  onDefaultThemeChange
}: StylingSettingsCardProps) {
  const [showFaviconPicker, setShowFaviconPicker] = useState(false)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Styling Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Theme (Light/Dark Mode) */}
          {onDefaultThemeChange && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Default Color Mode</label>
              <Select value={defaultTheme} onValueChange={onDefaultThemeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center space-x-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center space-x-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                <p>
                  Default color mode for visitors. Users can override this with the theme toggle if enabled in
                  navigation settings.
                </p>
              </div>
            </div>
          )}

          {/* Font Selectors - Two Column Layout */}
          {(onFontFamilyChange || onSecondaryFontFamilyChange) && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                {onFontFamilyChange && (
                  <FontSelector
                    value={fontFamily}
                    onChange={onFontFamilyChange}
                    label="Primary Font"
                    description="Used for headings and titles"
                  />
                )}
                {onSecondaryFontFamilyChange && (
                  <FontSelector
                    value={secondaryFontFamily}
                    onChange={onSecondaryFontFamilyChange}
                    label="Secondary Font"
                    description="Used for body text and content"
                  />
                )}
              </div>
            </div>
          )}

          {/* Layout Width */}
          {onCustomWidthChange && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Layout Width</label>

              <div className="flex items-center gap-3">
                {siteWidth !== "full" && (
                  <div className="w-32">
                    <Input
                      id="width-input"
                      type="number"
                      min="320"
                      max="2560"
                      value={siteWidth === "custom" ? customWidth || "" : ""}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === "" || value === "0") {
                          onSiteWidthChange?.("full")
                          onCustomWidthChange?.(0)
                        } else {
                          const numValue = parseInt(value)
                          if (!isNaN(numValue) && numValue > 0) {
                            onSiteWidthChange?.("custom")
                            onCustomWidthChange?.(numValue)
                          }
                        }
                      }}
                      placeholder="1152"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="full-width"
                    checked={siteWidth === "full"}
                    onCheckedChange={(checked) => onSiteWidthChange?.(checked ? "full" : "custom")}
                  />
                  <Label htmlFor="full-width" className="text-sm">
                    Full Width
                  </Label>
                </div>
              </div>
            </div>
          )}

          {/* Favicon */}
          {onFaviconChange && (
            <div className="space-y-2">
              <label htmlFor="favicon" className="text-sm font-medium text-gray-700">
                Site Favicon
              </label>
              <div className="relative">
                {favicon ? (
                  <div
                    className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setShowFaviconPicker(true)}
                  >
                    <img src={favicon} alt="Favicon preview" className="w-16 h-16 object-contain" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                      <div className="text-white text-center">
                        <ImageIcon className="mx-auto h-4 w-4 mb-1" />
                        <p className="text-xs">Change</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 cursor-pointer hover:bg-muted/70 hover:border-muted-foreground/40 transition-all"
                    onClick={() => setShowFaviconPicker(true)}
                  >
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-4 w-4 text-muted-foreground/50" />
                      <p className="mt-1 text-xs text-muted-foreground">Select</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Upload a square image for your site&apos;s favicon (recommended: 32x32px or 64x64px)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Favicon Image Picker Modal */}
      {onFaviconChange && (
        <MediaPicker
          open={showFaviconPicker}
          onOpenChange={setShowFaviconPicker}
          onSelectMedia={(imageUrl) => {
            onFaviconChange(imageUrl)
            setShowFaviconPicker(false)
          }}
          currentMediaUrl={favicon}
        />
      )}
    </>
  )
}
