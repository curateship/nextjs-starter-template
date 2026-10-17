import * as React from "react"
import { useDndContext, useDroppable } from "@dnd-kit/core"
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"

import { LinkEditor, type LinkDraft, type PlaceChoice } from "@/components/link-editor"
import { LinkIconPicture } from "@/components/link-icon"
import { linkDragId, listDropId, type LinkDragData, type ListDropData } from "@/components/menu-drag"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  addLink,
  canPlace,
  newId,
  opensInTab,
  personalPath,
  placeKey,
  removeLink,
  setStartLink,
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
  startLinkId: string | null
  /** Opens a screen; `linkId` is the menu link clicked, if one was. */
  open: (url: string, linkId?: string) => void
  update: (change: (menu: Menu) => Menu) => void
}

export const MenuActionsContext = React.createContext<MenuActions | null>(null)

export function useMenuActions() {
  const actions = React.useContext(MenuActionsContext)
  if (!actions) throw new Error("MenuActionsContext is missing")
  return actions
}

/**
 * What a link's `<a>` needs. A panel link opens its screen on a plain click
 * and leaves a modified click to the browser; a link set to open in its own
 * tab is a plain link to the site that never touches the panel.
 */
export function linkAnchorProps(
  link: MenuLink,
  open: MenuActions["open"]
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  if (opensInTab(link)) return { href: link.url, target: "_blank", rel: "noopener" }
  return {
    href: personalPath(link.url),
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      open(link.url, link.id)
    },
  }
}

/** The small arrow after the name of a link that opens in its own tab. */
export function OwnTabMark({ link }: { link: MenuLink }) {
  if (!opensInTab(link)) return null
  return (
    <>
      <ArrowUpRightIcon className="size-3 text-muted-foreground" aria-hidden />
      <span className="sr-only">(opens in its own tab)</span>
    </>
  )
}

/** A saved link with the form's changes. Panel is the default, so it is left out of the file. */
function withDraft(link: Pick<MenuLink, "id"> & Partial<MenuLink>, draft: LinkDraft): MenuLink {
  return {
    ...link,
    label: draft.label,
    url: draft.url,
    icon: draft.icon,
    opens: draft.opens === "tab" ? "tab" : undefined,
  }
}

/** Saves the form's "Personal opens here" switch for a link. A tab link can't be the start. */
function withStart(menu: Menu, linkId: string, draft: LinkDraft) {
  return setStartLink(menu, linkId, draft.start && draft.opens !== "tab")
}

type Orientation = "vertical" | "horizontal"

/** A link's name turned into a box: Enter or leaving the box keeps it, Escape drops it. */
function LinkRename({
  link,
  vertical,
  onDone,
}: {
  link: MenuLink
  vertical: boolean
  onDone: (label: string | null) => void
}) {
  const [draft, setDraft] = React.useState(link.label)
  // Escape drops the name even if the box then reports losing focus.
  const droppedRef = React.useRef(false)
  return (
    <Input
      autoFocus
      aria-label={`Rename ${link.label}`}
      value={draft}
      maxLength={60}
      className={cn("h-7 text-sm", vertical ? "min-w-0 flex-1" : "w-36")}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!droppedRef.current) onDone(draft)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          droppedRef.current = true
          onDone(null)
        }
      }}
    />
  )
}

