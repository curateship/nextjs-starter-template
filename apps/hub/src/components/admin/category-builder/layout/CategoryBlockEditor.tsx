"use client"

import { CATEGORY_LISTINGS_BLOCK_TYPE } from "@/lib/actions/categories/category-template-inheritance"
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
}

// Routes a selected block to its editor. Template mode edits block config;
// listing mode edits per-category values (the Listings block has none).
export function CategoryBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  mode = "listing",
}: CategoryBlockEditorProps) {
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
