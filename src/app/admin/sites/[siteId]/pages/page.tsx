"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreatePageForm } from "@/components/admin/modules/sites/create-page-form"
import { Eye, Edit, Copy, Trash2, Plus, Settings, MoreHorizontal, FileText, Home } from "lucide-react"
import { getSitePagesAction, deletePageAction, duplicatePageAction } from "@/lib/actions/page-actions"
import type { Page } from "@/lib/actions/page-actions"
import type { SiteWithTheme } from "@/lib/actions/site-actions"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function SitePagesPage({ params }: PageProps) {
  const { siteId } = use(params)
  const router = useRouter()
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(null)

  // Load site and pages data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Load site data
        const siteResponse = await fetch(`/api/sites/${siteId}`)
        const siteResult = await siteResponse.json()
        if (!siteResponse.ok || siteResult.error) {
          setError(siteResult.error || 'Failed to load site data')
          return
        }
        setSite(siteResult.data)

        // Load pages data
        const { data: pagesData, error: pagesError } = await getSitePagesAction(siteId)
        if (pagesError) {
          setError(pagesError)
          return
        }
        
        if (pagesData) {
          setPages(pagesData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId])

  const handleDeletePage = async (pageId: string) => {
    if (!confirm('Are you sure you want to delete this page? This action cannot be undone.')) {
      return
    }

    try {
      setDeletePageId(pageId)
      const { success, error: deleteError } = await deletePageAction(pageId)
      
      if (deleteError) {
        alert(`Failed to delete page: ${deleteError}`)
        return
      }
      
      if (success) {
        setPages(prev => prev.filter(page => page.id !== pageId))
      }
    } catch (err) {
      alert('Failed to delete page')
    } finally {
      setDeletePageId(null)
    }
  }

  const handleDuplicatePage = async (pageId: string) => {
    try {
      setDuplicatingPageId(pageId)
      const originalPage = pages.find(p => p.id === pageId)
      const duplicateTitle = `${originalPage?.title || 'Page'} Copy`
      
      const { data, error: duplicateError } = await duplicatePageAction(pageId, duplicateTitle)
      
      if (duplicateError) {
        alert(`Failed to duplicate page: ${duplicateError}`)
        return
      }
      
      if (data) {
        setPages(prev => [...prev, data])
      }
    } catch (err) {
      alert('Failed to duplicate page')
    } finally {
      setDuplicatingPageId(null)
    }
  }

  const getStatusBadge = (page: Page) => {
    if (page.is_homepage) {
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Homepage</Badge>
    }
    if (page.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
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

  if (!site && !loading) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">Site not found or access denied</p>
            <Button asChild>
              <Link href="/admin/sites">Back to Sites</Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    )
  }
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Pages"
          subtitle={site ? `Manage pages for ${site.name}` : "Manage your site pages"}
          primaryAction={{
            label: "Create Page",
            onClick: () => setShowCreateDialog(true)
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Pages List</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {loading ? 'Loading...' : `${pages.length} page${pages.length !== 1 ? 's' : ''} found`}
                </p>
              </div>
            </div>
          </div>
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Page</div>
              <div>Status</div>
              <div>Modified</div>
              <div>Actions</div>
            </div>
          </div>
          
          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading pages...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : pages.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No pages found</p>
                <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                  Create Your First Page
                </Button>
              </div>
            ) : (
              pages.map((page) => (
                <div key={page.id} className="p-6">
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-2">
                      <Link 
                        href={`/admin/builder/${siteId}?page=${page.slug}`}
                        className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                          {page.is_homepage ? (
                            <Home className="h-6 w-6 text-blue-600" />
                          ) : (
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium hover:underline">{page.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            /{page.slug}
                          </p>
                        </div>
                      </Link>
                    </div>
                    <div>
                      {getStatusBadge(page)}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(page.updated_at)}
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
                            <Link href={`/admin/builder/${siteId}?page=${page.slug}`} className="flex items-center">
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Content
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/sites/${siteId}/pages/${page.id}/settings`} className="flex items-center">
                              <Settings className="mr-2 h-4 w-4" />
                              Page Settings
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a 
                              href={site ? `/${site.subdomain}/${page.slug}` : `#`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Preview Page
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDuplicatePage(page.id)}
                            disabled={duplicatingPageId === page.id}
                            className="flex items-center"
                          >
                            {duplicatingPageId === page.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                Duplicating...
                              </>
                            ) : (
                              <>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate Page
                              </>
                            )}
                          </DropdownMenuItem>
                          {!page.is_homepage && (
                            <DropdownMenuItem 
                              onClick={() => handleDeletePage(page.id)}
                              disabled={deletePageId === page.id}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              {deletePageId === page.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Page
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>
        
        {/* Create Page Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Page</DialogTitle>
              <DialogDescription>
                Add a new page to your site. You can customize the content after creation.
              </DialogDescription>
            </DialogHeader>
            <CreatePageForm 
              siteId={siteId}
              onSuccess={(page) => {
                setPages(prev => [...prev, page])
                setShowCreateDialog(false)
              }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  )
}