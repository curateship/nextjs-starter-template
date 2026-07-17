import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  FileTextIcon,
  GripVerticalIcon,
  ImageIcon,
  MinusIcon,
  PanelBottomIcon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  BROADCAST_BLOCK_KINDS,
  BROADCAST_BLOCK_META,
  createBroadcastBlock,
  type BroadcastBlock,
  type BroadcastBlockKind,
} from "@/lib/broadcasts/blocks"
import { cn } from "@/lib/utils"

const BLOCK_ICONS: Record<
  BroadcastBlockKind,
  React.ComponentType<{ className?: string }>
> = {
  header: ImageIcon,
  richText: FileTextIcon,
  divider: MinusIcon,
  footer: PanelBottomIcon,
}

function SortableBlockRow({
  block,
  selected,
  disabled,
  onSelect,
}: {
  block: BroadcastBlock
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, disabled })
  const Icon = BLOCK_ICONS[block.kind]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-md border bg-background px-1.5 py-1.5",
        selected && "border-primary/40 bg-primary/5",
        isDragging && "z-10 opacity-80 shadow-sm"
      )}
    >
      <button
        type="button"
        className={cn(
          "cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground",
          disabled && "cursor-default opacity-40"
        )}
        aria-label={`Reorder ${BROADCAST_BLOCK_META[block.kind].name} block`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        onClick={onSelect}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {BROADCAST_BLOCK_META[block.kind].name}
        </span>
      </button>
    </div>
  )
}

export function BlockRail({
  blocks,
  selectedBlockId,
  disabled,
  onSelect,
  onReorder,
  onAdd,
}: {
  blocks: BroadcastBlock[]
  selectedBlockId: string | null
  disabled?: boolean
  onSelect: (blockId: string) => void
  onReorder: (blocks: BroadcastBlock[]) => void
  onAdd: (block: BroadcastBlock) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((block) => block.id === active.id)
    const newIndex = blocks.findIndex((block) => block.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(blocks, oldIndex, newIndex))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <span className="text-sm font-medium">Blocks</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-2">
          {blocks.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Add a block below to start building this email.
            </p>
          ) : (
            <DndContext
              // Stable id keeps dnd-kit's generated aria ids identical
              // between server and client render (avoids hydration warnings).
              id="broadcast-block-rail"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map((block) => block.id)}
                strategy={verticalListSortingStrategy}
              >
                {blocks.map((block) => (
                  <SortableBlockRow
                    key={block.id}
                    block={block}
                    selected={block.id === selectedBlockId}
                    disabled={disabled}
                    onSelect={() => onSelect(block.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t p-2">
        <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Add block
        </p>
        <div className="grid gap-1">
          {BROADCAST_BLOCK_KINDS.map((kind) => {
            const Icon = BLOCK_ICONS[kind]
            return (
              <Button
                key={kind}
                type="button"
                variant="outline"
                className="justify-start"
                disabled={disabled}
                onClick={() => onAdd(createBroadcastBlock(kind))}
              >
                <PlusIcon className="size-3.5 text-muted-foreground" />
                <Icon className="size-3.5 text-muted-foreground" />
                {BROADCAST_BLOCK_META[kind].name}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
