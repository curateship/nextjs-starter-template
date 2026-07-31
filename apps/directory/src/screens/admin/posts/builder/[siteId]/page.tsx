"use client"

import { useState, useEffect } from "react"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { use } from "react"
import { useRouter, useSearchParams } from "@/lib/navigation-client"
import { usePostBuilder } from "@/components/admin/post-builder/config/usePostBuilder"
import { usePostBuilderData } from "@/components/admin/post-builder/config/usePostBuilderData"
import {
  useBuilderRouteSiteSync,
  useSelectedBuilderSlug,
  useSyncedBuilderBlocks,
} from "@/components/admin/layout/builder/useBuilderRouteState"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { PostSettingsModal } from "@/components/admin/post-builder/layout/PostSettingsModal"
import { PostBlockListPanel } from "@/components/admin/post-builder/layout/PostBlockListPanel"
import { updatePostAction, updatePostBlocksAction } from "@/lib/actions/posts/post-actions"
import type { Post } from "@/lib/actions/posts/post-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PostPreview } from "@/components/admin/post-builder/layout/PostPreview"
import { PostBlockEditorModal } from "@/components/admin/post-builder/layout/PostBlockEditorModal"
import {
  normalizePostBuilderBlock,
  orderPostBuilderBlocks,
  postBuilderBlocksToRecord,
} from "@/components/admin/post-builder/config/post-block-utils"
import { postBlocksToValueJson } from "@/lib/actions/posts/post-template-inheritance"

export default function PostBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const postFromUrl = searchParams.get('post') || ''
  const { currentSite } = useBuilderRouteSiteSync({
    builderPath: "/admin/posts/builder",
    queryParam: "post",
    queryValue: postFromUrl,
    siteId,
  })
  const [selectedPost, setSelectedPost] = useState(postFromUrl)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const {
    blocks,
    currentPostData,
    loading,
    posts,
    reloadPosts,
    setPosts,
    site,
  } = usePostBuilderData(siteId, selectedPost, currentSite)

  useSelectedBuilderSlug({
    builderPath: "/admin/posts/builder",
    items: posts,
    queryParam: "post",
    selectedSlug: selectedPost,
    setSelectedSlug: setSelectedPost,
    siteId,
    slugFromUrl: postFromUrl,
  })

  const [localBlocks, setLocalBlocks] = useSyncedBuilderBlocks(blocks, { shallowCopy: true })
  const currentPostId = currentPostData?.id

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
    show_excerpt: (currentPostData?.content_blocks as any)?.show_excerpt,
    excerpt: currentPostData?.excerpt,
    is_published: currentPostData?.is_published,
    content_blocks: currentPostData?.content_blocks
  }

  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setDraftPostTitle("")
      dismissErrorToast()
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftPostTitle(currentPostData?.title || "")
    dismissErrorToast()
  }, [selectedBlock, currentPostData?.title])

  // Handle post updates
  const handlePostUpdated = (updatedPost: Post) => {
    // If the slug changed, update selected post and URL
    const currentPost = posts.find(p => p.id === updatedPost.id)
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? {
      ...updatedPost,
      content_blocks: p.content_blocks,
    } : p))

    if (currentPost && currentPost.slug !== updatedPost.slug) {
      setSelectedPost(updatedPost.slug)
      router.replace(`/admin/posts/builder/${siteId}?post=${updatedPost.slug}`)
    }
    if (currentPost?.template_id !== updatedPost.template_id) void reloadPosts(updatedPost.slug)
  }

  // Handle publishing the current post
  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentPostId) return
    try {
      setIsPublishing(true)
      const { data: updatedPost, error } = await updatePostAction({ data: { postId: currentPostId, updates: { is_published: true } } })
      if (error || !updatedPost) return
      setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
    } finally {
      setIsPublishing(false)
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
    dismissErrorToast()
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentPostId) return

    setIsSavingBlock(true)
    dismissErrorToast()

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
        selectedBlock.type === "core" &&
        draftPostTitle.trim() &&
        draftPostTitle.trim() !== (currentPostData?.title || "")
      ) {
        const { data, error } = await updatePostAction({ data: { postId: currentPostId, updates: { title: draftPostTitle.trim() } } })
        if (error || !data) {
          showErrorToast(error || "Failed to save post title")
          return
        }
        handlePostUpdated(data)
      }

      const { success, error } = await updatePostBlocksAction({ data: { postId: currentPostId, blocks: postBlocksToValueJson(Object.values(nextBlocks)) } })
      if (!success) {
        showErrorToast(error || "Failed to save block")
        return
      }

      setLocalBlocks(nextBlocks)
      builderState.setSelectedBlock(null)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  const viewPageHref = site && currentPostData
    ? `${getSiteUrl(site)}/posts/${currentPostData.slug}`
    : null
  const publishedViewPageHref = currentPostData?.is_published ? viewPageHref : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveStatus={builderState.saveStatus}
            isSaving={builderState.isSaving}
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
                show_excerpt: (currentPostData.content_blocks as any)?.show_excerpt !== false,
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
              selectedBlock={selectedBlock as any}
              onSelectBlock={builderState.setSelectedBlock as any}
              onUpdateCoreBody={(blockId, htmlContent) => {
                const block = builderState.blocks[blockId]
                if (!block) return

                builderState.handleUpdateBlock(blockId, {
                  content: {
                    ...block.content,
                    body: htmlContent,
                    format: "html",
                  },
                })
              }}
            />
          </ScrollArea>
        </div>

        <PostBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          postTitle={draftPostTitle}
          postData={currentPost}
          onPostTitleChange={setDraftPostTitle}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
        />

        {blockListOpen && (
          <PostBlockListPanel
            blocks={currentPost.blocks}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={(block) => {
              if (block.type === "core") builderState.setSelectedBlock(block)
            }}
            viewPageHref={publishedViewPageHref}
            deleting={null}
            blocksLoading={loading}
            editableStructure={false}
          />
        )}
      </div>
    </div>
  )
}
