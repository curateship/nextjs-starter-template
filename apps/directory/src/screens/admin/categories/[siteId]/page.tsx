"use client"

import { useState, useEffect, useRef, use } from "react"
import Link from "@/components/app-link"
import { useRouter, useSearchParams } from "@/lib/navigation-client"
import dynamic from "@/lib/dynamic"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"

import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useBuilderRouteSiteSync } from "@/components/admin/layout/builder/useBuilderRouteState"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminListFooter,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  getCategoriesWithCountsAction,
  deleteCategoriesAction,
  type Category
} from "@/lib/actions/categories/category-actions"
import { CategoryTree } from "@/components/admin/category-builder/layout/CategoryTree"
import { Checkbox } from "@/components/ui/checkbox"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"
import Tag from "lucide-react/dist/esm/icons/tag.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

const CreateCategoryModal = dynamic(
  () =>
    import("@/components/admin/category-builder/layout/CreateCategoryModal").then((m) => ({
      default: m.CreateCategoryModal
    })),
  { ssr: false }
)

type CategorySortColumn = "title" | "parent" | "status" | "assigned" | "modified"

export default function CategoriesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pageSize: contextPageSize } = useSiteSwitcher()
  const [categories, setCategories] = useState<Category[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [childCounts, setChildCounts] = useState<Record<string, number>>({})
  const [parentPath, setParentPath] = useState<Category[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const categorySelection = useAdminBulkSelection()
  const clearCategorySelection = categorySelection.clearSelection
  const categorySort = useAdminSort<CategorySortColumn>()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize
  const parentSlug = searchParams.get("parent") || ""
  const currentParent = parentPath[parentPath.length - 1] || null
  const currentParentId = currentParent?.id || null

  // Keep the sidebar site switcher and the route's siteId reconciled (the
  // route wins; a guarded redirect only fires when the route site is unknown).
  useBuilderRouteSiteSync({
    builderPath: "/admin/categories",
    queryParam: "parent",
    queryValue: "",
    siteId,
  })

  useEffect(() => {
    setCurrentPage(1)
    clearCategorySelection()
  }, [clearCategorySelection, parentSlug])

  // Load categories and assignment counts in a single server action
  const loadedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${siteId}-${currentPage}-${pageSize}-${parentSlug}-${reloadNonce}`
    if (loadedRef.current === key) return
    loadedRef.current = key

    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: categoriesData,
          total: categoriesTotal,
          counts,
          childCounts: categoryChildCounts,
          parentPath: categoryParentPath,
          allCategories: categoryContext,
          error: categoriesError
        } = await getCategoriesWithCountsAction({ data: { siteId: siteId, options: {
          page: currentPage,
          pageSize,
          parentSlug: parentSlug || null
        } } })

        if (categoriesError) {
          setCategories([])
          setTotal(0)
          setAssignmentCounts({})
          setChildCounts({})
          setParentPath([])
          setAllCategories([])
          setError(categoriesError)
          return
        }

        setCategories(categoriesData || [])
        setTotal(categoriesTotal)
        setAssignmentCounts(counts || {})
        setChildCounts(categoryChildCounts || {})
        setParentPath(categoryParentPath || [])
        setAllCategories(categoryContext || [])
      } catch (err) {
        setError("Failed to load categories")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, currentPage, pageSize, parentSlug, reloadNonce])

  const handleCategoryCreated = (newCategory: Category, continueToBuilder?: boolean) => {
    setAllCategories((prev) => [...prev, newCategory])
    if ((newCategory.parent_id || null) === currentParentId) {
      setCategories((prev) => [...prev, newCategory])
      setChildCounts((prev) => ({ ...prev, [newCategory.id]: 0 }))
      setTotal((prev) => prev + 1)
    }
    setShowCreateModal(false)
    showActionSuccess("Category created.")
    if (continueToBuilder) {
      router.push(`/admin/categories/builder/${siteId}?category=${newCategory.slug}`)
    }
  }

  const handleCategoryDeleted = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    setAllCategories((prev) => {
      const removedIds = new Set([categoryId])
      let changed = true
      while (changed) {
        changed = false
        prev.forEach((category) => {
          if (category.parent_id && removedIds.has(category.parent_id) && !removedIds.has(category.id)) {
            removedIds.add(category.id)
            changed = true
          }
        })
      }
      return prev.filter((category) => !removedIds.has(category.id))
    })
    setTotal((prev) => Math.max(0, prev - 1))
    categorySelection.remove(categoryId)
  }

  const confirmMassDelete = async () => {
    setMassDeleting(true)
    try {
      const ids = Array.from(categorySelection.selectedIds)
      const deletedCount = ids.length
      const { success, error: deleteError } = await deleteCategoriesAction({ data: { categoryIds: ids } })
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      if (success) {
        const removedIds = new Set(ids)
        let changed = true
        while (changed) {
          changed = false
          allCategories.forEach((category) => {
            if (category.parent_id && removedIds.has(category.parent_id) && !removedIds.has(category.id)) {
              removedIds.add(category.id)
              changed = true
            }
          })
        }
        setCategories((prev) => prev.filter((c) => !removedIds.has(c.id)))
        setAllCategories((prev) => prev.filter((c) => !removedIds.has(c.id)))
        setTotal((prev) => Math.max(0, prev - ids.length))
        categorySelection.clearSelection()
        setMassDeleteConfirmOpen(false)
        showActionSuccess(deletedCount === 1 ? "Category deleted." : "Categories deleted.")
      }
    } catch (err) {
      setErrorMessage("Failed to delete categories")
    } finally {
      setMassDeleting(false)
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredCategories = categories.filter((category) => {
    let statusMatch = true
    if (filterStatus === "published") statusMatch = category.is_published
    if (filterStatus === "draft") statusMatch = !category.is_published

    const parentTitle = currentParent?.title ?? ""
    const searchText =
      `${category.title} ${category.slug} ${category.meta_description ?? ""} ${parentTitle}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (!categorySort.sortColumn) return 0
    const dir = categorySort.sortDirection === "asc" ? 1 : -1
    if (categorySort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (categorySort.sortColumn === "status") return (Number(a.is_published) - Number(b.is_published)) * dir
    if (categorySort.sortColumn === "parent") {
      const aParent = currentParent?.title || "\uffff"
      const bParent = currentParent?.title || "\uffff"
      return aParent.localeCompare(bParent) * dir
    }
    if (categorySort.sortColumn === "assigned") {
      return ((assignmentCounts[a.id] || 0) - (assignmentCounts[b.id] || 0)) * dir
    }
    if (categorySort.sortColumn === "modified") return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  const visibleCategoryIds = sortedCategories.map((category) => category.id)

  // Get counts
  const statusCounts = {
    all: categories.length,
    published: categories.filter((c) => c.is_published).length,
    draft: categories.filter((c) => !c.is_published).length
  }

  const categoryTitle = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {parentPath.length > 0 ? (
        <Link href={`/admin/categories/${siteId}`} className="text-muted-foreground hover:text-foreground">
          Categories
        </Link>
      ) : (
        <span>Categories</span>
      )}
      {parentPath.map((parent, index) => {
        const isLast = index === parentPath.length - 1

        return (
          <span key={parent.id} className="inline-flex min-w-0 items-center gap-1.5">
            <ChevronRight className="size-3 text-muted-foreground" />
            {isLast ? (
              <span className="truncate">{parent.title}</span>
            ) : (
              <Link
                href={`/admin/categories/${siteId}?parent=${encodeURIComponent(parent.slug)}`}
                className="truncate text-muted-foreground hover:text-foreground"
              >
                {parent.title}
              </Link>
            )}
          </span>
        )
      })}
    </span>
  )

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Categories" }]}
          />

          <AdminTableShell
            error={error ? { message: error, onRetry: () => setReloadNonce((nonce) => nonce + 1) } : null}
            title={categoryTitle}
            icon={<Tag className="text-muted-foreground" />}
            count={filteredCategories.length}
            loading={loading}
            selectedCount={categorySelection.selectedCount}
            onClearSelection={categorySelection.clearSelection}
            titleActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={categorySelection.selectedCount}
              />
            }
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search categories"
                />
                <Select
                  value={filterStatus}
                  onValueChange={(value) => {
                    setFilterStatus(value as "all" | "published" | "draft")
                    categorySelection.clearSelection()
                    setCurrentPage(1)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Category status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                    <SelectItem value="published">Published ({statusCounts.published})</SelectItem>
                    <SelectItem value="draft">Draft ({statusCounts.draft})</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Category</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={
              !loading ? (
                <AdminListFooter
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  total={total}
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
                        checked={categorySelection.isPageSelected(visibleCategoryIds)}
                        onCheckedChange={() => categorySelection.togglePage(visibleCategoryIds)}
                        aria-label="Select all categories"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={categorySort.sortColumn === "title"}
                        direction={categorySort.sortDirection}
                        onClick={() => categorySort.toggleSort("title")}
                      >
                        Category
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={categorySort.sortColumn === "parent"}
                        direction={categorySort.sortDirection}
                        onClick={() => categorySort.toggleSort("parent")}
                      >
                        Parent
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={categorySort.sortColumn === "status"}
                        direction={categorySort.sortDirection}
                        onClick={() => categorySort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={categorySort.sortColumn === "assigned"}
                        direction={categorySort.sortDirection}
                        onClick={() => categorySort.toggleSort("assigned")}
                      >
                        Assigned
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={categorySort.sortColumn === "modified"}
                        direction={categorySort.sortDirection}
                        onClick={() => categorySort.toggleSort("modified")}
                      >
                        Modified
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sortedCategories.length === 0 ? (
                    <AdminListPending />
                  ) : categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Tag className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">No categories found</p>
                        <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
                          Create your first category to start organizing content. You can create nested hierarchies like
                          Country &gt; City.
                        </p>
                        <Button onClick={() => setShowCreateModal(true)} variant="outline">
                          Create First Category
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <CategoryTree
                      categories={sortedCategories}
                      allCategories={allCategories}
                      assignmentCounts={assignmentCounts}
                      childCounts={childCounts}
                      parentPath={parentPath}
                      siteId={siteId}
                      onCategoryDeleted={handleCategoryDeleted}
                      onCategoryUpdated={(updated) => {
                        showActionSuccess("Category updated.")
                        setAllCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))

                        if ((updated.parent_id || null) !== currentParentId) {
                          setCategories((prev) => prev.filter((c) => c.id !== updated.id))
                          setTotal((prev) => Math.max(0, prev - 1))
                          return
                        }

                        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                      }}
                      selectedIds={categorySelection.selectedIds}
                      onToggleSelect={categorySelection.toggleOne}
                    />
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>

          {/* Create Modal */}
          {showCreateModal && (
            <CreateCategoryModal
              siteId={siteId}
              existingCategories={allCategories}
              defaultParentId={currentParentId}
              onClose={() => setShowCreateModal(false)}
              onCreated={handleCategoryCreated}
            />
          )}

          <ConfirmDestructive
            action="delete-category"
            open={massDeleteConfirmOpen}
            title={`Delete ${categorySelection.selectedCount} Categor${categorySelection.selectedCount !== 1 ? "ies" : "y"}`}
            disabled={massDeleting}
            error={errorMessage}
            confirmLabel={`Delete ${categorySelection.selectedCount} Categor${categorySelection.selectedCount !== 1 ? "ies" : "y"}`}
            impactRequest={categorySelection.selectedCount
              ? { ids: Array.from(categorySelection.selectedIds), siteId, target: "category" }
              : undefined}
            onCancel={() => { setMassDeleteConfirmOpen(false); setErrorMessage("") }}
            onConfirm={confirmMassDelete}
          />
        </div>
      </AdminLayout>
    </>
  )
}
