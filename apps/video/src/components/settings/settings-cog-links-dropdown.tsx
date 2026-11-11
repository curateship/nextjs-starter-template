import * as React from "react"
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, Trash2Icon } from "lucide-react"

import {
  createShellId,
  getShellHrefProblem,
  reorderByDrag,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  renderShellIcon,
  type ShellTopRightLink,
} from "@/lib/custom-shell"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Draft = { label: string; href: string; icon: string }

const EMPTY_DRAFT: Draft = { label: "", href: "", icon: "appWindow" }

/** One saved link in the dropdown: drag it, press it to edit it, or bin it. */
function CogLinkRow({
  link,
  onEdit,
  onDelete,
}: {
  link: ShellTopRightLink
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(link.id, true)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded-md hover:bg-muted/60"
    >
      <span
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${link.label}`}
        className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>
      <Button
        type="button"
        variant="ghost"
        className="h-8 min-w-0 flex-1 justify-start gap-2 px-1.5 font-normal hover:bg-transparent"
        onClick={onEdit}
        aria-label={`Edit ${link.label}`}
      >
        <span className="shrink-0 text-muted-foreground">
          {renderShellIcon(link.icon, "size-4")}
        </span>
        <span className="truncate">{link.label}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label={`Delete ${link.label}`}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  )
}

/**
 * The Settings chip in a top right menu editor, opening a dropdown of the
 * links that sit inside the header's cog (Tyler, 10 Nov 2026: "clicking on the
 * button should open a dropdown to add it instead"). The dropdown lists the
 * links, dragged into order, and ends in a form that adds one. Pressing a
 * link puts it in that form to change it.
 */
export function SettingsCogLinksDropdown({
  links,
  onLinksChange,
  trigger,
}: {
  links: readonly ShellTopRightLink[]
  onLinksChange: (links: ShellTopRightLink[]) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT)
  // The link being changed, or null when the form adds a new one.
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<"label" | "href" | null>(null)
  const labelRef = React.useRef<HTMLInputElement>(null)
  const sensors = useNavSensors()

  const reset = () => {
    setDraft(EMPTY_DRAFT)
    setEditingId(null)
    setInvalid(null)
  }

  const submit = () => {
    dismissErrorToast()
    const label = draft.label.trim()
    const href = draft.href.trim()
    if (!label) {
      setInvalid("label")
      showErrorToast("Give this link a name.")
      labelRef.current?.focus()
      return
    }
    const problem = getShellHrefProblem(href, true)
    if (problem) {
      setInvalid("href")
      showErrorToast(problem)
      return
    }
    const saved = { label, href, icon: draft.icon }
    onLinksChange(
      editingId
        ? links.map((one) => (one.id === editingId ? { ...one, ...saved } : one))
        : [
            ...links,
            { type: "link", id: createShellId("cog-link"), ...saved },
          ]
    )
    reset()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const moved = reorderByDrag(
      [...links],
      links.map((link) => link.id),
      event
    )
    if (moved) onLinksChange(moved)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto max-w-[calc(100vw-1rem)] gap-3 p-3">
        <p className="text-sm font-medium">Links inside Settings</p>
        {links.length ? (
          <DndContext
            id="settings-cog-links"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={links.map((link) => link.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="-mx-1 grid gap-0.5">
                {links.map((link) => (
                  <CogLinkRow
                    key={link.id}
                    link={link}
                    onEdit={() => {
                      setEditingId(link.id)
                      setDraft({ label: link.label, href: link.href, icon: link.icon })
                      setInvalid(null)
                      labelRef.current?.focus()
                    }}
                    onDelete={() => {
                      onLinksChange(links.filter((one) => one.id !== link.id))
                      if (editingId === link.id) reset()
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : null}
        {/* Icon, name, address and the button on one line (Tyler, 10 Nov
            2026: "make it one row and you can shorten the name and url
            field a bit"). */}
        <form
          className="flex items-center gap-2"
          aria-label={editingId ? "Change link" : "Add link"}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <ShellIconPicker
            value={draft.icon}
            compact
            onValueChange={(icon) =>
              icon ? setDraft((current) => ({ ...current, icon })) : undefined
            }
          />
          <Input
            ref={labelRef}
            className="w-28"
            value={draft.label}
            onChange={(event) => {
              setDraft((current) => ({ ...current, label: event.target.value }))
              if (invalid === "label") setInvalid(null)
            }}
            placeholder="Name"
            aria-label="Link name"
            aria-invalid={invalid === "label" || undefined}
          />
          <Input
            className="w-36"
            value={draft.href}
            onChange={(event) => {
              setDraft((current) => ({ ...current, href: event.target.value }))
              if (invalid === "href") setInvalid(null)
            }}
            placeholder="/page or https://"
            aria-label="Link address"
            aria-invalid={invalid === "href" || undefined}
          />
          {editingId ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" className="shrink-0">
            {editingId ? null : <PlusIcon className="size-4" />}
            {editingId ? "Save" : "Add"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
