import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { ImageIcon, X } from "lucide-react"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface SharedDividerBlockProps {
  spacingTop?: number
  spacingBottom?: number
  dividerStyle?: 'none' | 'line' | 'line-with-icon' | 'dots' | 'icon'
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  lineWidth?: string
  lineThickness?: number
  lineColor?: string
  icon?: string
  dividerImage?: string
  dividerImageOpacity?: number
  containerWidth?: string
  customWidth?: number
  siteId?: string
  visibility?: Record<string, boolean>
  onVisibilityChange?: (value: Record<string, boolean>) => void
  onSpacingTopChange: (value: number) => void
  onSpacingBottomChange: (value: number) => void
  onDividerStyleChange: (value: 'none' | 'line' | 'line-with-icon' | 'dots' | 'icon') => void
  onLineStyleChange: (value: 'solid' | 'dashed' | 'dotted') => void
  onLineWidthChange: (value: string) => void
  onLineThicknessChange: (value: number) => void
  onLineColorChange: (value: string) => void
  onIconChange: (value: string) => void
  onDividerImageChange?: (value: string) => void
  onDividerImageOpacityChange?: (value: number) => void
  onContainerWidthChange: (value: string) => void
  onCustomWidthChange: (value: number) => void
  onBack?: () => void
}

