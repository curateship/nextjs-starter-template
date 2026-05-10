"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { AlertCircle, Copy, Eye, FileEdit, Globe, List, Plus, Settings, Trash2 } from "lucide-react"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { cn } from "@/lib/utils/tailwind"

type ContentSortColumn = "title" | "category" | "status" | "modified"
type ContentStatusFilter = "all" | "published" | "draft"

export type ContentListItem = {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  featured_image: string | null
  meta_description?: string | null
  content_blocks?: Record<string, any>
  updated_at: string
}

interface ContentListPageProps<TItem extends ContentListItem> {
  builderPath: string
  createButtonLabel: string
  duplicateTitle: (item: TItem) => string
  emptyButtonLabel: string
  emptyDescription?: (items: TItem[], filterStatus: ContentStatusFilter) => string
  emptyTitle: (items: TItem[], filterStatus: ContentStatusFilter) => string
  formatModified?: (item: TItem) => string
  getIds: (siteId: string) => Promise<{ ids: string[]; error: string | null }>
  getItems: (
    siteId: string,
    options?: { page?: number; pageSize?: number }
  ) => Promise<{ data: TItem[] | null; categories: Record<string, CategoryInfo[]>; total: number; error: string | null }>
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
  searchPlaceholder: string
  showNoSiteMessage?: boolean
  showPrivateBadge?: boolean
  deleteItem: (itemId: string) => Promise<{ success: boolean; error: string | null }>
  deleteItems: (ids: string[]) => Promise<{ success: boolean; error: string | null }>
  duplicateItem: (itemId: string, title: string) => Promise<{ data: TItem | null; error: string | null }>
}

