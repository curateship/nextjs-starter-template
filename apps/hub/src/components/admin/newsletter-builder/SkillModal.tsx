"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { X, Upload } from "lucide-react"
import { createSkill, updateSkill } from "@/lib/actions/newsletters/skill-actions"
import type { NewsletterSkill } from "@/lib/actions/newsletters/skill-actions"
import { getSiteIntegrations } from "@/lib/actions/integrations/integration-actions"
import {
  getAIModelOptions,
  getAIProviderLabel,
  getDefaultAIModel,
  isAIProvider,
  type AIProvider,
} from "@/lib/utils/ai-models"

// Available block types the AI can generate
const BLOCK_TYPE_OPTIONS = [
  { value: 'newsletter-rich-text', label: 'Rich Text', description: 'Formatted text content' },
  { value: 'newsletter-header', label: 'Header', description: 'Logo/header block' },
  { value: 'newsletter-divider', label: 'Divider', description: 'Section separator' },
  { value: 'newsletter-footer', label: 'Footer', description: 'Footer with unsubscribe' },
]

interface SkillModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skill: NewsletterSkill | null  // null = create, non-null = edit
  siteId: string
  onSaved: () => void
}

export function SkillModal({ open, onOpenChange, skill, siteId, onSaved }: SkillModalProps) {
  // Tab 1 — Prompt
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [quantity, setQuantity] = useState(1)

  // Tab 2 — References
  const [referenceText, setReferenceText] = useState('')
  const [referenceFileIds, setReferenceFileIds] = useState<string[]>([])
  const [referenceFileUrls, setReferenceFileUrls] = useState<string[]>([])
  const [showMediaPicker, setShowMediaPicker] = useState(false)

  // Tab 3 — Settings
  const [provider, setProvider] = useState<AIProvider | ''>('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [allowedBlockTypes, setAllowedBlockTypes] = useState<string[]>(['newsletter-rich-text'])

  // Tab state
  const [activeTab, setActiveTab] = useState('prompt')

  // State
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([])

  // Load AI integrations when modal opens
  useEffect(() => {
    if (open && siteId) {
      loadIntegrations()
    }
  }, [open, siteId])

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (skill) {
        setName(skill.name)
        setPrompt(skill.prompt)
        setQuantity(skill.quantity)
        setReferenceText(skill.reference_text || '')
        setReferenceFileIds(skill.settings?.reference_file_ids || [])
        setReferenceFileUrls(skill.settings?.reference_file_urls || [])
        setProvider(isAIProvider(skill.settings?.provider) ? skill.settings.provider : '')
        setModel(skill.settings?.model || '')
        setTemperature(skill.settings?.temperature ?? 0.7)
        setAllowedBlockTypes(skill.settings?.allowed_block_types || ['newsletter-rich-text'])
      } else {
        // Reset form for create
        setName('')
        setPrompt('')
        setQuantity(1)
        setReferenceText('')
        setReferenceFileIds([])
        setReferenceFileUrls([])
        setProvider('')
        setModel('')
        setTemperature(0.7)
        setAllowedBlockTypes(['newsletter-rich-text'])
      }
      setError(null)
      setActiveTab('prompt')
    }
  }, [open, skill])

  // Load available AI integrations for the site
  async function loadIntegrations() {
    try {
      const integrations = await getSiteIntegrations(siteId)
      const availableProviders = integrations.reduce<AIProvider[]>((providers, integration) => {
        if (integration.isEnabled && isAIProvider(integration.integrationType)) {
          providers.push(integration.integrationType)
        }
        return providers
      }, [])

      setAiProviders(availableProviders)
    } catch {
      // Integrations are optional — skill can still work if AI config is set
    }
  }

  useEffect(() => {
    if (!aiProviders.length) return

    if (!provider || !aiProviders.includes(provider)) {
      const nextProvider = aiProviders[0]
      setProvider(nextProvider)
      setModel(getDefaultAIModel(nextProvider))
      return
    }

    if (!getAIModelOptions(provider).some((option) => option.value === model)) {
      setModel(getDefaultAIModel(provider))
    }
  }, [aiProviders, provider, model])

  // Handle provider change — reset model to first option
  function handleProviderChange(newProvider: AIProvider) {
    setProvider(newProvider)
    setModel(getDefaultAIModel(newProvider))
  }

  // Toggle a block type in the allowed list
  function toggleBlockType(type: string) {
    setAllowedBlockTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting the last type
        if (prev.length === 1) return prev
        return prev.filter(t => t !== type)
      }
      return [...prev, type]
    })
  }

  // Handle media selection for reference files
  function handleMediaSelect(url: string) {
    if (!referenceFileUrls.includes(url)) {
      setReferenceFileUrls(prev => [...prev, url])
    }
    setShowMediaPicker(false)
  }

  // Remove a reference file
  function removeReferenceFile(url: string) {
    setReferenceFileUrls(prev => prev.filter(u => u !== url))
  }

  // Save (create or update)
  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!prompt.trim()) { setError('Prompt is required'); return }

    setSaving(true)
    setError(null)

    const settings = {
      provider,
      model,
      temperature,
      allowed_block_types: allowedBlockTypes,
      reference_file_urls: referenceFileUrls,
      reference_file_ids: referenceFileIds,
    }

    if (skill) {
      // Update existing
      const { error: updateError } = await updateSkill(skill.id, {
        name: name.trim(),
        prompt: prompt.trim(),
        referenceText: referenceText || null,
        settings,
      })
      if (updateError) {
        setError(updateError)
        setSaving(false)
        return
      }
    } else {
      // Create new
      const { error: createError } = await createSkill({
        siteId,
        name: name.trim(),
        prompt: prompt.trim(),
        referenceText: referenceText || undefined,
        settings,
      })
      if (createError) {
        setError(createError)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onOpenChange(false)
    onSaved()
  }

  // Available models for the selected provider
  const availableModels = provider ? getAIModelOptions(provider) : []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[600px] max-w-[95vw] max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{skill ? 'Edit Skill' : 'Create Skill'}</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="references">References</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Tab 1: Prompt */}
            <TabsContent value="prompt" className="space-y-4 pt-4">
              <div>
                <Label htmlFor="skill-name">Skill Name *</Label>
                <Input
                  id="skill-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='e.g. "30 Newsletters about productivity"'
                />
              </div>


              <div>
                <Label htmlFor="skill-prompt">Prompt *</Label>
                <Textarea
                  id="skill-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Write instructions for the AI. What should each newsletter be about? What tone, length, format?"
                  rows={8}
                />
              </div>
            </TabsContent>

            {/* Tab 2: References */}
            <TabsContent value="references" className="space-y-4 pt-4">
              <div>
                <Label htmlFor="reference-text">Voice Guide / Reference Notes</Label>
                <Textarea
                  id="reference-text"
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="Paste your voice guide, example newsletters, writing style notes, or any reference content the AI should follow..."
                  rows={10}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This text is included with every AI generation as additional context
                </p>
              </div>

              <div>
                <Label>Reference Files</Label>
                <div className="space-y-2 mt-2">
                  {/* List attached files */}
                  {referenceFileUrls.map((url) => (
                    <div key={url} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                      <span className="text-sm truncate flex-1">{url.split('/').pop()}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removeReferenceFile(url)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Add file button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMediaPicker(true)}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Add Reference File
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Tab 3: Settings */}
            <TabsContent value="settings" className="space-y-4 pt-4">
              {/* AI Provider */}
              <div>
                <Label>AI Provider</Label>
                {aiProviders.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    No AI providers configured. Add an API key in Site Settings → Integrations.
                  </p>
                ) : (
                  <Select value={provider} onValueChange={(value) => handleProviderChange(value as AIProvider)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AI provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiProviders.map((aiProvider) => (
                        <SelectItem key={aiProvider} value={aiProvider}>
                          {getAIProviderLabel(aiProvider)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Model */}
              {provider && availableModels.length > 0 && (
                <div>
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Temperature */}
              <div>
                <Label>Temperature: {temperature.toFixed(1)}</Label>
                <Slider
                  value={[temperature]}
                  onValueChange={([val]) => setTemperature(val)}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lower = more focused/predictable. Higher = more creative/varied.
                </p>
              </div>

              {/* Allowed block types */}
              <div>
                <Label>Allowed Block Types</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Which block types the AI can generate. Header/footer are auto-added from your default template if unchecked.
                </p>
                <div className="space-y-2">
                  {BLOCK_TYPE_OPTIONS.map((blockType) => (
                    <label key={blockType.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allowedBlockTypes.includes(blockType.value)}
                        onCheckedChange={() => toggleBlockType(blockType.value)}
                      />
                      <span className="text-sm">{blockType.label}</span>
                      <span className="text-xs text-muted-foreground">— {blockType.description}</span>
                    </label>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !prompt.trim()}>
              {saving ? "Saving..." : skill ? "Update Skill" : "Create Skill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Picker for reference files */}
      <MediaPicker
        open={showMediaPicker}
        onOpenChange={setShowMediaPicker}
        onSelectMedia={handleMediaSelect}
        site_id={siteId}
      />
    </>
  )
}
