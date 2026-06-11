"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ModalErrorBanner } from "@/components/admin/layout/dashboard/content-modal-shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
export type { Newsletter }
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getTemplatesBySite } from "@/lib/actions/newsletters/template-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { ChevronDown, Users } from "lucide-react"
import { DripSettingsFields, useDripSettings } from "./DripSettingsFields"

interface CreateNewsletterModalProps {
  onSuccess: (newsletter: Newsletter) => void
  onCancel: () => void
}

export function CreateNewsletterModal({ onSuccess, onCancel }: CreateNewsletterModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createActiveTab, setCreateActiveTab] = useState('general')

  // Template picker state
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none')
  const [filterTags, setFilterTags] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  const drip = useDripSettings(false, false)

  useEffect(() => {
    const defaults = currentSite?.settings?.newsletter_drip_defaults
    if (defaults) drip.loadFromConfig(defaults)
  }, [currentSite?.id, currentSite?.settings?.newsletter_drip_defaults, drip.loadFromConfig])

  // Load segments and templates
  useEffect(() => {
    if (!currentSite?.id) return

    setTemplatesLoading(true)
    getSegmentsBySite(currentSite.id).then(({ data }) => setSegments(data || []))
    getTemplatesBySite(currentSite.id)
      .then(({ data }) => {
        const loaded = data || []
        setTemplates(loaded)
        // Preselect the default template, or fall back to 'blank'
        const defaultTemplate = loaded.find(t => t.is_default)
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : 'blank')
      })
      .finally(() => setTemplatesLoading(false))
  }, [currentSite?.id])

  // Update audience count based on mode
  useEffect(() => {
    if (!currentSite?.id) return

    if (audienceMode === 'none') {
      setAudienceCount(null)
      return
    }

    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      const filter = tags.length ? { tags } : {}
      getAudienceCount(currentSite.id, filter).then(({ count }) => setAudienceCount(count))
    } else if (audienceMode === 'all') {
      getAudienceCount(currentSite.id, {}).then(({ count }) => setAudienceCount(count))
    } else {
      // It's a segment ID — count via join table
      getAudienceCount(currentSite.id, { segment_id: audienceMode }).then(({ count }) => setAudienceCount(count))
    }
  }, [audienceMode, filterTags, currentSite?.id, segments])

  function handleAudienceModeChange(value: string) {
    setAudienceMode(value)
    if (value !== 'custom') {
      setFilterTags('')
    }
  }

  function buildAudienceFilter(): Record<string, any> {
    if (audienceMode === 'none') return {}
    if (audienceMode === 'all') return { audience: 'all' }
    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      return tags.length ? { tags } : {}
    }
    // Segment selected — store segment_id only
    return { segment_id: audienceMode }
  }

  const handleCreate = async (status: 'draft' | 'scheduled') => {
    if (!subject.trim()) {
      setError('Subject line is required')
      return
    }

    if (!currentSite?.id) {
      setError('No site selected')
      return
    }

    const dripError = drip.validate()
    if (dripError) {
      setError(dripError)
      return
    }

    setLoading(true)
    setError(null)

    const selectedTemplate = selectedTemplateId !== 'blank'
      ? templates.find(t => t.id === selectedTemplateId)
      : null
    const metadata = drip.enabled ? { drip_config: drip.buildConfig() } : undefined

    const { data, error: createError } = await createNewsletter({
      siteId: currentSite.id,
      subject: subject.trim(),
      audience_filter: buildAudienceFilter(),
      content_blocks: selectedTemplate?.content_blocks,
      metadata,
      status,
    })

    if (createError) {
      setError(createError)
      setLoading(false)
      return
    }

    if (data) {
      onSuccess(data)
    }
    setLoading(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleCreate('draft')
  }

  return (
    <Tabs value={createActiveTab} onValueChange={setCreateActiveTab}>
      <form id="create-newsletter-form" onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title="Create New Newsletter"
          titleAccessory={
            <TabsList className="h-9 shrink-0">
              <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
              <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
            </TabsList>
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button form="create-newsletter-form" type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Continue'}
              </Button>
            </>
          }
        >
          <ModalErrorBanner error={error} />

          <TabsContent value="general" className="mt-0 min-h-[320px]">
            <CardGroup className="grid">
              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Template</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="newsletter-template">Start from template</FieldLabel>
                    {templatesLoading ? (
                      <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                        <Skeleton className="h-4 w-24 rounded-sm" />
                        <ChevronDown className="size-4 opacity-50" />
                      </div>
                    ) : (
                      <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                        <SelectTrigger id="newsletter-template" size="button">
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent className="z-60">
                          <SelectItem value="blank">Blank</SelectItem>
                          {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Content</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="newsletter-subject">Subject Line *</FieldLabel>
                    <Input
                      id="newsletter-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject line"
                      required
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <DashboardModalCardTitle>Audience</DashboardModalCardTitle>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="create-audience-select">Segment</FieldLabel>
                    <Select value={audienceMode} onValueChange={handleAudienceModeChange}>
                      <SelectTrigger id="create-audience-select" size="button">
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent className="z-60">
                        <SelectItem value="none">No segment</SelectItem>
                        <SelectItem value="all">All Contacts</SelectItem>
                        {segments.map(seg => (
                          <SelectItem key={seg.id} value={seg.id}>{seg.name}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom filter...</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {audienceMode === 'custom' && (
                    <Field>
                      <FieldLabel htmlFor="create-filter-tags">Filter by Tags</FieldLabel>
                      <Input
                        id="create-filter-tags"
                        value={filterTags}
                        onChange={(e) => setFilterTags(e.target.value)}
                        placeholder="austin, fitness (comma-separated)"
                      />
                      <FieldDescription>Only contacts with ALL these tags will receive this newsletter.</FieldDescription>
                    </Field>
                  )}
                  {audienceMode !== 'none' && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {audienceCount !== null
                          ? <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? 's' : ''}</>
                          : 'Calculating...'}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardGroup>
          </TabsContent>

          <TabsContent value="drip-options" className="mt-0 min-h-[320px]">
            <CardGroup className="grid">
              <DripSettingsFields form={drip} idPrefix="create-newsletter" variant="cards" />
            </CardGroup>
          </TabsContent>
        </DashboardModalContent>
      </form>
    </Tabs>
  )
}
