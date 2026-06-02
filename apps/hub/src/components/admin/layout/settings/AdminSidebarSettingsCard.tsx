"use client"

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
  useDroppable
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { ShellIconPickerField, ShellIconPreview } from "@/components/admin/layout/settings/ShellIconPicker"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/tailwind"
import {
  createDefaultAdminSidebarSettings,
  type AdminSidebarChildItem,
  type AdminSidebarItem,
  type AdminSidebarSection,
  type AdminSidebarSettings
} from "@/lib/utils/admin-sidebar"

type AdminSidebarSettingsCardProps = {
  config: AdminSidebarSettings
  siteId: string
  onConfigChange: (config: AdminSidebarSettings) => void
  onSave?: () => Promise<boolean>
}

type SortableItemProps = {
  sectionId: string
  item: AdminSidebarItem
  siteId: string
  onItemChange: (sectionId: string, itemId: string, patch: Partial<AdminSidebarItem>) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (sectionId: string, itemId: string, childId: string, patch: Partial<AdminSidebarChildItem>) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (sectionId: string, itemId: string, event: DragEndEvent) => void
  onSave?: () => Promise<boolean>
}

type SortableChildProps = {
  child: AdminSidebarChildItem
  siteId: string
  onChange: (childId: string, patch: Partial<AdminSidebarChildItem>) => void
  onDelete: (childId: string) => void
}

type SortableSectionProps = {
  section: AdminSidebarSection
  siteId: string
  isDraggingItem: boolean
  onSectionTitleChange: (sectionId: string, title: string) => void
  onReset: () => void
  onItemAdd: (sectionId: string) => void
  onItemChange: (sectionId: string, itemId: string, patch: Partial<AdminSidebarItem>) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (sectionId: string, itemId: string, childId: string, patch: Partial<AdminSidebarChildItem>) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (sectionId: string, itemId: string, event: DragEndEvent) => void
  onSave?: () => Promise<boolean>
}

const sectionDropPrefix = "section-drop:"

function getSectionDropId(sectionId: string) {
  return `${sectionDropPrefix}${sectionId}`
}

function getSectionIdFromDropId(id: string) {
  return id.startsWith(sectionDropPrefix) ? id.slice(sectionDropPrefix.length) : null
}

