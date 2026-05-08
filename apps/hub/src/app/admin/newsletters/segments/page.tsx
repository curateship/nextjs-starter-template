"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
} from "@/components/ui/dialog"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Trash2, Settings, Users, X } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import {
  getSegmentsWithCounts,
  createSegment,
  updateSegment,
  deleteSegments,
  getSegmentIdsAction,
  getAvailableSegmentTags,
  getSegmentsBySite,
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  formatSegmentDynamicRule,
  SEGMENT_CONTACT_STATUSES,
  type SegmentDynamicCondition,
  type SegmentContactStatus,
  type SegmentDynamicRule,
  type SegmentDynamicRuleOperator,
  type SegmentOpenCountRuleOperator,
  type SegmentTagRuleOperator,
  type SegmentType,
} from "@/lib/newsletters/segment-rules"
import { CONTACT_STATUS_OPTIONS } from "@/lib/actions/newsletters/contact-filters"

type DynamicConditionForm =
  | { id: string; type: "last_engaged_within_days"; operator: SegmentDynamicRuleOperator; days: string }
  | { id: string; type: "email_open_count"; operator: SegmentOpenCountRuleOperator; times: string }
  | { id: string; type: "tag_match"; operator: SegmentTagRuleOperator; tags: string[] }
  | { id: string; type: "status_match"; operator: SegmentDynamicRuleOperator; status: SegmentContactStatus }
  | { id: string; type: "segment_exclusion"; segmentId: string }

type SegmentSortColumn = 'name' | 'contacts' | 'modified'

