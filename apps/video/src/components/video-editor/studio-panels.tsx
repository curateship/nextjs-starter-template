import * as React from "react"
import {
  FilmIcon,
  FolderPlusIcon,
  LayoutGrid,
  Loader2,
  PauseIcon,
  PlayIcon,
  Plus,
  Search,
  Type,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { uploadMedia } from "@/lib/api/media/media"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { EditorMediaContextMenu } from "@/components/shared/editor-media-context-menu"
import { AiPanel } from "@/components/video-editor/studio-ai-panel"
import { MusicPanel } from "@/components/video-editor/studio-music-panel"
import { VoiceoversPanel } from "@/components/video-editor/studio-voiceovers-panel"
import { TranscriptPanel } from "@/components/video-editor/studio-transcript-panel"
import {
  attachEditorMedia,
  getVideoMediaErrorMessage,
  listVideoMedia,
  retryMediaPreparation,
  type VideoMediaItem,
} from "@/lib/api/video/media"
import { loadBrandKit, type VideoBrandKit } from "@/lib/api/video/settings"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatFileSize } from "@/lib/format/format-bytes"
import { announceFilmstripRequeued } from "@/lib/video/filmstrips"
import { mediaPreparation } from "@/lib/video/media-preparation"
import { useSelection } from "@/lib/hooks/use-selection"
import { type TextFontId } from "@/lib/video/text-fonts"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
  formatClock,
  pxToMs,
  waveformDataUrl,
} from "@/lib/video/timeline-utils"
import { Card, CardContent } from "@/components/ui/card"
import { BrandKitDialog } from "@/components/video-editor/brand-kit-dialog"
import { buildMediaClip } from "@/components/video-editor/media-clip"
import { StickerShelf } from "@/components/video-editor/studio-stickers"
import {
  CollectionChips,
  CollectionNameDialog,
  MediaSelectionBar,
  SelectTileOverlay,
} from "@/components/video-editor/studio-media-collections"
import { useMediaCollections } from "@/components/video-editor/use-media-collections"
import {
  findClip,
  useEditorRuntime,
  useEditorSelector,
  useEditorStoreSelector,
} from "@/components/video-editor/editor-store"

/**
 * The panel beside the tool rail. Which one is showing is the rail's business;
 * everything each of them needs is loaded here.
 */

export type StudioPanel =
  | "media"
  | "music"
  | "voiceovers"
  | "text"
  | "brand"
  | "ai"
  | "transcript"

// How long the Media panel waits before asking again while a video is still
// being got ready. The worker runs every fifteen seconds, so this catches a
// finished file within one run, and it is slower than the two seconds the
// filmstrip route asks for.
const PREPARATION_RECHECK_MS = 5000

const PANEL_TITLE: Record<StudioPanel, string> = {
  media: "Media",
  music: "Music",
  voiceovers: "Voiceovers",
  text: "Text",
  brand: "Brand kit",
  ai: "AI",
  transcript: "Transcript",
}

export function StudioContextPanel({ panel }: { panel: StudioPanel }) {
  // Media has search and upload buttons to put in its header, so it draws its
  // own; the other two only need a title.
  if (panel === "media") return <MediaPanel />
  if (panel === "music") return <MusicPanel />
  if (panel === "voiceovers") return <VoiceoversPanel />
  // The AI panel draws its own header too, so its tools can say what they need.
  if (panel === "ai") return <AiPanel />
  if (panel === "transcript") return <TranscriptPanel />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
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

const MEDIA_FILTERS: {
  id: "all" | "video" | "image" | "audio"
  label: string
}[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "audio", label: "Sound" },
]

