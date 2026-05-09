"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card, CardTableHeader } from "@/components/ui/card"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"

import dynamic from "next/dynamic"

const CreatePostModal = dynamic(
  () => import("@/components/admin/post-builder/layout/CreatePostModal").then((m) => ({ default: m.CreatePostModal })),
  { ssr: false }
)
const PostSettingsModal = dynamic(
  () =>
    import("@/components/admin/post-builder/layout/PostSettingsModal").then((m) => ({ default: m.PostSettingsModal })),
  { ssr: false }
)
import { Eye, Copy, Trash2, Settings, BookOpen, Plus, List, Globe, FileEdit } from "lucide-react"
import {
  getSitePostsWithCategoriesAction,
  deletePostAction,
  deletePostsAction,
  duplicatePostAction,
  getPostIdsAction
} from "@/lib/actions/posts/post-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import type { Post } from "@/lib/actions/posts/post-actions"

type PostSortColumn = "title" | "category" | "status" | "modified"

export default function PostsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletePostId, setDeletePostId] = useState<string | null>(null)
  const [duplicatingPostId, setDuplicatingPostId] = useState<string | null>(null)
  const [settingsPostId, setSettingsPostId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [postCategories, setPostCategories] = useState<Record<string, CategoryInfo[]>>({})
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const postSelection = useAdminBulkSelection()
  const postSort = useAdminSort<PostSortColumn>()
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Load posts
  useEffect(() => {
    async function loadPosts() {
      if (!currentSite?.id) {
        setLoading(true)
        setPosts([])
        setPostCategories({})
        setTotal(0)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const {
          data: postsData,
          categories,
          total: postsTotal,
          error: postsError
        } = await getSitePostsWithCategoriesAction(currentSite.id, {
          page: currentPage,
          pageSize
        })
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
        setError(err instanceof Error ? err.message : "Failed to load posts")
        setLoading(false)
      }
    }

    loadPosts()
  }, [currentSite?.id, currentPage, pageSize])

  const handleDeletePost = async (postId: string) => {
    setPendingDeleteId(postId)
  }

  const confirmDeletePost = async () => {
    if (!pendingDeleteId) return

    const postIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setPendingDeleteId(null)

    try {
      setDeletePostId(postIdToDelete)
      const { success, error: deleteError } = await deletePostAction(postIdToDelete)

      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }

      if (success) {
        setPosts((prev) => prev.filter((post) => post.id !== postIdToDelete))
      }
    } catch (err) {
      setErrorMessage("Failed to delete post")
    } finally {
      setDeletePostId(null)
    }
  }

  const cancelDeletePost = () => {
    setPendingDeleteId(null)
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getPostIdsAction(currentSite.id)
    if (ids) {
      postSelection.selectAll(ids)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(postSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deletePostsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError)
        return
      }
      if (success) {
        setPosts((prev) => prev.filter((p) => !idsToDelete.has(p.id)))
        postSelection.clearSelection()
      }
    } catch (err) {
      setErrorMessage("Failed to delete posts")
    } finally {
      setMassDeleting(false)
    }
  }

  const handleDuplicatePost = async (postId: string) => {
    try {
      setDuplicatingPostId(postId)
      const originalPost = posts.find((p) => p.id === postId)
      const duplicateTitle = `${originalPost?.title || "Post"} Copy`

      const { data, error: duplicateError } = await duplicatePostAction(postId, duplicateTitle)

      if (duplicateError) {
        setErrorMessage(`Failed to duplicate post: ${duplicateError}`)
        return
      }

      if (data) {
        setPosts((prev) => [...prev, data])
      }
    } catch (err) {
      setErrorMessage("Failed to duplicate post")
    } finally {
      setDuplicatingPostId(null)
    }
  }

  const getStatusBadge = (post: Post) => {
    if (post.is_published) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          Published
        </Badge>
      )
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)))
  }

  // Filter posts based on status
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredPosts = posts.filter((post) => {
    let statusMatch = true
    if (filterStatus === "published") statusMatch = post.is_published
    if (filterStatus === "draft") statusMatch = !post.is_published

    const categoryText = postCategories[post.id]?.map((category) => category.title).join(" ") ?? ""
    const searchText =
      `${post.title} ${post.slug} ${post.excerpt ?? ""} ${post.meta_description ?? ""} ${categoryText}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (!postSort.sortColumn) return 0
    const dir = postSort.sortDirection === "asc" ? 1 : -1
    if (postSort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
    if (postSort.sortColumn === "category") {
      const aCat = postCategories[a.id]?.[0]?.title || "\uffff"
      const bCat = postCategories[b.id]?.[0]?.title || "\uffff"
      return aCat.localeCompare(bCat) * dir
    }
    if (postSort.sortColumn === "status") return (Number(a.is_published) - Number(b.is_published)) * dir
    if (postSort.sortColumn === "modified")
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const filteredPostIds = filteredPosts.map((post) => post.id)

  // Get counts for each status
  const statusCounts = {
    all: posts.length,
    published: posts.filter((p) => p.is_published).length,
    draft: posts.filter((p) => !p.is_published).length
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Posts" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search posts"
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: (value) => {
                setFilterStatus(value as "all" | "published" | "draft")
                postSelection.clearSelection()
                setCurrentPage(1)
              },
              items: [
                {
                  value: "all",
                  label: "All",
                  icon: List,
                  count: statusCounts.all
                },
                {
                  value: "published",
                  label: "Published",
                  icon: Globe,
                  count: statusCounts.published
                },
                {
                  value: "draft",
                  label: "Draft",
                  icon: FileEdit,
                  count: statusCounts.draft
                }
              ]
            }}
            preActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={postSelection.selectedCount}
              />
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Post</span>
              </Button>
            }
          />

          <Card>
            {/* Table Header */}
            <CardTableHeader className="grid-cols-6">
              <div className="col-span-2 flex items-center space-x-4 pl-[3px]">
                <Checkbox
                  checked={postSelection.isPageSelected(filteredPostIds)}
                  onCheckedChange={() => postSelection.togglePage(filteredPostIds)}
                  aria-label="Select all posts"
                />
                <AdminSortButton
                  active={postSort.sortColumn === "title"}
                  direction={postSort.sortDirection}
                  onClick={() => postSort.toggleSort("title")}
                >
                  Post
                </AdminSortButton>
              </div>
              <AdminSortButton
                active={postSort.sortColumn === "category"}
                direction={postSort.sortDirection}
                onClick={() => postSort.toggleSort("category")}
              >
                Category
              </AdminSortButton>
              <AdminSortButton
                active={postSort.sortColumn === "status"}
                direction={postSort.sortDirection}
                onClick={() => postSort.toggleSort("status")}
              >
                Status
              </AdminSortButton>
              <AdminSortButton
                active={postSort.sortColumn === "modified"}
                direction={postSort.sortDirection}
                onClick={() => postSort.toggleSort("modified")}
              >
                Modified
              </AdminSortButton>
              <div>Actions</div>
            </CardTableHeader>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={postSelection.allSelected}
              onClearSelection={postSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={postSelection.selectedCount}
              total={total}
              visibleCount={filteredPosts.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                // Skeleton loading state for posts
                <AdminListSkeleton firstColumnClassName="pl-[3px]" />
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
                      ? "No posts found"
                      : `No ${filterStatus === "all" ? "" : filterStatus} posts found`}
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                    Create Your First Post
                  </Button>
                </div>
              ) : (
                sortedPosts.map((post) => (
                  <div
                    key={post.id}
                    className={`p-6 transition-colors ${postSelection.selectedIds.has(post.id) ? "bg-accent/50" : ""}`}
                  >
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4 pl-[3px]">
                          <Checkbox
                            checked={postSelection.selectedIds.has(post.id)}
                            onCheckedChange={() => postSelection.toggleOne(post.id)}
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
                              <p className="text-sm text-muted-foreground">/posts/{post.slug}</p>
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
                      <div>{getStatusBadge(post)}</div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatRelativeDate(post.updated_at)}</span>
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
                        {post.is_published && currentSite ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                            <a
                              href={`${getSiteUrl(currentSite)}/posts/${post.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Preview"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">Preview</span>
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled
                            title="Publish post to preview"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Publish post to preview</span>
                          </Button>
                        )}
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
            {!loading && (
              <AdminListFooter
                currentPage={currentPage}
                pageSize={pageSize}
                total={total}
                onPageChange={setCurrentPage}
              />
            )}
          </Card>

          {/* Create Post Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Create New Post</AdminModalTitle>
                <AdminModalDescription>
                  Add a new post to your blog. You can customize the content after creation.
                </AdminModalDescription>
              </AdminModalHeader>
              <CreatePostModal
                onSuccess={(post, continueToBuilder) => {
                  setPosts((prev) => [...prev, post])
                  setShowCreateDialog(false)
                  if (continueToBuilder && currentSite?.id) {
                    router.push(`/admin/posts/builder/${currentSite.id}?post=${post.slug}`)
                  }
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </AdminModalContent>
          </Dialog>

          {/* Post Settings Modal */}
          <PostSettingsModal
            open={settingsPostId !== null}
            onOpenChange={(open) => setSettingsPostId(open ? settingsPostId : null)}
            post={posts.find((p) => p.id === settingsPostId) || null}
            site={null}
            onSuccess={handlePostUpdated}
          />

          <AdminConfirmDialog
            open={pendingDeleteId !== null}
            title="Delete Post"
            description="Are you sure you want to delete this post? This action cannot be undone."
            onCancel={cancelDeletePost}
            onConfirm={confirmDeletePost}
          />

          <AdminConfirmDialog
            open={massDeleteConfirmOpen}
            title={`Delete ${postSelection.selectedCount} Post${postSelection.selectedCount !== 1 ? "s" : ""}`}
            description={`Are you sure you want to delete ${postSelection.selectedCount} post${postSelection.selectedCount !== 1 ? "s" : ""}? This action cannot be undone.`}
            confirmLabel={`Delete ${postSelection.selectedCount} Post${postSelection.selectedCount !== 1 ? "s" : ""}`}
            onCancel={() => setMassDeleteConfirmOpen(false)}
            onConfirm={confirmMassDelete}
          />

          <AdminErrorDialog
            open={errorMessage !== null}
            message={errorMessage ?? ""}
            onOpenChange={(open) => {
              if (!open) setErrorMessage(null)
            }}
          />
        </div>
      </AdminLayout>
    </>
  )
}
