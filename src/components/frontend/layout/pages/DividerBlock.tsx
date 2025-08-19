"use client"

import { cn } from "@/lib/utils"

interface DividerBlockProps {
  content: {
    spacingTop?: number
    spacingBottom?: number
    dividerStyle?: 'none' | 'line' | 'dots' | 'icon'
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    lineWidth?: string
    lineThickness?: number
    lineColor?: string
    icon?: string
    containerWidth?: string // 'full' | 'custom' | number (px)
    customWidth?: number // Custom width in pixels
  }
  className?: string
}

export function DividerBlock({ content, className = "" }: DividerBlockProps) {
  const {
    spacingTop = 64,
    spacingBottom = 64,
    dividerStyle = 'line',
    lineStyle = 'solid',
    lineWidth = '50',
    lineThickness = 1,
    lineColor = '#e5e7eb',
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

    // For full or custom container width, make line full width regardless of lineWidth setting
    const actualLineWidth = (containerWidth === 'full' || containerWidth === 'custom') ? 'full' : lineWidth || '50'
    
    const widthClass = {
      'full': 'w-full',
      '75': 'w-3/4',
      '50': 'w-1/2',
      '25': 'w-1/4'
    }[actualLineWidth] || 'w-1/2'

    return (
      <div className={(containerWidth === 'full' || containerWidth === 'custom') ? '' : 'flex justify-center'}>
        <div 
          className={cn("border-t", widthClass)}
          style={{
            borderTopStyle: lineStyles[lineStyle || 'solid'],
            borderTopWidth: `${lineThickness}px`,
            borderTopColor: lineColor
          }}
        />
      </div>
    )
  }

  // Get container class based on width setting
  const getContainerClass = () => {
    switch (containerWidth) {
      case 'full':
        return '' // No container - full width content
      case 'custom':
        return 'mx-auto px-6' // Custom width handled by max-width style
      default:
        return ''
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
    <section 
      className={cn("w-full", className)}
      style={{
        paddingTop: `${spacingTop}px`,
        paddingBottom: `${spacingBottom}px`
      }}
    >
      <div className={getContainerClass()} style={getContainerStyle()}>
        {renderDivider()}
      </div>
    </section>
  )
}