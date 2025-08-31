"use client"

import { cn } from "@/lib/utils/tailwind-class-merger"

interface DividerBlockProps {
  content: {
    spacingTop?: number
    spacingBottom?: number
    dividerStyle?: 'none' | 'line' | 'dots' | 'icon'
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    lineThickness?: number
    lineColor?: string
    icon?: string
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

  return (
    <div 
      className={cn("w-full", className)}
      style={{
        paddingTop: `${Math.max(0, spacingTop)}px`,
        paddingBottom: `${Math.max(0, spacingBottom)}px`
      }}
    >
      <div className={getContainerClass()} style={getContainerStyle()}>
        {renderDivider()}
      </div>
    </div>
  )
}