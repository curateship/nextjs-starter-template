import * as React from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type Over,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"

import { LinkIconPicture } from "@/components/link-icon"
import {
  linksAt,
  moveLink,
  moveLinkTo,
  movePinned,
  moveSection,
  placeKey,
  placeOf,
  type Menu,
  type MenuLink,
  type Place,
} from "@/lib/menu"

/**
 * The menu's one drag area, around the whole left menu, so a link
 * can be dragged into another section, under another link or into the list
 * at the bottom, and sections into a new order. Each list of links and the list of
 * sections and Pinned are each a `SortableContext` inside it. `workspace/docs/menu.md` says how
 * it behaves.
 */

export type LinkDragData = { kind: "link"; link: MenuLink; place: Place }
export type ListDropData = { kind: "list"; place: Place }
export type SectionDragData = { kind: "section"; sectionId: string }
export type PinnedDragData = { kind: "pinned"; linkId: string }
type DragData = LinkDragData | ListDropData | SectionDragData | PinnedDragData

/** The list of sections is a list of its own, apart from every list of links. */
export const SECTIONS_LIST_ID = "sections"

/** Pinned's rows are a list of their own too: they only reorder Pinned. */
export const PINNED_LIST_ID = "pinned"

export function linkDragId(linkId: string) {
  return `link:${linkId}`
}

export function sectionDragId(sectionId: string) {
  return `section:${sectionId}`
}

/** A pinned link has its own id, since the same link sits in its section too. */
export function pinnedDragId(linkId: string) {
  return `pinned:${linkId}`
}

export function listDropId(place: Place) {
  return `list:${placeKey(place)}`
}

function dataOf(entry: Active | Over | { data: { current?: unknown } } | null) {
  return (entry?.data.current ?? null) as (DragData & { sortable?: { containerId: string } }) | null
}

/**
 * What a drag is over. A section only ever meets sections, and a pinned row
 * only other pinned rows. A link dragged by
 * the pointer meets links and lists, and of everything under the pointer the
 * smallest wins, so a sub-link beats the link it sits under. A link dragged by
 * the keyboard stays in its own list; "Shows in" moves it further.
 */
const collision: CollisionDetection = (args) => {
  const kind = dataOf(args.active)?.kind
  if (kind === "section" || kind === "pinned") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((entry) => dataOf(entry)?.kind === kind),
    })
  }
  if (!args.pointerCoordinates) {
    const list = dataOf(args.active)?.sortable?.containerId
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (entry) => dataOf(entry)?.sortable?.containerId === list
      ),
    })
  }
  const candidates = args.droppableContainers.filter((entry) => {
    const entryKind = dataOf(entry)?.kind
    return entryKind === "link" || entryKind === "list"
  })
  const area = (id: string | number) => {
    const rect = args.droppableRects.get(id)
    return rect ? rect.width * rect.height : Infinity
  }
  return pointerWithin({ ...args, droppableContainers: candidates }).sort(
    (a, b) => area(a.id) - area(b.id)
  )
}

/** Arrow keys move a dragged item among its own list only. */
const sameListCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, droppableContainers } = args.context
  const list = active ? dataOf(droppableContainers.get(active.id) ?? null)?.sortable?.containerId : null
  const enabled = droppableContainers
    .getEnabled()
    .filter((entry) => dataOf(entry)?.sortable?.containerId === list)
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: {
      ...args.context,
      droppableContainers: {
        getEnabled: () => enabled,
        get: (id: string | number) => droppableContainers.get(id),
      } as typeof droppableContainers,
    },
  })
}

