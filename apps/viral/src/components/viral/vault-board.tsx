import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { FilmIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { CoverImage } from "@/components/viral/cover-image"
import type { VaultItem } from "@/lib/api/viral/viral-vault"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { VAULT_STATUSES, vaultStatusLabels, type VaultStatus } from "@/lib/viral/vault"

const CARD_CLASS = "grid w-full gap-2 rounded-lg border bg-card p-2 text-left text-sm shadow-xs"

/**
 * The Vault page as a board (`workspace/docs/vault.md`, task part 15): a
 * column for each status, Idea, Scripted, Sent and Posted. Dragging a card
 * to another column changes its status. Sent turns on only after Send to
 * Video, so nothing can be dropped there: the screen says so instead. A
 * click opens the idea on the right, as a row in the list does.
 */
export function VaultBoard({
  items,
  selectedId,
  showProject,
  onPick,
  onMove,
}: {
  items: VaultItem[]
  selectedId: string | null
  showProject: boolean
  onPick: (item: VaultItem) => void
  /** A card let go over another column. The screen refuses Sent and saves the rest. */
  onMove: (item: VaultItem, status: VaultStatus) => void
}) {
  // A short drag threshold, so a click on a card still opens it.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // A fixed id, so the drag library's hidden help text matches on the server and in the browser.
  const dndId = React.useId()
  const [held, setHeld] = React.useState<VaultItem | null>(null)

  function start(event: DragStartEvent) {
    setHeld(items.find((item) => item.id === event.active.id) ?? null)
  }

  function end(event: DragEndEvent) {
    setHeld(null)
    const item = items.find((one) => one.id === event.active.id)
    const status = VAULT_STATUSES.find((one) => one === event.over?.id)
    if (item && status && status !== item.status) onMove(item, status)
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setHeld(null)}>
      <div className="flex w-max min-w-full items-start gap-3 p-3">
        {VAULT_STATUSES.map((status) => (
          <BoardColumn key={status} status={status} items={items.filter((item) => item.status === status)}>
            {items
              .filter((item) => item.status === status)
              .map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  showProject={showProject}
                  onPick={onPick}
                />
              ))}
          </BoardColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {held ? (
          <div aria-hidden className={cn(CARD_CLASS, "w-56 cursor-grabbing shadow-lg")}>
            <CardBody item={held} showProject={showProject} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({ status, items, children }: { status: VaultStatus; items: VaultItem[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const headingId = `vault-board-${status}`
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex min-h-56 w-60 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h3 id={headingId} className="flex min-h-7 items-center gap-2 px-1 text-sm font-medium">
        {vaultStatusLabels[status]}
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
      </h3>
      {items.length ? (
        <ul className="flex flex-col gap-2">{children}</ul>
      ) : (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {status === "sent" ? "Ideas turn Sent after Send to Video." : "Drag an idea here."}
        </p>
      )}
    </section>
  )
}

function BoardCard({
  item,
  selected,
  showProject,
  onPick,
}: {
  item: VaultItem
  selected: boolean
  showProject: boolean
  onPick: (item: VaultItem) => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: item.id })
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onPick(item)}
        {...attributes}
        {...listeners}
        className={cn(CARD_CLASS, "cursor-grab hover:bg-muted/50", selected && "ring-2 ring-ring", focusRing)}
      >
        <CardBody item={item} showProject={showProject} />
      </button>
    </li>
  )
}

function CardBody({ item, showProject }: { item: VaultItem; showProject: boolean }) {
  return (
    <>
      <span className="flex min-w-0 items-start gap-2">
        <span className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <CoverImage
            src={item.thumbnailUrl}
            className="size-full object-cover"
            fallback={
              <span className="grid size-full place-items-center">
                <FilmIcon className="size-4 text-muted-foreground" />
              </span>
            }
          />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="line-clamp-2 font-medium break-words">{item.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {showProject ? `${item.projectName} · ` : ""}
            {item.channelName || creatorPlatformLabels[item.platform]}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{formatCount(item.stats.views)} views</span>
        {item.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </span>
    </>
  )
}
