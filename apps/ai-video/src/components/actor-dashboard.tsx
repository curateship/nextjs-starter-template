import * as React from "react"
import {
  AlertCircleIcon,
  EditIcon,
  ImageIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarViewToggle,
} from "@/components/dashboard-toolbar"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MediaPicker } from "@/components/media-picker"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  ACTOR_MODELS,
  bulkDeleteActors,
  createActor,
  deleteActor,
  DEFAULT_ACTOR_MODEL,
  getActorErrorMessage,
  listActors,
  regenerateActor,
  updateActor,
  type ActorItem,
  type ActorModelId,
  type ActorStatus,
} from "@/lib/api/actors"
import type { MediaItem } from "@/lib/api/media"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type ViewMode = "gallery" | "list"
type StatusFilter = "all" | ActorStatus
type ActorSortColumn = "name" | "tags" | "status" | "created"
type ActorModalState =
  | { type: "create" }
  | { type: "edit"; actor: ActorItem }
  | null
type SubmitAction = "generate" | "save" | "regenerate"

const statusLabels: Record<ActorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
}

export function ActorDashboard() {
  const [actors, setActors] = React.useState<ActorItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [tagFilter, setTagFilter] = React.useState("all")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sortColumn, setSortColumn] = React.useState<ActorSortColumn>("created")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [modalState, setModalState] = React.useState<ActorModalState>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [submitAction, setSubmitAction] = React.useState<SubmitAction | null>(
    null
  )
  const [name, setName] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [status, setStatus] = React.useState<ActorStatus>("active")
  const [tags, setTags] = React.useState("")
  const [model, setModel] = React.useState<ActorModelId>(DEFAULT_ACTOR_MODEL)
  const [referenceMediaId, setReferenceMediaId] = React.useState<string | null>(
    null
  )
  const [referenceMediaUrl, setReferenceMediaUrl] = React.useState<
    string | null
  >(null)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listActors()
      .then((data) => {
        if (!active) return
        setActors(data.actors)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getActorErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const tagOptions = React.useMemo(
    () => Array.from(new Set(actors.flatMap((actor) => actor.tags))).sort(),
    [actors]
  )

  const filteredActors = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return actors.filter((actor) => {
      const matchesSearch =
        !query ||
        `${actor.name} ${actor.prompt} ${actor.tags.join(" ")}`
          .toLowerCase()
          .includes(query)
      const matchesStatus =
        statusFilter === "all" || actor.status === statusFilter
      const matchesTag = tagFilter === "all" || actor.tags.includes(tagFilter)
      return matchesSearch && matchesStatus && matchesTag
    }).sort((a, b) => {
      if (sortColumn === "tags") return a.tags.join(", ").localeCompare(b.tags.join(", ")) * direction
      if (sortColumn === "status") return statusLabels[a.status].localeCompare(statusLabels[b.status]) * direction
      if (sortColumn === "created") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
      return a.name.localeCompare(b.name) * direction
    })
  }, [actors, searchQuery, sortColumn, sortDirection, statusFilter, tagFilter])

  const totalPages = Math.ceil(filteredActors.length / pageSize)
  const paginatedActors = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredActors.slice(startIndex, startIndex + pageSize)
  }, [currentPage, filteredActors, pageSize])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, searchQuery, sortColumn, sortDirection, statusFilter, tagFilter])

  function toggleSort(column: ActorSortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  function openCreateModal() {
    setModalState({ type: "create" })
    setName("")
    setPrompt("")
    setStatus("active")
    setTags("")
    setModel(DEFAULT_ACTOR_MODEL)
    clearReferenceMedia()
    setModalError(null)
  }

  function openEditModal(actor: ActorItem) {
    setModalState({ type: "edit", actor })
    setName(actor.name)
    setPrompt(actor.prompt)
    setStatus(actor.status)
    setTags(actor.tags.join(", "))
    setModel(actor.model as ActorModelId)
    setReferenceMediaId(actor.reference_media_id)
    setReferenceMediaUrl(actor.reference_media_url)
    setModalError(null)
  }

  function closeModal() {
    setModalState(null)
    setPickerOpen(false)
    setSubmitAction(null)
    setModalError(null)
  }

  function clearReferenceMedia() {
    setReferenceMediaId(null)
    setReferenceMediaUrl(null)
  }

  function handleReferenceSelect(
    mediaUrl: string,
    _altText?: string,
    media?: MediaItem
  ) {
    if (!mediaUrl || !media) {
      clearReferenceMedia()
      return
    }

    setReferenceMediaId(media.id)
    setReferenceMediaUrl(media.url)
  }

  async function handleCreateActor() {
    setSubmitAction("generate")
    setModalError(null)
    try {
      const created = await createActor(getPayload())
      setActors((current) => [created, ...current])
      toast.success("Actor created.")
      closeModal()
    } catch (createError) {
      setModalError(getActorErrorMessage(createError))
    } finally {
      setSubmitAction(null)
    }
  }

  async function handleSaveActor() {
    if (modalState?.type !== "edit") return

    setSubmitAction("save")
    setModalError(null)
    try {
      const updated = await updateActor(modalState.actor.id, getPayload())
      replaceActor(updated)
      toast.success("Actor updated.")
      closeModal()
    } catch (saveError) {
      setModalError(getActorErrorMessage(saveError))
    } finally {
      setSubmitAction(null)
    }
  }

  async function handleRegenerateActor() {
    if (modalState?.type !== "edit") return

    setSubmitAction("regenerate")
    setModalError(null)
    try {
      const updated = await regenerateActor(modalState.actor.id, getPayload())
      replaceActor(updated)
      toast.success("Actor image regenerated.")
      closeModal()
    } catch (regenerateError) {
      setModalError(getActorErrorMessage(regenerateError))
    } finally {
      setSubmitAction(null)
    }
  }

  const visibleIds = paginatedActors.map((actor) => actor.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "actor",
    deleteOne: deleteActor,
    deleteMany: bulkDeleteActors,
    setItems: setActors,
    clearSelection,
    formatError: getActorErrorMessage,
  })

  function replaceActor(updated: ActorItem) {
    setActors((current) =>
      current.map((actor) => (actor.id === updated.id ? updated : actor))
    )
  }

  function getPayload() {
    return {
      name,
      prompt,
      status,
      tags,
      model,
      referenceMediaId,
    }
  }

  function goToPage(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const busy = submitAction !== null
  const primaryDisabled = busy || !name.trim() || !prompt.trim()
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
        name="actor-search"
        aria-label="Search actors"
        placeholder="Search actors..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Select
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as StatusFilter)}
      >
        <DashboardToolbarSelectTrigger
          aria-label="Filter actors by status"
          labels={["All Statuses", ...Object.values(statusLabels)]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      <Select value={tagFilter} onValueChange={setTagFilter}>
        <DashboardToolbarSelectTrigger
          aria-label="Filter actors by tag"
          labels={["All Tags", ...tagOptions]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tags</SelectItem>
          {tagOptions.map((tag) => (
            <SelectItem key={tag} value={tag}>
              {tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DashboardToolbarViewToggle viewMode={viewMode} onChange={setViewMode} />
      <DashboardToolbarButton type="button" onClick={openCreateModal}>
        <SparklesIcon className="size-4" />
        Create Actor
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      <DashboardNotices error={error} />

      {viewMode === "gallery" ? (
        <DashboardTable
          title="Actors"
          icon={
            <SparklesIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredActors.length}
          controls={controls}
          content={
            <div className="px-5 pt-3 pb-5">
              {loading || paginatedActors.length === 0 ? (
                <EmptyActors loading={loading} />
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {paginatedActors.map((actor) => (
                    <ActorGalleryItem
                      key={actor.id}
                      actor={actor}
                      selected={selectedIds.has(actor.id)}
                      onToggle={() => toggleSelected(actor.id)}
                      onEdit={() => openEditModal(actor)}
                      onDelete={() => setDeleteIds([actor.id])}
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
            total: filteredActors.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        />
      ) : (
        <DashboardTable
          title="Actors"
          icon={
            <SparklesIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredActors.length}
          controls={controls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible actors"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton active={sortColumn === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>
                    Actor
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "tags"} direction={sortDirection} onClick={() => toggleSort("tags")}>
                    Tags
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>
                    Status
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>
                    Date Added
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={loading || paginatedActors.length === 0}
          emptyText={loading ? "Loading actors..." : "No actors found."}
          emptyColSpan={6}
          footer={{
            type: "pagination",
            page: currentPage,
            pageSize,
            total: filteredActors.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        >
          {paginatedActors.map((actor) => (
            <ActorTableRow
              key={actor.id}
              actor={actor}
              selected={selectedIds.has(actor.id)}
              onToggle={() => toggleSelected(actor.id)}
              onEdit={() => openEditModal(actor)}
              onDelete={() => setDeleteIds([actor.id])}
            />
          ))}
        </DashboardTable>
      )}

      <Dialog
        open={!!modalState}
        onOpenChange={(open) => !open && closeModal()}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {modalState?.type === "edit" ? "Edit Actor" : "Create Actor"}
            </DialogTitle>
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

              {modalState?.type === "edit" ? (
                <ActorImagePreview actor={modalState.actor} />
              ) : null}

              <div className="grid gap-2">
                <Label>Name</Label>
                <Input
                  id="actor-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Actor name"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ActorStatus)}
                  >
                    <SelectTrigger id="actor-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>AI Model</Label>
                  <Select
                    value={model}
                    onValueChange={(value) => setModel(value as ActorModelId)}
                  >
                    <SelectTrigger id="actor-model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTOR_MODELS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Tags</Label>
                <Input
                  id="actor-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="male, female, fit"
                />
              </div>

              <div className="grid gap-2">
                <Label>Reference Image</Label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={cn(
                      "grid size-20 shrink-0 place-items-center overflow-hidden rounded-md",
                      referenceMediaUrl
                        ? "bg-background"
                        : "border border-dotted bg-muted/40"
                    )}
                    aria-label="Select reference image"
                  >
                    {referenceMediaUrl ? (
                      <img
                        src={referenceMediaUrl}
                        alt="Reference image"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="size-6 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      Optional image reference from the media library.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                      >
                        Select Image
                      </Button>
                      {referenceMediaUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearReferenceMedia}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Prompt</Label>
                <Textarea
                  id="actor-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the actor image to generate."
                  rows={5}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            {modalState?.type === "edit" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={primaryDisabled}
                  onClick={handleSaveActor}
                >
                  {submitAction === "save" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  {submitAction === "save" ? "Saving" : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  disabled={primaryDisabled}
                  onClick={handleRegenerateActor}
                >
                  {submitAction === "regenerate" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  {submitAction === "regenerate"
                    ? "Regenerating"
                    : "Regenerate Image"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={primaryDisabled}
                onClick={handleCreateActor}
              >
                {submitAction === "generate" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                {submitAction === "generate" ? "Generating" : "Generate Image"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={handleReferenceSelect}
        currentMediaUrl={referenceMediaUrl ?? undefined}
        showVideos={false}
      />

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Actor"
        description={(count) =>
          count === 1
            ? "This removes the actor and its generated image. This action cannot be undone."
            : "This removes these actors and their generated images. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ActorTableRow({
  actor,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  actor: ActorItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${actor.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="size-12 shrink-0 overflow-hidden rounded-md border bg-muted"
            onClick={onEdit}
            aria-label={`Edit ${actor.name}`}
          >
            <img
              src={actor.image_url}
              alt={actor.name}
              className="h-full w-full object-cover"
            />
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="truncate font-medium group-hover:underline"
              onClick={onEdit}
            >
              {actor.name}
            </button>
            <div className="max-w-[280px] truncate text-xs text-muted-foreground">
              {actor.prompt}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <ActorTags tags={actor.tags} />
      </TableCell>
      <TableCell column="meta">
        <ActorStatusBadge status={actor.status} />
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(actor.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label="Edit actor"
          >
            <EditIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete actor"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function ActorGalleryItem({
  actor,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  actor: ActorItem
  selected: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
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
        aria-label={`Edit ${actor.name}`}
      >
        <img
          src={actor.image_url}
          alt={actor.name}
          className="h-full w-full object-cover"
        />
        <span className="absolute top-2 left-2">
          <ActorStatusBadge status={actor.status} />
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
            aria-label={`Select ${actor.name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Edit actor"
        >
          <EditIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete actor"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 bg-card p-3">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          onClick={onEdit}
        >
          {actor.name}
        </button>
        <ActorTags tags={actor.tags} />
      </div>
    </div>
  )
}

function ActorImagePreview({ actor }: { actor: ActorItem }) {
  return (
    <div className="mx-auto grid h-[42vh] max-h-80 min-h-48 max-w-80 place-items-center overflow-hidden rounded-lg border bg-muted">
      <img
        src={actor.image_url}
        alt={actor.name}
        className="h-full w-full object-contain"
      />
    </div>
  )
}

function ActorStatusBadge({ status }: { status: ActorStatus }) {
  return (
    <Badge
      variant={status === "active" ? "secondary" : "outline"}
      className={
        status === "active"
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : undefined
      }
    >
      {statusLabels[status]}
    </Badge>
  )
}

function ActorTags({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return <span className="text-xs text-muted-foreground">No tags</span>
  }

  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
    </div>
  )
}

function EmptyActors({ loading }: { loading: boolean }) {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        {loading ? (
          <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
        ) : (
          <SparklesIcon className="mx-auto mb-3 size-10" />
        )}
        <p>{loading ? "Loading actors..." : "No actors found."}</p>
      </div>
    </div>
  )
}