/** The place a drag is over, and the link it would land before there. */
function dropSpot(menu: Menu, event: DragOverEvent | DragEndEvent) {
  const over = dataOf(event.over)
  if (!event.over || !over || over.kind === "section" || over.kind === "pinned") return null
  if (over.kind === "list") return { place: over.place, beforeId: null }
  const place = placeOf(menu, over.link.id)
  if (!place) return null
  const links = linksAt(menu, place) ?? []
  // Past the middle of the link it is over, it lands after it.
  const dragged = event.active.rect.current.translated
  const target = event.over.rect
  const after = dragged
    ? place.kind === "top"
      ? dragged.left + dragged.width / 2 > target.left + target.width / 2
      : dragged.top + dragged.height / 2 > target.top + target.height / 2
    : false
  const index = links.findIndex((l) => l.id === over.link.id)
  return { place, beforeId: after ? (links[index + 1]?.id ?? null) : over.link.id }
}

export function MenuDrag({
  menu,
  update,
  children,
}: {
  menu: Menu
  update: (change: (menu: Menu) => Menu) => void
  /** Draws the menu: the saved one, or the one being dragged into shape. */
  children: (shown: Menu) => React.ReactNode
}) {
  // While a link is dragged across lists, the menu it is dragged through.
  // It is saved on the drop and dropped on Escape.
  const [draft, setDraft] = React.useState<Menu | null>(null)
  const [dragged, setDragged] = React.useState<MenuLink | null>(null)
  // A move into another list changes the page under the pointer, so the next
  // move waits for that to settle, or the link can flick back and forth.
  const settlingRef = React.useRef(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sameListCoordinates })
  )

  function reset() {
    setDraft(null)
    setDragged(null)
  }

  function onDragStart({ active }: DragStartEvent) {
    const data = dataOf(active)
    if (data?.kind !== "link") return
    setDraft(menu)
    setDragged(data.link)
  }

  function onDragOver(event: DragOverEvent) {
    const data = dataOf(event.active)
    if (!draft || data?.kind !== "link" || settlingRef.current) return
    const spot = dropSpot(draft, event)
    const from = placeOf(draft, data.link.id)
    if (!spot || !from || placeKey(spot.place) === placeKey(from)) return
    const next = moveLinkTo(draft, data.link.id, spot.place, spot.beforeId)
    if (next === draft) return
    settlingRef.current = true
    requestAnimationFrame(() => {
      settlingRef.current = false
    })
    setDraft(next)
  }

  function onDragEnd(event: DragEndEvent) {
    const data = dataOf(event.active)
    const over = dataOf(event.over)
    if (data?.kind === "section") {
      if (over?.kind === "section" && over.sectionId !== data.sectionId) {
        update((m) => moveSection(m, data.sectionId, over.sectionId))
      }
      return
    }
    if (data?.kind === "pinned") {
      if (over?.kind === "pinned" && over.linkId !== data.linkId) {
        update((m) => movePinned(m, data.linkId, over.linkId))
      }
      return
    }
    if (!draft || data?.kind !== "link") return reset()
    // A drop away from every list, or on a list the link may not go in,
    // leaves the menu as it was.
    if (!event.over) return reset()
    let next = draft
    const from = placeOf(next, data.link.id)
    if (over?.kind === "link" && from && over.link.id !== data.link.id) {
      const overPlace = placeOf(next, over.link.id)
      if (overPlace && placeKey(overPlace) === placeKey(from)) {
        next = moveLink(next, from, data.link.id, over.link.id)
      }
    }
    reset()
    if (next !== menu) update(() => next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      // Lists change shape while a link is dragged across them, so where
      // each one sits is measured again throughout the drag.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      {children(draft ?? menu)}
      {/* A link is drawn following the pointer above everything, since the
          left menu clips what leaves it. A section or a pinned row has no
          copy and moves itself, within the left menu. */}
      <DragOverlay dropAnimation={null}>
        {dragged ? (
          <div className="flex h-8 max-w-56 items-center gap-2 rounded-md border bg-sidebar px-2 text-sm text-sidebar-foreground shadow-md [&_svg]:shrink-0">
            <LinkIconPicture name={dragged.icon} />
            <span className="truncate">{dragged.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