export function ContentListPage<TItem extends ContentListItem>({
  builderPath,
  createButtonLabel,
  deleteItem,
  deleteItems,
  duplicateItem,
  duplicateTitle,
  emptyButtonLabel,
  emptyDescription,
  emptyTitle,
  formatModified,
  getIds,
  getItems,
  getSearchText,
  icon: EmptyIcon,
  itemLabel,
  itemLabelPlural,
  listLabel,
  pathPrefix,
  previewPublishedOnly = false,
  renderCreateModal,
  renderSettingsModal,
  searchPlaceholder,
  showNoSiteMessage = false,
  showPrivateBadge = false,
}: ContentListPageProps<TItem>) {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
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
  const [total, setTotal] = useState(0)
  const itemSelection = useAdminBulkSelection()
  const itemSort = useAdminSort<ContentSortColumn>()
  const pageSize = contextPageSize

  useEffect(() => {
    async function loadItems() {
      if (!currentSite?.id) {
        setLoading(true)
        setItems([])
        setCategoriesByItemId({})
        setTotal(0)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const {
          data,
          categories,
          total: itemTotal,
          error: itemError,
        } = await getItems(currentSite.id, {
          page: currentPage,
          pageSize,
        })

        if (itemError) {
          setError(itemError)
          setItems([])
          return
        }

        setItems(data || [])
        setTotal(itemTotal)
        if (categories) setCategoriesByItemId(categories)
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred")
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    loadItems()
  }, [currentPage, currentSite?.id, getItems, pageSize])

  function isPrivate(item: TItem) {
    return item.content_blocks?._settings?.is_private === true
  }

  function getStatusBadge(item: TItem) {
    const privateItem = showPrivateBadge && isPrivate(item)

    if (item.is_published) {
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
  const filteredItems = items.filter((item) => {
    let statusMatch = true
    if (filterStatus === "published") statusMatch = item.is_published
    if (filterStatus === "draft") statusMatch = !item.is_published

    const categories = categoriesByItemId[item.id] || []
    const categoryText = categories.map((category) => category.title).join(" ")
    const searchText = (getSearchText?.(item, categories) || `${item.title} ${item.slug} ${item.meta_description ?? ""} ${categoryText}`)
      .toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!itemSort.sortColumn) return 0
    const dir = itemSort.sortDirection === "asc" ? 1 : -1
    if (itemSort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (itemSort.sortColumn === "category") {
      const aCategory = categoriesByItemId[a.id]?.[0]?.title || "\uffff"
      const bCategory = categoriesByItemId[b.id]?.[0]?.title || "\uffff"
      return aCategory.localeCompare(bCategory) * dir
    }
    if (itemSort.sortColumn === "status") return (Number(a.is_published) - Number(b.is_published)) * dir
    if (itemSort.sortColumn === "modified") {
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    }
    return 0
  })

  const filteredItemIds = filteredItems.map((item) => item.id)
  const statusCounts = {
    all: items.length,
    published: items.filter((item) => item.is_published).length,
    draft: items.filter((item) => !item.is_published).length,
  }

  async function handleSelectAll() {
    if (!currentSite?.id || total === 0) return
    const { ids, error: idsError } = await getIds(currentSite.id)
    if (idsError) {
      setErrorMessage(idsError)
      return
    }
    itemSelection.selectAll(ids)
  }

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

      setItems((current) => current.filter((item) => item.id !== itemIdToDelete))
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

      setItems((current) => current.filter((item) => !idsToDelete.has(item.id)))
      itemSelection.clearSelection()
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

      if (data) setItems((current) => [...current, data])
    } catch {
      setErrorMessage(`Failed to duplicate ${itemLabel.toLowerCase()}`)
    } finally {
      setDuplicatingItemId(null)
    }
  }

  function handleCreateSuccess(item: TItem, continueToBuilder?: boolean) {
    setItems((current) => [...current, item])
    setShowCreateDialog(false)
    if (continueToBuilder && currentSite?.id) {
      router.push(`${builderPath}/${currentSite.id}?${itemLabel.toLowerCase()}=${item.slug}`)
    }
  }

  function handleItemUpdated(updatedItem: TItem) {
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
  }

  if (!currentSite && showNoSiteMessage) {
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
            items={[{ label: listLabel }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: searchPlaceholder,
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: (value) => {
                setFilterStatus(value as ContentStatusFilter)
                itemSelection.clearSelection()
                setCurrentPage(1)
              },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={itemSelection.selectedCount}
              />
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{createButtonLabel}</span>
              </Button>
            }
          />

          <Card>
            <CardTableHeader className="grid-cols-6">
              <div className="col-span-2 flex items-center space-x-4">
                <Checkbox
                  checked={itemSelection.isPageSelected(filteredItemIds)}
                  onCheckedChange={() => itemSelection.togglePage(filteredItemIds)}
                  aria-label={`Select all ${itemLabelPlural.toLowerCase()}`}
                />
                <AdminSortButton
                  active={itemSort.sortColumn === "title"}
                  direction={itemSort.sortDirection}
                  onClick={() => itemSort.toggleSort("title")}
                >
                  {itemLabel}
                </AdminSortButton>
              </div>
              <AdminSortButton
                active={itemSort.sortColumn === "category"}
                direction={itemSort.sortDirection}
                onClick={() => itemSort.toggleSort("category")}
              >
                Category
              </AdminSortButton>
              <AdminSortButton
                active={itemSort.sortColumn === "status"}
                direction={itemSort.sortDirection}
                onClick={() => itemSort.toggleSort("status")}
              >
                Status
              </AdminSortButton>
              <AdminSortButton
                active={itemSort.sortColumn === "modified"}
                direction={itemSort.sortDirection}
                onClick={() => itemSort.toggleSort("modified")}
              >
                Modified
              </AdminSortButton>
              <div>Actions</div>
            </CardTableHeader>

            <AdminSelectionBanner
              allSelected={itemSelection.allSelected}
              onClearSelection={itemSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={itemSelection.selectedCount}
              total={total}
              visibleCount={filteredItems.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton />
              ) : error ? (
                <div className="p-8 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                  <h3 className="mt-4 text-lg font-semibold text-red-900">Error Loading {itemLabelPlural}</h3>
                  <p className="text-red-700">{error}</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center">
                  <EmptyIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">{emptyTitle(items, filterStatus)}</h3>
                  {emptyDescription && (
                    <p className="mt-2 text-muted-foreground">{emptyDescription(items, filterStatus)}</p>
                  )}
                  {items.length === 0 && (
                    <Button onClick={() => setShowCreateDialog(true)} className="mt-4" variant="outline">
                      {emptyButtonLabel}
                    </Button>
                  )}
                </div>
              ) : (
                sortedItems.map((item) => {
                  const itemCategories = categoriesByItemId[item.id] || []
                  const previewHref = currentSite ? `${getSiteUrl(currentSite)}/${pathPrefix}/${item.slug}` : "#"
                  const previewDisabled = previewPublishedOnly && !item.is_published

                  return (
                    <div
                      key={item.id}
                      className={cn("p-6 transition-colors", itemSelection.selectedIds.has(item.id) && "bg-accent/50")}
                    >
                      <div className="grid grid-cols-6 items-center gap-4">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <Checkbox
                              checked={itemSelection.selectedIds.has(item.id)}
                              onCheckedChange={() => itemSelection.toggleOne(item.id)}
                              aria-label={`Select ${item.title}`}
                            />
                            <Link
                              href={`${builderPath}/${item.site_id}?${itemLabel.toLowerCase()}=${item.slug}`}
                              className="flex items-center space-x-4 transition-opacity hover:opacity-80"
                            >
                              <div className="ml-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-muted">
                                {item.featured_image ? (
                                  <img
                                    src={item.featured_image}
                                    alt={item.title}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <EmptyIcon className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium hover:underline">{item.title}</h4>
                                <p className="text-sm text-muted-foreground">/{pathPrefix}/{item.slug}</p>
                              </div>
                            </Link>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
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
                        <div>{getStatusBadge(item)}</div>
                        <div>
                          <span className="text-sm text-muted-foreground">
                            {formatModified ? formatModified(item) : formatRelativeDate(item.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                            onClick={() => setPendingDeleteId(item.id)}
                            disabled={deletingItemId === item.id}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={setCurrentPage}
              />
            )}
          </Card>
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
