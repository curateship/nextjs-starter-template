"use client"

import { useState, useEffect, useRef, use } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
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
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
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
import { Tag, Plus } from "lucide-react"

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
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [categories, setCategories] = useState<Category[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all")
  const [filterLevel, setFilterLevel] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const categorySelection = useAdminBulkSelection()
  const categorySort = useAdminSort<CategorySortColumn>()
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/categories/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load categories and assignment counts in a single server action
  const loadedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${siteId}-${currentPage}-${pageSize}`
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
          error: categoriesError
        } = await getCategoriesWithCountsAction(siteId, {
          page: currentPage,
          pageSize
        })

        if (categoriesError) {
          setError(categoriesError)
          return
        }

        setCategories(categoriesData || [])
        setTotal(categoriesTotal)
        setAssignmentCounts(counts)
      } catch (err) {
        setError("Failed to load categories")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, currentPage, pageSize])

  const handleCategoryCreated = (newCategory: Category, continueToBuilder?: boolean) => {
    setCategories((prev) => [...prev, newCategory])
    setShowCreateModal(false)
    if (continueToBuilder) {
      router.push(`/admin/categories/builder/${siteId}?category=${newCategory.slug}`)
    }
  }

  const handleCategoryDeleted = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    categorySelection.remove(categoryId)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(categorySelection.selectedIds)
      const { success, error: deleteError } = await deleteCategoriesAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        // Remove selected categories and their descendants from state
        const removedIds = new Set(ids)
        const removeDescendants = (parentIds: string[]) => {
          const children = categories.filter((c) => c.parent_id && parentIds.includes(c.parent_id))
          children.forEach((c) => removedIds.add(c.id))
          if (children.length > 0) {
            removeDescendants(children.map((c) => c.id))
          }
        }
        removeDescendants(ids)
        setCategories((prev) => prev.filter((c) => !removedIds.has(c.id)))
        categorySelection.clearSelection()
      }
    } catch (err) {
      setErrorMessage("Failed to delete categories")
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  // Compute depth level for a category
  const getDepth = (category: Category): number => {
    let depth = 0
    let current = category
    while (current.parent_id) {
      depth++
      const parent = categories.find((c) => c.id === current.parent_id)
      if (!parent) break
      current = parent
    }
    return depth
  }

  // Get unique depth levels present in the data
  const depthLevels = [...new Set(categories.map(getDepth))].sort((a, b) => a - b)

  // Filter categories
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredCategories = categories.filter((category) => {
    let statusMatch = true
    if (filterStatus === "published") statusMatch = category.is_published
    if (filterStatus === "draft") statusMatch = !category.is_published

    const levelMatch = filterLevel === "all" || getDepth(category) === Number(filterLevel)
    const parentTitle = categories.find((c) => c.id === category.parent_id)?.title ?? ""
    const searchText =
      `${category.title} ${category.slug} ${category.meta_description ?? ""} ${parentTitle}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && levelMatch && searchMatch
  })

  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (!categorySort.sortColumn) return 0
    const dir = categorySort.sortDirection === "asc" ? 1 : -1
    if (categorySort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (categorySort.sortColumn === "status") return (Number(a.is_published) - Number(b.is_published)) * dir
    if (categorySort.sortColumn === "parent") {
      const aParent = categories.find((c) => c.id === a.parent_id)?.title || "\uffff"
      const bParent = categories.find((c) => c.id === b.parent_id)?.title || "\uffff"
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

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Categories" }]}
          />

          <AdminTableShell
            title="Categories"
            icon={<Tag className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredCategories.length}
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
                <Select value={filterLevel} onValueChange={setFilterLevel}>
                  <TableRightActionsSelectTrigger aria-label="Category level filter">
                    <SelectValue placeholder="All levels" />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    {depthLevels.map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {level === 0 ? "Top-level" : `Level ${level + 1}`}
                      </SelectItem>
                    ))}
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
                  {loading ? (
                    <AdminListSkeleton columns={7} rowCount={5} actionCount={3} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
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
                      allCategories={categories}
                      assignmentCounts={assignmentCounts}
                      siteId={siteId}
                      onCategoryDeleted={handleCategoryDeleted}
                      onCategoryUpdated={(updated) => {
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
              existingCategories={categories}
              onClose={() => setShowCreateModal(false)}
              onCreated={handleCategoryCreated}
            />
          )}

          <AdminConfirmDialog
            open={massDeleteConfirmOpen}
            title={`Delete ${categorySelection.selectedCount} Categor${categorySelection.selectedCount !== 1 ? "ies" : "y"}`}
            description={`Are you sure you want to delete ${categorySelection.selectedCount} categor${categorySelection.selectedCount !== 1 ? "ies" : "y"}? Child categories will also be deleted. This action cannot be undone.`}
            disabled={massDeleting}
            confirmLabel={`Delete ${categorySelection.selectedCount} Categor${categorySelection.selectedCount !== 1 ? "ies" : "y"}`}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={confirmMassDelete}
          />

          <AdminErrorDialog
            open={errorDialogOpen}
            message={errorMessage}
            onOpenChange={setErrorDialogOpen}
          />
        </div>
      </AdminLayout>
    </>
  )
}
