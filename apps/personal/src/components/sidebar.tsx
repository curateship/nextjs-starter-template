import * as React from "react"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { BrandEditor, BrandLogo } from "@/components/brand-editor"
import {
  PINNED_LIST_ID,
  pinnedDragId,
  sectionDragId,
  SECTIONS_LIST_ID,
  type PinnedDragData,
  type SectionDragData,
} from "@/components/menu-drag"
import { LinkIconPicture } from "@/components/link-icon"
import {
  AddLinkButton,
  linkAnchorProps,
  OwnTabMark,
  SortableLinks,
  useMenuActions,
} from "@/components/menu-links"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  addSection,
  DEFAULT_BRAND_NAME,
  newId,
  personalPath,
  pinnedLinks,
  removeSection,
  renameSection,
  setPinned,
  type Menu,
  type MenuLink,
  type MenuSection,
} from "@/lib/menu"
import { plural } from "@/lib/plural"
import { useMenuFormSide } from "@/lib/use-menu-form-side"
import { useRememberedOpen } from "@/lib/use-remembered-open"
import { cn } from "@/lib/utils"

/** A section's links, sub-links counted too. */
function linkCount(section: MenuSection) {
  return section.links.reduce((count, link) => count + 1 + (link.children?.length ?? 0), 0)
}

