import { Button } from "@/components/ui/button"
import { Trash2, GripVertical, FileText, Eye, Plus } from "lucide-react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockListPanelProps {
  currentCategory: {
    slug: string
    name: string
    blocks: CategoryBlock[]
  }
  selectedBlock: CategoryBlock | null
  onSelectBlock: (block: CategoryBlock | null) => void
  onDeleteBlock: (block: CategoryBlock) => void
  onReorderBlocks: (blocks: CategoryBlock[]) => void
  onPreviewCategory?: () => void
  onAddBlock?: () => void
  deleting: string | null
  blocksLoading?: boolean
}

function SortableBlockItem({
  block,
  isSelected,
  onSelect,
  onDelete,
  isDeleting
}: {
  block: CategoryBlock
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getBlockIcon = (blockType: string) => {
    switch (blockType) {
      case 'taxonomy-content':
        return <FileText className="w-3.5 h-3.5" />
      default:
        return <div className="w-3.5 h-3.5" />
    }
  }

  const getBlockTypeName = (block: CategoryBlock) => {
    return block.type === 'taxonomy-content' ? 'Content' : 'Block'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 cursor-pointer transition-all rounded-lg ${
        isSelected ? 'bg-muted/60' : 'opacity-60 hover:opacity-90'
      }`}
      onClick={onSelect}
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
            {getBlockIcon(block.type)}
            <span className="font-medium text-sm">{getBlockTypeName(block)}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={isDeleting}
          title="Delete block"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function BlockListPanel({
  currentCategory,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onPreviewCategory,
  onAddBlock,
  deleting,
  blocksLoading = false
}: BlockListPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over.id) {
      const blocks = currentCategory.blocks
      const oldIndex = blocks.findIndex(b => b.id === active.id)
      const newIndex = blocks.findIndex(b => b.id === over.id)

      const reorderedBlocks = arrayMove(blocks, oldIndex, newIndex)
      onReorderBlocks(reorderedBlocks)
    }
  }

  return (
    <div className="w-[250px] p-2.5 sticky top-0 self-start max-h-screen overflow-y-auto">
      {blocksLoading ? (
        <div className="mb-4 px-5">
          <div className="h-7 bg-muted rounded animate-pulse w-1/2"></div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-4 px-5">
          <h2 className="text-lg font-semibold">
            Blocks
          </h2>
          {onPreviewCategory && (
            <Button
              onClick={onPreviewCategory}
              size="sm"
              variant="outline"
              className="flex items-center space-x-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </Button>
          )}
        </div>
      )}

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
      ) : currentCategory.blocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            <p className="text-base font-medium">No blocks added yet</p>
            <p className="text-xs">Click &quot;Add Blocks&quot; to start building your category</p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={currentCategory.blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0">
              {currentCategory.blocks.map((block) => (
                <SortableBlockItem
                  key={block.id}
                  block={block}
                  isSelected={selectedBlock?.id === block.id}
                  onSelect={() => onSelectBlock(block)}
                  onDelete={() => onDeleteBlock(block)}
                  isDeleting={deleting === block.id}
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
  )
}
