"use client"

import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import { Sparkles, Wand2 } from "lucide-react"
import { generateNewsletterRichText } from "@/lib/actions/ai/newsletter-ai-actions"
import { getSiteIntegrations } from "@/lib/actions/integrations/integration-actions"
import {
  getAIModelOptions,
  getAIProviderLabel,
  getDefaultAIModel,
  isAIProvider,
  type AIProvider,
} from "@/lib/utils/ai-models"
import { RichTextEditor } from "@/components/admin/shared/RichTextEditor"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { normalizeNewsletterRichTextHtml } from "@/lib/actions/newsletters/render"

const ALLOWED_HTML_TAGS = ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote', 'img']
const ALLOWED_HTML_ATTR = ['href', 'target', 'rel', 'src', 'alt']

interface NewsletterRichTextBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId: string
  subject?: string
  onSubjectChange?: (value: string) => void
}

export function NewsletterRichTextBlock({
  content,
  onContentChange,
  onBack,
  siteId,
  subject,
  onSubjectChange,
}: NewsletterRichTextBlockProps) {
  const normalizedHtmlContent = normalizeNewsletterRichTextHtml(content.htmlContent || '')
  const [localSubject, setLocalSubject] = useState('')
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProviders() {
      if (!siteId) {
        setAiProviders([])
        return
      }

      try {
        const integrations = await getSiteIntegrations(siteId)
        if (cancelled) return

        const providers = integrations.reduce<AIProvider[]>((items, integration) => {
          if (integration.isEnabled && isAIProvider(integration.integrationType)) {
            items.push(integration.integrationType)
          }
          return items
        }, [])

        setAiProviders(providers)
      } catch {
        if (!cancelled) {
          setAiProviders([])
        }
      }
    }

    loadProviders()

    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    if (!aiProviders.length) return

    if (!isAIProvider(content.aiProvider) || !aiProviders.includes(content.aiProvider)) {
      const nextProvider = aiProviders[0]
      if (content.aiProvider !== nextProvider) {
        onContentChange('aiProvider', nextProvider)
      }
      return
    }

    if (!getAIModelOptions(content.aiProvider).some((option) => option.value === content.aiModel)) {
      onContentChange('aiModel', getDefaultAIModel(content.aiProvider))
    }
  }, [aiProviders, content.aiModel, content.aiProvider, onContentChange])

  const activeProvider = isAIProvider(content.aiProvider) && aiProviders.includes(content.aiProvider)
    ? content.aiProvider
    : undefined
  const availableModels = activeProvider ? getAIModelOptions(activeProvider) : []
  const subjectValue = onSubjectChange ? (subject || '') : localSubject

  function handleSubjectChange(value: string) {
    setAiError(null)
    if (onSubjectChange) {
      onSubjectChange(value)
      return
    }
    setLocalSubject(value)
  }

  function handleProviderChange(value: string) {
    if (!isAIProvider(value)) return
    onContentChange('aiProvider', value)
    onContentChange('aiModel', getDefaultAIModel(value))
    setAiError(null)
  }

  async function handleGenerate() {
    const prompt = (content.aiPrompt || '').trim()
    const currentSubject = subjectValue.trim()

    if (!siteId) {
      setAiError('Site is not loaded yet.')
      return
    }

    if (!currentSubject) {
      setAiError('Subject is required to generate newsletter content.')
      return
    }

    if (!prompt) {
      setAiError('Prompt is required.')
      return
    }

    if (!activeProvider) {
      setAiError('No AI providers configured. Add an API key in Site Settings → Integrations.')
      return
    }

    setIsGenerating(true)
    setAiError(null)

    try {
      const { html, error } = await generateNewsletterRichText(siteId, {
        prompt,
        subject: currentSubject,
        currentContent: content.htmlContent || '',
        provider: activeProvider,
        model: content.aiModel || getDefaultAIModel(activeProvider),
      })

      if (error) {
        setAiError(error)
        return
      }

      const sanitizedHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ALLOWED_HTML_TAGS,
        ALLOWED_ATTR: ALLOWED_HTML_ATTR,
        ALLOW_DATA_ATTR: false,
      }).trim()
      const normalizedHtml = normalizeNewsletterRichTextHtml(sanitizedHtml)

      if (!normalizedHtml) {
        setAiError('AI returned empty newsletter content.')
        return
      }

      onContentChange('aiPrompt', prompt)
      onContentChange('htmlContent', normalizedHtml)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <RichTextEditor
                  content={{ content: normalizedHtmlContent, hideHeader: true, hideEditorHeader: true }}
                  onContentChange={(c) => onContentChange('htmlContent', normalizeNewsletterRichTextHtml(c.content))}
                  inline
                  placeholder="Write your content here..."
                  contentClassName="newsletter-email-rich-text"
                  mediaPickerSiteId={siteId}
                  toolbarContent={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs font-semibold"
                      onClick={handleGenerate}
                      disabled={isGenerating || aiProviders.length === 0}
                      title="Generate with AI"
                    >
                      <Wand2 className="h-4 w-4 mr-1.5" />
                      {isGenerating ? 'Generating...' : 'Generate with AI'}
                    </Button>
                  }
                />
                {aiError && (
                  <div className="p-4 pt-3">
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {aiError}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Background & Spacing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="richtext-bg-color">Background Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={content.backgroundColor || '#ffffff'}
                      onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      id="richtext-bg-color"
                      value={content.backgroundColor || '#ffffff'}
                      onChange={(e) => onContentChange('backgroundColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="richtext-padding">Padding (px)</Label>
                  <input
                    id="richtext-padding"
                    type="text"
                    defaultValue={(content.padding ?? 20).toString()}
                    onBlur={(e) => {
                      const val = e.target.value
                      const num = val === '' ? 0 : parseInt(val)
                      if (!isNaN(num)) {
                        onContentChange('padding', num)
                      }
                    }}
                    className="border p-2 rounded-md mt-1"
                    style={{ width: '100%' }}
                  />
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="newsletter-ai-subject">Subject</Label>
                  <Input
                    id="newsletter-ai-subject"
                    value={subjectValue}
                    onChange={(event) => handleSubjectChange(event.target.value)}
                    placeholder="Email subject line"
                  />
                </div>

                <div>
                  <Label htmlFor="newsletter-ai-prompt">Prompt</Label>
                  <Textarea
                    id="newsletter-ai-prompt"
                    value={content.aiPrompt || ''}
                    onChange={(event) => {
                      setAiError(null)
                      onContentChange('aiPrompt', event.target.value)
                    }}
                    placeholder="Tell the AI how to finish this newsletter. Tone, audience, offer, CTA, sections, and any constraints."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This prompt is saved with the block. Use the `Generate with AI` button in the editor toolbar on the `Content` tab to run it.
                  </p>
                </div>

                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-full sm:w-auto">
                    <Label>AI Provider</Label>
                    {aiProviders.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        No AI providers configured. Add an API key in Site Settings → Integrations.
                      </p>
                    ) : (
                      <Select value={activeProvider || ''} onValueChange={handleProviderChange}>
                        <SelectTrigger className="w-full sm:w-[220px]">
                          <SelectValue placeholder="Select AI provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {aiProviders.map((provider) => (
                            <SelectItem key={provider} value={provider}>
                              {getAIProviderLabel(provider)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="w-full sm:w-auto">
                    <Label>Model</Label>
                    {activeProvider ? (
                      <Select
                        value={content.aiModel || getDefaultAIModel(activeProvider)}
                        onValueChange={(value) => {
                          setAiError(null)
                          onContentChange('aiModel', value)
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[260px]">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        Select a provider first.
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  AI generation uses the subject, the current editor content, and this saved prompt.
                </p>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}
