import { useState, useEffect, useCallback } from "react"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getDirectoryBuilderDataAction, type Directory } from "@/lib/actions/directories/directory-actions"
import type { DirectorySummary } from "@/lib/actions/directories/directory-list-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { parseDirectoryBlocksFromJson, type DirectoryEditorBlock } from "./directory-block-utils"

type DirectoryBuilderDataResult = Awaited<ReturnType<typeof getDirectoryBuilderDataAction>>

const DIRECTORY_BUILDER_DATA_CACHE_TTL_MS = 3000
const directoryBuilderRequestCache = new Map<string, { expiresAt: number; promise: Promise<DirectoryBuilderDataResult> }>()

function getDirectoryBuilderRequestKey(siteId: string, selectedDirectory: string) {
  return `${siteId}::${selectedDirectory}`
}

function loadDirectoryBuilderData(
  siteId: string,
  selectedDirectory: string,
  options?: { bypassCache?: boolean }
) {
  const requestKey = getDirectoryBuilderRequestKey(siteId, selectedDirectory)

  if (!options?.bypassCache) {
    const cached = directoryBuilderRequestCache.get(requestKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise
    }
  }

  const promise = getDirectoryBuilderDataAction(siteId, selectedDirectory)
  directoryBuilderRequestCache.set(requestKey, {
    expiresAt: Date.now() + DIRECTORY_BUILDER_DATA_CACHE_TTL_MS,
    promise,
  })

  return promise
}

interface UseDirectoryBuilderDataReturn {
  site: SiteWithTheme | null
  directory: Directory | null
  directoryOptions: DirectorySummary[]
  blocks: Record<string, DirectoryEditorBlock[]>
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useDirectoryBuilderData(siteId: string, selectedDirectory: string): UseDirectoryBuilderDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [siteLoading, setSiteLoading] = useState(!currentSite)
  const [siteError, setSiteError] = useState("")
  const [directoryOptions, setDirectoryOptions] = useState<DirectorySummary[]>([])
  const [blocks, setBlocks] = useState<Record<string, DirectoryEditorBlock[]>>({})
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [blocksLoading, setBlocksLoading] = useState(false)

  useEffect(() => {
    setSiteLoading(!currentSite)
  }, [currentSite])

  const loadSelectedDirectory = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      const { data, error } = await loadDirectoryBuilderData(siteId, selectedDirectory)

      if (error || !data) {
        setSiteError(error || 'Failed to load data')
        setDirectory(null)
        setDirectoryOptions([])
        setBlocks({})
        setCustomBlockTemplates([])
      } else {
        setDirectoryOptions(data.directoryOptions)
        setCustomBlockTemplates(data.customBlockTemplates)

        if (data.directory) {
          setDirectory(data.directory)
          setBlocks({
            [data.directory.slug]: parseDirectoryBlocksFromJson(data.directory.content_blocks || {}, data.customBlockTemplates),
          })
        } else {
          setDirectory(null)
          setBlocks({})
        }
      }
    } catch (error) {
      setSiteError('Failed to load data')
      setDirectory(null)
      setDirectoryOptions([])
      setBlocks({})
      setCustomBlockTemplates([])
      console.error('Error loading directory builder data:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }, [siteId, selectedDirectory])

  const reloadBlocks = useCallback(async () => {
    if (!selectedDirectory) {
      setDirectory(null)
      setBlocks({})
      return
    }

    setBlocksLoading(true)

    try {
      const { data, error } = await loadDirectoryBuilderData(siteId, selectedDirectory, {
        bypassCache: true,
      })

      if (error || !data) {
        setSiteError(error || 'Failed to load data')
        setDirectory(null)
        setDirectoryOptions([])
        setBlocks({})
        setCustomBlockTemplates([])
      } else {
        setSiteError("")
        setDirectoryOptions(data.directoryOptions)
        setCustomBlockTemplates(data.customBlockTemplates)

        if (data.directory) {
          setDirectory(data.directory)
          setBlocks({
            [data.directory.slug]: parseDirectoryBlocksFromJson(data.directory.content_blocks || {}, data.customBlockTemplates),
          })
        } else {
          setDirectory(null)
          setBlocks({})
        }
      }
    } catch (error) {
      setSiteError('Failed to load data')
      setDirectory(null)
      setDirectoryOptions([])
      setBlocks({})
      setCustomBlockTemplates([])
      console.error('Error reloading directory builder data:', error)
    }

    setBlocksLoading(false)
  }, [siteId, selectedDirectory])

  useEffect(() => {
    loadSelectedDirectory()
  }, [loadSelectedDirectory])

  return {
    site: currentSite,
    directory,
    directoryOptions,
    blocks,
    customBlockTemplates,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
