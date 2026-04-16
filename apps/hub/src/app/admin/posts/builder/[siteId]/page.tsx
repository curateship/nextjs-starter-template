"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePostBuilder } from "@/components/admin/post-builder/config/usePostBuilder"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { BuilderToolbar } from "@/components/admin/shared/BuilderToolbar"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { PostSettingsModal } from "@/components/admin/post-builder/layout/PostSettingsModal"
import { CreatePostModal } from "@/components/admin/post-builder/layout/CreatePostModal"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { POST_BLOCK_TYPES } from "@/components/admin/post-builder/config/post-block-types"
import { getSitePostsAction, updatePostAction, updatePostBlocksAction } from "@/lib/actions/posts/post-actions"
import type { Post } from "@/lib/actions/posts/post-actions"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostPreview } from "@/components/admin/post-builder/layout/PostPreview"
import { PostBlockEditorModal } from "@/components/admin/post-builder/layout/PostBlockEditorModal"

export default function PostBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteSwitcher()
  const [posts, setPosts] = useState<Post[]>([])
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localBlocks, setLocalBlocks] = useState<Record<string, any>>({})

  
  // Get initial post from URL params or default to first post
  const initialPost = searchParams.get('post') || ''
  const [selectedPost, setSelectedPost] = useState(initialPost)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/posts/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId]) // Don't include router - it's stable
  
  // Load site and posts data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)
        
        // Load site data
        const siteResult = await getSiteByIdAction(siteId)
        if (!siteResult.data) {
          setError(siteResult.error || 'Failed to load site')
          return
        }
        setSite(siteResult.data)
        
        // Load posts data
        const postsResult = await getSitePostsAction(siteId)
        if (!postsResult.data) {
          setError(postsResult.error || 'Failed to load posts')
          return
        }
        
        setPosts(postsResult.data)
        
        // If initial post doesn't exist, redirect to first post
        if (postsResult.data.length > 0) {
          const postExists = postsResult.data.some((p: Post) => p.slug === initialPost)
          if (!postExists) {
            const firstPost = postsResult.data[0]
            setSelectedPost(firstPost.slug)
            router.replace(`/admin/posts/builder/${siteId}?post=${firstPost.slug}`)
          }
        }
      } catch (err) {
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [siteId, initialPost])
  
  
  // Current post data
  const currentPostData = posts.find(p => p.slug === selectedPost)
  const currentPostId = currentPostData?.id
  
  // Update local blocks when post data changes
  useEffect(() => {
    if (currentPostData?.content_blocks) {
      // Filter out settings like show_featured_image and keep only actual blocks
      const actualBlocks: Record<string, any> = {}
      Object.entries(currentPostData.content_blocks).forEach(([key, value]) => {
        // Only include items that have block properties (id, type, content)
        if (value && typeof value === 'object' && 'type' in value && 'id' in value) {
          actualBlocks[key] = value
        }
      })
      setLocalBlocks(actualBlocks)
    } else {
      setLocalBlocks({})
    }
  }, [selectedPost, currentPostData?.id])
  
  // Post builder hook for block management - just like products
  const builderState = usePostBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    postId: currentPostId || '',
    selectedPost
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftPostTitle, setDraftPostTitle] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)
  const currentPost = {
    slug: selectedPost,
    name: currentPostData?.title || selectedPost,
    blocks: Object.values(builderState.blocks).sort((a, b) => a.display_order - b.display_order) as any,
    id: currentPostData?.id,
    title: currentPostData?.title,
    meta_description: currentPostData?.meta_description || undefined,
    site_id: currentPostData?.site_id,
    featured_image: currentPostData?.featured_image,
    show_featured_image: (currentPostData?.content_blocks as any)?.show_featured_image,
    excerpt: currentPostData?.excerpt,
    is_published: currentPostData?.is_published,
    content_blocks: currentPostData?.content_blocks
  }

  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setDraftPostTitle("")
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftPostTitle(currentPostData?.title || "")
    setBlockSaveError(null)
  }, [selectedBlock, currentPostData?.title])
  
  // Handle post change with URL update
  const handlePostChange = (postSlug: string) => {
    if (postSlug !== selectedPost) {
      setSelectedPost(postSlug)
      router.replace(`/admin/posts/builder/${siteId}?post=${postSlug}`)
    }
  }

  // Handle post creation
  const handlePostCreated = (newPost: Post) => {
    setPosts(prev => [...prev, newPost])
    // Switch to the newly created post
    setSelectedPost(newPost.slug)
    router.replace(`/admin/posts/builder/${siteId}?post=${newPost.slug}`)
  }

  // Handle post updates
  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))

    // If the slug changed, update selected post and URL
    const currentPost = posts.find(p => p.id === updatedPost.id)
    if (currentPost && currentPost.slug !== updatedPost.slug) {
      setSelectedPost(updatedPost.slug)
      router.replace(`/admin/posts/builder/${siteId}?post=${updatedPost.slug}`)
    }
  }

  // Handle publishing the current post
  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentPostId) return
    try {
      setIsPublishing(true)
      const { data: updatedPost, error } = await updatePostAction(currentPostId, { is_published: true })
      if (error || !updatedPost) return
      setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
    } finally {
      setIsPublishing(false)
    }
  }

  // Handle post title changes
  const handlePostTitleChange = async (title: string) => {
    if (!currentPostId || !title.trim()) return

    try {
      const { data: updatedPost, error } = await updatePostAction(currentPostId, { title })

      if (error || !updatedPost) {
        console.error('Error updating post title:', error)
        return
      }

      // Update local posts state
      setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
    } catch (err) {
      console.error('Error updating post title:', err)
    }
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (isSavingBlock) return
    builderState.setSelectedBlock(null)
    setBlockSaveError(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentPostId) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

    try {
      const updatedBlock = {
        ...selectedBlock,
        content: draftContent,
        updated_at: new Date().toISOString(),
      }
      const nextBlocks = {
        ...builderState.blocks,
        [selectedBlock.id]: updatedBlock,
      }

      if (
        selectedBlock.type === "post-content" &&
        draftPostTitle.trim() &&
        draftPostTitle.trim() !== (currentPostData?.title || "")
      ) {
        const { data, error } = await updatePostAction(currentPostId, { title: draftPostTitle.trim() })
        if (error || !data) {
          setBlockSaveError(error || "Failed to save post title")
          return
        }
        handlePostUpdated(data)
      }

      const { success, error } = await updatePostBlocksAction(currentPostId, nextBlocks)
      if (!success) {
        setBlockSaveError(error || "Failed to save block")
        return
      }

      setLocalBlocks(nextBlocks)
      builderState.setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  // Only show loading state for critical errors (not during normal loading)
  if (!site && error) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{error}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Site ID: <code>{siteId}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please go to Sites page to get a valid site ID, or create a new site.
            </p>
            <div className="space-x-2">
              <Button asChild>
                <Link href="/admin/sites">Go to Sites</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/sites/new">Create New Site</Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader />
      <BuilderToolbar
        className="top-16 z-40"
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/posts", label: "Posts" },
          { label: currentPostData?.title || "", isPage: true }
        ]}
        items={posts}
        selectedItemSlug={selectedPost}
        onItemChange={handlePostChange}
        entityName="Post"
        getItemUrl={(item) => `${currentSite ? getSiteUrl(currentSite) : ''}/posts/${item.slug}`}
        saveMessage={builderState.saveMessage}
        isSaving={false}
        onSave={builderState.handleSaveAllBlocks}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
        showSidebarToggle={false}
        renderCreateModal={(show, setShow) => (
          <Dialog open={show} onOpenChange={setShow}>
            <AdminModalContent>
              <AdminModalHeader>
                <AdminModalTitle>Create New Post</AdminModalTitle>
                <AdminModalDescription>Add a new post to your blog. You can customize the content after creation.</AdminModalDescription>
              </AdminModalHeader>
              <CreatePostModal
                onSuccess={(post) => { handlePostCreated(post); setShow(false); }}
                onCancel={() => setShow(false)}
              />
            </AdminModalContent>
          </Dialog>
        )}
        renderSettingsModal={(show, setShow) => (
          <PostSettingsModal
            open={show}
            onOpenChange={setShow}
            post={currentPostData || null}
            site={currentSite}
            onSuccess={handlePostUpdated}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <PostPreview
              blocks={currentPost.blocks as any}
              post={currentPostData ? {
                id: currentPostData.id || 'preview',
                title: currentPostData.title,
                slug: currentPostData.slug,
                meta_description: currentPostData.meta_description,
                site_id: currentPostData.site_id || siteId,
                featured_image: currentPostData.featured_image || null,
                show_featured_image: (currentPostData.content_blocks as any)?.show_featured_image !== false,
                excerpt: currentPostData.excerpt || null,
                is_published: currentPostData.is_published || false
              } : undefined}
              site={{
                id: siteId,
                name: site?.name || 'Post Site',
                subdomain: site?.subdomain || 'preview',
                settings: site?.settings
              }}
              className="min-h-full"
              blocksLoading={loading}
              allBlocks={currentPost.blocks as any}
              onSelectBlock={builderState.setSelectedBlock as any}
            />
          </ScrollArea>
        </div>

        <PostBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          postTitle={draftPostTitle}
          onPostTitleChange={setDraftPostTitle}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          error={blockSaveError}
        />

        {blockListOpen && (
          <BlockListPanel
            blocks={currentPost.blocks}
            blockTypes={POST_BLOCK_TYPES}
            entityName="post"
            selectedBlock={builderState.selectedBlock as any}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onPreview={() => builderState.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={loading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={Object.values(builderState.blocks).map(b => b.type)}
          blockTypes={POST_BLOCK_TYPES}
          entityName="post"
        />
      </div>
    </div>
  )
}
