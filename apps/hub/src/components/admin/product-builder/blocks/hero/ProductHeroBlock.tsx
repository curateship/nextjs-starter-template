"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Check } from "lucide-react"
import { useEffect, useCallback } from "react"
import { HERO_STYLES } from "."
import { cn } from "@/lib/utils/tailwind"
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"

// Fields that live at the content root for legacy data and need migrating into styleConfig.default
const LEGACY_STYLE_FIELDS = [
  'heroImage', 'showHeroImage',
  'showParticles', 'trustedByText', 'trustedByCount',
  'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
  'backgroundPatternOpacity', 'showTrustedByBadge',
]

interface ProductHeroBlockProps {
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
    <SelectTrigger size="button" className="w-fit">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="primary">Primary</SelectItem>
      <SelectItem value="outline">Outline</SelectItem>
      <SelectItem value="ghost">Ghost</SelectItem>
    </SelectContent>
  </Select>
)

export function ProductHeroBlock({ content, onContentChange, siteId, blockId, onBack }: ProductHeroBlockProps) {
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
      const existingConfig = content.styleConfig?.default || {}
      onContentChange('styleConfig', {
        ...content.styleConfig,
        default: { ...existingConfig, ...migrated },
      })
      LEGACY_STYLE_FIELDS.forEach(f => {
        if (content[f] !== undefined) {
          onContentChange(f, undefined)
        }
      })
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
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <div className="grid">
              <Card>
                <CardHeader className="p-4 pb-3">
                  <DashboardModalCardTitle>Text content</DashboardModalCardTitle>
                  <CardDescription>Set the headline, subtitle, and calls to action.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0">
                  <Field>
                    <FieldLabel htmlFor="heroTitle">Hero Title</FieldLabel>
                    <Input
                      id="heroTitle"
                      type="text"
                      value={content.title || ''}
                      onChange={(e) => onContentChange('title', e.target.value)}
                      placeholder="Build Exceptional Interfaces with Ease"
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="heroSubtitle">Hero Subtitle</FieldLabel>
                    <Textarea
                      id="heroSubtitle"
                      value={content.subtitle || ''}
                      onChange={(e) => onContentChange('subtitle', e.target.value)}
                      placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
                      rows={2}
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Primary Button</FieldLabel>
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Input
                        type="text"
                        value={content.primaryButton || ''}
                        onChange={(e) => onContentChange('primaryButton', e.target.value)}
                        placeholder="Get Started"
                        required
                      />
                      <Input
                        type="url"
                        value={content.primaryButtonLink || ''}
                        onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('primaryButtonLink', v))}
                        placeholder="https://example.com or /page"
                      />
                      <ButtonStyleSelect
                        value={content.primaryButtonStyle || 'primary'}
                        onChange={(v) => onContentChange('primaryButtonStyle', v)}
                      />
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel>Secondary Button</FieldLabel>
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Input
                        type="text"
                        value={content.secondaryButton || ''}
                        onChange={(e) => onContentChange('secondaryButton', e.target.value)}
                        placeholder="Browse Components"
                        required
                      />
                      <Input
                        type="url"
                        value={content.secondaryButtonLink || ''}
                        onChange={(e) => validateUrl(e.target.value, (v) => onContentChange('secondaryButtonLink', v))}
                        placeholder="https://example.com or /page"
                      />
                      <ButtonStyleSelect
                        value={content.secondaryButtonStyle || 'outline'}
                        onChange={(v) => onContentChange('secondaryButtonStyle', v)}
                      />
                    </div>
                  </Field>
                </CardContent>
              </Card>

              {ActivePanel && (
                <ActivePanel
                  config={currentStyleConfig}
                  onConfigChange={handleStyleConfigChange}
                  siteId={siteId}
                  blockId={blockId}
                />
              )}
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <div className="grid">
              <Card>
                <CardHeader className="p-4 pb-3">
                  <DashboardModalCardTitle>Hero style</DashboardModalCardTitle>
                  <CardDescription>Choose the hero layout for this block.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid max-w-sm grid-cols-2 gap-2">
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
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Element Visibility"
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                useCard
                fields={[
                  { key: 'title', label: 'Title' },
                  { key: 'subtitle', label: 'Subtitle' },
                  { key: 'primaryButton', label: 'Primary Button' },
                  { key: 'secondaryButton', label: 'Secondary Button' },
                ]}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
