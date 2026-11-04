import * as React from "react"
import { ImageIcon, Loader2Icon, RotateCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ShapesLayer,
  ThumbnailLayerView,
} from "@/components/video-thumbnails/thumbnail-layer"
import { useThumbnails } from "@/components/video-thumbnails/thumbnail-store"
import { uploadMedia, getMediaErrorMessage } from "@/lib/api/media/media"
import {
  fullPictureLayer,
  THUMBNAIL_LAYER_MAX,
  THUMBNAIL_SIZES,
  topZ,
  type ThumbnailDesign,
  type ThumbnailLayer,
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
          No thumbnail yet. Press New thumbnail on the left to start from the
          frame under the playhead.
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

type Drag = {
  layerId: string
  mode: "move" | "resize"
  startX: number
  startY: number
  start: { x: number; y: number; width: number; height: number }
}

function Board({ design, maxHeight }: { design: ThumbnailDesign; maxHeight: number }) {
  const { change, selectedLayerId, selectLayer, beforeAfter, setBeforeAfter } = useThumbnails()
  const holderRef = React.useRef<HTMLDivElement>(null)
  const boardRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<Drag | null>(null)
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

  function moveLayer(layerId: string, patch: Partial<ThumbnailLayer>) {
    change((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === layerId ? ({ ...layer, ...patch } as ThumbnailLayer) : layer
      ),
    }))
  }

  function down(event: React.PointerEvent, layer: ThumbnailLayer, mode: Drag["mode"]) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    selectLayer(layer.id)
    if (layer.locked) return
    dragRef.current = {
      layerId: layer.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      start: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: React.PointerEvent) {
    const drag = dragRef.current
    const rect = boardRef.current?.getBoundingClientRect()
    if (!drag || !rect?.width) return
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    // Kept to what a save accepts (thumbnailLayerSchema): a layer may hang
    // off the board, but at least a sliver of it stays on.
    if (drag.mode === "move") {
      moveLayer(drag.layerId, {
        x: clamp(drag.start.x + dx, 0.02 - drag.start.width, 0.98),
        y: clamp(drag.start.y + dy, 0.02 - drag.start.height, 0.98),
      })
    } else {
      moveLayer(drag.layerId, {
        width: clamp(drag.start.width + dx, 0.03, 3),
        height: clamp(drag.start.height + dy, 0.03, 3),
      })
    }
  }

  function up(event: React.PointerEvent) {
    if (!dragRef.current) return
    dragRef.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }

  // Backspace or Delete takes the picked layer off, and Escape lets go of
  // it, wherever the keyboard is, as long as nobody is typing. Clicking a
  // layer never moves the keyboard onto the board, so the board alone
  // listening heard nothing (Tyler, 3 Nov 2026).
  React.useEffect(() => {
    if (!selectedLayerId) return
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
          layers: current.layers.filter((layer) => layer.id !== selectedLayerId),
        }))
        selectLayer(null)
      } else if (event.key === "Escape") {
        selectLayer(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [change, selectLayer, selectedLayerId])

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
        onPointerDown={() => selectLayer(null)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void drop(event)}
        className="relative touch-none overflow-hidden rounded-sm shadow-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ width, height: frame.height * scale, backgroundColor: design.backgroundColor }}
      >
        {sorted.map((layer) => {
          const picked = layer.id === selectedLayerId
          return (
            <div
              key={layer.id}
              data-thumbnail-layer={layer.id}
              onPointerDown={(event) => down(event, layer, "move")}
              className={cn(
                "absolute",
                layer.locked ? "cursor-default" : "cursor-move",
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
              {beforeAfter?.layerId === layer.id && layer.type === "image" ? (
                <BoardCompare beforeUrl={beforeAfter.beforeUrl} fit={layer.fit} onDone={() => setBeforeAfter(null)} />
              ) : null}
              {picked && !layer.locked ? (
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
      <input
        type="range"
        min={0}
        max={100}
        value={at}
        aria-label="Before and after"
        onChange={(event) => setAt(Number(event.target.value))}
        className="absolute inset-x-2 bottom-10"
      />
      <span className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${at}%` }} />
      <Button type="button" size="sm" variant="secondary" className="absolute right-2 bottom-2" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