function makeConditionId() {
  return `condition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mapDynamicRuleToForm(rule: SegmentDynamicRule | null | undefined): DynamicConditionForm[] {
  if (!rule) return []

  return rule.conditions.map((condition) => {
    if (condition.type === "last_engaged_within_days") {
      return {
        id: makeConditionId(),
        type: "last_engaged_within_days",
        operator: condition.operator,
        days: String(condition.days),
      }
    }

    if (condition.type === "email_open_count") {
      return {
        id: makeConditionId(),
        type: "email_open_count",
        operator: condition.operator,
        times: String(condition.times),
      }
    }

    if (condition.type === "status_match") {
      return {
        id: makeConditionId(),
        type: "status_match",
        operator: condition.operator,
        status: condition.status,
      }
    }

    if (condition.type === "segment_exclusion") {
      return {
        id: makeConditionId(),
        type: "segment_exclusion",
        segmentId: condition.segment_id,
      }
    }

    return {
      id: makeConditionId(),
      type: "tag_match",
      operator: condition.operator,
      tags: [...condition.tags],
    }
  })
}

function buildDynamicRuleFromForm(conditions: DynamicConditionForm[]): SegmentDynamicRule | null {
  const normalizedConditions: SegmentDynamicCondition[] = []

  for (const condition of conditions) {
    if (condition.type === "last_engaged_within_days") {
      const days = Number(condition.days)
      if (!Number.isInteger(days) || days < 1) return null
      normalizedConditions.push({
        type: "last_engaged_within_days",
        operator: condition.operator,
        days,
      })
      continue
    }

    if (condition.type === "email_open_count") {
      const times = Number(condition.times)
      if (!Number.isInteger(times) || times < 1) return null
      normalizedConditions.push({
        type: "email_open_count",
        operator: condition.operator,
        times,
      })
      continue
    }

    if (condition.type === "status_match") {
      if (!SEGMENT_CONTACT_STATUSES.includes(condition.status)) return null
      normalizedConditions.push({
        type: "status_match",
        operator: condition.operator,
        status: condition.status,
      })
      continue
    }

    if (condition.type === "segment_exclusion") {
      if (!condition.segmentId) return null
      normalizedConditions.push({
        type: "segment_exclusion",
        segment_id: condition.segmentId,
      })
      continue
    }

    const tags = [...new Set(condition.tags.map((tag) => tag.trim()).filter(Boolean))]
    if (!tags.length) return null
    normalizedConditions.push({
      type: "tag_match",
      operator: condition.operator,
      tags,
    })
  }

  return normalizedConditions.length ? { conditions: normalizedConditions } : null
}

function formatDynamicConditionLabel(condition: DynamicConditionForm) {
  if (condition.type === "last_engaged_within_days") return "Last engaged"
  if (condition.type === "email_open_count") return "Email opens"
  if (condition.type === "status_match") return "Status"
  if (condition.type === "segment_exclusion") return "Segment exclusion"
  return "Tags"
}

export default function SegmentsPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const segmentSelection = useAdminBulkSelection()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const [total, setTotal] = useState(0)

  // Sort state
  const segmentSort = useAdminSort<SegmentSortColumn>()

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formSegmentType, setFormSegmentType] = useState<SegmentType>("static")
  const [formDynamicConditions, setFormDynamicConditions] = useState<DynamicConditionForm[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [segmentOptions, setSegmentOptions] = useState<Segment[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentSite?.id) {
      setAvailableTags([])
      return
    }

    getAvailableSegmentTags(currentSite.id).then(({ data }) => setAvailableTags(data || []))
  }, [currentSite?.id])

  useEffect(() => {
    if (!currentSite?.id) {
      setSegmentOptions([])
      return
    }

    getSegmentsBySite(currentSite.id, { pageSize: 100 }).then(({ data }) => setSegmentOptions(data || []))
  }, [currentSite?.id, modalOpen])

  const loadSegments = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(true)
      setSegments([])
      return
    }

    try {
      setLoading(true)
      setError(null)
      const { data, total: totalCount, counts, error: loadError } = await getSegmentsWithCounts(currentSite.id, { page: currentPage, pageSize })
      if (loadError) {
        setError(loadError)
        setLoading(false)
        return
      }
      setSegments(data || [])
      setTotal(totalCount)
      setContactCounts(counts)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load segments")
      setLoading(false)
    }
  }, [currentSite?.id, currentPage, pageSize])

  useEffect(() => {
    loadSegments()
  }, [loadSegments])

  function openCreateModal() {
    setEditingSegment(null)
    setFormName("")
    setFormDescription("")
    setFormSegmentType("static")
    setFormDynamicConditions([])
    setModalOpen(true)
  }

  function openEditModal(segment: Segment) {
    setEditingSegment(segment)
    setFormName(segment.name)
    setFormDescription(segment.description || "")
    setFormSegmentType(segment.segment_type)
    setFormDynamicConditions(mapDynamicRuleToForm(segment.dynamic_rule))
    setModalOpen(true)
  }

  async function handleSave() {
    if (!currentSite?.id || !formName.trim()) return

    const dynamicRule = buildDynamicRuleFromForm(formDynamicConditions)
    if (formSegmentType === "dynamic" && !dynamicRule) {
      setError("Dynamic segments need at least one valid condition")
      return
    }

    setSaving(true)

    if (editingSegment) {
      const { error: updateError } = await updateSegment(editingSegment.id, {
        name: formName.trim(),
        description: formDescription,
        segmentType: formSegmentType,
        dynamicRule: formSegmentType === "dynamic" ? dynamicRule : null,
      })
      if (updateError) {
        setError(updateError)
        setSaving(false)
        return
      }
    } else {
      const { error: createError } = await createSegment({
        siteId: currentSite.id,
        name: formName.trim(),
        description: formDescription,
        segmentType: formSegmentType,
        dynamicRule: formSegmentType === "dynamic" ? dynamicRule : null,
      })
      if (createError) {
        setError(createError)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setModalOpen(false)
    loadSegments()
  }

  async function handleMassDelete() {
    setMassDeleting(true)
    const { error: deleteError } = await deleteSegments(Array.from(segmentSelection.selectedIds))
    if (deleteError) {
      setError(deleteError)
    } else {
      segmentSelection.clearSelection()
    }
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadSegments()
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getSegmentIdsAction(currentSite.id)
    if (ids) {
      segmentSelection.selectAll(ids)
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredSegments = segments.filter((segment) => {
    if (!normalizedSearchQuery) return true
    return `${segment.name} ${segment.description ?? ""} ${segment.segment_type}`.toLowerCase().includes(normalizedSearchQuery)
  })

  const sortedSegments = [...filteredSegments].sort((a, b) => {
    if (!segmentSort.sortColumn) return 0
    const dir = segmentSort.sortDirection === 'asc' ? 1 : -1
    if (segmentSort.sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (segmentSort.sortColumn === 'contacts') {
      const aCount = contactCounts[a.id] ?? 0
      const bCount = contactCounts[b.id] ?? 0
      return (aCount - bCount) * dir
    }
    if (segmentSort.sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const filteredSegmentIds = filteredSegments.map((segment) => segment.id)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const invalidDynamicConditions = formSegmentType === "dynamic" && !buildDynamicRuleFromForm(formDynamicConditions)
  const segmentExclusionOptions = segmentOptions.filter((segment) => segment.id !== editingSegment?.id)

  function addDynamicCondition(type: DynamicConditionForm["type"]) {
    if (type === "last_engaged_within_days") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "is", days: "30" }])
      return
    }

    if (type === "email_open_count") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "has_opened", times: "1" }])
      return
    }

    if (type === "status_match") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "is", status: "active" }])
      return
    }

    if (type === "segment_exclusion") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, segmentId: "" }])
      return
    }

    setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "includes", tags: [] }])
  }

  function updateDynamicCondition(conditionId: string, updater: (condition: DynamicConditionForm) => DynamicConditionForm) {
    setFormDynamicConditions((prev) => prev.map((condition) => (
      condition.id === conditionId ? updater(condition) : condition
    )))
  }

  function removeDynamicCondition(conditionId: string) {
    setFormDynamicConditions((prev) => prev.filter((condition) => condition.id !== conditionId))
  }

  function toggleDynamicConditionTag(conditionId: string, tag: string) {
    updateDynamicCondition(conditionId, (condition) => {
      if (condition.type !== "tag_match") return condition
      return {
        ...condition,
        tags: condition.tags.includes(tag)
          ? condition.tags.filter((existingTag) => existingTag !== tag)
          : [...condition.tags, tag],
      }
    })
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Segments" },
            ]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search segments",
            }}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                <AdminBulkDeleteButton
                  deleting={massDeleting}
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  selectedCount={segmentSelection.selectedCount}
                />
                <Button onClick={openCreateModal}>Create Segment</Button>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={segmentSelection.isPageSelected(filteredSegmentIds)}
                    onCheckedChange={() => segmentSelection.togglePage(filteredSegmentIds)}
                    aria-label="Select all segments"
                  />
                  <AdminSortButton active={segmentSort.sortColumn === 'name'} direction={segmentSort.sortDirection} onClick={() => segmentSort.toggleSort('name')}>
                    Name
                  </AdminSortButton>
                </div>
                <AdminSortButton active={segmentSort.sortColumn === 'contacts'} direction={segmentSort.sortDirection} onClick={() => segmentSort.toggleSort('contacts')}>
                  Contacts
                </AdminSortButton>
                <AdminSortButton active={segmentSort.sortColumn === 'modified'} direction={segmentSort.sortDirection} onClick={() => segmentSort.toggleSort('modified')}>
                  Modified
                </AdminSortButton>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={segmentSelection.allSelected}
              onClearSelection={segmentSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={segmentSelection.selectedCount}
              total={total}
              visibleCount={filteredSegments.length}
            />

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={5} showThumbnail={false} />
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadSegments()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : filteredSegments.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No segments yet. Create one to save reusable audience filters.
                  </p>
                  <Button onClick={openCreateModal} variant="outline">
                    Create Segment
                  </Button>
                </div>
              ) : (
                sortedSegments.map((segment) => (
                  <div key={segment.id} className={`p-6 transition-colors ${segmentSelection.selectedIds.has(segment.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={segmentSelection.selectedIds.has(segment.id)}
                          onCheckedChange={() => segmentSelection.toggleOne(segment.id)}
                          aria-label={`Select ${segment.name}`}
                        />
                        <Link
                          href={`/admin/newsletters/segments/${segment.id}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm hover:underline">{segment.name}</h4>
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              {segment.segment_type}
                            </Badge>
                          </div>
                          {segment.description && (
                            <p className="text-xs text-muted-foreground">{segment.description}</p>
                          )}
                          {segment.segment_type === "dynamic" && segment.dynamic_rule && (
                            <p className="text-xs text-muted-foreground">{formatSegmentDynamicRule(segment.dynamic_rule)}</p>
                          )}
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {contactCounts[segment.id] !== undefined
                          ? contactCounts[segment.id].toLocaleString()
                          : "—"}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(segment.updated_at)}</span>
                      </div>
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => openEditModal(segment)}
                          title="Edit Segment"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Edit Segment</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => {
                            segmentSelection.selectOnly([segment.id])
                            setMassDeleteConfirmOpen(true)
                          }}
                          title="Delete Segment"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete Segment</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={(page) => {
                  setCurrentPage(page)
                  segmentSelection.clearSelection()
                }}
              />
            )}
          </Card>
        </div>
      </AdminLayout>

      {/* Create/Edit Segment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>{editingSegment ? "Edit Segment" : "Create Segment"}</AdminModalTitle>
            <AdminModalDescription>
              Set the segment name, description, and membership rules.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
            <div>
              <Label htmlFor="segment-name">Name *</Label>
              <Input
                id="segment-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Austin Fitness Subscribers"
              />
            </div>
            <div>
              <Label htmlFor="segment-description">Description</Label>
              <Textarea
                id="segment-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description for this segment"
                className="resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-3">
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
                <div className="pt-4 space-y-4">
                  {formDynamicConditions.length ? (
                    formDynamicConditions.map((condition) => (
                      <div key={condition.id} className="rounded-2xl bg-muted/65 p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium">{formatDynamicConditionLabel(condition)}</h3>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => removeDynamicCondition(condition.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        {condition.type === "last_engaged_within_days" && (
                          <div className="space-y-2">
                            <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                              <Select
                                value={condition.operator}
                                onValueChange={(value: SegmentDynamicRuleOperator) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "last_engaged_within_days" ? { ...current, operator: value } : current
                                ))}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="is">Is</SelectItem>
                                  <SelectItem value="isnt">Isn&apos;t</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={condition.days}
                                onChange={(e) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "last_engaged_within_days" ? { ...current, days: e.target.value } : current
                                ))}
                                placeholder="Days"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Contacts are added and removed automatically based on engagement.
                            </p>
                          </div>
                        )}

                        {condition.type === "email_open_count" && (
                          <div className="space-y-2">
                            <div className="grid gap-3 sm:grid-cols-[170px,1fr]">
                              <Select
                                value={condition.operator}
                                onValueChange={(value: SegmentOpenCountRuleOperator) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "email_open_count" ? { ...current, operator: value } : current
                                ))}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="has_opened">Opened any of the last</SelectItem>
                                  <SelectItem value="hasnt_opened">Opened none of the last</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={condition.times}
                                onChange={(e) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "email_open_count" ? { ...current, times: e.target.value } : current
                                ))}
                                placeholder="Emails"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Checks every contact against the latest emails sent from this site.
                            </p>
                          </div>
                        )}

                        {condition.type === "status_match" && (
                          <div className="space-y-2">
                            <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                              <Select
                                value={condition.operator}
                                onValueChange={(value: SegmentDynamicRuleOperator) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "status_match" ? { ...current, operator: value } : current
                                ))}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="is">Is</SelectItem>
                                  <SelectItem value="isnt">Isn&apos;t</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={condition.status}
                                onValueChange={(value: SegmentContactStatus) => updateDynamicCondition(condition.id, (current) => (
                                  current.type === "status_match" ? { ...current, status: value } : current
                                ))}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONTACT_STATUS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Contacts update automatically when their subscription status changes.
                            </p>
                          </div>
                        )}

                        {condition.type === "segment_exclusion" && (
                          <div className="space-y-2">
                            <Select
                              value={condition.segmentId}
                              onValueChange={(value) => updateDynamicCondition(condition.id, (current) => (
                                current.type === "segment_exclusion" ? { ...current, segmentId: value } : current
                              ))}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose segment" />
                              </SelectTrigger>
                              <SelectContent>
                                {segmentExclusionOptions.map((segment) => (
                                  <SelectItem key={segment.id} value={segment.id}>
                                    {segment.name}
                                  </SelectItem>
                                ))}
                                {condition.segmentId && !segmentExclusionOptions.some((segment) => segment.id === condition.segmentId) && (
                                  <SelectItem value={condition.segmentId}>
                                    Missing segment
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Contacts already in this segment will be excluded.
                            </p>
                          </div>
                        )}

                        {condition.type === "tag_match" && (
                          <div className="space-y-3">
                            <Select
                              value={condition.operator}
                              onValueChange={(value: SegmentTagRuleOperator) => updateDynamicCondition(condition.id, (current) => (
                                current.type === "tag_match" ? { ...current, operator: value } : current
                              ))}
                            >
                              <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="includes">Includes</SelectItem>
                                <SelectItem value="excludes">Excludes</SelectItem>
                              </SelectContent>
                            </Select>
                            {availableTags.length ? (
                              <ScrollArea className="h-48 rounded-xl border bg-background">
                                <div className="flex flex-wrap gap-2 p-3">
                                  {availableTags.map((tag) => {
                                    const selected = condition.tags.includes(tag)
                                    return (
                                      <button
                                        key={tag}
                                        type="button"
                                        onClick={() => toggleDynamicConditionTag(condition.id, tag)}
                                        className={cn(
                                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                          selected
                                            ? "border-foreground text-foreground shadow-sm"
                                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                                        )}
                                      >
                                        {tag}
                                      </button>
                                    )
                                  })}
                                </div>
                              </ScrollArea>
                            ) : (
                              <p className="text-xs text-muted-foreground">No tags available yet.</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Contacts update automatically when their tags change.
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No conditions added yet.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline">
                          Add Condition
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => addDynamicCondition("last_engaged_within_days")}
                        >
                          Last engaged
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => addDynamicCondition("email_open_count")}>
                          Email opens
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => addDynamicCondition("status_match")}>
                          Status
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!segmentExclusionOptions.length}
                          onSelect={() => addDynamicCondition("segment_exclusion")}
                        >
                          Exclude segment
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => addDynamicCondition("tag_match")}>
                          Tags
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
              {editingSegment && editingSegment.segment_type !== formSegmentType && (
                <p className="text-xs text-muted-foreground">
                  {formSegmentType === "dynamic"
                    ? "Switching to dynamic will replace the current members with contacts matching the rule."
                    : "Switching to static will freeze the current members as a manual list."}
                </p>
              )}
            </div>
          </AdminModalBody>
          <AdminModalFooter className="sm:justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || invalidDynamicConditions}>
              {saving ? "Saving..." : editingSegment ? "Update Segment" : "Create Segment"}
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>

      <AdminConfirmDialog
        open={massDeleteConfirmOpen}
        title="Delete Segments"
        description={`Are you sure you want to delete ${segmentSelection.selectedCount} segment${segmentSelection.selectedCount !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        disabled={massDeleting}
        onCancel={() => setMassDeleteConfirmOpen(false)}
        onConfirm={handleMassDelete}
      />
    </>
  )
}
