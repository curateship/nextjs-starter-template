import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  GripVertical,
  MoonIcon,
  SearchIcon,
  UserRoundIcon,
  type LucideIcon,
  ChevronRightIcon,
} from "lucide-react"

import {
  DRAG_GRIP_CLASS,
  reorderByDrag,
  useNavSensors,
  useSortableChip,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import {
  PUBLIC_HEADER_ACTION_HINTS,
  PUBLIC_HEADER_ACTION_LABELS,
  type PublicHeaderAction,
  type PublicHeaderActionId,
} from "@/lib/pages/public-header-actions"

const CHIP_CLASS =
  "w-fit max-w-full rounded-xl border border-zinc-200/40 bg-background py-1.5 pr-1.5 pl-1 transition-colors hover:border-zinc-300/40 dark:border-zinc-700/40"

const ACTION_ICONS: Record<PublicHeaderActionId, LucideIcon> = {
  search: SearchIcon,
  theme: MoonIcon,
  "user-panel": UserRoundIcon,
}

/**
 * The controls at the right-hand end of the public header, dragged into the
 * order they are drawn in.
 *
 * The same row the directory app calls Action Items. Nothing here is added or
 * deleted: the three are what the header has, so a chip switches one off
 * rather than removing it, and the account corner cannot be switched off at
 * all because it is how somebody signs in.
 */
export function PublicHeaderActionsEditor({
  actions,
  onActionsChange,
  onEditUserPanel,
}: {
  actions: PublicHeaderAction[]
  onActionsChange: (actions: PublicHeaderAction[]) => void
  /** The account corner's own settings, opened from its chip. */
  onEditUserPanel: () => void
}) {
  const sensors = useNavSensors()
  const ids = actions.map((action) => `public-header-action-${action.id}`)

  const handleDragEnd = (event: DragEndEvent) => {
    const moved = reorderByDrag(actions, ids, event)
    if (moved) onActionsChange(moved)
  }

  return (
    <DndContext
      id="custom-shell-public-header-actions"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action, index) => (
            <ActionChip
              key={ids[index]}
              id={ids[index]}
              action={action}
              onEdit={action.id === "user-panel" ? onEditUserPanel : undefined}
              onVisibleChange={(visible) =>
                onActionsChange(
                  actions.map((item, at) =>
                    at === index ? { ...item, hidden: !visible } : item
                  )
                )
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function ActionChip({
  id,
  action,
  onEdit,
  onVisibleChange,
}: {
  id: string
  action: PublicHeaderAction
  /** Given when the chip has settings of its own behind it. */
  onEdit?: () => void
  onVisibleChange: (visible: boolean) => void
}) {
  const label = PUBLIC_HEADER_ACTION_LABELS[action.id]
  const Icon = ACTION_ICONS[action.id]
  const canHide = action.id !== "user-panel"
  const chip = useSortableChip(id, label)

  return (
    <div {...chip} className={cn(CHIP_CLASS, chip.className)}>
      <div className="flex max-w-full items-center gap-1">
        <span className={DRAG_GRIP_CLASS} aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
        {onEdit ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 max-w-56 justify-start gap-2 px-3 text-sm font-medium"
            onClick={onEdit}
            aria-label={`Edit settings for ${label}`}
            title={PUBLIC_HEADER_ACTION_HINTS[action.id]}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
            {/* It opens settings of its own, so it says it leads on. */}
            <ChevronRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
          </Button>
        ) : (
          <span
            className="flex h-8 max-w-56 items-center gap-2 px-3 text-sm font-medium"
            title={PUBLIC_HEADER_ACTION_HINTS[action.id]}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
            {action.hidden ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Hidden
              </span>
            ) : null}
          </span>
        )}
        {canHide ? (
          <Switch
            className="mx-1.5 shrink-0"
            checked={!action.hidden}
            onCheckedChange={onVisibleChange}
            aria-label={`Show ${label}`}
          />
        ) : null}
      </div>
    </div>
  )
}
