import { useState, useEffect } from "react"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteEventsAction } from "@/lib/actions/events/event-actions"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"
import { getBlockName } from "./event-block-types"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseEventDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, EventBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useEventData(siteId: string): UseEventDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<SiteWithTheme | null>(currentSite)
  const [siteLoading, setSiteLoading] = useState(!currentSite)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, EventBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Use site from context, only fetch events
      const eventsResult = await getSiteEventsAction(siteId)
      const siteResult = { data: currentSite, error: null }

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      let convertedBlocks: Record<string, EventBlock[]> = {}

      if (eventsResult.data) {
        // Convert events with JSON content_blocks to the block format the UI expects
        eventsResult.data.forEach((event) => {
          // Convert JSON content_blocks to block array format
          const eventBlocks = convertContentBlocksToArray(event.content_blocks || {}, event.id)

          // Add titles to blocks
          const blocksWithTitles = eventBlocks.map(block => ({
            ...block,
            title: getBlockName(block.type)
          }))

          convertedBlocks[event.slug] = blocksWithTitles
        })

        setBlocks(convertedBlocks)
      } else {
        console.error('Failed to load events:', eventsResult.error)
        setBlocks({})
      }

    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and events:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const eventsResult = await getSiteEventsAction(siteId)

    if (eventsResult.data) {
      // Convert events with JSON content_blocks to the block format the UI expects
      const convertedBlocks: Record<string, EventBlock[]> = {}

      eventsResult.data.forEach((event) => {
        // Convert JSON content_blocks to block array format
        const eventBlocks = convertContentBlocksToArray(event.content_blocks || {}, event.id)

        // Add titles to blocks
        const blocksWithTitles = eventBlocks.map(block => ({
          ...block,
          title: getBlockName(block.type)
        }))

        convertedBlocks[event.slug] = blocksWithTitles
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
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
