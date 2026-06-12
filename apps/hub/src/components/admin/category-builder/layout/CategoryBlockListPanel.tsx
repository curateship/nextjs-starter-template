"use client"

import { Button } from "@/components/ui/button"
import { LayoutGrid, ExternalLink } from "lucide-react"
import { getBlockName, getBlockTypeDefinition } from "@/components/admin/category-builder/config/category-block-types"
import type { CategoryEditorBlock } from "@/components/admin/category-builder/config/category-block-utils"

// Read-only block list for the category builder: block structure is owned by
// the category template, so blocks can only be selected here, not added/removed.
interface CategoryBlockListPanelProps {
  blocks: CategoryEditorBlock[]
  selectedBlock: CategoryEditorBlock | null
  onSelectBlock: (block: CategoryEditorBlock) => void
  viewPageHref?: string | null
  blocksLoading?: boolean
}

function CategoryBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
}: {
  block: CategoryEditorBlock
  selectedBlock: CategoryEditorBlock | null
  onSelectBlock: (block: CategoryEditorBlock) => void
}) {
  const Icon = getBlockTypeDefinition(block.type)?.icon || LayoutGrid
  const name = block.title || getBlockName(block.type)

  return (
    <button
      type="button"
      className={`block w-full p-3 text-left transition-colors cursor-pointer rounded-lg ${
        selectedBlock?.id === block.id
          ? "bg-muted/60"
          : "opacity-60 hover:opacity-90"
      }`}
      onClick={() => onSelectBlock(block)}
    >
      <span className="flex items-center space-x-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-sm font-medium">{name}</span>
      </span>
    </button>
  )
}

function CategoryBlockListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 rounded-lg opacity-60">
          <div className="flex items-center space-x-2">
            <div className="w-3.5 h-3.5 bg-muted rounded-sm animate-pulse"></div>
            <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CategoryBlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  viewPageHref,
  blocksLoading = false,
}: CategoryBlockListPanelProps) {
  return (
    <div className="w-[250px] sticky top-0 self-start max-h-screen overflow-y-auto px-2.5 pb-2.5 pt-5">
      {blocksLoading ? (
        <div className="mb-4 px-5">
          <div className="h-7 bg-muted rounded animate-pulse w-1/2"></div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-4 px-5">
          <h2 className="text-lg font-semibold">Blocks</h2>
          {viewPageHref && (
            <Button size="sm" variant="outline" className="flex items-center space-x-1" asChild>
              <a href={viewPageHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Page</span>
              </a>
            </Button>
          )}
        </div>
      )}

      {blocksLoading ? (
        <CategoryBlockListSkeleton />
      ) : blocks.length > 0 ? (
        <div className="space-y-0">
          {blocks.map((block) => (
            <CategoryBlockItem
              key={block.id}
              block={block}
              selectedBlock={selectedBlock}
              onSelectBlock={onSelectBlock}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-3 text-xs text-muted-foreground">
          No blocks yet. Blocks are added in the category template.
        </div>
      )}
    </div>
  )
}
