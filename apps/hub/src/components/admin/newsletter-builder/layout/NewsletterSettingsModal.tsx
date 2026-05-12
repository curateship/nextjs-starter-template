"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateNewsletter, sendTestNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getAudienceCount } from "@/lib/actions/newsletters/audience-sync-actions"
import { getSegmentsBySite } from "@/lib/actions/newsletters/segment-actions"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Users, TestTube } from "lucide-react"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  DEFAULT_NEWSLETTER_SEND_WINDOWS,
  formatNewsletterSendWindows,
  getNewsletterSendWindows,
} from "@/lib/actions/newsletters/send-windows"

interface NewsletterSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletter: Newsletter | null
  siteId: string
  onSuccess: (updatedNewsletter: Newsletter) => void
}

export function NewsletterSettingsModal({
  open,
  onOpenChange,
  newsletter,
  siteId,
  onSuccess,
}: NewsletterSettingsModalProps) {
  const [activeTab, setActiveTab] = useState("general")
  const [subject, setSubject] = useState('')
  const [filterTags, setFilterTags] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none') // 'none' | 'all' | segment ID | 'custom'
  const [maxWidth, setMaxWidth] = useState(600)

  // Drip config state
  const [dripEnabled, setDripEnabled] = useState(false)
  const [dripBatchMin, setDripBatchMin] = useState('400')
  const [dripBatchMax, setDripBatchMax] = useState('500')
  const [dripIntervalMin, setDripIntervalMin] = useState('30')
  const [dripIntervalMax, setDripIntervalMax] = useState('60')
  const [dripBounceThreshold, setDripBounceThreshold] = useState('5')
  const [dripSendWindowOneStart, setDripSendWindowOneStart] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[0].start)
  const [dripSendWindowOneEnd, setDripSendWindowOneEnd] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[0].end)
  const [dripSendWindowTwoStart, setDripSendWindowTwoStart] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[1].start)
  const [dripSendWindowTwoEnd, setDripSendWindowTwoEnd] = useState(DEFAULT_NEWSLETTER_SEND_WINDOWS[1].end)
  const [dripSendWindowTimezone, setDripSendWindowTimezone] = useState('America/New_York')
  const [dripSendWindowEnabled, setDripSendWindowEnabled] = useState(false)

  useEffect(() => {
    if (newsletter) {
      setSubject(newsletter.subject)
      setFilterTags(newsletter.audience_filter?.tags?.join(', ') || '')
      setMaxWidth(newsletter.metadata?.maxWidth || 600)
      const drip = newsletter.metadata?.drip_config
      setDripEnabled(drip?.enabled || false)
      setDripBatchMin(String(drip?.batch_size_min ?? 400))
      setDripBatchMax(String(drip?.batch_size_max ?? 500))
      setDripIntervalMin(String(drip?.interval_min_minutes ?? 30))
      setDripIntervalMax(String(drip?.interval_max_minutes ?? 60))
      setDripBounceThreshold(String(drip?.bounce_threshold_percent ?? 5))
      const sendWindows = getNewsletterSendWindows(drip)
      setDripSendWindowEnabled(sendWindows.length > 0)
      setDripSendWindowOneStart(sendWindows[0]?.start || DEFAULT_NEWSLETTER_SEND_WINDOWS[0].start)
      setDripSendWindowOneEnd(sendWindows[0]?.end || DEFAULT_NEWSLETTER_SEND_WINDOWS[0].end)
      setDripSendWindowTwoStart(sendWindows[1]?.start || DEFAULT_NEWSLETTER_SEND_WINDOWS[1].start)
      setDripSendWindowTwoEnd(sendWindows[1]?.end || DEFAULT_NEWSLETTER_SEND_WINDOWS[1].end)
      setDripSendWindowTimezone(drip?.send_window_timezone || 'America/New_York')
      setError(null)
      setSuccessMsg(null)

      // Determine audience mode from saved data
      if (newsletter.audience_filter?.segment_id) {
        setAudienceMode(newsletter.audience_filter.segment_id)
      } else if (newsletter.audience_filter?.tags?.length) {
        setAudienceMode('custom')
      } else if (newsletter.audience_filter?.audience === 'all') {
        setAudienceMode('all')
      } else {
        setAudienceMode('none')
      }
    }
  }, [newsletter])

  useEffect(() => {
    if (open) {
      setActiveTab("general")
    }
  }, [open, newsletter?.id])

  // Load segments when modal opens
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite(siteId).then(({ data }) => setSegments(data || []))
  }, [open, siteId])

  // Update audience count based on mode
  useEffect(() => {
    if (!open || !siteId) return

    if (audienceMode === 'none') {
      setAudienceCount(null)
      return
    }

    if (audienceMode === 'custom') {
      const tags = filterTags ? filterTags.split(',').map(t => t.trim()).filter(Boolean) : []
      const filter = tags.length ? { tags } : {}
      getAudienceCount(siteId, filter).then(({ count }) => setAudienceCount(count))
    } else if (audienceMode === 'all') {
      getAudienceCount(siteId, {}).then(({ count }) => setAudienceCount(count))
    } else {
      // It's a segment ID — count via join table
      getAudienceCount(siteId, { segment_id: audienceMode }).then(({ count }) => setAudienceCount(count))
    }
  }, [audienceMode, filterTags, siteId, open, segments])

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

  const handleSave = async () => {
    if (!newsletter || !subject.trim()) {
      setError('Subject line is required')
      return
    }
    setSaving(true)
    setError(null)

    const sendWindows = [
      { start: dripSendWindowOneStart, end: dripSendWindowOneEnd },
      { start: dripSendWindowTwoStart, end: dripSendWindowTwoEnd },
    ]
    if (dripEnabled && dripSendWindowEnabled && sendWindows.some((window) => !window.start || !window.end)) {
      setError('Both send windows need a start and end time')
      setSaving(false)
      return
    }

    const metadata: Record<string, any> = { ...newsletter.metadata, maxWidth }
    if (dripEnabled) {
      metadata.drip_config = {
        ...(newsletter.metadata?.drip_config || {}),
        enabled: true,
        batch_size_min: parseInt(dripBatchMin) || 400,
        batch_size_max: parseInt(dripBatchMax) || 500,
        interval_min_minutes: parseInt(dripIntervalMin) || 30,
        interval_max_minutes: parseInt(dripIntervalMax) || 60,
        bounce_threshold_percent: parseFloat(dripBounceThreshold) || 5,
        ...(dripSendWindowEnabled ? {
          send_windows: sendWindows,
          send_window_start: sendWindows[0].start,
          send_window_end: sendWindows[0].end,
          send_window_timezone: dripSendWindowTimezone,
        } : {
          send_windows: [],
          send_window_start: null,
          send_window_end: null,
          send_window_timezone: null,
        }),
      }
    } else {
      metadata.drip_config = { ...(newsletter.metadata?.drip_config || {}), enabled: false }
    }

    const { data, error: updateError } = await updateNewsletter(newsletter.id, {
      subject: subject.trim(),
      status: 'draft',
      audience_filter: buildAudienceFilter(),
      metadata,
    })
    setSaving(false)
    if (updateError) {
      setError(updateError)
      return
    }
    if (data) {
      onSuccess(data)
      setSuccessMsg('Saved!')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }

  const handleSendTest = async () => {
    if (!newsletter || !testEmail) return
    setSendingTest(true)
    setError(null)
    setSuccessMsg(null)

    const { success, error: sendError } = await sendTestNewsletter(newsletter.id, testEmail)
    if (sendError) {
      setError(sendError)
    } else if (success) {
      setSuccessMsg(`Test sent to ${testEmail}`)
    }
    setSendingTest(false)
  }


  if (!newsletter) return null
  const isSent = newsletter.status === 'sent' || newsletter.status === 'sending' || newsletter.status === 'paused'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DashboardModalContent
          title="Newsletter Settings"
          titleAccessory={
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <div className={`h-2 w-2 rounded-full ${isSent ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  {newsletter.status === 'sent' ? 'Sent' : newsletter.status === 'sending' ? 'Sending' : newsletter.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                </span>
              </div>
              <TabsList className="h-9 shrink-0">
                <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
                <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
              </TabsList>
            </div>
          }
          footer={
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={saving || isSent}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          }
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {(error || successMsg) && (
              <div className="px-6 pb-2 space-y-2">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm text-green-800">{successMsg}</p>
                  </div>
                )}
              </div>
            )}

            <TabsContent value="general" className="mt-0 min-h-[340px]">
              <CardGroup className="grid">
                <Card>
                  <CardHeader className="p-4 pb-3">
                    <DashboardModalCardTitle>General</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 p-4 pt-0">
                    <Field>
                      <FieldLabel htmlFor="settings-subject">Subject Line *</FieldLabel>
                      <Input
                        id="settings-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Email subject line"
                        disabled={isSent}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="settings-max-width">Content Max Width (px)</FieldLabel>
                      <Input
                        id="settings-max-width"
                        type="number"
                        value={maxWidth}
                        onChange={(e) => setMaxWidth(parseInt(e.target.value) || 600)}
                        placeholder="600"
                        disabled={isSent}
                      />
                      <FieldDescription>Maximum width of the email content. Default is 600px.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="audience-select">Segment</FieldLabel>
                      <Select value={audienceMode} onValueChange={handleAudienceModeChange} disabled={isSent}>
                        <SelectTrigger id="audience-select" size="button">
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
                        <FieldLabel htmlFor="filter-tags">Filter by Tags</FieldLabel>
                        <Input
                          id="filter-tags"
                          value={filterTags}
                          onChange={(e) => setFilterTags(e.target.value)}
                          placeholder="austin, fitness (comma-separated)"
                          disabled={isSent}
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
                    {!isSent && (
                      <Field>
                        <FieldLabel>Test Email</FieldLabel>
                        <div className="flex items-end gap-2">
                          <Input
                            id="test-email"
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="your@email.com"
                          />
                          <Button variant="outline" onClick={handleSendTest} disabled={sendingTest || !testEmail}>
                            <TestTube className="h-4 w-4 mr-2" />
                            {sendingTest ? 'Sending...' : 'Send Test'}
                          </Button>
                        </div>
                      </Field>
                    )}
                  </CardContent>
                </Card>
              </CardGroup>
            </TabsContent>

            <TabsContent value="drip-options" className="mt-0 min-h-[340px]">
              <CardGroup className="grid">
                <Card>
                  <CardHeader className="p-4 pb-3">
                    <DashboardModalCardTitle>Drip options</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 p-4 pt-0">
                    {isSent && (
                      <p className="text-sm text-muted-foreground">Drip settings are locked after sending starts.</p>
                    )}
                    <Field>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          id="drip-toggle"
                          checked={dripEnabled}
                          onCheckedChange={(checked) => setDripEnabled(checked === true)}
                          disabled={isSent}
                        />
                        <span className="text-sm font-medium">Enable drip sending</span>
                      </label>
                    </Field>
                    {dripEnabled && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Field>
                            <FieldLabel htmlFor="drip-batch-min">Batch size min</FieldLabel>
                            <Input id="drip-batch-min" type="number" value={dripBatchMin} onChange={(e) => setDripBatchMin(e.target.value)} min={1} disabled={isSent} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="drip-batch-max">Batch size max</FieldLabel>
                            <Input id="drip-batch-max" type="number" value={dripBatchMax} onChange={(e) => setDripBatchMax(e.target.value)} min={1} disabled={isSent} />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field>
                            <FieldLabel htmlFor="drip-interval-min">Interval min (minutes)</FieldLabel>
                            <Input id="drip-interval-min" type="number" value={dripIntervalMin} onChange={(e) => setDripIntervalMin(e.target.value)} min={1} disabled={isSent} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="drip-interval-max">Interval max (minutes)</FieldLabel>
                            <Input id="drip-interval-max" type="number" value={dripIntervalMax} onChange={(e) => setDripIntervalMax(e.target.value)} min={1} disabled={isSent} />
                          </Field>
                        </div>
                        <Field>
                          <FieldLabel htmlFor="drip-bounce-threshold">Bounce threshold (%)</FieldLabel>
                          <Input id="drip-bounce-threshold" type="number" value={dripBounceThreshold} onChange={(e) => setDripBounceThreshold(e.target.value)} min={0.1} step="any" disabled={isSent} />
                          <FieldDescription>Auto-pause and notify you if bounce rate exceeds this percentage</FieldDescription>
                        </Field>
                        <Field>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox id="send-window-toggle" checked={dripSendWindowEnabled} onCheckedChange={(checked) => setDripSendWindowEnabled(checked === true)} disabled={isSent} />
                            <span className="text-sm font-medium">Limit sending to specific hours</span>
                          </label>
                        </Field>
                        {dripSendWindowEnabled && (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid grid-cols-2 gap-3">
                                <Field>
                                  <FieldLabel htmlFor="send-window-one-start">Start 1</FieldLabel>
                                  <Input id="send-window-one-start" type="time" value={dripSendWindowOneStart} onChange={(e) => setDripSendWindowOneStart(e.target.value)} disabled={isSent} />
                                </Field>
                                <Field>
                                  <FieldLabel htmlFor="send-window-one-end">End 1</FieldLabel>
                                  <Input id="send-window-one-end" type="time" value={dripSendWindowOneEnd} onChange={(e) => setDripSendWindowOneEnd(e.target.value)} disabled={isSent} />
                                </Field>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Field>
                                  <FieldLabel htmlFor="send-window-two-start">Start 2</FieldLabel>
                                  <Input id="send-window-two-start" type="time" value={dripSendWindowTwoStart} onChange={(e) => setDripSendWindowTwoStart(e.target.value)} disabled={isSent} />
                                </Field>
                                <Field>
                                  <FieldLabel htmlFor="send-window-two-end">End 2</FieldLabel>
                                  <Input id="send-window-two-end" type="time" value={dripSendWindowTwoEnd} onChange={(e) => setDripSendWindowTwoEnd(e.target.value)} disabled={isSent} />
                                </Field>
                              </div>
                            </div>
                            <Field>
                              <FieldLabel htmlFor="send-window-tz">Timezone</FieldLabel>
                              <Select value={dripSendWindowTimezone} onValueChange={setDripSendWindowTimezone} disabled={isSent}>
                                <SelectTrigger id="send-window-tz" size="button">
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
                            </Field>
                            <p className="text-xs text-muted-foreground">
                              Emails will only be sent during {formatNewsletterSendWindows({ send_windows: [
                                { start: dripSendWindowOneStart, end: dripSendWindowOneEnd },
                                { start: dripSendWindowTwoStart, end: dripSendWindowTwoEnd },
                              ] })} in the selected timezone
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </CardGroup>
            </TabsContent>
          </Tabs>
        </DashboardModalContent>
      </Dialog>

    </>
  )
}
