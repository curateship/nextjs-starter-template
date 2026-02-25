"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Check } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { HERO_STYLES } from "./hero-styles"
import { cn } from "@/lib/utils/tailwind-class-merger"

// Fields that live at the content root for legacy data and need migrating into styleConfig.default
const LEGACY_STYLE_FIELDS = [
  'heroImage', 'showHeroImage', 'showRainbowButton',
  'rainbowButtonText', 'rainbowButtonIcon', 'githubLink',
  'showParticles', 'trustedByText', 'trustedByCount',
  'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
  'backgroundPatternOpacity', 'showTrustedByBadge',
]

interface PageHeroBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

// Helper
const validateUrl = (value: string, onChange: (value: string) => void) => {
  const trimmed = value.trim()
  if (trimmed === '') { onChange(trimmed); return }
  if (trimmed.startsWith('/')) { onChange(trimmed); return }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) { onChange(trimmed); return }
  if (trimmed.toLowerCase().includes('javascript:') ||
      trimmed.toLowerCase().includes('data:') ||
      trimmed.toLowerCase().includes('vbscript:')) { return }
  onChange(trimmed)
}

// Reusable button style selector
const ButtonStyleSelect = ({ value, onChange }: { value: string; onChange: (value: 'primary' | 'outline' | 'ghost') => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="primary">Primary</SelectItem>
      <SelectItem value="outline">Outline</SelectItem>
      <SelectItem value="ghost">Ghost</SelectItem>
    </SelectContent>
  </Select>
)

export function PageHeroBlock({ content, onContentChange, siteId, blockId }: PageHeroBlockProps) {
  const [activeTab, setActiveTab] = useState('content')

  // --- Lazy migration: move legacy root-level style fields into styleConfig.default ---
  useEffect(() => {
    const hasLegacyFields = LEGACY_STYLE_FIELDS.some(f => content[f] !== undefined && !content.styleConfig)
    if (!hasLegacyFields) return

    const migrated: Record<string, any> = {}
    LEGACY_STYLE_FIELDS.forEach(f => {
      if (content[f] !== undefined) {
        migrated[f] = content[f]
      }
    })

    if (Object.keys(migrated).length > 0) {
      // Write the styleConfig with migrated values merged over defaults
      const existingConfig = content.styleConfig?.default || {}
      onContentChange('styleConfig', {
        ...content.styleConfig,
        default: { ...existingConfig, ...migrated },
      })
      // Clean up legacy fields from root
      LEGACY_STYLE_FIELDS.forEach(f => {
        if (content[f] !== undefined) {
          onContentChange(f, undefined)
        }
      })
      // Ensure heroStyle is set
      if (!content.heroStyle) {
        onContentChange('heroStyle', 'default')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const heroStyle = content.heroStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[heroStyle] || {}

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    const updated = {
      ...styleConfig,
      [heroStyle]: {
        ...currentStyleConfig,
        [field]: value,
      },
    }
    onContentChange('styleConfig', updated)
  }, [styleConfig, heroStyle, currentStyleConfig, onContentChange])

  const ActivePanel = HERO_STYLES[heroStyle]?.AdminPanel

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="styling">Styling</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Text Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hero Title */}
            <div className="space-y-2">
              <Label htmlFor="heroTitle">Hero Title</Label>
              <input
                id="heroTitle"
                type="text"
                value={content.title || ''}
                onChange={(e) => onContentChange('title', e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Build Exceptional Interfaces with Ease"
                required
              />
            </div>

            {/* Hero Subtitle */}
            <div className="space-y-2">
              <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
              <textarea
                id="heroSubtitle"
                value={content.subtitle || ''}
                onChange={(e) => onContentChange('subtitle', e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
                rows={2}
                required
              />
            </div>

            {/* Primary Button */}
            <div className="space-y-2">
              <Label>Primary Button</Label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={content.primaryButton || ''}
                  onChange={(e) => onContentChange('primaryButton', e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                  placeholder="Get Started"
                  required
                />
                <input
                  type="url"
                  value={content.primaryButtonLink || ''}
                  onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('primaryButtonLink', v))}
                  className="px-3 py-2 border rounded-md text-sm"
                  placeholder="https://example.com or /page"
                />
                <ButtonStyleSelect
                  value={content.primaryButtonStyle || 'primary'}
                  onChange={(v) => onContentChange('primaryButtonStyle', v)}
                />
              </div>
            </div>

            {/* Secondary Button */}
            <div className="space-y-2">
              <Label>Secondary Button</Label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={content.secondaryButton || ''}
                  onChange={(e) => onContentChange('secondaryButton', e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                  placeholder="Browse Components"
                  required
                />
                <input
                  type="url"
                  value={content.secondaryButtonLink || ''}
                  onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('secondaryButtonLink', v))}
                  className="px-3 py-2 border rounded-md text-sm"
                  placeholder="https://example.com or /page"
                />
                <ButtonStyleSelect
                  value={content.secondaryButtonStyle || 'outline'}
                  onChange={(v) => onContentChange('secondaryButtonStyle', v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Styling Tab */}
      <TabsContent value="styling" className="mt-6">
        {/* Style Selector Cards */}
        <div className="space-y-2 mb-4 px-6">
          <Label className="text-sm font-medium px-1">Hero Style</Label>
          <div className="grid gap-2 max-w-sm">
            {Object.entries(HERO_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => onContentChange('heroStyle', key)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  heroStyle === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  heroStyle === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {heroStyle === key && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{style.label}</div>
                  {style.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Active style's admin panel */}
        {ActivePanel && (
          <ActivePanel
            config={currentStyleConfig}
            onConfigChange={handleStyleConfigChange}
            siteId={siteId}
            blockId={blockId}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
