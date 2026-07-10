import * as React from "react"
import {
  AlertCircleIcon,
  CopyIcon,
  DownloadIcon,
  FileVideoIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  bulkDeleteExports,
  deleteExport,
  generateExportDescription,
  getExportErrorMessage,
  listExports,
  updateExport,
  type ExportItem,
} from "@/lib/api/exports"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import {
  EXPORT_CAPTION_MAX_LENGTH,
  EXPORT_TITLE_MAX_LENGTH,
} from "@/lib/export-constraints"
import { useBulkDelete } from "@/lib/use-bulk-delete"
import { useSelection } from "@/lib/use-selection"

type ExportSortColumn = "name" | "size" | "exported"
type DescriptionStatus = "idle" | "generating" | "ready" | "error"

const fileSizeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
})

function formatFileSize(bytes: number | null) {
  if (bytes === null || bytes === undefined) return "Unknown"
  if (bytes < 1024) return `${bytes} B`

  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${fileSizeFormatter.format(value)} ${units[unitIndex]}`
}

function previewUrl(item: ExportItem) {
  return `/api/v1/projects/${item.project_id}/render?mode=view&t=${encodeURIComponent(
    item.exported_at
  )}`
}

function downloadUrl(item: ExportItem, title = item.name) {
  return `/api/v1/projects/${item.project_id}/render?filename=${encodeURIComponent(
    title.trim() || item.name
  )}`
}

function useFetchedObjectUrl(sourceUrl: string | null) {
  const [state, setState] = React.useState<{
    sourceUrl: string | null
    objectUrl: string | null
    error: string | null
  }>({ sourceUrl: null, objectUrl: null, error: null })
  const objectUrlRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!sourceUrl) return

    let active = true
    const controller = new AbortController()

    fetch(sourceUrl, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Media fetch failed (${response.status})`)
        }
        return response.blob()
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        if (objectUrlRef.current && objectUrlRef.current !== objectUrl) {
          URL.revokeObjectURL(objectUrlRef.current)
        }
        objectUrlRef.current = objectUrl
        setState({ sourceUrl, objectUrl, error: null })
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return
        setState({
          sourceUrl,
          objectUrl: null,
          error: error instanceof Error ? error.message : "Media fetch failed",
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [sourceUrl])

  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  const loading = Boolean(sourceUrl && state.sourceUrl !== sourceUrl)
  return {
    objectUrl: loading ? null : state.objectUrl,
    loading,
    error: loading ? null : state.error,
  }
}

