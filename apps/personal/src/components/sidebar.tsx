import * as React from "react"
import { ChevronRightIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { AddLinkButton, SortableLinks } from "@/components/menu-links"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  addSection,
  newId,
  removeSection,
  renameSection,
  type Menu,
  type MenuSection,
} from "@/lib/menu"
import { plural } from "@/lib/plural"
import { useRememberedOpen } from "@/lib/use-remembered-open"

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
}: {
  section: MenuSection
  editing: boolean
  renaming: boolean
  onRenamingChange: (renaming: boolean) => void
  onRename: (title: string) => void
  onDelete: () => void
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

/** One section: its name, which folds it, then its links and Add link. */
function SidebarSection({
  section,
  ...title
}: Omit<React.ComponentProps<typeof SectionTitle>, "section"> & {
  section: MenuSection
}) {
  const [open, setOpen] = useRememberedOpen(`personal-sidebar-section-${section.id}`)

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="flex flex-col gap-0.5">
        <SectionTitle section={section} {...title} />
        {/* The room under a section belongs to its open links, as in Custom
            Shell, so folded sections stack name under name. */}
        <CollapsibleContent className="flex flex-col gap-0.5 pb-2">
          <SortableLinks
            links={section.links}
            place={{ kind: "section", sectionId: section.id }}
            orientation="vertical"
          />
          <AddLinkButton place={{ kind: "section", sectionId: section.id }} label="Add link" />
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/**
 * The left menu: sections of links, each edited where it stands while editing
 * is on. "Edit the menu" in the top bar's cog turns editing on and off; off, the
 * menu shows only its sections and links. Deleting a section that still holds
 * links asks first; an empty one goes at once.
 */
export function Sidebar({
  menu,
  update,
  editing,
  onHome,
}: {
  menu: Menu
  update: (change: (menu: Menu) => Menu) => void
  editing: boolean
  /** The logo and name go back to Personal's start page. */
  onHome: () => void
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center p-2">
        {/* The whole logo row is one link to the start page. The logo has a
            white version for dark mode, both cut from the logo the old
            Personal OS used. */}
        <a
          href="/"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
            event.preventDefault()
            onHome()
          }}
          className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 outline-hidden hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <img src="/logo.png" alt="" className="size-6 shrink-0 dark:hidden" />
          <img src="/logo-dark.png" alt="" className="hidden size-6 shrink-0 dark:block" />
          <span className="truncate text-sm font-semibold">Personal</span>
        </a>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Screens" className="flex flex-col p-2">
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
          {menu.sections.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              {editing
                ? "No sections yet. Add one below, then add links to it."
                : "No sections yet. Turn on Edit the menu in the top bar's cog to add one."}
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
