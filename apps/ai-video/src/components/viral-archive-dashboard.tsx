import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  EyeIcon,
  FlameIcon,
  GridIcon,
  HeartIcon,
  ListIcon,
  Loader2Icon,
  MessageCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CreatorChip } from "@/components/creator-chip"
import { StructureTagList } from "@/components/structure-tag-list"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
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

type ViewMode = "list" | "gallery" | "trend"

// Sortable columns in the list (table) view.
type SortColumn =
  | "video"
  | "creator"
  | "platform"
  | "trend_score"
  | "views_per_day"
  | "audience_lift"
  | "engagement_rate"
  | "freshness"
  | "added"

const POLL_INTERVAL_MS = 3000
const LIST_TITLE_WORD_LIMIT = 5
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
})
const ratioFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})
const viewModeButtonClassName = cn(
  dashboardToolbarButtonGroupItemClassName,
  "rounded-none"
)

function truncateWords(value: string, limit: number) {
  const words = value.trim().split(/\s+/)
  if (words.length <= limit) return value
  return `${words.slice(0, limit).join(" ")}...`
}

function creatorLabel(video: ViralVideoItem) {
  return (
    video.creator?.display_name?.trim() ||
    video.creator?.username ||
    video.author ||
    "—"
  )
}

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

function compareTrendRank(a: ViralVideoItem, b: ViralVideoItem) {
  const aScore = a.trend_score?.score
  const bScore = b.trend_score?.score
  if (aScore !== undefined && bScore !== undefined && aScore !== bScore) {
    return bScore - aScore
  }
  if (aScore !== undefined) return -1
  if (bScore !== undefined) return 1
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : percentFormatter.format(value)
}

function formatAudienceLift(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : `${ratioFormatter.format(value)}x`
}

