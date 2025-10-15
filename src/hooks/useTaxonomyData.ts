import { useState, useEffect } from 'react'
import { getSiteByIdAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'
import { getTaxonomiesForTypeAction, type Taxonomy } from '@/lib/actions/taxonomies/taxonomy-actions'
import { convertContentBlocksToArray, getTaxonomyBlockTitle } from '@/lib/utils/taxonomy-block-utils'

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseTaxonomyDataReturn {
  site: SiteWithTheme | null
  taxonomies: Taxonomy[]
  blocks: Record<string, TaxonomyBlock[]>
  siteBlocks: Record<string, any[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useTaxonomyData(siteId: string, taxonomyTypeId: string | null): UseTaxonomyDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, TaxonomyBlock[]>>({})
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndTaxonomies = async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      // Load site and taxonomies in parallel for speed
      const [siteResult, taxonomiesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        taxonomyTypeId ? getTaxonomiesForTypeAction(siteId, taxonomyTypeId) : Promise.resolve({ data: null, error: null })
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      let convertedBlocks: Record<string, TaxonomyBlock[]> = {}

      if (taxonomiesResult.data) {
        setTaxonomies(taxonomiesResult.data)

        // Convert taxonomies with JSON content_blocks to the block format the UI expects
        taxonomiesResult.data.forEach((taxonomy) => {
          // Convert JSON content_blocks to block array format
          const taxonomyBlocks = convertContentBlocksToArray(taxonomy.content_blocks || {}, taxonomy.id)

          // Add titles to blocks
          const blocksWithTitles = taxonomyBlocks.map(block => ({
            ...block,
            title: getTaxonomyBlockTitle(block.type)
          }))

          convertedBlocks[taxonomy.slug] = blocksWithTitles
        })

        setBlocks(convertedBlocks)
      } else {
        setTaxonomies([])
        setBlocks({})
      }

      // Load site blocks (navigation, footer) from site data
      if (siteResult.data) {
        const siteBlocksData: Record<string, any[]> = {}

        // Create navigation and footer blocks from site data for all taxonomies
        Object.keys(convertedBlocks).forEach(taxonomySlug => {
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

          siteBlocksData[taxonomySlug] = siteBlocks
        })

        setSiteBlocks(siteBlocksData)
      } else {
        setSiteBlocks({})
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and taxonomies:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    if (!taxonomyTypeId) return

    setBlocksLoading(true)
    const taxonomiesResult = await getTaxonomiesForTypeAction(siteId, taxonomyTypeId)

    if (taxonomiesResult.data) {
      // Convert taxonomies with JSON content_blocks to the block format the UI expects
      const convertedBlocks: Record<string, TaxonomyBlock[]> = {}

      taxonomiesResult.data.forEach((taxonomy) => {
        // Convert JSON content_blocks to block array format
        const taxonomyBlocks = convertContentBlocksToArray(taxonomy.content_blocks || {}, taxonomy.id)

        // Add titles to blocks
        const blocksWithTitles = taxonomyBlocks.map(block => ({
          ...block,
          title: getTaxonomyBlockTitle(block.type)
        }))

        convertedBlocks[taxonomy.slug] = blocksWithTitles
      })

      setBlocks(convertedBlocks)
    } else {
      setBlocks({})
    }

    setBlocksLoading(false)
  }

  useEffect(() => {
    loadSiteAndTaxonomies()
  }, [siteId, taxonomyTypeId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    taxonomies,
    blocks,
    siteBlocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
