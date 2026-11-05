import * as React from "react"
import { SettingsIcon, Trash2Icon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { clockText } from "@/lib/video/export-stretch"
import { MARKER_NAME_MAX, type TimelineMarker } from "@/lib/video/timeline-markers"
import { msToPx, pxToMs } from "@/lib/video/timeline-utils"

/**
 * The pins along the bottom of the ruler (timeline-markers.md). A press on a
 * pin belongs to the pin, never to scrubbing: dragging moves it, a double
 * click names it, and a right click renames or deletes it. The drag is drawn
 * here and saved once on release, so one Undo puts it back.
 */
export function TimelineMarkerPins({
  pps,
  readOnly,
}: {
  pps: number
  readOnly: boolean
}) {
  const markers = useEditorSelector((state) => state.markers)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  return (
    <>
      {markers.map((marker) => (
        <MarkerPin
          key={marker.id}
          marker={marker}
          pps={pps}
          readOnly={readOnly}
          renaming={renamingId === marker.id}
          onRenamingChange={(open) => setRenamingId(open ? marker.id : null)}
        />
      ))}
    </>
  )
}

function MarkerPin({
  marker,
  pps,
  readOnly,
  renaming,
  onRenamingChange,
}: {
  marker: TimelineMarker
  pps: number
  readOnly: boolean
  renaming: boolean
  onRenamingChange: (open: boolean) => void
}) {
  const { dispatch } = useEditorRuntime()
  const drag = React.useRef<{ pointerId: number; startX: number } | null>(null)
  const [dragMs, setDragMs] = React.useState<number | null>(null)
  const atMs = dragMs ?? marker.atMs
  const label = marker.name || clockText(marker.atMs)

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.stopPropagation()
    if (readOnly) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const moved = pxToMs(event.clientX - active.startX, pps)
    setDragMs(Math.max(0, Math.round(marker.atMs + moved)))
  }
  function onPointerUp(event: React.PointerEvent) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    drag.current = null
    if (dragMs !== null && dragMs !== marker.atMs) {
      dispatch({ type: "UPDATE_MARKER", markerId: marker.id, patch: { atMs: dragMs } })
    }
    setDragMs(null)
  }

  return (
    <Popover open={renaming} onOpenChange={onRenamingChange}>
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger asChild disabled={readOnly}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-timeline-marker={marker.id}
              aria-label={`Marker ${label} at ${clockText(marker.atMs)}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                drag.current = null
                setDragMs(null)
              }}
              // A single click selects nothing and opens nothing. Only a
              // double click opens the name box.
              onClick={(event) => event.preventDefault()}
              onDoubleClick={() => !readOnly && onRenamingChange(true)}
              className="absolute bottom-0 flex h-3.5 max-w-32 items-center gap-1 pr-1 text-[9.5px] leading-none text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              style={{
                left: msToPx(atMs, pps),
                cursor: readOnly ? "default" : "ew-resize",
                zIndex: 3,
              }}
            >
              <span aria-hidden className="h-full w-0.5 shrink-0 bg-primary" />
              <span className="truncate">{marker.name}</span>
            </button>
          </PopoverTrigger>
        </ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.Content
            className={CONTEXT_MENU_CONTENT_CLASS}
            // The ruler under the menu would take the press for scrubbing.
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_ITEM_CLASS}
              onSelect={() => onRenamingChange(true)}
            >
              <SettingsIcon />
              Rename
            </ContextMenuPrimitive.Item>
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS}
              onSelect={() => dispatch({ type: "REMOVE_MARKER", markerId: marker.id })}
            >
              <Trash2Icon />
              Delete
            </ContextMenuPrimitive.Item>
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Root>
      <PopoverContent
        align="start"
        className="w-64"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {renaming ? (
          <MarkerNameForm
            marker={marker}
            onDone={() => onRenamingChange(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function MarkerNameForm({
  marker,
  onDone,
}: {
  marker: TimelineMarker
  onDone: () => void
}) {
  const { dispatch } = useEditorRuntime()
  const [name, setName] = React.useState(marker.name)
  const id = `marker-name-${marker.id}`
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() !== marker.name) {
          dispatch({
            type: "UPDATE_MARKER",
            markerId: marker.id,
            patch: { name },
          })
        }
        onDone()
      }}
    >
      <Label htmlFor={id}>Marker name at {clockText(marker.atMs)}</Label>
      <Input
        id={id}
        autoFocus
        value={name}
        maxLength={MARKER_NAME_MAX}
        placeholder="Intro"
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
}
