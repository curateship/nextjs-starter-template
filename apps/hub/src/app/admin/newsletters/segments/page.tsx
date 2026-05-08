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
import { Trash2, Settings, Users } from "lucide-react"
import {
  getSegmentsWithCounts,
  deleteSegments,
  getSegmentIdsAction,
} from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { formatSegmentDynamicRule } from "@/lib/newsletters/segment-rules"
import { SegmentFormModal } from "@/components/admin/newsletter-builder/segments/SegmentFormModal"

type SegmentSortColumn = 'name' | 'contacts' | 'modified'

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
    setModalOpen(true)
  }

  function openEditModal(segment: Segment) {
    setEditingSegment(segment)
    setModalOpen(true)
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

      <SegmentFormModal
        open={modalOpen}
        onError={setError}
        onOpenChange={setModalOpen}
        onSaved={loadSegments}
        segment={editingSegment}
        siteId={currentSite?.id}
      />

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
