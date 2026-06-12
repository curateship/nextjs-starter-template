import { LayoutGrid } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"
import { CATEGORY_LISTINGS_BLOCK_TYPE } from "@/lib/actions/categories/category-template-inheritance"

export type { BlockTypeDefinition }

export const CATEGORY_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: CATEGORY_LISTINGS_BLOCK_TYPE,
    name: 'Listings',
    icon: LayoutGrid,
    description: 'Lists content related to the category being viewed',
    // Template-owned config only; the rendered category is injected at runtime
    defaultContent: {
      title: '',
      subtitle: '',
      contentType: 'directory',
      listingStyle: 'directory',
      imageFit: 'crop',
      imageQuality: 25,
      saveIconOpacity: 70,
      categoryChipParentIds: [],
      displayMode: 'grid',
      itemsToShow: 6,
      columns: 3,
      sortBy: 'date',
      sortOrder: 'desc',
      visibility: {},
    },
  },
]

const CATEGORY_BLOCK_TYPE_SET = new Set(CATEGORY_BLOCK_TYPES.map(blockType => blockType.type))

export function isCategoryBuilderBlockType(type: string | null | undefined) {
  return !!type && CATEGORY_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(CATEGORY_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(CATEGORY_BLOCK_TYPES, type)
}
