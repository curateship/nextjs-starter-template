import * as React from "react"
import {
  FilmIcon,
  FolderPlusIcon,
  Loader2,
  PauseIcon,
  PlayIcon,
  Plus,
  Search,
  Shapes,
  SmartphoneIcon,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { isUploadCancelled } from "@/lib/media/upload-in-parts"
import { queueUpload } from "@/lib/media/upload-queue"
import { uploadProjectMedia } from "@/lib/api/video/project-guests"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { InspectorCard } from "@/components/shared/inspector-card"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EditorMediaContextMenu } from "@/components/shared/editor-media-context-menu"
import { AiPanel } from "@/components/video-editor/studio-ai-panel"
import { MusicPanel } from "@/components/video-editor/studio-music-panel"
import { SoundsPanel } from "@/components/video-editor/studio-sounds-panel"
import { VoiceoversPanel } from "@/components/video-editor/studio-voiceovers-panel"
import {
  SoundsTabContext,
  isSoundsTab,
  type SoundsTab,
} from "@/lib/video/sounds-tabs"
import { AdsPanel } from "@/components/video-editor/studio-ads-panel"
import { Tabs } from "@/components/ui/tabs"
import { TranscriptPanel } from "@/components/video-editor/studio-transcript-panel"
import { AiClipPanel } from "@/components/video-editor/studio-ai-clip-panel"
import { CopyPanel } from "@/components/video-editor/studio-copy-panel"
import { VideosPanel } from "@/components/video-editor/studio-videos-panel"
import { ExportsPanel } from "@/components/video-editor/studio-exports-panel"
import { HistoryPanel } from "@/components/video-editor/studio-history-panel"
import {
  attachEditorMedia,
  getVideoMediaErrorMessage,
  listVideoMedia,
  retryMediaPreparation,
  type MediaCollectionCounts,
  type VideoMediaItem,
} from "@/lib/api/video/media"
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
  MediaDurationError,
  waveformDataUrl,
} from "@/lib/video/timeline-utils"
import { Card, CardContent } from "@/components/ui/card"
import { buildMediaClip } from "@/components/video-editor/media-clip"
import {
  StickerAddMenu,
  StickerShelf,
  type StickerAdding,
} from "@/components/video-editor/studio-stickers"
import {
  CollectionNameDialog,
  MediaSelectionBar,
  SelectTileOverlay,
} from "@/components/video-editor/studio-media-collections"
import { useMediaCollections } from "@/components/video-editor/use-media-collections"
import { MediaFilterMenu } from "@/components/video-editor/studio-media-filter"
import {
  EDITOR_MEDIA_FILTER,
  emptyMediaFilter,
  readMediaTypes,
  type MediaFilterValue,
} from "@/lib/video/media-saved-views"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { useDragToTimeline } from "@/components/video-editor/use-drag-to-timeline"
import {
  useEditorRuntime,
  useEditorSelector,
  useEditorStoreSelector,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { Hint } from "@/components/video-assets/hint"
import { usePlatformInset } from "@/components/video-editor/caption-settings-context"
import { newProgressBar } from "@/lib/video/progress-bar"
import {
  DEFAULT_SHAPE_COLOR,
  DEFAULT_SHAPE_DURATION_MS,
  DEFAULT_SHAPE_LINE_WIDTH,
  newShapePlacement,
  shapeDesignFrame,
  SHAPE_KINDS,
  SHAPE_LABELS,
  type ShapeKind,
} from "@/lib/video/shapes"
import { newBlurClip } from "@/components/video-editor/blur-clip"
import { useStickerProfile } from "@/components/video-editor/use-sticker-profile"
import { PhoneUploadDialog } from "@/components/video-editor/phone-upload-dialog"
import {
  DEFAULT_SOCIAL_DURATION_MS,
  newSocialSticker,
  SOCIAL_KINDS,
  SOCIAL_LABELS,
  SUBSCRIBE_PRESS_MS,
  type SocialKind,
} from "@/lib/video/social-stickers"
import { findStockSound, stockSoundUrl } from "@/lib/video/stock-sounds"
import { TemplatesPanel } from "@/components/video-templates/templates-panel"
import { ThumbnailPanel } from "@/components/video-thumbnails/thumbnail-panel"

/**
 * The panel beside the tool rail. Which one is showing is the rail's business;
 * everything each of them needs is loaded here.
 */

export type StudioPanel =
  | "videos"
  | "media"
  | "sounds"
  | "ads"
  | "text"
  | "ai"
  | "templates"
  | "transcript"
  | "ai-clip"
  | "thumbnail"
  | "copy"
  | "exports"
  | "history"

// How long the Media panel waits before asking again while a video is still
// being got ready. The worker runs every fifteen seconds, so this catches a
// finished file within one run, and it is slower than the two seconds the
// filmstrip route asks for.
const PREPARATION_RECHECK_MS = 5000

const PANEL_TITLE: Record<StudioPanel, string> = {
  videos: "Videos",
  media: "Media",
  sounds: "Sounds",
  ads: "Ads",
  text: "Elements",
  ai: "AI tools",
  templates: "Templates",
  transcript: "Transcript",
  "ai-clip": "AI clip",
  thumbnail: "Thumbnail",
  copy: "Copy",
  exports: "Exports",
  history: "History",
}

export function StudioContextPanel({
  panel,
  soundsTab,
  onSoundsTabChange,
}: {
  panel: StudioPanel
  /** Which of Music, Sounds and Voices the Sounds panel shows. */
  soundsTab: SoundsTab
  onSoundsTabChange: (tab: SoundsTab) => void
}) {
  // Media has search and upload buttons to put in its header, so it draws its
  // own; Text has the sticker +.
  if (panel === "videos") return <VideosPanel />
  if (panel === "media") return <MediaPanel />
  if (panel === "sounds") {
    return <SoundsRailPanel tab={soundsTab} onTabChange={onSoundsTabChange} />
  }
  if (panel === "ads") return <AdsPanel />
  // The AI panel draws its own header too, so its tools can say what they need.
  if (panel === "ai") return <AiPanel />
  if (panel === "templates") return <TemplatesPanel />
  if (panel === "transcript") return <TranscriptPanel />
  if (panel === "ai-clip") return <AiClipPanel />
  if (panel === "thumbnail") return <ThumbnailPanel />
  if (panel === "copy") return <CopyPanel />
  if (panel === "exports") return <ExportsPanel />
  if (panel === "history") return <HistoryPanel />

  return <TextPanelFrame title={PANEL_TITLE[panel]} />
}

/**
 * Music, Sounds and Voices, one at a time, under the tabs in their header
 * (`sounds-tabs.tsx`). The editor holds the tab, so it is kept while the
 * editor is open.
 */
function SoundsRailPanel({
  tab,
  onTabChange,
}: {
  tab: SoundsTab
  onTabChange: (tab: SoundsTab) => void
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (isSoundsTab(next)) onTabChange(next)
      }}
      className="h-full min-h-0 gap-0"
    >
      <SoundsTabContext.Provider value={{ tab, onTabChange }}>
        {tab === "music" ? <MusicPanel /> : tab === "sounds" ? <SoundsPanel /> : <VoiceoversPanel />}
      </SoundsTabContext.Provider>
    </Tabs>
  )
}

