"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePostBuilder } from "@/hooks/usePostBuilder"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { useSiteContext } from "@/contexts/site-context"
import { PostBuilderHeader } from "@/components/admin/post-builder/PostBuilderHeader"
import { BlockPropertiesPanel } from "@/components/admin/post-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/post-builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/post-builder/BlockSelectionModal"
import { getSitePostsAction, updatePostAction } from "@/lib/actions/posts/post-actions"
import type { Post } from "@/lib/actions/posts/post-actions"

export default function PostBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [posts, setPosts] = useState<Post[]>([])
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localBlocks, setLocalBlocks] = useState<Record<string, any>>({})

  
  // Get initial post from URL params or default to first post
  const initialPost = searchParams.get('post') || ''
  const [selectedPost, setSelectedPost] = useState(initialPost)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  
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
  const currentPost = {
    slug: selectedPost,
    name: currentPostData?.title || selectedPost,
    blocks: Object.values(builderState.blocks).sort((a, b) => a.display_order - b.display_order) as any,
    id: currentPostData?.id,
    title: currentPostData?.title,
    meta_description: currentPostData?.meta_description || undefined,
    site_id: currentPostData?.site_id,
    featured_image: currentPostData?.featured_image,
    show_featured_image: (currentPostData as any)?.show_featured_image,
    excerpt: currentPostData?.excerpt,
    is_published: currentPostData?.is_published,
    content_blocks: currentPostData?.content_blocks
  }
  
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

  // Only show loading state for critical errors (not during normal loading)
  if (!site && error) {
    return (
      <AdminLayout>
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

  // Remove loading skeleton - let components handle their own loading states like page builder does

  return (
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        <PostBuilderHeader
          posts={posts}
          selectedPost={selectedPost}
          onPostChange={handlePostChange}
          onPostCreated={handlePostCreated}
          onPostUpdated={handlePostUpdated}
          saveMessage={builderState.saveMessage}
          isSaving={false}
          onSave={builderState.handleSaveAllBlocks}
          onPreviewPost={() => builderState.setSelectedBlock(null)}
          postsLoading={loading}
        />
        
        <div className="flex-1 flex">
          <BlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.handleUpdateBlock}
            siteId={siteId}
            currentPost={currentPost}
            site={{
              id: siteId,
              name: site?.name || 'Post Site',
              subdomain: site?.subdomain || 'preview',
              settings: site?.settings
            }}
            siteBlocks={{
              navigation: site?.settings?.navigation,
              footer: site?.settings?.footer,
              show_featured_image: (currentPostData?.content_blocks as any)?.show_featured_image
            }}
            blocksLoading={loading}
            onPostTitleChange={handlePostTitleChange}
          />
          
          <BlockListPanel
            currentPost={currentPost}
            selectedBlock={builderState.selectedBlock as any}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onOpenBlockModal={() => setBlockModalOpen(true)}
            onPreviewPost={() => builderState.setSelectedBlock(null)}
            onCleanupCorrupted={builderState.handleCleanupCorrupted}
            deleting={null}
            blocksLoading={loading}
            postData={{
              title: currentPostData?.title,
              meta_description: currentPostData?.meta_description || undefined,
              excerpt: currentPostData?.excerpt || undefined
            }}
          />
        </div>

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={Object.values(builderState.blocks).map(b => b.type)}
        />
      </div>
    </AdminLayout>
  )
}