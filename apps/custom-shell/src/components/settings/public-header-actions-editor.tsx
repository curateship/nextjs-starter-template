import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  GripVertical,
  MoonIcon,
  SearchIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  PUBLIC_HEADER_ACTION_HINTS,
  PUBLIC_HEADER_ACTION_LABELS,
  type PublicHeaderAction,
  type PublicHeaderActionId,
} from "@/lib/pages/public-header-actions"

const CHIP_CLASS =
  "w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"

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
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onActionsChange(arrayMove(actions, from, to))
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
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)
  const label = PUBLIC_HEADER_ACTION_LABELS[action.id]
  const Icon = ACTION_ICONS[action.id]
  const canHide = action.id !== "user-panel"

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
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
          <label
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            title={action.hidden ? "Hidden" : "Visible"}
          >
            <Checkbox
              checked={!action.hidden}
              onCheckedChange={(checked) => onVisibleChange(checked === true)}
            />
            <span className="sr-only">{`Show ${label}`}</span>
          </label>
        ) : null}
      </div>
    </div>
  )
}
