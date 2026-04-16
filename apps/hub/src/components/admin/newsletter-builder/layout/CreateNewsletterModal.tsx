"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AdminModalBody,
  AdminModalFooter,
} from "@/components/admin/shared/AdminModalLayout"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { ChevronDown, Users } from "lucide-react"

interface CreateNewsletterModalProps {
  onSuccess: (newsletter: Newsletter) => void
  onCancel: () => void
}

export function CreateNewsletterModal({ onSuccess, onCancel }: CreateNewsletterModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [activeTab, setActiveTab] = useState("general")
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Template picker state
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none')
  const [filterTags, setFilterTags] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Drip config state
  const [dripEnabled, setDripEnabled] = useState(false)
  const [dripBatchMin, setDripBatchMin] = useState('400')
  const [dripBatchMax, setDripBatchMax] = useState('500')
  const [dripIntervalMin, setDripIntervalMin] = useState('30')
  const [dripIntervalMax, setDripIntervalMax] = useState('60')
  const [dripBounceThreshold, setDripBounceThreshold] = useState('5')
  const [dripSendWindowEnabled, setDripSendWindowEnabled] = useState(false)
  const [dripSendWindowStart, setDripSendWindowStart] = useState('08:00')
  const [dripSendWindowEnd, setDripSendWindowEnd] = useState('15:00')
  const [dripSendWindowTimezone, setDripSendWindowTimezone] = useState('America/New_York')

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

    setLoading(true)
    setError(null)

    const selectedTemplate = selectedTemplateId !== 'blank'
      ? templates.find(t => t.id === selectedTemplateId)
      : null
    const metadata = dripEnabled ? {
      drip_config: {
        enabled: true,
        batch_size_min: parseInt(dripBatchMin) || 400,
        batch_size_max: parseInt(dripBatchMax) || 500,
        interval_min_minutes: parseInt(dripIntervalMin) || 30,
        interval_max_minutes: parseInt(dripIntervalMax) || 60,
        bounce_threshold_percent: parseFloat(dripBounceThreshold) || 5,
        ...(dripSendWindowEnabled ? {
          send_window_start: dripSendWindowStart,
          send_window_end: dripSendWindowEnd,
          send_window_timezone: dripSendWindowTimezone,
        } : {
          send_window_start: null,
          send_window_end: null,
          send_window_timezone: null,
        }),
      },
    } : undefined

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
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid-cols-3 gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="drip-options">Drip Options</TabsTrigger>
          <TabsTrigger value="audience-filter">Audience Filter</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-0 min-h-[320px] space-y-4">
            <div>
              <Label htmlFor="newsletter-template">Start from template</Label>
              {templatesLoading ? (
                <div className="border-input mt-2 inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
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
            </div>

            <div>
              <Label htmlFor="newsletter-subject">Subject Line *</Label>
              <Input
                id="newsletter-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                required
              />
            </div>
          </TabsContent>

          <TabsContent value="drip-options" className="mt-0 min-h-[320px] space-y-4">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Checkbox
                  id="create-drip-toggle"
                  checked={dripEnabled}
                  onCheckedChange={(checked) => setDripEnabled(checked === true)}
                />
                <Label htmlFor="create-drip-toggle">Enable drip sending</Label>
              </div>
              {dripEnabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="create-drip-batch-min">Batch size min</Label>
                      <Input
                        id="create-drip-batch-min"
                        type="number"
                        value={dripBatchMin}
                        onChange={(e) => setDripBatchMin(e.target.value)}
                        min={1}
                      />
                    </div>
                    <div>
                      <Label htmlFor="create-drip-batch-max">Batch size max</Label>
                      <Input
                        id="create-drip-batch-max"
                        type="number"
                        value={dripBatchMax}
                        onChange={(e) => setDripBatchMax(e.target.value)}
                        min={1}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="create-drip-interval-min">Interval min (minutes)</Label>
                      <Input
                        id="create-drip-interval-min"
                        type="number"
                        value={dripIntervalMin}
                        onChange={(e) => setDripIntervalMin(e.target.value)}
                        min={1}
                      />
                    </div>
                    <div>
                      <Label htmlFor="create-drip-interval-max">Interval max (minutes)</Label>
                      <Input
                        id="create-drip-interval-max"
                        type="number"
                        value={dripIntervalMax}
                        onChange={(e) => setDripIntervalMax(e.target.value)}
                        min={1}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="create-drip-bounce-threshold">Bounce threshold (%)</Label>
                    <Input
                      id="create-drip-bounce-threshold"
                      type="number"
                      value={dripBounceThreshold}
                      onChange={(e) => setDripBounceThreshold(e.target.value)}
                      min={0.1}
                      step="any"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Auto-pause and notify you if bounce rate exceeds this percentage
                    </p>
                  </div>

                  <div className="pt-2">
                    <div className="mb-3 flex items-center gap-2">
                      <Checkbox
                        id="create-send-window-toggle"
                        checked={dripSendWindowEnabled}
                        onCheckedChange={(checked) => setDripSendWindowEnabled(checked === true)}
                      />
                      <Label htmlFor="create-send-window-toggle">Limit sending to specific hours</Label>
                    </div>
                    {dripSendWindowEnabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="create-send-window-start">Start time</Label>
                            <Input
                              id="create-send-window-start"
                              type="time"
                              value={dripSendWindowStart}
                              onChange={(e) => setDripSendWindowStart(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="create-send-window-end">End time</Label>
                            <Input
                              id="create-send-window-end"
                              type="time"
                              value={dripSendWindowEnd}
                              onChange={(e) => setDripSendWindowEnd(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="create-send-window-tz">Timezone</Label>
                          <Select value={dripSendWindowTimezone} onValueChange={setDripSendWindowTimezone}>
                            <SelectTrigger id="create-send-window-tz" size="button">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-60">
                              <SelectItem value="America/New_York">Eastern Time</SelectItem>
                              <SelectItem value="America/Chicago">Central Time</SelectItem>
                              <SelectItem value="America/Denver">Mountain Time</SelectItem>
                              <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                              <SelectItem value="UTC">UTC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Emails will only be sent between {dripSendWindowStart} and {dripSendWindowEnd} in the selected timezone
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="audience-filter" className="mt-0 min-h-[320px] space-y-6">
            <div>
              <div>
                <Label htmlFor="create-audience-select">Segment</Label>
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
              </div>

              {audienceMode === 'custom' && (
                <div className="mt-3">
                  <Label htmlFor="create-filter-tags">Filter by Tags</Label>
                  <Input
                    id="create-filter-tags"
                    value={filterTags}
                    onChange={(e) => setFilterTags(e.target.value)}
                    placeholder="austin, fitness (comma-separated)"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only contacts with ALL these tags will receive this newsletter.
                  </p>
                </div>
              )}

              {audienceMode !== 'none' && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {audienceCount !== null
                      ? <>{audienceCount.toLocaleString()} active contact{audienceCount !== 1 ? 's' : ''}</>
                      : 'Calculating...'}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </AdminModalBody>

      <AdminModalFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Continue'}
        </Button>
      </AdminModalFooter>
    </form>
  )
}
