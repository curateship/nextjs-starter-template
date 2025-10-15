import { useState, useEffect } from 'react'
import { getTaxonomiesForTypeAction, type Taxonomy } from '@/lib/actions/taxonomies/taxonomy-actions'
import { taxonomyBlockUtils } from '@/lib/utils/taxonomy-block-utils'

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export function useTaxonomyData(siteId: string, taxonomyTypeId: string | null) {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [blocks, setBlocks] = useState<Record<string, TaxonomyBlock[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTaxonomies() {
      if (!siteId || !taxonomyTypeId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await getTaxonomiesForTypeAction(siteId, taxonomyTypeId)

        if (fetchError) {
          setError(fetchError)
          return
        }

        if (data) {
          setTaxonomies(data)

          // Convert taxonomy content_blocks to block arrays
          const blocksMap: Record<string, TaxonomyBlock[]> = {}
          data.forEach((taxonomy) => {
            if (taxonomy.slug) {
              blocksMap[taxonomy.slug] = taxonomyBlockUtils.convertJsonToBlocks(
                taxonomy.content_blocks || {}
              )
            }
          })
          setBlocks(blocksMap)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load taxonomies')
      } finally {
        setLoading(false)
      }
    }

    loadTaxonomies()
  }, [siteId, taxonomyTypeId])

  const reloadBlocks = async () => {
    if (!siteId || !taxonomyTypeId) return

    const { data, error: fetchError } = await getTaxonomiesForTypeAction(siteId, taxonomyTypeId)

    if (fetchError || !data) return

    const blocksMap: Record<string, TaxonomyBlock[]> = {}
    data.forEach((taxonomy) => {
      if (taxonomy.slug) {
        blocksMap[taxonomy.slug] = taxonomyBlockUtils.convertJsonToBlocks(
          taxonomy.content_blocks || {}
        )
      }
    })
    setBlocks(blocksMap)
  }

  return {
    taxonomies,
    blocks,
    loading,
    error,
    reloadBlocks
  }
}
