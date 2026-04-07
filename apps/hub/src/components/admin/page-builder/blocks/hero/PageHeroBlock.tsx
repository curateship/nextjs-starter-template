"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Check } from "lucide-react"
import { useEffect, useCallback } from "react"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { HERO_STYLES } from "."
import { cn } from "@/lib/utils/tailwind"
import { VisibilitySettings } from "../shared/VisibilitySettings"

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
  onBack?: () => void
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
    <SelectTrigger className="w-fit">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="primary">Primary</SelectItem>
      <SelectItem value="outline">Outline</SelectItem>
      <SelectItem value="ghost">Ghost</SelectItem>
    </SelectContent>
  </Select>
)

export function PageHeroBlock({ content, onContentChange, siteId, blockId, onBack }: PageHeroBlockProps) {
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
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
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
                  <div className="flex gap-2 w-fit">
                    <input
                      type="text"
                      value={content.primaryButton || ''}
                      onChange={(e) => onContentChange('primaryButton', e.target.value)}
                      className="w-40 px-3 py-2 border rounded-md text-sm"
                      placeholder="Get Started"
                      required
                    />
                    <input
                      type="url"
                      value={content.primaryButtonLink || ''}
                      onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('primaryButtonLink', v))}
                      className="w-48 px-3 py-2 border rounded-md text-sm"
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
                  <div className="flex gap-2 w-fit">
                    <input
                      type="text"
                      value={content.secondaryButton || ''}
                      onChange={(e) => onContentChange('secondaryButton', e.target.value)}
                      className="w-40 px-3 py-2 border rounded-md text-sm"
                      placeholder="Browse Components"
                      required
                    />
                    <input
                      type="url"
                      value={content.secondaryButtonLink || ''}
                      onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('secondaryButtonLink', v))}
                      className="w-48 px-3 py-2 border rounded-md text-sm"
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
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <>
              {ActivePanel && (
                <ActivePanel
                  config={currentStyleConfig}
                  onConfigChange={handleStyleConfigChange}
                  siteId={siteId}
                  blockId={blockId}
                />
              )}
            </>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <>
              {/* Hero Style Selector */}
              <div className="space-y-2 mb-4 mx-4">
                <Label className="text-sm font-medium px-1">Hero Style</Label>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
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

              {/* Content Alignment */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Content Alignment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {(['left', 'center', 'right'] as const).map((option) => (
                      <div key={option} className="flex items-center gap-2">
                        <Checkbox
                          id={`alignment-${option}`}
                          checked={(currentStyleConfig.alignment || 'center') === option}
                          onCheckedChange={() => handleStyleConfigChange('alignment', option)}
                        />
                        <Label htmlFor={`alignment-${option}`} className="text-sm capitalize cursor-pointer">{option}</Label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Content Width */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Content Width</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="contentWidth"
                      checked={(currentStyleConfig.contentWidth || 'full') === 'fixed'}
                      onCheckedChange={(checked) => handleStyleConfigChange('contentWidth', checked ? 'fixed' : 'full')}
                    />
                    <Label htmlFor="contentWidth" className="text-sm cursor-pointer">Constrain to fixed width</Label>
                    {(currentStyleConfig.contentWidth || 'full') === 'fixed' && (
                      <>
                        <Input
                          type="number"
                          min="600"
                          max="2000"
                          value={currentStyleConfig.contentMaxWidth ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              handleStyleConfigChange('contentMaxWidth', undefined)
                            } else {
                              const value = parseInt(raw)
                              if (!isNaN(value)) {
                                handleStyleConfigChange('contentMaxWidth', value)
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value)
                            if (isNaN(value)) return
                            if (value < 600) handleStyleConfigChange('contentMaxWidth', 600)
                            else if (value > 2000) handleStyleConfigChange('contentMaxWidth', 2000)
                          }}
                          className="h-auto w-20 px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">px</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Element Visibility"
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                includeHideBlock={false}
                fields={[
                  { key: 'title', label: 'Title' },
                  { key: 'subtitle', label: 'Subtitle' },
                  { key: 'ctaButtons', label: 'CTA Buttons' },
                  { key: 'emailForm', label: 'Email Form' },
                ]}
              />

              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                fields={[]}
              />

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Email Subscription Form</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="emailFormEnabled"
                      checked={content.emailForm?.enabled || false}
                      onCheckedChange={(checked) =>
                        onContentChange('emailForm', { ...content.emailForm, enabled: !!checked })
                      }
                    />
                    <Label htmlFor="emailFormEnabled" className="cursor-pointer">Enable email subscription form</Label>
                  </div>

                  {content.emailForm?.enabled && (
                    <>
                      <div className="space-y-2">
                        <Label>Layout</Label>
                        <Select
                          value={content.emailForm?.layout || 'inline'}
                          onValueChange={(v) => onContentChange('emailForm', { ...content.emailForm, layout: v })}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inline">Button beside field</SelectItem>
                            <SelectItem value="stacked">Button below field</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailPlaceholder">Placeholder Text</Label>
                        <Input
                          id="emailPlaceholder"
                          value={content.emailForm?.placeholder || ''}
                          onChange={(e) => onContentChange('emailForm', { ...content.emailForm, placeholder: e.target.value })}
                          placeholder="Enter your email address"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailButtonText">Button Text</Label>
                        <Input
                          id="emailButtonText"
                          value={content.emailForm?.buttonText || ''}
                          onChange={(e) => onContentChange('emailForm', { ...content.emailForm, buttonText: e.target.value })}
                          placeholder="Subscribe"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailFormId">Form ID</Label>
                        <Input
                          id="emailFormId"
                          value={content.emailForm?.formId || ''}
                          onChange={(e) => onContentChange('emailForm', { ...content.emailForm, formId: e.target.value })}
                          placeholder="e.g. abc123"
                        />
                        <p className="text-xs text-muted-foreground">Optional identifier for your form provider</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailFormApi">API Endpoint</Label>
                        <Input
                          id="emailFormApi"
                          value={content.emailForm?.apiEndpoint || ''}
                          onChange={(e) => onContentChange('emailForm', { ...content.emailForm, apiEndpoint: e.target.value })}
                          placeholder="https://api.example.com/subscribe"
                        />
                        <p className="text-xs text-muted-foreground">The URL where form submissions will be sent via POST</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailFormSuccess">Success Message</Label>
                        <Input
                          id="emailFormSuccess"
                          value={content.emailForm?.successMessage || ''}
                          onChange={(e) => onContentChange('emailForm', { ...content.emailForm, successMessage: e.target.value })}
                          placeholder="Thanks for subscribing!"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ),
        },
      ]}
    />
  )
}
