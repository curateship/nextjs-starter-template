"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { CategoryPicker } from "@/components/admin/layout/builder/CategoryPicker"
import { getContentCategoriesAction, bulkAssignCategoriesToContentAction } from "@/lib/actions/categories/category-relationship-actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DashboardModalCardTitle,
  DashboardModalContent,
  DashboardModalFooterActions,
} from "@/components/admin/layout/dashboard/modals"
import {
  FeaturedImageCard,
  MetaDescriptionField,
  ModalErrorBanner,
  putJson,
  useCreateContent,
  useTitleSlug,
} from "@/components/admin/layout/dashboard/content-modal-shared"
import { getEventTemplatesBySite, type EventTemplate } from "@/lib/actions/events/event-template-actions"
import { setEventRecurrenceAction } from "@/lib/actions/events/event-recurrence-actions"
import { extractEventContentFields, findEventContentBlockKey } from "@/lib/utils/calendar"
import type { Event } from "@/lib/actions/events/event-actions"
import type { RecurrenceRule } from "@/lib/utils/event-recurrence"
import { EventScheduleCard } from "./EventScheduleCard"

interface EventSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: Event | null
  onSuccess?: (updatedEvent: Event) => void
}

// Merge a date/time into the event's content blocks without disturbing the rest
// (body, venue, row settings). Writes to the existing event-content block, or the
// canonical key if the event has none yet.
function withSchedule(existing: Record<string, any> | undefined, date: string, time: string): Record<string, any> {
  const blocks = { ...(existing || {}) }
  const key = findEventContentBlockKey(blocks) || "event-content-default"
  const prev = blocks[key] && typeof blocks[key] === "object" ? blocks[key] : { id: key, type: "event-content", content: {} }
  const content: Record<string, any> = { ...(prev.content || {}) }
  if (date) content.eventDate = date
  else delete content.eventDate
  if (time) content.eventTime = time
  else delete content.eventTime
  blocks[key] = { ...prev, id: key, type: "event-content", content }
  return blocks
}

