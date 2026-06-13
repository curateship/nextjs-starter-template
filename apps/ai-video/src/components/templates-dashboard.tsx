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
  PlusIcon,
  SparklesIcon,
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
  createBlankTemplate,
  createProjectFromTemplate,
  deleteTemplate,
  getTemplateErrorMessage,
  listTemplates,
  renameTemplate,
  type TemplateItem,
} from "@/lib/api/video-templates"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

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
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")
  // "Use template" naming dialog: the template being used + the typed project
  // name, plus its own in-flight/error state (creation happens from the modal).
  const [useTarget, setUseTarget] = React.useState<TemplateItem | null>(null)
  const [useName, setUseName] = React.useState("")
  const [useError, setUseError] = React.useState<string | null>(null)
  const [useSubmitting, setUseSubmitting] = React.useState(false)
  // "Create Template" naming dialog: a blank template is created (and opened in
  // the editor) only after the user confirms a name.
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [createSubmitting, setCreateSubmitting] = React.useState(false)
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

  // "Use" opens a naming dialog (prefilled with the template name); the project
  // isn't created until the user confirms a name.
  function openUseModal(template: TemplateItem) {
    setUseTarget(template)
    setUseName(template.name)
    setUseError(null)
    setError(null)
    setNotice(null)
  }

  function closeUseModal() {
    setUseTarget(null)
    setUseSubmitting(false)
    setUseError(null)
  }

  // Create the project from the template under the typed name, then open it.
  async function handleConfirmUse() {
    if (!useTarget) return
    setUseSubmitting(true)
    setUseError(null)
    try {
      const { projectId } = await createProjectFromTemplate(
        useTarget.id,
        useName
      )
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId },
      })
    } catch (createError) {
      setUseError(getTemplateErrorMessage(createError))
      setUseSubmitting(false)
    }
  }

  // "Edit Template": open the template itself in the editor (edits flow into
  // every future "Use"); distinct from Rename, which only changes the name.
  function handleEditTemplate(template: TemplateItem) {
    void navigate({
      to: "/admin/video-editor/template/$templateId",
      params: { templateId: template.id },
    })
  }

  // "New Template" opens a naming dialog; the blank template isn't created
  // until the user confirms a name.
  function openCreateModal() {
    setCreateOpen(true)
    setCreateName("")
    setCreateError(null)
    setError(null)
    setNotice(null)
  }

  function closeCreateModal() {
    setCreateOpen(false)
    setCreateSubmitting(false)
    setCreateError(null)
  }

  // Create a blank template under the typed name, then open it in the editor
  // to build from scratch.
  async function handleConfirmCreate() {
    setCreateSubmitting(true)
    setCreateError(null)
    try {
      const created = await createBlankTemplate(createName)
      void navigate({
        to: "/admin/video-editor/template/$templateId",
        params: { templateId: created.id },
      })
    } catch (createErr) {
      setCreateError(getTemplateErrorMessage(createErr))
      setCreateSubmitting(false)
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
      // thumbnail and creator chip the list already has instead of blanking them.
      setTemplates((current) =>
        current.map((template) =>
          template.id === updated.id
            ? {
                ...updated,
                thumbnail_url: template.thumbnail_url,
                creator: template.creator,
              }
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

  const visibleIds = paginatedTemplates.map((template) => template.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "template",
    deleteOne: deleteTemplate,
    deleteMany: bulkDeleteTemplates,
    setItems: setTemplates,
    clearSelection,
    setNotice,
    setError,
    formatError: getTemplateErrorMessage,
  })

  const renameDisabled = submitting || !name.trim()
  const useDisabled = useSubmitting || !useName.trim()
  const createDisabled = createSubmitting || !createName.trim()
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
      <DashboardToolbarButton type="button" onClick={openCreateModal}>
        <PlusIcon className="size-4" />
        New Template
      </DashboardToolbarButton>
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
                      selected={selectedIds.has(template.id)}
                      onToggle={() => toggleSelected(template.id)}
                      onOpen={() => { setViewVideoId(template.source_viral_video_id); setViewTemplateId(template.id) }}
                      onUse={() => openUseModal(template)}
                      onEdit={() => handleEditTemplate(template)}
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
              : "No templates yet. Click \"New Template\" to start one, or build one from a video in the Viral Archive."
          }
          emptyColSpan={5}
          footer={paginationFooter}
        >
          {paginatedTemplates.map((template) => (
            <TemplateTableRow
              key={template.id}
              template={template}
              selected={selectedIds.has(template.id)}
              onToggle={() => toggleSelected(template.id)}
              onOpen={() => { setViewVideoId(template.source_viral_video_id); setViewTemplateId(template.id) }}
              onUse={() => openUseModal(template)}
              onEdit={() => handleEditTemplate(template)}
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

      {/* "Use" naming dialog — name the new project before it's created. */}
      <Dialog
        open={!!useTarget}
        onOpenChange={(open) => !open && closeUseModal()}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Name Your Project</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {useError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{useError}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="use-project-name">Project name</Label>
                <Input
                  id="use-project-name"
                  autoFocus
                  value={useName}
                  onChange={(event) => setUseName(event.target.value)}
                  placeholder="My video"
                  onKeyDown={(event) => {
                    // Enter submits the single-field form.
                    if (event.key === "Enter" && !useDisabled) {
                      void handleConfirmUse()
                    }
                  }}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeUseModal}>
              Cancel
            </Button>
            <Button type="button" disabled={useDisabled} onClick={handleConfirmUse}>
              {useSubmitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {useSubmitting ? "Creating" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "New Template" naming dialog — name the blank template before it opens
          in the editor to be built from scratch. */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => !open && closeCreateModal()}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {createError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="create-template-name">Name</Label>
                <Input
                  id="create-template-name"
                  autoFocus
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="Template name"
                  onKeyDown={(event) => {
                    // Enter submits the single-field form.
                    if (event.key === "Enter" && !createDisabled) {
                      void handleConfirmCreate()
                    }
                  }}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createDisabled}
              onClick={handleConfirmCreate}
            >
              {createSubmitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              {createSubmitting ? "Creating" : "Create Template"}
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
              onClick={confirmDelete}
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
  selected,
  onToggle,
  onOpen,
  onUse,
  onEdit,
  onRename,
  onDelete,
}: {
  template: TemplateItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onUse: () => void
  onEdit: () => void
  onRename: () => void
  onDelete: () => void
}) {
  // The source reel's AI analysis is only available when the template was
  // built from one.
  const hasAnalysis = !!template.source_viral_video_id
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
          {/* Thumbnail + name both open the template editor. */}
          <button
            type="button"
            className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded-md border bg-muted"
            onClick={onEdit}
            aria-label={`Edit ${template.name}`}
          >
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
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-full truncate text-left font-medium group-hover:underline"
              onClick={onEdit}
            >
              {template.name}
            </button>
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
          <Button type="button" size="sm" variant="outline" onClick={onUse}>
            <PlayIcon className="size-4" />
            Use
          </Button>
          {hasAnalysis ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpen}
              aria-label="View AI analysis"
            >
              <SparklesIcon className="size-4" />
            </Button>
          ) : null}
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
  selected,
  onToggle,
  onOpen,
  onUse,
  onEdit,
  onRename,
  onDelete,
}: {
  template: TemplateItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onUse: () => void
  onEdit: () => void
  onRename: () => void
  onDelete: () => void
}) {
  // The source reel's AI analysis is only available when the template was
  // built from one.
  const hasAnalysis = !!template.source_viral_video_id
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted",
        selected && "border-destructive ring-2 ring-destructive/25"
      )}
    >
      {/* Preview — clicking opens the template editor (same as the title). */}
      <button
        type="button"
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted"
        onClick={onEdit}
        aria-label={`Edit ${template.name}`}
      >
        {template.thumbnail_url ? (
          <img src={template.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <LayoutTemplateIcon className="size-8 text-muted-foreground" />
          </div>
        )}
        {/* Bottom bar: creator chip on the left, duration + slot count on the
            right. The chip truncates so it never crowds the badges. */}
        <div className="absolute inset-x-2 bottom-2 flex items-end gap-2">
          <CreatorChip creator={template.creator} className="min-w-0 bg-black/15" />
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
              {formatDuration(template.duration_ms)}
            </span>
            <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
              {template.slot_count} slots
            </span>
          </span>
        </div>
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
        <div className="flex items-center justify-between gap-2">
          {/* Title opens the template editor (same as the thumbnail). */}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
            onClick={onEdit}
          >
            {template.name}
          </button>
          {/* View the source reel's AI analysis (only when there's a source). */}
          {hasAnalysis ? (
            <Button type="button" size="icon-sm" variant="outline" className="shrink-0" onClick={onOpen} aria-label="View AI analysis">
              <SparklesIcon className="size-3" />
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onUse}>
            <PlayIcon className="size-3" />
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
            : "No templates yet. Click \"New Template\" to start one, or build one from a video in the Viral Archive."}
        </p>
      </div>
    </div>
  )
}
