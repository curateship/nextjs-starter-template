import { useState, useEffect } from "react"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteDirectoriesAction } from "@/lib/actions/directories/directory-actions"
import { getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"
import { getBlockName } from "./directory-block-types"
import { useSiteSwitcher } from "@/components/admin/layout/site-switcher-provider"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

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
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useDirectoryData(siteId: string): UseDirectoryDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<SiteWithTheme | null>(currentSite)
  const [siteLoading, setSiteLoading] = useState(!currentSite)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, DirectoryBlock[]>>({})
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [blocksLoading, setBlocksLoading] = useState(false)

  const mapBlocksWithTitles = (
    directoriesData: NonNullable<Awaited<ReturnType<typeof getSiteDirectoriesAction>>['data']>,
    templates: DirectoryCustomBlockTemplate[]
  ) => {
    const templateMap = new Map(templates.map(template => [template.id, template]))
    const convertedBlocks: Record<string, DirectoryBlock[]> = {}

    directoriesData.forEach((directory) => {
      const directoryBlocks = convertContentBlocksToArray(directory.content_blocks || {}, directory.id)

      const blocksWithTitles = directoryBlocks.map(block => {
        if (block.type === 'directory-custom') {
          const templateId = block.content?.templateId
          const template = typeof templateId === 'string' ? templateMap.get(templateId) : undefined
          return {
            ...block,
            title: template?.name || block.title || 'Custom Block'
          }
        }

        return {
          ...block,
          title: block.title || getBlockName(block.type)
        }
      })

      convertedBlocks[directory.slug] = blocksWithTitles
    })

    return convertedBlocks
  }

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Use site from context, only fetch directories
      const [directoriesResult, customBlocksResult] = await Promise.all([
        getSiteDirectoriesAction(siteId),
        getDirectoryCustomBlocksBySite(siteId),
      ])
      const siteResult = { data: currentSite, error: null }

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      const templates = customBlocksResult.data || []
      setCustomBlockTemplates(templates)

      if (directoriesResult.data) {
        const convertedBlocks = mapBlocksWithTitles(directoriesResult.data, templates)

        setBlocks(convertedBlocks)
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
      } else {
        console.error('Failed to load directories:', directoriesResult.error)
        setBlocks({})
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
    const [directoriesResult, customBlocksResult] = await Promise.all([
      getSiteDirectoriesAction(siteId),
      getDirectoryCustomBlocksBySite(siteId),
    ])

    const templates = customBlocksResult.data || []
    setCustomBlockTemplates(templates)

    if (directoriesResult.data) {
      setBlocks(mapBlocksWithTitles(directoriesResult.data, templates))
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
    customBlockTemplates,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
