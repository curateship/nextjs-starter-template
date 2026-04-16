"use client"

import { cn } from "@/lib/utils/tailwind"

interface DividerBlockProps {
  content: {
    spacingTop?: number
    spacingBottom?: number
    dividerStyle?: 'none' | 'line' | 'line-with-icon' | 'dots' | 'icon'
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    lineThickness?: number
    lineColor?: string
    icon?: string
    dividerImage?: string
    dividerImageOpacity?: number
    containerWidth?: string // 'full' | 'custom'
    customWidth?: number // Custom width in pixels
  }
  className?: string
}

export function DividerBlock({ content, className = "" }: DividerBlockProps) {
  const {
    spacingTop = 0,
    spacingBottom = 0,
    dividerStyle = 'line',
    lineStyle = 'solid',
    lineThickness = 1,
    lineColor = '',
    icon = 'dots',
    dividerImage = '',
    dividerImageOpacity = 100,
    containerWidth = 'full',
    customWidth = 1200
  } = content

  const renderDivider = () => {
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
      // Simple icon divider using text symbols
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

    if (dividerStyle === 'line-with-icon') {
      if (!dividerImage) {
        return (
          <div>
            <div 
              className={cn(
                "border-t w-full",
                !lineColor && "border-muted"
              )}
              style={{
                borderTopStyle: lineStyle || 'solid',
                borderTopWidth: `${lineThickness}px`,
                ...(lineColor && { borderTopColor: lineColor })
              }}
            />
          </div>
        )
      }

      return (
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-full border-t",
              !lineColor && "border-muted"
            )}
            style={{
              borderTopStyle: lineStyle || 'solid',
              borderTopWidth: `${lineThickness}px`,
              ...(lineColor && { borderTopColor: lineColor })
            }}
          />
          <img
            src={dividerImage}
            alt=""
            className="h-10 w-auto max-w-20 shrink-0 object-contain"
            style={{ opacity: Math.max(0, Math.min(100, dividerImageOpacity)) / 100 }}
          />
          <div
            className={cn(
              "w-full border-t",
              !lineColor && "border-muted"
            )}
            style={{
              borderTopStyle: lineStyle || 'solid',
              borderTopWidth: `${lineThickness}px`,
              ...(lineColor && { borderTopColor: lineColor })
            }}
          />
        </div>
      )
    }

    // Default to line divider
    const lineStyles: Record<string, 'solid' | 'dashed' | 'dotted'> = {
      solid: 'solid',
      dashed: 'dashed',
      dotted: 'dotted'
    }

    return (
      <div>
        <div 
          className={cn(
            "border-t w-full",
            !lineColor && "border-muted"
          )}
          style={{
            borderTopStyle: lineStyles[lineStyle || 'solid'],
            borderTopWidth: `${lineThickness}px`,
            ...(lineColor && { borderTopColor: lineColor })
          }}
        />
      </div>
    )
  }

  // Get container class based on width setting
  const getContainerClass = () => {
    switch (containerWidth) {
      case 'full':
        return 'w-full' // Full width content
      case 'custom':
        return 'mx-auto px-6' // Custom width handled by max-width style
      default:
        return 'w-full'
    }
  }

  // Get container style for custom width
  const getContainerStyle = () => {
    if (containerWidth === 'custom' && customWidth) {
      return { maxWidth: `${customWidth}px` }
    }
    return undefined
  }

  const topPx = Math.max(0, spacingTop)
  const bottomPx = Math.max(0, spacingBottom)

  return (
    <div
      className={cn("w-full", className)}
      style={{
        paddingTop: topPx ? `clamp(${Math.round(topPx * 0.5)}px, ${(topPx / 1440 * 100).toFixed(2)}vw, ${topPx}px)` : undefined,
        paddingBottom: bottomPx ? `clamp(${Math.round(bottomPx * 0.5)}px, ${(bottomPx / 1440 * 100).toFixed(2)}vw, ${bottomPx}px)` : undefined,
      }}
    >
      <div className={getContainerClass()} style={getContainerStyle()}>
        {renderDivider()}
      </div>
    </div>
  )
}
