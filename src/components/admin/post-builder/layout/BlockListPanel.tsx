import { useState } from "react"
import { POST_BLOCK_TYPES } from "../config/post-block-types"
import { Button } from "@/components/ui/button"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, GripVertical, FileText, Eye, Image as ImageIcon, Code, Quote, Minus, Link2 } from "lucide-react"
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
import type { PostBlock } from "@/lib/actions/posts/post-actions"

interface CurrentPost {
  slug: string
  name: string
  blocks: PostBlock[]
}

interface PostData {
  title?: string
  meta_description?: string
  excerpt?: string
}

interface BlockListPanelProps {
  currentPost: CurrentPost
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock | null) => void
  onDeleteBlock: (block: PostBlock) => void
  onReorderBlocks: (newOrder: { id: string; display_order: number }[]) => void
  onPreviewPost?: () => void
  onCleanupCorrupted?: () => void
  deleting: string | null
  blocksLoading?: boolean
  postData?: PostData
}

// Sortable post block item component
function SortablePostBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  deleting,
  getBlockIcon,
  handleDeleteClick,
  isDefaultBlock,
  getBlockTypeName,
  postTitle
}: {
  block: PostBlock
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock | null) => void
  deleting: string | null
  getBlockIcon: (blockType: string) => React.ReactElement
  handleDeleteClick: (block: PostBlock) => void
  isDefaultBlock: (block: PostBlock) => boolean
  getBlockTypeName: (block: PostBlock) => string
  postTitle?: string
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
            {getBlockIcon(block.type)}
            <h3 className="text-sm font-medium">
              {block.content?.title || getBlockTypeName(block)}
            </h3>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {!isDefaultBlock(block) ? (
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
          ) : (
            <div className="text-xs text-muted-foreground px-2">
              Required
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function BlockListPanel({
  currentPost,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onPreviewPost,
  onCleanupCorrupted,
  deleting,
  blocksLoading = false,
  postData
}: BlockListPanelProps) {
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
        const reorderedBlocks = arrayMove(currentPost.blocks, oldIndex, newIndex)
        const newOrder = reorderedBlocks.map((block, index) => ({
          id: block.id,
          display_order: index + 1
        }))
        onReorderBlocks(newOrder)
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
    const def = POST_BLOCK_TYPES.find(d => d.type === block.type)
    return def?.name || 'Block'
  }

  const isDefaultBlock = (_block: PostBlock) => {
    return false
  }

  const getBlockIcon = (blockType: string) => {
    switch (blockType) {
      case 'post-content':
        return <FileText className="w-3.5 h-3.5" />
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5" />
      case 'code':
        return <Code className="w-3.5 h-3.5" />
      case 'quote':
        return <Quote className="w-3.5 h-3.5" />
      case 'divider':
        return <Minus className="w-3.5 h-3.5" />
      case 'related-posts':
        return <Link2 className="w-3.5 h-3.5" />
      default:
        return <div className="w-3.5 h-3.5" />
    }
  }

  return (
    <>
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
              {onPreviewPost && (
                <Button
                  onClick={onPreviewPost}
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
            // Skeleton loading state
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
          ) : currentPost.blocks.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <p className="text-base font-medium">No blocks added yet</p>
                <p className="text-xs">Click "Add Blocks" to start building your post</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={currentPost.blocks.filter(block => block && block.id && block.type).map(block => block.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0">
                  {currentPost.blocks.map((block, index) => {
                    // Show corrupted blocks visibly but safely
                    if (!block || !block.id || !block.type) {
                      return (
                        <div key={`corrupted-${index}`} className="p-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="text-red-600">⚠️</div>
                              <h3 className="text-sm font-medium text-red-800">Corrupted Block</h3>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
                              onClick={() => {
                                if (onCleanupCorrupted) {
                                  onCleanupCorrupted()
                                }
                              }}
                              title="Remove corrupted blocks"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                    <SortablePostBlockItem
                      key={block.id}
                      block={block}
                      selectedBlock={selectedBlock}
                      onSelectBlock={onSelectBlock}
                      deleting={deleting}
                      getBlockIcon={getBlockIcon}
                      handleDeleteClick={handleDeleteClick}
                      isDefaultBlock={isDefaultBlock}
                      getBlockTypeName={getBlockTypeName}
                      postTitle={postData?.title}
                    />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
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