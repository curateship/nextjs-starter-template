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
import { ChevronRightIcon, GripVerticalIcon, PlusIcon, SettingsIcon } from "lucide-react"

import { LinkEditor, type PlaceChoice } from "@/components/link-editor"
import { LinkIconPicture } from "@/components/link-icon"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  addLink,
  canPlace,
  moveLink,
  newId,
  personalPath,
  removeLink,
  updateLink,
  type Menu,
  type MenuLink,
  type Place,
} from "@/lib/menu"
import { plural } from "@/lib/plural"
import { useRememberedOpen } from "@/lib/use-remembered-open"
import { cn } from "@/lib/utils"

type MenuActions = {
  /** Whether adding, editing and dragging are shown. */
  editing: boolean
  places: PlaceChoice[]
  openUrl: string | null
  activeId: string | null
  open: (url: string) => void
  update: (change: (menu: Menu) => Menu) => void
}

export const MenuActionsContext = React.createContext<MenuActions | null>(null)

export function useMenuActions() {
  const actions = React.useContext(MenuActionsContext)
  if (!actions) throw new Error("MenuActionsContext is missing")
  return actions
}

type Orientation = "vertical" | "horizontal"

/**
 * One link: click it to open its screen, hover it to drag or edit it. A
 * left-menu link with sub-links folds them underneath, as Custom Shell's menu
 * does, and remembers per browser whether they are folded.
 */
