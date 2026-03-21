"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/admin/layout/sidebar/Sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Save, Plus, Settings, CheckCircle, Sparkles, ChevronDown, ExternalLink, PanelLeft, PanelRight, PanelRightClose, Home } from "lucide-react"
import { useSiteContext } from "@/contexts/site-context"
import { PostSettingsModal } from "@/components/admin/post-builder/layout/PostSettingsModal"
import { CreatePostModal } from "@/components/admin/post-builder/layout/CreatePostModal"
import type { Post } from "@/lib/actions/posts/post-actions"

interface BreadcrumbItem {
  href?: string
  label: string
  isPage?: boolean
}

interface StickyHeaderProps {
  className?: string
  breadcrumbItems?: BreadcrumbItem[]
  // Post builder specific props
  posts?: Post[]
  selectedPost?: string
  onPostChange?: (post: string) => void
  onPostCreated?: (post: Post) => void
  onPostUpdated?: (post: Post) => void
  saveMessage?: string
  isSaving?: boolean
  onSave?: () => void
  onPublish?: () => void
  isPublishing?: boolean
  blockListOpen?: boolean
  onToggleBlockList?: () => void
}

export function StickyHeader({
  className,
  breadcrumbItems = [],
  posts,
  selectedPost,
  onPostChange,
  onPostCreated,
  onPostUpdated,
  saveMessage,
  isSaving = false,
  onSave,
  onPublish,
  isPublishing = false,
  blockListOpen,
  onToggleBlockList,
}: StickyHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const { toggleSidebar } = useSidebar()

  // Post builder mode - when posts prop is provided
  const isPostBuilder = posts !== undefined
  const currentPost = posts?.find(p => p.slug === selectedPost)

  const handleCreatePost = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }

  // Generate post URL for frontend viewing
  const getPostUrl = (postSlug?: string) => {
    const slug = postSlug || currentPost?.slug
    if (!slug || !currentSite?.subdomain) {
      return '#'
    }
    const url = `http://${currentSite.subdomain}.localhost:3000/posts/${slug}`
    return url
  }

  return (
    <>
      <header className={cn(
        "sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b bg-sidebar z-50",
        className
      )}>
        <div className="flex items-center justify-between flex-1 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            {breadcrumbItems.length > 0 && (
              <Breadcrumb className="w-fit rounded-md bg-muted px-3 py-1.5">
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => {
                    // Last item in post builder gets dropdown
                    const isLastItem = index === breadcrumbItems.length - 1
                    const shouldShowDropdown = isLastItem && isPostBuilder

                    return (
                      <React.Fragment key={index}>
                        <BreadcrumbItem>
                          {index === 0 ? (
                            <BreadcrumbLink asChild>
                              <Link href={item.href || "#"}>
                                <Home className="size-4" />
                              </Link>
                            </BreadcrumbLink>
                          ) : shouldShowDropdown ? (
                            !item.label ? (
                              <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                            ) : (
                            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="h-auto p-0 font-normal hover:bg-transparent hover:text-foreground inline-flex items-center"
                                >
                                  <BreadcrumbPage className="cursor-pointer" style={{ paddingBottom: '1px' }}>
                                    {currentPost ? currentPost.title : item.label}
                                  </BreadcrumbPage>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-[240px]">
                                {posts?.map((post) => (
                                  <DropdownMenuItem
                                    key={post.id}
                                    onSelect={(e) => e.preventDefault()}
                                    className={post.slug === selectedPost ? "bg-accent" : ""}
                                  >
                                    <div className="flex items-center justify-between flex-1">
                                      <span
                                        onClick={() => {
                                          if (onPostChange) {
                                            onPostChange(post.slug)
                                          }
                                          setDropdownOpen(false)
                                        }}
                                        className="flex-1 cursor-pointer"
                                      >
                                        {post.title}
                                        {!post.is_published && " (Draft)"}
                                      </span>
                                      <Link
                                        href={getPostUrl(post.slug)}
                                        target="_blank"
                                        onClick={(e) => e.stopPropagation()}
                                        className="ml-2"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </Link>
                                    </div>
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleCreatePost}>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Create Post
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            )
                          ) : item.isPage ? (
                            <BreadcrumbPage>{item.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <Link href={item.href || "#"}>
                                {item.label}
                              </Link>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {index < breadcrumbItems.length - 1 && (
                          <BreadcrumbSeparator />
                        )}
                      </React.Fragment>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>

          {/* Post Builder Actions */}
          {isPostBuilder && (
            <div className="flex items-center space-x-2">
              {saveMessage && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
                  saveMessage.includes('Error') || saveMessage.includes('Failed')
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-green-50 border border-green-200'
                }`}>
                  <CheckCircle className={`w-4 h-4 ${
                    saveMessage.includes('Error') || saveMessage.includes('Failed')
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`} />
                  <span className={`text-sm font-medium ${
                    saveMessage.includes('Error') || saveMessage.includes('Failed')
                      ? 'text-red-800'
                      : 'text-green-700'
                  }`}>
                    {saveMessage}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditDialog(true)}
                disabled={!currentPost}
              >
                <Settings className="w-4 h-4 mr-2" />
                Edit Settings
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onSave}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              {onPublish && (
                <Button
                  size="sm"
                  onClick={onPublish}
                  disabled={isPublishing || isSaving}
                >
                  {isPublishing ? 'Publishing...' : currentPost?.is_published ? 'Published' : 'Publish'}
                </Button>
              )}
              {onToggleBlockList && (
                <button
                  onClick={onToggleBlockList}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-medium transition-colors hover:bg-muted-foreground/10"
                >
                  {blockListOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Post Builder Dialogs */}
      {isPostBuilder && (
        <>
          {/* Create Post Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
              <DialogHeader>
                <DialogTitle>Create New Post</DialogTitle>
                <DialogDescription>
                  Add a new post to your blog. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
              <CreatePostModal
                onSuccess={(post) => {
                  if (onPostCreated) {
                    onPostCreated(post)
                  }
                  setShowCreateDialog(false)
                  if (onPostChange) {
                    onPostChange(post.slug)
                  }
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>

          {/* Edit Post Settings Modal */}
          <PostSettingsModal
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            post={currentPost || null}
            site={currentSite}
            onSuccess={(updatedPost) => {
              if (onPostUpdated) {
                onPostUpdated(updatedPost)
              }
            }}
          />
        </>
      )}
    </>
  )
}
