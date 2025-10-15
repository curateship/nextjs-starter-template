import { Button } from "@/components/ui/button"
import { Trash2, Info } from "lucide-react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockListPanelProps {
  currentTaxonomy: {
    slug: string
    name: string
    blocks: TaxonomyBlock[]
  }
  selectedBlock: TaxonomyBlock | null
  onSelectBlock: (block: TaxonomyBlock | null) => void
  onDeleteBlock: (block: TaxonomyBlock) => void
  onReorderBlocks: (blocks: TaxonomyBlock[]) => void
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
  block: TaxonomyBlock
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
      case 'taxonomy-default':
        return <Info className="w-4 h-4" />
      default:
        return <div className="w-4 h-4" />
    }
  }

  const getBlockTypeName = (block: TaxonomyBlock) => {
    return block.type === 'taxonomy-default' ? 'Tag Information' : 'Block'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected ? 'bg-primary/10 border-primary' : 'bg-background hover:bg-muted/50'
      }`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getBlockIcon(block.type)}
          <span className="font-medium text-sm">{getBlockTypeName(block)}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={isDeleting}
          title="Delete block"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

export function BlockListPanel({
  currentTaxonomy,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  deleting,
  blocksLoading = false
}: BlockListPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (active.id !== over.id) {
      const blocks = currentTaxonomy.blocks
      const oldIndex = blocks.findIndex(b => b.id === active.id)
      const newIndex = blocks.findIndex(b => b.id === over.id)

      const reorderedBlocks = arrayMove(blocks, oldIndex, newIndex)
      onReorderBlocks(reorderedBlocks)
    }
  }

  return (
    <div className="w-80 bg-background p-4 overflow-y-auto border-r">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Blocks
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSelectBlock(null)}
        >
          Preview
        </Button>
      </div>

      {blocksLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : currentTaxonomy.blocks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>No blocks added yet</p>
          <p className="mt-1 text-xs">Add blocks from the right panel</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={currentTaxonomy.blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {currentTaxonomy.blocks.map((block) => (
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
    </div>
  )
}
