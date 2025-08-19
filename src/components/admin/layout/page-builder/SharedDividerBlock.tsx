import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

export function SharedDividerBlock({
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

  // Preview divider
  const renderDividerPreview = () => {
    if (dividerStyle === 'none') return null

    if (dividerStyle === 'dots') {
      return (
        <div className="flex justify-center items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
          <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
          <span className="w-2 h-2 rounded-full bg-muted-foreground/30"></span>
        </div>
      )
    }

    if (dividerStyle === 'icon') {
      const iconMap: Record<string, string> = {
        dots: '• • •',
        stars: '★ ★ ★',
        diamond: '◆',
        wave: '～～～',
        plus: '✚',
        arrow: '↓'
      }
      
      return (
        <div className="flex justify-center items-center text-muted-foreground/50 text-xl">
          {iconMap[icon] || iconMap.dots}
        </div>
      )
    }

    // Line divider
    const widthClass = {
      'full': 'w-full',
      '75': 'w-3/4',
      '50': 'w-1/2',
      '25': 'w-1/4'
    }[lineWidth] || 'w-1/2'

    return (
      <div className="flex justify-center">
        <div 
          className={cn("border-t", widthClass)}
          style={{
            borderTopStyle: lineStyle,
            borderTopWidth: `${lineThickness}px`,
            borderTopColor: lineColor
          }}
        />
      </div>
    )
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
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="spacingTop">Top Spacing (px)</Label>
              <Input
                id="spacingTop"
                type="number"
                min="0"
                max="500"
                value={spacingTop}
                onChange={(e) => onSpacingTopChange(parseInt(e.target.value) || 0)}
                placeholder="64"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="spacingBottom">Bottom Spacing (px)</Label>
              <Input
                id="spacingBottom"
                type="number"
                min="0"
                max="500"
                value={spacingBottom}
                onChange={(e) => onSpacingBottomChange(parseInt(e.target.value) || 0)}
                placeholder="64"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="containerWidth" className="text-sm">Container Width</Label>
              <Select value={containerWidth} onValueChange={onContainerWidthChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select width" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Width</SelectItem>
                  <SelectItem value="custom">Custom Width</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {containerWidth === 'custom' && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="customWidth" className="text-sm">Custom Width (px)</Label>
              <Input
                id="customWidth"
                type="number"
                min="200"
                max="2000"
                value={customWidth}
                onChange={(e) => onCustomWidthChange(parseInt(e.target.value) || 1200)}
                placeholder="1200"
              />
              <p className="text-xs text-muted-foreground">Enter width in pixels (200-2000)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Divider Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Divider Style</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Always show divider type selector */}
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

            {/* Line-specific controls */}
            {dividerStyle === 'line' && (
              <div className="grid grid-cols-4 gap-3">
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
                  <Label htmlFor="lineWidth">Width</Label>
                  <Select value={lineWidth} onValueChange={onLineWidthChange}>
                    <SelectTrigger id="lineWidth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">100%</SelectItem>
                      <SelectItem value="75">75%</SelectItem>
                      <SelectItem value="50">50%</SelectItem>
                      <SelectItem value="25">25%</SelectItem>
                    </SelectContent>
                  </Select>
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
            )}
          </div>
        </CardContent>
      </Card>

      {/* Icon Style - only show when icon type is selected */}
      {dividerStyle === 'icon' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Icon Style</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon Type</Label>
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}