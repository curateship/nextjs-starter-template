import * as React from "react"
import {
  FilmIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Type,
  Upload,
} from "lucide-react"

import { uploadMedia } from "@/lib/api/media/media"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { AiPanel } from "@/components/video-editor/studio-ai-panel"
import { TranscriptPanel } from "@/components/video-editor/studio-transcript-panel"
import {
  getVideoMediaErrorMessage,
  listMediaCollections,
  listVideoMedia,
  type MediaCollectionSummary,
  type VideoMediaItem,
} from "@/lib/api/video/media"
import { loadBrandKit, type VideoBrandKit } from "@/lib/api/video/settings"
import { showErrorToast } from "@/lib/toast/error-toast"
import { type TextFontId } from "@/lib/video/text-fonts"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  pxToMs,
} from "@/lib/video/timeline-utils"
import { BrandKitDialog } from "@/components/video-editor/brand-kit-dialog"
import { buildMediaClip } from "@/components/video-editor/media-clip"
import {
  findClip,
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"

/**
 * The panel beside the tool rail. Which one is showing is the rail's business;
 * everything each of them needs is loaded here.
 */

export type StudioPanel = "media" | "text" | "brand" | "ai" | "transcript"

const PANEL_TITLE: Record<StudioPanel, string> = {
  media: "Media",
  text: "Text",
  brand: "Brand kit",
  ai: "AI",
  transcript: "Transcript",
}

export function StudioContextPanel({ panel }: { panel: StudioPanel }) {
  // Media has search and upload buttons to put in its header, so it draws its
  // own; the other two only need a title.
  if (panel === "media") return <MediaPanel />
  // The AI panel draws its own header too, so its tools can say what they need.
  if (panel === "ai") return <AiPanel />
  if (panel === "transcript") return <TranscriptPanel />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={panel === "text" ? <Type className="size-4" /> : <LayoutGrid className="size-4" />}
        title={PANEL_TITLE[panel]}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {panel === "text" ? <TextPanel /> : <BrandPanel />}
        </div>
      </ScrollArea>
    </div>
  )
}

function Label({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="st-lbl" style={{ marginBottom: 10, ...style }}>
      {children}
    </div>
  )
}

// --------------------------------------------------------------- Media ------

// Only the kinds the library actually holds. Sound arrives with the voiceover
// work, which is also what makes the shell's library accept audio files.
const MEDIA_FILTERS: { id: "all" | "video" | "image"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
]

