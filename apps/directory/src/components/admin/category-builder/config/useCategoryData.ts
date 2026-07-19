import { type SiteWithTheme } from '@/lib/actions/sites/site-actions'
import { getCategoriesWithMergedBlocksAction, type Category } from '@/lib/actions/categories/category-actions'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName, isCategoryBuilderBlockType } from './category-block-types'
import { useSiteContentData } from '@/components/admin/layout/builder/useSiteContentData'

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

// Convert category rows to editor blocks keyed by category slug
function getCategoryBlocksBySlug(categories: Category[]) {
  const convertedBlocks: Record<string, CategoryBlock[]> = {}

  categories.forEach((category) => {
    const categoryBlocks = convertContentBlocksToArray(category.content_blocks || {}, category.id)
    convertedBlocks[category.slug] = categoryBlocks
      .filter(block => isCategoryBuilderBlockType(block.type))
      .map(block => ({
        ...block,
        title: getBlockName(block.type)
      }))
  })

  return convertedBlocks
}

// Stable reference for the generic hook's fetchItems dependency.
// Merged blocks (template structure + category values) — builder preview only.
function fetchCategories(siteId: string, options: { selectedSlug?: string }) {
  return getCategoriesWithMergedBlocksAction({ data: { siteId: siteId, options: options } })
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

export function useCategoryData(siteId: string, selectedCategory = ""): UseCategoryDataReturn {
  const { items: categories, ...rest } = useSiteContentData<Category, CategoryBlock>({
    siteId,
    selectedSlug: selectedCategory,
    fetchItems: fetchCategories,
    itemsToBlocksBySlug: getCategoryBlocksBySlug,
  })

  return { categories, ...rest }
}
