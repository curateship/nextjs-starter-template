import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import type { SiteDeletionImpactTarget } from "@/lib/actions/deletion-impact-contract"
import type { DestructiveAction } from "@/components/admin/layout/destructive-confirm-policy"

export type ContentSortColumn = "title" | "category" | "status" | "modified"
export type ContentStatusFilter = "all" | "published" | "draft"
export type ContentStatusCounts = Record<ContentStatusFilter, number>

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

export interface ContentListPageProps<TItem extends ContentListItem> {
  breadcrumbs?: Array<{ label: string; href?: string }>
  builderPath: string
  builderQueryParam?: string
  canDeleteItem?: (item: TItem) => boolean
  /** Why `canDeleteItem` said no, shown on the greyed-out trash. */
  deleteBlockedLabel?: string
  canSelectItem?: (item: TItem) => boolean
  columnCount?: 5 | 6
  createButtonLabel: string
  deletionImpactTarget?: SiteDeletionImpactTarget
  destructiveAction: DestructiveAction
  duplicateTitle: (item: TItem) => string
  emptyButtonLabel: string
  emptyDescription?: (items: TItem[], filterStatus: ContentStatusFilter) => string
  emptyTitle: (items: TItem[], filterStatus: ContentStatusFilter) => string
  getBuilderHref?: (item: TItem) => string
  getCursorItems?: (
    params: ContentCursorListParams
  ) => Promise<{ data: ContentCursorListData<TItem> | null; error: string | null }>
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
