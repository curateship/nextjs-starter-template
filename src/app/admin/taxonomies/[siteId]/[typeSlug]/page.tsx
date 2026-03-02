"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/taxonomy-builder/StickyHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSiteContext } from "@/contexts/site-context"
import { getTaxonomyTypeBySlugAction, type TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { getTaxonomiesForTypeAction, type Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"
import { CreateTaxonomyModal } from "@/components/admin/taxonomy-builder/CreateTaxonomyModal"
import { TaxonomyTree } from "@/components/admin/taxonomy-builder/TaxonomyTree"
import { Tag } from "lucide-react"

export default function TaxonomyTermsPage({
  params
}: {
  params: Promise<{ siteId: string; typeSlug: string }>
}) {
  const { siteId, typeSlug } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [taxonomyType, setTaxonomyType] = useState<TaxonomyType | null>(null)
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/taxonomies/${currentSite.id}/${typeSlug}`)
    }
  }, [currentSite, siteId, typeSlug, router])

  // Load taxonomy type and terms
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Get taxonomy type
        const { data: typeData, error: typeError } = await getTaxonomyTypeBySlugAction(siteId, typeSlug)

        if (typeError || !typeData) {
          setError(typeError || 'Taxonomy type not found')
          return
        }

        setTaxonomyType(typeData)

        // Get taxonomies for this type
        const { data: taxonomiesData, error: taxonomiesError } = await getTaxonomiesForTypeAction(
          siteId,
          typeData.id
        )

        if (taxonomiesError) {
          setError(taxonomiesError)
          return
        }

        setTaxonomies(taxonomiesData || [])
      } catch (err) {
        setError('Failed to load taxonomy data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, typeSlug])

  const handleTaxonomyCreated = (newTaxonomy: Taxonomy) => {
    setTaxonomies(prev => [...prev, newTaxonomy])
    setShowCreateModal(false)
  }

  const handleTaxonomyDeleted = (taxonomyId: string) => {
    setTaxonomies(prev => prev.filter(t => t.id !== taxonomyId))
  }

  // Compute depth level for a taxonomy
  const getDepth = (taxonomy: Taxonomy): number => {
    let depth = 0
    let current = taxonomy
    while (current.parent_id) {
      depth++
      const parent = taxonomies.find(t => t.id === current.parent_id)
      if (!parent) break
      current = parent
    }
    return depth
  }

  // Get unique depth levels present in the data
  const depthLevels = [...new Set(taxonomies.map(getDepth))].sort((a, b) => a - b)

  // Filter taxonomies
  const filteredTaxonomies = taxonomies.filter(taxonomy => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = taxonomy.is_published
    if (filterStatus === 'draft') statusMatch = !taxonomy.is_published

    // Level filter
    const levelMatch = filterLevel === 'all' || getDepth(taxonomy) === Number(filterLevel)

    return statusMatch && levelMatch
  })

  // Get counts
  const statusCounts = {
    all: taxonomies.length,
    published: taxonomies.filter(t => t.is_published).length,
    draft: taxonomies.filter(t => !t.is_published).length
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { href: `/admin/taxonomies/${siteId}`, label: "Taxonomies" },
          { label: taxonomyType?.name || '', isPage: true }
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
              title={taxonomyType?.name || ''}
              subtitle={taxonomyType?.description || ''}
              primaryAction={{
                label: "Create Term",
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
                    `${filteredTaxonomies.length} term${filteredTaxonomies.length !== 1 ? 's' : ''} ${filterStatus === 'all' ? 'total' : filterStatus}`
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

          {/* Table Header - Only show when we have taxonomies or are loading */}
          {(loading || taxonomies.length > 0) && (
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Term</div>
                <div>Parent</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>
          )}

          <div className="divide-y divide-muted/80">
            {loading ? (
              // Skeleton loading state
              <div className="space-y-0">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-6 border-b border-muted/80">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <div className="w-6 h-6 bg-muted rounded animate-pulse"></div>
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
            ) : taxonomies.length === 0 ? (
              <div className="p-8 text-center">
                <Tag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No terms found</p>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Create your first term to start organizing content.
                  {taxonomyType?.is_hierarchical && ' You can create nested hierarchies like Country > City.'}
                </p>
                <Button onClick={() => setShowCreateModal(true)} variant="outline">
                  Create First Term
                </Button>
              </div>
            ) : taxonomyType ? (
              <TaxonomyTree
                taxonomies={filteredTaxonomies}
                allTaxonomies={taxonomies}
                taxonomyType={taxonomyType}
                siteId={siteId}
                onTaxonomyDeleted={handleTaxonomyDeleted}
                onTaxonomyUpdated={(updated) => {
                  setTaxonomies(prev =>
                    prev.map(t => (t.id === updated.id ? updated : t))
                  )
                }}
              />
            ) : null}
          </div>
        </AdminCard>

        {/* Create Modal */}
      {showCreateModal && taxonomyType && (
        <CreateTaxonomyModal
          siteId={siteId}
          taxonomyType={taxonomyType}
          existingTaxonomies={taxonomies}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTaxonomyCreated}
        />
      )}
        </div>
      </AdminLayout>
    </>
  )
}