function TextPanelFrame({ title }: { title: string }) {
  // Stickers are the owner's own shelf, so a guest sent from Project has none.
  const guest = useProjectGuest() !== null
  const [adding, setAdding] = React.useState<StickerAdding>(null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<Shapes className="size-4" />}
        title={title}
        action={guest ? undefined : <StickerAddMenu onPick={setAdding} />}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <TextPanel guest={guest} adding={adding} onAddingChange={setAdding} />
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

function MediaPanel() {
  const { dispatch, store, projectId } = useEditorRuntime()
  // A guest sent from Project uploads straight into this project and has no
  // collections, library or delete (`workspace/docs/project-guests.md`).
  const guest = useProjectGuest() !== null
  const [mediaFilter, setMediaFilter] =
    React.useState<MediaFilterValue>(() => emptyMediaFilter(EDITOR_MEDIA_FILTER))
  const { types, collection: collectionFilter } = mediaFilter
  const typesKey = types.join(",")
  const soundOnly = typesKey === "audio"
  const { collections, reload: reloadCollections } = useMediaCollections({ enabled: !guest })
  const activeCollection =
    collections.find((collection) => collection.id === collectionFilter) ??
    null
  // The collection being shown was deleted, here or in another tab.
  if (
    collectionFilter !== "all" &&
    collectionFilter !== "uncollected" &&
    !activeCollection
  ) {
    setMediaFilter((current) => ({ ...current, collection: "all" }))
  }
  const [selecting, setSelecting] = React.useState(false)
  const selection = useSelection()
  const { setSelected } = selection
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [items, setItems] = React.useState<VideoMediaItem[]>([])
  const [counts, setCounts] = React.useState<MediaCollectionCounts>()
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
  const [fromPhone, setFromPhone] = React.useState(false)
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
      fileTypes: typesKey ? readMediaTypes(typesKey) : undefined,
      search: debounced || undefined,
      withCounts: !guest,
    })
      .then((data) => {
        if (active) {
          setItems(data.media)
          setCounts(data.collection_counts)
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
    typesKey,
    guest,
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
      showErrorToast(
        error instanceof MediaDurationError
          ? error.message
          : getVideoMediaErrorMessage(error)
      )
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
        if (guest) {
          await uploadProjectMedia(projectId, file)
          continue
        }
        // Through the app-wide upload list, so leaving the editor does not
        // stop a big file, and the file still joins this project when it
        // lands after the editor has closed.
        const media = await queueUpload(file)
        await attachEditorMedia({ type: "project", id: projectId }, media.id)
      }
      setRefresh((count) => count + 1)
    } catch (error) {
      // Cancelled from the upload line: nothing went wrong to report.
      if (!isUploadCancelled(error)) showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  const { dragHandlers, ghost } = useDragToTimeline<VideoMediaItem>({
    label: (item) => item.original_name,
    onDrop: (item, atMs, trackId) => void addItem(item, atMs, trackId),
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<FilmIcon className="size-4" />}
        title="Media"
        action={
          <div className="flex items-center gap-2">
            {/* A popover rather than a box under the button, so it moves
                clear of the rail when the panel is narrow (the Voiceovers
                panel's search). */}
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Search media"
                      aria-pressed={searchOpen}
                    >
                      <Search className={search ? "text-foreground" : undefined} />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Search media</TooltipContent>
              </Tooltip>
              <PopoverContent align="start" className="w-60 p-2">
                <Input
                  autoFocus
                  type="search"
                  value={search}
                  placeholder="Search media"
                  aria-label="Search media"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </PopoverContent>
            </Popover>
            <MediaFilterMenu
              kind={EDITOR_MEDIA_FILTER}
              baseRows={
                collections.length
                  ? [
                      { id: "all", label: "All media" },
                      { id: "uncollected", label: "Uncollected" },
                    ]
                  : [{ id: "all", label: "All media" }]
              }
              value={mediaFilter}
              onChange={setMediaFilter}
              collections={collections}
              counts={
                counts && {
                  ...counts.by_collection,
                  all: counts.all,
                  uncollected: counts.uncollected,
                }
              }
              guest={guest}
              onCollectionsChanged={reloadCollections}
              onNewCollection={() => setCreatingCollection(true)}
            />
            {guest ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={uploading}
                    aria-label="Upload media"
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload media</TooltipContent>
              </Tooltip>
            ) : (
            <DropdownMenu>
              <Hint label="Add" disabled={uploading}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={uploading}
                    aria-label="Add media or collection"
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <Upload />
                  Upload media
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFromPhone(true)}>
                  <SmartphoneIcon />
                  From your phone
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCreatingCollection(true)}>
                  <FolderPlusIcon />
                  New collection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
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
        <div className="p-3">
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
              Pick All media in the filter, press Select, tick some files
              and add them here.
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
              {guest ? null : selecting ? (
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
                soundOnly
                  ? {
                      display: "grid",
                      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                      gap: 12,
                    }
                  : { columnCount: 2, columnGap: 12 }
              }
            >
              {items.map((item) => (
                <GuestOrMenu key={item.id} guest={guest} menu={mediaMenuProps(item)}>
                  <div
                    style={{
                      position: "relative",
                      breakInside: "avoid",
                      marginBottom: soundOnly ? 0 : 12,
                    }}
                  >
                    {item.file_type === "audio" ? (
                      <AudioMediaCard
                        item={item}
                        active={previewingAudioId === item.id}
                        onActiveChange={setPreviewingAudioId}
                        {...dragHandlers(item)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="st-hovlift"
                        {...dragHandlers(item)}
                        title={`${item.original_name} - drag onto a track, or right-click for collections and delete`}
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
                </GuestOrMenu>
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

      {fromPhone ? <PhoneUploadDialog onClose={() => setFromPhone(false)} /> : null}

      {ghost}
    </div>
  )
}

/**
 * A tile's right-click menu (collections and delete), left off for a guest
 * sent from Project, who can do neither.
 */
function GuestOrMenu({
  guest,
  menu,
  children,
}: {
  guest: boolean
  menu: Omit<React.ComponentProps<typeof EditorMediaContextMenu>, "children">
  children: React.ReactElement
}) {
  if (guest) return children
  return <EditorMediaContextMenu {...menu}>{children}</EditorMediaContextMenu>
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
        {item.proxy_note ? "Waiting for room on the server's disk" : "Getting it ready to scrub"}
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
      title={`${item.original_name} - drag onto a track, or right-click for collections and delete`}
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
            {durationMs ? formatClock(durationMs) : "-"} ·{" "}
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

function TextPanel({
  guest,
  adding,
  onAddingChange,
}: {
  guest: boolean
  adding: StickerAdding
  onAddingChange: (adding: StickerAdding) => void
}) {
  const { dispatch, clock } = useEditorRuntime()
  const progressBar = useEditorSelector((state) => state.progressBar)
  const aspect = useEditorSelector((state) => state.aspect)
  const inset = usePlatformInset()
  const profile = useStickerProfile()

  function addBlur() {
    dispatch({ type: "ADD_OVERLAY", clip: newBlurClip(), atMs: clock.getTime() })
  }

  function addShape(kind: ShapeKind) {
    dispatch({
      type: "ADD_OVERLAY",
      clip: {
        id: editorId(),
        kind: "shape",
        name: SHAPE_LABELS[kind],
        shape: kind,
        ...newShapePlacement(kind),
        color: DEFAULT_SHAPE_COLOR,
        lineWidth: DEFAULT_SHAPE_LINE_WIDTH,
        drawOn: true,
        trimStartMs: 0,
        startMs: 0,
        durationMs: DEFAULT_SHAPE_DURATION_MS,
      },
      atMs: clock.getTime(),
    })
  }

  // A social sticker lands at the playhead with the person's own name and
  // picture. The Subscribe button brings its click with it, on a lane of its
  // own at the moment the cursor presses, and one Undo takes both away.
  function addSocial(kind: SocialKind) {
    const [across, down] = aspect.split(":").map(Number)
    const frame = shapeDesignFrame(across / down)
    const clip: EditorClip = {
      id: editorId(),
      kind: "shape",
      name: SOCIAL_LABELS[kind],
      ...newSocialSticker(kind, frame, profile),
      trimStartMs: 0,
      startMs: 0,
      durationMs: DEFAULT_SOCIAL_DURATION_MS,
    }
    const atMs = clock.getTime()
    if (kind !== "subscribe") {
      dispatch({ type: "ADD_OVERLAY", clip, atMs })
      return
    }
    const click = findStockSound("click")!
    dispatch({
      type: "ADD_OVERLAY_WITH_SOUND",
      clip,
      atMs,
      soundAtMs: atMs + SUBSCRIBE_PRESS_MS,
      sound: {
        id: editorId(),
        kind: "audio",
        name: `${click.label} (Subscribe)`,
        pressFor: clip.id,
        stockSound: click.id,
        url: stockSoundUrl(click.id),
        sourceDurationMs: click.durationMs,
        trimStartMs: 0,
        startMs: 0,
        durationMs: click.durationMs,
      },
    })
  }

  // The bar belongs to the project, so its settings show with no clip picked.
  function addProgressBar() {
    dispatch({ type: "SELECT_CLIP", clipId: null })
    if (progressBar) {
      toast("This project already has a progress bar. Its settings are on the right.")
      return
    }
    dispatch({ type: "SET_PROGRESS_BAR", progressBar: newProgressBar(inset.bottom) })
  }

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

  // Each section is its own grey card, the same card the inspector on the
  // right uses, so it can be shut and stays shut (Tyler, 5 Nov 2026).
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <InspectorCard storageId="video-elements-styles" title="Styles">
      <div className="mt-3" style={ELEMENT_GRID}>
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="st-hovcard"
            onClick={() =>
              addText(preset.label, preset.fontId, preset.fontSize, preset.y)
            }
            style={ELEMENT_BUTTON}
          >
            <span style={preset.preview}>{preset.label}</span>
            <Plus size={14} style={{ color: "var(--mut)" }} />
          </button>
        ))}
      </div>
      </InspectorCard>

      <InspectorCard storageId="video-elements-shapes" title="Shapes">
      <div className="mt-3" style={ELEMENT_GRID}>
        {[
          ...SHAPE_KINDS.map((kind) => ({
            key: kind,
            label: SHAPE_LABELS[kind],
            onClick: () => addShape(kind),
          })),
          { key: "blur", label: "Blur", onClick: addBlur },
          { key: "progress", label: "Progress bar", onClick: addProgressBar },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className="st-hovcard"
            onClick={item.onClick}
            style={ELEMENT_BUTTON}
          >
            <span style={{ fontWeight: 500, fontSize: 13, color: "var(--ink2)" }}>
              {item.label}
            </span>
            <Plus size={14} style={{ color: "var(--mut)" }} />
          </button>
        ))}
      </div>
      </InspectorCard>

      <InspectorCard storageId="video-elements-social" title="Social">
      <div className="mt-3" style={ELEMENT_GRID}>
        {SOCIAL_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="st-hovcard"
            onClick={() => addSocial(kind)}
            style={ELEMENT_BUTTON}
          >
            <span style={{ fontWeight: 500, fontSize: 13, color: "var(--ink2)" }}>
              {SOCIAL_LABELS[kind]}
            </span>
            <Plus size={14} style={{ color: "var(--mut)" }} />
          </button>
        ))}
      </div>
      </InspectorCard>

      {/* Stickers are the owner's own shelf, so a guest gets no card. */}
      {guest ? null : (
        <InspectorCard storageId="video-elements-stickers" title="Stickers">
          <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)]">
            <StickerShelf adding={adding} onAddingChange={onAddingChange} />
          </div>
        </InspectorCard>
      )}
    </div>
  )
}

/** One column of add buttons inside an Elements card. */
const ELEMENT_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 8,
}

/**
 * One add button. Tighter than before the cards, because the card's own
 * padding already takes room from a narrow panel.
 */
const ELEMENT_BUTTON: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 12px",
  // White on the grey card, as the inspector's fields are (Tyler, 5 Nov 2026).
  background: "var(--background)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  cursor: "pointer",
}