export function ExportDashboard() {
  const [exports, setExports] = React.useState<ExportItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [sortColumn, setSortColumn] =
    React.useState<ExportSortColumn>("exported")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [selectedExport, setSelectedExport] = React.useState<ExportItem | null>(
    null
  )

  React.useEffect(() => {
    let active = true

    listExports()
      .then((data) => {
        if (!active) return
        setExports(data.exports)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getExportErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredExports = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return exports
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortColumn === "size") {
          return ((a.file_size ?? 0) - (b.file_size ?? 0)) * direction
        }
        if (sortColumn === "exported") {
          return (
            (new Date(a.exported_at).getTime() -
              new Date(b.exported_at).getTime()) *
            direction
          )
        }
        return a.name.localeCompare(b.name) * direction
      })
  }, [exports, searchQuery, sortColumn, sortDirection])

  const totalPages = Math.ceil(filteredExports.length / pageSize)
  const paginatedExports = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredExports.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredExports, pageSize])

  const visibleIds = paginatedExports.map((item) => item.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "export",
    deleteOne: deleteSingleExport,
    deleteMany: deleteMultipleExports,
    setItems: setExports,
    clearSelection,
    setNotice,
    setError,
    formatError: getExportErrorMessage,
  })

  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function changePageSize(size: number) {
    setPageSize(size)
    setCurrentPage(1)
  }

  function toggleSort(column: ExportSortColumn) {
    setCurrentPage(1)
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection(column === "exported" ? "desc" : "asc")
  }

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  function handleExportSaved(updated: ExportItem) {
    setExports((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
    setSelectedExport(updated)
    setNotice("Export saved.")
  }

  async function deleteSingleExport(projectId: string) {
    const result = await deleteExport(projectId)
    if (selectedExport?.id === projectId) {
      setSelectedExport(null)
    }
    return result
  }

  async function deleteMultipleExports(projectIds: string[]) {
    const result = await bulkDeleteExports(projectIds)
    if (selectedExport && projectIds.includes(selectedExport.id)) {
      setSelectedExport(null)
    }
    return result
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
        name="export-search"
        aria-label="Search exports"
        placeholder="Search exports..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
    </>
  )

  const emptyText = loading
    ? "Loading exports..."
    : exports.length === 0
      ? "No exports yet"
      : "No exports found."

  return (
    <div className="w-full pb-8">
      <DashboardNotices notice={notice} error={error} />

      <DashboardTable
        title="Export"
        icon={
          <DownloadIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={filteredExports.length}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select visible exports"
                />
              </TableHead>
              <TableHead column="preview">Thumbnail</TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "name"}
                  direction={sortDirection}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "size"}
                  direction={sortDirection}
                  onClick={() => toggleSort("size")}
                >
                  File Size
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "exported"}
                  direction={sortDirection}
                  onClick={() => toggleSort("exported")}
                >
                  Exported
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={loading || paginatedExports.length === 0}
        emptyText={emptyText}
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredExports.length,
          totalPages,
          pageSizeOptions,
          onPageChange: goToPage,
          onPageSizeChange: changePageSize,
        }}
      >
        {paginatedExports.map((item) => (
          <ExportTableRow
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onToggle={() => toggleSelected(item.id)}
            onOpen={() => setSelectedExport(item)}
            onDelete={() => setDeleteIds([item.id])}
          />
        ))}
      </DashboardTable>

      <ProjectExportPreviewDialog
        item={selectedExport}
        onSaved={handleExportSaved}
        onOpenChange={(open) => !open && setSelectedExport(null)}
      />

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Export"
        description={(count) =>
          count === 1
            ? "This removes this saved export. The source projects and timelines are kept. This action cannot be undone."
            : "This removes these saved exports. The source projects and timelines are kept. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ExportTableRow({
  item,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  item: ExportItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter") {
      onOpen()
    }
    if (event.key === " ") {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <TableRow
      className="group cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
      tabIndex={0}
      role="button"
      data-state={selected ? "selected" : undefined}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <TableCell column="select">
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Select ${item.name}`}
          />
        </div>
      </TableCell>
      <TableCell column="preview">
        <ExportThumbnail item={item} />
      </TableCell>
      <TableCell column="main">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:underline">
            {item.name}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">{formatFileSize(item.file_size)}</TableCell>
      <TableCell column="mutedMeta">
        {dateFormatter.format(new Date(item.exported_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex items-center justify-start gap-1">
          <DashboardToolbarButton
            type="button"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            <PlayIcon className="size-4" />
            Preview
          </DashboardToolbarButton>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 sm:size-9"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`Delete ${item.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ExportThumbnail({ item }: { item: ExportItem }) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null)
  const failed = failedUrl === item.thumbnail_url
  const thumbnail = useFetchedObjectUrl(item.thumbnail_url)

  if (!item.thumbnail_url || failed || thumbnail.error) {
    return (
      <div className="grid aspect-video w-32 place-items-center rounded-md border bg-muted">
        <ImageIcon className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (thumbnail.loading || !thumbnail.objectUrl) {
    return (
      <div className="aspect-video w-32 animate-pulse rounded-md border bg-muted" />
    )
  }

  return (
    <img
      src={thumbnail.objectUrl}
      alt=""
      className="aspect-video w-32 rounded-md border bg-muted object-cover"
      onError={() => setFailedUrl(item.thumbnail_url)}
    />
  )
}

export function ProjectExportPreviewDialog({
  item,
  onSaved,
  onOpenChange,
}: {
  item: ExportItem | null
  onSaved: (item: ExportItem) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      {item ? (
        <ExportPreviewDialogContent
          key={item.project_id}
          item={item}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  )
}

function ExportPreviewDialogContent({
  item,
  onSaved,
}: {
  item: ExportItem
  onSaved: (item: ExportItem) => void
}) {
  const [title, setTitle] = React.useState(item.name)
  const [caption, setCaption] = React.useState(item.caption)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [descriptionStatus, setDescriptionStatus] =
    React.useState<DescriptionStatus>("idle")
  const [descriptionError, setDescriptionError] = React.useState<string | null>(
    null
  )
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const preview = useFetchedObjectUrl(previewUrl(item))

  function updateTitle(value: string) {
    setTitle(value)
    setSaved(false)
    setSaveError(null)
  }

  function updateCaption(value: string) {
    setCaption(value)
    setCopied(false)
    setSaved(false)
    setSaveError(null)
  }

  async function handleGenerateDescription() {
    setDescriptionStatus("generating")
    setDescriptionError(null)
    setCopied(false)
    setSaved(false)
    try {
      const result = await generateExportDescription(item.project_id)
      setCaption(result.description)
      setDescriptionStatus("ready")
    } catch (generateError) {
      setDescriptionError(getExportErrorMessage(generateError))
      setDescriptionStatus("error")
    }
  }

  async function handleSave() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setSaveError("Export title is required")
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateExport(item.project_id, {
        title: trimmedTitle,
        caption: caption.trim(),
      })
      setTitle(updated.name)
      setCaption(updated.caption)
      setDescriptionStatus("idle")
      setSaved(true)
      onSaved(updated)
    } catch (saveError) {
      setSaveError(getExportErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyDescription() {
    if (!caption.trim()) return
    await navigator.clipboard.writeText(caption.trim()).catch(() => undefined)
    setCopied(true)
  }

  const generating = descriptionStatus === "generating"
  const trimmedTitle = title.trim()
  const trimmedCaption = caption.trim()
  const dirty =
    trimmedTitle !== item.name || trimmedCaption !== (item.caption ?? "")
  const saveDisabled = saving || !trimmedTitle || !dirty

  return (
    <DialogContent variant="admin" className="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Project Export</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-5">
          <div className="overflow-hidden rounded-lg border bg-black">
            {preview.loading || !preview.objectUrl ? (
              <div className="grid aspect-video max-h-[56vh] w-full place-items-center bg-black text-sm text-white/70">
                <span className="inline-flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin" />
                  Loading preview
                </span>
              </div>
            ) : (
              <video
                key={item.project_id}
                src={preview.objectUrl}
                controls
                playsInline
                className="aspect-video max-h-[56vh] w-full bg-black object-contain"
                onError={() =>
                  setPreviewError(
                    "Preview failed to load. The export file may be missing or storage is unavailable."
                  )
                }
                onLoadedData={() => setPreviewError(null)}
              />
            )}
          </div>

          {preview.error || previewError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {preview.error
                  ? "Preview failed to load. The export file may be missing or storage is unavailable."
                  : previewError}
              </span>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="export-title">Title</Label>
            <Input
              id="export-title"
              value={title}
              maxLength={EXPORT_TITLE_MAX_LENGTH}
              onChange={(event) => updateTitle(event.target.value)}
              placeholder="Export title"
            />
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Size: </span>
              <span className="font-medium">
                {formatFileSize(item.file_size)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Exported: </span>
              <span className="font-medium">
                {dateFormatter.format(new Date(item.exported_at))}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-caption">Caption</Label>
            <Textarea
              id="export-caption"
              value={caption}
              rows={5}
              maxLength={EXPORT_CAPTION_MAX_LENGTH}
              onChange={(event) => updateCaption(event.target.value)}
              placeholder="No caption saved."
              className="resize-none bg-background"
            />
            {descriptionStatus === "ready" ? (
              <p role="status" className="text-xs text-muted-foreground">
                Caption ready. Save to keep it.
              </p>
            ) : null}
            {descriptionError ? (
              <p role="alert" className="text-sm text-destructive">
                {descriptionError}
              </p>
            ) : null}
            {saveError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : null}
            {saved ? (
              <p role="status" className="text-xs text-muted-foreground">
                Saved.
              </p>
            ) : null}
          </div>
        </div>
      </DialogBody>
      <DialogFooter
        variant="plain"
        className="items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch"
      >
        <Button
          type="button"
          variant="outline"
          disabled={generating}
          onClick={handleGenerateDescription}
        >
          {generating ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {generating
            ? "Generating..."
            : caption
              ? "Regenerate"
              : "Generate Caption"}
        </Button>
        <div className="flex justify-end gap-2 max-sm:w-full max-sm:flex-col">
          <Button
            type="button"
            variant="outline"
            disabled={saveDisabled}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            {saving ? "Saving" : "Save"}
          </Button>
          {caption.trim() ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyDescription}
            >
              <CopyIcon className="size-4" />
              {copied ? "Copied" : "Copy Caption"}
            </Button>
          ) : null}
          <Button asChild>
            <a href={downloadUrl(item, title)}>
              <FileVideoIcon className="size-4" />
              Download
            </a>
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}
