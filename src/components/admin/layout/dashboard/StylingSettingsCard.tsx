"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { ImageIcon, Zap, AlertTriangle } from "lucide-react"
import { ImagePicker } from "@/components/admin/image-library/ImagePicker"
import { getActiveThemesAction } from "@/lib/actions/themes/theme-actions"
import type { Theme } from "@/lib/supabase/themes"
import type { AnimationSettings } from "@/lib/actions/sites/site-actions"
import { FontSelector } from "@/components/admin/page-builder/FontSelector"

interface StylingSettingsCardProps {
  themeId: string
  fontFamily?: string
  secondaryFontFamily?: string
  favicon?: string
  animations?: AnimationSettings
  onThemeIdChange: (value: string) => void
  onFontFamilyChange?: (value: string) => void
  onSecondaryFontFamilyChange?: (value: string) => void
  onFaviconChange?: (value: string) => void
  onAnimationsChange?: (value: AnimationSettings) => void
}

export function StylingSettingsCard({
  themeId,
  fontFamily = "playfair-display",
  secondaryFontFamily = "inter",
  favicon = "",
  animations = { enabled: false, preset: 'fade', duration: 0.6, stagger: 0.1, intensity: 'medium' },
  onThemeIdChange,
  onFontFamilyChange,
  onSecondaryFontFamilyChange,
  onFaviconChange,
  onAnimationsChange,
}: StylingSettingsCardProps) {
  const [themes, setThemes] = useState<Theme[]>([])
  const [themesLoading, setThemesLoading] = useState(true)
  const [showFaviconPicker, setShowFaviconPicker] = useState(false)

  useEffect(() => {
    loadThemes()
  }, [])

  const loadThemes = async () => {
    try {
      setThemesLoading(true)
      const { data, error } = await getActiveThemesAction()
      
      if (error) {
        console.error('Error loading themes:', error)
        return
      }
      
      if (data) {
        setThemes(data)
      }
    } catch (err) {
      console.error('Error loading themes:', err)
    } finally {
      setThemesLoading(false)
    }
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Styling Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Theme</label>
            <Select value={themeId} onValueChange={onThemeIdChange}>
              <SelectTrigger>
                <SelectValue placeholder={themesLoading ? "Loading themes..." : "Select a theme"} />
              </SelectTrigger>
              <SelectContent>
                {themesLoading ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                      <span>Loading themes...</span>
                    </div>
                  </SelectItem>
                ) : themes.length === 0 ? (
                  <SelectItem value="no-themes" disabled>
                    No active themes available
                  </SelectItem>
                ) : (
                  themes.map((theme) => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {themeId && themes.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {(() => {
                  const selectedTheme = themes.find(t => t.id === themeId)
                  return selectedTheme ? (
                    <div className="flex items-center justify-between">
                      <span>Selected: {selectedTheme.name}</span>
                    </div>
                  ) : null
                })()}
              </div>
            )}
          </div>

          {/* Font Selectors - Two Column Layout */}
          {(onFontFamilyChange || onSecondaryFontFamilyChange) && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Typography</h3>
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
                    <img 
                      src={favicon} 
                      alt="Favicon preview" 
                      className="w-16 h-16 object-cover"
                    />
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

          {/* Animation Settings */}
          {onAnimationsChange && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Page Animations</h3>
                {animations.enabled && (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Zap className="w-3 h-3" />
                    <span>Performance Impact</span>
                  </div>
                )}
              </div>

              {/* Master Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="animations-enabled" className="text-sm font-medium">
                    Enable Animations
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Add smooth animations to all page blocks
                  </p>
                </div>
                <Switch
                  id="animations-enabled"
                  checked={animations.enabled}
                  onCheckedChange={(enabled) =>
                    onAnimationsChange({ ...animations, enabled })
                  }
                />
              </div>

              {animations.enabled && (
                <>
                  {/* Performance Warning */}
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium">Performance Note</p>
                      <p>Animations may impact loading speed on slower devices. Disable if you experience performance issues.</p>
                    </div>
                  </div>

                  {/* Animation Style */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Animation Style</Label>
                    <Select
                      value={animations.preset}
                      onValueChange={(preset: any) =>
                        onAnimationsChange({ ...animations, preset })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fade">Fade In</SelectItem>
                        <SelectItem value="slide">Slide Up</SelectItem>
                        <SelectItem value="scale">Scale Up</SelectItem>
                        <SelectItem value="blur">Blur to Focus</SelectItem>
                        <SelectItem value="blur-slide">Blur + Slide</SelectItem>
                        <SelectItem value="zoom">Zoom In</SelectItem>
                        <SelectItem value="flip">Flip In</SelectItem>
                        <SelectItem value="bounce">Bounce In</SelectItem>
                        <SelectItem value="rotate">Rotate In</SelectItem>
                        <SelectItem value="swing">Swing In</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Animation Speed */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Animation Speed</Label>
                    <div className="space-y-2">
                      <Slider
                        value={[animations.duration]}
                        onValueChange={([duration]) =>
                          onAnimationsChange({ ...animations, duration })
                        }
                        min={0.3}
                        max={2.0}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Fast (0.3s)</span>
                        <span>Current: {animations.duration}s</span>
                        <span>Slow (2.0s)</span>
                      </div>
                    </div>
                  </div>

                  {/* Animation Stagger */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Animation Delay</Label>
                    <div className="space-y-2">
                      <Slider
                        value={[animations.stagger]}
                        onValueChange={([stagger]) =>
                          onAnimationsChange({ ...animations, stagger })
                        }
                        min={0}
                        max={0.5}
                        step={0.05}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>No delay</span>
                        <span>Current: {animations.stagger}s</span>
                        <span>Max delay</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Time between each block starting its animation
                    </p>
                  </div>

                  {/* Animation Intensity */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Animation Intensity</Label>
                    <Select
                      value={animations.intensity}
                      onValueChange={(intensity: any) =>
                        onAnimationsChange({ ...animations, intensity })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Subtle</SelectItem>
                        <SelectItem value="medium">Normal</SelectItem>
                        <SelectItem value="high">Dramatic</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Controls the distance and scale of animation effects
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Favicon Image Picker Modal */}
      {onFaviconChange && (
        <ImagePicker
          open={showFaviconPicker}
          onOpenChange={setShowFaviconPicker}
          onSelectImage={(imageUrl) => {
            onFaviconChange(imageUrl)
            setShowFaviconPicker(false)
          }}
          currentImageUrl={favicon}
        />
      )}
    </>
  )
}