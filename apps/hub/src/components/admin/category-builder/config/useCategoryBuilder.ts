import { updateCategoryBlocksAction } from "@/lib/actions/categories/category-actions"
import { getBlockTypeDefinition } from "./category-block-types"
import {
  useContentBlocksEditor,
  type BuilderBlockSelection,
} from "@/components/admin/layout/builder/useContentBlocksEditor"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseCategoryBuilderParams {
  blocks: Record<string, CategoryBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, CategoryBlock[]>>>
  selectedCategory: string
  categoryId?: string
  currentCategory?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseCategoryBuilderReturn {
  selectedBlock: CategoryBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<CategoryBlock | null>>
  isSaving: boolean
  saveMessage: string
  handleDeleteBlock: (block: CategoryBlock) => void
  handleReorderBlocks: (blocks: CategoryBlock[]) => void
  handleAddBlocks: (selections: BuilderBlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

// Thin wrapper over the shared slug-keyed blocks editor; supplies the category
// block registry, id format, and save action.
export function useCategoryBuilder({
  blocks,
  setBlocks,
  selectedCategory,
  categoryId,
  currentCategory
}: UseCategoryBuilderParams): UseCategoryBuilderReturn {
  return useContentBlocksEditor<CategoryBlock>({
    blocks,
    setBlocks,
    selectedKey: selectedCategory,
    contentId: categoryId,
    existingContentBlocks: currentCategory?.content_blocks,
    getDefinition: getBlockTypeDefinition,
    makeBlock: (type, definition) => ({
      id: `block-${Date.now()}-${Math.random()}`,
      type,
      title: definition.name,
      content: { ...definition.defaultContent }
    }),
    saveAction: updateCategoryBlocksAction,
    missingIdMessage: "Error: Category ID required",
  })
}