function createSidebarId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}`
}

function updateSection(
  config: AdminSidebarSettings,
  sectionId: string,
  update: (section: AdminSidebarSection) => AdminSidebarSection
) {
  return {
    ...config,
    sections: config.sections.map((section) => (section.id === sectionId ? update(section) : section))
  }
}

function SortableChild({ child, siteId, onChange, onDelete }: SortableChildProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1
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
      <ShellIconPickerField
        siteId={siteId}
        value={child.icon}
        onChange={(icon) => onChange(child.id, { icon })}
        compact
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
  siteId,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSave
}: SortableItemProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [savingDialog, setSavingDialog] = React.useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1
  }

  const children = item.children ?? []

  const handleSaveAndClose = async () => {
    if (!onSave) {
      setDialogOpen(false)
      return
    }

    setSavingDialog(true)
    const saved = await onSave()
    setSavingDialog(false)
    if (saved) setDialogOpen(false)
  }

  return (
    <div ref={setNodeRef} style={style} className="group rounded-lg bg-background transition-colors hover:bg-muted/40">
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
            <ShellIconPreview icon={item.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.label || "Untitled link"}</span>
          </span>
          {children.length ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              {children.length} child{children.length === 1 ? "" : "ren"}
            </span>
          ) : null}
          {!item.visible ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Hidden</span>
          ) : null}
        </button>

        <label
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          title={item.visible ? "Visible" : "Hidden"}
        >
          <Checkbox
            checked={item.visible}
            onCheckedChange={(checked) => onItemChange(sectionId, item.id, { visible: checked === true })}
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
            <DialogDescription>Edit this sidebar destination and its child links.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <ShellIconPickerField
                siteId={siteId}
                value={item.icon}
                onChange={(icon) => (icon ? onItemChange(sectionId, item.id, { icon }) : undefined)}
                compact
                allowEmpty={false}
              />
              <Input
                value={item.label}
                onChange={(event) =>
                  onItemChange(sectionId, item.id, {
                    label: event.target.value
                  })
                }
                placeholder="Label"
                aria-label="Sidebar link label"
              />
              <Input
                value={item.href}
                onChange={(event) => onItemChange(sectionId, item.id, { href: event.target.value })}
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
                <Button type="button" variant="outline" size="sm" onClick={() => onChildAdd(sectionId, item.id)}>
                  <PlusIcon className="h-4 w-4" />
                  Add Child
                </Button>
              </div>

              {children.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => onChildDragEnd(sectionId, item.id, event)}
                >
                  <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {children.map((child) => (
                        <SortableChild
                          key={child.id}
                          child={child}
                          siteId={siteId}
                          onChange={(childId, patch) => onChildChange(sectionId, item.id, childId, patch)}
                          onDelete={(childId) => onChildDelete(sectionId, item.id, childId)}
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
            <Button type="button" onClick={handleSaveAndClose} disabled={savingDialog}>
              {savingDialog ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableSectionCard({
  section,
  siteId,
  isDraggingItem,
  onSectionTitleChange,
  onReset,
  onItemAdd,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSave
}: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: getSectionDropId(section.id),
    disabled: !isDraggingItem
  })
  const sortableItemIds = section.entries.map((entry) => entry.id)
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1
  }

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent>
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
              onChange={(event) => onSectionTitleChange(section.id, event.target.value)}
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
            <Button type="button" variant="outline" size="sm" onClick={() => onItemAdd(section.id)}>
              <PlusIcon className="h-4 w-4" />
              Add Link
            </Button>
          </div>
        </div>

        <SortableContext items={sortableItemIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setDropNodeRef}
            className={cn("-m-1 min-h-11 rounded-lg p-1 transition-colors", isOver && "bg-primary/5")}
          >
            {section.entries.map((entry) => (
              <SortableSidebarItem
                key={entry.id}
                sectionId={section.id}
                item={entry}
                siteId={siteId}
                onItemChange={onItemChange}
                onItemDelete={onItemDelete}
                onChildAdd={onChildAdd}
                onChildChange={onChildChange}
                onChildDelete={onChildDelete}
                onChildDragEnd={onChildDragEnd}
                onSave={onSave}
              />
            ))}
            {!sortableItemIds.length ? (
              <div className={cn("rounded-lg border border-dashed p-4 text-center text-sm", "text-muted-foreground")}>
                No sidebar links in this section.
              </div>
            ) : null}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export function AdminSidebarSettingsCard({ config, siteId, onConfigChange, onSave }: AdminSidebarSettingsCardProps) {
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  const sectionIds = React.useMemo(
    () => new Set(config.sections.map((section) => section.id)),
    [config.sections]
  )
  const emptySectionIds = React.useMemo(
    () => new Set(config.sections.filter((section) => !section.entries.length).map((section) => section.id)),
    [config.sections]
  )
  const itemIds = React.useMemo(
    () => new Set(config.sections.flatMap((section) => section.entries.map((entry) => entry.id))),
    [config.sections]
  )
  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      if (sectionIds.has(String(args.active.id))) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) => sectionIds.has(String(container.id)))
        })
      }

      const pointerCollisions = pointerWithin(args)
      const itemCollisions = pointerCollisions.filter((collision) => itemIds.has(String(collision.id)))

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
        })
      })
      const centerItemCollisions = centerCollisions.filter((collision) => itemIds.has(String(collision.id)))

      return centerItemCollisions.length ? centerItemCollisions : centerCollisions
    },
    [emptySectionIds, itemIds, sectionIds]
  )

  const handleAddItem = (sectionId: string) => {
    const item: AdminSidebarItem = {
      type: "item",
      id: createSidebarId("item"),
      label: "New Link",
      href: "/admin/new-link",
      icon: "grid",
      visible: true
    }

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: [...section.entries, item]
      }))
    )
  }

  const handleAddSection = () => {
    onConfigChange({
      ...config,
      sections: [
        ...config.sections,
        {
          id: createSidebarId("section"),
          title: "New Section",
          entries: []
        }
      ]
    })
  }

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        title
      }))
    )
  }

  const handleItemChange = (sectionId: string, itemId: string, patch: Partial<AdminSidebarItem>) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) => (entry.id === itemId ? { ...entry, ...patch } : entry))
      }))
    )
  }

  const handleItemDelete = (sectionId: string, itemId: string) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.filter((entry) => entry.id !== itemId)
      }))
    )
  }

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = config.sections.findIndex((section) => section.id === active.id)
    const newIndex = config.sections.findIndex((section) => section.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    onConfigChange({
      ...config,
      sections: arrayMove(config.sections, oldIndex, newIndex)
    })
  }

  const findItemLocation = (itemId: string) => {
    for (const section of config.sections) {
      const itemIndex = section.entries.findIndex((entry) => entry.id === itemId)

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
      overLocation?.section ?? config.sections.find((section) => section.id === (dropSectionId ?? overId))

    if (!activeLocation || !overSection) return

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]

    if (activeLocation.section.id === overSection.id && overLocation) {
      onConfigChange(
        updateSection(config, activeLocation.section.id, (section) => ({
          ...section,
          entries: arrayMove(section.entries, activeLocation.itemIndex, overLocation.itemIndex)
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

      const insertIndex = overLocation ? entries.findIndex((entry) => entry.id === overId) : entries.length

      return {
        ...section,
        entries: [...entries.slice(0, insertIndex), activeItem, ...entries.slice(insertIndex)]
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
      overLocation?.section ?? config.sections.find((section) => section.id === (dropSectionId ?? overId))

    if (!overLocation) return

    if (!activeLocation || !overSection || activeLocation.section.id === overSection.id) {
      return
    }

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]

    const nextSections = config.sections.map((section) => {
      const entries =
        section.id === activeLocation.section.id
          ? section.entries.filter((entry) => entry.id !== activeId)
          : section.entries

      if (section.id !== overSection.id) return { ...section, entries }

      const insertIndex = entries.findIndex((entry) => entry.id === overId)

      return {
        ...section,
        entries: [...entries.slice(0, insertIndex), activeItem, ...entries.slice(insertIndex)]
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
    const child: AdminSidebarChildItem = {
      id: createSidebarId("child"),
      label: "New Child",
      href: "/admin/new-child"
    }

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.id === itemId ? { ...entry, children: [...(entry.children ?? []), child] } : entry
        )
      }))
    )
  }

  const handleChildChange = (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<AdminSidebarChildItem>
  ) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).map((child) => (child.id === childId ? { ...child, ...patch } : child))
              }
            : entry
        )
      }))
    )
  }

  const handleChildDelete = (sectionId: string, itemId: string, childId: string) => {
    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).filter((child) => child.id !== childId)
              }
            : entry
        )
      }))
    )
  }

  const handleChildDragEnd = (sectionId: string, itemId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    onConfigChange(
      updateSection(config, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id !== itemId) return entry

          const children = entry.children ?? []
          const oldIndex = children.findIndex((child) => child.id === active.id)
          const newIndex = children.findIndex((child) => child.id === over.id)

          if (oldIndex === -1 || newIndex === -1) return entry

          return {
            ...entry,
            children: arrayMove(children, oldIndex, newIndex)
          }
        })
      }))
    )
  }

  const isDraggingItem = activeDragId ? itemIds.has(activeDragId) : false

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={config.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
          <CardGroup className="grid">
            {config.sections.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                siteId={siteId}
                isDraggingItem={isDraggingItem}
                onSectionTitleChange={handleSectionTitleChange}
                onReset={() => onConfigChange(createDefaultAdminSidebarSettings(siteId))}
                onItemAdd={handleAddItem}
                onItemChange={handleItemChange}
                onItemDelete={handleItemDelete}
                onChildAdd={handleChildAdd}
                onChildChange={handleChildChange}
                onChildDelete={handleChildDelete}
                onChildDragEnd={handleChildDragEnd}
                onSave={onSave}
              />
            ))}
          </CardGroup>
        </SortableContext>
      </DndContext>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" onClick={handleAddSection}>
          <PlusIcon className="h-4 w-4" />
          Add Section
        </Button>
      </div>
    </>
  )
}
