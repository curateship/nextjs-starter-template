"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, Settings, Users, ArrowUp, ArrowDown, ChevronsUpDown, Mail, Filter, Zap, FileText, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSegmentsWithCounts,
  createSegment,
  updateSegment,
  deleteSegments,
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"

export default function SegmentsPage() {
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = contextPageSize
  const [total, setTotal] = useState(0)

  // Sort state
  const [sortColumn, setSortColumn] = useState<'name' | 'tags' | 'contacts' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Create/Edit modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formTags, setFormTags] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSegments()
  }, [currentSite?.id, currentPage])

  async function loadSegments() {
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
  }

  function openCreateModal() {
    setEditingSegment(null)
    setFormName("")
    setFormDescription("")
    setFormTags("")
    setModalOpen(true)
  }

  function openEditModal(segment: Segment) {
    setEditingSegment(segment)
    setFormName(segment.name)
    setFormDescription(segment.description || "")
    setFormTags(segment.filter_rules?.tags?.join(", ") || "")
    setModalOpen(true)
  }

  async function handleSave() {
    if (!currentSite?.id || !formName.trim()) return
    setSaving(true)

    const tags = formTags ? formTags.split(",").map(t => t.trim()).filter(Boolean) : []
    const filterRules = tags.length ? { tags } : {}

    if (editingSegment) {
      const { error: updateError } = await updateSegment(editingSegment.id, {
        name: formName.trim(),
        description: formDescription,
        filterRules,
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
        filterRules,
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
    }
    setMassDeleting(false)
    setMassDeleteConfirmOpen(false)
    loadSegments()
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === segments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(segments.map(s => s.id)))
    }
  }

  const toggleSort = (column: 'name' | 'tags' | 'contacts' | 'modified') => {
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

  const getSortIcon = (column: 'name' | 'tags' | 'contacts' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedSegments = [...segments].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'tags') {
      const aTag = a.filter_rules?.tags?.[0] || '\uffff'
      const bTag = b.filter_rules?.tags?.[0] || '\uffff'
      return aTag.localeCompare(bTag) * dir
    }
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

  return (
    <>
      <StickyHeader
        navLinks={[
          { label: "Newsletters", href: "/admin/newsletters", icon: Mail },
          { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users },
          { label: "Segments", href: "/admin/newsletters/segments", icon: Filter, active: true },
          { label: "Automations", href: "/admin/newsletters/automations", icon: Zap },
          { label: "Templates", href: "/admin/newsletters/templates", icon: FileText },
          { label: "Email Health", href: "/admin/newsletters/email-health", icon: Shield },
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Segments"
            extraContent={
              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white sm:mr-2" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 sm:mr-2" />
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
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
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
                  onClick={() => toggleSort('tags')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Tags</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('tags')}</span>
                </button>
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

            {/* Table Body */}
            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2 flex items-center space-x-4">
                          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
                          <div>
                            <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40" />
                            <div className="h-3 bg-muted/60 rounded animate-pulse w-24" />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <div className="h-5 bg-muted rounded-full animate-pulse w-14" />
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16" />
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
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2 flex items-center space-x-4">
                        <Checkbox
                          checked={selectedIds.has(segment.id)}
                          onCheckedChange={() => toggleSelect(segment.id)}
                          aria-label={`Select ${segment.name}`}
                        />
                        <a
                          onClick={(e) => { e.preventDefault(); openEditModal(segment) }}
                          href="#"
                          className="hover:opacity-80 transition-opacity"
                        >
                          <h4 className="font-medium text-sm hover:underline">{segment.name}</h4>
                          {segment.description && (
                            <p className="text-xs text-muted-foreground">{segment.description}</p>
                          )}
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {segment.filter_rules?.tags?.length ? (
                          segment.filter_rules.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
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
                  onPageChange={(page) => { setCurrentPage(page); setSelectedIds(new Set()) }}
                  showFirstLast={false}
                />
              </div>
            )}
          </Card>
        </div>
      </AdminLayout>

      {/* Create/Edit Segment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[840px] max-w-[95vw] p-10" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-6">
            <DialogTitle>{editingSegment ? "Edit Segment" : "Create Segment"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
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
            <div>
              <Label htmlFor="segment-tags">Filter by Tags</Label>
              <Input
                id="segment-tags"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="austin, fitness (comma-separated)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Contacts must have ALL of these tags to be included in this segment.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? "Saving..." : editingSegment ? "Update Segment" : "Create Segment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mass Delete Confirmation */}
      {massDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMassDeleteConfirmOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-[60]">
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
