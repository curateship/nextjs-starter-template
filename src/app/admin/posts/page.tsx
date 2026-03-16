"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { StickyHeader } from "@/components/admin/post-builder/layout/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import dynamic from "next/dynamic"

const CreatePostModal = dynamic(() =>
  import("@/components/admin/post-builder/layout/CreatePostModal").then(m => ({ default: m.CreatePostModal })),
  { ssr: false }
)
const PostSettingsModal = dynamic(() =>
  import("@/components/admin/post-builder/layout/PostSettingsModal").then(m => ({ default: m.PostSettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Settings, BookOpen, X, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, Globe, FileEdit } from "lucide-react"
import { cn } from "@/lib/utils"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { getSitePostsWithCategoriesAction, deletePostAction, deletePostsAction, duplicatePostAction } from "@/lib/actions/posts/post-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { useSiteContext } from "@/contexts/site-context"
import type { Post } from "@/lib/actions/posts/post-actions"

export default function PostsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePostId, setDeletePostId] = useState<string | null>(null)
  const [duplicatingPostId, setDuplicatingPostId] = useState<string | null>(null)
  const [settingsPostId, setSettingsPostId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [postCategories, setPostCategories] = useState<Record<string, CategoryInfo[]>>({})

  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set())
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<'title' | 'category' | 'status' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Load posts
  useEffect(() => {
    async function loadPosts() {
      if (!currentSite?.id) {
        setLoading(true)
        setPosts([])
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data: postsData, categories, total: postsTotal, error: postsError } = await getSitePostsWithCategoriesAction(currentSite.id, { page: currentPage, pageSize })
        if (postsError) {
          setError(postsError)
          setLoading(false)
          return
        }

        setTotal(postsTotal)
        if (postsData) {
          setPosts(postsData)
          if (categories) setPostCategories(categories)
        }
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts')
        setLoading(false)
      }
    }

    loadPosts()
  }, [currentSite?.id, currentPage])


  const handleDeletePost = async (postId: string) => {
    setPendingDeleteId(postId)
    setConfirmDialogOpen(true)
  }

  const confirmDeletePost = async () => {
    if (!pendingDeleteId) return

    const postIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)

    try {
      setDeletePostId(postIdToDelete)
      const { success, error: deleteError } = await deletePostAction(postIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }

      if (success) {
        setPosts(prev => prev.filter(post => post.id !== postIdToDelete))
      }
    } catch (err) {
      setErrorMessage('Failed to delete post')
      setErrorDialogOpen(true)
    } finally {
      setDeletePostId(null)
    }
  }

  const cancelDeletePost = () => {
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
  }

  const toggleSelectPost = (postId: string) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedPostIds.size === filteredPosts.length) {
      setSelectedPostIds(new Set())
    } else {
      setSelectedPostIds(new Set(filteredPosts.map(p => p.id)))
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedPostIds)
      const { success, error: deleteError } = await deletePostsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setPosts(prev => prev.filter(p => !selectedPostIds.has(p.id)))
        setSelectedPostIds(new Set())
      }
    } catch (err) {
      setErrorMessage('Failed to delete posts')
      setErrorDialogOpen(true)
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicatePost = async (postId: string) => {
    try {
      setDuplicatingPostId(postId)
      const originalPost = posts.find(p => p.id === postId)
      const duplicateTitle = `${originalPost?.title || 'Post'} Copy`
      
      const { data, error: duplicateError } = await duplicatePostAction(postId, duplicateTitle)
      
      if (duplicateError) {
        setErrorMessage(`Failed to duplicate post: ${duplicateError}`)
        setErrorDialogOpen(true)
        return
      }
      
      if (data) {
        setPosts(prev => [...prev, data])
      }
    } catch (err) {
      setErrorMessage('Failed to duplicate post')
      setErrorDialogOpen(true)
    } finally {
      setDuplicatingPostId(null)
    }
  }

  const getStatusBadge = (post: Post) => {
    if (post.is_published) {
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

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
  }

  // Filter posts based on status
  const filteredPosts = posts.filter(post => {
    if (filterStatus === 'published') return post.is_published
    if (filterStatus === 'draft') return !post.is_published
    return true // 'all'
  })

  const toggleSort = (column: 'title' | 'category' | 'status' | 'modified') => {
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

  const getSortIcon = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'category') {
      const aCat = postCategories[a.id]?.[0]?.title || '\uffff'
      const bCat = postCategories[b.id]?.[0]?.title || '\uffff'
      return aCat.localeCompare(bCat) * dir
    }
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts for each status
  const statusCounts = {
    all: posts.length,
    published: posts.filter(p => p.is_published).length,
    draft: posts.filter(p => !p.is_published).length
  }


  return (
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { label: "Posts", isPage: true }
        ]}
      />
      <AdminLayout>
        <div className="w-full">
          <AdminPageHeader
            title="Posts"
            primaryAction={{
              label: "Create Post",
              icon: <Plus className="h-4 w-4 mr-2" />,
              onClick: () => setShowCreateDialog(true)
            }}
            extraContent={
              <div className="flex items-center gap-3">
                {selectedPostIds.size > 0 && (
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
                        Delete ({selectedPostIds.size})
                      </>
                    )}
                  </Button>
                )}
                <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedPostIds(new Set()); setCurrentPage(1) }}>
                  <TabsList className="gap-1">
                    <TabsTrigger value="all"><List className="h-3.5 w-3.5 mr-1.5" />All ({statusCounts.all})</TabsTrigger>
                    <TabsTrigger value="published"><Globe className="h-3.5 w-3.5 mr-1.5" />Published ({statusCounts.published})</TabsTrigger>
                    <TabsTrigger value="draft"><FileEdit className="h-3.5 w-3.5 mr-1.5" />Draft ({statusCounts.draft})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            }
          />

          <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4 pl-[3px]">
                  <Checkbox
                    checked={filteredPosts.length > 0 && selectedPostIds.size === filteredPosts.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all posts"
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
                    <span>Post</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('category')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Category</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('category')}</span>
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
                // Skeleton loading state for posts
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4 pl-[3px]">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                            <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2"></div>
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="h-5 bg-muted rounded-full animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="h-6 bg-muted rounded-full animate-pulse w-20"></div>
                        </div>
                        <div>
                          <div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                          </div>
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
              ) : filteredPosts.length === 0 ? (
                <div className="p-8 text-center">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {posts.length === 0 
                      ? 'No posts found' 
                      : `No ${filterStatus === 'all' ? '' : filterStatus} posts found`
                    }
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Post
                  </Button>
                </div>
              ) : (
                sortedPosts.map((post) => (
                  <div key={post.id} className={`p-6 transition-colors ${selectedPostIds.has(post.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4 pl-[3px]">
                          <Checkbox
                            checked={selectedPostIds.has(post.id)}
                            onCheckedChange={() => toggleSelectPost(post.id)}
                            aria-label={`Select ${post.title}`}
                          />
                        <Link
                          href={`/admin/posts/builder/${post.site_id}?post=${post.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden ml-2">
                            {post.featured_image ? (
                              <img
                                src={post.featured_image}
                                alt={post.title}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <BookOpen className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{post.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              /posts/{post.slug}
                            </p>
                          </div>
                        </Link>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {postCategories[post.id]?.length ? (
                          postCategories[post.id].map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-xs">
                              {cat.title}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        {getStatusBadge(post)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(post.updated_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSettingsPostId(post.id)}
                          title="Post Settings"
                        >
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Post Settings</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a href={currentSite ? `http://${currentSite.subdomain}.localhost:3000/posts/${post.slug}` : '#'} target="_blank" rel="noopener noreferrer" title="Preview">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Preview</span>
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDuplicatePost(post.id)}
                          disabled={duplicatingPostId === post.id}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="sr-only">Duplicate</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => handleDeletePost(post.id)}
                          disabled={deletePostId === post.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
          </Card>

        {/* Create Post Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogPortal>
            <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
                 onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}>
              <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
                   style={{ width: '840px', maxWidth: '95vw' }}
                   onClick={(e) => e.stopPropagation()}>
                <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
                <DialogHeader className="mb-6">
                  <DialogTitle>Create New Post</DialogTitle>
                </DialogHeader>
                <CreatePostModal
                  onSuccess={(post, continueToBuilder) => {
                    setPosts(prev => [...prev, post])
                    setShowCreateDialog(false)
                    if (continueToBuilder && currentSite?.id) {
                      router.push(`/admin/posts/builder/${currentSite.id}?post=${post.slug}`)
                    }
                  }}
                  onCancel={() => setShowCreateDialog(false)}
                />
              </div>
            </div>
          </DialogPortal>
        </Dialog>

        {/* Post Settings Modal */}
        <PostSettingsModal 
          open={settingsPostId !== null}
          onOpenChange={(open) => setSettingsPostId(open ? settingsPostId : null)}
          post={posts.find(p => p.id === settingsPostId) || null}
          site={null}
          onSuccess={handlePostUpdated}
        />

        {/* Confirmation Dialog */}
        {confirmDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={cancelDeletePost}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete Post</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete this post? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={cancelDeletePost}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeletePost}
                  variant="destructive"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mass Delete Confirmation Dialog */}
        {massDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMassDeleteConfirmOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Delete {selectedPostIds.size} Post{selectedPostIds.size !== 1 ? 's' : ''}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete {selectedPostIds.size} post{selectedPostIds.size !== 1 ? 's' : ''}? This action cannot be undone.
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
                  Delete {selectedPostIds.size} Post{selectedPostIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error Dialog */}
        {errorDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setErrorDialogOpen(false)}
            />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Error</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMessage}
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => setErrorDialogOpen(false)}
                  variant="default"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </AdminLayout>
    </>
  )
}