"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePostBuilder } from "@/components/admin/post-builder/config/usePostBuilder"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getPostAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { PostSettingsModal } from "@/components/admin/post-builder/layout/PostSettingsModal"
import { PostBlockListPanel } from "@/components/admin/post-builder/layout/PostBlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { POST_BLOCK_TYPES } from "@/components/admin/post-builder/config/post-block-types"
import { getSitePostsAction, updatePostAction, updatePostBlocksAction } from "@/lib/actions/posts/post-actions"
import type { Post, PostBlock } from "@/lib/actions/posts/post-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostPreview } from "@/components/admin/post-builder/layout/PostPreview"
import { PostBlockEditorModal } from "@/components/admin/post-builder/layout/PostBlockEditorModal"
import {
  normalizePostBuilderBlock,
  orderPostBuilderBlocks,
  postBuilderBlocksToRecord,
} from "@/components/admin/post-builder/config/post-block-utils"

export default function PostBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite, sites, setCurrentSite } = useSiteSwitcher()
  const [posts, setPosts] = useState<Post[]>([])
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localBlocks, setLocalBlocks] = useState<Record<string, PostBlock>>({})

  
  const postFromUrl = searchParams.get('post') || ''
  const [selectedPost, setSelectedPost] = useState(postFromUrl)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  // Keep the site switcher aligned with the route before redirecting.
  useEffect(() => {
    if (currentSite?.id === siteId) return

    const routeSite = sites.find((site) => site.id === siteId)
    if (routeSite) {
      setCurrentSite(routeSite)
      return
    }

    if (currentSite) {
      const postQuery = postFromUrl ? `?post=${encodeURIComponent(postFromUrl)}` : ''
      router.push(`/admin/posts/builder/${currentSite.id}${postQuery}`)
    }
  }, [currentSite, postFromUrl, router, setCurrentSite, siteId, sites])
  
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
        
      } catch (err) {
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [siteId])

  useEffect(() => {
    if (posts.length === 0) return

    const matchingPost = posts.find((post: Post) => post.slug === postFromUrl)
    if (matchingPost) {
      if (selectedPost !== matchingPost.slug) {
        setSelectedPost(matchingPost.slug)
      }
      return
    }

    const firstPost = posts[0]
    if (selectedPost !== firstPost.slug) {
      setSelectedPost(firstPost.slug)
    }
    if (postFromUrl !== firstPost.slug) {
      router.replace(`/admin/posts/builder/${siteId}?post=${encodeURIComponent(firstPost.slug)}`)
    }
  }, [posts, postFromUrl, router, selectedPost, siteId])
  
  
  // Current post data
  const currentPostData = posts.find(p => p.slug === selectedPost)
  const currentPostId = currentPostData?.id
  
  // Update local blocks when post data changes
  useEffect(() => {
    if (currentPostData?.content_blocks) {
      // Filter out settings like show_featured_image and keep only actual blocks
      const actualBlocks: Record<string, PostBlock> = {}
      Object.entries(currentPostData.content_blocks).forEach(([key, value]) => {
        // Only include items that have block properties (id, type, content)
        if (value && typeof value === 'object' && 'type' in value && 'id' in value) {
          actualBlocks[key] = normalizePostBuilderBlock(value as PostBlock)
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
    blocks: orderPostBuilderBlocks(Object.values(builderState.blocks)),
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
      const updatedBlock = normalizePostBuilderBlock({
        ...selectedBlock,
        content: draftContent,
        updated_at: new Date().toISOString(),
      })
      const nextBlocks = postBuilderBlocksToRecord(
        orderPostBuilderBlocks(Object.values(builderState.blocks)).map((block) =>
          block.id === selectedBlock.id ? updatedBlock : block
        )
      )

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

  const viewPageHref = site && currentPostData
    ? `${getSiteUrl(site)}/posts/${currentPostData.slug}`
    : null
  const publishedViewPageHref = currentPostData?.is_published ? viewPageHref : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        navLinks={getPostAdminTopNavLinks("posts")}
        rightActions={(
          <StickybarTopRightActions
            viewPageHref={publishedViewPageHref}
            saveMessage={builderState.saveMessage}
            onSave={builderState.handleSaveAllBlocks}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={Boolean(currentPostData?.is_published)}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentPostData}
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
                is_published: currentPostData.is_published || false,
                updated_at: currentPostData.updated_at
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
          <PostBlockListPanel
            blocks={currentPost.blocks}
            selectedBlock={builderState.selectedBlock}
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
