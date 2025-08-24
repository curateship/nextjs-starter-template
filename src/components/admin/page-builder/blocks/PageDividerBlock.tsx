import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"

interface SharedDividerBlockProps {
  spacingTop?: number
  spacingBottom?: number
  dividerStyle?: 'none' | 'line' | 'dots' | 'icon'
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  lineWidth?: string
  lineThickness?: number
  lineColor?: string
  icon?: string
  containerWidth?: string
  customWidth?: number
  onSpacingTopChange: (value: number) => void
  onSpacingBottomChange: (value: number) => void
  onDividerStyleChange: (value: 'none' | 'line' | 'dots' | 'icon') => void
  onLineStyleChange: (value: 'solid' | 'dashed' | 'dotted') => void
  onLineWidthChange: (value: string) => void
  onLineThicknessChange: (value: number) => void
  onLineColorChange: (value: string) => void
  onIconChange: (value: string) => void
  onContainerWidthChange: (value: string) => void
  onCustomWidthChange: (value: number) => void
}

export function PageDividerBlock({
  spacingTop = 64,
  spacingBottom = 64,
  dividerStyle = 'line',
  lineStyle = 'solid',
  lineWidth = '50',
  lineThickness = 1,
  lineColor = '#e5e7eb',
  icon = 'dots',
  containerWidth = 'full',
  customWidth = 1200,
  onSpacingTopChange,
  onSpacingBottomChange,
  onDividerStyleChange,
  onLineStyleChange,
  onLineWidthChange,
  onLineThicknessChange,
  onLineColorChange,
  onIconChange,
  onContainerWidthChange,
  onCustomWidthChange,
}: SharedDividerBlockProps) {
  // Quick preset buttons
  const applyPreset = (preset: 'navigation' | 'section' | 'decorative') => {
    switch (preset) {
      case 'navigation':
        onSpacingTopChange(120)
        onSpacingBottomChange(0)
        onDividerStyleChange('none')
        break
      case 'section':
        onSpacingTopChange(64)
        onSpacingBottomChange(64)
        onDividerStyleChange('line')
        onLineStyleChange('solid')
        onLineWidthChange('50')
        onLineThicknessChange(1)
        break
      case 'decorative':
        onSpacingTopChange(80)
        onSpacingBottomChange(80)
        onDividerStyleChange('dots')
        break
    }
  }


  return (
    <div className="space-y-4">
      {/* Quick Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset('navigation')}
            >
              Navigation Spacer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset('section')}
            >
              Section Divider
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset('decorative')}
            >
              Decorative Break
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Navigation Spacer: 120px top spacing for pages without hero blocks
          </p>
        </CardContent>
      </Card>

{/* Spacing Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spacing Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          
        </CardContent>
      </Card>

      {/* Divider Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Divider Style</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dividerStyle === 'line' ? (
              <div className="grid grid-cols-5 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dividerStyle">Type</Label>
                  <Select value={dividerStyle} onValueChange={onDividerStyleChange}>
                    <SelectTrigger id="dividerStyle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Divider</SelectItem>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="dots">Dots</SelectItem>
                      <SelectItem value="icon">Icon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lineStyle">Style</Label>
                  <Select value={lineStyle} onValueChange={onLineStyleChange}>
                    <SelectTrigger id="lineStyle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="dashed">Dashed</SelectItem>
                      <SelectItem value="dotted">Dotted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="customWidth" className="text-sm">Width (px)</Label>
                  <Input
                    id="customWidth"
                    type="number"
                        max="2000"
                    value={containerWidth === 'full' ? 0 : customWidth}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      if (value === 0) {
                        onContainerWidthChange('full')
                        onCustomWidthChange(0)
                      } else {
                        onContainerWidthChange('custom')
                        onCustomWidthChange(value)
                      }
                    }}
                    placeholder="0 = full width"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lineThickness">Thickness</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="lineThickness"
                      type="range"
                      min="1"
                      max="5"
                      value={lineThickness}
                      onChange={(e) => onLineThicknessChange(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-6">{lineThickness}px</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lineColor">Color</Label>
                  <input
                    type="color"
                    id="lineColor"
                    value={lineColor}
                    onChange={(e) => onLineColorChange(e.target.value)}
                    className="h-10 w-full rounded border border-input cursor-pointer"
                  />
                </div>
              </div>
            ) : dividerStyle === 'icon' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dividerStyle">Type</Label>
                  <Select value={dividerStyle} onValueChange={onDividerStyleChange}>
                    <SelectTrigger id="dividerStyle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Divider</SelectItem>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="dots">Dots</SelectItem>
                      <SelectItem value="icon">Icon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="icon">Icon</Label>
                  <Select value={icon} onValueChange={onIconChange}>
                    <SelectTrigger id="icon">
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
                  <SelectTrigger id="dividerStyle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Divider</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="dots">Dots</SelectItem>
                    <SelectItem value="icon">Icon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}