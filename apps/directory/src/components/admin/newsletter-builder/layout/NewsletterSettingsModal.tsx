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
import Users from "lucide-react/dist/esm/icons/users.js"
import TestTube from "lucide-react/dist/esm/icons/test-tube.js"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { DripSettingsFields, useDripSettings } from "./DripSettingsFields"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

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
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Segment picker state
  const [segments, setSegments] = useState<Segment[]>([])
  const [audienceMode, setAudienceMode] = useState<string>('none') // 'none' | 'all' | segment ID | 'custom'
  const [maxWidth, setMaxWidth] = useState(600)

  const drip = useDripSettings(false, false)
  const loadDripConfig = drip.loadFromConfig

  useEffect(() => {
    if (newsletter) {
      setSubject(newsletter.subject)
      setFilterTags(newsletter.audience_filter?.tags?.join(', ') || '')
      setMaxWidth(newsletter.metadata?.maxWidth || 600)
      loadDripConfig(newsletter.metadata?.drip_config)
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
  }, [newsletter, loadDripConfig])

  useEffect(() => {
    if (open) {
      setActiveTab("general")
    }
  }, [open, newsletter?.id])

  // Load segments when modal opens
  useEffect(() => {
    if (!open || !siteId) return
    getSegmentsBySite({ data: { siteId: siteId } }).then(({ data }) => setSegments(data || []))
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
      getAudienceCount({ data: { siteId: siteId, audienceFilter: filter } }).then(({ count }) => setAudienceCount(count))
    } else if (audienceMode === 'all') {
      getAudienceCount({ data: { siteId: siteId, audienceFilter: {} } }).then(({ count }) => setAudienceCount(count))
    } else {
      // It's a segment ID — count via join table
      getAudienceCount({ data: { siteId: siteId, audienceFilter: { segment_id: audienceMode } } }).then(({ count }) => setAudienceCount(count))
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
    setSuccessMsg(null)

    const dripError = drip.validate()
    if (dripError) {
      setError(dripError)
      setSaving(false)
      return
    }

    const metadata: Record<string, any> = { ...newsletter.metadata, maxWidth }
    if (drip.enabled) {
      metadata.drip_config = { ...(newsletter.metadata?.drip_config || {}), ...drip.buildConfig() }
    } else {
      metadata.drip_config = { ...(newsletter.metadata?.drip_config || {}), enabled: false }
    }

    const { data, error: updateError } = await updateNewsletter({ data: { newsletterId: newsletter.id, updates: {
      subject: subject.trim(),
      status: 'draft',
      audience_filter: buildAudienceFilter(),
      metadata,
    } } })
    setSaving(false)
    if (updateError) {
      setError(updateError)
      return
    }
    if (data) {
      onSuccess(data)
      onOpenChange(false)
      showActionSuccess("Newsletter updated.")
    }
  }

  const handleSendTest = async () => {
    if (!newsletter || !testEmail) return
    setSendingTest(true)
    setError(null)
    setSuccessMsg(null)

    const { success, error: sendError } = await sendTestNewsletter({ data: { newsletterId: newsletter.id, testEmail: testEmail } })
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <DashboardModalContent
            title="Newsletter Settings"
            titleAccessory={
              <div className="flex items-center gap-4">
                <TabsList className="h-9 shrink-0">
                  <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
                  <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
                </TabsList>
                <div className="flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full ${isSent ? 'bg-green-500 dark:bg-green-600' : 'bg-gray-400'}`} />
                  <span className="text-sm font-medium">
                    {newsletter.status === 'sent' ? 'Sent' : newsletter.status === 'sending' ? 'Sending' : newsletter.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                  </span>
                </div>
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
            {successMsg && (
              <div className="px-6 pb-2">
                <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/50 p-3">
                  <p className="text-sm text-green-800 dark:text-green-300">{successMsg}</p>
                </div>
              </div>
            )}

            <TabsContent value="general" className="mt-0 min-h-[340px]">
              <CardGroup className="grid">
                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Content</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Layout</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <DashboardModalCardTitle>Audience</DashboardModalCardTitle>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>

                {!isSent && (
                  <Card>
                    <CardHeader>
                      <DashboardModalCardTitle>Test Email</DashboardModalCardTitle>
                    </CardHeader>
                    <CardContent>
                      <Field>
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
                    </CardContent>
                  </Card>
                )}
              </CardGroup>
            </TabsContent>

            <TabsContent value="drip-options" className="mt-0 min-h-[340px]">
              <CardGroup className="grid">
                {isSent && (
                  <Card>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Drip settings are locked after sending starts.</p>
                    </CardContent>
                  </Card>
                )}
                <DripSettingsFields form={drip} idPrefix="newsletter-settings" disabled={isSent} variant="cards" />
              </CardGroup>
            </TabsContent>
          </DashboardModalContent>
        </Tabs>
      </Dialog>

    </>
  )
}
