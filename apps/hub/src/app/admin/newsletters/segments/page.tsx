"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { Trash2, Settings, Users, ArrowUp, ArrowDown, ChevronsUpDown, Mail, Filter, Zap, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import {
  getSegmentsWithCounts,
  createSegment,
  updateSegment,
  deleteSegments,
  getSegmentIdsAction,
  getAvailableSegmentTags,
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import {
  formatSegmentDynamicRule,
  type SegmentDynamicCondition,
  type SegmentDynamicRule,
  type SegmentDynamicRuleOperator,
  type SegmentOpenCountRuleOperator,
  type SegmentTagRuleOperator,
  type SegmentType,
} from "@/lib/newsletters/segment-rules"

type DynamicConditionForm =
  | { id: string; type: "last_engaged_within_days"; operator: SegmentDynamicRuleOperator; days: string }
  | { id: string; type: "email_open_count"; operator: SegmentOpenCountRuleOperator; times: string }
  | { id: string; type: "tag_match"; operator: SegmentTagRuleOperator; tags: string[] }

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
  return "Tags"
}

export default function SegmentsPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const [total, setTotal] = useState(0)

  // Sort state
  const [sortColumn, setSortColumn] = useState<'name' | 'contacts' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formSegmentType, setFormSegmentType] = useState<SegmentType>("static")
  const [formDynamicConditions, setFormDynamicConditions] = useState<DynamicConditionForm[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentSite?.id) {
      setAvailableTags([])
      return
    }

    getAvailableSegmentTags(currentSite.id).then(({ data }) => setAvailableTags(data || []))
  }, [currentSite?.id])

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
    const { error: deleteError } = await deleteSegments(Array.from(selectedIds))
    if (deleteError) {
      setError(deleteError)
    } else {
      setSelectedIds(new Set())
      setAllSelected(false)
    }
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadSegments()
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setAllSelected(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === segments.length) {
      setSelectedIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedIds(new Set(segments.map(s => s.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getSegmentIdsAction(currentSite.id)
    if (ids) {
      setSelectedIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setAllSelected(false)
  }

  const toggleSort = (column: 'name' | 'contacts' | 'modified') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'name' | 'contacts' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedSegments = [...segments].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'contacts') {
      const aCount = contactCounts[a.id] ?? 0
      const bCount = contactCounts[b.id] ?? 0
      return (aCount - bCount) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const invalidDynamicConditions = formSegmentType === "dynamic" && !buildDynamicRuleFromForm(formDynamicConditions)

  function addDynamicCondition(type: DynamicConditionForm["type"]) {
    if (type === "last_engaged_within_days") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "is", days: "30" }])
      return
    }

    if (type === "email_open_count") {
      setFormDynamicConditions((prev) => [...prev, { id: makeConditionId(), type, operator: "has_opened", times: "1" }])
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
      <StickyHeader navLinks={getNewsletterAdminTopNavLinks("segments")} />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[
              { label: "Newsletters", href: "/admin/newsletters" },
              { label: "Segments" },
            ]}
            actions={
              <div className="flex items-center gap-1.5 sm:gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Delete ({selectedIds.size})</span>
                      </>
                    )}
                  </Button>
                )}
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
                    checked={segments.length > 0 && selectedIds.size === segments.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all segments"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Name</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('contacts')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Contacts</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('contacts')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {segments.length > 0 && selectedIds.size === segments.length && total > segments.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{segments.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-5 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                          </div>
                        </div>
                        <div><div className="h-4 bg-muted/60 rounded animate-pulse w-12" /></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-20" /></div>
                        <div className="flex gap-1">
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => loadSegments()} variant="outline" size="sm">Try Again</Button>
                </div>
              ) : segments.length === 0 ? (
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
                  <div key={segment.id} className={`p-6 transition-colors ${selectedIds.has(segment.id) ? "bg-accent/50" : ""}`}>
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={selectedIds.has(segment.id)}
                          onCheckedChange={() => toggleSelect(segment.id)}
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
                            setSelectedIds(new Set([segment.id]))
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
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                />
                <Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(total / pageSize)}
                  onPageChange={(page) => { setCurrentPage(page); setSelectedIds(new Set()); setAllSelected(false) }}
                  showFirstLast={false}
                />
              </div>
            )}
          </Card>
        </div>
      </AdminLayout>

      {/* Create/Edit Segment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent size="admin">
          <DialogHeader>
            <DialogTitle>{editingSegment ? "Edit Segment" : "Create Segment"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 [&_label+button]:mt-2 [&_label+input]:mt-2 [&_label+textarea]:mt-2">
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
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !formName.trim() || invalidDynamicConditions}>
                {saving ? "Saving..." : editingSegment ? "Update Segment" : "Create Segment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mass Delete Confirmation */}
      {massDeleteConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-60">
            <h2 className="text-lg font-semibold mb-2">Delete Segments</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete {selectedIds.size} segment{selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMassDeleteConfirmOpen(false)} variant="outline">Cancel</Button>
              <Button onClick={handleMassDelete} variant="destructive" disabled={massDeleting}>
                {massDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
