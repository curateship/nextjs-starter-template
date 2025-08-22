"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePostData } from "@/hooks/usePostData"
import { usePostBuilder } from "@/hooks/usePostBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { PostBuilderHeader } from "@/components/admin/layout/post-builder/PostBuilderHeader"
import { PostBlockPropertiesPanel } from "@/components/admin/layout/post-builder/PostBlockPropertiesPanel"
import { PostBlockListPanel } from "@/components/admin/layout/post-builder/PostBlockListPanel"
import { PostBlockTypesPanel } from "@/components/admin/layout/post-builder/PostBlockTypesPanel"
import { getSitePostsAction } from "@/lib/actions/post-actions"
import type { Post } from "@/lib/actions/post-actions"

export default function PostBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [siteBlocks, setSiteBlocks] = useState<{ navigation?: any; footer?: any } | null>(null)
  
  // Get initial post from URL params or default to first post
  const initialPost = searchParams.get('post') || ''
  const [selectedPost, setSelectedPost] = useState(initialPost)
  
  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/posts/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])
  
  // Load posts data (using mock data for now)
  useEffect(() => {
    async function loadPosts() {
      try {
        setPostsLoading(true)
        setPostsError(null)
        
        // Mock posts data for UI
        const mockPosts: Post[] = [
          {
            id: '1',
            site_id: siteId,
            title: 'Sample Blog Post',
            slug: 'sample-blog-post',
            meta_description: 'A sample blog post for testing',
            featured_image: null,
            excerpt: 'This is a sample blog post excerpt',
            content: 'Sample content here',
            is_published: true,
            display_order: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: '2',
            site_id: siteId,
            title: 'Another Post',
            slug: 'another-post',
            meta_description: 'Another sample post',
            featured_image: null,
            excerpt: 'Another post excerpt',
            content: 'Another post content',
            is_published: false,
            display_order: 2,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
        
        setPosts(mockPosts)
        
        // If initial post doesn't exist, redirect to first post
        if (mockPosts && mockPosts.length > 0) {
          const postExists = mockPosts.some(p => p.slug === initialPost)
          if (!postExists) {
            const firstPost = mockPosts[0]
            setSelectedPost(firstPost.slug)
            router.replace(`/admin/posts/builder/${siteId}?post=${firstPost.slug}`)
          }
        }
      } catch (err) {
        setPostsError('Failed to load posts')
      } finally {
        setPostsLoading(false)
      }
    }
    
    loadPosts()
  }, [siteId, initialPost, router])
  
  // Load site blocks for navigation and footer (mock for now)
  useEffect(() => {
    async function loadSiteBlocks() {
      try {
        // Mock site blocks
        setSiteBlocks({
          navigation: { logo: 'Site Logo', menuItems: [] },
          footer: { content: 'Footer content' }
        })
      } catch (error) {
        console.error('Failed to load site blocks:', error)
      }
    }

    loadSiteBlocks()
  }, [siteId])
  
  // Custom hooks for data and state management
  const { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = usePostData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)
  
  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks(blocks)
  }, [blocks])
  
  const builderState = usePostBuilder({ 
    blocks: localBlocks, 
    setBlocks: setLocalBlocks, 
    selectedPost,
    postId: posts.find(p => p.slug === selectedPost)?.id,
    currentPost: posts.find(p => p.slug === selectedPost)
  })
  
  // Current post data with staged deletions filtered out
  const currentPostData = posts.find(p => p.slug === selectedPost)
  const currentPost = {
    slug: selectedPost,
    name: currentPostData?.title || selectedPost,
    blocks: localBlocks[selectedPost] || []
  }
  
  // Handle post change with URL update
  const handlePostChange = (postSlug: string) => {
    if (postSlug !== selectedPost) {
      setSelectedPost(postSlug)
      // Ensure blocks array exists for this post
      setLocalBlocks(prev => ({
        ...prev,
        [postSlug]: prev[postSlug] || []
      }))
      router.replace(`/admin/posts/builder/${siteId}?post=${postSlug}`)
    }
  }

  // Handle post creation
  const handlePostCreated = (newPost: Post) => {
    setPosts(prev => [...prev, newPost])
    // Initialize blocks array for the new post
    setLocalBlocks(prev => ({
      ...prev,
      [newPost.slug]: []
    }))
    // Switch to the newly created post
    setSelectedPost(newPost.slug)
    router.replace(`/admin/posts/builder/${siteId}?post=${newPost.slug}`)
  }

  // Handle post updates
  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
    
    // If the slug changed, we need to update our local blocks and URL
    const currentPost = posts.find(p => p.id === updatedPost.id)
    if (currentPost && currentPost.slug !== updatedPost.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForPost = prev[currentPost.slug] || []
        const { [currentPost.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedPost.slug]: blocksForPost
        }
      })
      
      // Update selected post and URL
      setSelectedPost(updatedPost.slug)
      router.replace(`/admin/posts/builder/${siteId}?post=${updatedPost.slug}`)
    }
  }

  // Only show loading state for critical errors (not during normal loading)
  if (!site && siteError) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError}</p>
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
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        <PostBuilderHeader
          posts={posts}
          selectedPost={selectedPost}
          onPostChange={handlePostChange}
          onPostCreated={handlePostCreated}
          onPostUpdated={handlePostUpdated}
          saveMessage={builderState.saveMessage}
          isSaving={builderState.isSaving}
          onSave={builderState.handleSaveAllBlocks}
          onPreviewPost={() => builderState.setSelectedBlock(null)}
          postsLoading={postsLoading}
        />
        
        <div className="flex-1 flex">
          <PostBlockPropertiesPanel
            selectedBlock={builderState.selectedBlock}
            updateBlockContent={builderState.updateBlockContent}
            siteId={siteId}
            currentPost={{
              ...currentPost,
              id: currentPostData?.id,
              title: currentPostData?.title,
              meta_description: currentPostData?.meta_description,
              site_id: currentPostData?.site_id,
              featured_image: currentPostData?.featured_image,
              excerpt: currentPostData?.excerpt
            }}
            site={{
              id: siteId,
              name: site?.name || 'Post Site',
              subdomain: site?.subdomain || 'preview'
            }}
            siteBlocks={siteBlocks}
            blocksLoading={blocksLoading}
          />
          
          <PostBlockListPanel
            currentPost={currentPost}
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            blocksLoading={blocksLoading}
          />
          
          <PostBlockTypesPanel
            onAddPostContentBlock={builderState.handleAddPostContentBlock}
          />
        </div>
      </div>
    </AdminLayout>
  )
}