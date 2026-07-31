"use client"

import { Button } from "@/components/ui/button"
import { AdminLoading } from "@/components/admin/layout/loading"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import { getBlockName, getBlockTypeDefinition } from "@/components/admin/event-builder/config/event-block-types"
import type { EventEditorBlock } from "@/components/admin/event-builder/config/event-block-utils"

// Read-only block list for the event builder: block structure is owned by the
// event template, so blocks can only be selected here, not added/removed.
interface EventBlockListPanelProps {
  blocks: EventEditorBlock[]
  selectedBlock: EventEditorBlock | null
  onSelectBlock: (block: EventEditorBlock) => void
  viewPageHref?: string | null
  blocksLoading?: boolean
}

function EventBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
}: {
  block: EventEditorBlock
  selectedBlock: EventEditorBlock | null
  onSelectBlock: (block: EventEditorBlock) => void
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

export function EventBlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  viewPageHref,
  blocksLoading = false,
}: EventBlockListPanelProps) {
  return (
    <div className="w-[250px] sticky top-0 self-start max-h-screen overflow-y-auto px-2.5 pb-2.5 pt-5">
      {blocksLoading ? (
        <div className="mb-4 px-5">
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
        <AdminLoading className="min-h-64" />
      ) : blocks.length > 0 ? (
        <div className="space-y-0">
          {blocks.map((block) => (
            <EventBlockItem
              key={block.id}
              block={block}
              selectedBlock={selectedBlock}
              onSelectBlock={onSelectBlock}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-3 text-xs text-muted-foreground">
          No blocks yet. Blocks are added in the event template.
        </div>
      )}
    </div>
  )
}