/** A section's name, renamed in place: Enter or leaving the box keeps it, Escape drops it. */
function SectionTitle({
  section,
  editing,
  renaming,
  onRenamingChange,
  onRename,
  onDelete,
  dragHandle,
}: {
  section: MenuSection
  editing: boolean
  renaming: boolean
  onRenamingChange: (renaming: boolean) => void
  onRename: (title: string) => void
  onDelete: () => void
  /** The drag handle's own props, from the section's sortable. */
  dragHandle: React.ButtonHTMLAttributes<HTMLButtonElement>
}) {
  const [draft, setDraft] = React.useState(section.title)
  const name = section.title || "Untitled section"

  if (renaming) {
    return (
      <Input
        autoFocus
        aria-label="Section name"
        value={draft}
        maxLength={60}
        className="h-7 text-xs"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onRename(draft)
          onRenamingChange(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            setDraft(section.title)
            onRenamingChange(false)
          }
        }}
      />
    )
  }

  return (
    <div className="group/section flex h-8 items-center gap-1 px-2">
      <h2 className="min-w-0 flex-1">
        {/* The name folds the section, as in Custom Shell: the arrow shows on
            hover and points down while the section is open. */}
        <CollapsibleTrigger className="group/section-label flex w-full min-w-0 items-center justify-between gap-1 rounded-md text-xs font-medium text-sidebar-foreground/70 outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="truncate">{name}</span>
          <ChevronRightIcon className="size-4 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover/section-label:opacity-100 group-focus-visible/section-label:opacity-100 group-data-[state=open]/section-label:rotate-90" />
        </CollapsibleTrigger>
      </h2>
      {editing ? (
        <div className="flex opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Drag ${name}`}
            className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden active:cursor-grabbing"
            {...dragHandle}
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Rename ${name}`}
            onClick={() => {
              setDraft(section.title)
              onRenamingChange(true)
            }}
          >
            <SettingsIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={`Delete ${name}`} onClick={onDelete}>
            <Trash2Icon />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * One section: its name, which folds it, then its links and Add link. While
 * editing, its name row has a drag handle that moves the whole section; a
 * folded one moves as its name alone.
 */
function SidebarSection({
  section,
  ...title
}: Omit<React.ComponentProps<typeof SectionTitle>, "section" | "dragHandle"> & {
  section: MenuSection
}) {
  const [open, setOpen] = useRememberedOpen(`personal-sidebar-section-${section.id}`)
  const data: SectionDragData = { kind: "section", sectionId: section.id }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionDragId(section.id),
    data,
  })

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn(
          "relative flex flex-col gap-0.5",
          isDragging && "z-10 rounded-md bg-sidebar opacity-80 shadow-sm"
        )}
      >
        <SectionTitle section={section} dragHandle={{ ...attributes, ...listeners }} {...title} />
        {/* The room under a section belongs to its open links, as in Custom
            Shell, so folded sections stack name under name. */}
        <CollapsibleContent className="pb-2">
          <SortableLinks
            links={section.links}
            place={{ kind: "section", sectionId: section.id }}
            dropClassName="flex flex-col gap-0.5"
          >
            <AddLinkButton place={{ kind: "section", sectionId: section.id }} label="Add link" />
          </SortableLinks>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/**
 * "Pinned" at the top of the left menu, folded like a section: the links
 * switched to Pinned in their edit form, in the order they were pinned. It
 * replaced the last three opened links on 19 Oct 2026: Tyler, "Instead of
 * 'recent' lets replace it with 'Pinned'". Each link stays in its own section
 * too, and is edited there. While editing is on, hovering a row shows a
 * handle that drags it into a new place in Pinned, and an × that unpins it.
 */
export function PinnedLinks({
  links,
  onUnpin,
}: {
  links: MenuLink[]
  onUnpin: (id: string) => void
}) {
  const [open, setOpen] = useRememberedOpen("personal-sidebar-pinned")
  if (links.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-label="Pinned" className="flex flex-col gap-0.5">
        <div className="flex h-8 items-center px-2">
          <h2 className="min-w-0 flex-1">
            <CollapsibleTrigger className="group/section-label flex w-full min-w-0 items-center justify-between gap-1 rounded-md text-xs font-medium text-sidebar-foreground/70 outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <span className="truncate">Pinned</span>
              <ChevronRightIcon className="size-4 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover/section-label:opacity-100 group-focus-visible/section-label:opacity-100 group-data-[state=open]/section-label:rotate-90" />
            </CollapsibleTrigger>
          </h2>
        </div>
        <CollapsibleContent className="pb-2">
          <SortableContext
            id={PINNED_LIST_ID}
            items={links.map((link) => pinnedDragId(link.id))}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-0.5">
              {links.map((link) => (
                <PinnedRow key={link.id} link={link} onUnpin={() => onUnpin(link.id)} />
              ))}
            </ul>
          </SortableContext>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** One row of Pinned: the link, and while editing its drag handle and ×. */
function PinnedRow({ link, onUnpin }: { link: MenuLink; onUnpin: () => void }) {
  const { editing, activeId, open } = useMenuActions()
  const data: PinnedDragData = { kind: "pinned", linkId: link.id }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pinnedDragId(link.id),
    data,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/pinned relative",
        isDragging && "z-10 rounded-md bg-sidebar opacity-80 shadow-sm"
      )}
    >
      <a
        {...linkAnchorProps(link, open)}
        data-active={activeId === link.id ? "" : undefined}
        className={cn(
          "flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-hidden group-hover/pinned:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:shrink-0",
          editing && "group-hover/pinned:pr-14"
        )}
      >
        <LinkIconPicture name={link.icon} />
        <span className="truncate">{link.label}</span>
        <OwnTabMark link={link} />
      </a>
      {/* The whole row is the one hover, handle and × included: neither has
          a box of its own, and the name makes room for them only while
          hovered, so it keeps its whole name the rest of the time. */}
      {editing ? (
        <div
          className={cn(
            "absolute top-1/2 right-1 flex -translate-y-1/2 items-center opacity-0 group-hover/pinned:opacity-100 focus-within:opacity-100",
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Unpin ${link.label}`}
            className="text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
            onClick={onUnpin}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/**
 * The left menu: "Pinned", then sections of links, each edited where it stands while editing
 * is on, then the list of links at its bottom, then `footer`. "Edit the menu"
 * in the cog at the bottom turns editing on and off; off, the menu shows only
 * its sections and links. Deleting a section that still holds links asks
 * first; an empty one goes at once.
 */
export function Sidebar({
  menu,
  update,
  editing,
  onHome,
  footer,
}: {
  menu: Menu
  update: (change: (menu: Menu) => Menu) => void
  editing: boolean
  /** The logo and name go back to Personal's start page, when no screen is chosen for them. */
  onHome: () => void
  /** The controls at the very bottom. */
  footer: React.ReactNode
}) {
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  // Switching editing off closes any half-done rename, so it doesn't reopen
  // the next time editing comes on.
  const [wasEditing, setWasEditing] = React.useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    if (!editing) setRenamingId(null)
  }
  const [deleting, setDeleting] = React.useState<MenuSection | null>(null)
  const [brandOpen, setBrandOpen] = React.useState(false)
  const formSide = useMenuFormSide()
  const { open, openUrl } = useMenuActions()
  const brand = menu.brand

  return (
    <div className="flex h-full flex-col">
      <div className="group/brand relative flex h-16 shrink-0 items-center p-2">
        {/* The whole logo row is one link: to the screen chosen for it, or
            else the start page. Its name, logo and link are changed with the
            cog that shows while editing (Tyler asked for this on 18 Oct
            2026). Personal's own logo has a white version for dark mode,
            both cut from the logo the old Personal OS used. */}
        <a
          href={brand?.url ? personalPath(brand.url) : "/"}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
            event.preventDefault()
            if (brand?.url) open(brand.url)
            else onHome()
          }}
          className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <BrandLogo logo={brand?.logo} />
          <span className="truncate text-sm font-semibold">{brand?.name ?? DEFAULT_BRAND_NAME}</span>
        </a>
        {editing ? (
          <Popover open={brandOpen} onOpenChange={setBrandOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Change the name, logo and link"
                className="absolute top-1/2 right-4 -translate-y-1/2 bg-sidebar-accent opacity-0 group-hover/brand:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <SettingsIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent side={formSide} align="start" collisionPadding={8} className="w-80">
              <BrandEditor
                brand={brand}
                openUrl={openUrl}
                onSubmit={(next) => {
                  update((m) => {
                    const { brand: _old, ...rest } = m
                    return next ? { ...rest, brand: next } : rest
                  })
                  setBrandOpen(false)
                }}
                onCancel={() => setBrandOpen(false)}
              />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Screens" className="flex flex-col p-2">
          <PinnedLinks
            links={pinnedLinks(menu)}
            onUnpin={(id) => update((m) => setPinned(m, id, false))}
          />
          <SortableContext
            id={SECTIONS_LIST_ID}
            items={menu.sections.map((section) => sectionDragId(section.id))}
            strategy={verticalListSortingStrategy}
          >
            {menu.sections.map((section) => (
              <SidebarSection
                key={section.id}
                section={section}
                editing={editing}
                renaming={editing && renamingId === section.id}
                onRenamingChange={(renaming) => setRenamingId(renaming ? section.id : null)}
                onRename={(title) => update((m) => renameSection(m, section.id, title))}
                onDelete={() => {
                  if (section.links.length) setDeleting(section)
                  else update((m) => removeSection(m, section.id))
                }}
              />
            ))}
          </SortableContext>
          {menu.sections.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              {editing
                ? "No sections yet. Add one below, then add links to it."
                : "No sections yet. Turn on Edit the menu in the cog at the bottom to add one."}
            </p>
          ) : null}
        </nav>
      </ScrollArea>
      {editing ? (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => {
              const id = newId("section")
              update((m) => addSection(m, { id, title: "New section", links: [] }))
              setRenamingId(id)
            }}
          >
            <PlusIcon />
            Add section
          </Button>
        </div>
      ) : null}
      {menu.top.length || editing ? (
        <nav aria-label="Bottom links" className="shrink-0 border-t border-sidebar-border/50 p-2">
          <SortableLinks
            links={menu.top}
            place={{ kind: "top" }}
            dropClassName="flex flex-col gap-0.5"
          >
            <AddLinkButton place={{ kind: "top" }} label="Add link" />
          </SortableLinks>
        </nav>
      ) : null}
      {footer}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.title || "this section"}?`}
        description={
          deleting
            ? `Removes it and the ${linkCount(deleting)} ${plural(linkCount(deleting), "link")} in it from the menu. The screens themselves are not touched.`
            : ""
        }
        confirmLabel="Delete section"
        onConfirm={() => {
          if (deleting) update((m) => removeSection(m, deleting.id))
          setDeleting(null)
        }}
      />
    </div>
  )
}
