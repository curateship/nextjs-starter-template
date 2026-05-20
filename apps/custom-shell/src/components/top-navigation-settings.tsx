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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  BellIcon,
  CheckIcon,
  GripVertical,
  ImageIcon,
  MessageSquarePlusIcon,
  PlusIcon,
  RotateCcwIcon,
  SunIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { AdminModalContent } from "@/pages/shared/admin-modal"
import { cn } from "@/lib/utils"
import {
  createDefaultTopRightNavigation,
  iconMeta,
  normalizeTopRightNavigation,
  renderShellIcon,
  type IconKey,
  type ShellConfig,
  type ShellTopRightNavigationItem,
  type ShellTopRightNavigationItemId,
  type ShellTopNavigationItem,
} from "@/lib/custom-shell"

const iconOptions = Object.entries(iconMeta).map(([value, meta]) => ({
  value: value as IconKey,
  label: meta.label,
}))

type TopNavigationSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}

type SortableTopNavigationItemProps = {
  item: ShellTopNavigationItem
  isSaving: boolean
  onItemChange: (
    itemId: string,
    patch: Partial<ShellTopNavigationItem>
  ) => void
  onItemDelete: (itemId: string) => void
  onSaveConfig: () => Promise<boolean>
}

type SortableTopRightNavigationItemProps = {
  item: ShellTopRightNavigationItem
  onItemChange: (
    itemId: ShellTopRightNavigationItemId,
    patch: Partial<ShellTopRightNavigationItem>
  ) => void
}

const topRightNavigationMeta: Record<
  ShellTopRightNavigationItemId,
  { label: string; icon: LucideIcon }
> = {
  feedback: {
    label: "Feedback",
    icon: MessageSquarePlusIcon,
  },
  theme: {
    label: "Theme Switcher",
    icon: SunIcon,
  },
  notifications: {
    label: "Bell Notification",
    icon: BellIcon,
  },
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
  value?: IconKey
  onValueChange: (value: IconKey | undefined) => void
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const currentLabel = value ? iconMeta[value].label : "No icon"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          className={cn(
            !compact && "justify-start",
            !value &&
              "border-dotted border-muted-foreground/30 bg-muted/40 text-muted-foreground/50 hover:bg-muted/60"
          )}
          aria-label={`Choose icon, current icon ${currentLabel}`}
        >
          {value ? (
            renderShellIcon(value, "h-4 w-4")
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {!compact ? <span className="truncate">{currentLabel}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="grid grid-cols-5 gap-1.5">
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
  isSaving,
  onItemChange,
  onItemDelete,
  onSaveConfig,
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
      className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"
    >
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${item.label || "top navigation link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-[240px] justify-start gap-2 px-3 text-sm font-medium"
          onClick={() => setDialogOpen(true)}
          aria-label={`Edit settings for ${item.label || "top navigation link"}`}
        >
          {item.icon ? (
            renderShellIcon(item.icon, "h-4 w-4 shrink-0")
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          )}
          <span className="truncate">{item.label || "Untitled link"}</span>
          {!item.visible ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </Button>

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
          className="hover:bg-red-50"
          onClick={() => onItemDelete(item.id)}
          aria-label={`Delete ${item.label || "top navigation link"}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminModalContent
          title={item.label || "Top Navigation Link"}
          description="Edit this dashboard navigation destination."
          bodyClassName="space-y-4"
          footer={
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
          }
        >
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
        </AdminModalContent>
      </Dialog>
    </div>
  )
}

function SortableTopRightNavigationItem({
  item,
  onItemChange,
}: SortableTopRightNavigationItemProps) {
  const meta = topRightNavigationMeta[item.id]
  const Icon = meta.icon
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
      className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"
    >
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${meta.label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex h-9 max-w-[240px] items-center gap-2 px-3 text-sm font-medium">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{meta.label}</span>
          {!item.visible ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </div>
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
          <span className="sr-only">Show {meta.label}</span>
        </label>
      </div>
    </div>
  )
}

export function TopNavigationSettings({
  config,
  isSaving,
  onConfigChange,
  onSaveConfig,
}: TopNavigationSettingsProps) {
  const topRightNavigation = normalizeTopRightNavigation(
    config.topRightNavigation
  )
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

  const handleTopRightItemChange = (
    itemId: ShellTopRightNavigationItemId,
    patch: Partial<ShellTopRightNavigationItem>
  ) => {
    onConfigChange({
      ...config,
      topRightNavigation: topRightNavigation.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    })
  }

  const handleTopRightDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = topRightNavigation.findIndex(
      (item) => item.id === active.id
    )
    const newIndex = topRightNavigation.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    onConfigChange({
      ...config,
      topRightNavigation: arrayMove(topRightNavigation, oldIndex, newIndex),
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Top Left Navigation</h2>
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
                    topNavigation: [],
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
            id="custom-shell-top-navigation"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={config.topNavigation.map((item) => item.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-wrap items-center gap-2">
                {config.topNavigation.map((item) => (
                  <SortableTopNavigationItem
                    key={item.id}
                    item={item}
                    isSaving={isSaving}
                    onItemChange={handleItemChange}
                    onItemDelete={handleItemDelete}
                    onSaveConfig={onSaveConfig}
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

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Top Right Navigation</h2>
              <p className="text-xs text-muted-foreground">
                Feedback, theme, and notification controls shown in the sticky
                header.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onConfigChange({
                  ...config,
                  topRightNavigation: createDefaultTopRightNavigation(),
                })
              }
            >
              <RotateCcwIcon className="h-4 w-4" />
              Reset
            </Button>
          </div>

          <DndContext
            id="custom-shell-top-right-navigation"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTopRightDragEnd}
          >
            <SortableContext
              items={topRightNavigation.map((item) => item.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex flex-wrap items-center gap-2">
                {topRightNavigation.map((item) => (
                  <SortableTopRightNavigationItem
                    key={item.id}
                    item={item}
                    onItemChange={handleTopRightItemChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  )
}
