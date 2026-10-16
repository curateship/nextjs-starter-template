import * as React from "react"
import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { AddLinkButton, SortableLinks } from "@/components/menu-links"
import { Button } from "@/components/ui/button"
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

/** A section's name, renamed in place: Enter or leaving the box keeps it, Escape drops it. */
function SectionTitle({
  section,
  renaming,
  onRenamingChange,
  onRename,
  onDelete,
}: {
  section: MenuSection
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
      <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/70">
        {name}
      </h2>
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
    </div>
  )
}

/**
 * The left menu: sections of links, each edited where it stands. Deleting a
 * section that still holds links asks first; an empty one goes at once.
 */
export function Sidebar({
  menu,
  update,
}: {
  menu: Menu
  update: (change: (menu: Menu) => Menu) => void
}) {
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<MenuSection | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
        <span className="text-sm font-semibold">Personal</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Screens" className="flex flex-col gap-3 p-2">
          {menu.sections.map((section) => (
            <section key={section.id} className="flex flex-col gap-0.5">
              <SectionTitle
                section={section}
                renaming={renamingId === section.id}
                onRenamingChange={(renaming) => setRenamingId(renaming ? section.id : null)}
                onRename={(title) => update((m) => renameSection(m, section.id, title))}
                onDelete={() => {
                  if (section.links.length) setDeleting(section)
                  else update((m) => removeSection(m, section.id))
                }}
              />
              <SortableLinks
                links={section.links}
                place={{ kind: "section", sectionId: section.id }}
                orientation="vertical"
              />
              <AddLinkButton
                place={{ kind: "section", sectionId: section.id }}
                label="Add link"
              />
            </section>
          ))}
          {menu.sections.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              No sections yet. Add one below, then add links to it.
            </p>
          ) : null}
        </nav>
      </ScrollArea>
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
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.title || "this section"}?`}
        description={
          deleting
            ? `Removes it and the ${deleting.links.length} ${plural(deleting.links.length, "link")} in it from the menu. The screens themselves are not touched.`
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
