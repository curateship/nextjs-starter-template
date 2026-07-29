import * as React from "react"
import {
  SettingsIcon,
  FolderIcon,
  FolderPlusIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarViewToggle,
} from "@/components/dashboard-toolbar"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MediaCollectionsDialog } from "@/components/media-collections-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
} from "@/components/ui/table"
import {
  bulkDeleteMedia,
  deleteMedia,
  getMediaErrorMessage,
  listMedia,
  updateMedia,
  uploadMedia,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
  type MediaSortBy,
  type MediaSortDirection,
  type MediaSource,
} from "@/lib/api/media"
import {
  addMediaToCollection,
  getMediaCollectionErrorMessage,
  listMediaCollections,
  setMediaCollections,
  type MediaCollection,
} from "@/lib/api/media-collections"
import {
  getProjectErrorMessage,
  listProjects,
  type ProjectItem,
} from "@/lib/api/video-projects"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/ai-video"
import { cn } from "@/lib/utils"
import { useShellRuntime } from "@/components/shell-runtime"
import { dateFormatter } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

const imageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]
const videoTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]
const audioTypes = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
]
const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

export type MediaTabId = "all" | "images" | "videos"

type ViewMode = "list" | "gallery"
type MediaTypeFilter = "all" | MediaFileType | "svg"
type ProxyFilter = "all" | "ready"
type SourceFilter = "all" | MediaSource
type ProjectFilter = "all" | "unassigned" | string
type CollectionFilter = "all" | "uncollected" | string

const sourceLabels: Record<MediaSource, string> = {
  upload: "Uploads",
  generated: "Generated",
  template: "Template",
  viral: "Viral",
}

