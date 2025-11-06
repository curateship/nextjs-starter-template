"use client"

import { useState, useEffect, useRef } from "react"
import { use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/taxonomy-builder/StickyHeader"
import { Button } from "@/components/ui/button"
import { useSiteContext } from "@/contexts/site-context"
import { getTaxonomyTypeBySlugAction, type TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { getTaxonomiesForTypeAction, type Taxonomy } from "@/lib/actions/taxonomies/taxonomy-actions"
import { CreateTaxonomyModal } from "@/components/admin/taxonomies/CreateTaxonomyModal"
import { TaxonomyTree } from "@/components/admin/taxonomies/TaxonomyTree"
import { ArrowLeft, Plus, FolderTree, Tag } from "lucide-react"
import Link from "next/link"

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
  const [filterHierarchy, setFilterHierarchy] = useState<'all' | 'parents' | 'children'>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

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

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isFilterOpen])

  // Filter taxonomies
  const filteredTaxonomies = taxonomies.filter(taxonomy => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = taxonomy.is_published
    if (filterStatus === 'draft') statusMatch = !taxonomy.is_published

    // Hierarchy filter
    let hierarchyMatch = true
    if (filterHierarchy === 'parents') hierarchyMatch = !taxonomy.parent_id
    if (filterHierarchy === 'children') hierarchyMatch = !!taxonomy.parent_id

    return statusMatch && hierarchyMatch
  })

  // Get counts
  const statusCounts = {
    all: taxonomies.length,
    published: taxonomies.filter(t => t.is_published).length,
    draft: taxonomies.filter(t => !t.is_published).length
  }

  const hierarchyCounts = {
    all: taxonomies.length,
    parents: taxonomies.filter(t => !t.parent_id).length,
    children: taxonomies.filter(t => !!t.parent_id).length
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
          <AdminPageHeader
            title={taxonomyType?.name || 'Loading...'}
            subtitle={taxonomyType?.description || ''}
            primaryAction={{
              label: "Create Term",
              onClick: () => setShowCreateModal(true)
            }}
          />

        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Terms</h3>
                <div className="text-sm text-muted-foreground mt-1">
                  {loading ? (
                    <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                  ) : (
                    `${filteredTaxonomies.length} term${filteredTaxonomies.length !== 1 ? 's' : ''} ${filterStatus === 'all' ? 'total' : filterStatus}`
                  )}
                </div>
              </div>
              <div className="relative" ref={filterRef}>
                <Button
                  variant="outline"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                  <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                    <div className="py-1">
                      <button
                        onClick={() => { setFilterStatus('all'); setFilterHierarchy('all'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'all' && filterHierarchy === 'all' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        All Terms ({statusCounts.all})
                      </button>
                      <button
                        onClick={() => { setFilterStatus('published'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'published' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Published ({statusCounts.published})
                      </button>
                      <button
                        onClick={() => { setFilterStatus('draft'); setIsFilterOpen(false) }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filterStatus === 'draft' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Draft ({statusCounts.draft})
                      </button>
                      {taxonomyType?.is_hierarchical && (
                        <>
                          <div className="border-t my-1"></div>
                          <button
                            onClick={() => { setFilterHierarchy('parents'); setIsFilterOpen(false) }}
                            className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                              filterHierarchy === 'parents' ? 'bg-muted font-medium' : ''
                            }`}
                          >
                            Parents Only ({hierarchyCounts.parents})
                          </button>
                          <button
                            onClick={() => { setFilterHierarchy('children'); setIsFilterOpen(false) }}
                            className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                              filterHierarchy === 'children' ? 'bg-muted font-medium' : ''
                            }`}
                          >
                            Children Only ({hierarchyCounts.children})
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
