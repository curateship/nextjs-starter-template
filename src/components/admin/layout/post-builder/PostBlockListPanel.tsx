import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, GripVertical, FileText } from "lucide-react"
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

interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface CurrentPost {
  slug: string
  name: string
  blocks: PostBlock[]
}

interface PostBlockListPanelProps {
  currentPost: CurrentPost
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock) => void
  onDeleteBlock: (block: PostBlock) => void
  onReorderBlocks: (blocks: PostBlock[]) => void
  deleting: string | null
  blocksLoading?: boolean
}

// Sortable post block item component
function SortablePostBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  deleting,
  getBlockIcon,
  handleDeleteClick
}: {
  block: PostBlock
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock) => void
  deleting: string | null
  getBlockIcon: (blockType: string) => JSX.Element
  handleDeleteClick: (block: PostBlock) => void
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
            className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            {getBlockIcon(block.type)}
            <h3 className="font-medium">{block.title}</h3>
          </div>
        </div>
        <div className="flex items-center space-x-2">
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
        </div>
      </div>
    </div>
  )
}

export function PostBlockListPanel({
  currentPost,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  deleting,
  blocksLoading = false
}: PostBlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<PostBlock | null>(null)
  
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
      const oldIndex = currentPost.blocks.findIndex((block) => block.id === active.id)
      const newIndex = currentPost.blocks.findIndex((block) => block.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderBlocks(arrayMove(currentPost.blocks, oldIndex, newIndex))
      }
    }
  }

  const handleDeleteClick = (block: PostBlock) => {
    setBlockToDelete(block)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (blockToDelete) {
      onDeleteBlock(blockToDelete)
    }
    setDeleteConfirmOpen(false)
    setBlockToDelete(null)
  }

  const getBlockTypeName = (block: PostBlock) => {
    return block.type === 'post-content' ? 'Content Block' : 'Block'
  }

  const getBlockIcon = (blockType: string) => {
    switch (blockType) {
      case 'post-content':
        return <FileText className="w-4 h-4" />
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
              {currentPost.name} Post Blocks
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
          ) : currentPost.blocks.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <p className="text-lg font-medium">No blocks added yet</p>
                <p className="text-sm">Add blocks from the right sidebar to start building your post</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={currentPost.blocks.map(block => block.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {currentPost.blocks.map((block) => (
                    <SortablePostBlockItem
                      key={block.id}
                      block={block}
                      selectedBlock={selectedBlock}
                      onSelectBlock={onSelectBlock}
                      deleting={deleting}
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