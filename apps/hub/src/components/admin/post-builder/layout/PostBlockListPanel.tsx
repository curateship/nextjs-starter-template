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
import { cn } from "@/lib/utils/tailwind"
import {
  getPostLayoutColumn,
  normalizePostBlockContent,
  type PostLayoutColumn,
} from "@/lib/actions/posts/post-layout"
import type { PostBlock } from "@/lib/actions/posts/post-actions"
import { orderPostBuilderBlocks } from "@/components/admin/post-builder/config/post-block-utils"
import { getBlockIcon, getBlockName } from "@/components/admin/post-builder/config/post-block-types"
import {
  DndContext,
  closestCenter,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ExternalLink, GripVertical, Plus, Trash2 } from "lucide-react"

interface PostBlockListPanelProps {
  blocks: PostBlock[]
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock) => void
  onDeleteBlock: (block: PostBlock) => void
  onReorderBlocks: (blocks: PostBlock[]) => void
  viewPageHref?: string | null
  onAddBlock?: () => void
  deleting: string | null
  blocksLoading?: boolean
}

function getColumnTransferLaneId(column: PostLayoutColumn) {
  return `post-layout-column-transfer-${column}`
}

function insertBlockAt(blocks: PostBlock[], block: PostBlock, index: number) {
  const nextBlocks = [...blocks]
  nextBlocks.splice(Math.max(0, index), 0, block)
  return nextBlocks
}

function SortablePostBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  deleting,
  onDelete,
}: {
  block: PostBlock
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock) => void
  deleting: string | null
  onDelete: (block: PostBlock) => void
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

  const Icon = getBlockIcon(block.type)
  const name = getBlockName(block.type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 transition-colors cursor-pointer rounded-lg ${
        selectedBlock?.id === block.id
          ? "bg-muted/60"
          : "opacity-60 hover:opacity-90"
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
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(block)
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
      </div>
    </div>
  )
}

