"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { AlertCircle, Copy, Eye, Plus, Settings, Trash2 } from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CursorPagination } from "@/components/ui/cursor-pagination"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

export type ContentSortColumn = "title" | "category" | "status" | "modified"
export type ContentStatusFilter = "all" | "published" | "draft"
type ContentStatusCounts = Record<ContentStatusFilter, number>

interface ContentCursorListParams {
  cursor: string | null
  limit: number
  search: string
  siteId: string
  sortColumn: ContentSortColumn | null
  sortDirection: "asc" | "desc"
  status: ContentStatusFilter
}

interface ContentCursorListData<TItem extends ContentListItem> {
  rows: TItem[]
  categories: Record<string, CategoryInfo[]>
  totalCount: number
  statusCounts: ContentStatusCounts
  nextCursor: string | null
}

export type ContentListItem = {
  id: string
  site_id: string
  title: string
  slug: string
  is_published?: boolean
  featured_image?: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  updated_at: string
}

interface ContentListPageProps<TItem extends ContentListItem> {
  breadcrumbs?: Array<{ label: string; href?: string }>
  builderPath: string
  builderQueryParam?: string
  canDeleteItem?: (item: TItem) => boolean
  canSelectItem?: (item: TItem) => boolean
  columnCount?: 5 | 6
  createButtonLabel: string
  duplicateTitle: (item: TItem) => string
  emptyButtonLabel: string
  emptyDescription?: (items: TItem[], filterStatus: ContentStatusFilter) => string
  emptyTitle: (items: TItem[], filterStatus: ContentStatusFilter) => string
  formatModified?: (item: TItem) => string
  getBuilderHref?: (item: TItem) => string
  getCursorItems?: (params: ContentCursorListParams) => Promise<{ data: ContentCursorListData<TItem> | null; error: string | null }>
  getDisplayPath?: (item: TItem) => string
  getIsPublished?: (item: TItem) => boolean
  getItems?: (
    siteId: string,
    options?: { page?: number; pageSize?: number }
  ) => Promise<{ data: TItem[] | null; categories: Record<string, CategoryInfo[]>; total: number; error: string | null }>
  getPreviewHref?: (item: TItem, site: SiteWithTheme | null) => string
  getRowIcon?: (item: TItem) => ReactNode
  getSearchText?: (item: TItem, categories: CategoryInfo[]) => string
  icon: LucideIcon
  itemLabel: string
  itemLabelPlural: string
  listLabel: string
  pathPrefix: string
  previewPublishedOnly?: boolean
  renderCreateModal: (props: {
    onCancel: () => void
    onSuccess: (item: TItem, continueToBuilder?: boolean) => void
  }) => ReactNode
  renderSettingsModal: (props: {
    categories: CategoryInfo[]
    currentSite: SiteWithTheme | null
    item: TItem | null
    onOpenChange: (open: boolean) => void
    onSuccess: (item: TItem) => void
    open: boolean
  }) => ReactNode
  renderStatusBadge?: (item: TItem) => ReactNode
  searchPlaceholder: string
  showCategoryColumn?: boolean
  showClearSortAction?: boolean
  showEmptyButtonWhenFiltered?: boolean
  showNoSiteMessage?: boolean
  showPrivateBadge?: boolean
  showTotalCount?: boolean
  refreshAfterCreate?: boolean
  refreshAfterDelete?: boolean
  refreshAfterDuplicate?: boolean
  refreshAfterUpdate?: boolean
  siteId?: string
  previewSite?: SiteWithTheme | null
  sortableColumns?: Partial<Record<ContentSortColumn, boolean>>
  deleteItem: (itemId: string) => Promise<{ success: boolean; error: string | null }>
  deleteItems: (ids: string[]) => Promise<{ success: boolean; error: string | null }>
  duplicateItem: (itemId: string, title: string) => Promise<{ data: TItem | null; error: string | null }>
}

