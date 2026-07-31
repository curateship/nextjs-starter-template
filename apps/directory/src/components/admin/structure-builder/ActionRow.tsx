"use client"

import type { CSSProperties, ReactNode } from "react"
import { useSortableRow } from "@/components/admin/layout/builder/use-sortable-row"
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/tailwind"

const ACTION_BUTTON_CLASS = "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

export interface ActionRowProps {
  /** Accessible name used in the edit/delete/reorder aria-labels. */
  ariaName: string
  /** Tooltip for the edit button. */
  title: string
  /** Extra classes for the edit button (width cap, icon gap). */
  buttonClassName?: string
  onEdit: () => void
  onDelete: () => void
  children: ReactNode
  handle?: ReactNode
  containerRef?: (node: HTMLElement | null) => void
  containerStyle?: CSSProperties
}

/** Draggable-list row with grip handle, labelled edit button, and delete button. */
export function ActionRow({
  ariaName,
  title,
  buttonClassName,
  onEdit,
  onDelete,
  children,
  handle,
  containerRef,
  containerStyle,
}: ActionRowProps) {
  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"
    >
      <div className="flex max-w-full flex-wrap items-center gap-1">
        {handle ?? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onEdit}
          className={cn("h-9 justify-start px-3 text-sm font-medium", buttonClassName)}
          aria-label={`Edit settings for ${ariaName}`}
          title={title}
        >
          {children}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-destructive/10 hover:text-destructive")}
          aria-label={`Delete ${ariaName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function SortableActionRow({
  sortableId,
  ...rowProps
}: ActionRowProps & { sortableId: string }) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useSortableRow(sortableId)
  return (
    <ActionRow
      {...rowProps}
      containerRef={setNodeRef}
      containerStyle={style}
      handle={
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${rowProps.ariaName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      }
    />
  )
}
