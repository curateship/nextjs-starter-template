"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  createSegment,
  getAvailableSegmentTags,
  getSegmentsBySite,
  updateSegment,
  type Segment,
} from "@/lib/actions/newsletters/segment-actions"
import type { SegmentType } from "@/lib/actions/newsletters/segment-rules"
import {
  buildDynamicRuleFromForm,
  mapDynamicRuleToForm,
  SegmentDynamicConditionEditor,
  type DynamicConditionForm,
} from "@/components/admin/newsletter-builder/segments/SegmentDynamicConditionEditor"

type SegmentFormModalProps = {
  onError: (message: string) => void
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  open: boolean
  segment: Segment | null
  siteId?: string | null
}

export function SegmentFormModal({
  onError,
  onOpenChange,
  onSaved,
  open,
  segment,
  siteId,
}: SegmentFormModalProps) {
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formSegmentType, setFormSegmentType] = useState<SegmentType>("static")
  const [formDynamicConditions, setFormDynamicConditions] = useState<DynamicConditionForm[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [segmentOptions, setSegmentOptions] = useState<Segment[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    setFormName(segment?.name ?? "")
    setFormDescription(segment?.description ?? "")
    setFormSegmentType(segment?.segment_type ?? "static")
    setFormDynamicConditions(mapDynamicRuleToForm(segment?.dynamic_rule))
  }, [open, segment])

  useEffect(() => {
    if (!open || !siteId) {
      setAvailableTags([])
      setSegmentOptions([])
      return
    }

    getAvailableSegmentTags({ data: { siteId: siteId } }).then(({ data }) => setAvailableTags(data || []))
    getSegmentsBySite({ data: { siteId: siteId, options: { pageSize: 100 } } }).then(({ data }) => setSegmentOptions(data || []))
  }, [open, siteId])

  const invalidDynamicConditions = formSegmentType === "dynamic" && !buildDynamicRuleFromForm(formDynamicConditions)
  const segmentExclusionOptions = segmentOptions.filter((option) => option.id !== segment?.id)

  async function handleSave() {
    if (!siteId || !formName.trim()) return

    const dynamicRule = buildDynamicRuleFromForm(formDynamicConditions)
    if (formSegmentType === "dynamic" && !dynamicRule) {
      onError("Dynamic segments need at least one valid condition")
      return
    }

    setSaving(true)

    try {
      if (segment) {
        const { error } = await updateSegment({ data: { segmentId: segment.id, updates: {
          name: formName.trim(),
          description: formDescription,
          segmentType: formSegmentType,
          dynamicRule: formSegmentType === "dynamic" ? dynamicRule : null,
        } } })
        if (error) {
          onError(error)
          return
        }
      } else {
        const { error } = await createSegment({ data: { input: {
          siteId,
          name: formName.trim(),
          description: formDescription,
          segmentType: formSegmentType,
          dynamicRule: formSegmentType === "dynamic" ? dynamicRule : null,
        } } })
        if (error) {
          onError(error)
          return
        }
      }

      onOpenChange(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        title={segment ? "Edit Segment" : "Create Segment"}
        description="Set the segment name, description, and membership rules."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || invalidDynamicConditions}>
              {saving ? "Saving..." : segment ? "Update Segment" : "Create Segment"}
            </Button>
          </>
        }
      >
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Segment details</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="segment-name">Name *</FieldLabel>
                <Input
                  id="segment-name"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="e.g. Austin Fitness Subscribers"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="segment-description">Description</FieldLabel>
                <Textarea
                  id="segment-description"
                  value={formDescription}
                  onChange={(event) => setFormDescription(event.target.value)}
                  placeholder="Optional description for this segment"
                  className="resize-none"
                  rows={2}
                />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Membership type</DashboardModalCardTitle>
              <CardDescription>Choose how contacts are added to this segment.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-fit gap-x-6 gap-y-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={formSegmentType === "static"}
                    onCheckedChange={(checked) => {
                      if (checked !== true) return
                      setFormSegmentType("static")
                      setFormDynamicConditions([])
                    }}
                  />
                  <div className="space-y-1 pt-0.5">
                    <span className="block text-sm font-medium leading-none">Static</span>
                    <p className="text-xs text-muted-foreground">
                      Manual segment membership.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={formSegmentType === "dynamic"}
                    onCheckedChange={(checked) => {
                      if (checked !== true) return
                      setFormSegmentType("dynamic")
                    }}
                  />
                  <div className="space-y-1 pt-0.5">
                    <span className="block text-sm font-medium leading-none">Dynamic</span>
                    <p className="text-xs text-muted-foreground">
                      Membership updates from conditions.
                    </p>
                  </div>
                </label>
              </div>

              {formSegmentType === "dynamic" && (
                <SegmentDynamicConditionEditor
                  availableTags={availableTags}
                  conditions={formDynamicConditions}
                  onChange={setFormDynamicConditions}
                  segmentOptions={segmentExclusionOptions}
                />
              )}

              {segment && segment.segment_type !== formSegmentType && (
                <p className="text-xs text-muted-foreground">
                  {formSegmentType === "dynamic"
                    ? "Switching to dynamic will replace the current members with contacts matching the rule."
                    : "Switching to static will freeze the current members as a manual list."}
                </p>
              )}
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}
