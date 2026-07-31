"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ConfirmDestructive } from "@/components/admin/layout/ConfirmDestructive"
import { cn } from "@/lib/utils/tailwind"
import {
  getDirectoryLayoutColumn,
  normalizeDirectoryBlockContent,
  type DirectoryLayoutColumn,
} from "@/lib/actions/directories/directory-layout"
import type { DirectoryEditorBlock } from "@/components/admin/directory-builder/config/directory-block-utils"
import { getBlockIcon, getBlockName } from "@/components/admin/directory-builder/config/directory-block-types"
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
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

interface DirectoryTemplateBlockListPanelProps {
  blocks: DirectoryEditorBlock[]
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
  onDeleteBlock: (block: DirectoryEditorBlock) => void
  onReorderBlocks: (blocks: DirectoryEditorBlock[]) => void
  onAddBlock: () => void
  deleting: string | null
  blocksLoading?: boolean
}

function getColumnTransferLaneId(column: DirectoryLayoutColumn) {
  return `directory-layout-column-transfer-${column}`
}

function SortableDirectoryBlockItem({
  block,
  selectedBlock,
  onSelectBlock,
  deleting,
  onDelete,
}: {
  block: DirectoryEditorBlock
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
  deleting: string | null
  onDelete: (block: DirectoryEditorBlock) => void
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
  const name = block.title || getBlockName(block.type)

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
          className="h-5 w-5 p-0 text-foreground hover:text-foreground hover:bg-accent"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(block)
          }}
          disabled={deleting === block.id}
          title="Delete block"
        >
          {deleting === block.id ? (
            <div className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-destructive"></div>
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

function DirectoryTemplateColumnSection({
  column,
  blocks,
  selectedBlock,
  onSelectBlock,
  deleting,
  onDelete,
  showTransferLane,
}: {
  column: DirectoryLayoutColumn
  blocks: DirectoryEditorBlock[]
  selectedBlock: DirectoryEditorBlock | null
  onSelectBlock: (block: DirectoryEditorBlock) => void
  deleting: string | null
  onDelete: (block: DirectoryEditorBlock) => void
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
              <SortableDirectoryBlockItem
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

export function DirectoryTemplateBlockListPanel({
  blocks,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onAddBlock,
  deleting,
  blocksLoading = false,
}: DirectoryTemplateBlockListPanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<DirectoryEditorBlock | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const mainBlocks = blocks.filter((block) => getDirectoryLayoutColumn(block) === "main")
  const sidebarBlocks = blocks.filter((block) => getDirectoryLayoutColumn(block) === "sidebar")
  const orderedBlocks = [...mainBlocks, ...sidebarBlocks]
  const activeBlock = activeBlockId
    ? orderedBlocks.find((block) => block.id === activeBlockId) ?? null
    : null
  const activeColumn = activeBlock ? getDirectoryLayoutColumn(activeBlock) : null

  const collisionDetection: CollisionDetection = (args) => {
    const currentActiveId = String(args.active.id)
    const currentActiveBlock = orderedBlocks.find((block) => block.id === currentActiveId)
    if (!currentActiveBlock) return []

    const currentColumn = getDirectoryLayoutColumn(currentActiveBlock)
    const allowedTransferLaneIds = (["main", "sidebar"] as DirectoryLayoutColumn[])
      .filter((column) => column !== currentColumn)
      .map((column) => getColumnTransferLaneId(column))

    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const containerId = String(container.id)

        if (allowedTransferLaneIds.includes(containerId)) {
          return true
        }

        const containerBlock = orderedBlocks.find((block) => block.id === containerId)
        return containerBlock ? getDirectoryLayoutColumn(containerBlock) === currentColumn : false
      }),
    })
  }

  const handleDeleteClick = (block: DirectoryEditorBlock) => {
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

    const activeColumn = getDirectoryLayoutColumn(activeBlock)
    const dropColumn =
      overId === getColumnTransferLaneId("main")
        ? "main"
        : overId === getColumnTransferLaneId("sidebar")
          ? "sidebar"
          : null

    if (dropColumn) {
      if (dropColumn === activeColumn) return

      const remainingBlocks = orderedBlocks.filter((block) => block.id !== activeId)
      const movedBlock: DirectoryEditorBlock = {
        ...activeBlock,
        content: normalizeDirectoryBlockContent(activeBlock.type, {
          ...activeBlock.content,
          layoutColumn: dropColumn,
        }),
      }

      const nextMainBlocks = remainingBlocks.filter((block) => getDirectoryLayoutColumn(block) === "main")
      const nextSidebarBlocks = remainingBlocks.filter((block) => getDirectoryLayoutColumn(block) === "sidebar")

      if (dropColumn === "main") {
        onReorderBlocks([...nextMainBlocks, movedBlock, ...nextSidebarBlocks])
      } else {
        onReorderBlocks([...nextMainBlocks, ...nextSidebarBlocks, movedBlock])
      }

      return
    }

    const overBlock = orderedBlocks.find((block) => block.id === overId)
    if (!overBlock) return

    const overColumn = getDirectoryLayoutColumn(overBlock)
    if (overColumn !== activeColumn) return

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
          </div>
        ) : (
          <div className="flex items-center justify-between mb-4 px-5">
            <h2 className="text-lg font-semibold">Blocks</h2>
          </div>
        )}

        {blocksLoading ? (
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-2">
                    </div>
                  </div>
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
              <DirectoryTemplateColumnSection
                column="main"
                blocks={mainBlocks}
                selectedBlock={selectedBlock}
                onSelectBlock={onSelectBlock}
                deleting={deleting}
                onDelete={handleDeleteClick}
                showTransferLane={activeColumn === "sidebar"}
              />
              <DirectoryTemplateColumnSection
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

        <div className="px-5 mt-3">
          {blocksLoading ? null : (
            <Button variant="outline" size="sm" onClick={onAddBlock}>
              <Plus className="w-4 h-4 mr-1" />
              Add Block
            </Button>
          )}
        </div>
      </div>

      <ConfirmDestructive
        action="delete-block"
        open={deleteConfirmOpen}
        title="Delete block?"
        description={blockToDelete
          ? `The ${getBlockName(blockToDelete.type)} block will be removed when you save.`
          : "The block will be removed when you save."}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setBlockToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
