import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FlameIcon,
  GridIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { CreatorChip } from "@/components/creator-chip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { ViralVideoModal } from "@/components/viral-video-modal"
import {
  bulkDeleteViralVideos,
  createViralVideo,
  deleteViralVideo,
  getViralVideoErrorMessage,
  listViralVideos,
  retryViralVideo,
  type ViralVideoItem,
} from "@/lib/api/viral-videos"
import type { CreatorItem } from "@/lib/api/creators"
import { cn } from "@/lib/utils"
import { PLATFORM_LABELS, dateFormatter, formatCount, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type ViewMode = "list" | "gallery"

// Sortable columns in the list (table) view.
type SortColumn = "video" | "platform" | "views" | "likes" | "status" | "added"

const POLL_INTERVAL_MS = 3000

function progressForStatus(status: ViralVideoItem["status"] | null): number {
  if (status === "downloading") return 35
  if (status === "analyzing") return 70
  if (status === "ready") return 100
  return 0
}

function labelForStatus(status: ViralVideoItem["status"] | null): string {
  if (status === "downloading") return "Downloading video…"
  if (status === "analyzing") return "Analyzing with AI…"
  if (status === "ready") return "Analysis complete!"
  return ""
}

// With a `creator`, the dashboard becomes the drill-down level of the
// Creators parent→child pattern: breadcrumb title, reels filtered to that
// creator, and no Add Video (reels are added from the main archive).
export function ViralArchiveDashboard({
  creator,
}: {
  creator?: CreatorItem
}) {
  const [videos, setVideos] = React.useState<ViralVideoItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  // List-view sort — defaults to newest first (matches the server order).
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("added")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [viewTarget, setViewTarget] = React.useState<ViralVideoItem | null>(null)
  const [addModalOpen, setAddModalOpen] = React.useState(false)
  const [addingVideoId, setAddingVideoId] = React.useState<string | null>(null)

  const addingVideo =
    addingVideoId !== null
      ? (videos.find((v) => v.id === addingVideoId) ?? null)
      : null

  React.useEffect(() => {
    let active = true
    listViralVideos()
      .then((data) => { if (!active) return; setVideos(data.videos) })
      .catch((loadError) => { if (!active) return; setError(getViralVideoErrorMessage(loadError)) })
      .finally(() => { if (!active) return; setLoading(false) })
    return () => { active = false }
  }, [])

  const hasProcessing = videos.some(
    (v) => v.status === "downloading" || v.status === "analyzing"
  )
  React.useEffect(() => {
    if (!hasProcessing) return
    const interval = setInterval(() => {
      listViralVideos().then((data) => setVideos(data.videos)).catch(() => undefined)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [hasProcessing])

  const filteredVideos = React.useMemo(() => {
    const scoped = creator
      ? videos.filter((v) => v.creator_id === creator.id)
      : videos
    const query = searchQuery.trim().toLowerCase()
    const matched = query
      ? scoped.filter((v) =>
          `${v.title ?? ""} ${v.author ?? ""} ${v.source_url}`.toLowerCase().includes(query)
        )
      : scoped

    const direction = sortDirection === "asc" ? 1 : -1
    return [...matched].sort((a, b) => {
      if (sortColumn === "video")
        return (a.title ?? a.source_url).localeCompare(b.title ?? b.source_url) * direction
      if (sortColumn === "platform")
        return PLATFORM_LABELS[a.platform].localeCompare(PLATFORM_LABELS[b.platform]) * direction
      // Missing counts (null) sort below any real number.
      if (sortColumn === "views")
        return ((a.stats?.views ?? -1) - (b.stats?.views ?? -1)) * direction
      if (sortColumn === "likes")
        return ((a.stats?.likes ?? -1) - (b.stats?.likes ?? -1)) * direction
      if (sortColumn === "status")
        return a.status.localeCompare(b.status) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [videos, searchQuery, creator, sortColumn, sortDirection])

  const totalPages = Math.ceil(filteredVideos.length / pageSize)
  const paginatedVideos = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredVideos.slice(start, start + pageSize)
  }, [currentPage, filteredVideos, pageSize])

  function updateSearch(value: string) { setSearchQuery(value); setCurrentPage(1) }
  function changePageSize(size: number) { setPageSize(size); setCurrentPage(1) }
  // Same-column click flips direction; a new column starts ascending.
  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
    setCurrentPage(1)
  }
  function goToPage(page: number) { setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))) }

  function handleVideoCreated(video: ViralVideoItem) {
    setVideos((current) => [video, ...current])
    setAddingVideoId(video.id)
    setCurrentPage(1)
  }

  function closeAddModal() { setAddModalOpen(false); setAddingVideoId(null) }

  function handleViewAnalysis(video: ViralVideoItem) { closeAddModal(); setViewTarget(video) }

  async function handleRetry(video: ViralVideoItem) {
    setError(null); setNotice(null)
    try {
      const updated = await retryViralVideo(video.id)
      setVideos((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (retryError) {
      setError(getViralVideoErrorMessage(retryError))
    }
  }

  const visibleIds = paginatedVideos.map((video) => video.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "video",
    deleteOne: deleteViralVideo,
    deleteMany: bulkDeleteViralVideos,
    setItems: setVideos,
    clearSelection,
    setNotice,
    setError,
    formatError: getViralVideoErrorMessage,
  })

  const paginationFooter = {
    type: "pagination" as const,
    page: currentPage,
    pageSize,
    total: filteredVideos.length,
    totalPages,
    pageSizeOptions,
    onPageChange: goToPage,
    onPageSizeChange: changePageSize,
  }

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="viral-video-search"
        aria-label="Search videos"
        placeholder="Search videos..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <div className={dashboardToolbarButtonGroupClassName}>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(dashboardToolbarButtonGroupItemClassName, viewMode === "list" && dashboardToolbarButtonActiveClassName)}
          onClick={() => setViewMode("list")}
          aria-label="List view"
        >
          <ListIcon className="size-4" />
        </DashboardToolbarButton>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(dashboardToolbarButtonGroupItemClassName, viewMode === "gallery" && dashboardToolbarButtonActiveClassName)}
          onClick={() => setViewMode("gallery")}
          aria-label="Grid view"
        >
          <GridIcon className="size-4" />
        </DashboardToolbarButton>
      </div>
      {!creator ? (
        <DashboardToolbarButton type="button" onClick={() => setAddModalOpen(true)}>
          <PlusIcon className="size-4" />
          Add Video
        </DashboardToolbarButton>
      ) : null}
    </>
  )

  // Drill-down level renders the hub-style breadcrumb as the table title.
  const title = creator ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Link to="/admin/creators" className="text-muted-foreground hover:text-foreground">
        Creators
      </Link>
      <ChevronRightIcon className="size-3 text-muted-foreground" />
      <span className="truncate">{creator.display_name ?? creator.username}</span>
    </span>
  ) : (
    "Viral Archive"
  )

  const emptyText = loading
    ? "Loading videos…"
    : creator
      ? "No reels from this creator yet."
      : "No videos yet. Paste a TikTok or Instagram URL to analyze one."

  return (
    <div className="w-full pb-8">
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{notice}</div>
      ) : null}
      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {viewMode === "gallery" ? (
        <DashboardTable
          title={title}
          icon={<FlameIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={filteredVideos.length}
          controls={controls}
          content={
            <div className="px-5 pb-5">
              {loading || paginatedVideos.length === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <FlameIcon className="mx-auto mb-3 size-10" />
                    <p>{emptyText}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {paginatedVideos.map((video) => (
                    <ViralVideoGalleryCard
                      key={video.id}
                      video={video}
                      selected={selectedIds.has(video.id)}
                      onToggle={() => toggleSelected(video.id)}
                      onOpen={() => setViewTarget(video)}
                      onRetry={() => handleRetry(video)}
                      onDelete={() => setDeleteIds([video.id])}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={paginationFooter}
        />
      ) : (
        <DashboardTable
          title={title}
          icon={<FlameIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={filteredVideos.length}
          controls={controls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible videos"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton active={sortColumn === "video"} direction={sortDirection} onClick={() => toggleSort("video")}>
                    Video
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "platform"} direction={sortDirection} onClick={() => toggleSort("platform")}>
                    Platform
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "views"} direction={sortDirection} onClick={() => toggleSort("views")}>
                    Views
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "likes"} direction={sortDirection} onClick={() => toggleSort("likes")}>
                    Likes
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>
                    Status
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "added"} direction={sortDirection} onClick={() => toggleSort("added")}>
                    Added
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={loading || paginatedVideos.length === 0}
          emptyText={emptyText}
          emptyColSpan={8}
          footer={paginationFooter}
        >
          {paginatedVideos.map((video) => (
            <ViralVideoTableRow
              key={video.id}
              video={video}
              selected={selectedIds.has(video.id)}
              onToggle={() => toggleSelected(video.id)}
              onOpen={() => setViewTarget(video)}
              onRetry={() => handleRetry(video)}
              onDelete={() => setDeleteIds([video.id])}
            />
          ))}
        </DashboardTable>
      )}

      {!creator ? (
        <AddVideoModal
          open={addModalOpen}
          onOpenChange={(open) => !open && closeAddModal()}
          processingVideo={addingVideo}
          onVideoCreated={handleVideoCreated}
          onViewAnalysis={handleViewAnalysis}
        />
      ) : null}

      <ViralVideoModal
        video={viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      <Dialog open={!!deleteIds} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete {(deleteIds?.length ?? 0) === 1 ? "Video" : `${deleteIds?.length ?? 0} Videos`}?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes {(deleteIds?.length ?? 0) === 1 ? "the video" : "these videos"}, the analysis, and the downloaded footage.
              Templates and projects built from {(deleteIds?.length ?? 0) === 1 ? "it" : "them"} will lose that footage. This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={() => setDeleteIds(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ViralVideoGalleryCard({
  video,
  selected,
  onToggle,
  onOpen,
  onRetry,
  onDelete,
}: {
  video: ViralVideoItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const isReady = video.status === "ready"
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      <button
        type="button"
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
        onClick={isReady ? onOpen : undefined}
        aria-label={isReady ? `View ${video.title ?? video.source_url}` : undefined}
      >
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <FlameIcon className="size-8 text-muted-foreground" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
          {PLATFORM_LABELS[video.platform]}
        </span>
        {/* Creator chip — avatar + name + handle over the bottom of the thumb. */}
        <CreatorChip
          creator={video.creator}
          className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] bg-black/0"
        />
      </button>

      {/* Hover actions — top-right of preview (stay visible while selected) */}
      <div
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100",
          selected ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${video.title ?? video.source_url}`}
          />
        </div>
        {!isReady ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Retry">
            <RotateCcwIcon className="size-4" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete">
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      {/* Ready cards are just the thumbnail + creator chip; in-progress/error
          cards keep a status bar for feedback. */}
      {!isReady ? (
        <div className="bg-card p-3">
          <ViralVideoStatusBadge status={video.status} />
        </div>
      ) : null}
    </div>
  )
}

function ViralVideoTableRow({
  video,
  selected,
  onToggle,
  onOpen,
  onRetry,
  onDelete,
}: {
  video: ViralVideoItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const isReady = video.status === "ready"
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${video.title ?? video.source_url}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <div className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            {isReady ? (
              <button
                type="button"
                className="block max-w-full truncate text-left font-medium group-hover:underline"
                onClick={onOpen}
              >
                {video.title ?? video.source_url}
              </button>
            ) : (
              <span className="block max-w-full truncate font-medium">
                {video.title ?? video.source_url}
              </span>
            )}
            <div className="truncate text-xs text-muted-foreground" title={video.error ?? undefined}>
              {video.status === "error" && video.error ? video.error : (video.author ?? video.source_url)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{PLATFORM_LABELS[video.platform]}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatCount(video.stats?.views ?? null)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatCount(video.stats?.likes ?? null)}
      </TableCell>
      <TableCell column="meta">
        <ViralVideoStatusBadge status={video.status} />
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(video.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          {!isReady ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Retry processing">
              <RotateCcwIcon className="size-4" />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete video">
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ViralVideoStatusBadge({ status }: { status: ViralVideoItem["status"] }) {
  if (status === "downloading" || status === "analyzing") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2Icon className="size-3 animate-spin" />
        {status === "downloading" ? "Downloading" : "Analyzing"}
      </Badge>
    )
  }
  if (status === "error") return <Badge variant="destructive">Failed</Badge>
  return <Badge variant="secondary">Ready</Badge>
}

function AddVideoModal({
  open,
  onOpenChange,
  processingVideo,
  onVideoCreated,
  onViewAnalysis,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  processingVideo: ViralVideoItem | null
  onVideoCreated: (video: ViralVideoItem) => void
  onViewAnalysis: (video: ViralVideoItem) => void
}) {
  const [url, setUrl] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const prevOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !prevOpen.current) {
      setUrl("")
      setCreating(false)
      setError(null)
    }
    prevOpen.current = open
  }, [open])

  const isProcessing =
    processingVideo?.status === "downloading" || processingVideo?.status === "analyzing"
  const isDone = processingVideo?.status === "ready"
  const isFailed = processingVideo?.status === "error"
  const progressValue = progressForStatus(processingVideo?.status ?? null)
  const progressLabel = labelForStatus(processingVideo?.status ?? null)
  const isTracking = processingVideo !== null

  async function handleAnalyze() {
    setCreating(true)
    setError(null)
    try {
      const created = await createViralVideo(url.trim())
      onVideoCreated(created)
    } catch (createError) {
      setError(getViralVideoErrorMessage(createError))
      setCreating(false)
    }
  }

  const analyzeDisabled = creating || isTracking || !url.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="add-video-url">TikTok or Instagram URL</Label>
              <Input
                id="add-video-url"
                value={url}
                readOnly={isTracking}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.tiktok.com/@..."
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !analyzeDisabled) void handleAnalyze()
                }}
              />
            </div>

            {isTracking ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={isDone ? "font-medium text-emerald-600 dark:text-emerald-400" : isFailed ? "text-destructive" : "text-muted-foreground"}>
                    {isFailed ? (processingVideo?.error ?? "Analysis failed") : progressLabel}
                  </span>
                  {isDone ? (
                    <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : isProcessing ? (
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <Progress
                  value={isFailed ? 100 : progressValue}
                  className={isFailed ? "bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive" : undefined}
                />
              </div>
            ) : null}

            {isProcessing ? (
              <p className="text-xs text-muted-foreground">
                You can close this — analysis will continue in the background.
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isDone ? "Close" : "Cancel"}
          </Button>
          {isDone && processingVideo ? (
            <Button type="button" onClick={() => onViewAnalysis(processingVideo)}>
              View Analysis
            </Button>
          ) : (
            <Button type="button" disabled={analyzeDisabled} onClick={handleAnalyze}>
              {creating || isTracking ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {creating ? "Starting…" : "Analyze Video"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