function PostColumnSection({
  column,
  blocks,
  selectedBlock,
  onSelectBlock,
  deleting,
  onDelete,
  showTransferLane,
}: {
  column: PostLayoutColumn
  blocks: PostBlock[]
  selectedBlock: PostBlock | null
  onSelectBlock: (block: PostBlock) => void
  deleting: string | null
  onDelete: (block: PostBlock) => void
  showTransferLane: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: getColumnTransferLaneId(column),
  })

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

      <div className="relative min-h-8 rounded-lg">
        {showTransferLane && (
          <div
            ref={setNodeRef}
            className={cn(
              "absolute left-5 right-5 top-0 z-10 h-4 rounded-md transition-colors",
              isOver && "bg-primary/8 outline outline-primary/40"
            )}
          />
        )}

        {blocks.length > 0 ? (
          <div className="space-y-0">
            {blocks.map((block) => (
              <SortablePostBlockItem
                key={block.id}
                block={block}
                selectedBlock={selectedBlock}
                onSelectBlock={onSelectBlock}
                deleting={deleting}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div className="px-5 py-3 text-xs text-muted-foreground">{emptyText}</div>
        )}
      </div>
    </div>
  )
}

export function PostBlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  viewPageHref,
  onAddBlock,
  deleting,
  blocksLoading = false,
}: PostBlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<PostBlock | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const orderedBlocks = orderPostBuilderBlocks(blocks)
  const mainBlocks = orderedBlocks.filter((block) => getPostLayoutColumn(block) === "main")
  const sidebarBlocks = orderedBlocks.filter((block) => getPostLayoutColumn(block) === "sidebar")
  const activeBlock = activeBlockId
    ? orderedBlocks.find((block) => block.id === activeBlockId) ?? null
    : null
  const activeColumn = activeBlock ? getPostLayoutColumn(activeBlock) : null

  const collisionDetection: CollisionDetection = (args) => {
    const currentActiveId = String(args.active.id)
    const currentActiveBlock = orderedBlocks.find((block) => block.id === currentActiveId)
    if (!currentActiveBlock) return []

    const transferLaneIds = (["main", "sidebar"] as PostLayoutColumn[]).map(getColumnTransferLaneId)

    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const containerId = String(container.id)

        if (transferLaneIds.includes(containerId)) {
          return true
        }

        return orderedBlocks.some((block) => block.id === containerId)
      }),
    })
  }

  const handleDeleteClick = (block: PostBlock) => {
    setBlockToDelete(block)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (blockToDelete) onDeleteBlock(blockToDelete)
    setDeleteConfirmOpen(false)
    setBlockToDelete(null)
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveBlockId(String(event.active.id))
  }

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveBlockId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveBlockId(null)

    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeBlock = orderedBlocks.find((block) => block.id === activeId)

    if (!activeBlock) return

    const activeColumn = getPostLayoutColumn(activeBlock)
    const dropColumn =
      overId === getColumnTransferLaneId("main")
        ? "main"
        : overId === getColumnTransferLaneId("sidebar")
          ? "sidebar"
          : null

    if (dropColumn) {
      if (dropColumn === activeColumn) return

      const remainingBlocks = orderedBlocks.filter((block) => block.id !== activeId)
      const movedBlock: PostBlock = {
        ...activeBlock,
        content: normalizePostBlockContent(activeBlock.type, {
          ...activeBlock.content,
          layoutColumn: dropColumn,
        }),
      }

      const nextMainBlocks = remainingBlocks.filter((block) => getPostLayoutColumn(block) === "main")
      const nextSidebarBlocks = remainingBlocks.filter((block) => getPostLayoutColumn(block) === "sidebar")

      if (dropColumn === "main") {
        onReorderBlocks([...nextMainBlocks, movedBlock, ...nextSidebarBlocks])
      } else {
        onReorderBlocks([...nextMainBlocks, ...nextSidebarBlocks, movedBlock])
      }

      return
    }

    const overBlock = orderedBlocks.find((block) => block.id === overId)
    if (!overBlock) return

    const overColumn = getPostLayoutColumn(overBlock)

    if (overColumn !== activeColumn) {
      const movedBlock: PostBlock = {
        ...activeBlock,
        content: normalizePostBlockContent(activeBlock.type, {
          ...activeBlock.content,
          layoutColumn: overColumn,
        }),
      }
      const nextMainBlocks = mainBlocks.filter((block) => block.id !== activeId)
      const nextSidebarBlocks = sidebarBlocks.filter((block) => block.id !== activeId)
      const targetBlocks = overColumn === "main" ? nextMainBlocks : nextSidebarBlocks
      const insertIndex = targetBlocks.findIndex((block) => block.id === overId)
      const nextTargetBlocks = insertBlockAt(targetBlocks, movedBlock, insertIndex === -1 ? targetBlocks.length : insertIndex)

      onReorderBlocks(
        overColumn === "main"
          ? [...nextTargetBlocks, ...nextSidebarBlocks]
          : [...nextMainBlocks, ...nextTargetBlocks]
      )
      return
    }

    const columnBlocks = activeColumn === "main" ? [...mainBlocks] : [...sidebarBlocks]
    const oldIndex = columnBlocks.findIndex((block) => block.id === activeId)
    const newIndex = columnBlocks.findIndex((block) => block.id === overId)

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reorderedColumnBlocks = arrayMove(columnBlocks, oldIndex, newIndex)

    onReorderBlocks(
      activeColumn === "main"
        ? [...reorderedColumnBlocks, ...sidebarBlocks]
        : [...mainBlocks, ...reorderedColumnBlocks]
    )
  }

  return (
    <>
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
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 bg-muted rounded animate-pulse"></div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3.5 h-3.5 bg-muted rounded-sm animate-pulse"></div>
                      <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
                    </div>
                  </div>
                  <div className="w-5 h-5 bg-muted rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedBlocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
              <PostColumnSection
                column="main"
                blocks={mainBlocks}
                selectedBlock={selectedBlock}
                onSelectBlock={onSelectBlock}
                deleting={deleting}
                onDelete={handleDeleteClick}
                showTransferLane={activeColumn === "sidebar"}
              />
              <PostColumnSection
                column="sidebar"
                blocks={sidebarBlocks}
                selectedBlock={selectedBlock}
                onSelectBlock={onSelectBlock}
                deleting={deleting}
                onDelete={handleDeleteClick}
                showTransferLane={activeColumn === "main"}
              />
            </SortableContext>
          </DndContext>
        )}

        {onAddBlock && (
          <div className="px-5 mt-3">
            {blocksLoading ? (
              <div className="h-9 w-28 bg-muted rounded animate-pulse"></div>
            ) : (
              <Button variant="outline" size="sm" onClick={onAddBlock}>
                <Plus className="w-4 h-4 mr-1" />
                Add Block
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete block</DialogTitle>
            <DialogDescription>
              {blockToDelete && (
                <>Are you sure you want to delete the {getBlockName(blockToDelete.type)} block? It will be removed when you save.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete block</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