export function ContentListPage<TItem extends ContentListItem>({
  breadcrumbs,
  builderPath,
  builderQueryParam,
  canDeleteItem,
  canSelectItem,
  columnCount = 6,
  createButtonLabel,
  deleteItem,
  deleteItems,
  duplicateItem,
  duplicateTitle,
  emptyButtonLabel,
  emptyDescription,
  emptyTitle,
  formatModified,
  getBuilderHref,
  getCursorItems,
  getDisplayPath,
  getIsPublished,
  getItems,
  getPreviewHref,
  getRowIcon,
  getSearchText,
  icon: EmptyIcon,
  itemLabel,
  itemLabelPlural,
  listLabel,
  pathPrefix,
  previewPublishedOnly = false,
  renderCreateModal,
  renderSettingsModal,
  renderStatusBadge,
  searchPlaceholder,
  showCategoryColumn = true,
  showClearSortAction = false,
  showEmptyButtonWhenFiltered = false,
  showNoSiteMessage = false,
  showPrivateBadge = false,
  showTotalCount = false,
  refreshAfterCreate = false,
  refreshAfterDelete = false,
  refreshAfterDuplicate = false,
  refreshAfterUpdate = false,
  siteId,
  previewSite,
  sortableColumns,
}: ContentListPageProps<TItem>) {
  const router = useRouter()
  const { currentSite, loading: sitesLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const [items, setItems] = useState<TItem[]>([])
  const [categoriesByItemId, setCategoriesByItemId] = useState<Record<string, CategoryInfo[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsItem, setSettingsItem] = useState<TItem | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [duplicatingItemId, setDuplicatingItemId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<ContentStatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(contextPageSize)
  const [total, setTotal] = useState(0)
  const [remoteStatusCounts, setRemoteStatusCounts] = useState<ContentStatusCounts | null>(null)
  const [activeCursor, setActiveCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [hydrated, setHydrated] = useState(process.env.NODE_ENV !== "development")
  const itemSelection = useAdminBulkSelection()
  const clearItemSelection = itemSelection.clearSelection
  const itemSort = useAdminSort<ContentSortColumn>()
  const pageSize = tablePageSize
  const effectiveSiteId = siteId || currentSite?.id
  const effectiveSite = previewSite === undefined ? currentSite : previewSite
  const usesCursorPagination = Boolean(getCursorItems)
  const renderCategoryColumn = showCategoryColumn || !hydrated
  const tableColumnCount = renderCategoryColumn ? 6 : 5
  const canSort = {
    title: true,
    category: renderCategoryColumn,
    status: true,
    modified: true,
    ...sortableColumns,
  }
  const cursorSearch = usesCursorPagination ? searchQuery : ""
  const cursorStatus = usesCursorPagination ? filterStatus : "all"
  const cursorSortColumn = usesCursorPagination ? itemSort.sortColumn : null
  const cursorSortDirection = usesCursorPagination ? itemSort.sortDirection : "asc"

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    setTablePageSize(contextPageSize)
    setCurrentPage(1)
  }, [contextPageSize])

  useEffect(() => {
    if (!usesCursorPagination) return
    setActiveCursor(null)
    setCursorHistory([])
    clearItemSelection()
  }, [
    clearItemSelection,
    effectiveSiteId,
    cursorSearch,
    cursorSortColumn,
    cursorSortDirection,
    cursorStatus,
    usesCursorPagination,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadItems() {
      if (!effectiveSiteId) {
        setLoading(sitesLoading)
        setItems([])
        setCategoriesByItemId({})
        setTotal(0)
        setRemoteStatusCounts(null)
        setNextCursor(null)
        return
      }

      try {
        setLoading(true)
        setError(null)

        if (getCursorItems) {
          const { data, error: itemError } = await getCursorItems({
            siteId: effectiveSiteId,
            search: searchQuery,
            status: filterStatus,
            sortColumn: itemSort.sortColumn,
            sortDirection: itemSort.sortDirection,
            cursor: activeCursor,
            limit: pageSize,
          })

          if (cancelled) return

          if (itemError || !data) {
            setError(itemError || `Failed to load ${itemLabelPlural.toLowerCase()}`)
            setItems([])
            setCategoriesByItemId({})
            setTotal(0)
            setRemoteStatusCounts({ all: 0, published: 0, draft: 0 })
            setNextCursor(null)
            return
          }

          setItems(data.rows)
          setCategoriesByItemId(data.categories)
          setTotal(data.totalCount)
          setRemoteStatusCounts(data.statusCounts)
          setNextCursor(data.nextCursor)
          return
        }

        if (!getItems) {
          setError(`Missing ${itemLabel.toLowerCase()} list loader`)
          return
        }

        const {
          data,
          categories,
          total: itemTotal,
          error: itemError,
        } = await getItems(effectiveSiteId, {
          page: currentPage,
          pageSize,
        })

        if (cancelled) return

        if (itemError) {
          setError(itemError)
          setItems([])
          return
        }

        setItems(data || [])
        setTotal(itemTotal)
        setRemoteStatusCounts(null)
        setNextCursor(null)
        if (categories) setCategoriesByItemId(categories)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "An unexpected error occurred")
        setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadItems()

    return () => {
      cancelled = true
    }
  }, [
    activeCursor,
    currentPage,
    effectiveSiteId,
    filterStatus,
    getCursorItems,
    getItems,
    itemLabel,
    itemLabelPlural,
    itemSort.sortColumn,
    itemSort.sortDirection,
    pageSize,
    reloadToken,
    searchQuery,
    sitesLoading,
  ])

  function isPrivate(item: TItem) {
    return item.content_blocks?._settings?.is_private === true
  }

  function isPublished(item: TItem) {
    return getIsPublished ? getIsPublished(item) : item.is_published === true
  }

  function isSelectable(item: TItem) {
    return canSelectItem ? canSelectItem(item) : true
  }

  function isDeletable(item: TItem) {
    return canDeleteItem ? canDeleteItem(item) : true
  }

  function getDefaultStatusBadge(item: TItem) {
    const privateItem = showPrivateBadge && isPrivate(item)

    if (isPublished(item)) {
      return (
        <div className="flex gap-1">
          <Badge variant="default" className="bg-green-100 text-green-800">
            Published
          </Badge>
          {privateItem && (
            <Badge variant="outline" className="border-amber-200 text-amber-700">
              Private
            </Badge>
          )}
        </div>
      )
    }

    return (
      <div className="flex gap-1">
        <Badge variant="secondary">Draft</Badge>
        {privateItem && (
          <Badge variant="outline" className="border-amber-200 text-amber-700">
            Private
          </Badge>
        )}
      </div>
    )
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredItems = usesCursorPagination ? items : items.filter((item) => {
    let statusMatch = true
    if (filterStatus === "published") statusMatch = isPublished(item)
    if (filterStatus === "draft") statusMatch = !isPublished(item)

    const categories = categoriesByItemId[item.id] || []
    const categoryText = categories.map((category) => category.title).join(" ")
    const searchText = (getSearchText?.(item, categories) || `${item.title} ${item.slug} ${item.meta_description ?? ""} ${categoryText}`)
      .toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (usesCursorPagination) return 0
    if (!itemSort.sortColumn) return 0
    const dir = itemSort.sortDirection === "asc" ? 1 : -1
    if (itemSort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (itemSort.sortColumn === "category") {
      const aCategory = categoriesByItemId[a.id]?.[0]?.title || "\uffff"
      const bCategory = categoriesByItemId[b.id]?.[0]?.title || "\uffff"
      return aCategory.localeCompare(bCategory) * dir
    }
    if (itemSort.sortColumn === "status") return (Number(isPublished(a)) - Number(isPublished(b))) * dir
    if (itemSort.sortColumn === "modified") {
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    }
    return 0
  })

  const visibleItemIds = sortedItems.filter(isSelectable).map((item) => item.id)
  const localStatusCounts = {
    all: items.length,
    published: items.filter((item) => isPublished(item)).length,
    draft: items.filter((item) => !isPublished(item)).length,
  }
  const statusCounts = remoteStatusCounts || localStatusCounts

  async function confirmDeleteItem() {
    if (!pendingDeleteId) return

    const itemIdToDelete = pendingDeleteId
    setPendingDeleteId(null)
    setDeletingItemId(itemIdToDelete)

    try {
      const { success, error: deleteError } = await deleteItem(itemIdToDelete)
      if (deleteError || !success) {
        setErrorMessage(deleteError || `Failed to delete ${itemLabel.toLowerCase()}`)
        return
      }

      if (refreshAfterDelete) {
        itemSelection.remove(itemIdToDelete)
        setReloadToken((token) => token + 1)
      } else {
        setItems((current) => current.filter((item) => item.id !== itemIdToDelete))
      }
    } catch {
      setErrorMessage(`Failed to delete ${itemLabel.toLowerCase()}`)
    } finally {
      setDeletingItemId(null)
    }
  }

  async function confirmMassDelete() {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)

    try {
      const ids = Array.from(itemSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deleteItems(ids)
      if (deleteError || !success) {
        setErrorMessage(deleteError || `Failed to delete ${itemLabelPlural.toLowerCase()}`)
        return
      }

      itemSelection.clearSelection()
      if (refreshAfterDelete) {
        setReloadToken((token) => token + 1)
      } else {
        setItems((current) => current.filter((item) => !idsToDelete.has(item.id)))
      }
    } catch {
      setErrorMessage(`Failed to delete ${itemLabelPlural.toLowerCase()}`)
    } finally {
      setMassDeleting(false)
    }
  }

  async function handleDuplicate(item: TItem) {
    setDuplicatingItemId(item.id)

    try {
      const { data, error: duplicateError } = await duplicateItem(item.id, duplicateTitle(item))
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate ${itemLabel.toLowerCase()}: ${duplicateError}`)
        return
      }

      if (refreshAfterDuplicate) {
        setReloadToken((token) => token + 1)
      } else if (data) {
        setItems((current) => [...current, data])
      }
    } catch {
      setErrorMessage(`Failed to duplicate ${itemLabel.toLowerCase()}`)
    } finally {
      setDuplicatingItemId(null)
    }
  }

  function handleCreateSuccess(item: TItem, continueToBuilder?: boolean) {
    if (refreshAfterCreate) {
      setReloadToken((token) => token + 1)
    } else {
      setItems((current) => [...current, item])
    }
    setShowCreateDialog(false)
    if (continueToBuilder && effectiveSiteId) {
      router.push(`${builderPath}/${effectiveSiteId}?${builderQueryParam || itemLabel.toLowerCase()}=${item.slug}`)
    }
  }

  function handleItemUpdated(updatedItem: TItem) {
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
    if (refreshAfterUpdate) setReloadToken((token) => token + 1)
  }

  function handleNextPage() {
    if (!nextCursor) return
    setCursorHistory((current) => [...current, activeCursor])
    setActiveCursor(nextCursor)
    itemSelection.clearSelection()
  }

  function handlePreviousPage() {
    setCursorHistory((current) => {
      if (current.length === 0) return current

      const nextHistory = [...current]
      const previousCursor = nextHistory.pop() ?? null
      setActiveCursor(previousCursor)
      itemSelection.clearSelection()
      return nextHistory
    })
  }

  function renderSortHeader(column: ContentSortColumn, label: string) {
    if (!canSort[column]) return <div>{label}</div>

    return (
      <AdminSortButton
        active={itemSort.sortColumn === column}
        direction={itemSort.sortDirection}
        onClick={() => itemSort.toggleSort(column)}
      >
        {label}
      </AdminSortButton>
    )
  }

  if (!effectiveSiteId && showNoSiteMessage) {
    return (
      <AdminLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Site Selected</h3>
            <p className="text-muted-foreground">Please select a site to manage {itemLabelPlural.toLowerCase()}.</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={breadcrumbs || [{ label: listLabel }]}
          />

          <AdminTableShell
            title={listLabel}
            icon={<EmptyIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={usesCursorPagination || showTotalCount ? total : filteredItems.length}
            selectedCount={itemSelection.selectedCount}
            onClearSelection={itemSelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={itemSelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                {showClearSortAction && itemSort.sortColumn ? (
                  <TableRightActionsButton variant="outline" onClick={itemSort.resetSort}>
                    Clear Sort
                  </TableRightActionsButton>
                ) : null}
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                />
                <Select
                  value={filterStatus}
                  onValueChange={(value) => {
                    setFilterStatus(value as ContentStatusFilter)
                    itemSelection.clearSelection()
                    setCurrentPage(1)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label={`${itemLabel} status filter`}>
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                    <SelectItem value="published">Published ({statusCounts.published})</SelectItem>
                    <SelectItem value="draft">Draft ({statusCounts.draft})</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{createButtonLabel}</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading && usesCursorPagination ? (
                <div className="flex items-center justify-between bg-muted/50 p-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {items.length} items from a filtered total of {total}
                  </div>
                  <CursorPagination
                    hasPreviousPage={cursorHistory.length > 0}
                    hasNextPage={Boolean(nextCursor)}
                    onPreviousPage={handlePreviousPage}
                    onNextPage={handleNextPage}
                  />
                </div>
              ) : !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(nextPageSize) => {
                    setTablePageSize(nextPageSize)
                    setCurrentPage(1)
                    itemSelection.clearSelection()
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
                        checked={itemSelection.isPageSelected(visibleItemIds)}
                        onCheckedChange={() => itemSelection.togglePage(visibleItemIds)}
                        aria-label={`Select all ${itemLabelPlural.toLowerCase()}`}
                      />
                    </TableHead>
                    <TableHead column="main">{renderSortHeader("title", itemLabel)}</TableHead>
                    {renderCategoryColumn && <TableHead column="content">{renderSortHeader("category", "Category")}</TableHead>}
                    <TableHead column="meta">{renderSortHeader("status", "Status")}</TableHead>
                    <TableHead column="meta">{renderSortHeader("modified", "Modified")}</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton
                      columns={renderCategoryColumn ? 6 : 5}
                      rowCount={columnCount === 5 ? 4 : 5}
                      actionCount={3}
                    />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={tableColumnCount} className="h-32 text-center">
                        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
                        <h3 className="mt-4 text-lg font-semibold text-red-900">Error Loading {itemLabelPlural}</h3>
                        <p className="text-red-700">{error}</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tableColumnCount} className="h-32 text-center">
                        <EmptyIcon className="mx-auto h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold">{emptyTitle(items, filterStatus)}</h3>
                        {emptyDescription && (
                          <p className="mt-2 text-muted-foreground">{emptyDescription(items, filterStatus)}</p>
                        )}
                        {(items.length === 0 || showEmptyButtonWhenFiltered) && (
                          <Button onClick={() => setShowCreateDialog(true)} className="mt-4" variant="outline">
                            {emptyButtonLabel}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedItems.map((item) => {
                      const itemCategories = categoriesByItemId[item.id] || []
                      const previewHref = getPreviewHref
                        ? getPreviewHref(item, effectiveSite)
                        : effectiveSite
                          ? `${getSiteUrl(effectiveSite)}/${pathPrefix}/${item.slug}`
                          : "#"
                      const previewDisabled = previewPublishedOnly && !isPublished(item)
                      const rowIcon = getRowIcon?.(item)

                      return (
                        <TableRow
                          key={item.id}
                          data-state={itemSelection.selectedIds.has(item.id) ? "selected" : undefined}
                          className="group"
                        >
                          <TableCell column="select">
                            {isSelectable(item) ? (
                              <Checkbox
                                checked={itemSelection.selectedIds.has(item.id)}
                                onCheckedChange={() => itemSelection.toggleOne(item.id)}
                                aria-label={`Select ${item.title}`}
                              />
                            ) : (
                              <div className="w-4" />
                            )}
                          </TableCell>
                          <TableCell column="main">
                            <Link
                              href={getBuilderHref?.(item) || `${builderPath}/${item.site_id}?${builderQueryParam || itemLabel.toLowerCase()}=${item.slug}`}
                              className="flex min-w-0 items-center space-x-4 transition-opacity hover:opacity-80"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                                {item.featured_image ? (
                                  <img
                                    src={item.featured_image}
                                    alt={item.title}
                                    className="h-full w-full object-contain"
                                  />
                                ) : rowIcon ? (
                                  rowIcon
                                ) : (
                                  <EmptyIcon className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="truncate text-sm font-medium hover:underline sm:text-base">{item.title}</h4>
                                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                  {getDisplayPath?.(item) || `/${pathPrefix}/${item.slug}`}
                                </p>
                              </div>
                            </Link>
                          </TableCell>
                          {renderCategoryColumn && (
                            <TableCell column="content" className="align-top">
                              <div className="flex max-w-80 flex-nowrap gap-1 overflow-hidden">
                                {itemCategories.length ? (
                                  itemCategories.map((category) => (
                                    <Badge key={category.id} variant="outline" className="text-xs">
                                      {category.title}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </div>
                            </TableCell>
                          )}
                          <TableCell column="meta">{renderStatusBadge ? renderStatusBadge(item) : getDefaultStatusBadge(item)}</TableCell>
                          <TableCell column="mutedMeta">
                            {formatModified ? formatModified(item) : formatRelativeDate(item.updated_at)}
                          </TableCell>
                          <TableCell column="meta">
                            <div className="flex items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setSettingsItem(item)}
                                title={`${itemLabel} Settings`}
                              >
                                <Settings className="h-4 w-4" />
                                <span className="sr-only">{itemLabel} Settings</span>
                              </Button>
                              {previewDisabled ? (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled title={`Publish ${itemLabel.toLowerCase()} to preview`}>
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">Publish {itemLabel.toLowerCase()} to preview</span>
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                                  <a href={previewHref} target="_blank" rel="noopener noreferrer" title="Preview">
                                    <Eye className="h-4 w-4" />
                                    <span className="sr-only">Preview</span>
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleDuplicate(item)}
                                disabled={duplicatingItemId === item.id}
                                title="Duplicate"
                              >
                                <Copy className="h-4 w-4" />
                                <span className="sr-only">Duplicate</span>
                              </Button>
                              {isDeletable(item) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                                  onClick={() => setPendingDeleteId(item.id)}
                                  disabled={deletingItemId === item.id}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

          </AdminTableShell>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          {renderCreateModal({
            onSuccess: handleCreateSuccess,
            onCancel: () => setShowCreateDialog(false),
          })}
        </Dialog>

        {renderSettingsModal({
          categories: settingsItem ? categoriesByItemId[settingsItem.id] || [] : [],
          currentSite,
          item: settingsItem,
          onOpenChange: (open) => {
            if (!open) setSettingsItem(null)
          },
          onSuccess: handleItemUpdated,
          open: settingsItem !== null,
        })}

        <AdminConfirmDialog
          open={pendingDeleteId !== null}
          title={`Delete ${itemLabel}`}
          description={`Are you sure you want to delete this ${itemLabel.toLowerCase()}? This action cannot be undone.`}
          disabled={deletingItemId !== null}
          confirmLabel={deletingItemId ? "Deleting..." : "Delete"}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={confirmDeleteItem}
        />

        <AdminConfirmDialog
          open={massDeleteConfirmOpen}
          title={`Delete ${itemSelection.selectedCount} ${itemLabel}${itemSelection.selectedCount !== 1 ? "s" : ""}`}
          description={`Are you sure you want to delete ${itemSelection.selectedCount} ${itemLabel.toLowerCase()}${itemSelection.selectedCount !== 1 ? "s" : ""}? This action cannot be undone.`}
          confirmLabel={`Delete ${itemSelection.selectedCount} ${itemLabel}${itemSelection.selectedCount !== 1 ? "s" : ""}`}
          onCancel={() => setMassDeleteConfirmOpen(false)}
          onConfirm={confirmMassDelete}
        />

        <AdminErrorDialog
          open={errorMessage !== null}
          message={errorMessage ?? ""}
          onOpenChange={(open) => {
            if (!open) setErrorMessage(null)
          }}
        />
      </AdminLayout>
    </>
  )
}
