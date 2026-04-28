import { useState, useEffect, useCallback } from 'react'
import { getSiteByIdAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'
import { getCategoriesForSiteAction, type Category } from '@/lib/actions/categories/category-actions'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName } from './category-block-types'

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseCategoryDataReturn {
  site: SiteWithTheme | null
  categories: Category[]
  blocks: Record<string, CategoryBlock[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

function getCategoryBlocksBySlug(categories: Category[]) {
  const convertedBlocks: Record<string, CategoryBlock[]> = {}

  categories.forEach((category) => {
    const categoryBlocks = convertContentBlocksToArray(category.content_blocks || {}, category.id)
    convertedBlocks[category.slug] = categoryBlocks.map(block => ({
      ...block,
      title: getBlockName(block.type)
    }))
  })

  return convertedBlocks
}

export function useCategoryData(siteId: string): UseCategoryDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, CategoryBlock[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndCategories = useCallback(async () => {
    setSiteLoading(true)
    setBlocksLoading(true)
    setSiteError("")

    try {
      const [siteResult, categoriesResult] = await Promise.all([
        getSiteByIdAction(siteId),
        getCategoriesForSiteAction(siteId)
      ])

      if (siteResult.data) {
        setSite(siteResult.data)
      } else {
        setSiteError(siteResult.error || 'Failed to load site')
      }

      if (categoriesResult.data) {
        setCategories(categoriesResult.data)
        setBlocks(getCategoryBlocksBySlug(categoriesResult.data))
      } else {
        setCategories([])
        setBlocks({})
      }

    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and categories:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }, [siteId])

  const reloadBlocks = useCallback(async () => {
    setBlocksLoading(true)
    const categoriesResult = await getCategoriesForSiteAction(siteId)

    if (categoriesResult.data) {
      setBlocks(getCategoryBlocksBySlug(categoriesResult.data))
    } else {
      setBlocks({})
    }

    setBlocksLoading(false)
  }, [siteId])

  useEffect(() => {
    loadSiteAndCategories()
  }, [loadSiteAndCategories])

  return {
    site,
    categories,
    blocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
