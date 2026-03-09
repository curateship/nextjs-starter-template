import { useState, useEffect } from "react"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteDirectoriesAction } from "@/lib/actions/directories/directory-actions"
import { convertContentBlocksToArray, getDirectoryBlockTitle } from "@/lib/utils/directory-block-utils"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseDirectoryDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, DirectoryBlock[]>
  siteBlocks: Record<string, any[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useDirectoryData(siteId: string): UseDirectoryDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, DirectoryBlock[]>>({})
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Load site and directories in parallel for speed
      const [siteResult, directoriesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getSiteDirectoriesAction(siteId)
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      let convertedBlocks: Record<string, DirectoryBlock[]> = {}

      if (directoriesResult.data) {
        // Convert directories with JSON content_blocks to the block format the UI expects
        directoriesResult.data.forEach((directory) => {
          // Convert JSON content_blocks to block array format
          const directoryBlocks = convertContentBlocksToArray(directory.content_blocks || {}, directory.id)

          // Add titles to blocks
          const blocksWithTitles = directoryBlocks.map(block => ({
            ...block,
            title: getDirectoryBlockTitle(block.type)
          }))

          convertedBlocks[directory.slug] = blocksWithTitles
        })

        setBlocks(convertedBlocks)
      } else {
        console.error('Failed to load directories:', directoriesResult.error)
        setBlocks({})
      }

      // Load site blocks (navigation, footer) from site data
      if (siteResult.data) {
        const siteBlocksData: Record<string, any[]> = {}

        // Create navigation and footer blocks from site data for all directories
        Object.keys(convertedBlocks).forEach(directorySlug => {
          const siteBlocks = []

          if (siteResult.data?.settings?.navigation) {
            siteBlocks.push({
              id: 'site-navigation',
              type: 'navigation',
              title: 'Navigation',
              content: siteResult.data.settings.navigation,
              display_order: -1
            })
          }

          if (siteResult.data?.settings?.footer) {
            siteBlocks.push({
              id: 'site-footer',
              type: 'footer',
              title: 'Footer',
              content: siteResult.data.settings.footer,
              display_order: 999
            })
          }

          siteBlocksData[directorySlug] = siteBlocks
        })

        setSiteBlocks(siteBlocksData)
      } else {
        setSiteBlocks({})
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and directories:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const directoriesResult = await getSiteDirectoriesAction(siteId)

    if (directoriesResult.data) {
      // Convert directories with JSON content_blocks to the block format the UI expects
      const convertedBlocks: Record<string, DirectoryBlock[]> = {}

      directoriesResult.data.forEach((directory) => {
        // Convert JSON content_blocks to block array format
        const directoryBlocks = convertContentBlocksToArray(directory.content_blocks || {}, directory.id)

        // Add titles to blocks
        const blocksWithTitles = directoryBlocks.map(block => ({
          ...block,
          title: getDirectoryBlockTitle(block.type)
        }))

        convertedBlocks[directory.slug] = blocksWithTitles
      })

      setBlocks(convertedBlocks)
    } else {
      setBlocks({})
    }

    setBlocksLoading(false)
  }


  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    blocks,
    siteBlocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
