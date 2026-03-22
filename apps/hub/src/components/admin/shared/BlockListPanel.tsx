"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, GripVertical, Eye, Plus } from "lucide-react"
import type { BlockTypeDefinition } from "@/components/admin/shared/block-types"
import { getBlockIcon, getBlockName } from "@/components/admin/shared/block-types"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/** Generic block interface for the panel */
export interface ListBlock {
  id: string
  type: string
  title?: string
  content?: Record<string, any>
}

interface BlockListPanelProps {
  blocks: ListBlock[]
  selectedBlock: any
  onSelectBlock: (block: any) => void
  onDeleteBlock: (block: any) => void
  onReorderBlocks: (blocks: any[]) => void
  onPreview?: () => void
  onAddBlock?: () => void
  deleting: string | null
  blocksLoading?: boolean
  /** Block types config — used for icons and names */
  blockTypes: BlockTypeDefinition[]
  /** Entity name for empty state text, e.g. "event" */
  entityName?: string
  /** Optional set of block IDs that cannot be deleted */
  lockedBlockIds?: Set<string>
  /** Optional label for locked blocks */
  lockedLabel?: string
}

/** Sortable block item used inside the DnD context */
function SortableBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  deleting,
  blockTypes,
  handleDeleteClick,
  isLocked,
  lockedLabel,
}: {
  block: ListBlock
  selectedBlock: any
  onSelectBlock: (block: any) => void
  deleting: string | null
  blockTypes: BlockTypeDefinition[]
  handleDeleteClick: (block: ListBlock) => void
  isLocked?: boolean
  lockedLabel?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = getBlockIcon(blockTypes, block.type, GripVertical)
  const name = block.title || getBlockName(blockTypes, block.type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 transition-colors cursor-pointer rounded-lg ${
        selectedBlock?.id === block.id
          ? 'bg-muted/60'
          : 'opacity-60 hover:opacity-90'
      }`}
      onClick={() => onSelectBlock(block)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
          </div>
          <div className="flex items-center space-x-2">
            <Icon className="w-3.5 h-3.5" />
            <h3 className="text-sm font-medium">{name}</h3>
            {isLocked && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {lockedLabel || "Required"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {!isLocked && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteClick(block)
              }}
              disabled={deleting === block.id}
              title="Delete block"
            >
              {deleting === block.id ? (
                <div className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-red-600"></div>
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Shared BlockListPanel used by all builders.
 * Shows a sortable list of blocks with drag-and-drop, delete confirmation, loading skeletons, and empty state.
 */
export function BlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onPreview,
  onAddBlock,
  deleting,
  blocksLoading = false,
  blockTypes,
  entityName = "content",
  lockedBlockIds,
  lockedLabel,
}: BlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<ListBlock | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id)
      const newIndex = blocks.findIndex((block) => block.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBlocks(arrayMove(blocks, oldIndex, newIndex))
      }
    }
  }

  const handleDeleteClick = (block: ListBlock) => {
    setBlockToDelete(block)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (blockToDelete) onDeleteBlock(blockToDelete)
    setDeleteConfirmOpen(false)
    setBlockToDelete(null)
  }

  return (
    <>
      <div className="w-[250px] p-2.5 sticky top-0 self-start max-h-screen overflow-y-auto">
        {/* Header */}
        {blocksLoading ? (
          <div className="mb-4 px-5">
            <div className="h-7 bg-muted rounded animate-pulse w-1/2"></div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-4 px-5">
            <h2 className="text-lg font-semibold">Blocks</h2>
            {onPreview && (
              <Button onClick={onPreview} size="sm" variant="outline" className="flex items-center space-x-1">
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </Button>
            )}
          </div>
        )}

        {/* Block list */}
        {blocksLoading ? (
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-muted rounded animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded animate-pulse mb-2"></div>
                    <div className="h-3 bg-muted/50 rounded animate-pulse w-2/3"></div>
                  </div>
                  <div className="w-5 h-5 bg-muted rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <p className="text-base font-medium">No blocks added yet</p>
              <p className="text-xs">Click &quot;Add Blocks&quot; to start building your {entityName}</p>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(block => block.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {blocks.map((block) => (
                  <SortableBlockItem
                    key={block.id}
                    block={block}
                    selectedBlock={selectedBlock}
                    onSelectBlock={onSelectBlock}
                    deleting={deleting}
                    blockTypes={blockTypes}
                    handleDeleteClick={handleDeleteClick}
                    isLocked={lockedBlockIds?.has(block.id)}
                    lockedLabel={lockedLabel}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add Block button */}
        {onAddBlock && (
          <div className="px-5 mt-3">
            <Button variant="outline" size="sm" onClick={onAddBlock}>
              <Plus className="w-4 h-4 mr-1" />
              Add Block
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>
              {blockToDelete && (
                <>Are you sure you want to delete the {getBlockName(blockTypes, blockToDelete.type)} block? It will be removed when you save.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete Block</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
