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
import { Card, CardContent } from "@/components/ui/card"
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
  createDefaultTopNavigation,
  iconMeta,
  renderShellIcon,
  type IconKey,
  type ShellConfig,
  type ShellTopNavigationItem,
} from "@/lib/custom-shell"

const iconOptions = Object.entries(iconMeta).map(([value, meta]) => ({
  value: value as IconKey,
  label: meta.label,
}))

type TopNavigationSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

type SortableTopNavigationItemProps = {
  item: ShellTopNavigationItem
  onItemChange: (
    itemId: string,
    patch: Partial<ShellTopNavigationItem>
  ) => void
  onItemDelete: (itemId: string) => void
}

function createTopNavigationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `top-nav-${crypto.randomUUID()}`
  }

  return `top-nav-${Date.now()}`
}

function IconPickerButton({
  value,
  onValueChange,
  compact = false,
}: {
  value: IconKey
  onValueChange: (value: IconKey) => void
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const currentLabel = iconMeta[value].label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          className={cn(!compact && "justify-start")}
          aria-label={`Choose icon, current icon ${currentLabel}`}
        >
          {renderShellIcon(value, "h-4 w-4")}
          {!compact ? <span className="truncate">{currentLabel}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="grid grid-cols-5 gap-1.5">
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

function SortableTopNavigationItem({
  item,
  onItemChange,
  onItemDelete,
}: SortableTopNavigationItemProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

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
          aria-label={`Reorder ${item.label || "top navigation link"}`}
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
              onItemChange(item.id, { visible: checked === true })
            }
          />
          <span className="sr-only">
            Show {item.label || "top navigation link"}
          </span>
        </label>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hover:bg-transparent"
          onClick={() => onItemDelete(item.id)}
          aria-label={`Delete ${item.label || "top navigation link"}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{item.label || "Top Navigation Link"}</DialogTitle>
            <DialogDescription>
              Edit this dashboard navigation destination.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            <IconPickerButton
              value={item.icon}
              compact
              onValueChange={(icon) => onItemChange(item.id, { icon })}
            />
            <Input
              value={item.label}
              onChange={(event) =>
                onItemChange(item.id, { label: event.target.value })
              }
              placeholder="Label"
              aria-label="Top navigation label"
            />
            <Input
              value={item.href}
              onChange={(event) =>
                onItemChange(item.id, { href: event.target.value })
              }
              placeholder="/admin/dashboard"
              aria-label="Top navigation URL"
            />
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

export function TopNavigationSettings({
  config,
  onConfigChange,
}: TopNavigationSettingsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleAddItem = () => {
    const item: ShellTopNavigationItem = {
      id: createTopNavigationId(),
      label: "New Dashboard",
      href: "/admin/new-dashboard",
      icon: "layoutDashboard",
      visible: true,
    }

    onConfigChange({
      ...config,
      topNavigation: [...config.topNavigation, item],
    })
  }

  const handleItemChange = (
    itemId: string,
    patch: Partial<ShellTopNavigationItem>
  ) => {
    onConfigChange({
      ...config,
      topNavigation: config.topNavigation.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    })
  }

  const handleItemDelete = (itemId: string) => {
    onConfigChange({
      ...config,
      topNavigation: config.topNavigation.filter((item) => item.id !== itemId),
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = config.topNavigation.findIndex(
      (item) => item.id === active.id
    )
    const newIndex = config.topNavigation.findIndex(
      (item) => item.id === over.id
    )

    if (oldIndex === -1 || newIndex === -1) return

    onConfigChange({
      ...config,
      topNavigation: arrayMove(config.topNavigation, oldIndex, newIndex),
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Top Navigation</h2>
            <p className="text-xs text-muted-foreground">
              Dashboard links shown in the sticky header.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onConfigChange({
                  ...config,
                  topNavigation: createDefaultTopNavigation(),
                })
              }
            >
              <RotateCcwIcon className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
            >
              <PlusIcon className="h-4 w-4" />
              Add Link
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={config.topNavigation.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {config.topNavigation.map((item) => (
                <SortableTopNavigationItem
                  key={item.id}
                  item={item}
                  onItemChange={handleItemChange}
                  onItemDelete={handleItemDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {!config.topNavigation.length ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No top navigation links.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
