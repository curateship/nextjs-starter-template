import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
  useDroppable,
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
  GripVertical,
  MinusIcon,
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
import { ShellIconPicker } from "@/components/shell-icon-picker"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
  type ShellChildItem,
  type ShellConfig,
  type ShellEntry,
  type ShellItem,
  type ShellSection,
} from "@/lib/custom-shell"

const sectionDropPrefix = "section-drop:"

function getSectionDropId(sectionId: string) {
  return `${sectionDropPrefix}${sectionId}`
}

function getSectionIdFromDropId(id: string) {
  return id.startsWith(sectionDropPrefix)
    ? id.slice(sectionDropPrefix.length)
    : null
}

type SidebarSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}

type SortableItemProps = {
  sectionId: string
  item: ShellItem
  isSaving: boolean
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
  onSaveConfig: () => Promise<boolean>
}

type SortableChildProps = {
  child: ShellChildItem
  onChange: (childId: string, patch: Partial<ShellChildItem>) => void
  onDelete: (childId: string) => void
}

type SortableSectionProps = {
  section: ShellSection
  isDraggingItem: boolean
  isSaving: boolean
  onSectionTitleChange: (sectionId: string, title: string) => void
  onSectionDelete: (sectionId: string) => void
  onReset: () => void
  onItemAdd: (sectionId: string) => void
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
  onSaveConfig: () => Promise<boolean>
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
      <ShellIconPicker
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
  isSaving,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSaveConfig,
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
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
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{item.label || "Sidebar Link"}</DialogTitle>
            <DialogDescription>
              Edit this sidebar destination and its child links.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <ShellIconPicker
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
                  onItemChange(sectionId, item.id, {
                    href: event.target.value,
                  })
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
                  id={`custom-shell-sidebar-children-${item.id}`}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => onChildDragEnd(sectionId, item.id, event)}
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
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              disabled={isSaving}
              onClick={async () => {
                const saved = await onSaveConfig()
                if (saved) setDialogOpen(false)
              }}
            >
              {isSaving ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableSectionCard({
  section,
  isDraggingItem,
  isSaving,
  onSectionTitleChange,
  onSectionDelete,
  onReset,
  onItemAdd,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSaveConfig,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: getSectionDropId(section.id),
    disabled: !isDraggingItem,
  })
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hover:bg-red-50"
              onClick={() => onSectionDelete(section.id)}
              aria-label={`Delete ${section.title || "sidebar section"}`}
            >
              <MinusIcon className="h-4 w-4" />
              Delete Section
            </Button>
          </div>
        </div>

        <SortableContext
          items={sortableItemIds}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setDropNodeRef}
            className={cn(
              "-m-1 min-h-11 rounded-lg p-1 transition-colors",
              isOver && "bg-primary/5"
            )}
          >
            {section.entries.map((entry) =>
              isShellItem(entry) ? (
                <SortableSidebarItem
                  key={entry.id}
                  sectionId={section.id}
                  item={entry}
                  isSaving={isSaving}
                  onItemChange={onItemChange}
                  onItemDelete={onItemDelete}
                  onChildAdd={onChildAdd}
                  onChildChange={onChildChange}
                  onChildDelete={onChildDelete}
                  onChildDragEnd={onChildDragEnd}
                  onSaveConfig={onSaveConfig}
                />
              ) : (
                <DividerPreview key={entry.id} entry={entry} />
              )
            )}
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
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function SidebarSettings({
  config,
  isSaving,
  onConfigChange,
  onSaveConfig,
}: SidebarSettingsProps) {
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const sectionIds = React.useMemo(
    () => new Set(config.sections.map((section) => section.id)),
    [config.sections]
  )
  const emptySectionIds = React.useMemo(
    () =>
      new Set(
        config.sections
          .filter((section) => !section.entries.some(isShellItem))
          .map((section) => section.id)
      ),
    [config.sections]
  )
  const itemIds = React.useMemo(
    () =>
      new Set(
        config.sections.flatMap((section) =>
          section.entries.filter(isShellItem).map((entry) => entry.id)
        )
      ),
    [config.sections]
  )
  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      if (sectionIds.has(String(args.active.id))) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            sectionIds.has(String(container.id))
          ),
        })
      }

      const pointerCollisions = pointerWithin(args)
      const itemCollisions = pointerCollisions.filter((collision) =>
        itemIds.has(String(collision.id))
      )

      if (itemCollisions.length) return itemCollisions

      const sectionCollisions = pointerCollisions.filter((collision) => {
        const id = String(collision.id)
        const sectionId = getSectionIdFromDropId(id) ?? id
        return emptySectionIds.has(sectionId)
      })

      if (sectionCollisions.length) return sectionCollisions

      const centerCollisions = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => {
          const id = String(container.id)
          const sectionId = getSectionIdFromDropId(id) ?? id
          return itemIds.has(id) || emptySectionIds.has(sectionId)
        }),
      })
      const centerItemCollisions = centerCollisions.filter((collision) =>
        itemIds.has(String(collision.id))
      )

      return centerItemCollisions.length
        ? centerItemCollisions
        : centerCollisions
    },
    [emptySectionIds, itemIds, sectionIds]
  )

  const handleAddItem = (sectionId: string) => {
    const item: ShellItem = {
      type: "item",
      id: createShellId("item"),
      label: "",
      href: "",
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

  const handleSectionDelete = (sectionId: string) => {
    onConfigChange({
      ...config,
      sections: config.sections.filter((section) => section.id !== sectionId),
    })
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

  const findItemLocation = (itemId: string) => {
    for (const section of config.sections) {
      const itemIndex = section.entries.findIndex(
        (entry) => isShellItem(entry) && entry.id === itemId
      )

      if (itemIndex !== -1) return { section, itemIndex }
    }

    return null
  }

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeLocation = findItemLocation(activeId)
    const overLocation = findItemLocation(overId)
    const dropSectionId = getSectionIdFromDropId(overId)
    const overSection =
      overLocation?.section ??
      config.sections.find(
        (section) => section.id === (dropSectionId ?? overId)
      )

    if (!activeLocation || !overSection) return

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]
    if (!isShellItem(activeItem)) return

    if (activeLocation.section.id === overSection.id && overLocation) {
      onConfigChange(
        updateSection(config, activeLocation.section.id, (section) => ({
          ...section,
          entries: arrayMove(
            section.entries,
            activeLocation.itemIndex,
            overLocation.itemIndex
          ),
        }))
      )
      return
    }

    const nextSections = config.sections.map((section) => {
      const entries =
        section.id === activeLocation.section.id
          ? section.entries.filter((entry) => entry.id !== activeId)
          : section.entries

      if (section.id !== overSection.id) return { ...section, entries }

      const insertIndex = overLocation
        ? entries.findIndex((entry) => entry.id === overId)
        : entries.length

      return {
        ...section,
        entries: [
          ...entries.slice(0, insertIndex),
          activeItem,
          ...entries.slice(insertIndex),
        ],
      }
    })

    onConfigChange({ ...config, sections: nextSections })
  }

  const handleItemDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeLocation = findItemLocation(activeId)
    const overLocation = findItemLocation(overId)
    const dropSectionId = getSectionIdFromDropId(overId)
    const overSection =
      overLocation?.section ??
      config.sections.find(
        (section) => section.id === (dropSectionId ?? overId)
      )

    if (!overLocation) return

    if (
      !activeLocation ||
      !overSection ||
      activeLocation.section.id === overSection.id
    ) {
      return
    }

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]
    if (!isShellItem(activeItem)) return

    const nextSections = config.sections.map((section) => {
      const entries =
        section.id === activeLocation.section.id
          ? section.entries.filter((entry) => entry.id !== activeId)
          : section.entries

      if (section.id !== overSection.id) return { ...section, entries }

      const insertIndex = entries.findIndex((entry) => entry.id === overId)

      return {
        ...section,
        entries: [
          ...entries.slice(0, insertIndex),
          activeItem,
          ...entries.slice(insertIndex),
        ],
      }
    })

    onConfigChange({ ...config, sections: nextSections })
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!itemIds.has(String(event.active.id))) return

    handleItemDragOver(event)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)

    if (config.sections.some((section) => section.id === event.active.id)) {
      handleSectionDragEnd(event)
      return
    }

    handleItemDragEnd(event)
  }

  const handleDragCancel = () => {
    setActiveDragId(null)
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

  const isDraggingItem = activeDragId ? itemIds.has(activeDragId) : false

  return (
    <>
      <DndContext
        id="custom-shell-sidebar-sections"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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
                isDraggingItem={isDraggingItem}
                isSaving={isSaving}
                onSectionTitleChange={handleSectionTitleChange}
                onSectionDelete={handleSectionDelete}
                onReset={() => onConfigChange(createDefaultShellConfig())}
                onItemAdd={handleAddItem}
                onItemChange={handleItemChange}
                onItemDelete={handleItemDelete}
                onChildAdd={handleChildAdd}
                onChildChange={handleChildChange}
                onChildDelete={handleChildDelete}
                onChildDragEnd={handleChildDragEnd}
                onSaveConfig={onSaveConfig}
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
