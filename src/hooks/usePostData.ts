import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"

interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UsePostDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, PostBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

// Mock function to get post block title
function getPostBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'post-content':
      return 'Content Block'
    case 'post-hero':
      return 'Post Hero'
    case 'post-gallery':
      return 'Post Gallery'
    case 'post-callout':
      return 'Post Callout'
    case 'post-embed':
      return 'Post Embed'
    case 'faq':
      return 'Post FAQ'
    default:
      return 'Block'
  }
}

export function usePostData(siteId: string): UsePostDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, PostBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")
    
    try {
      // Load site data
      const siteResult = await getSiteByIdAction(siteId)
      
      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }
      
      // Mock post blocks data for UI testing
      const mockBlocks: Record<string, PostBlock[]> = {
        'sample-blog-post': [
          {
            id: '1',
            type: 'post-content',
            title: getPostBlockTitle('post-content'),
            content: {
              content: 'This is sample content for the blog post. You can write your story here...'
            }
          }
        ],
        'another-post': [
          {
            id: '2',
            type: 'post-content',
            title: getPostBlockTitle('post-content'),
            content: {
              content: 'Content for another post...'
            }
          }
        ]
      }
      
      setBlocks(mockBlocks)
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and posts:', error)
    }
    
    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    
    // Mock reload - in real implementation this would reload post blocks from API
    setTimeout(() => {
      setBlocksLoading(false)
    }, 500)
  }

  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}