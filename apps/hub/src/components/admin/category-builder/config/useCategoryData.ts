import { useState, useEffect } from 'react'
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
  siteBlocks: Record<string, any[]>
  siteLoading: boolean
  blocksLoading: boolean
  siteError: string
  reloadBlocks: () => Promise<void>
}

export function useCategoryData(siteId: string): UseCategoryDataReturn {
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, CategoryBlock[]>>({})
  const [siteBlocks, setSiteBlocks] = useState<Record<string, any[]>>({})
  const [blocksLoading, setBlocksLoading] = useState(false)

  const loadSiteAndCategories = async () => {
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

      let convertedBlocks: Record<string, CategoryBlock[]> = {}

      if (categoriesResult.data) {
        setCategories(categoriesResult.data)

        categoriesResult.data.forEach((category) => {
          const categoryBlocks = convertContentBlocksToArray(category.content_blocks || {}, category.id)

          const blocksWithTitles = categoryBlocks.map(block => ({
            ...block,
            title: getBlockName(block.type)
          }))

          convertedBlocks[category.slug] = blocksWithTitles
        })

        setBlocks(convertedBlocks)
      } else {
        setCategories([])
        setBlocks({})
      }

      if (siteResult.data) {
        const siteBlocksData: Record<string, any[]> = {}

        Object.keys(convertedBlocks).forEach(categorySlug => {
          const sBlocks = []

          if (siteResult.data?.settings?.navigation) {
            sBlocks.push({
              id: 'site-navigation',
              type: 'navigation',
              title: 'Navigation',
              content: siteResult.data.settings.navigation,
              display_order: -1
            })
          }

          if (siteResult.data?.settings?.footer) {
            sBlocks.push({
              id: 'site-footer',
              type: 'footer',
              title: 'Footer',
              content: siteResult.data.settings.footer,
              display_order: 999
            })
          }

          siteBlocksData[categorySlug] = sBlocks
        })

        setSiteBlocks(siteBlocksData)
      } else {
        setSiteBlocks({})
      }
    } catch (error) {
      setSiteError('Failed to load data')
      console.error('Error loading site and categories:', error)
    }

    setSiteLoading(false)
    setBlocksLoading(false)
  }

  const reloadBlocks = async () => {
    setBlocksLoading(true)
    const categoriesResult = await getCategoriesForSiteAction(siteId)

    if (categoriesResult.data) {
      const convertedBlocks: Record<string, CategoryBlock[]> = {}

      categoriesResult.data.forEach((category) => {
        const categoryBlocks = convertContentBlocksToArray(category.content_blocks || {}, category.id)

        const blocksWithTitles = categoryBlocks.map(block => ({
          ...block,
          title: getBlockName(block.type)
        }))

        convertedBlocks[category.slug] = blocksWithTitles
      })

      setBlocks(convertedBlocks)
    } else {
      setBlocks({})
    }

    setBlocksLoading(false)
  }

  useEffect(() => {
    loadSiteAndCategories()
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    site,
    categories,
    blocks,
    siteBlocks,
    siteLoading,
    blocksLoading,
    siteError,
    reloadBlocks
  }
}
