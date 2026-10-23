"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  getSiteByIdAction,
  type SiteWithTheme,
} from "@/lib/actions/sites/site-actions"
import {
  getSitePostsWithMergedBlocksAction,
  type Post,
  type PostBlock,
} from "@/lib/actions/posts/post-actions"
import { normalizePostBuilderBlock } from "@/components/admin/post-builder/config/post-block-utils"

function getPostBlocks(contentBlocks: Record<string, any> | null | undefined) {
  const postBlocks: Record<string, PostBlock> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && 'type' in value && 'id' in value) {
      postBlocks[key] = normalizePostBuilderBlock(value as PostBlock)
    }
  })

  return postBlocks
}

export function usePostBuilderData(
  siteId: string,
  selectedPost: string,
  contextSite?: SiteWithTheme | null
) {
  const [posts, setPosts] = useState<Post[]>([])
  const [site, setSite] = useState<SiteWithTheme | null>(contextSite ?? null)
  const [loading, setLoading] = useState(true)

  const loadPosts = useCallback(async (selectedSlug = selectedPost) => {
    const postsResult = await getSitePostsWithMergedBlocksAction({ data: { siteId: siteId, options: { selectedSlug } } })
    if (postsResult.data) setPosts(postsResult.data)
  }, [selectedPost, siteId])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)

        if (contextSite) {
          setSite(contextSite)
        } else {
          const siteResult = await getSiteByIdAction({ data: { siteId } })
          if (!cancelled && siteResult.data) {
            setSite(siteResult.data)
          }
        }

        await loadPosts(selectedPost)
      } catch (error) {
        console.error('Failed to load post builder data', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [contextSite, loadPosts, selectedPost, siteId])

  const currentPostData = posts.find((post) => post.slug === selectedPost)
  const blocks = useMemo(
    () => getPostBlocks(currentPostData?.content_blocks as Record<string, any> | null | undefined),
    [currentPostData?.content_blocks]
  )

  return {
    blocks,
    currentPostData,
    loading,
    reloadPosts: loadPosts,
    posts,
    setPosts,
    site,
  }
}
