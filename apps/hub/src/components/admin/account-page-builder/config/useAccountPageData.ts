import { useState, useEffect } from "react"
import {
  getAccountPagesAction,
  type AccountPage
} from "@/lib/actions/account-pages/account-pages-actions"
import type { Site } from "@/lib/actions/sites/site-actions"
import { convertJsonToBlocks } from "@/lib/utils/block-utils"
import { isSupportedAccountPageBlockType } from "@/lib/constants/account-page-block-types"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"

function getContentOnlyBlocks(contentBlocks: Record<string, any>) {
  return convertJsonToBlocks(contentBlocks).filter((block) => isSupportedAccountPageBlockType(block.type))
}

interface UseAccountPagesDataReturn {
  site: Site | null
  pages: AccountPage[]
  blocks: Record<string, any[]>
  configLoading: boolean
  blocksLoading: boolean
  configError: string
  reloadBlocks: () => Promise<void>
}

export function useAccountPageData(siteId: string): UseAccountPagesDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<Site | null>(currentSite)
  const [pages, setPages] = useState<AccountPage[]>([])
  const [configLoading, setConfigLoading] = useState(!currentSite)
  const [configError, setConfigError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadAccountPagesAndBlocks = async () => {
    setConfigLoading(true)
    setBlocksLoading(true)
    setConfigError("")

    try {
      // Use site from context, only fetch pages
      const pagesResult = await getAccountPagesAction(siteId)
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
          blocksData[page.slug] = getContentOnlyBlocks(page.content_blocks || {})
        })
        setBlocks(blocksData)
      } else {
        console.error('Failed to load account pages:', pagesResult.error)
      }
    } catch (error) {
      setConfigError('Failed to load account pages data')
      console.error('Error loading site and account pages:', error)
    }

    setConfigLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)

    const pagesResult = await getAccountPagesAction(siteId)
    const siteData = currentSite

    if (siteData) {
      setSite(siteData)
    }

    if (pagesResult.data && siteData) {
      setPages(pagesResult.data)

      // Convert JSON content_blocks to blocks format for each page
      const blocksData: Record<string, any[]> = {}
      pagesResult.data.forEach(page => {
        blocksData[page.slug] = getContentOnlyBlocks(page.content_blocks || {})
      })
      setBlocks(blocksData)
    }
    setBlocksLoading(false)
  }

  useEffect(() => {
    loadAccountPagesAndBlocks()
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
