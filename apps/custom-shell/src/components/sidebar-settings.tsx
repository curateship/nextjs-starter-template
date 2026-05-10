import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
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
  CheckIcon,
  GripVertical,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardGroup,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  createDefaultShellConfig,
  iconMeta,
  isShellItem,
  renderShellIcon,
  type IconKey,
  type ShellChildItem,
  type ShellConfig,
  type ShellEntry,
  type ShellItem,
  type ShellSection,
} from "@/lib/custom-shell"

const iconOptions = Object.entries(iconMeta).map(([value, meta]) => ({
  value: value as IconKey,
  label: meta.label,
}))

type SidebarSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

type SortableItemProps = {
  sectionId: string
  item: ShellItem
  onItemChange: (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => void
}

type SortableChildProps = {
  child: ShellChildItem
  onChange: (childId: string, patch: Partial<ShellChildItem>) => void
  onDelete: (childId: string) => void
}

type SortableSectionProps = {
  section: ShellSection
  onSectionTitleChange: (sectionId: string, title: string) => void
  onReset: () => void
  onItemAdd: (sectionId: string) => void
  onItemChange: (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onItemDragEnd: (sectionId: string, event: DragEndEvent) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => void
}

function createShellId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}`
}

function updateSection(
  config: ShellConfig,
  sectionId: string,
  update: (section: ShellSection) => ShellSection
) {
  return {
    ...config,
    sections: config.sections.map((section) =>
      section.id === sectionId ? update(section) : section
    ),
  }
}

function IconPickerButton({
  value,
  onValueChange,
  allowEmpty = false,
  compact = false,
  ghost = false,
}: {
  value?: IconKey
  onValueChange: (value: IconKey | undefined) => void
  allowEmpty?: boolean
  compact?: boolean
  ghost?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const currentLabel = value ? iconMeta[value].label : "No icon"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={ghost ? "ghost" : "outline"}
          size={compact ? "icon" : "default"}
          className={cn(!compact && "justify-start")}
          aria-label={`Choose icon, current icon ${currentLabel}`}
        >
          {value ? renderShellIcon(value, "h-4 w-4") : null}
          {!compact ? <span className="truncate">{currentLabel}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="grid grid-cols-5 gap-1.5">
          {allowEmpty ? (
            <button
              type="button"
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md border text-xs transition-colors hover:bg-muted",
                !value && "border-primary bg-primary/5"
              )}
              onClick={() => {
                onValueChange(undefined)
                setOpen(false)
              }}
              aria-label="Use no icon"
            >
              None
              {!value ? (
                <CheckIcon className="absolute right-1 top-1 h-3 w-3" />
              ) : null}
            </button>
          ) : null}
          {iconOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-muted",
                value === option.value && "border-primary bg-primary/5"
              )}
              onClick={() => {
                onValueChange(option.value)
                setOpen(false)
              }}
              aria-label={`Use ${option.label} icon`}
              title={option.label}
            >
              {renderShellIcon(option.value, "h-4 w-4")}
              {value === option.value ? (
                <CheckIcon className="absolute right-1 top-1 h-3 w-3" />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DividerPreview({ entry }: { entry: ShellEntry }) {
  if (isShellItem(entry)) {
    return null
  }

  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {entry.label || "Divider"}
    </div>
  )
}

function SortableChild({ child, onChange, onDelete }: SortableChildProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid items-center gap-2 rounded-md border bg-background p-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Reorder ${child.label || "child link"}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <IconPickerButton
        value={child.icon}
        allowEmpty
        compact
        ghost
        onValueChange={(icon) => onChange(child.id, { icon })}
      />
      <Input
        value={child.label}
        onChange={(event) => onChange(child.id, { label: event.target.value })}
        placeholder="Child label"
        aria-label="Child label"
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
      />
      <Input
        value={child.href}
        onChange={(event) => onChange(child.id, { href: event.target.value })}
        placeholder="/admin/example"
        aria-label="Child URL"
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(child.id)}
        aria-label={`Delete ${child.label || "child link"}`}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

function SortableSidebarItem({
  sectionId,
  item,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
}: SortableItemProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  const children = item.children ?? []

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-lg bg-background transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          aria-label={`Reorder ${item.label || "sidebar link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
          onClick={() => setDialogOpen(true)}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground">
            {renderShellIcon(item.icon, "h-4 w-4")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {item.label || "Untitled link"}
            </span>
          </span>
          {children.length ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              {children.length} child{children.length === 1 ? "" : "ren"}
            </span>
          ) : null}
          {!item.visible ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </button>

        <label
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          title={item.visible ? "Visible" : "Hidden"}
        >
          <Checkbox
            checked={item.visible}
            onCheckedChange={(checked) =>
              onItemChange(sectionId, item.id, { visible: checked === true })
            }
          />
          <span className="sr-only">Show {item.label || "sidebar link"}</span>
        </label>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hover:bg-transparent"
          onClick={() => onItemDelete(sectionId, item.id)}
          aria-label={`Delete ${item.label || "sidebar link"}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{item.label || "Sidebar Link"}</DialogTitle>
            <DialogDescription>
              Edit this sidebar destination and its child links.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <IconPickerButton
                value={item.icon}
                compact
                onValueChange={(icon) =>
                  icon ? onItemChange(sectionId, item.id, { icon }) : undefined
                }
              />
              <Input
                value={item.label}
                onChange={(event) =>
                  onItemChange(sectionId, item.id, {
                    label: event.target.value,
                  })
                }
                placeholder="Label"
                aria-label="Sidebar link label"
              />
              <Input
                value={item.href}
                onChange={(event) =>
                  onItemChange(sectionId, item.id, { href: event.target.value })
                }
                placeholder="/admin/example"
                aria-label="Sidebar link URL"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Child links</p>
                  <p className="text-xs text-muted-foreground">
                    These become the nested links and sticky header shortcuts.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChildAdd(sectionId, item.id)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Child
                </Button>
              </div>

              {children.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) =>
                    onChildDragEnd(sectionId, item.id, event)
                  }
                >
                  <SortableContext
                    items={children.map((child) => child.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {children.map((child) => (
                        <SortableChild
                          key={child.id}
                          child={child}
                          onChange={(childId, patch) =>
                            onChildChange(sectionId, item.id, childId, patch)
                          }
                          onDelete={(childId) =>
                            onChildDelete(sectionId, item.id, childId)
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No child links.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableSectionCard({
  section,
  onSectionTitleChange,
  onReset,
  onItemAdd,
  onItemChange,
  onItemDelete,
  onItemDragEnd,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const sortableItemIds = section.entries
    .filter(isShellItem)
    .map((entry) => entry.id)
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
            aria-label={`Reorder ${section.title || "sidebar section"}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <Input
              value={section.title}
              onChange={(event) =>
                onSectionTitleChange(section.id, event.target.value)
              }
              placeholder="Untitled Section"
              aria-label="Sidebar section label"
              className="h-8 max-w-xs border-transparent bg-transparent px-2 text-sm font-semibold shadow-none hover:bg-muted/40 focus-visible:bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              <RotateCcwIcon className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onItemAdd(section.id)}
            >
              <PlusIcon className="h-4 w-4" />
              Add Link
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => onItemDragEnd(section.id, event)}
        >
          <SortableContext
            items={sortableItemIds}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {section.entries.map((entry) =>
                isShellItem(entry) ? (
                  <SortableSidebarItem
                    key={entry.id}
                    sectionId={section.id}
                    item={entry}
                    onItemChange={onItemChange}
                    onItemDelete={onItemDelete}
                    onChildAdd={onChildAdd}
                    onChildChange={onChildChange}
                    onChildDelete={onChildDelete}
                    onChildDragEnd={onChildDragEnd}
                  />
                ) : (
                  <DividerPreview key={entry.id} entry={entry} />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>

        {!sortableItemIds.length ? (
          <div
            className={cn(
              "rounded-lg border border-dashed p-4 text-center text-sm",
              "text-muted-foreground"
            )}
          >
            No sidebar links in this section.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function SidebarSettings({
  config,
  onConfigChange,
}: SidebarSettingsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleAddItem = (sectionId: string) => {
    const item: ShellItem = {
      type: "item",
      id: createShellId("item"),
      label: "New Link",
      href: "/admin/new-link",
      icon: "appWindow",
      visible: true,
    }

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: [...section.entries, item],
      }))
    )
  }

  const handleAddSection = () => {
    onConfigChange({
      ...config,
      sections: [
        ...config.sections,
        {
          id: createShellId("section"),
          title: "New Section",
          entries: [],
        },
      ],
    })
  }

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        title,
      }))
    )
  }

  const handleItemChange = (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? { ...entry, ...patch }
            : entry
        ),
      }))
    )
  }

  const handleItemDelete = (sectionId: string, itemId: string) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.filter((entry) => entry.id !== itemId),
      }))
    )
  }

  const handleParentDragEnd = (sectionId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    onConfigChange(
      updateSection(config, sectionId, (section) => {
        const oldIndex = section.entries.findIndex(
          (entry) => entry.id === active.id
        )
        const newIndex = section.entries.findIndex(
          (entry) => entry.id === over.id
        )

        if (oldIndex === -1 || newIndex === -1) return section

        return {
          ...section,
          entries: arrayMove(section.entries, oldIndex, newIndex),
        }
      })
    )
  }

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = config.sections.findIndex(
      (section) => section.id === active.id
    )
    const newIndex = config.sections.findIndex(
      (section) => section.id === over.id
    )

    if (oldIndex === -1 || newIndex === -1) return

    onConfigChange({
      ...config,
      sections: arrayMove(config.sections, oldIndex, newIndex),
    })
  }

  const handleChildAdd = (sectionId: string, itemId: string) => {
    const child: ShellChildItem = {
      id: createShellId("child"),
      label: "New Child",
      href: "/admin/new-child",
    }

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? { ...entry, children: [...(entry.children ?? []), child] }
            : entry
        ),
      }))
    )
  }

  const handleChildChange = (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).map((child) =>
                  child.id === childId ? { ...child, ...patch } : child
                ),
              }
            : entry
        ),
      }))
    )
  }

  const handleChildDelete = (
    sectionId: string,
    itemId: string,
    childId: string
  ) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).filter(
                  (child) => child.id !== childId
                ),
              }
            : entry
        ),
      }))
    )
  }

  const handleChildDragEnd = (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (!isShellItem(entry) || entry.id !== itemId) return entry

          const children = entry.children ?? []
          const oldIndex = children.findIndex((child) => child.id === active.id)
          const newIndex = children.findIndex((child) => child.id === over.id)

          if (oldIndex === -1 || newIndex === -1) return entry

          return {
            ...entry,
            children: arrayMove(children, oldIndex, newIndex),
          }
        }),
      }))
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={config.sections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          <CardGroup>
            {config.sections.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                onSectionTitleChange={handleSectionTitleChange}
                onReset={() => onConfigChange(createDefaultShellConfig())}
                onItemAdd={handleAddItem}
                onItemChange={handleItemChange}
                onItemDelete={handleItemDelete}
                onItemDragEnd={handleParentDragEnd}
                onChildAdd={handleChildAdd}
                onChildChange={handleChildChange}
                onChildDelete={handleChildDelete}
                onChildDragEnd={handleChildDragEnd}
              />
            ))}
          </CardGroup>
        </SortableContext>
      </DndContext>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleAddSection}
        >
          <PlusIcon className="h-4 w-4" />
          Add Section
        </Button>
      </div>
    </>
  )
}
