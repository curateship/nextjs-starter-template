import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteEventsWithMergedBlocksAction } from "@/lib/actions/events/event-actions"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"
import { getBlockName, isEventBuilderBlockType } from "./event-block-types"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { useSiteContentData } from "@/components/admin/layout/builder/useSiteContentData"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface EventRow {
  id: string
  slug: string
  content_blocks?: Record<string, any> | null
}

interface UseEventDataReturn {
  site: SiteWithTheme | null
  blocks: Record<string, EventBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

// Convert event rows to editor blocks keyed by event slug
function getEventBlocksBySlug(events: EventRow[]) {
  const convertedBlocks: Record<string, EventBlock[]> = {}

  events.forEach((event) => {
    const eventBlocks = convertContentBlocksToArray(event.content_blocks || {}, event.id)
    convertedBlocks[event.slug] = eventBlocks
      .filter(block => isEventBuilderBlockType(block.type))
      .map(block => ({
        ...block,
        title: getBlockName(block.type)
      }))
  })

  return convertedBlocks
}

// Stable reference for the generic hook's fetchItems dependency.
// Merged blocks (template structure + event values) — builder preview only.
function fetchEvents(siteId: string, options: { selectedSlug?: string }) {
  return getSiteEventsWithMergedBlocksAction({ data: { siteId: siteId, options: options } })
}

export function useEventData(siteId: string, selectedEvent = ""): UseEventDataReturn {
  // Site comes from the site-switcher context — no extra fetch needed
  const { currentSite } = useSiteSwitcher()

  const { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks } = useSiteContentData<EventRow, EventBlock>({
    siteId,
    selectedSlug: selectedEvent,
    fetchItems: fetchEvents,
    itemsToBlocksBySlug: getEventBlocksBySlug,
    contextSite: currentSite ?? null,
  })

  return { site, blocks, siteLoading, blocksLoading, siteError, reloadBlocks }
}
