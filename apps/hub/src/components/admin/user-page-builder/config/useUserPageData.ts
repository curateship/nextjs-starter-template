import { useState, useEffect } from "react"
import {
  getUserPagesAction,
  type UserPage
} from "@/lib/actions/user-pages/user-pages-actions"
import type { Site } from "@/lib/actions/sites/site-actions"
import { convertJsonToBlocks } from "@/lib/utils/block-utils"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"

interface UseUserPagesDataReturn {
  site: Site | null
  pages: UserPage[]
  blocks: Record<string, any[]>
  configLoading: boolean
  blocksLoading: boolean
  configError: string
  reloadBlocks: () => Promise<void>
}

// Helper function to build user pages config blocks (navigation and footer)
function buildUserPagesConfigBlocks(siteData: Site | null): Array<{
  id: string
  type: string
  title: string
  content: Record<string, any>
  display_order: number
}> {
  const configBlocks: Array<{
    id: string
    type: string
    title: string
    content: Record<string, any>
    display_order: number
  }> = []

  const userPagesSettings = siteData?.settings?.user_pages

  if (userPagesSettings?.navigation) {
    configBlocks.push({
      id: 'user-pages-navigation',
      type: 'navigation',
      title: 'Navigation',
      content: userPagesSettings.navigation,
      display_order: -1 // Show at top
    })
  }

  if (userPagesSettings?.footer) {
    configBlocks.push({
      id: 'user-pages-footer',
      type: 'footer',
      title: 'Footer',
      content: userPagesSettings.footer,
      display_order: 999 // Show at bottom
    })
  }

  return configBlocks
}

export function useUserPageData(siteId: string): UseUserPagesDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<Site | null>(currentSite)
  const [pages, setPages] = useState<UserPage[]>([])
  const [configLoading, setConfigLoading] = useState(!currentSite)
  const [configError, setConfigError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadUserPagesAndBlocks = async () => {
    setConfigLoading(true)
    setBlocksLoading(true)
    setConfigError("")

    try {
      // Use site from context, only fetch pages
      const pagesResult = await getUserPagesAction(siteId)
      const siteResult = { data: currentSite, error: null }

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setConfigError(siteResult.error || 'Failed to load site data')
      }

      if (pagesResult.data && siteResult.data) {
        setPages(pagesResult.data)

        // Convert JSON content_blocks to blocks format for each page
        const blocksData: Record<string, any[]> = {}
        pagesResult.data.forEach(page => {
          const pageBlocks = convertJsonToBlocks(page.content_blocks || {})

          // Add navigation and footer from site.settings.user_pages to each page
          // This maintains the UI illusion that nav/footer are page blocks
          const configBlocks = buildUserPagesConfigBlocks(siteResult.data)

          // Combine and sort all blocks by display_order
          const allBlocks = [...configBlocks, ...pageBlocks]
          allBlocks.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          blocksData[page.slug] = allBlocks
        })
        setBlocks(blocksData)
      } else {
        console.error('Failed to load user pages:', pagesResult.error)
      }
    } catch (error) {
      setConfigError('Failed to load user pages data')
      console.error('Error loading site and user pages:', error)
    }

    setConfigLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)

    const pagesResult = await getUserPagesAction(siteId)
    const siteData = currentSite

    if (siteData) {
      setSite(siteData)
    }

    if (pagesResult.data && siteData) {
      setPages(pagesResult.data)

      // Convert JSON content_blocks to blocks format for each page
      const blocksData: Record<string, any[]> = {}
      pagesResult.data.forEach(page => {
        const pageBlocks = convertJsonToBlocks(page.content_blocks || {})

        // Add navigation and footer from site.settings.user_pages to each page
        const configBlocks = buildUserPagesConfigBlocks(siteData)

        // Combine and sort all blocks by display_order
        const allBlocks = [...configBlocks, ...pageBlocks]
        allBlocks.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        blocksData[page.slug] = allBlocks
      })
      setBlocks(blocksData)
    }
    setBlocksLoading(false)
  }

  useEffect(() => {
    loadUserPagesAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    pages,
    blocks,
    configLoading,
    blocksLoading,
    configError,
    reloadBlocks
  }
}
