import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  EditIcon,
  GridIcon,
  LayoutTemplateIcon,
  ListIcon,
  Loader2Icon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react"

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
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import { ViralVideoModal } from "@/components/viral-video-modal"
import {
  bulkDeleteTemplates,
  createProjectFromTemplate,
  deleteTemplate,
  getTemplateErrorMessage,
  listTemplates,
  renameTemplate,
  type TemplateItem,
} from "@/lib/api/video-templates"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"

type ViewMode = "gallery" | "list"
type TemplateSortColumn = "name" | "slots" | "created"

// Template length for list rows / gallery tiles, as m:ss.
function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

// Templates dashboard at /admin/templates: templates are created from the
// Viral Archive; "Use" copies one into a fresh project and opens the editor.
export function TemplatesDashboard() {
  const navigate = useNavigate()
  const [templates, setTemplates] = React.useState<TemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sortColumn, setSortColumn] =
    React.useState<TemplateSortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [renameTarget, setRenameTarget] = React.useState<TemplateItem | null>(
    null
  )
  // Ids queued for deletion (single row or the whole selection).
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")
  // Template currently being copied into a project (shows its spinner).
  const [usingId, setUsingId] = React.useState<string | null>(null)
  // Source viral video id + template id being previewed in the analysis modal.
  const [viewVideoId, setViewVideoId] = React.useState<string | null>(null)
  const [viewTemplateId, setViewTemplateId] = React.useState<string | null>(null)

  // One-time load; `loading` starts true so no state resets are needed here.
  React.useEffect(() => {
    let active = true

    listTemplates()
      .then((data) => {
        if (!active) return
        setTemplates(data.templates)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getTemplateErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredTemplates = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return templates
      .filter(
        (template) => !query || template.name.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        if (sortColumn === "slots")
          return (a.slot_count - b.slot_count) * direction
        if (sortColumn === "created")
          return (
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()) *
            direction
          )
        return a.name.localeCompare(b.name) * direction
      })
  }, [templates, searchQuery, sortColumn, sortDirection])

  const totalPages = Math.ceil(filteredTemplates.length / pageSize)
  const paginatedTemplates = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredTemplates.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredTemplates, pageSize])

  // Filter/sort/page-size changes restart pagination from the first page.
  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function changePageSize(size: number) {
    setPageSize(size)
    setCurrentPage(1)
  }

  function toggleSort(column: TemplateSortColumn) {
    setCurrentPage(1)
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  // "Use": copy the template into a new project and open it in the editor.
  async function handleUseTemplate(template: TemplateItem) {
    setUsingId(template.id)
    setError(null)
    setNotice(null)
    try {
      const { projectId } = await createProjectFromTemplate(template.id)
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId },
      })
    } catch (useError) {
      setError(getTemplateErrorMessage(useError))
      setUsingId(null)
    }
  }

  function openRenameModal(template: TemplateItem) {
    setRenameTarget(template)
    setName(template.name)
    setModalError(null)
    setError(null)
    setNotice(null)
  }

  function closeRenameModal() {
    setRenameTarget(null)
    setSubmitting(false)
    setModalError(null)
  }

  async function handleRenameTemplate() {
    if (!renameTarget) return

    setSubmitting(true)
    setModalError(null)
    try {
      const updated = await renameTemplate(renameTarget.id, name)
      // The rename response doesn't join the source video, so keep the
      // thumbnail the list already has instead of blanking it.
      setTemplates((current) =>
        current.map((template) =>
          template.id === updated.id
            ? { ...updated, thumbnail_url: template.thumbnail_url }
            : template
        )
      )
      setNotice("Template renamed.")
      closeRenameModal()
    } catch (renameError) {
      setModalError(getTemplateErrorMessage(renameError))
      setSubmitting(false)
    }
  }

  function toggleSelected(templateId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const visibleIds = paginatedTemplates.map((template) => template.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleVisibleSelected() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return
    const ids = deleteIds

    setDeleting(true)
    setError(null)
    setNotice(null)
    try {
      if (ids.length === 1) {
        await deleteTemplate(ids[0])
        setNotice("Template deleted.")
      } else {
        const result = await bulkDeleteTemplates(ids)
        setNotice(
          `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "template" : "templates"}.`
        )
      }
      const removed = new Set(ids)
      setTemplates((current) =>
        current.filter((template) => !removed.has(template.id))
      )
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
    } catch (deleteError) {
      setError(getTemplateErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const renameDisabled = submitting || !name.trim()
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
        name="template-search"
        aria-label="Search templates"
        placeholder="Search templates..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <div className={dashboardToolbarButtonGroupClassName}>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(
            dashboardToolbarButtonGroupItemClassName,
            viewMode === "list" && dashboardToolbarButtonActiveClassName
          )}
          onClick={() => setViewMode("list")}
          aria-label="List view"
        >
          <ListIcon className="size-4" />
        </DashboardToolbarButton>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className={cn(
            dashboardToolbarButtonGroupItemClassName,
            viewMode === "gallery" && dashboardToolbarButtonActiveClassName
          )}
          onClick={() => setViewMode("gallery")}
          aria-label="Grid view"
        >
          <GridIcon className="size-4" />
        </DashboardToolbarButton>
      </div>
    </>
  )

  const paginationFooter = {
    type: "pagination" as const,
    page: currentPage,
    pageSize,
    total: filteredTemplates.length,
    totalPages,
    pageSizeOptions,
    onPageChange: goToPage,
    onPageSizeChange: changePageSize,
  }

  return (
    <div className="w-full pb-8">
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {viewMode === "gallery" ? (
        <DashboardTable
          title="Templates"
          icon={
            <LayoutTemplateIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredTemplates.length}
          controls={controls}
          content={
            <div className="px-5 pt-3 pb-5">
              {loading || paginatedTemplates.length === 0 ? (
                <EmptyTemplates loading={loading} />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {paginatedTemplates.map((template) => (
                    <TemplateGalleryItem
                      key={template.id}
                      template={template}
                      using={usingId === template.id}
                      selected={selectedIds.has(template.id)}
                      onToggle={() => toggleSelected(template.id)}
                      onOpen={() => { setViewVideoId(template.source_viral_video_id); setViewTemplateId(template.id) }}
                      onUse={() => handleUseTemplate(template)}
                      onRename={() => openRenameModal(template)}
                      onDelete={() => setDeleteIds([template.id])}
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
          title="Templates"
          icon={
            <LayoutTemplateIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredTemplates.length}
          controls={controls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible templates"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton
                    active={sortColumn === "name"}
                    direction={sortDirection}
                    onClick={() => toggleSort("name")}
                  >
                    Template
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "slots"}
                    direction={sortDirection}
                    onClick={() => toggleSort("slots")}
                  >
                    Slots
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sortColumn === "created"}
                    direction={sortDirection}
                    onClick={() => toggleSort("created")}
                  >
                    Created
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={loading || paginatedTemplates.length === 0}
          emptyText={
            loading
              ? "Loading templates..."
              : "No templates yet. Create one from a video in the Viral Archive."
          }
          emptyColSpan={5}
          footer={paginationFooter}
        >
          {paginatedTemplates.map((template) => (
            <TemplateTableRow
              key={template.id}
              template={template}
              using={usingId === template.id}
              selected={selectedIds.has(template.id)}
              onToggle={() => toggleSelected(template.id)}
              onOpen={() => { setViewVideoId(template.source_viral_video_id); setViewTemplateId(template.id) }}
              onUse={() => handleUseTemplate(template)}
              onRename={() => openRenameModal(template)}
              onDelete={() => setDeleteIds([template.id])}
            />
          ))}
        </DashboardTable>
      )}

      <ViralVideoModal
        videoId={viewVideoId}
        templateId={viewTemplateId}
        onOpenChange={(open) => { if (!open) { setViewVideoId(null); setViewTemplateId(null) } }}
      />

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && closeRenameModal()}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Rename Template</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {modalError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="template-rename">Name</Label>
                <Input
                  id="template-rename"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Template name"
                  onKeyDown={(event) => {
                    // Enter submits the single-field form.
                    if (event.key === "Enter" && !renameDisabled) {
                      void handleRenameTemplate()
                    }
                  }}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeRenameModal}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={renameDisabled}
              onClick={handleRenameTemplate}
            >
              {submitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {submitting ? "Saving" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteIds}
        onOpenChange={(open) => !open && setDeleteIds(null)}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {(deleteIds?.length ?? 0) === 1
                ? "Template"
                : `${deleteIds?.length ?? 0} Templates`}
              ?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes{" "}
              {(deleteIds?.length ?? 0) === 1
                ? "the template"
                : "these templates"}
              . Projects already created from{" "}
              {(deleteIds?.length ?? 0) === 1 ? "it" : "them"} are not
              affected. This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteIds(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateTableRow({
  template,
  using,
  selected,
  onToggle,
  onOpen,
  onUse,
  onRename,
  onDelete,
}: {
  template: TemplateItem
  using: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onUse: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const canOpen = !!template.source_viral_video_id
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${template.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <div className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
            {template.thumbnail_url ? (
              <img
                src={template.thumbnail_url}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="grid size-full place-items-center">
                <LayoutTemplateIcon className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            {canOpen ? (
              <button
                type="button"
                className="block max-w-full truncate text-left font-medium group-hover:underline"
                onClick={onOpen}
              >
                {template.name}
              </button>
            ) : (
              <div className="truncate font-medium">{template.name}</div>
            )}
            <div className="text-xs text-muted-foreground">
              {formatDuration(template.duration_ms)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{template.slot_count}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(template.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={using}
            onClick={onUse}
          >
            {using ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            Use
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRename}
            aria-label="Rename template"
          >
            <EditIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete template"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function TemplateGalleryItem({
  template,
  using,
  selected,
  onToggle,
  onOpen,
  onUse,
  onRename,
  onDelete,
}: {
  template: TemplateItem
  using: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onUse: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      {/* Preview — clicking opens the analysis modal, same as the title */}
      <button
        type="button"
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
        onClick={template.source_viral_video_id ? onOpen : undefined}
        aria-label={template.source_viral_video_id ? `View ${template.name}` : undefined}
      >
        {template.thumbnail_url ? (
          <img src={template.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <LayoutTemplateIcon className="size-8 text-muted-foreground" />
          </div>
        )}
        {/* Duration badge bottom-left */}
        <span className="absolute bottom-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
          {formatDuration(template.duration_ms)}
        </span>
        {/* Slot count badge bottom-right */}
        <span className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
          {template.slot_count} slots
        </span>
      </button>

      {/* Hover actions — top-right (stay visible while selected) */}
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
            aria-label={`Select ${template.name}`}
          />
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRename} aria-label="Rename template">
          <EditIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete template">
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="bg-card p-3">
        {template.source_viral_video_id ? (
          <button
            type="button"
            className="block w-full truncate text-left text-sm font-medium hover:underline"
            onClick={onOpen}
          >
            {template.name}
          </button>
        ) : (
          <div className="truncate text-sm font-medium">{template.name}</div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {dateFormatter.format(new Date(template.created_at))}
          </p>
          <Button type="button" size="sm" variant="outline" disabled={using} onClick={onUse}>
            {using ? <Loader2Icon className="size-3 animate-spin" /> : <PlayIcon className="size-3" />}
            Use
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyTemplates({ loading }: { loading: boolean }) {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        {loading ? (
          <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
        ) : (
          <LayoutTemplateIcon className="mx-auto mb-3 size-10" />
        )}
        <p>
          {loading
            ? "Loading templates..."
            : "No templates yet. Create one from a video in the Viral Archive."}
        </p>
      </div>
    </div>
  )
}