const sortableMediaColumns: {
  by: MediaSortBy
  label: string
  column: "main" | "meta"
  className?: string
}[] = [
  { by: "original_name", label: "File", column: "main" },
  { by: "file_type", label: "Type", column: "meta" },
  {
    by: "file_size",
    label: "Size",
    column: "meta",
    className: "hidden md:table-cell",
  },
  {
    by: "created_at",
    label: "Added",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

export function MediaLibraryPage({ activeTab }: { activeTab: MediaTabId }) {
  const { config } = useShellRuntime()
  const [data, setData] = React.useState<MediaListResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [mediaTypeFilter, setMediaTypeFilter] = React.useState<MediaTypeFilter>(
    () => activeTabToFileType(activeTab) ?? "all"
  )
  const [proxyFilter, setProxyFilter] = React.useState<ProxyFilter>("all")
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>("all")
  const [projectFilter, setProjectFilter] = React.useState<ProjectFilter>("all")
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [projectError, setProjectError] = React.useState<string | null>(null)
  const [collectionFilter, setCollectionFilter] =
    React.useState<CollectionFilter>("all")
  const [collections, setCollections] = React.useState<MediaCollection[]>([])
  const [collectionsOpen, setCollectionsOpen] = React.useState(false)
  const [assigningTo, setAssigningTo] = React.useState<string | null>(null)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sortBy, setSortBy] = React.useState<MediaSortBy>("created_at")
  const [sortDirection, setSortDirection] =
    React.useState<MediaSortDirection>("desc")
  const [uploading, setUploading] = React.useState(false)
  const [editingMedia, setEditingMedia] = React.useState<MediaItem | null>(null)
  const [editAltText, setEditAltText] = React.useState("")
  const [editCollectionIds, setEditCollectionIds] = React.useState<Set<string>>(
    new Set()
  )
  const [savingEdit, setSavingEdit] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const loadRequestIdRef = React.useRef(0)

  React.useEffect(() => {
    setMediaTypeFilter(activeTabToFileType(activeTab) ?? "all")
    setCurrentPage(1)
  }, [activeTab])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setCurrentPage(1)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  React.useEffect(() => {
    let active = true
    listProjects()
      .then((response) => {
        if (!active) return
        setProjects(response.projects)
        setProjectError(null)
      })
      .catch((loadError) => {
        if (active) setProjectError(getProjectErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  const loadCollections = React.useCallback(async () => {
    const next = await listMediaCollections()
    setCollections(next)
    return next
  }, [])

  React.useEffect(() => {
    loadCollections().catch((loadError) =>
      toast.error(getMediaCollectionErrorMessage(loadError))
    )
  }, [loadCollections])

  const fileTypes = React.useMemo<MediaFileType[] | undefined>(
    () =>
      mediaTypeFilter === "all" || mediaTypeFilter === "svg"
        ? undefined
        : [mediaTypeFilter],
    [mediaTypeFilter]
  )
  const mimeType = mediaTypeFilter === "svg" ? "image/svg+xml" : undefined
  const proxyStatus = proxyFilter === "ready" ? "ready" : undefined
  const source = sourceFilter === "all" ? undefined : sourceFilter
  const projectId =
    projectFilter === "all"
      ? undefined
      : projectFilter === "unassigned"
        ? null
        : projectFilter
  const projectNames = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  )
  const collectionId =
    collectionFilter === "all"
      ? undefined
      : collectionFilter === "uncollected"
        ? null
        : collectionFilter
  const collectionNames = React.useMemo(
    () => new Map(collections.map((item) => [item.id, item.name])),
    [collections]
  )

  const loadCurrentPage = React.useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    setError(null)
    try {
      const response = await listMedia({
        page: currentPage,
        pageSize,
        collectionId,
        fileTypes,
        mimeType,
        projectId,
        proxyStatus,
        search: debouncedSearch || undefined,
        source,
        sortBy,
        sortDirection,
      })
      if (loadRequestIdRef.current !== requestId) return
      setData(response)
    } catch (loadError) {
      if (loadRequestIdRef.current !== requestId) return
      setError(getMediaErrorMessage(loadError))
    }
  }, [
    collectionId,
    currentPage,
    debouncedSearch,
    fileTypes,
    mimeType,
    pageSize,
    projectId,
    proxyStatus,
    source,
    sortBy,
    sortDirection,
  ])

  React.useEffect(() => {
    loadCurrentPage()
  }, [loadCurrentPage])

  const visibleMedia = data?.media ?? []
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    proxyFilter !== "all" ||
    sourceFilter !== "all" ||
    projectFilter !== "all" ||
    collectionFilter !== "all" ||
    mediaTypeFilter !== "all"
  const emptyText = data
    ? hasActiveFilters
      ? "No matches."
      : "No media yet."
    : ""

  const visibleIds = visibleMedia.map((item) => item.id)
  const {
    selectedIds,
    toggleSelected,
    selectAllState,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  // Server-paginated: reload the page after delete instead of local-filtering.
  // The API returns `deleted_count`, so adapt it to the hook's `deletedCount`.
  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "media item",
    deleteOne: deleteMedia,
    deleteMany: async (ids) => {
      const result = await bulkDeleteMedia(ids)
      return { deletedCount: result.deleted_count }
    },
    reload: loadCurrentPage,
    clearSelection,
    formatError: getMediaErrorMessage,
  })

  function handleSort(by: MediaSortBy) {
    setSortDirection((current) =>
      sortBy === by
        ? current === "asc"
          ? "desc"
          : "asc"
        : by === "created_at" || by === "file_size"
          ? "desc"
          : "asc"
    )
    setSortBy(by)
    setCurrentPage(1)
  }

  async function handleUploadSelect(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [...imageTypes, ...videoTypes, ...audioTypes]
    if (!allowedTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Only images, SVGs, videos, and audio are allowed."
      )
      event.target.value = ""
      return
    }

    const maxSize = config.mediaUploadMaxMb * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(
        `File size too large. Maximum size is ${config.mediaUploadMaxMb}MB.`
      )
      event.target.value = ""
      return
    }

    setUploading(true)
    try {
      await uploadMedia(file)
      toast.success("Media uploaded.")
      await loadCurrentPage()
    } catch (uploadError) {
      toast.error(getMediaErrorMessage(uploadError))
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  function handleEdit(media: MediaItem) {
    setEditingMedia(media)
    setEditAltText(media.alt_text ?? "")
    setEditCollectionIds(new Set(media.collection_ids))
  }

  async function handleSaveEdit() {
    if (!editingMedia) return

    setSavingEdit(true)
    try {
      const wanted = Array.from(editCollectionIds)
      const changed =
        wanted.length !== editingMedia.collection_ids.length ||
        wanted.some((id) => !editingMedia.collection_ids.includes(id))
      if (changed) {
        await setMediaCollections(editingMedia.id, wanted)
      }
      await updateMedia(editingMedia.id, editAltText)
      // Membership changes can move the item out of the active filter, so
      // refetch the page rather than patching the row in place.
      await Promise.all([loadCurrentPage(), loadCollections()])
      setEditingMedia(null)
      toast.success("Media updated.")
    } catch (saveError) {
      toast.error(getMediaErrorMessage(saveError))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleAssignToCollection(collection: MediaCollection) {
    const mediaIds = Array.from(selectedIds)
    if (!mediaIds.length) return

    setAssigningTo(collection.id)
    try {
      const { added_count } = await addMediaToCollection(
        collection.id,
        mediaIds
      )
      await Promise.all([loadCurrentPage(), loadCollections()])
      clearSelection()
      // Re-adding items that were already members is a no-op, so say what
      // actually changed instead of implying every selected item moved.
      toast.success(
        added_count === 0
          ? `Already in “${collection.name}”.`
          : `Added ${added_count} to “${collection.name}”.`
      )
    } catch (assignError) {
      toast.error(getMediaCollectionErrorMessage(assignError))
    } finally {
      setAssigningTo(null)
    }
  }

  const mediaControls = (
    <>
      {selectedIds.size > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={assigningTo !== null}
            >
              {assigningTo ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <FolderPlusIcon className="size-4" />
              )}
              Add to collection ({selectedIds.size})
            </DashboardToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Add to</DropdownMenuLabel>
            {collections.length === 0 ? (
              <DropdownMenuItem disabled>No collections yet</DropdownMenuItem>
            ) : (
              collections.map((collection) => (
                <DropdownMenuItem
                  key={collection.id}
                  onSelect={() => void handleAssignToCollection(collection)}
                >
                  {collection.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCollectionsOpen(true)}>
              <FolderIcon className="size-4" />
              Manage collections
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
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
        name="media-search"
        aria-label="Search media"
        placeholder="Search media..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Select
        value={mediaTypeFilter}
        onValueChange={(value) => {
          setMediaTypeFilter(value as MediaTypeFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger
          aria-label="Media type filter"
          labels={["All", "Images", "Videos", "Audio", "SVG"]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="image">Images</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="audio">Audio</SelectItem>
          <SelectItem value="svg">SVG</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={proxyFilter}
        onValueChange={(value) => {
          setProxyFilter(value as ProxyFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Proxy status filter">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any proxy status</SelectItem>
          <SelectItem value="ready">Proxied videos</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sourceFilter}
        onValueChange={(value) => {
          setSourceFilter(value as SourceFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Source filter">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          <SelectItem value="upload">Uploads</SelectItem>
          <SelectItem value="generated">Generated</SelectItem>
          <SelectItem value="template">Template</SelectItem>
          <SelectItem value="viral">Viral</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={projectFilter}
        onValueChange={(value) => {
          setProjectFilter(value as ProjectFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Project filter">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={collectionFilter}
        onValueChange={(value) => {
          setCollectionFilter(value as CollectionFilter)
          setCurrentPage(1)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Collection filter">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All collections</SelectItem>
          <SelectItem value="uncollected">Uncollected</SelectItem>
          {collections.map((collection) => (
            <SelectItem key={collection.id} value={collection.id}>
              {collection.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DashboardToolbarViewToggle viewMode={viewMode} onChange={setViewMode} />
      <DashboardToolbarButton
        type="button"
        variant="outline"
        onClick={() => setCollectionsOpen(true)}
      >
        <FolderIcon className="size-4" />
        Collections
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <UploadIcon className="size-4" />
        )}
        {uploading ? "Uploading" : "Upload Media"}
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={[...imageTypes, ...videoTypes, ...audioTypes].join(",")}
        onChange={handleUploadSelect}
      />

      <DashboardNotices error={error ?? projectError} />

      {viewMode === "gallery" ? (
        <DashboardTable
          title={getTabTitle(activeTab)}
          icon={
            <ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={data?.total ?? 0}
          controls={mediaControls}
          content={
            <div className="px-5 pb-5">
              {data === null ? null : visibleMedia.length === 0 ? (
                <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <ImageIcon className="mx-auto mb-3 size-10" />
                    <p>{emptyText}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {visibleMedia.map((item) => (
                    <GalleryItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onEdit={() => handleEdit(item)}
                      onDelete={() => setDeleteIds([item.id])}
                      onToggle={() => toggleSelected(item.id)}
                      projectNames={projectNames}
                      collectionNames={collectionNames}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={{
            type: "pagination",
            page: currentPage,
            pageSize,
            total: data?.total ?? 0,
            totalPages: data?.total_pages ?? 0,
            pageSizeOptions,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setCurrentPage(1)
            },
          }}
        />
      ) : (
        <DashboardTable
          title={getTabTitle(activeTab)}
          icon={
            <ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={data?.total ?? 0}
          controls={mediaControls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible media"
                  />
                </TableHead>
                {sortableMediaColumns.map((column) => (
                  <TableHead
                    key={column.by}
                    column={column.column}
                    className={column.className}
                    aria-sort={getAriaSort(sortBy, sortDirection, column.by)}
                  >
                    <TableSortButton
                      active={sortBy === column.by}
                      direction={sortDirection}
                      onClick={() => handleSort(column.by)}
                    >
                      {column.label}
                    </TableSortButton>
                  </TableHead>
                ))}
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={data !== null && visibleMedia.length === 0}
          emptyText={emptyText}
          emptyColSpan={6}
          footer={{
            type: "pagination",
            page: currentPage,
            pageSize,
            total: data?.total ?? 0,
            totalPages: data?.total_pages ?? 0,
            pageSizeOptions,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setCurrentPage(1)
            },
          }}
        >
          {visibleMedia.map((item) => (
            <MediaTableRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => toggleSelected(item.id)}
              onEdit={() => handleEdit(item)}
              onDelete={() => setDeleteIds([item.id])}
              projectNames={projectNames}
              collectionNames={collectionNames}
            />
          ))}
        </DashboardTable>
      )}

      <Dialog
        open={!!editingMedia}
        onOpenChange={(open) => !open && setEditingMedia(null)}
      >
        <DialogContent
          variant="admin"
          className="max-h-[85vh] w-[710px] max-w-[calc(100vw-2rem)] sm:max-w-[710px]"
        >
          <DialogHeader>
            <DialogTitle>
              {editingMedia ? getEditTitle(editingMedia) : "Edit Media"}
            </DialogTitle>
            <DialogDescription>
              Update this file's details.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editingMedia ? (
              <>
                {editingMedia.file_type === "video" ? (
                  <video
                    src={editingMedia.proxy_url ?? editingMedia.url}
                    className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                    controls
                    muted
                  />
                ) : editingMedia.file_type === "audio" ? (
                  <div className="grid gap-3 rounded-lg border bg-muted p-6">
                    <MusicIcon className="mx-auto size-10 text-muted-foreground" />
                    <audio src={editingMedia.url} controls className="w-full" />
                  </div>
                ) : (
                  <img
                    src={editingMedia.url}
                    alt={editingMedia.alt_text ?? editingMedia.original_name}
                    className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                  />
                )}
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="media-alt-text">
                        {editingMedia.file_type === "image"
                          ? "Alt text"
                          : "Description"}
                      </FieldLabel>
                      <Input
                        id="media-alt-text"
                        value={editAltText}
                        onChange={(event) => setEditAltText(event.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Collections</CardTitle>
                    <CardDescription>
                      A file can sit in as many collections as you like.
                    </CardDescription>
                  </CardHeader>
                  {/* One row per collection, stacked at gap-2 — the shared
                      checkbox-row shape, not a field grid. */}
                  <CardContent className="grid gap-2">
                    {collections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No collections yet. Create one from the Collections
                        button in the toolbar.
                      </p>
                    ) : (
                      collections.map((collection) => (
                        <div
                          key={collection.id}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            id={`media-collection-${collection.id}`}
                            checked={editCollectionIds.has(collection.id)}
                            onCheckedChange={() =>
                              setEditCollectionIds((current) => {
                                const next = new Set(current)
                                if (next.has(collection.id)) {
                                  next.delete(collection.id)
                                } else {
                                  next.add(collection.id)
                                }
                                return next
                              })
                            }
                          />
                          <Label
                            htmlFor={`media-collection-${collection.id}`}
                            className="font-normal"
                          >
                            {collection.name}
                          </Label>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain" className="justify-between">
            <div>
              {editingMedia ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={savingEdit}
                  onClick={() => {
                    setDeleteIds([editingMedia.id])
                    setEditingMedia(null)
                  }}
                >
                  Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingEdit}
                onClick={() => setEditingMedia(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
              >
                {savingEdit ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {savingEdit ? "Saving" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaCollectionsDialog
        open={collectionsOpen}
        onOpenChange={setCollectionsOpen}
        collections={collections}
        onChanged={async () => {
          const next = await loadCollections()
          // Deleting the collection the library is filtered by would leave the
          // list querying an id that no longer exists, so fall back to "All"
          // and let the filter effect refetch. Otherwise refresh in place —
          // renames change the chips on visible rows.
          const filterStillExists =
            collectionFilter === "all" ||
            collectionFilter === "uncollected" ||
            next.some((item) => item.id === collectionFilter)
          if (filterStillExists) {
            await loadCurrentPage()
          } else {
            setCollectionFilter("all")
          }
        }}
      />

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Item"
        description={() =>
          "This removes the selected media from the library. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function getAriaSort(
  sortBy: MediaSortBy,
  sortDirection: MediaSortDirection,
  by: MediaSortBy
) {
  if (sortBy !== by) return "none"
  return sortDirection === "asc" ? "ascending" : "descending"
}

function MediaTableRow({
  item,
  selected,
  onToggle,
  onEdit,
  onDelete,
  projectNames,
  collectionNames,
}: {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  projectNames: Map<string, string>
  collectionNames: Map<string, string>
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${item.original_name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <MediaPreview
            item={item}
            className="size-12 shrink-0 rounded-md border bg-muted"
          />
          <div className="min-w-0">
            <button
              type="button"
              className="truncate font-medium text-left hover:underline"
              onClick={onEdit}
            >
              {item.original_name}
            </button>
            {item.alt_text ? (
              <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                {item.alt_text}
              </div>
            ) : null}
            <MediaMetaChips
              item={item}
              projectNames={projectNames}
              collectionNames={collectionNames}
            />
          </div>
        </div>
      </TableCell>
      <TableCell column="mutedMeta" className="capitalize">
        {item.file_type}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden md:table-cell">
        {formatFileSize(item.file_size)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label="Edit media"
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete media"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function GalleryItem({
  item,
  selected,
  onToggle,
  onEdit,
  onDelete,
  projectNames,
  collectionNames,
}: {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  projectNames: Map<string, string>
  collectionNames: Map<string, string>
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      <button
        type="button"
        className="relative block aspect-3/4 w-full bg-muted"
        onClick={onEdit}
      >
        <MediaPreview item={item} className="h-full w-full" />
        <div className="absolute top-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
          <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px] capitalize">
            {item.file_type}
          </span>
          <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
            {sourceLabels[item.source]}
          </span>
          <span className="max-w-full truncate rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
            {projectLabel(item, projectNames)}
          </span>
          {collectionLabels(item, collectionNames).map((name) => (
            <span
              key={name}
              className="flex max-w-full items-center gap-1 truncate rounded bg-background/90 px-1.5 py-0.5 text-[10px]"
            >
              <FolderIcon className="size-3 shrink-0" />
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      </button>
      <div className="absolute right-2 bottom-2 flex shrink-0 gap-1 rounded-md bg-background/90 p-1 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${item.original_name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Edit media"
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete media"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function MediaMetaChips({
  item,
  projectNames,
  collectionNames,
}: {
  item: MediaItem
  projectNames: Map<string, string>
  collectionNames: Map<string, string>
}) {
  return (
    <div className="mt-1 flex max-w-[320px] flex-wrap gap-1">
      <Badge variant="secondary" className="h-5 rounded-md text-[10px]">
        {sourceLabels[item.source]}
      </Badge>
      <Badge
        variant="outline"
        className="h-5 max-w-full rounded-md text-[10px]"
      >
        <span className="truncate">{projectLabel(item, projectNames)}</span>
      </Badge>
      {collectionLabels(item, collectionNames).map((name) => (
        <Badge
          key={name}
          variant="outline"
          className="h-5 max-w-full rounded-md text-[10px]"
        >
          <FolderIcon className="size-3" />
          <span className="truncate">{name}</span>
        </Badge>
      ))}
    </div>
  )
}

// Collection names for an item, in the same order the filter lists them.
// Unknown ids are dropped: the list can be a moment behind a delete.
function collectionLabels(
  item: MediaItem,
  collectionNames: Map<string, string>
) {
  return item.collection_ids
    .map((id) => collectionNames.get(id))
    .filter((name): name is string => !!name)
    .sort((a, b) => a.localeCompare(b))
}

function MediaPreview({
  item,
  className,
}: {
  item: MediaItem
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden",
        className
      )}
    >
      {item.file_type === "video" ? (
        <>
          <video
            src={item.proxy_url ?? item.url}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
          />
          <VideoIcon className="absolute top-2 left-2 size-4 text-white drop-shadow" />
        </>
      ) : item.file_type === "audio" ? (
        <MusicIcon className="size-8 text-muted-foreground" />
      ) : (
        <img
          src={item.url}
          alt={item.alt_text ?? item.original_name}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  )
}

function projectLabel(item: MediaItem, projectNames: Map<string, string>) {
  return item.project_id
    ? (projectNames.get(item.project_id) ?? "Project")
    : "Unassigned"
}

function getEditTitle(item: MediaItem) {
  if (item.file_type === "video") return "Edit Video"
  if (item.file_type === "audio") return "Edit Audio"
  return "Edit Image"
}

function activeTabToFileType(tab: MediaTabId): MediaFileType | undefined {
  if (tab === "images") return "image"
  if (tab === "videos") return "video"
  return undefined
}

function getTabTitle(tab: MediaTabId) {
  if (tab === "images") return "Images"
  if (tab === "videos") return "Videos"
  return "All Media"
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}