function MediaPanel() {
  const { dispatch, clock, store } = useEditorRuntime()
  const [filter, setFilter] = React.useState<"all" | "video" | "image">("all")
  // "all" = every file, "uncollected" = the ones in no collection, anything
  // else is a collection's id.
  const [collectionFilter, setCollectionFilter] = React.useState("all")
  const [collections, setCollections] = React.useState<
    MediaCollectionSummary[]
  >([])
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [items, setItems] = React.useState<VideoMediaItem[]>([])
  const [refresh, setRefresh] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  // Collections are made and named in the media library, so this loads once.
  // A failure here must not take the grid down with it — the panel simply
  // shows no collection chips.
  React.useEffect(() => {
    let active = true
    listMediaCollections()
      .then((loaded) => {
        if (active) setCollections(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    let active = true
    listVideoMedia({
      pageSize: 30,
      collectionId:
        collectionFilter === "all"
          ? undefined
          : collectionFilter === "uncollected"
            ? null
            : collectionFilter,
      fileType: filter === "all" ? undefined : filter,
      search: debounced || undefined,
    })
      .then((data) => {
        if (active) setItems(data.media)
      })
      .catch((error) => {
        if (active) showErrorToast(getVideoMediaErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [collectionFilter, filter, debounced, refresh])

  async function addItem(item: VideoMediaItem, atMs: number, trackId?: string) {
    try {
      const clip = await buildMediaClip(item)
      dispatch({ type: "ADD_CLIP", clip, atMs, trackId })
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(file)
      }
      setRefresh((count) => count + 1)
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  // --- Dragging a file onto a lane ----------------------------------------
  // A short press adds the clip at the playhead; a drag drops it where it is
  // let go. The lane under the pointer is found by asking the page what is
  // there, which keeps the panel and the timeline from having to know about
  // each other.
  const [ghost, setGhost] = React.useState<{
    item: VideoMediaItem
    x: number
    y: number
  } | null>(null)
  const dragRef = React.useRef<{
    item: VideoMediaItem
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  function tileDown(event: React.PointerEvent, item: VideoMediaItem) {
    if (event.button !== 0) return
    dragRef.current = {
      item,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function tileMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
    ) {
      return
    }
    drag.moved = true
    setGhost({ item: drag.item, x: event.clientX, y: event.clientY })
  }

  function tileUp(event: React.PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setGhost(null)
    if (!drag) return
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* noop */
    }
    if (!drag.moved) {
      void addItem(drag.item, clock.getTime())
      return
    }
    // The pointer is captured by the tile, so the lane has to be looked up.
    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element.matches("[data-track-lane]"))
    if (!target) return
    const trackId = (target as HTMLElement).dataset.trackId
    const rect = target.getBoundingClientRect()
    const pps = store.getSnapshot().state.pxPerSecond
    void addItem(
      drag.item,
      Math.max(0, pxToMs(event.clientX - rect.left, pps)),
      trackId
    )
  }

  function tileCancel() {
    dragRef.current = null
    setGhost(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<FilmIcon className="size-4" />}
        title="Media"
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Search media"
                title="Search media"
                aria-pressed={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search className={search ? "text-foreground" : undefined} />
              </Button>
              {searchOpen ? (
                <>
                  {/* A click anywhere else puts the box away. */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSearchOpen(false)}
                  />
                  <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-60 rounded-xl border bg-popover p-2 shadow-md">
                    <Input
                      autoFocus
                      value={search}
                      placeholder="Search media"
                      aria-label="Search media"
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setSearchOpen(false)
                      }}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              aria-label="Upload media"
              title="Upload media"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              multiple
              hidden
              onChange={(event) => {
                void handleUpload(event.target.files)
                event.target.value = ""
              }}
            />
          </div>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 3,
            background: "var(--elev)",
            borderRadius: 9,
            marginBottom: 15,
          }}
        >
          {MEDIA_FILTERS.map((option) => {
            const on = filter === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: on ? "var(--panel)" : "transparent",
                  color: on ? "var(--ink)" : "var(--ink2)",
                  boxShadow: on ? "var(--sh-sm)" : "none",
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        {/* Collections wrap rather than share a fixed row: there can be any
            number of them, with names of any length. */}
        {collections.length ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 5,
              marginBottom: 15,
            }}
          >
            {[
              { id: "all", label: "All" },
              { id: "uncollected", label: "Uncollected" },
              ...collections.map((collection) => ({
                id: collection.id,
                label: collection.name,
              })),
            ].map((option) => {
              const on = collectionFilter === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setCollectionFilter(option.id)}
                  title={option.label}
                  style={{
                    maxWidth: "100%",
                    padding: "5px 9px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    border: on ? "1px solid var(--acc)" : "1px solid var(--line)",
                    background: on ? "var(--acc-soft)" : "var(--panel)",
                    color: on ? "var(--acc)" : "var(--ink2)",
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div
            className="st-hovcard"
            onClick={() => fileRef.current?.click()}
            style={{
              border: "1.5px dashed var(--line2)",
              borderRadius: 13,
              padding: "20px 12px",
              textAlign: "center",
              background: "var(--panel2)",
              cursor: "pointer",
              transition: "background .13s",
            }}
          >
            <div
              style={{
                display: "grid",
                placeItems: "center",
                marginBottom: 8,
                color: "var(--mut)",
              }}
            >
              <Upload size={22} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
              {uploading ? "Uploading…" : "Drop or import media"}
            </div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>
              MP4 · MOV · PNG · JPG
            </div>
          </div>
        ) : (
          <>
            <Label>Clips · {items.length}</Label>
            {/* Two columns of natural-height tiles, so a portrait clip and a
                landscape one both read at their true shape. */}
            <div style={{ columnCount: 2, columnGap: 9 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="st-hovlift"
                  onPointerDown={(event) => tileDown(event, item)}
                  onPointerMove={tileMove}
                  onPointerUp={tileUp}
                  onPointerCancel={tileCancel}
                  title={`${item.original_name} — click to add at the playhead, or drag onto a track`}
                  style={{
                    position: "relative",
                    display: "block",
                    width: "100%",
                    marginBottom: 9,
                    breakInside: "avoid",
                    borderRadius: 11,
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                    cursor: "grab",
                    background: "var(--panel)",
                    padding: 0,
                    touchAction: "none",
                  }}
                >
                  {item.file_type === "image" ? (
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      style={{ display: "block", width: "100%" }}
                    />
                  ) : (
                    <video
                      src={item.playback_url}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ display: "block", width: "100%" }}
                    />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 6,
                      top: 6,
                      height: 22,
                      width: 22,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(0,0,0,.5)",
                      borderRadius: 7,
                      color: "#fff",
                      fontSize: 11,
                    }}
                  >
                    {item.file_type === "image" ? "▣" : "▶"}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        </div>
      </ScrollArea>

      {ghost ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: ghost.x + 12,
            top: ghost.y + 12,
            zIndex: 90,
            padding: "6px 10px",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: 9,
            fontSize: 11.5,
            fontWeight: 600,
            pointerEvents: "none",
            boxShadow: "var(--sh)",
          }}
        >
          {ghost.item.original_name}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Text ------

const TEXT_PRESETS: {
  label: string
  fontId: TextFontId
  fontSize: number
  y: number
  preview: React.CSSProperties
}[] = [
  {
    label: "Big Title",
    fontId: "inter",
    fontSize: 110,
    y: 0.28,
    preview: { fontWeight: 700, fontSize: 18 },
  },
  {
    label: "Bold Caption",
    fontId: "inter",
    fontSize: 74,
    y: 0.78,
    preview: { fontWeight: 800, fontSize: 15 },
  },
  {
    label: "Subtitle",
    fontId: "inter",
    fontSize: 48,
    y: 0.82,
    preview: { fontWeight: 500, fontSize: 13, color: "var(--ink2)" },
  },
]

const STICKERS = ["🔥", "✨", "👀", "☕", "💯", "➡️", "❤️", "⭐"]

function TextPanel() {
  const { dispatch, clock } = useEditorRuntime()

  function addText(
    text: string,
    fontId: TextFontId,
    fontSize: number,
    y: number
  ) {
    dispatch({
      type: "ADD_CLIP",
      clip: {
        id: editorId(),
        kind: "text",
        name: "Text",
        text,
        fontId,
        fontSize,
        color: "#ffffff",
        y,
        trimStartMs: 0,
        startMs: 0,
        durationMs: DEFAULT_TEXT_DURATION_MS,
      },
      atMs: clock.getTime(),
    })
  }

  return (
    <div>
      <Label>Styles</Label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 9,
          marginBottom: 20,
        }}
      >
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="st-hovcard"
            onClick={() =>
              addText(preset.label, preset.fontId, preset.fontSize, preset.y)
            }
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "15px",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            <span style={preset.preview}>{preset.label}</span>
            <Plus size={14} style={{ color: "var(--mut)" }} />
          </button>
        ))}
      </div>

      <Label>Stickers</Label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 9,
        }}
      >
        {STICKERS.map((sticker) => (
          <button
            key={sticker}
            type="button"
            className="st-hovcard"
            aria-label={`Add ${sticker}`}
            onClick={() => addText(sticker, "inter", 90, 0.5)}
            style={{
              aspectRatio: "1",
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            {sticker}
          </button>
        ))}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- Brand ------

function BrandPanel() {
  const [brandKit, setBrandKit] = React.useState<VideoBrandKit | null>(null)
  const [editing, setEditing] = React.useState(false)
  const { dispatch } = useEditorRuntime()
  // Only a text clip can take a colour, so the palette knows whether there is
  // anything to paint before it offers to.
  const selectedTextClipId = useEditorSelector((state) => {
    if (!state.selectedClipId) return null
    const found = findClip(state.tracks, state.selectedClipId)
    return found?.clip.kind === "text" ? found.clip.id : null
  })

  React.useEffect(() => {
    let active = true
    loadBrandKit()
      .then((loaded) => {
        if (active) setBrandKit(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  if (!brandKit) {
    return (
      <div className="grid place-items-center py-8" role="status">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2.5">
        <span className="text-[15px] font-medium">Palette</span>
        {brandKit.colors.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              {/* Keyed by position: two colours in a kit are allowed to have
                  the same name and the same value, so neither is an id. */}
              {brandKit.colors.map((color, index) => (
                <button
                  key={index}
                  type="button"
                  disabled={!selectedTextClipId}
                  title={`${color.name} · ${color.value}`}
                  aria-label={`Use ${color.name} on the selected words`}
                  onClick={() =>
                    selectedTextClipId &&
                    dispatch({
                      type: "UPDATE_CLIP",
                      clipId: selectedTextClipId,
                      patch: { color: color.value },
                    })
                  }
                  className="size-10 rounded-lg border border-foreground/10 transition-[border-color] hover:border-foreground/25 disabled:cursor-default disabled:opacity-60"
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedTextClipId
                ? "Click one to colour the words you have selected."
                : "Select some words on the timeline to use one of these."}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No brand colours yet.</p>
        )}
      </div>

      <div className="grid gap-2.5">
        <span className="text-[15px] font-medium">Logo</span>
        {brandKit.logoUrl ? (
          <div className="grid place-items-center rounded-lg border border-foreground/10 bg-muted/40 p-4">
            <img
              src={brandKit.logoUrl}
              alt="Brand logo"
              className="max-h-16 max-w-full object-contain"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-foreground/15 p-5 text-center text-sm text-muted-foreground">
            No logo yet
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setEditing(true)}
      >
        Edit brand kit
      </Button>

      <BrandKitDialog
        open={editing}
        onOpenChange={setEditing}
        brandKit={brandKit}
        onSaved={setBrandKit}
      />
    </div>
  )
}

