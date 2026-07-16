"use client"

import { useEffect, useState } from "react"

import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { AdminSortDirection } from "@/components/admin/layout/list"
import type {
  ContentListItem,
  ContentListPageProps,
  ContentSortColumn,
  ContentStatusCounts,
  ContentStatusFilter,
} from "@/components/admin/layout/content/contentListTypes"

interface UseContentListDataParams<TItem extends ContentListItem> {
  clearSelection: () => void
  contextPageSize: number
  effectiveSiteId: string | undefined
  getCursorItems: ContentListPageProps<TItem>["getCursorItems"]
  getIsPublished: ContentListPageProps<TItem>["getIsPublished"]
  getItems: ContentListPageProps<TItem>["getItems"]
  getSearchText: ContentListPageProps<TItem>["getSearchText"]
  itemLabel: string
  itemLabelPlural: string
  sitesLoading: boolean
  sortColumn: ContentSortColumn | null
  sortDirection: AdminSortDirection
}

export function useContentListData<TItem extends ContentListItem>({
  clearSelection,
  contextPageSize,
  effectiveSiteId,
  getCursorItems,
  getIsPublished,
  getItems,
  getSearchText,
  itemLabel,
  itemLabelPlural,
  sitesLoading,
  sortColumn,
  sortDirection,
}: UseContentListDataParams<TItem>) {
  const [items, setItems] = useState<TItem[]>([])
  const [categoriesByItemId, setCategoriesByItemId] = useState<Record<string, CategoryInfo[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<ContentStatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(contextPageSize)
  const [total, setTotal] = useState(0)
  const [remoteStatusCounts, setRemoteStatusCounts] = useState<ContentStatusCounts | null>(null)
  const [activeCursor, setActiveCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const usesCursorPagination = Boolean(getCursorItems)
  const pageSize = tablePageSize
  const cursorSearch = usesCursorPagination ? searchQuery : ""
  const cursorStatus = usesCursorPagination ? filterStatus : "all"
  const cursorSortColumn = usesCursorPagination ? sortColumn : null
  const cursorSortDirection = usesCursorPagination ? sortDirection : "asc"

  useEffect(() => {
    setTablePageSize(contextPageSize)
    setCurrentPage(1)
  }, [contextPageSize])

  useEffect(() => {
    if (!usesCursorPagination) return
    setActiveCursor(null)
    setCursorHistory([])
    clearSelection()
  }, [
    clearSelection,
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
            sortColumn,
            sortDirection,
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
    pageSize,
    reloadToken,
    searchQuery,
    sitesLoading,
    sortColumn,
    sortDirection,
  ])

  function isPublished(item: TItem) {
    return getIsPublished ? getIsPublished(item) : item.is_published === true
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
    if (!sortColumn) return 0
    const dir = sortDirection === "asc" ? 1 : -1
    if (sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (sortColumn === "category") {
      const aCategory = categoriesByItemId[a.id]?.[0]?.title || "\uffff"
      const bCategory = categoriesByItemId[b.id]?.[0]?.title || "\uffff"
      return aCategory.localeCompare(bCategory) * dir
    }
    if (sortColumn === "status") return (Number(isPublished(a)) - Number(isPublished(b))) * dir
    if (sortColumn === "modified") {
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    }
    return 0
  })

  const localStatusCounts = {
    all: items.length,
    published: items.filter((item) => isPublished(item)).length,
    draft: items.filter((item) => !isPublished(item)).length,
  }
  const statusCounts = remoteStatusCounts || localStatusCounts

  function handleFilterStatusChange(nextStatus: ContentStatusFilter) {
    setFilterStatus(nextStatus)
    clearSelection()
    setCurrentPage(1)
  }

  function handlePageSizeChange(nextPageSize: number) {
    setTablePageSize(nextPageSize)
    setCurrentPage(1)
    clearSelection()
  }

  function handleNextPage() {
    if (!nextCursor) return
    setCursorHistory((current) => [...current, activeCursor])
    setActiveCursor(nextCursor)
    clearSelection()
  }

  function handlePreviousPage() {
    setCursorHistory((current) => {
      if (current.length === 0) return current

      const nextHistory = [...current]
      const previousCursor = nextHistory.pop() ?? null
      setActiveCursor(previousCursor)
      clearSelection()
      return nextHistory
    })
  }

  return {
    items,
    categoriesByItemId,
    loading,
    error,
    filterStatus,
    searchQuery,
    currentPage,
    pageSize,
    total,
    cursorHistory,
    nextCursor,
    filteredItems,
    sortedItems,
    statusCounts,
    usesCursorPagination,
    setCurrentPage,
    setSearchQuery,
    isPublished,
    handleFilterStatusChange,
    handlePageSizeChange,
    handleNextPage,
    handlePreviousPage,
    appendItem: (item: TItem) => setItems((current) => [...current, item]),
    removeItem: (itemId: string) => setItems((current) => current.filter((item) => item.id !== itemId)),
    removeItems: (itemIds: Set<string>) => {
      setItems((current) => current.filter((item) => !itemIds.has(item.id)))
    },
    replaceItem: (updatedItem: TItem) => {
      setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
    },
    reloadItems: () => setReloadToken((token) => token + 1),
  }
}
