"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/category-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSiteContext } from "@/contexts/site-context"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { getAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"
import { getCategoriesForSiteAction, deleteCategoriesAction, type Category } from "@/lib/actions/categories/category-actions"
import { getCategoryAssignmentCountsAction } from "@/lib/actions/categories/category-relationship-actions"
import { CreateCategoryModal } from "@/components/admin/category-builder/layout/CreateCategoryModal"
import { CategoryTree } from "@/components/admin/category-builder/layout/CategoryTree"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, Tag, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export default function CategoriesPage({
  params
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [categories, setCategories] = useState<Category[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortColumn, setSortColumn] = useState<'title' | 'parent' | 'status' | 'assigned' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/categories/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load categories
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Load admin settings for page size
        const settingsResult = await getAdminSettingsAction()
        const ps = settingsResult.data?.settings?.dashboard_page_size ?? 50
        setPageSize(ps)

        const { data: categoriesData, total: categoriesTotal, error: categoriesError } = await getCategoriesForSiteAction(siteId, { page: currentPage, pageSize: ps })

        if (categoriesError) {
          setError(categoriesError)
          return
        }

        const cats = categoriesData || []
        setCategories(cats)
        setTotal(categoriesTotal)

        if (cats.length > 0) {
          const { data: counts } = await getCategoryAssignmentCountsAction(cats.map(c => c.id))
          if (counts) setAssignmentCounts(counts)
        }
      } catch (err) {
        setError('Failed to load categories')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, currentPage])

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories(prev => [...prev, newCategory])
    setShowCreateModal(false)
  }

  const handleCategoryDeleted = (categoryId: string) => {
    setCategories(prev => prev.filter(c => c.id !== categoryId))
  }

  const toggleSelectCategory = (categoryId: string) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedCategoryIds.size === filteredCategories.length) {
      setSelectedCategoryIds(new Set())
    } else {
      setSelectedCategoryIds(new Set(filteredCategories.map(c => c.id)))
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedCategoryIds)
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
          const children = categories.filter(c => c.parent_id && parentIds.includes(c.parent_id))
          children.forEach(c => removedIds.add(c.id))
          if (children.length > 0) {
            removeDescendants(children.map(c => c.id))
          }
        }
        removeDescendants(ids)
        setCategories(prev => prev.filter(c => !removedIds.has(c.id)))
        setSelectedCategoryIds(new Set())
      }
    } catch (err) {
      setErrorMessage('Failed to delete categories')
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
      const parent = categories.find(c => c.id === current.parent_id)
      if (!parent) break
      current = parent
    }
    return depth
  }

  // Get unique depth levels present in the data
  const depthLevels = [...new Set(categories.map(getDepth))].sort((a, b) => a - b)

  // Filter categories
  const filteredCategories = categories.filter(category => {
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = category.is_published
    if (filterStatus === 'draft') statusMatch = !category.is_published

    const levelMatch = filterLevel === 'all' || getDepth(category) === Number(filterLevel)

    return statusMatch && levelMatch
  })

  const toggleSort = (column: 'title' | 'parent' | 'status' | 'assigned' | 'modified') => {
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

  const getSortIcon = (column: 'title' | 'parent' | 'status' | 'assigned' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'parent') {
      const aParent = categories.find(c => c.id === a.parent_id)?.title || '\uffff'
      const bParent = categories.find(c => c.id === b.parent_id)?.title || '\uffff'
      return aParent.localeCompare(bParent) * dir
    }
    if (sortColumn === 'assigned') {
      return ((assignmentCounts[a.id] || 0) - (assignmentCounts[b.id] || 0)) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts
  const statusCounts = {
    all: categories.length,
    published: categories.filter(c => c.is_published).length,
    draft: categories.filter(c => !c.is_published).length
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { label: "Categories", isPage: true }
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Categories"
            subtitle="Organize your content with hierarchical categories"
            primaryAction={{
              label: "Create Category",
              onClick: () => setShowCreateModal(true)
            }}
            extraContent={
              <div className="flex items-center gap-3">
                {depthLevels.length > 1 && (
                  <Select value={filterLevel} onValueChange={setFilterLevel}>
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="All levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      {depthLevels.map(level => (
                        <SelectItem key={level} value={String(level)}>
                          {level === 0 ? 'Top-level' : `Level ${level}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedCategoryIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setMassDeleteConfirmOpen(true)}
                    disabled={massDeleting}
                  >
                    {massDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete ({selectedCategoryIds.size})
                      </>
                    )}
                  </Button>
                )}
                <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedCategoryIds(new Set()); setCurrentPage(1) }}>
                  <TabsList className="gap-1">
                    <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                    <TabsTrigger value="published">Published ({statusCounts.published})</TabsTrigger>
                    <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4 pl-[3px]">
                  <Checkbox
                    checked={filteredCategories.length > 0 && selectedCategoryIds.size === filteredCategories.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all categories"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Category</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('parent')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Parent</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('parent')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('assigned')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Assigned</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('assigned')}</span>
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

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-7 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4 pl-[3px]">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                            <div className="w-10 h-10 bg-muted rounded animate-pulse ml-2"></div>
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="h-6 bg-muted rounded-full animate-pulse w-20"></div>
                        </div>
                        <div>
                          <div className="h-6 bg-muted rounded-full animate-pulse w-20"></div>
                        </div>
                        <div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-8"></div>
                        </div>
                        <div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : categories.length === 0 ? (
                <div className="p-8 text-center">
                  <Tag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No categories found</p>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    Create your first category to start organizing content.
                    You can create nested hierarchies like Country &gt; City.
                  </p>
                  <Button onClick={() => setShowCreateModal(true)} variant="outline">
                    Create First Category
                  </Button>
                </div>
              ) : (
                <CategoryTree
                  categories={sortedCategories}
                  allCategories={categories}
                  assignmentCounts={assignmentCounts}
                  siteId={siteId}
                  onCategoryDeleted={handleCategoryDeleted}
                  onCategoryUpdated={(updated) => {
                    setCategories(prev =>
                      prev.map(c => (c.id === updated.id ? updated : c))
                    )
                  }}
                  selectedIds={selectedCategoryIds}
                  onToggleSelect={toggleSelectCategory}
                />
              )}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

        {/* Create Modal */}
        {showCreateModal && (
          <CreateCategoryModal
            siteId={siteId}
            existingCategories={categories}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCategoryCreated}
          />
        )}

        {/* Mass Delete Confirmation Dialog */}
        {massDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMassDeleteConfirmOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete {selectedCategoryIds.size} Categor{selectedCategoryIds.size !== 1 ? 'ies' : 'y'}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete {selectedCategoryIds.size} categor{selectedCategoryIds.size !== 1 ? 'ies' : 'y'}? Child categories will also be deleted. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setMassDeleteConfirmOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmMassDelete}
                  variant="destructive"
                >
                  Delete {selectedCategoryIds.size} Categor{selectedCategoryIds.size !== 1 ? 'ies' : 'y'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error Dialog */}
        {errorDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Error</h2>
              <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
              <div className="flex justify-end">
                <Button onClick={() => setErrorDialogOpen(false)} variant="default">OK</Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </AdminLayout>
    </>
  )
}
