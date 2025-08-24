"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePostBuilder } from "@/hooks/usePostBuilder"
import type { PostBlock as DBPostBlock } from "@/lib/actions/post-block-actions"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"
import { useSiteContext } from "@/contexts/site-context"
import { PostBuilderHeader } from "@/components/admin/post-builder/PostBuilderHeader"
import { BlockPropertiesPanel } from "@/components/admin/post-builder/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/post-builder/BlockListPanel"
import { BlockTypesPanel } from "@/components/admin/post-builder/BlockTypesPanel"
import { getSitePostsAction } from "@/lib/actions/post-actions"
import type { Post } from "@/lib/actions/post-actions"

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
      setLocalBlocks(currentPostData.content_blocks)
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
    blocks: Object.values(builderState.blocks).sort((a, b) => a.display_order - b.display_order) as any
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

  // Show loading skeleton
  if (loading) {
    return (
      <AdminLayout>
        <div className="flex flex-col -m-4 -mt-6 h-full">
          {/* Header Skeleton */}
          <div className="bg-background border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-32"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse w-24"></div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-20"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse w-16"></div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 flex">
            {/* PostBlockPropertiesPanel - Large Preview Area */}
            <div className="flex-1 border-r bg-muted/30 p-4">
              <div className="bg-white h-full">
                <div className="p-8 space-y-8">
                  {/* Preview header skeleton */}
                  <div className="text-center space-y-4">
                    <div className="h-12 bg-gray-200 rounded animate-pulse w-3/4 mx-auto"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2 mx-auto"></div>
                  </div>
                  
                  {/* Preview content blocks skeleton */}
                  <div className="space-y-6">
                    <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5"></div>
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-3/5"></div>
                    </div>
                    <div className="h-32 bg-gray-100 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* PostBlockListPanel */}
            <div className="w-[400px] p-6">
              <div className="max-w-3xl mx-auto">
                <div className="h-7 bg-gray-200 rounded animate-pulse w-1/2 mb-6"></div>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3"></div>
                        </div>
                        <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* PostBlockTypesPanel */}
            <div className="w-64 border-l p-4">
              <div className="space-y-4">
                <div className="h-6 bg-gray-200 rounded animate-pulse w-24"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 rounded-lg border bg-background flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
                      </div>
                      <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

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
          onSave={() => {}}
          onPreviewPost={() => builderState.setSelectedBlock(null)}
          postsLoading={loading}
        />
        
        <div className="flex-1 flex">
          <BlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.handleUpdateBlock}
            siteId={siteId}
            currentPost={{
              ...currentPost,
              id: currentPostData?.id,
              title: currentPostData?.title,
              meta_description: currentPostData?.meta_description || undefined,
              site_id: currentPostData?.site_id,
              featured_image: currentPostData?.featured_image || undefined,
              excerpt: currentPostData?.excerpt || undefined
            }}
            site={{
              id: siteId,
              name: site?.name || 'Post Site',
              subdomain: site?.subdomain || 'preview'
            }}
            siteBlocks={{
              navigation: site?.settings?.navigation,
              footer: site?.settings?.footer
            }}
            blocksLoading={loading}
          />
          
          <BlockListPanel
            currentPost={currentPost}
            selectedBlock={builderState.selectedBlock as any}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            deleting={null}
            blocksLoading={loading}
            postData={{
              title: currentPostData?.title,
              meta_description: currentPostData?.meta_description || undefined,
              excerpt: currentPostData?.excerpt || undefined
            }}
          />
          
          <BlockTypesPanel
            onAddRichTextBlock={builderState.handleAddRichTextBlock}
            currentBlocks={Object.values(builderState.blocks)}
          />
        </div>
      </div>
    </AdminLayout>
  )
}