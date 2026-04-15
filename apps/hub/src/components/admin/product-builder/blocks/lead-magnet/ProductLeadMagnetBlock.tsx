'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BlockTabs } from '@/components/admin/shared/BlockTabs'
import { Check } from 'lucide-react'
import { useCallback } from 'react'
import { LEAD_MAGNET_STYLES } from '.'
import { cn } from '@/lib/utils/tailwind'
import { VisibilitySettings } from "@/components/admin/product-builder/blocks/shared/VisibilitySettings"
import { BlockEditorSection } from "@/components/admin/shared/BlockTabs"

interface ProductLeadMagnetBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
  onBack?: () => void
}

export function ProductLeadMagnetBlock({
  content,
  onContentChange,
  siteId,
  blockId,
  onBack,
}: ProductLeadMagnetBlockProps) {
  const leadMagnetStyle = content.leadMagnetStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[leadMagnetStyle] || {}

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    const updated = {
      ...styleConfig,
      [leadMagnetStyle]: {
        ...currentStyleConfig,
        [field]: value,
      },
    }
    onContentChange('styleConfig', updated)
  }, [styleConfig, leadMagnetStyle, currentStyleConfig, onContentChange])

  const ActivePanel = LEAD_MAGNET_STYLES[leadMagnetStyle]?.AdminPanel

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <BlockEditorSection heading="Content">
                <div className="space-y-2">
                  <Label htmlFor="heading">Heading</Label>
                  <Input
                    id="heading"
                    value={content.heading || ''}
                    onChange={(e) => onContentChange('heading', e.target.value)}
                    placeholder="Get Your Free Download"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subheading">Subheading</Label>
                  <Textarea
                    id="subheading"
                    value={content.subheading || ''}
                    onChange={(e) => onContentChange('subheading', e.target.value)}
                    placeholder="Enter your email to receive instant access"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buttonText">Button Text</Label>
                  <Input
                    id="buttonText"
                    value={content.buttonText || ''}
                    onChange={(e) => onContentChange('buttonText', e.target.value)}
                    placeholder="Get Instant Access"
                  />
                </div>
            </BlockEditorSection>
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
          value: "follow-up",
            label: "After Signup",
            content: (
            <div className="space-y-6">
              <BlockEditorSection heading="Delivery Email">
                  <p className="text-sm text-muted-foreground">
                    Lead magnet delivery emails are now managed in Platform Management → Emails.
                  </p>
              </BlockEditorSection>

              <BlockEditorSection heading="Thank You Message">
                  <div className="space-y-2">
                    <Label htmlFor="thankYouHeading">Heading</Label>
                    <Input
                      id="thankYouHeading"
                      value={content.thankYouMessage?.heading || ''}
                      onChange={(e) => onContentChange('thankYouMessage', {
                        ...content.thankYouMessage,
                        heading: e.target.value
                      })}
                      placeholder="Check Your Email!"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="thankYouMessage">Message</Label>
                    <textarea
                      id="thankYouMessage"
                      value={content.thankYouMessage?.message || ''}
                      onChange={(e) => onContentChange('thankYouMessage', {
                        ...content.thankYouMessage,
                        message: e.target.value
                      })}
                      placeholder="We've sent your content to your email address."
                      rows={3}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accessInstructions">
                      Access Instructions (Optional)
                    </Label>
                    <Textarea
                      id="accessInstructions"
                      value={content.accessInstructions || ''}
                      onChange={(e) =>
                        onContentChange('accessInstructions', e.target.value)
                      }
                      placeholder="Additional instructions shown on thank you page"
                      rows={4}
                    />
                  </div>
              </BlockEditorSection>
            </div>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <>
              {/* Lead Magnet Style Selector */}
              <div className="space-y-2 mb-4 mx-4">
                <Label className="text-sm font-medium px-1">Lead Magnet Style</Label>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {Object.entries(LEAD_MAGNET_STYLES).map(([key, style]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onContentChange('leadMagnetStyle', key)}
                      className={cn(
                        "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        leadMagnetStyle === key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        leadMagnetStyle === key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}>
                        {leadMagnetStyle === key && <Check className="h-3 w-3" />}
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

              <VisibilitySettings
                visibility={content.visibility}
                onChange={(v) => onContentChange('visibility', v)}
                fields={[
                  { key: 'heading', label: 'Heading' },
                  { key: 'subheading', label: 'Subheading' },
                  { key: 'buttonText', label: 'Button' },
                ]}
              />
            </>
          ),
        },
      ]}
    />
  )
}
