import { useState, useEffect, useCallback } from "react"
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

function getEventBlocksBySlug(events: Array<{ id: string; slug: string; content_blocks?: Record<string, any> | null }>) {
  const convertedBlocks: Record<string, EventBlock[]> = {}

  events.forEach((event) => {
    const eventBlocks = convertContentBlocksToArray(event.content_blocks || {}, event.id)
    convertedBlocks[event.slug] = eventBlocks.map(block => ({
      ...block,
      title: getBlockName(block.type)
    }))
  })

  return convertedBlocks
}

export function useEventData(siteId: string, selectedEvent = ""): UseEventDataReturn {
  const { currentSite } = useSiteSwitcher()
  const [site, setSite] = useState<SiteWithTheme | null>(currentSite)
  const [siteLoading, setSiteLoading] = useState(!currentSite)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, EventBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndBlocks = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Use site from context, only fetch events
      const eventsResult = await getSiteEventsAction(siteId, { selectedSlug: selectedEvent })
      const siteResult = { data: currentSite, error: null }

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      if (eventsResult.data) {
        setBlocks(getEventBlocksBySlug(eventsResult.data))
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
  }, [currentSite, selectedEvent, siteId])

  const reloadBlocks = useCallback(async () => {
    setBlocksLoading(true)
    const eventsResult = await getSiteEventsAction(siteId, { selectedSlug: selectedEvent })

    if (eventsResult.data) {
      setBlocks(getEventBlocksBySlug(eventsResult.data))
    } else {
      setBlocks({})
    }

    setBlocksLoading(false)
  }, [selectedEvent, siteId])


  useEffect(() => {
    loadSiteAndBlocks()
  }, [loadSiteAndBlocks])

  return {
    site,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
