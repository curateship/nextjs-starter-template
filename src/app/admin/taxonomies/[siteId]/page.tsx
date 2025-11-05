"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/taxonomy-builder/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSiteContext } from "@/contexts/site-context"
import { getSiteTaxonomyTypesAction, deleteTaxonomyTypeAction, type TaxonomyType } from "@/lib/actions/taxonomies/taxonomy-type-actions"
import { CreateTaxonomyTypeModal } from "@/components/admin/taxonomies/CreateTaxonomyTypeModal"
import { Tag, Settings, MoreHorizontal, Trash2 } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function TaxonomiesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const [taxonomyTypes, setTaxonomyTypes] = useState<TaxonomyType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/taxonomies/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load taxonomy types
  useEffect(() => {
    async function loadTaxonomyTypes() {
      if (!currentSite?.id) {
        setLoading(true)
        setTaxonomyTypes([])
        return
      }

      try {
        setLoading(true)
        setError(null)
        const { data, error: fetchError } = await getSiteTaxonomyTypesAction(siteId)

        if (fetchError) {
          setError(fetchError)
          setLoading(false)
          return
        }

        setTaxonomyTypes(data || [])
        setLoading(false)
      } catch (err) {
        setError('Failed to load taxonomy types')
        setLoading(false)
      }
    }

    loadTaxonomyTypes()
  }, [siteId, currentSite?.id])

  const handleTypeCreated = (newType: TaxonomyType) => {
    setTaxonomyTypes(prev => [...prev, newType])
    setShowCreateModal(false)
  }

  const handleDeleteType = async (typeId: string) => {
    setPendingDeleteId(typeId)
    setConfirmDialogOpen(true)
  }

  const confirmDeleteType = async () => {
    if (!pendingDeleteId) return

    // Close dialog immediately
    setConfirmDialogOpen(false)
    setIsDeleting(true)

    try {
      const { success, error: deleteError } = await deleteTaxonomyTypeAction(pendingDeleteId)

      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }

      if (success) {
        setTaxonomyTypes(prev => prev.filter(type => type.id !== pendingDeleteId))
      }
    } catch (err) {
      setErrorMessage('Failed to delete taxonomy type')
      setErrorDialogOpen(true)
    } finally {
      setIsDeleting(false)
      setPendingDeleteId(null)
    }
  }

  const cancelDeleteType = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { label: "Taxonomies", isPage: true }
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Taxonomies"
            subtitle="Organize your content with hierarchical categories and tags"
            primaryAction={{
              label: "Create Taxonomy Type",
              onClick: () => setShowCreateModal(true)
            }}
          />

        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Taxonomy Types</h3>
                <div className="text-sm text-muted-foreground mt-1">
                  {loading ? (
                    <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                  ) : (
                    `${taxonomyTypes.length} type${taxonomyTypes.length !== 1 ? 's' : ''} total`
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Type</div>
              <div>Structure</div>
              <div>Modified</div>
              <div>Actions</div>
            </div>
          </div>

          <div className="divide-y divide-muted/80">
            {loading ? (
              // Skeleton loading state
              <div className="space-y-0">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-6 border-b border-muted/80">
                    <div className="grid grid-cols-5 gap-4 items-center">
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
            ) : taxonomyTypes.length === 0 ? (
              <div className="p-8 text-center">
                <Tag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No taxonomy types found</p>
                <Button onClick={() => setShowCreateModal(true)} variant="outline">
                  Create Your First Taxonomy Type
                </Button>
              </div>
            ) : (
              taxonomyTypes.map((type) => (
                <div key={type.id} className="p-6">
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-2">
                      <Link
                        href={`/admin/taxonomies/${siteId}/${type.slug}`}
                        className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                          <Tag className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium hover:underline">{type.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {type.description || `Manage ${type.name.toLowerCase()} terms`}
                          </p>
                        </div>
                      </Link>
                    </div>
                    <div>
                      <Badge variant={type.is_hierarchical ? "default" : "secondary"}>
                        {type.is_hierarchical ? 'Hierarchical' : 'Flat'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(type.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/taxonomies/${siteId}/${type.slug}`} className="flex items-center">
                              <Tag className="mr-2 h-4 w-4" />
                              Manage Terms
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteType(type.id)}
                            disabled={isDeleting && pendingDeleteId === type.id}
                            className="flex items-center text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Type
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>

        {/* Create Modal */}
        {showCreateModal && (
          <CreateTaxonomyTypeModal
            siteId={siteId}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleTypeCreated}
          />
        )}

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Taxonomy Type</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <div>Are you sure you want to delete this taxonomy type?</div>
                  <div className="font-medium text-red-600">
                    This will permanently delete all terms in this taxonomy and remove them from any content they're assigned to. This action cannot be undone.
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                onClick={cancelDeleteType}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeleteType}
                variant="destructive"
              >
                Delete Type and All Terms
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Error Dialog */}
        <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Error</DialogTitle>
              <DialogDescription>
                {errorMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button
                onClick={() => setErrorDialogOpen(false)}
                variant="default"
              >
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </AdminLayout>
    </>
  )
}
