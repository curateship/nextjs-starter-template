"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/category-builder/StickyHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSiteContext } from "@/contexts/site-context"
import { getCategoriesForSiteAction, type Category } from "@/lib/actions/categories/category-actions"
import { CreateCategoryModal } from "@/components/admin/category-builder/CreateCategoryModal"
import { CategoryTree } from "@/components/admin/category-builder/CategoryTree"
import { Tag } from "lucide-react"

export default function CategoriesPage({
  params
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')

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

        const { data: categoriesData, error: categoriesError } = await getCategoriesForSiteAction(siteId)

        if (categoriesError) {
          setError(categoriesError)
          return
        }

        setCategories(categoriesData || [])
      } catch (err) {
        setError('Failed to load categories')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId])

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories(prev => [...prev, newCategory])
    setShowCreateModal(false)
  }

  const handleCategoryDeleted = (categoryId: string) => {
    setCategories(prev => prev.filter(c => c.id !== categoryId))
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
          {loading ? (
            <div className="flex items-center justify-between my-6 mx-6">
              <div>
                <div className="h-9 w-48 bg-muted rounded animate-pulse" />
                <div className="h-4 w-64 bg-muted/60 rounded animate-pulse mt-2" />
              </div>
              <div className="h-9 w-28 bg-muted rounded animate-pulse" />
            </div>
          ) : (
            <AdminPageHeader
              title="Categories"
              subtitle="Organize your content with hierarchical categories"
              primaryAction={{
                label: "Create Category",
                onClick: () => setShowCreateModal(true)
              }}
            />
          )}

        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div className="flex items-start gap-3">
                <h3 className="text-lg font-semibold">
                  {loading ? (
                    <div className="h-5 bg-muted rounded animate-pulse w-24"></div>
                  ) : (
                    `${filteredCategories.length} categor${filteredCategories.length !== 1 ? 'ies' : 'y'} ${filterStatus === 'all' ? 'total' : filterStatus}`
                  )}
                </h3>
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
              </div>
              <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'all' | 'published' | 'draft')}>
                <TabsList className="gap-1">
                  <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                  <TabsTrigger value="published">Published ({statusCounts.published})</TabsTrigger>
                  <TabsTrigger value="draft">Draft ({statusCounts.draft})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Table Header */}
          {(loading || categories.length > 0) && (
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Category</div>
                <div>Parent</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>
          )}

          <div className="divide-y divide-muted/80">
            {loading ? (
              <div className="space-y-0">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-6 border-b border-muted/80">
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-muted rounded animate-pulse"></div>
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
                categories={filteredCategories}
                allCategories={categories}
                siteId={siteId}
                onCategoryDeleted={handleCategoryDeleted}
                onCategoryUpdated={(updated) => {
                  setCategories(prev =>
                    prev.map(c => (c.id === updated.id ? updated : c))
                  )
                }}
              />
            )}
          </div>
        </AdminCard>

        {/* Create Modal */}
        {showCreateModal && (
          <CreateCategoryModal
            siteId={siteId}
            existingCategories={categories}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleCategoryCreated}
          />
        )}
        </div>
      </AdminLayout>
    </>
  )
}