function MediaPanel() {
  const { dispatch, store, projectId } = useEditorRuntime()
  const [filter, setFilter] = React.useState<
    "all" | "video" | "image" | "audio"
  >("all")
  // "all" = every file, "uncollected" = the ones in no collection, anything
  // else is a collection's id.
  const [collectionFilter, setCollectionFilter] = React.useState("all")
  const { collections, reload: reloadCollections } = useMediaCollections()
  const activeCollection =
    collections.find((collection) => collection.id === collectionFilter) ??
    null
  // The collection being shown was deleted, here or in another tab.
  if (
    collectionFilter !== "all" &&
    collectionFilter !== "uncollected" &&
    !activeCollection
  ) {
    setCollectionFilter("all")
  }
  const [selecting, setSelecting] = React.useState(false)
  const selection = useSelection()
  const { setSelected } = selection
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [items, setItems] = React.useState<VideoMediaItem[]>([])
  const [previewingAudioId, setPreviewingAudioId] = React.useState<string | null>(
    null
  )
  const [refresh, setRefresh] = React.useState(0)
  const shelfVersion = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.mediaShelfVersion
  )
  const [uploading, setUploading] = React.useState(false)
  const [creatingCollection, setCreatingCollection] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  React.useEffect(() => {
    let active = true
    listVideoMedia({
      scope: { type: "project", id: projectId },
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
        if (active) {
          setItems(data.media)
          // A tick on a file that is no longer showing would be acted on
          // unseen, so it goes.
          setSelected(
            (current) =>
              new Set(
                data.media
                  .map((item) => item.id)
                  .filter((id) => current.has(id))
              )
          )
          setPreviewingAudioId((current) =>
            current && data.media.some((item) => item.id === current)
              ? current
              : null
          )
        }
      })
      .catch((error) => {
        if (active) showErrorToast(getVideoMediaErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [
    collectionFilter,
    filter,
    debounced,
    projectId,
    refresh,
    shelfVersion,
    setSelected,
  ])

  // One list request at a time: the next waits for the answer to the last.
  const anyPreparing = items.some(
    (item) => mediaPreparation(item) === "preparing"
  )
  React.useEffect(() => {
    if (!anyPreparing) return
    const timer = setTimeout(
      () => setRefresh((count) => count + 1),
      PREPARATION_RECHECK_MS
    )
    return () => clearTimeout(timer)
  }, [anyPreparing, items])

  const [retryingId, setRetryingId] = React.useState<string | null>(null)
  async function retryPreparation(item: VideoMediaItem) {
    setRetryingId(item.id)
    try {
      await retryMediaPreparation(item.id)
      announceFilmstripRequeued(item.id)
      setRefresh((count) => count + 1)
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setRetryingId(null)
    }
  }

  async function addItem(item: VideoMediaItem, atMs: number, trackId?: string) {
    try {
      const clip = await buildMediaClip(item)
      dispatch({ type: "ADD_CLIP", clip, atMs, trackId })
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    }
  }

  function handleMediaDeleted(mediaId: string) {
    setItems((current) => current.filter((item) => item.id !== mediaId))
    setPreviewingAudioId((current) => (current === mediaId ? null : current))
    reloadCollections()
  }

  function stopSelecting() {
    setSelecting(false)
    selection.clear()
  }

  function handleCollectionsSet(mediaId: string, collectionIds: string[]) {
    // A file that no longer matches the chip on screen leaves the grid.
    const stillShown = activeCollection
      ? collectionIds.includes(activeCollection.id)
      : collectionFilter !== "uncollected" || collectionIds.length === 0
    if (!stillShown) {
      handleMediaDeleted(mediaId)
      return
    }
    setItems((current) =>
      current.map((item) =>
        item.id === mediaId ? { ...item, collection_ids: collectionIds } : item
      )
    )
    reloadCollections()
  }

  function mediaMenuProps(item: VideoMediaItem) {
    return {
      scope: { type: "project", id: projectId } as const,
      mediaId: item.id,
      mediaName: item.original_name,
      onDeleted: handleMediaDeleted,
      collections: {
        all: collections,
        memberOf: item.collection_ids,
        onChange: (ids: string[]) => handleCollectionsSet(item.id, ids),
      },
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const media = await uploadMedia(file)
        await attachEditorMedia({ type: "project", id: projectId }, media.id)
      }
      setRefresh((count) => count + 1)
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  // --- Dragging a file onto a lane ----------------------------------------
  // Dragging is the only way a file reaches the timeline: the clip lands where
  // it is let go. The lane under the pointer is found by asking the page what
  // is there, which keeps the panel and the timeline from having to know about
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
    // A plain click does nothing: adding to the timeline is dragging onto a
    // track, so a look at a tile never lands a clip by accident.
    if (!drag.moved) return
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
      <DashboardCardTitleHeader
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={uploading}
                  aria-label="Add media or collection"
                  title="Add"
                >
                  {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <Upload />
                  Upload media
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCreatingCollection(true)}>
                  <FolderPlusIcon />
                  New collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*,audio/*"
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

        <CollectionChips
          collections={collections}
          value={collectionFilter}
          onChange={setCollectionFilter}
          onCollectionsChanged={reloadCollections}
        />

        {items.length === 0 && activeCollection ? (
          <div
            style={{
              border: "1.5px dashed var(--line2)",
              borderRadius: 13,
              padding: "20px 12px",
              textAlign: "center",
              background: "var(--panel2)",
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
              Nothing in “{activeCollection.name}” yet
            </div>
            <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>
              Pick All, press Select, tick some files and add them here.
            </div>
          </div>
        ) : items.length === 0 ? (
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
              MP4 · MOV · PNG · JPG · MP3 · WAV
            </div>
          </div>
        ) : (
          <>
            <div
              className="flex items-center justify-between gap-2"
              style={{ marginBottom: 10 }}
            >
              <Label style={{ marginBottom: 0 }}>Clips · {items.length}</Label>
              {selecting ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    selection.toggleVisible(items.map((item) => item.id))
                  }
                >
                  {selection.selectAllState(items.map((item) => item.id)) ===
                  true
                    ? "Clear all"
                    : "Select all"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelecting(true)}
                >
                  Select
                </Button>
              )}
            </div>
            {/* Pictures and video keep their natural-height masonry layout.
                Sound uses an even two-column card grid for its preview UI.
                Each tile sits in a box of its own so the select overlay can
                cover it exactly. */}
            <div
              style={
                filter === "audio"
                  ? {
                      display: "grid",
                      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                      gap: 9,
                    }
                  : { columnCount: 2, columnGap: 9 }
              }
            >
              {items.map((item) => (
                <EditorMediaContextMenu key={item.id} {...mediaMenuProps(item)}>
                  <div
                    style={{
                      position: "relative",
                      breakInside: "avoid",
                      marginBottom: filter === "audio" ? 0 : 9,
                    }}
                  >
                    {item.file_type === "audio" ? (
                      <AudioMediaCard
                        item={item}
                        active={previewingAudioId === item.id}
                        onActiveChange={setPreviewingAudioId}
                        onPointerDown={(event) => tileDown(event, item)}
                        onPointerMove={tileMove}
                        onPointerUp={tileUp}
                        onPointerCancel={tileCancel}
                      />
                    ) : (
                      <button
                        type="button"
                        className="st-hovlift"
                        onPointerDown={(event) => tileDown(event, item)}
                        onPointerMove={tileMove}
                        onPointerUp={tileUp}
                        onPointerCancel={tileCancel}
                        title={`${item.original_name} — drag onto a track, or right-click for collections and delete`}
                        style={{
                          position: "relative",
                          display: "block",
                          width: "100%",
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
                    )}
                    <PreparationNote
                      item={item}
                      retrying={retryingId === item.id}
                      onRetry={() => void retryPreparation(item)}
                    />
                    {selecting ? (
                      <SelectTileOverlay
                        name={item.original_name}
                        selected={selection.selected.has(item.id)}
                        onToggle={() => selection.toggle(item.id)}
                      />
                    ) : null}
                  </div>
                </EditorMediaContextMenu>
              ))}
            </div>
          </>
        )}
        </div>
      </ScrollArea>

      {selecting ? (
        <MediaSelectionBar
          selectedIds={Array.from(selection.selected)}
          collections={collections}
          activeCollection={activeCollection}
          onDone={() => {
            stopSelecting()
            setRefresh((count) => count + 1)
            reloadCollections()
          }}
          onCancel={stopSelecting}
        />
      ) : null}

      {/* The header's + menu makes an empty collection; filling it is the
          grid's Select flow. */}
      <CollectionNameDialog
        open={creatingCollection}
        onOpenChange={setCreatingCollection}
        collection={null}
        onSaved={(created) => {
          toast.success(`Created “${created.name}”.`)
          reloadCollections()
        }}
      />

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

/**
 * A line under a video tile while the worker is still making its smooth copy
 * or its frames, or after it gave up on one. Under the tile rather than over
 * it: a wide video's tile is as small as 56 by 32 pixels in a narrow window,
 * too small to hold a sentence, and a Try again button over the tile would be
 * a button inside a button.
 */
function PreparationNote({
  item,
  retrying,
  onRetry,
}: {
  item: VideoMediaItem
  retrying: boolean
  onRetry: () => void
}) {
  const state = mediaPreparation(item)
  if (state === "ready") return null
  if (state === "preparing") {
    return (
      <p
        role="status"
        className="mt-1.5 px-0.5 text-[10.5px] leading-tight text-muted-foreground"
      >
        <Loader2
          aria-hidden
          className="mr-1 inline size-3 align-[-2px] motion-safe:animate-spin"
        />
        Getting it ready to scrub
      </p>
    )
  }
  return (
    <div role="status" className="mt-1.5 grid gap-1 px-0.5">
      <p className="text-[10.5px] leading-tight font-medium text-foreground">
        Couldn't get it ready to scrub
      </p>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="justify-self-start"
        disabled={retrying}
        aria-label={`Try getting ${item.original_name} ready again`}
        onClick={onRetry}
      >
        {retrying ? <Loader2 className="animate-spin" /> : null}
        Try again
      </Button>
    </div>
  )
}

function AudioMediaCard({
  item,
  active,
  onActiveChange,
  ...pointerProps
}: {
  item: VideoMediaItem
  active: boolean
  onActiveChange: (mediaId: string | null) => void
} & Pick<
  React.ComponentProps<typeof Card>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [durationMs, setDurationMs] = React.useState(0)
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    if (!active) audioRef.current?.pause()
  }, [active])

  React.useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    []
  )

  async function togglePreview() {
    const audio = audioRef.current
    if (!audio) return
    if (active) {
      audio.pause()
      onActiveChange(null)
      return
    }

    onActiveChange(item.id)
    try {
      await audio.play()
    } catch {
      onActiveChange(null)
      showErrorToast("Audio preview could not be played.")
    }
  }

  const waveformMask = waveformDataUrl("#000000")

  return (
    <Card
      size="sm"
      title={`${item.original_name} — drag onto a track, or right-click for collections and delete`}
      className="st-hovlift cursor-grab gap-3"
      style={{ touchAction: "none" }}
      {...pointerProps}
    >
      <CardContent className="grid gap-3">
        <div className="relative h-14 min-w-0">
          <Button
            type="button"
            size="icon-lg"
            // Centred with margins, not a transform: the Button's own pressed
            // nudge is a transform too, and would replace a centring one.
            className="absolute inset-y-0 left-0 z-10 my-auto rounded-full"
            aria-label={active ? `Pause ${item.original_name}` : `Play ${item.original_name}`}
            title={active ? "Pause preview" : "Play preview"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              void togglePreview()
            }}
          >
            {active ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <div
              className="absolute inset-0 bg-muted-foreground/25"
              style={{
                maskImage: waveformMask,
                WebkitMaskImage: waveformMask,
                maskPosition: "center",
                WebkitMaskPosition: "center",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskSize: "100% 100%",
                WebkitMaskSize: "100% 100%",
              }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-[width]"
              style={{
                width: `${progress * 100}%`,
                maskImage: waveformMask,
                WebkitMaskImage: waveformMask,
                maskPosition: "left center",
                WebkitMaskPosition: "left center",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskSize:
                  progress > 0 ? `${100 / progress}% 100%` : "100% 100%",
                WebkitMaskSize:
                  progress > 0 ? `${100 / progress}% 100%` : "100% 100%",
              }}
            />
          </div>
        </div>

        <div className="min-w-0 text-left">
          <span
            className="line-clamp-2 text-xs leading-4 font-medium"
            title={item.original_name}
          >
            {item.original_name}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {durationMs ? formatClock(durationMs) : "—"} ·{" "}
            {formatFileSize(item.file_size)}
          </span>
        </div>
      </CardContent>

      <audio
        hidden
        ref={audioRef}
        src={item.playback_url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          setDurationMs(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0)
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
        }}
        onEnded={() => {
          setProgress(0)
          onActiveChange(null)
        }}
      />
    </Card>
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

function TextPanel() {
  const { dispatch, clock } = useEditorRuntime()

  function addText(
    text: string,
    fontId: TextFontId,
    fontSize: number,
    y: number
  ) {
    dispatch({
      type: "ADD_OVERLAY",
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
      <StickerShelf />
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
