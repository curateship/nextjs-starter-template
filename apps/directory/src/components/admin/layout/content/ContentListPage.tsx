"use client"

import { useEffect, useState } from "react"
import Link from "@/components/app-link"
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert.js"
import Copy from "lucide-react/dist/esm/icons/copy.js"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  AdminBulkDeleteButton,
  AdminErrorDialog,
  AdminListFooter,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { useContentListData } from "@/components/admin/layout/content/useContentListData"
import { useContentListMutations } from "@/components/admin/layout/content/useContentListMutations"
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
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import type {
  ContentListItem,
  ContentListPageProps,
  ContentSortColumn,
  ContentStatusFilter,
} from "@/components/admin/layout/content/contentListTypes"

export type { ContentListItem, ContentSortColumn }

export function ContentListPage<TItem extends ContentListItem>({
  breadcrumbs,
  builderPath,
  builderQueryParam,
  canDeleteItem,
  canSelectItem,
  columnCount = 6,
  createButtonLabel,
  deletionImpactTarget,
  deleteItem,
  deleteItems,
  destructiveAction,
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
  const { currentSite, loading: sitesLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsItem, setSettingsItem] = useState<TItem | null>(null)
  const [hydrated, setHydrated] = useState(process.env.NODE_ENV !== "development")
  const itemSelection = useAdminBulkSelection()
  const itemSort = useAdminSort<ContentSortColumn>()
  const effectiveSiteId = siteId || currentSite?.id
  const effectiveSite = previewSite === undefined ? currentSite : previewSite
  const renderCategoryColumn = showCategoryColumn || !hydrated
  const tableColumnCount = renderCategoryColumn ? 6 : 5
  const canSort = {
    title: true,
    category: renderCategoryColumn,
    status: true,
    modified: true,
    ...sortableColumns,
  }
  const contentData = useContentListData({
    clearSelection: itemSelection.clearSelection,
    contextPageSize,
    effectiveSiteId,
    getCursorItems,
    getIsPublished,
    getItems,
    getSearchText,
    itemLabel,
    itemLabelPlural,
    sitesLoading,
    sortColumn: itemSort.sortColumn,
    sortDirection: itemSort.sortDirection,
  })
  const {
    appendItem,
    categoriesByItemId,
    currentPage,
    cursorHistory,
    error,
    filterStatus,
    filteredItems,
    handleFilterStatusChange,
    handleNextPage,
    handlePageSizeChange,
    handlePreviousPage,
    isPublished,
    items,
    loading,
    nextCursor,
    pageSize,
    reloadItems,
    removeItem,
    removeItems,
    replaceItem,
    searchQuery,
    setCurrentPage,
    setSearchQuery,
    sortedItems,
    statusCounts,
    total,
    usesCursorPagination,
  } = contentData
  const contentMutations = useContentListMutations({
    appendItem,
    builderPath,
    builderQueryParam,
    closeCreateDialog: () => setShowCreateDialog(false),
    deleteItem,
    deleteItems,
    duplicateItem,
    duplicateTitle,
    effectiveSiteId,
    itemLabel,
    itemLabelPlural,
    itemSelection,
    refreshAfterCreate,
    refreshAfterDelete,
    refreshAfterDuplicate,
    refreshAfterUpdate,
    reloadItems,
    removeItem,
    removeItems,
    replaceItem,
  })
  const {
    confirmDeleteItem,
    confirmMassDelete,
    deletingItemId,
    duplicatingItemId,
    errorMessage,
    handleCreateSuccess,
    handleDuplicate,
    handleItemUpdated,
    massDeleteConfirmOpen,
    massDeleting,
    pendingDeleteId,
    setErrorMessage,
    setMassDeleteConfirmOpen,
    setPendingDeleteId,
  } = contentMutations

  useEffect(() => {
    setHydrated(true)
  }, [])

  function isPrivate(item: TItem) {
    return item.content_blocks?._settings?.is_private === true
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
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">
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

  const visibleItemIds = sortedItems.filter(isSelectable).map((item) => item.id)
  const pendingDeleteItem = items.find((item) => item.id === pendingDeleteId) ?? null

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
            loading={loading}
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
                  onValueChange={(value) => handleFilterStatusChange(value as ContentStatusFilter)}
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
                  onPageSizeChange={handlePageSizeChange}
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
                  {loading && sortedItems.length === 0 ? (
                    <AdminListPending />
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

        <ConfirmDestructive
          action={destructiveAction}
          open={pendingDeleteId !== null}
          title={`Delete ${pendingDeleteItem?.title || itemLabel}?`}
          disabled={deletingItemId !== null}
          confirmLabel={deletingItemId ? "Deleting..." : "Delete"}
          error={errorMessage}
          impactRequest={deletionImpactTarget && effectiveSiteId && pendingDeleteId
            ? { ids: [pendingDeleteId], siteId: effectiveSiteId, target: deletionImpactTarget }
            : undefined}
          onCancel={() => { setPendingDeleteId(null); setErrorMessage(null) }}
          onConfirm={confirmDeleteItem}
        />

        <ConfirmDestructive
          action={destructiveAction}
          open={massDeleteConfirmOpen}
          title={`Delete ${itemSelection.selectedCount} ${itemLabel}${itemSelection.selectedCount !== 1 ? "s" : ""}`}
          confirmLabel={`Delete ${itemSelection.selectedCount} ${itemLabel}${itemSelection.selectedCount !== 1 ? "s" : ""}`}
          disabled={massDeleting}
          error={errorMessage}
          impactRequest={deletionImpactTarget && effectiveSiteId && itemSelection.selectedCount
            ? { ids: Array.from(itemSelection.selectedIds), siteId: effectiveSiteId, target: deletionImpactTarget }
            : undefined}
          onCancel={() => { setMassDeleteConfirmOpen(false); setErrorMessage(null) }}
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
