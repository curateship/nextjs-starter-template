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
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getBlockIcon, getBlockName } from "../config/newsletter-block-types"
import type { NewsletterBlock } from "../config/useNewsletterBuilder"

interface BlockListPanelProps {
  blocks: NewsletterBlock[]
  selectedBlock: NewsletterBlock | null
  onSelectBlock: (block: NewsletterBlock) => void
  onDeleteBlock: (block: NewsletterBlock) => void
  onReorderBlocks: (blocks: NewsletterBlock[]) => void
  onPreview?: () => void
  onAddBlock?: () => void
}

function SortableBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  handleDeleteClick
}: {
  block: NewsletterBlock
  selectedBlock: NewsletterBlock | null
  onSelectBlock: (block: NewsletterBlock) => void
  handleDeleteClick: (block: NewsletterBlock) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const Icon = getBlockIcon(block.type)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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
            <h3 className="text-sm font-medium">{block.title}</h3>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteClick(block)
          }}
          title="Delete block"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function BlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onPreview,
  onAddBlock,
}: BlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<NewsletterBlock | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex(b => b.id === active.id)
      const newIndex = blocks.findIndex(b => b.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBlocks(arrayMove(blocks, oldIndex, newIndex))
      }
    }
  }

  const handleDeleteClick = (block: NewsletterBlock) => {
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
        <div className="flex items-center justify-between mb-4 px-5">
          <h2 className="text-lg font-semibold">Blocks</h2>
          {onPreview && (
            <Button
              onClick={onPreview}
              size="sm"
              variant="outline"
              className="flex items-center space-x-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </Button>
          )}
        </div>

        {blocks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <p className="text-base font-medium">No blocks yet</p>
              <p className="text-xs">Click &quot;Add Block&quot; to start building</p>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {blocks.map(block => (
                  <SortableBlockItem
                    key={block.id}
                    block={block}
                    selectedBlock={selectedBlock}
                    onSelectBlock={onSelectBlock}
                    handleDeleteClick={handleDeleteClick}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {onAddBlock && (
          <div className="px-5 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddBlock}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Block
            </Button>
          </div>
        )}
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>
              {blockToDelete && (
                <>Are you sure you want to delete the {getBlockName(blockToDelete.type)} block? It will be removed when you save.</>
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
