"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import Check from "lucide-react/dist/esm/icons/check.js"
import { useEffect, useCallback, useMemo, useState } from "react"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { HERO_STYLES } from "."
import { TrustedByBadgeFields } from "./DefaultHeroConfig"
import { cn } from "@/lib/utils/tailwind"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { validateUrl } from "@/lib/utils/url-validator"
import { getGuidedFormsBySite, type GuidedForm } from "@/lib/actions/guided-forms/guided-form-actions"

interface PageHeroBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
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
  const heroStyle = content.heroStyle || 'default'
  const styleConfig = useMemo(() => content.styleConfig || {}, [content.styleConfig])
  const currentStyleConfig = useMemo(() => styleConfig[heroStyle] || {}, [styleConfig, heroStyle])
  const emailTemplateEditorContent = useMemo(() => ({
    htmlContent: typeof content.emailTemplateBody === 'string' ? content.emailTemplateBody : '',
  }), [content.emailTemplateBody])
  const [forms, setForms] = useState<GuidedForm[]>([])

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

  const handleEmailTemplateChange = useCallback((htmlContent: string) => {
    onContentChange('emailTemplateBody', htmlContent)
  }, [onContentChange])

  useEffect(() => {
    let cancelled = false
    getGuidedFormsBySite(siteId, { pageSize: 100 }).then((result) => {
      if (cancelled) return
      setForms((result.data ?? []).filter((form) => form.status === 'published'))
    })
    return () => {
      cancelled = true
    }
  }, [siteId])

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
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Text Content">
                    <div className="space-y-2">
                      <Label htmlFor="heroTitle">Hero Title</Label>
                      <Input
                        id="heroTitle"
                        type="text"
                        value={content.title || ''}
                        onChange={(e) => onContentChange('title', e.target.value)}
                        placeholder="Build Exceptional Interfaces with Ease"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
                      <Textarea
                        id="heroSubtitle"
                        value={content.subtitle || ''}
                        onChange={(e) => onContentChange('subtitle', e.target.value)}
                        placeholder="Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs."
                        rows={2}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Primary Button</Label>
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
                    </div>

                    <div className="space-y-2">
                      <Label>Secondary Button</Label>
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
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <TrustedByBadgeFields
                    config={currentStyleConfig}
                    onConfigChange={handleStyleConfigChange}
                  />
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            ActivePanel ? (
              <ActivePanel
                config={currentStyleConfig}
                onConfigChange={handleStyleConfigChange}
                siteId={siteId}
                blockId={blockId}
              />
            ) : null
          ),
        },
        {
          value: "email-form",
          label: "Email Form",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Email Subscription Form">
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
                        <SelectTrigger size="button" className="w-[200px]">
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
                      <Label htmlFor="emailFormRedirectUrl">Redirect URL</Label>
                      <Input
                        id="emailFormRedirectUrl"
                        value={content.emailForm?.redirectUrl || ''}
                        onChange={(e) => onContentChange('emailForm', { ...content.emailForm, redirectUrl: e.target.value })}
                        placeholder="/thank-you"
                      />
                      <p className="text-xs text-muted-foreground">Optional URL to send visitors to after subscribing</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emailFollowUpForm">Follow-up form</Label>
                      <Select
                        value={content.emailForm?.followUpFormSlug || 'none'}
                        onValueChange={(v) => onContentChange('emailForm', { ...content.emailForm, followUpFormSlug: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger id="emailFollowUpForm">
                          <SelectValue placeholder="No follow-up form" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No follow-up form</SelectItem>
                          {forms.map((form) => (
                            <SelectItem key={form.id} value={form.slug}>{form.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Shown after the visitor submits their email.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emailFormIdentifier">Identifier</Label>
                      <Input
                        id="emailFormIdentifier"
                        value={content.emailForm?.identifier || ''}
                        onChange={(e) => onContentChange('emailForm', { ...content.emailForm, identifier: e.target.value })}
                        placeholder="Homepage Hero"
                        maxLength={100}
                      />
                      <p className="text-xs text-muted-foreground">Added as a contact tag with Email Form</p>
                    </div>
                  </>
                )}
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "email-template",
          label: "Email Template",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <InlineRichTextEditor
                    blockId={`${blockId}-email-template`}
                    content={emailTemplateEditorContent}
                    onContentChange={handleEmailTemplateChange}
                    siteId={siteId}
                    isActive
                    editorPadding={0}
                    variant="page"
                    placeholder="Enter email body content"
                  />
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
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Hero Style">
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
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Content Alignment">
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
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Content Width">
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
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <VisibilitySettings
                title="Elements Visibility"
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: 'title', label: 'Title' },
                  { key: 'subtitle', label: 'Subtitle' },
                  { key: 'ctaButtons', label: 'CTA Buttons' },
                  { key: 'emailForm', label: 'Email Form' },
                  { key: 'heroImage', label: 'Hero Image' },
                  { key: 'trustedByBadges', label: 'Trusted By Badges' },
                  { key: 'backgroundPattern', label: 'Background Pattern' },
                ]}
              />

              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                useCard
                fields={[]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