/**
 * One link: click it to open its screen, hover it to drag or edit it, and
 * double-click its name to rename it while editing is on. A left-menu link
 * with sub-links folds them underneath, as Custom Shell's menu does, and
 * remembers per browser whether they are folded.
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
  const {
    editing: editingMenu,
    places,
    openUrl,
    activeId,
    startLinkId,
    open,
    update,
  } = useMenuActions()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [renaming, setRenaming] = React.useState(false)
  // Switching editing off closes a half-done rename, as sections do.
  const [wasEditing, setWasEditing] = React.useState(editingMenu)
  if (editingMenu !== wasEditing) {
    setWasEditing(editingMenu)
    if (!editingMenu) setRenaming(false)
  }
  const [subLinksOpen, setSubLinksOpen] = useRememberedOpen(`personal-sidebar-link-${link.id}`)
  const data: LinkDragData = { kind: "link", link, place }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: linkDragId(link.id), data })
  const subLinks = link.children ?? []
  const active = activeId === link.id
  // Marked while one of its sub-links is open too, as the shell marks it.
  const inActive = active || subLinks.some((child) => child.id === activeId)
  // Only a left-menu link may hold sub-links, and only one level deep.
  const canHoldSubLinks = place.kind === "section"
  const vertical = orientation === "vertical"
  const anchor = linkAnchorProps(link, open)

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
      {renaming && editingMenu ? (
        <LinkRename
          link={link}
          vertical={vertical}
          onDone={(label) => {
            setRenaming(false)
            const name = label?.trim()
            if (name && name !== link.label) {
              update((menu) => updateLink(menu, { ...link, label: name }, place))
            }
          }}
        />
      ) : (
        <a
          {...anchor}
          data-active={inActive && !nested ? "" : undefined}
          aria-current={active ? "page" : undefined}
          onClick={(event) => {
            // While editing, the second click of a double-click renames
            // instead of opening the screen again.
            if (editingMenu && event.detail > 1) {
              event.preventDefault()
              return
            }
            anchor.onClick?.(event)
          }}
          onDoubleClick={
            editingMenu
              ? (event) => {
                  event.preventDefault()
                  setRenaming(true)
                }
              : undefined
          }
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
          <OwnTabMark link={link} />
        </a>
      )}
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
      {editingMenu && !renaming ? (
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
                initial={{
                  label: link.label,
                  url: link.url,
                  icon: link.icon,
                  opens: link.opens ?? "panel",
                  start: startLinkId === link.id,
                }}
                place={place}
                places={places.filter((choice) => canPlace(link, choice.place))}
                openUrl={openUrl}
                submitLabel="Save"
                onSubmit={(draft, to) => {
                  update((menu) =>
                    withStart(updateLink(menu, withDraft(link, draft), to), link.id, draft)
                  )
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
        // The link stays as a faint placeholder where it will land; a copy of
        // it follows the pointer.
        isDragging && "z-10 opacity-50"
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

/**
 * A place's links, in order. Each list is one of the drop targets inside the
 * menu's single drag area (`components/menu-drag.tsx`), so a link can be
 * dragged into a new order here or into another list.
 */
export function SortableLinks({
  links,
  place,
  orientation,
  nested = false,
  className,
  dropClassName,
  children,
}: {
  links: MenuLink[]
  place: Place
  orientation: Orientation
  /** Sub-links under a left-menu link, drawn like Custom Shell's. */
  nested?: boolean
  className?: string
  /** Lays out the drop area: the list, then `children`. */
  dropClassName?: string
  /**
   * Drawn after the list, inside its drop area, such as Add link. It gives
   * an empty list somewhere to drop a link without the menu moving when a
   * drag starts.
   */
  children?: React.ReactNode
}) {
  const data: ListDropData = { kind: "list", place }
  const { setNodeRef } = useDroppable({ id: listDropId(place), data })
  // While a link is dragged, an empty list outlines where it can be dropped.
  // An outline takes no room, so nothing moves under the pointer.
  const draggingLink = useDndContext().active?.data.current?.kind === "link"

  return (
    <div
      ref={setNodeRef}
      className={cn(
        dropClassName,
        draggingLink && links.length === 0 && "rounded-md outline-1 outline-border outline-dashed"
      )}
    >
      <SortableContext
        id={placeKey(place)}
        items={links.map((link) => linkDragId(link.id))}
        strategy={
          orientation === "vertical" ? verticalListSortingStrategy : horizontalListSortingStrategy
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
      {children}
    </div>
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
          initial={{ label: "", url: "", icon: "link", opens: "panel", start: false }}
          place={place}
          places={places}
          openUrl={openUrl}
          submitLabel="Add link"
          onSubmit={(draft, to) => {
            const id = newId("link")
            update((menu) =>
              withStart(addLink(menu, to, withDraft({ id }, draft)), id, draft)
            )
            setAdding(false)
            onAdded?.()
          }}
          onCancel={() => setAdding(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
