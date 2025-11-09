import { useState, useEffect } from "react"
import {
  getUserPagesAction,
  type UserPage
} from "@/lib/actions/user-pages/user-pages-actions"
import { getSiteByIdAction, type Site } from "@/lib/actions/sites/site-actions"
import { convertPageJsonToBlocks } from "@/lib/utils/page-block-utils"

interface UseUserPagesDataReturn {
  site: Site | null
  pages: UserPage[]
  blocks: Record<string, any[]>
  configLoading: boolean
  blocksLoading: boolean
  configError: string
  reloadBlocks: () => Promise<void>
}

export function useUserPageData(siteId: string): UseUserPagesDataReturn {
  const [site, setSite] = useState<Site | null>(null)
  const [pages, setPages] = useState<UserPage[]>([])
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadUserPagesAndBlocks = async () => {
    setConfigLoading(true)
    setBlocksLoading(true)
    setConfigError("")

    try {
      // Load site data and pages in parallel for speed
      const [siteResult, pagesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getUserPagesAction(siteId)
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setConfigError(siteResult.error || 'Failed to load site data')
      }

      if (pagesResult.data) {
        setPages(pagesResult.data)

        // Convert JSON content_blocks to blocks format for each page
        const blocksData: Record<string, any[]> = {}
        pagesResult.data.forEach(page => {
          const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})

          // Add navigation and footer from site.settings.user_pages to each page
          // This maintains the UI illusion that nav/footer are page blocks
          const configBlocks = []
          const userPagesSettings = siteResult.data?.settings?.user_pages

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

    // Need to reload both site and pages data to get updated navigation/footer
    const [siteResult, pagesResult] = await Promise.all([
      getSiteByIdAction(siteId),
      getUserPagesAction(siteId)
    ])

    if (siteResult.data) {
      setSite(siteResult.data)
    }

    if (pagesResult.data) {
      setPages(pagesResult.data)

      // Convert JSON content_blocks to blocks format for each page
      const blocksData: Record<string, any[]> = {}
      pagesResult.data.forEach(page => {
        const pageBlocks = convertPageJsonToBlocks(page.content_blocks || {})

        // Add navigation and footer from site.settings.user_pages to each page
        const configBlocks = []
        const userPagesSettings = siteResult.data?.settings?.user_pages

        if (userPagesSettings?.navigation) {
          configBlocks.push({
            id: 'user-pages-navigation',
            type: 'navigation',
            title: 'Navigation',
            content: userPagesSettings.navigation,
            display_order: -1
          })
        }
        if (userPagesSettings?.footer) {
          configBlocks.push({
            id: 'user-pages-footer',
            type: 'footer',
            title: 'Footer',
            content: userPagesSettings.footer,
            display_order: 999
          })
        }

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
