import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, PlusIcon, SettingsIcon } from "lucide-react"

import { LinkEditor, type PlaceChoice } from "@/components/link-editor"
import { LinkIconPicture } from "@/components/link-icon"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  addLink,
  moveLink,
  newId,
  personalPath,
  removeLink,
  updateLink,
  type Menu,
  type MenuLink,
  type Place,
} from "@/lib/menu"
import { cn } from "@/lib/utils"

type MenuActions = {
  places: PlaceChoice[]
  openUrl: string | null
  activeId: string | null
  open: (url: string) => void
  update: (change: (menu: Menu) => Menu) => void
}

export const MenuActionsContext = React.createContext<MenuActions | null>(null)

function useMenuActions() {
  const actions = React.useContext(MenuActionsContext)
  if (!actions) throw new Error("MenuActionsContext is missing")
  return actions
}

type Orientation = "vertical" | "horizontal"

/** One link: click it to open its screen, hover it to drag or edit it. */
function MenuLinkItem({
  link,
  place,
  orientation,
}: {
  link: MenuLink
  place: Place
  orientation: Orientation
}) {
  const { places, openUrl, activeId, open, update } = useMenuActions()
  const [editing, setEditing] = React.useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id })
  const active = activeId === link.id

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/link relative",
        orientation === "horizontal" && "min-w-0 shrink",
        isDragging && "z-10 opacity-80"
      )}
    >
      <a
        href={personalPath(link.url)}
        data-active={active ? "" : undefined}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          open(link.url)
        }}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:shrink-0",
          // A full top bar shrinks each name and cuts it short rather than
          // scrolling, because a scrolling row would clip the buttons that
          // hang under a link.
          orientation === "vertical" ? "pr-16" : "min-w-0 whitespace-nowrap"
        )}
      >
        <LinkIconPicture name={link.icon} />
        <span className="truncate">{link.label}</span>
      </a>
      {/* Drag and edit. Hidden, and ignoring clicks, until the link is hovered
          or one of them has focus. In the left menu they sit in the room kept
          at the link's right end; in the top bar they hang under the link, so
          they never cover a short name. */}
      <div
        className={cn(
          "pointer-events-none absolute z-20 flex items-center rounded-md bg-sidebar-accent opacity-0 group-hover/link:pointer-events-auto group-hover/link:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
          orientation === "vertical"
            ? "top-1/2 right-1 -translate-y-1/2"
            : "top-full left-1/2 -translate-x-1/2 border border-sidebar-border shadow-sm",
          isDragging && "opacity-100"
        )}
      >
        <button
          type="button"
          aria-label={`Drag ${link.label}`}
          className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
        <Popover open={editing} onOpenChange={setEditing}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Edit ${link.label}`}>
              <SettingsIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side={orientation === "vertical" ? "right" : "bottom"}
            align="start"
            className="w-80"
          >
            <LinkEditor
              initial={{ label: link.label, url: link.url, icon: link.icon }}
              place={place}
              places={places}
              openUrl={openUrl}
              submitLabel="Save"
              onSubmit={(draft, to) => {
                update((menu) => updateLink(menu, { ...link, ...draft }, to))
                setEditing(false)
              }}
              onDelete={() => {
                update((menu) => removeLink(menu, link.id))
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </li>
  )
}

/** A place's links, in order, which can be dragged into a new order. */
export function SortableLinks({
  links,
  place,
  orientation,
  className,
}: {
  links: MenuLink[]
  place: Place
  orientation: Orientation
  className?: string
}) {
  const { update } = useMenuActions()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    update((menu) => moveLink(menu, place, String(active.id), String(over.id)))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={links.map((link) => link.id)}
        strategy={
          orientation === "vertical"
            ? verticalListSortingStrategy
            : horizontalListSortingStrategy
        }
      >
        <ul
          className={cn(
            orientation === "vertical" ? "flex flex-col gap-0.5" : "flex items-center gap-1",
            className
          )}
        >
          {links.map((link) => (
            <MenuLinkItem key={link.id} link={link} place={place} orientation={orientation} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

/** The + that adds a link to a place, with the same form as editing one. */
export function AddLinkButton({
  place,
  label,
  compact = false,
}: {
  place: Place
  /** Spoken label, and the visible one unless `compact`. */
  label: string
  compact?: boolean
}) {
  const { places, openUrl, update } = useMenuActions()
  const [adding, setAdding] = React.useState(false)

  return (
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon-sm" aria-label={label}>
            <PlusIcon />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-muted-foreground hover:text-foreground"
          >
            <PlusIcon />
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side={compact ? "bottom" : "right"} align="start" className="w-80">
        <LinkEditor
          initial={{ label: "", url: "", icon: "link" }}
          place={place}
          places={places}
          openUrl={openUrl}
          submitLabel="Add link"
          onSubmit={(draft, to) => {
            update((menu) => addLink(menu, to, { id: newId("link"), ...draft }))
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