function confidenceLabel(
  value: NonNullable<ViralVideoItem["trend_score"]>["confidence"]
) {
  if (value === "high") return "High"
  if (value === "medium") return "Med"
  return "Low"
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
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
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

  const matchedVideos = React.useMemo(() => {
    const scoped = creator
      ? videos.filter((v) => v.creator_id === creator.id)
      : videos
    const query = searchQuery.trim().toLowerCase()
    return query
      ? scoped.filter((v) =>
          `${v.title ?? ""} ${v.author ?? ""} ${v.source_url}`.toLowerCase().includes(query)
        )
      : scoped
  }, [videos, searchQuery, creator])

  const trendSortedVideos = React.useMemo(
    () => [...matchedVideos].sort(compareTrendRank),
    [matchedVideos]
  )

  const trendRanks = React.useMemo(() => {
    const ranks = new Map<string, number>()
    let rank = 1
    for (const video of trendSortedVideos) {
      if (!video.trend_score) continue
      ranks.set(video.id, rank)
      rank += 1
    }
    return ranks
  }, [trendSortedVideos])

  const filteredVideos = React.useMemo(() => {
    if (viewMode === "trend") return trendSortedVideos
    const direction = sortDirection === "asc" ? 1 : -1
    return [...matchedVideos].sort((a, b) => {
      if (sortColumn === "video")
        return (a.title ?? a.source_url).localeCompare(b.title ?? b.source_url) * direction
      if (sortColumn === "creator")
        return creatorLabel(a).localeCompare(creatorLabel(b)) * direction
      if (sortColumn === "platform")
        return PLATFORM_LABELS[a.platform].localeCompare(PLATFORM_LABELS[b.platform]) * direction
      // Missing counts (null) sort below any real number.
      if (sortColumn === "trend_score")
        return ((a.trend_score?.score ?? -1) - (b.trend_score?.score ?? -1)) * direction
      if (sortColumn === "views_per_day")
        return ((a.trend_score?.views_per_day ?? -1) - (b.trend_score?.views_per_day ?? -1)) * direction
      if (sortColumn === "audience_lift")
        return ((a.trend_score?.audience_lift ?? -1) - (b.trend_score?.audience_lift ?? -1)) * direction
      if (sortColumn === "engagement_rate")
        return ((a.trend_score?.engagement_rate ?? -1) - (b.trend_score?.engagement_rate ?? -1)) * direction
      if (sortColumn === "freshness")
        return ((a.trend_score?.component_scores.freshness ?? -1) - (b.trend_score?.component_scores.freshness ?? -1)) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [matchedVideos, sortColumn, sortDirection, trendSortedVideos, viewMode])

  const totalPages = Math.ceil(filteredVideos.length / pageSize)
  const paginatedVideos = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredVideos.slice(start, start + pageSize)
  }, [currentPage, filteredVideos, pageSize])

  function updateSearch(value: string) { setSearchQuery(value); setCurrentPage(1) }
  function changePageSize(size: number) { setPageSize(size); setCurrentPage(1) }
  function changeViewMode(mode: ViewMode) { setViewMode(mode); setCurrentPage(1) }
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
    try {
      const updated = await retryViralVideo(video.id)
      setVideos((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (retryError) {
      toast.error(getViralVideoErrorMessage(retryError))
    }
  }

  const visibleIds = paginatedVideos.map((video) => video.id)
  const {
    selectedIds,
    toggleSelected,
    selectAllState,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "video",
    deleteOne: deleteViralVideo,
    deleteMany: bulkDeleteViralVideos,
    setItems: setVideos,
    clearSelection,
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
          className={cn(viewModeButtonClassName, viewMode === "list" && dashboardToolbarButtonActiveClassName)}
          onClick={() => changeViewMode("list")}
          aria-label="List view"
        >
          <ListIcon className="size-4" />
        </DashboardToolbarButton>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(viewModeButtonClassName, viewMode === "gallery" && dashboardToolbarButtonActiveClassName)}
          onClick={() => changeViewMode("gallery")}
          aria-label="Grid view"
        >
          <GridIcon className="size-4" />
        </DashboardToolbarButton>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(viewModeButtonClassName, viewMode === "trend" && dashboardToolbarButtonActiveClassName)}
          onClick={() => changeViewMode("trend")}
          aria-label="Trend Score view"
        >
          <FlameIcon className="size-4" />
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

  const emptyText = creator
    ? "No reels from this creator yet."
    : "No videos yet. Paste a TikTok or Instagram URL to analyze one."

  return (
    <div className="w-full pb-8">
      <DashboardNotices error={error} />

      {viewMode === "gallery" || viewMode === "trend" ? (
        <DashboardTable
          title={title}
          icon={<FlameIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={filteredVideos.length}
          controls={controls}
          content={
            <div className="px-5 pb-5">
              {loading ? null : paginatedVideos.length === 0 ? (
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
                      rank={viewMode === "trend" ? trendRanks.get(video.id) : undefined}
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
                    checked={selectAllState}
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
                  <TableSortButton active={sortColumn === "creator"} direction={sortDirection} onClick={() => toggleSort("creator")}>
                    Creators
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "platform"} direction={sortDirection} onClick={() => toggleSort("platform")}>
                    Platform
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "trend_score"} direction={sortDirection} onClick={() => toggleSort("trend_score")}>
                    Trend
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "views_per_day"} direction={sortDirection} onClick={() => toggleSort("views_per_day")}>
                    Views/day
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "audience_lift"} direction={sortDirection} onClick={() => toggleSort("audience_lift")}>
                    Lift
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "engagement_rate"} direction={sortDirection} onClick={() => toggleSort("engagement_rate")}>
                    Engage
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "freshness"} direction={sortDirection} onClick={() => toggleSort("freshness")}>
                    Fresh
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
          isEmpty={!loading && paginatedVideos.length === 0}
          emptyText={emptyText}
          emptyColSpan={11}
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

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Video"
        description={(count) =>
          count === 1
            ? "This removes the video, the analysis, and the downloaded footage. Templates and projects built from it will lose that footage. This action cannot be undone."
            : "This removes these videos, the analysis, and the downloaded footage. Templates and projects built from them will lose that footage. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ViralVideoGalleryCard({
  video,
  rank,
  selected,
  onToggle,
  onOpen,
  onRetry,
  onDelete,
}: {
  video: ViralVideoItem
  rank: number | undefined
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const isReady = video.status === "ready"
  const title = video.title ?? video.source_url
  const displayTitle = truncateWords(title, LIST_TITLE_WORD_LIMIT)
  const trendScore = video.trend_score
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
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-4rem)] flex-wrap items-center gap-1">
          <ViralVideoStatChip
            label="Views"
            value={video.stats?.views}
            icon={<EyeIcon className="size-3" aria-hidden="true" />}
          />
          <ViralVideoStatChip
            label="Likes"
            value={video.stats?.likes}
            icon={<HeartIcon className="size-3" aria-hidden="true" />}
          />
          <ViralVideoStatChip
            label="Comments"
            value={video.stats?.comments}
            icon={<MessageCircleIcon className="size-3" aria-hidden="true" />}
          />
        </div>
        {/* Creator chip — avatar + name + handle over the bottom of the thumb. */}
        <CreatorChip
          creator={video.creator}
          tone="overlay"
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

      <div className="bg-card p-3">
        {isReady ? (
          <button
            type="button"
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
            onClick={onOpen}
            title={title}
          >
            {displayTitle}
          </button>
        ) : (
          <span className="block max-w-full truncate text-sm font-medium" title={title}>
            {displayTitle}
          </span>
        )}
        <StructureTagList tags={video.structure_tags} className="mt-1 mb-3" />
        {isReady && trendScore ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  {rank ? `#${rank} Trend Score` : "Trend Score"}
                </div>
                <div className="text-xl font-semibold leading-none">
                  {trendScore.score}
                </div>
              </div>
              <Badge variant="outline">
                {confidenceLabel(trendScore.confidence)}
              </Badge>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Views/day</span>
                <span className="font-medium">
                  {formatCount(trendScore.views_per_day)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Lift</span>
                <span className="font-medium">
                  {formatAudienceLift(trendScore.audience_lift)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Engage</span>
                <span className="font-medium">
                  {formatPercent(trendScore.engagement_rate)}
                </span>
              </div>
            </div>
            <TrendMissingChips score={trendScore} />
          </>
        ) : !isReady ? (
          <ViralVideoStatusBadge status={video.status} />
        ) : null}
      </div>
    </div>
  )
}

function ViralVideoStatChip({
  label,
  value,
  icon,
}: {
  label: string
  value: number | null | undefined
  icon: React.ReactNode
}) {
  if (value === null || value === undefined) return null

  const formattedValue = formatCount(value)

  return (
    <span
      className="inline-flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"
      aria-label={`${label}: ${formattedValue}`}
      title={`${label}: ${formattedValue}`}
    >
      {icon}
      {formattedValue}
    </span>
  )
}

function TrendMissingChips({
  score,
  limit = 2,
}: {
  score: NonNullable<ViralVideoItem["trend_score"]>
  limit?: number
}) {
  const reasons = score.missing_inputs.slice(0, limit)
  if (reasons.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {reason}
        </span>
      ))}
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
  const title = video.title ?? video.source_url
  const displayTitle = truncateWords(title, LIST_TITLE_WORD_LIMIT)
  const creatorName = creatorLabel(video)
  const trendScore = video.trend_score

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
                title={title}
              >
                {displayTitle}
              </button>
            ) : (
              <span className="block max-w-full truncate font-medium" title={title}>
                {displayTitle}
              </span>
            )}
            {video.status === "error" && video.error ? (
              <div className="truncate text-xs text-muted-foreground" title={video.error}>
                {video.error}
              </div>
            ) : null}
            <StructureTagList
              tags={video.structure_tags}
              className="mt-1 max-w-80"
              maxVisibleTags={video.structure_tags.length}
            />
          </div>
        </div>
      </TableCell>
      <TableCell column="meta" title={creatorName}>
        {video.creator ? (
          <CreatorChip
            creator={video.creator}
            className="max-w-48 px-0 py-0 backdrop-blur-none"
          />
        ) : (
          <span className="block max-w-48 truncate">{creatorName}</span>
        )}
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{PLATFORM_LABELS[video.platform]}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {trendScore ? (
          <div>
            <span className="font-medium text-foreground">{trendScore.score}</span>{" "}
            {confidenceLabel(trendScore.confidence)}
            <TrendMissingChips score={trendScore} limit={1} />
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatCount(trendScore?.views_per_day ?? null)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatAudienceLift(trendScore?.audience_lift)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatPercent(trendScore?.engagement_rate)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {trendScore?.freshness_label ?? "—"}
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
        <DialogHeader>
          <DialogTitle>Add Video</DialogTitle>
          <DialogDescription>
            Paste a TikTok or Instagram URL to download and analyze it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="add-video-url">
                  TikTok or Instagram URL
                </FieldLabel>
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
                    <span className={isDone ? "font-medium text-foreground" : isFailed ? "text-destructive" : "text-muted-foreground"}>
                      {isFailed ? (processingVideo?.error ?? "Analysis failed") : progressLabel}
                    </span>
                    {isDone ? (
                      <CheckCircle2Icon className="size-4 text-foreground" />
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
            </CardContent>
          </Card>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>
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
