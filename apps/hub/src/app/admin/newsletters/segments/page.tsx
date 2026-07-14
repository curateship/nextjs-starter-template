"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Badge } from "@/components/ui/badge"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Plus, RefreshCw, Trash2, Settings, Users } from "lucide-react"
import { getSegmentsWithCounts, deleteSegments, refreshDynamicSegmentsForSite } from "@/lib/actions/newsletters/segment-actions"
import type { Segment } from "@/lib/actions/newsletters/segment-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { formatSegmentDynamicRule } from "@/lib/actions/newsletters/segment-rules"
import { SegmentFormModal } from "@/components/admin/newsletter-builder/segments/SegmentFormModal"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"

type SegmentSortColumn = "name" | "contacts" | "modified"

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
  const [refreshing, setRefreshing] = useState(false)
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
      const {
        data,
        total: totalCount,
        counts,
        error: loadError
      } = await getSegmentsWithCounts(currentSite.id, {
        page: currentPage,
        pageSize
      })
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
      setMassDeleteConfirmOpen(false)
      await loadSegments()
    }
    setMassDeleting(false)
  }

  async function handleRefreshSegments() {
    if (!currentSite?.id || refreshing) return

    setRefreshing(true)
    setError(null)
    const { error: refreshError } = await refreshDynamicSegmentsForSite(currentSite.id)
    if (refreshError) {
      setError(refreshError)
    } else {
      await loadSegments()
    }
    setRefreshing(false)
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredSegments = segments.filter((segment) => {
    if (!normalizedSearchQuery) return true
    return `${segment.name} ${segment.description ?? ""} ${segment.segment_type}`
      .toLowerCase()
      .includes(normalizedSearchQuery)
  })

  const sortedSegments = [...filteredSegments].sort((a, b) => {
    if (!segmentSort.sortColumn) return 0
    const dir = segmentSort.sortDirection === "asc" ? 1 : -1
    if (segmentSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (segmentSort.sortColumn === "contacts") {
      const aCount = contactCounts[a.id] ?? 0
      const bCount = contactCounts[b.id] ?? 0
      return (aCount - bCount) * dir
    }
    if (segmentSort.sortColumn === "modified")
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const visibleSegmentIds = sortedSegments.map((segment) => segment.id)

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Newsletters", href: "/admin/newsletters" }, { label: "Segments" }]}
          />

          <AdminTableShell
            title="Segments"
            icon={<Users className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredSegments.length}
            selectedCount={segmentSelection.selectedCount}
            onClearSelection={segmentSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={segmentSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search segments"
                />
                <TableRightActionsButton
                  type="button"
                  variant="outline"
                  onClick={handleRefreshSegments}
                  disabled={!currentSite?.id || loading || refreshing}
                  title="Refresh segments"
                  aria-label="Refresh segments"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{refreshing ? "Refreshing..." : "Refresh"}</span>
                </TableRightActionsButton>
                <TableRightActionsButton onClick={openCreateModal}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Segment</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={(page) => {
                    setCurrentPage(page)
                    segmentSelection.clearSelection()
                  }}
                />
              ) : null
            }
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={segmentSelection.isPageSelected(visibleSegmentIds)}
                        onCheckedChange={() => segmentSelection.togglePage(visibleSegmentIds)}
                        aria-label="Select all segments"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={segmentSort.sortColumn === "name"}
                        direction={segmentSort.sortDirection}
                        onClick={() => segmentSort.toggleSort("name")}
                      >
                        Name
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={segmentSort.sortColumn === "contacts"}
                        direction={segmentSort.sortDirection}
                        onClick={() => segmentSort.toggleSort("contacts")}
                      >
                        Contacts
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={segmentSort.sortColumn === "modified"}
                        direction={segmentSort.sortDirection}
                        onClick={() => segmentSort.toggleSort("modified")}
                      >
                        Modified
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={5} rowCount={5} showThumbnail={false} actionCount={2} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => loadSegments()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : filteredSegments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          No segments yet. Create one to save reusable audience filters.
                        </p>
                        <Button onClick={openCreateModal} variant="outline">
                          Create Segment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSegments.map((segment) => (
                      <TableRow
                        key={segment.id}
                        data-state={segmentSelection.selectedIds.has(segment.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={segmentSelection.selectedIds.has(segment.id)}
                            onCheckedChange={() => segmentSelection.toggleOne(segment.id)}
                            aria-label={`Select ${segment.name}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <Link
                            href={`/admin/newsletters/segments/${segment.id}`}
                            className="block min-w-0 transition-opacity hover:opacity-80"
                          >
                            <div className="flex items-center gap-2">
                              <h4 className="truncate text-sm font-medium hover:underline sm:text-base">
                                {segment.name}
                              </h4>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                {segment.segment_type}
                              </Badge>
                            </div>
                            {segment.description && (
                              <p className="truncate text-xs text-muted-foreground">{segment.description}</p>
                            )}
                            {segment.segment_type === "dynamic" && segment.dynamic_rule && (
                              <p className="truncate text-xs text-muted-foreground">
                                {formatSegmentDynamicRule(segment.dynamic_rule, { maxTags: 3 })}
                              </p>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell column="mutedMeta">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            {contactCounts[segment.id] !== undefined ? contactCounts[segment.id].toLocaleString() : "—"}
                          </span>
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(segment.updated_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center">
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
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
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

      <ConfirmDestructive
        action="delete-segment"
        open={massDeleteConfirmOpen}
        title="Delete Segments"
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        disabled={massDeleting}
        error={error}
        impactRequest={currentSite?.id && segmentSelection.selectedCount
          ? { ids: Array.from(segmentSelection.selectedIds), siteId: currentSite.id, target: "segment" }
          : undefined}
        onCancel={() => { setMassDeleteConfirmOpen(false); setError(null) }}
        onConfirm={handleMassDelete}
      />
    </>
  )
}
