"use client"

import { Button } from "@/components/ui/button"
import { getDirectoryLayoutColumn, type DirectoryLayoutColumn } from "@/lib/actions/directories/directory-layout"
import type { DirectoryEditorBlock } from "@/components/admin/directory-builder/config/directory-block-utils"
import { getBlockIcon, getBlockName } from "@/components/admin/directory-builder/config/directory-block-types"
import { ExternalLink } from "lucide-react"

interface DirectoryBlockListPanelProps {
  blocks: DirectoryEditorBlock[]
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
  viewPageHref?: string | null
  blocksLoading?: boolean
}

function DirectoryBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
}: {
  block: DirectoryEditorBlock
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
}) {
  const Icon = getBlockIcon(block.type)
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

function DirectoryColumnSection({
  column,
  blocks,
  selectedBlock,
  onSelectBlock,
}: {
  column: DirectoryLayoutColumn
  blocks: DirectoryEditorBlock[]
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
}) {
  const title = column === "main" ? "Main column" : "Sidebar column"
  const emptyText = column === "main"
    ? "No blocks in main column"
    : "No blocks in sidebar column"

  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between px-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="text-[11px] text-muted-foreground">{blocks.length}</span>
      </div>

      {blocks.length > 0 ? (
        <div className="space-y-0">
          {blocks.map((block) => (
            <DirectoryBlockItem
              key={block.id}
              block={block}
              selectedBlock={selectedBlock}
              onSelectBlock={onSelectBlock}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-3 text-xs text-muted-foreground">{emptyText}</div>
      )}
    </div>
  )
}

function DirectoryBlockListSkeleton() {
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

export function DirectoryBlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  viewPageHref,
  blocksLoading = false,
}: DirectoryBlockListPanelProps) {
  const mainBlocks = blocks.filter((block) => getDirectoryLayoutColumn(block) === "main")
  const sidebarBlocks = blocks.filter((block) => getDirectoryLayoutColumn(block) === "sidebar")

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
        <DirectoryBlockListSkeleton />
      ) : (
        <>
          <DirectoryColumnSection
            column="main"
            blocks={mainBlocks}
            selectedBlock={selectedBlock}
            onSelectBlock={onSelectBlock}
          />
          <DirectoryColumnSection
            column="sidebar"
            blocks={sidebarBlocks}
            selectedBlock={selectedBlock}
            onSelectBlock={onSelectBlock}
          />
        </>
      )}
    </div>
  )
}