export function PageDividerBlock({
  spacingTop = 0,
  spacingBottom = 0,
  dividerStyle = 'line',
  lineStyle = 'solid',
  lineThickness = 1,
  lineColor = '#e5e7eb',
  icon = 'dots',
  dividerImage = '',
  dividerImageOpacity = 100,
  containerWidth = 'full',
  customWidth = 1200,
  siteId,
  visibility,
  onVisibilityChange,
  onSpacingTopChange,
  onSpacingBottomChange,
  onDividerStyleChange,
  onLineStyleChange,
  onLineThicknessChange,
  onLineColorChange,
  onIconChange,
  onDividerImageChange,
  onDividerImageOpacityChange,
  onContainerWidthChange,
  onCustomWidthChange,
  onBack,
}: SharedDividerBlockProps) {
  const [showDividerImagePicker, setShowDividerImagePicker] = useState(false)

  return (
    <>
      <BlockTabs
        onBack={onBack}
        headerClassName="pt-0"
        tabs={[
          {
            value: "styling",
            label: "Styling",
            content: (
              <CardGroup className="grid">
                <Card>
                  <CardContent>
                    <BlockEditorSection heading="Spacing Settings">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="spacingTop">Top Spacing (px)</Label>
                        <input
                          type="text"
                          defaultValue={spacingTop.toString()}
                          onBlur={(e) => {
                            const val = e.target.value
                            const num = val === '' ? 0 : parseInt(val)
                            if (!isNaN(num)) {
                              onSpacingTopChange(num)
                            }
                          }}
                          className="border p-2 rounded-md"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="spacingBottom">Bottom Spacing (px)</Label>
                        <input
                          type="text"
                          defaultValue={spacingBottom.toString()}
                          onBlur={(e) => {
                            const val = e.target.value
                            const num = val === '' ? 0 : parseInt(val)
                            if (!isNaN(num)) {
                              onSpacingBottomChange(num)
                            }
                          }}
                          className="border p-2 rounded-md"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    </BlockEditorSection>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <BlockEditorSection heading="Divider Style">
                    <div className="space-y-4">
                      {dividerStyle === 'line' || dividerStyle === 'line-with-icon' ? (
                        <>
                          <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-3">
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="dividerStyle">Type</Label>
                              <Select value={dividerStyle} onValueChange={onDividerStyleChange}>
                                <SelectTrigger id="dividerStyle" size="button" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Divider</SelectItem>
                                  <SelectItem value="line">Line</SelectItem>
                                  <SelectItem value="line-with-icon">Divider with Icon</SelectItem>
                                  <SelectItem value="dots">Dots</SelectItem>
                                  <SelectItem value="icon">Icon</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="lineStyle">Style</Label>
                              <Select value={lineStyle} onValueChange={onLineStyleChange}>
                                <SelectTrigger id="lineStyle" size="button" className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="solid">Solid</SelectItem>
                                  <SelectItem value="dashed">Dashed</SelectItem>
                                  <SelectItem value="dotted">Dotted</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="customWidth">Width (px)</Label>
                              <Input
                                id="customWidth"
                                type="number"
                                max="2000"
                                className="w-full"
                                value={containerWidth === 'full' ? '' : customWidth || ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  if (value === '' || value === '0') {
                                    onContainerWidthChange('full')
                                    onCustomWidthChange(0)
                                  } else {
                                    const numValue = parseInt(value)
                                    if (!isNaN(numValue) && numValue > 0) {
                                      onContainerWidthChange('custom')
                                      onCustomWidthChange(numValue)
                                    }
                                  }
                                }}
                                placeholder="0 = full width"
                              />
                            </div>

                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="lineThickness">Thickness</Label>
                              <Input
                                id="lineThickness"
                                type="number"
                                min="1"
                                max="5"
                                value={lineThickness || ""}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value)
                                  if (!isNaN(value)) {
                                    onLineThicknessChange(value)
                                  }
                                }}
                                placeholder="1"
                                className="w-full"
                              />
                            </div>

                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="lineColor">Color</Label>
                              <Input
                                id="lineColor"
                                type="text"
                                value={lineColor || ""}
                                onChange={(e) => onLineColorChange(e.target.value)}
                                className="w-full font-mono"
                                placeholder="#e5e7eb"
                              />
                            </div>
                          </div>

                          {dividerStyle === 'line-with-icon' && (
                            <div className="space-y-2">
                              <Label>Divider Image</Label>
                              <div className="flex items-end gap-4">
                                {dividerImage ? (
                                  <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-muted">
                                    <img
                                      src={dividerImage}
                                      alt="Divider preview"
                                      className="h-full w-full object-contain"
                                    />
                                    <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                                    <button
                                      type="button"
                                      onClick={() => onDividerImageChange?.('')}
                                      className="absolute top-1 right-1 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                    <div
                                      className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                                      onClick={() => setShowDividerImagePicker(true)}
                                    >
                                      <div className="text-center text-white">
                                        <ImageIcon className="mx-auto mb-1 h-4 w-4" />
                                        <p className="text-[10px] font-medium">Change</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-3 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                                    onClick={() => setShowDividerImagePicker(true)}
                                  >
                                    <div className="text-center">
                                      <ImageIcon className="mx-auto h-4 w-4 text-muted-foreground/50" />
                                    </div>
                                  </div>
                                )}

                                <div className="w-32 space-y-2">
                                  <Label htmlFor="dividerImageOpacity">Icon Opacity</Label>
                                  <Input
                                    id="dividerImageOpacity"
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={dividerImageOpacity}
                                    onChange={(e) => {
                                      const value = parseInt(e.target.value)
                                      if (!isNaN(value)) {
                                        onDividerImageOpacityChange?.(Math.max(0, Math.min(100, value)))
                                      }
                                    }}
                                    placeholder="100"
                                    className="w-full"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : dividerStyle === 'icon' ? (
                        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-3">
                          <div className="min-w-0 space-y-2">
                            <Label htmlFor="dividerStyle">Type</Label>
                            <Select value={dividerStyle} onValueChange={onDividerStyleChange}>
                              <SelectTrigger id="dividerStyle" size="button" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No Divider</SelectItem>
                                <SelectItem value="line">Line</SelectItem>
                                <SelectItem value="line-with-icon">Divider with Icon</SelectItem>
                                <SelectItem value="dots">Dots</SelectItem>
                                <SelectItem value="icon">Icon</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-4 min-w-0 space-y-2">
                            <Label htmlFor="icon">Icon</Label>
                            <Select value={icon} onValueChange={onIconChange}>
                              <SelectTrigger id="icon" size="button" className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="dots">• • • (Dots)</SelectItem>
                                <SelectItem value="stars">★ ★ ★ (Stars)</SelectItem>
                                <SelectItem value="diamond">◆ (Diamond)</SelectItem>
                                <SelectItem value="wave">～～～ (Wave)</SelectItem>
                                <SelectItem value="plus">✚ (Plus)</SelectItem>
                                <SelectItem value="arrow">↓ (Arrow)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="dividerStyle">Divider Type</Label>
                          <Select value={dividerStyle} onValueChange={onDividerStyleChange}>
                            <SelectTrigger id="dividerStyle" size="button" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Divider</SelectItem>
                              <SelectItem value="line">Line</SelectItem>
                              <SelectItem value="line-with-icon">Divider with Icon</SelectItem>
                              <SelectItem value="dots">Dots</SelectItem>
                              <SelectItem value="icon">Icon</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    </BlockEditorSection>
                  </CardContent>
                </Card>
              </CardGroup>
            ),
          },
          {
            value: "settings",
            label: "Settings",
            content: (
              <CardGroup className="grid">
                {onVisibilityChange && (
                  <VisibilitySettings
                    title="Block Visibility"
                    visibility={visibility}
                    onChange={onVisibilityChange}
                    useCard
                    fields={[]}
                  />
                )}
              </CardGroup>
            ),
          },
        ]}
      />

      <MediaPicker
        open={showDividerImagePicker}
        onOpenChange={setShowDividerImagePicker}
        onSelectMedia={(imageUrl) => {
          onDividerImageChange?.(imageUrl)
          setShowDividerImagePicker(false)
        }}
        currentMediaUrl={dividerImage}
        showVideos={false}
        site_id={siteId}
      />
    </>
  )
}
