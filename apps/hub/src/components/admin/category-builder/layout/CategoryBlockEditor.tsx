"use client"

import { CATEGORY_CORE_BLOCK_TYPE, CATEGORY_LISTINGS_BLOCK_TYPE } from "@/lib/actions/categories/category-template-inheritance"
import { CategoryCoreBlock } from "@/components/admin/category-builder/blocks/core/CategoryCoreBlock"
import { CategoryCoreTemplateBlock } from "@/components/admin/category-builder/blocks/core/CategoryCoreTemplateBlock"
import { CategoryListingsBlock } from "@/components/admin/category-builder/blocks/listings/CategoryListingsBlock"
import { CategoryListingsInfoBlock } from "@/components/admin/category-builder/blocks/listings/CategoryListingsInfoBlock"

export type CategoryBlockEditorMode = "listing" | "template"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface CategoryBlockEditorProps {
  block: CategoryBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  mode?: CategoryBlockEditorMode
  // Core block only: title/featured image write through to the category row
  categoryTitle?: string
  categoryFeaturedImage?: string | null
  onCategoryTitleChange?: (title: string) => void
  onCategoryFeaturedImageChange?: (featuredImage: string) => void
}

// Routes a selected block to its editor. Template mode edits block config;
// listing mode edits per-category values (title/image/rich text for Core).
export function CategoryBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  mode = "listing",
  categoryTitle,
  categoryFeaturedImage,
  onCategoryTitleChange,
  onCategoryFeaturedImageChange,
}: CategoryBlockEditorProps) {
  if (block.type === CATEGORY_CORE_BLOCK_TYPE) {
    if (mode === "template") {
      return (
        <CategoryCoreTemplateBlock
          content={content}
          onContentChange={onContentChange}
        />
      )
    }

    return (
      <CategoryCoreBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
        categoryTitle={categoryTitle}
        categoryFeaturedImage={categoryFeaturedImage}
        onCategoryTitleChange={onCategoryTitleChange}
        onCategoryFeaturedImageChange={onCategoryFeaturedImageChange}
      />
    )
  }

  if (block.type === CATEGORY_LISTINGS_BLOCK_TYPE) {
    if (mode === "template") {
      return (
        <CategoryListingsBlock
          siteId={siteId}
          content={content}
          onContentChange={onContentChange}
        />
      )
    }

    return <CategoryListingsInfoBlock />
  }

  return null
}
