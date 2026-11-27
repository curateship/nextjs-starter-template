import * as React from "react"
import { ImageIcon, Loader2Icon, RotateCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import {
  ShapesLayer,
  ThumbnailLayerView,
} from "@/components/video-thumbnails/thumbnail-layer"
import { useThumbnails } from "@/components/video-thumbnails/thumbnail-store"
import { uploadMedia, getMediaErrorMessage } from "@/lib/api/media/media"
import { letterSpacingOf, lineHeightOf } from "@/lib/video/carousel-text"
import { requireTextFont } from "@/lib/video/text-fonts"
import {
  fullPictureLayer,
  THUMBNAIL_LAYER_MAX,
  THUMBNAIL_SIZES,
  topZ,
  type ThumbnailDesign,
  type ThumbnailLayer,
  type ThumbnailText,
} from "@/lib/video/thumbnails"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The Thumbnail board (thumbnails.md): the open thumbnail at the biggest size
 * that fits, its layers picked, dragged and resized by hand. It takes the preview's place
 * while the Thumbnail section is open; the timeline stays, so the playhead
 * still picks the frame "Use this frame" takes.
 */
export function ThumbnailBoard() {
  const { list, loadError, open, design, busy, reload } = useThumbnails()

  if (loadError) {
    return (
      <BoardMessage>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" variant="outline" onClick={reload}>
          <RotateCwIcon />
          Try again
        </Button>
      </BoardMessage>
    )
  }
  if (!list) {
    return (
      <BoardMessage>
        <LoadingRow label="Loading the thumbnails" />
      </BoardMessage>
    )
  }
  if (!open || !design) {
    return (
      <BoardMessage>
        <ImageIcon className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          No thumbnail yet. The + at the top of the Thumbnail panel makes one
          from the frame under the playhead.
        </p>
      </BoardMessage>
    )
  }
  return <OpenBoard design={{ ...design, shape: open.shape }} busy={busy} />
}

/**
 * The open board, as big as fits both across and down, so with the preview
 * strip under it the whole board is still in view. How it looks on YouTube is
 * the Preview button in the editor's top bar (thumbnail-preview-button.tsx).
 */
function OpenBoard({
  design,
  busy,
}: {
  design: ThumbnailDesign
  busy: string | null
}) {
  const areaRef = React.useRef<HTMLDivElement>(null)
  const [roomDown, setRoomDown] = React.useState(0)
  React.useLayoutEffect(() => {
    const node = areaRef.current
    if (!node) return
    const measure = () => setRoomDown(node.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={areaRef} className="flex min-h-0 flex-1 flex-col">
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid gap-4 p-4">
        <Board design={design} maxHeight={Math.max(120, roomDown - 32)} />
        {busy ? (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {busy}
          </p>
        ) : null}
      </div>
    </ScrollArea>
    </div>
  )
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(Math.max(low, -1), value))
}

function BoardMessage({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 p-6">{children}</div>
}

type Box = { x: number; y: number; width: number; height: number }

/**
 * A drag under way: every layer it carries with where each started, and
 * whether the pointer has moved yet. A press on one of several picked layers
 * that never moves narrows the pick to that one, the way design tools do.
 */
type Drag = {
  layerId: string
  mode: "move" | "resize"
  startX: number
  startY: number
  starts: (Box & { id: string })[]
  moved: boolean
}

function Board({ design, maxHeight }: { design: ThumbnailDesign; maxHeight: number }) {
  const { change, selectedLayerIds, selectLayer, toggleLayer, beforeAfter, setBeforeAfter } = useThumbnails()
  const holderRef = React.useRef<HTMLDivElement>(null)
  const boardRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<Drag | null>(null)
  // The words layer being typed into on the board, after a double-click.
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [room, setRoom] = React.useState(0)
  const frame = THUMBNAIL_SIZES[design.shape]

  React.useLayoutEffect(() => {
    const node = holderRef.current
    if (!node) return
    const measure = () => setRoom(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // As big as fits across and down, and never wider than 960.
  const width = Math.max(
    0,
    Math.min(room, 960, (maxHeight * frame.width) / frame.height)
  )
  const scale = width / frame.width
  const sorted = [...design.layers].filter((layer) => !layer.hidden).sort((a, b) => a.zIndex - b.zIndex)

  function moveLayers(patches: Map<string, Partial<ThumbnailLayer>>) {
    change((current) => ({
      ...current,
      layers: current.layers.map((layer) => {
        const patch = patches.get(layer.id)
        return patch ? ({ ...layer, ...patch } as ThumbnailLayer) : layer
      }),
    }))
  }

  function down(event: React.PointerEvent, layer: ThumbnailLayer, mode: Drag["mode"]) {
    if (event.button !== 0) return
    event.stopPropagation()
    // A press inside the words being typed places the cursor, as in any box.
    if (layer.id === editingId) return
    event.preventDefault()
    // Shift-click adds the layer to the pick, or takes it off.
    if (mode === "move" && event.shiftKey) {
      toggleLayer(layer.id)
      return
    }
    // Pressing one of several picked layers drags them all together.
    const group =
      mode === "move" && selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id)
        ? selectedLayerIds
        : [layer.id]
    if (group.length === 1) selectLayer(layer.id)
    const starts = design.layers
      .filter((one) => group.includes(one.id) && !one.locked)
      .map((one) => ({ id: one.id, x: one.x, y: one.y, width: one.width, height: one.height }))
    dragRef.current = {
      layerId: layer.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      starts,
      moved: false,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: React.PointerEvent) {
    const drag = dragRef.current
    const rect = boardRef.current?.getBoundingClientRect()
    if (!drag || !rect?.width || !drag.starts.length) return
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    if (!drag.moved && Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < 3) return
    drag.moved = true
    // Kept to what a save accepts (thumbnailLayerSchema): a layer may hang
    // off the board, but at least a sliver of it stays on.
    const patches = new Map<string, Partial<ThumbnailLayer>>()
    for (const start of drag.starts) {
      patches.set(
        start.id,
        drag.mode === "move"
          ? {
              x: clamp(start.x + dx, 0.02 - start.width, 0.98),
              y: clamp(start.y + dy, 0.02 - start.height, 0.98),
            }
          : {
              width: clamp(start.width + dx, 0.03, 3),
              height: clamp(start.height + dy, 0.03, 3),
            }
      )
    }
    moveLayers(patches)
  }

  function up(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    // A plain click on one of several picked layers picks that one alone.
    if (!drag.moved && selectedLayerIds.length > 1) selectLayer(drag.layerId)
  }

  // Backspace or Delete takes every picked layer off, and Escape lets go of
  // them, wherever the keyboard is, as long as nobody is typing. Clicking a
  // layer never moves the keyboard onto the board, so the board alone
  // listening heard nothing (Tyler, 3 Nov 2026).
  React.useEffect(() => {
    if (!selectedLayerIds.length) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest('[role="dialog"], [role="alertdialog"], [data-slot=popover-content], [data-slot=select-content]'))
      ) {
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        change((current) => ({
          ...current,
          layers: current.layers.filter((layer) => !selectedLayerIds.includes(layer.id)),
        }))
        selectLayer(null)
      } else if (event.key === "Escape") {
        selectLayer(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [change, selectLayer, selectedLayerIds])

  // A press anywhere outside the board lets go of every picked layer (Tyler,
  // 26 Nov 2026: "clicking outside the canvas unselect everything"). The
  // right panel, and the menus and windows that open from it, change the
  // picked layers, so a press there keeps them.
  React.useEffect(() => {
    if (!selectedLayerIds.length) return
    function onDown(event: PointerEvent) {
      const target = event.target as Element | null
      if (!target || boardRef.current?.contains(target)) return
      if (
        target.closest(
          '[data-screen-label="Inspector"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-slot=popover-content], [data-slot=select-content]'
        )
      ) {
        return
      }
      selectLayer(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [selectLayer, selectedLayerIds.length])

  // Pictures dropped on the board go to the library and onto the board.
  async function drop(event: React.DragEvent) {
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"))
    if (!files.length) return
    event.preventDefault()
    if (design.layers.length + files.length > THUMBNAIL_LAYER_MAX) {
      showErrorToast(`A thumbnail holds up to ${THUMBNAIL_LAYER_MAX} layers.`)
      return
    }
    try {
      for (const file of files) {
        const media = await uploadMedia(file)
        change((current) => ({
          ...current,
          layers: [
            ...current.layers,
            { ...fullPictureLayer({ mediaId: media.id, url: media.url, name: media.original_name }, topZ(current.layers)), x: 0.1, y: 0.1, width: 0.5, height: 0.5, fit: "contain" },
          ],
        }))
      }
    } catch (error) {
      showErrorToast(getMediaErrorMessage(error))
    }
  }

  return (
    <div ref={holderRef} className="grid justify-items-center">
      <div
        ref={boardRef}
        role="application"
        aria-label="Thumbnail board"
        tabIndex={0}
        onPointerDown={(event) => {
          if (!event.shiftKey) selectLayer(null)
        }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void drop(event)}
        className="relative touch-none overflow-hidden rounded-sm shadow-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ width, height: frame.height * scale, backgroundColor: design.backgroundColor }}
      >
        {sorted.map((layer) => {
          const picked = selectedLayerIds.includes(layer.id)
          return (
            <div
              key={layer.id}
              data-thumbnail-layer={layer.id}
              onPointerDown={(event) => down(event, layer, "move")}
              onDoubleClick={() => {
                if (layer.type !== "text" || layer.locked) return
                selectLayer(layer.id)
                setEditingId(layer.id)
              }}
              className={cn(
                "absolute",
                layer.id === editingId ? "cursor-text" : layer.locked ? "cursor-default" : "cursor-move",
                picked ? "outline-2 outline-offset-0 outline-sky-400" : "hover:outline-1 hover:outline-white/60"
              )}
              style={{
                left: `${layer.x * 100}%`,
                top: `${layer.y * 100}%`,
                width: `${layer.width * 100}%`,
                height: `${layer.height * 100}%`,
                zIndex: layer.zIndex,
              }}
            >
              <ThumbnailLayerView layer={layer} shape={design.shape} scale={scale} filterKey={`board-${layer.id}`} />
              {layer.id === editingId && layer.type === "text" ? (
                <InlineWords layer={layer} scale={scale} onDone={() => setEditingId(null)} />
              ) : null}
              {beforeAfter?.layerId === layer.id && layer.type === "image" ? (
                <BoardCompare beforeUrl={beforeAfter.beforeUrl} fit={layer.fit} onDone={() => setBeforeAfter(null)} />
              ) : null}
              {picked && selectedLayerIds.length === 1 && !layer.locked && layer.id !== editingId ? (
                <span
                  role="presentation"
                  onPointerDown={(event) => down(event, layer, "resize")}
                  className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500"
                />
              ) : null}
            </div>
          )
        })}
        <ShapesLayer layers={design.layers} shape={design.shape} />
      </div>
    </div>
  )
}

/**
 * Typing straight into a words layer on the board (Tyler, 26 Nov 2026:
 * "double click on the text let me edit the text inline"). A box laid out
 * exactly as the words are, over them, with its own letters see-through and
 * only its cursor and selection showing, so what shows while typing is the
 * layer itself, every look on. Escape or a press anywhere else ends it.
 * Typed words drop their marks, as the right panel's Words box does.
 */
function InlineWords({
  layer,
  scale,
  onDone,
}: {
  layer: ThumbnailText
  scale: number
  onDone: () => void
}) {
  const { change } = useThumbnails()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const font = requireTextFont(layer.fontId)
  React.useEffect(() => {
    const box = ref.current
    if (!box) return
    box.focus()
    box.select()
  }, [])
  return (
    <textarea
      ref={ref}
      aria-label="Words"
      value={layer.text}
      maxLength={2_000}
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const text = event.target.value
        change((current) => ({
          ...current,
          layers: current.layers.map((one) =>
            one.id === layer.id && one.type === "text" ? { ...one, text, marks: undefined } : one
          ),
        }))
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onDone()
        }
      }}
      onBlur={onDone}
      className="absolute inset-0 m-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        fontFamily: font.family,
        fontSize: layer.fontSize * scale,
        fontWeight: font.weight,
        lineHeight: lineHeightOf(layer),
        letterSpacing: `${letterSpacingOf(layer)}em`,
        textAlign: layer.align,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        color: "transparent",
        caretColor: layer.color,
      }}
    />
  )
}

/**
 * The before and after slider on a board picture (picture-clean-up.md): the
 * old picture on the left of the line, the new one on the right.
 */
function BoardCompare({
  beforeUrl,
  fit,
  onDone,
}: {
  beforeUrl: string
  fit: "fill" | "cover" | "contain"
  onDone: () => void
}) {
  const [at, setAt] = React.useState(50)
  const ref = React.useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="absolute inset-0" onPointerDown={(event) => event.stopPropagation()}>
      <img
        src={beforeUrl}
        alt="Before"
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: fit === "contain" ? "contain" : "cover", clipPath: `inset(0 ${100 - at}% 0 0)` }}
      />
      <Slider
        min={0}
        max={100}
        value={[at]}
        aria-label="Before and after"
        onValueChange={([value]) => setAt(value)}
        className="absolute inset-x-2 bottom-10 w-auto"
      />
      <span className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${at}%` }} />
      <Button type="button" size="sm" variant="secondary" className="absolute right-2 bottom-2" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
