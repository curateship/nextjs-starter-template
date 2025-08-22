import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, GripVertical, Zap, FileText, Navigation, Mouse, HelpCircle, LayoutGrid, Minus } from "lucide-react"
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
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isBlockTypeProtected, getBlockProtectionReason } from "@/lib/shared-blocks/block-utils"

interface Block {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
  created_at?: string
  updated_at?: string
}

interface CurrentPage {
  slug: string
  name: string
  blocks: Block[]
}

interface BlockListPanelProps {
  currentPage: CurrentPage
  selectedBlock: Block | null
  onSelectBlock: (block: Block) => void
  onDeleteBlock: (block: Block) => Promise<void>
  onReorderBlocks: (blocks: Block[]) => void
  deleting: string | null
  blocksLoading?: boolean
}

// Sortable block item component
function SortableBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  deleting,
  getBlockTypeName,
  getBlockIcon,
  handleDeleteClick
}: {
  block: Block
  selectedBlock: Block | null
  onSelectBlock: (block: Block) => void
  onDeleteBlock: (block: Block) => Promise<void>
  deleting: string | null
  getBlockTypeName: (block: Block) => string
  getBlockIcon: (blockType: string) => JSX.Element
  handleDeleteClick: (block: Block) => void
}) {
  const isProtected = isBlockTypeProtected(block.type)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: block.id,
    disabled: isProtected
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-4 transition-colors cursor-pointer ${
        selectedBlock?.id === block.id
          ? 'border-gray-300 bg-gray-50 shadow-sm'
          : 'border-border hover:border-gray-300 opacity-60 hover:opacity-90'
      }`}
      onClick={() => onSelectBlock(block)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            {...attributes}
            {...listeners}
            className={`flex items-center justify-center w-8 h-8 rounded ${
              isProtected 
                ? 'text-gray-400 cursor-not-allowed' 
                : 'text-muted-foreground hover:text-foreground hover:bg-gray-100 cursor-grab active:cursor-grabbing'
            }`}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            {getBlockIcon(block.type)}
            <h3 className="font-medium">{getBlockTypeName(block)}</h3>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isBlockTypeProtected(block.type) ? (
            <div 
              className="p-1 text-gray-400 cursor-not-allowed" 
              title={getBlockProtectionReason(block.type)}
            >
              <Trash2 className="w-4 h-4" />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteClick(block)
              }}
              disabled={deleting === block.id}
              title="Delete block"
            >
              {deleting === block.id ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function BlockListPanel({
  currentPage,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  deleting,
  blocksLoading = false
}: BlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<Block | null>(null)
  
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = currentPage.blocks.findIndex((block) => block.id === active.id)
      const newIndex = currentPage.blocks.findIndex((block) => block.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBlocks(arrayMove(currentPage.blocks, oldIndex, newIndex))
      }
    }
  }

  const handleDeleteClick = (block: Block) => {
    setBlockToDelete(block)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (blockToDelete) {
      await onDeleteBlock(blockToDelete)
    }
    setDeleteConfirmOpen(false)
    setBlockToDelete(null)
  }

  const getBlockTypeName = (block: Block) => {
    return block.type === 'hero' ? 'Hero Section' : 
           block.type === 'navigation' ? 'Navigation' :
           block.type === 'footer' ? 'Footer' : 
           block.type === 'rich-text' ? 'Rich Text' :
           block.type === 'faq' ? 'FAQ Section' :
           block.type === 'listing-views' ? 'Listing Views' :
           block.type === 'divider' ? 'Divider / Spacer' : 'Block'
  }

  const getBlockIcon = (blockType: string) => {
    switch (blockType) {
      case 'hero':
        return <Zap className="w-4 h-4" />
      case 'rich-text':
        return <FileText className="w-4 h-4" />
      case 'faq':
        return <HelpCircle className="w-4 h-4" />
      case 'listing-views':
        return <LayoutGrid className="w-4 h-4" />
      case 'divider':
        return <Minus className="w-4 h-4" />
      case 'navigation':
        return <Navigation className="w-4 h-4" />
      case 'footer':
        return <Mouse className="w-4 h-4" />
      default:
        return <div className="w-4 h-4" />
    }
  }

  return (
    <>
      <div className="w-[400px] p-6">
        <div className="max-w-3xl mx-auto">
          {blocksLoading ? (
            <div className="mb-6">
              <div className="h-7 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>
          ) : (
            <h2 className="text-xl font-semibold mb-6">
              {currentPage.name} Page Blocks
            </h2>
          )}
          
          {blocksLoading ? (
            // Skeleton loading state
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3"></div>
                    </div>
                    <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : currentPage.blocks.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <p className="text-lg font-medium">No blocks added yet</p>
                <p className="text-sm">Add blocks from the right sidebar to start building your page</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={currentPage.blocks.map(block => block.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {currentPage.blocks.map((block) => (
                    <SortableBlockItem
                      key={block.id}
                      block={block}
                      selectedBlock={selectedBlock}
                      onSelectBlock={onSelectBlock}
                      onDeleteBlock={onDeleteBlock}
                      deleting={deleting}
                      getBlockTypeName={getBlockTypeName}
                      getBlockIcon={getBlockIcon}
                      handleDeleteClick={handleDeleteClick}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>
              {blockToDelete && (
                <>Are you sure you want to delete the {getBlockTypeName(blockToDelete)} block? It will be removed when you save.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}