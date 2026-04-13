import { useState, useEffect } from "react"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getDirectoryBySlugAction, type Directory } from "@/lib/actions/directories/directory-actions"
import { getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { parseDirectoryBlocksFromJson, type DirectoryEditorBlock } from "./directory-block-utils"

interface UseDirectoryDataReturn {
  site: SiteWithTheme | null
  directory: Directory | null
  blocks: Record<string, DirectoryEditorBlock[]>
  siteBlocks: Record<string, any[]>
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useDirectoryData(siteId: string, selectedDirectory: string): UseDirectoryDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<SiteWithTheme | null>(currentSite)
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [siteLoading, setSiteLoading] = useState(!currentSite)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, DirectoryEditorBlock[]>>({})
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [blocksLoading, setBlocksLoading] = useState(false)

  const buildSiteBlocks = (siteData: SiteWithTheme | null, directorySlug: string) => {
    const blocksForDirectory = []

    if (siteData?.settings?.navigation) {
      blocksForDirectory.push({
        id: 'site-navigation',
        type: 'navigation',
        title: 'Navigation',
        content: siteData.settings.navigation,
        display_order: -1,
      })
    }

    if (siteData?.settings?.footer) {
      blocksForDirectory.push({
        id: 'site-footer',
        type: 'footer',
        title: 'Footer',
        content: siteData.settings.footer,
        display_order: 999,
      })
    }

    return {
      [directorySlug]: blocksForDirectory,
    }
  }

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      const [directoryResult, customBlocksResult] = await Promise.all([
        selectedDirectory ? getDirectoryBySlugAction(siteId, selectedDirectory) : Promise.resolve({ data: null, error: null }),
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

      if (directoryResult.data) {
        setDirectory(directoryResult.data)
        setBlocks({
          [directoryResult.data.slug]: parseDirectoryBlocksFromJson(directoryResult.data.content_blocks || {}, templates),
        })
        setSiteBlocks(buildSiteBlocks(siteResult.data, directoryResult.data.slug))
      } else {
        if (directoryResult.error) {
          console.error('Failed to load directory:', directoryResult.error)
        }
        setDirectory(null)
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
    if (!selectedDirectory) {
      setDirectory(null)
      setBlocks({})
      setSiteBlocks({})
      return
    }

    setBlocksLoading(true)
    const [directoryResult, customBlocksResult] = await Promise.all([
      getDirectoryBySlugAction(siteId, selectedDirectory),
      getDirectoryCustomBlocksBySite(siteId),
    ])

    const templates = customBlocksResult.data || []
    setCustomBlockTemplates(templates)

    if (directoryResult.data) {
      setDirectory(directoryResult.data)
      setBlocks({
        [directoryResult.data.slug]: parseDirectoryBlocksFromJson(directoryResult.data.content_blocks || {}, templates),
      })
      setSiteBlocks(buildSiteBlocks(currentSite, directoryResult.data.slug))
    } else {
      setDirectory(null)
      setBlocks({})
      setSiteBlocks({})
    }

    setBlocksLoading(false)
  }


  useEffect(() => {
    loadSiteAndBlocks()
  }, [siteId, selectedDirectory]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    directory,
    blocks,
    siteBlocks,
    customBlockTemplates,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