export function EventSettingsModal({
  open,
  onOpenChange,
  event,
  onSuccess
}: EventSettingsModalProps) {
  const { slug, slugManuallyEdited, handleSlugChange, reset } = useTitleSlug({ regenerateOnClear: true })
  const [metaDescription, setMetaDescription] = useState("")
  const [featuredImage, setFeaturedImage] = useState("")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [primaryCategoryId, setPrimaryCategoryId] = useState<string | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [initialSchedule, setInitialSchedule] = useState({ date: '', time: '' })
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null)
  const isOccurrence = Boolean(event?.series_id)
  const validationTitle = event?.title || 'Event'

  const { loading: saving, loadingAction: savingAction, error, setError, submit } = useCreateContent<Event>({
    entityLabel: "event",
    title: validationTitle,
    create: (publish) => {
      const payload: Record<string, unknown> = {
        slug,
        meta_description: metaDescription,
        is_published: publish,
        featured_image: featuredImage || null,
        template_id: selectedTemplateId,
      }
      // Only send blocks when the date/time changed, so a settings save never
      // overwrites content edited in the builder meanwhile.
      if (eventDate !== initialSchedule.date || eventTime !== initialSchedule.time) {
        payload.content_blocks = withSchedule(event?.content_blocks, eventDate, eventTime)
      }
      return putJson(`/api/events/${event?.id}`, payload)
    },
    // Persist category selection, then the repeat rule, after the event row is updated
    afterCreate: async (updated) => {
      const categoryResult = await bulkAssignCategoriesToContentAction({ data: { contentId: updated.id, contentType: 'event', categoryIds: selectedCategoryIds, primaryCategoryId: primaryCategoryId } })
      if (!categoryResult.success) return categoryResult.error || 'Failed to save categories'
      // Only the series anchor manages the repeat; occurrences inherit from it.
      if (!updated.series_id) {
        const recurrenceResult = await setEventRecurrenceAction({ data: { eventId: updated.id, rule: recurrenceRule } })
        if (!recurrenceResult.success) return recurrenceResult.error || 'Failed to save repeat'
      }
      return null
    },
    failureMessage: (_, publish) => publish ? 'Failed to publish event' : 'Failed to save event',
  })

  // Initialize form data and load the event's current categories
  useEffect(() => {
    let cancelled = false

    if (event) {
      // Event settings historically starts in auto-slug mode regardless of the stored slug
      reset(event.title || '', event.slug || '', { detectManualEdit: false })
      setMetaDescription(event.meta_description || '')
      setFeaturedImage(event.featured_image || '')
      setRecurrenceRule(event.recurrence_rule ?? null)

      const fields = extractEventContentFields(event.content_blocks)
      setEventDate(fields.eventDate || '')
      setEventTime(fields.eventTime || '')
      setInitialSchedule({ date: fields.eventDate || '', time: fields.eventTime || '' })

      setSelectedTemplateId(event.template_id || '')
      setTemplatesLoading(true)
      getEventTemplatesBySite({ data: { siteId: event.site_id } }).then(({ data }) => {
        if (cancelled) return
        const loadedTemplates = data || []
        setTemplates(loadedTemplates)
        setSelectedTemplateId(event.template_id || loadedTemplates.find((template) => template.is_default)?.id || loadedTemplates[0]?.id || '')
      }).finally(() => {
        if (cancelled) return
        setTemplatesLoading(false)
      })

      setSelectedCategoryIds([])
      setPrimaryCategoryId(null)
      setLoadingCategories(true)
      getContentCategoriesAction({ data: { contentId: event.id, contentType: 'event' } }).then(({ data }) => {
        if (cancelled) return
        if (data) {
          setSelectedCategoryIds(data.map((c) => c.id))
          setPrimaryCategoryId(data.find((c) => c.is_primary)?.id || data[0]?.id || null)
        }
      }).finally(() => {
        if (cancelled) return
        setLoadingCategories(false)
      })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  const handleSave = async (publish: boolean) => {
    if (!event) return
    if (!selectedTemplateId) {
      setError('Template is required')
      return
    }
    await submit(publish ? "publish" : "draft", publish, (updated) => {
      onSuccess?.(updated)
      onOpenChange(false)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSave(false)
  }

  if (!event) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form id="event-settings-form" onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title={`Configure settings for "${event.title}"`}
          description="Update this event's setup, schedule, and details."
          titleAccessory={
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${event.is_published ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium">{event.is_published ? 'Published' : 'Draft'}</span>
            </div>
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <DashboardModalFooterActions>
                <Button form="event-settings-form" type="submit" variant="outline" disabled={saving}>
                  {savingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button type="button" onClick={() => handleSave(true)} disabled={saving}>
                  {savingAction === 'publish' ? 'Saving...' : event.is_published ? 'Save' : 'Publish'}
                </Button>
              </DashboardModalFooterActions>
            </>
          }
        >
          <ModalErrorBanner error={error} />

          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Setup</DashboardModalCardTitle>
                <CardDescription>Choose a template and set the event&apos;s URL.</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="modal-template">Template</FieldLabel>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={templatesLoading || saving}>
                    <SelectTrigger id="modal-template" className="w-full">
                      <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select template"} />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Changing the template updates this event&apos;s inherited blocks after saving.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="modal-slug">Event URL</FieldLabel>
                  <Input
                    id="modal-slug"
                    value={slug || ''}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="event-url-slug"
                  />
                  <FieldDescription>
                    {slugManuallyEdited
                      ? "Custom URL slug. Clear this field to auto-generate from title again."
                      : "Auto-generated from title. You can edit this to customize the URL."}
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <FeaturedImageCard imageUrl={featuredImage} onChange={setFeaturedImage} />

            <EventScheduleCard
              date={eventDate}
              time={eventTime}
              rule={recurrenceRule}
              onDateChange={setEventDate}
              onTimeChange={setEventTime}
              onRuleChange={setRecurrenceRule}
              isOccurrence={isOccurrence}
              disabled={saving}
            />

            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Details</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                {event.site_id && (
                  <Field>
                    <CategoryPicker
                      siteId={event.site_id}
                      selectedCategoryIds={selectedCategoryIds}
                      onSelectionChange={setSelectedCategoryIds}
                      primaryCategoryId={primaryCategoryId}
                      onPrimaryCategoryChange={setPrimaryCategoryId}
                      loadingSelectedCategories={loadingCategories}
                    />
                    <FieldDescription>Assign this event to one or more categories</FieldDescription>
                  </Field>
                )}

                <MetaDescriptionField
                  value={metaDescription}
                  onChange={setMetaDescription}
                  placeholder="SEO meta description"
                  description={
                    <FieldDescription>
                      Used for SEO. Keep it under 160 characters. Currently: {metaDescription.length}/160
                    </FieldDescription>
                  }
                />
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </form>
    </Dialog>
  )
}