function MenuLinkItem({
  link,
  place,
  orientation,
  nested,
}: {
  link: MenuLink
  place: Place
  orientation: Orientation
  /** A sub-link, drawn smaller under its link. */
  nested: boolean
}) {
  const { editing: editingMenu, places, openUrl, activeId, open, update } = useMenuActions()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [subLinksOpen, setSubLinksOpen] = useRememberedOpen(`personal-sidebar-link-${link.id}`)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id })
  const subLinks = link.children ?? []
  const active = activeId === link.id
  // Marked while one of its sub-links is open too, as the shell marks it.
  const inActive = active || subLinks.some((child) => child.id === activeId)
  // Only a left-menu link may hold sub-links, and only one level deep.
  const canHoldSubLinks = place.kind === "section"
  const vertical = orientation === "vertical"

  const row = (
    <div
      data-active={inActive && !nested ? "" : undefined}
      className={cn(
        "group/link relative flex items-center rounded-md",
        vertical &&
          !nested &&
          "hover:bg-sidebar-accent data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
      )}
    >
      <a
        href={personalPath(link.url)}
        data-active={inActive && !nested ? "" : undefined}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          open(link.url)
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:shrink-0",
          nested
            ? // Custom Shell's sub-link: a short row whose open one darkens
              // its stretch of the line on the left.
              cn(
                "relative h-7 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground before:absolute before:top-0 before:bottom-0 before:left-[-10px] before:w-px before:bg-transparent before:transition-colors",
                active && "font-medium text-sidebar-accent-foreground before:bg-sidebar-foreground/40"
              )
            : "h-8",
          // A full top bar shrinks each name and cuts it short rather than
          // scrolling, because a scrolling row would clip the buttons that
          // hang under a link.
          !vertical &&
            "min-w-0 whitespace-nowrap hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent"
        )}
      >
        <LinkIconPicture name={link.icon} />
        <span className="truncate">{link.label}</span>
      </a>
      {subLinks.length ? (
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`${subLinksOpen ? "Fold" : "Unfold"} ${link.label}'s sub-links`}
            className="shrink-0 rounded-md p-2 opacity-0 transition-[opacity,color] group-hover/link:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
          >
            <ChevronRightIcon
              className={cn("size-4 transition-transform duration-200", subLinksOpen && "rotate-90")}
            />
          </button>
        </CollapsibleTrigger>
      ) : null}
      {editingMenu ? (
        /* Drag, add a sub-link and edit, shown only while editing is on.
           Hidden, and ignoring clicks, until the link is hovered or one of
           them has focus. In the left menu they cover the end of the name
           while hovered, left of the fold arrow, so a narrow menu keeps whole
           names the rest of the time; in the top bar they hang under the
           link, so they never cover a short name. */
        <div
          className={cn(
            "pointer-events-none absolute z-20 flex items-center rounded-md bg-sidebar-accent opacity-0 group-hover/link:pointer-events-auto group-hover/link:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
            vertical
              ? cn("top-1/2 -translate-y-1/2", subLinks.length ? "right-9" : "right-1")
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
          {canHoldSubLinks ? (
            <AddLinkButton
              place={{ kind: "under", linkId: link.id }}
              label={`Add a sub-link under ${link.label}`}
              look="control"
              onAdded={() => setSubLinksOpen(true)}
            />
          ) : null}
          <Popover open={editorOpen} onOpenChange={setEditorOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Edit ${link.label}`}>
                <SettingsIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent side={vertical ? "right" : "bottom"} align="start" className="w-80">
              <LinkEditor
                initial={{ label: link.label, url: link.url, icon: link.icon }}
                place={place}
                places={places.filter((choice) => canPlace(link, choice.place))}
                openUrl={openUrl}
                submitLabel="Save"
                onSubmit={(draft, to) => {
                  update((menu) => updateLink(menu, { ...link, ...draft }, to))
                  setEditorOpen(false)
                }}
                onDelete={() => {
                  setEditorOpen(false)
                  if (subLinks.length) setConfirmingDelete(true)
                  else update((menu) => removeLink(menu, link.id))
                }}
                onCancel={() => setEditorOpen(false)}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  )

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative",
        !vertical && "min-w-0 shrink",
        isDragging && "z-10 opacity-80"
      )}
    >
      {subLinks.length ? (
        <Collapsible open={subLinksOpen} onOpenChange={setSubLinksOpen}>
          {row}
          <CollapsibleContent>
            <SortableLinks
              links={subLinks}
              place={{ kind: "under", linkId: link.id }}
              orientation="vertical"
              nested
            />
          </CollapsibleContent>
        </Collapsible>
      ) : (
        row
      )}
      {subLinks.length ? (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`Delete ${link.label}?`}
          description={`Removes it and the ${subLinks.length} ${plural(subLinks.length, "sub-link")} under it from the menu. The screens themselves are not touched.`}
          confirmLabel="Delete link"
          onConfirm={() => {
            update((menu) => removeLink(menu, link.id))
            setConfirmingDelete(false)
          }}
        />
      ) : null}
    </li>
  )
}

/** A place's links, in order, which can be dragged into a new order. */
export function SortableLinks({
  links,
  place,
  orientation,
  nested = false,
  className,
}: {
  links: MenuLink[]
  place: Place
  orientation: Orientation
  /** Sub-links under a left-menu link, drawn like Custom Shell's. */
  nested?: boolean
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
            orientation === "horizontal"
              ? "flex items-center gap-1"
              : nested
                ? // Custom Shell's sub-menu: indented behind a line.
                  "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5"
                : "flex flex-col gap-0.5",
            className
          )}
        >
          {links.map((link) => (
            <MenuLinkItem
              key={link.id}
              link={link}
              place={place}
              orientation={orientation}
              nested={nested}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

/**
 * The + that adds a link to a place, with the same form as editing one: a row
 * at the end of a section, an icon in the top bar, or a small control on a
 * left-menu link that adds a sub-link under it.
 */
export function AddLinkButton({
  place,
  label,
  look = "row",
  onAdded,
}: {
  place: Place
  /** Spoken label, and the visible one for a row. */
  label: string
  look?: "row" | "icon" | "control"
  onAdded?: () => void
}) {
  const { editing, places, openUrl, update } = useMenuActions()
  const [adding, setAdding] = React.useState(false)
  if (!editing) return null

  const trigger =
    look === "row" ? (
      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-muted-foreground hover:text-foreground"
      >
        <PlusIcon />
        {label}
      </Button>
    ) : (
      <Button variant="ghost" size={look === "icon" ? "icon-sm" : "icon-xs"} aria-label={label}>
        <PlusIcon />
      </Button>
    )

  return (
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* The top bar's + sits at the bar's right end, so its form opens
          leftwards from it rather than running into the edge of the screen. */}
      <PopoverContent
        side={look === "icon" ? "bottom" : "right"}
        align={look === "icon" ? "end" : "start"}
        className="w-80"
      >
        <LinkEditor
          initial={{ label: "", url: "", icon: "link" }}
          place={place}
          places={places}
          openUrl={openUrl}
          submitLabel="Add link"
          onSubmit={(draft, to) => {
            update((menu) => addLink(menu, to, { id: newId("link"), ...draft }))
            setAdding(false)
            onAdded?.()
          }}
          onCancel={() => setAdding(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
