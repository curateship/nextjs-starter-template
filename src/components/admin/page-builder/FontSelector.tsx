"use client"

import { useState, useEffect } from "react"
import { 
  Select, 
  SelectContent, 
  SelectGroup,
  SelectItem, 
  SelectLabel,
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { availableFonts, getFontByValue, getGoogleFontUrl, type FontOption } from "@/lib/utils/font-config"

interface FontSelectorProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  disabled?: boolean
}

export function FontSelector({
  value,
  onChange,
  label = "Font Family",
  description = "Choose a font for your site",
  disabled = false
}: FontSelectorProps) {
  const [fontLoaded, setFontLoaded] = useState<Record<string, boolean>>({})
  const selectedFont = getFontByValue(value)

  // Load font for preview
  useEffect(() => {
    if (value && !fontLoaded[value]) {
      const font = getFontByValue(value)
      if (font) {
        const link = document.createElement('link')
        link.href = getGoogleFontUrl(value)
        link.rel = 'stylesheet'
        link.onload = () => setFontLoaded(prev => ({ ...prev, [value]: true }))
        document.head.appendChild(link)
      }
    }
  }, [value, fontLoaded])

  // Group fonts by category
  const fontsByCategory = availableFonts.reduce((acc, font) => {
    if (!acc[font.category]) {
      acc[font.category] = []
    }
    acc[font.category].push(font)
    return acc
  }, {} as Record<string, FontOption[]>)

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'sans-serif': return 'Sans Serif'
      case 'serif': return 'Serif'
      case 'display': return 'Display'
      case 'monospace': return 'Monospace'
      default: return category
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="font-selector">{label}</Label>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="font-selector" className="w-full">
          <SelectValue placeholder="Select a font">
            {selectedFont && (
              <span style={{ fontFamily: `'${selectedFont.label}', ${selectedFont.fallback}` }}>
                {selectedFont.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {Object.entries(fontsByCategory).map(([category, fonts]) => (
            <SelectGroup key={category}>
              <SelectLabel className="px-2 py-1.5 text-sm font-semibold">
                {getCategoryLabel(category)}
              </SelectLabel>
              {fonts.map((font) => (
                <SelectItem 
                  key={font.value} 
                  value={font.value}
                  className="py-2"
                >
                  <div className="flex items-center justify-between w-full">
                    <span 
                      style={{ 
                        fontFamily: fontLoaded[font.value] 
                          ? `'${font.label}', ${font.fallback}`
                          : font.fallback
                      }}
                      className="flex-1"
                    >
                      {font.label}
                    </span>
                    {font.value === 'urbanist' && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Font Preview */}
      {selectedFont && (
        <div className="mt-4 p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground mb-2">Preview:</p>
          <div 
            style={{ 
              fontFamily: fontLoaded[value] 
                ? `'${selectedFont.label}', ${selectedFont.fallback}`
                : selectedFont.fallback
            }}
            className="space-y-2"
          >
            <p className="text-2xl font-bold">The quick brown fox jumps</p>
            <p className="text-lg">over the lazy dog</p>
            <p className="text-base">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
            <p className="text-base">abcdefghijklmnopqrstuvwxyz</p>
            <p className="text-base">0123456789 !@#$%^&*()</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {selectedFont.weights.map(weight => (
              <Badge key={weight} variant="outline" className="text-xs">
                {weight}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}