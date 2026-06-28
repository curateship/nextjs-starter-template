import * as React from "react"
import {
  AlertCircleIcon,
  CopyIcon,
  GridIcon,
  ImageIcon,
  ImagePlusIcon,
  ListIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  StarIcon,
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
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
  bulkDeleteFirstFrames,
  createFirstFrame,
  DEFAULT_ACTOR_MODEL,
  deleteFirstFrame,
  FIRST_FRAME_ASPECT_RATIOS,
  getFirstFrameErrorMessage,
  listFirstFrames,
  regenerateFirstFrame,
  updateFirstFrame,
  updateFirstFramePinned,
  type ActorModelId,
  type FirstFrameAspectRatio,
  type FirstFrameItem,
  type FirstFrameReferenceSource,
} from "@/lib/api/first-frames"
import {
  getActorErrorMessage,
  listActors,
  type ActorItem,
} from "@/lib/api/actors"
import type { MediaItem } from "@/lib/api/media"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useBulkDelete } from "@/lib/use-bulk-delete"
import { useSelection } from "@/lib/use-selection"

type ViewMode = "gallery" | "list"
type FirstFrameSortColumn = "name" | "actor" | "aspect" | "created"
type FirstFrameSubmitAction = "generate" | "save" | "regenerate"
type FirstFrameModalState =
  | { type: "create" }
  | { type: "edit"; item: FirstFrameItem }
  | null
type FilterValue = "all"

const referenceSourceLabels: Record<FirstFrameReferenceSource, string> = {
  actor: "Actor image",
  media: "Media library",
}

export function FirstFrameDashboard() {
  const [firstFrames, setFirstFrames] = React.useState<FirstFrameItem[]>([])
  const [actors, setActors] = React.useState<ActorItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [actorFilter, setActorFilter] = React.useState<FilterValue | string>(
    "all"
  )
  const [tagFilter, setTagFilter] = React.useState("all")
  const [modelFilter, setModelFilter] = React.useState<FilterValue | string>(
    "all"
  )
  const [aspectFilter, setAspectFilter] = React.useState<
    FilterValue | FirstFrameAspectRatio
  >("all")
  const [viewMode, setViewMode] = React.useState<ViewMode>("gallery")
  const [sortColumn, setSortColumn] =
    React.useState<FirstFrameSortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [modalState, setModalState] =
    React.useState<FirstFrameModalState>(null)
  const [previewFrameId, setPreviewFrameId] = React.useState<string | null>(
    null
  )
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [actorPickerOpen, setActorPickerOpen] = React.useState(false)
  const [actorPickerQuery, setActorPickerQuery] = React.useState("")
  const [submitAction, setSubmitAction] =
    React.useState<FirstFrameSubmitAction | null>(null)
  const [pinningId, setPinningId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [actorId, setActorId] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [model, setModel] = React.useState<ActorModelId>(DEFAULT_ACTOR_MODEL)
  const [aspectRatio, setAspectRatio] =
    React.useState<FirstFrameAspectRatio>("9:16")
  const [referenceSource, setReferenceSource] =
    React.useState<FirstFrameReferenceSource>("actor")
  const [referenceMediaId, setReferenceMediaId] = React.useState<string | null>(
    null
  )
  const [referenceMediaUrl, setReferenceMediaUrl] = React.useState<
    string | null
  >(null)
  const ignoreModalCloseRef = React.useRef(false)

  React.useEffect(() => {
    let active = true

    Promise.all([listFirstFrames(), listActors()])
      .then(([firstFrameData, actorData]) => {
        if (!active) return
        setFirstFrames(firstFrameData.firstFrames)
        setActors(actorData.actors)
      })
      .catch((loadError) => {
        if (!active) return
        setError(
          getFirstFrameErrorMessage(loadError) ||
            getActorErrorMessage(loadError)
        )
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
    () => Array.from(new Set(firstFrames.flatMap((item) => item.tags))).sort(),
    [firstFrames]
  )

  const actorOptions = React.useMemo(
    () => actors.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [actors]
  )

  const actorPickerOptions = React.useMemo(() => {
    const query = actorPickerQuery.trim().toLowerCase()
    if (!query) return actorOptions
    return actorOptions.filter((actor) =>
      actor.name.toLowerCase().includes(query)
    )
  }, [actorOptions, actorPickerQuery])

  const filteredFirstFrames = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1

    return firstFrames
      .filter((item) => {
        const matchesSearch =
          !query ||
          `${item.name} ${item.actor.name} ${item.prompt} ${item.tags.join(" ")}`
            .toLowerCase()
            .includes(query)
        const matchesActor =
          actorFilter === "all" || item.actor.id === actorFilter
        const matchesTag = tagFilter === "all" || item.tags.includes(tagFilter)
        const matchesModel =
          modelFilter === "all" || item.model === modelFilter
        const matchesAspect =
          aspectFilter === "all" || item.aspect_ratio === aspectFilter
        return (
          matchesSearch &&
          matchesActor &&
          matchesTag &&
          matchesModel &&
          matchesAspect
        )
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (sortColumn === "actor") {
          return a.actor.name.localeCompare(b.actor.name) * direction
        }
        if (sortColumn === "aspect") {
          return a.aspect_ratio.localeCompare(b.aspect_ratio) * direction
        }
        if (sortColumn === "created") {
          return (
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()) *
            direction
          )
        }
        return a.name.localeCompare(b.name) * direction
      })
  }, [
    actorFilter,
    aspectFilter,
    firstFrames,
    modelFilter,
    searchQuery,
    sortColumn,
    sortDirection,
    tagFilter,
  ])

  const totalPages = Math.ceil(filteredFirstFrames.length / pageSize)
  const currentPageForResults = Math.min(currentPage, totalPages || 1)
  const paginatedFirstFrames = React.useMemo(() => {
    const startIndex = (currentPageForResults - 1) * pageSize
    return filteredFirstFrames.slice(startIndex, startIndex + pageSize)
  }, [currentPageForResults, filteredFirstFrames, pageSize])

  const visibleIds = paginatedFirstFrames.map((item) => item.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "first frame",
    deleteOne: deleteFirstFrame,
    deleteMany: bulkDeleteFirstFrames,
    setItems: setFirstFrames,
    clearSelection,
    setNotice,
    setError,
    formatError: getFirstFrameErrorMessage,
  })

  function openCreateModal() {
    setModalState({ type: "create" })
    setName("")
    setActorId("")
    setPrompt("")
    setTags("")
    setModel(DEFAULT_ACTOR_MODEL)
    setAspectRatio("9:16")
    setReferenceSource("actor")
    clearReferenceMedia()
    setActorPickerOpen(false)
    setActorPickerQuery("")
    setModalError(null)
    setNotice(null)
    setError(null)
  }

  function openEditModal(item: FirstFrameItem) {
    setModalState({ type: "edit", item })
    setName(item.name)
    setActorId(item.actor.id)
    setPrompt(item.prompt)
    setTags(item.tags.join(", "))
    setModel(item.model)
    setAspectRatio(item.aspect_ratio)
    setReferenceSource(item.reference_source)
    setReferenceMediaId(item.reference_media_id)
    setReferenceMediaUrl(item.reference_media_url)
    setActorPickerOpen(false)
    setActorPickerQuery("")
    setModalError(null)
    setNotice(null)
    setError(null)
  }

  function openRemixModal(item: FirstFrameItem) {
    setModalState({ type: "create" })
    setName(`${item.name} Remix`.slice(0, 255))
    setActorId(item.actor.id)
    setPrompt(item.prompt)
    setTags(item.tags.join(", "))
    setModel(item.model)
    setAspectRatio(item.aspect_ratio)
    setReferenceSource(item.generated_media_id ? "media" : "actor")
    setReferenceMediaId(item.generated_media_id)
    setReferenceMediaUrl(item.image_url)
    setActorPickerOpen(false)
    setActorPickerQuery("")
    setModalError(null)
    setNotice(null)
    setError(null)
  }

  function closeModal() {
    ignoreModalCloseRef.current = false
    setModalState(null)
    setPickerOpen(false)
    setActorPickerOpen(false)
    setActorPickerQuery("")
    setSubmitAction(null)
    setModalError(null)
  }

  function ignoreNextModalClose() {
    ignoreModalCloseRef.current = true
    window.setTimeout(() => {
      ignoreModalCloseRef.current = false
    }, 300)
  }

  function closeActorPicker() {
    ignoreNextModalClose()
    setActorPickerOpen(false)
    setActorPickerQuery("")
  }

  function handleModalSelectOpenChange(open: boolean) {
    if (open) return
    ignoreNextModalClose()
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
    setReferenceSource("media")
    setReferenceMediaId(media.id)
    setReferenceMediaUrl(media.url)
  }

  function getFirstFramePayload() {
    return {
      name,
      actorId,
      prompt,
      tags,
      model,
      aspectRatio,
      referenceSource,
      referenceMediaId,
    }
  }

  async function handleSubmitFirstFrame() {
    const action = modalState?.type === "edit" ? "save" : "generate"
    setSubmitAction(action)
    setModalError(null)
    setNotice(null)
    try {
      if (modalState?.type === "edit") {
        const updated = await updateFirstFrame(modalState.item.id, {
          name,
          tags,
        })
        replaceFirstFrame(updated)
        setNotice("First frame updated.")
      } else {
        const created = await createFirstFrame(getFirstFramePayload())
        setFirstFrames((current) => [created, ...current])
        setNotice("First frame created.")
      }
      closeModal()
    } catch (submitError) {
      setModalError(getFirstFrameErrorMessage(submitError))
    } finally {
      setSubmitAction(null)
    }
  }

  async function handleRegenerateFirstFrame() {
    if (modalState?.type !== "edit") return
    setSubmitAction("regenerate")
    setModalError(null)
    setNotice(null)
    try {
      const updated = await regenerateFirstFrame(
        modalState.item.id,
        {
          ...getFirstFramePayload(),
          actorId: modalState.item.actor.id,
          referenceSource: modalState.item.reference_source,
          referenceMediaId: modalState.item.reference_media_id,
        }
      )
      replaceFirstFrame(updated)
      setNotice("First frame regenerated.")
      closeModal()
    } catch (regenerateError) {
      setModalError(getFirstFrameErrorMessage(regenerateError))
    } finally {
      setSubmitAction(null)
    }
  }

  async function handleTogglePinned(item: FirstFrameItem) {
    setPinningId(item.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateFirstFramePinned(item.id, !item.pinned)
      replaceFirstFrame(updated)
      setNotice(updated.pinned ? "First frame pinned." : "First frame unpinned.")
    } catch (pinError) {
      setError(getFirstFrameErrorMessage(pinError))
    } finally {
      setPinningId(null)
    }
  }

  function replaceFirstFrame(updated: FirstFrameItem) {
    setFirstFrames((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
  }

  function toggleSort(column: FirstFrameSortColumn) {
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

  const selectedActor = actors.find((actor) => actor.id === actorId) ?? null
  const previewFrame =
    firstFrames.find((item) => item.id === previewFrameId) ?? null
  const referencePreviewUrl =
    modalState?.type === "edit"
      ? modalState.item.reference_source === "media"
        ? modalState.item.reference_media_url
        : modalState.item.actor.image_url
      : referenceSource === "media"
        ? referenceMediaUrl
        : selectedActor?.image_url
  const submitting = submitAction !== null
  const generationChanged =
    modalState?.type === "edit" &&
    (prompt !== modalState.item.prompt ||
      model !== modalState.item.model ||
      aspectRatio !== modalState.item.aspect_ratio)
  const saveDisabled = submitting || !name.trim() || generationChanged
  const generateDisabled =
    submitting ||
    !name.trim() ||
    !actorId ||
    !prompt.trim() ||
    (referenceSource === "media" && !referenceMediaId)

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
        name="first-frame-search"
        aria-label="Search first frames"
        placeholder="Search first frames..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />
      <Select value={actorFilter} onValueChange={setActorFilter}>
        <DashboardToolbarSelectTrigger
          aria-label="Filter first frames by actor"
          labels={["All Actors", ...actorOptions.map((actor) => actor.name)]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actors</SelectItem>
          {actorOptions.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={tagFilter} onValueChange={setTagFilter}>
        <DashboardToolbarSelectTrigger
          aria-label="Filter first frames by tag"
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
      <Select value={modelFilter} onValueChange={setModelFilter}>
        <DashboardToolbarSelectTrigger
          aria-label="Filter first frames by model"
          labels={["All Models", ...ACTOR_MODELS.map((option) => option.label)]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Models</SelectItem>
          {ACTOR_MODELS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={aspectFilter}
        onValueChange={(value) =>
          setAspectFilter(value as FilterValue | FirstFrameAspectRatio)
        }
      >
        <DashboardToolbarSelectTrigger
          aria-label="Filter first frames by aspect ratio"
          labels={["All Ratios", ...FIRST_FRAME_ASPECT_RATIOS]}
        >
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Ratios</SelectItem>
          {FIRST_FRAME_ASPECT_RATIOS.map((ratio) => (
            <SelectItem key={ratio} value={ratio}>
              {ratio}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        Create First Frame
      </DashboardToolbarButton>
    </>
  )

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
          title="First Frame"
          icon={
            <ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredFirstFrames.length}
          controls={controls}
          selectedCount={selectedIds.size}
          onClearSelection={() => clearSelection()}
          content={
            <div className="px-5 pt-3 pb-5">
              {loading || paginatedFirstFrames.length === 0 ? (
                <EmptyFirstFrames loading={loading} onCreate={openCreateModal} />
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {paginatedFirstFrames.map((item) => (
                    <FirstFrameGalleryItem
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onToggle={() => toggleSelected(item.id)}
                      onOpen={() => openEditModal(item)}
                      onPin={() => handleTogglePinned(item)}
                      onDelete={() => setDeleteIds([item.id])}
                      pinning={pinningId === item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          }
          footer={{
            type: "pagination",
            page: currentPageForResults,
            pageSize,
            total: filteredFirstFrames.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        />
      ) : (
        <DashboardTable
          title="First Frame"
          icon={
            <ImageIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={filteredFirstFrames.length}
          controls={controls}
          selectedCount={selectedIds.size}
          onClearSelection={() => clearSelection()}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible first frames"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton
                    active={sortColumn === "name"}
                    direction={sortDirection}
                    onClick={() => toggleSort("name")}
                  >
                    First Frame
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "actor"}
                    direction={sortDirection}
                    onClick={() => toggleSort("actor")}
                  >
                    Actor
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortColumn === "aspect"}
                    direction={sortDirection}
                    onClick={() => toggleSort("aspect")}
                  >
                    Aspect
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
          isEmpty={loading || paginatedFirstFrames.length === 0}
          emptyText={loading ? "Loading first frames..." : "No first frames found."}
          emptyColSpan={6}
          footer={{
            type: "pagination",
            page: currentPageForResults,
            pageSize,
            total: filteredFirstFrames.length,
            totalPages,
            pageSizeOptions,
            onPageChange: goToPage,
            onPageSizeChange: setPageSize,
          }}
        >
          {paginatedFirstFrames.map((item) => (
            <FirstFrameTableRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => toggleSelected(item.id)}
              onOpen={() => openEditModal(item)}
              onPin={() => handleTogglePinned(item)}
              onDelete={() => setDeleteIds([item.id])}
              pinning={pinningId === item.id}
            />
          ))}
        </DashboardTable>
      )}

      <Dialog
        open={!!modalState}
        onOpenChange={(open) => {
          if (!open && !ignoreModalCloseRef.current) closeModal()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {modalState?.type === "edit" ? "Edit First Frame" : "Create First Frame"}
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

              <div className="grid gap-2">
                <Label htmlFor="first-frame-name">Name</Label>
                <Input
                  id="first-frame-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Opening shot in studio"
                />
              </div>

              <div className="grid gap-2">
                <Label>Aspect Ratio</Label>
                <Select
                  value={aspectRatio}
                  onOpenChange={handleModalSelectOpenChange}
                  onValueChange={(value) =>
                    setAspectRatio(value as FirstFrameAspectRatio)
                  }
                >
                  <SelectTrigger id="first-frame-aspect" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIRST_FRAME_ASPECT_RATIOS.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Reference Source</Label>
                {modalState?.type === "edit" ? (
                  <p className="text-sm text-muted-foreground">
                    {referenceSourceLabels[modalState.item.reference_source]}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={referenceSource === "actor" ? "default" : "outline"}
                      size="sm"
                      aria-pressed={referenceSource === "actor"}
                      onClick={() => {
                        setPickerOpen(false)
                        setReferenceSource("actor")
                      }}
                    >
                      Actor image
                    </Button>
                    <Button
                      type="button"
                      variant={referenceSource === "media" ? "default" : "outline"}
                      size="sm"
                      aria-pressed={referenceSource === "media"}
                      onClick={() => setReferenceSource("media")}
                    >
                      Media library image
                    </Button>
                  </div>
                )}
                <div className="grid w-full max-w-52 gap-2">
                  {modalState?.type === "edit" ? (
                    <div className="overflow-hidden rounded-lg border-2 border-dashed text-left">
                      {referencePreviewUrl ? (
                        <div className="relative aspect-square">
                          <img
                            src={referencePreviewUrl}
                            alt="Reference"
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-muted/50">
                          <ImageIcon className="size-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Reference unavailable
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() =>
                        referenceSource === "actor"
                          ? setActorPickerOpen(true)
                          : setPickerOpen(true)
                      }
                      aria-label={
                        referenceSource === "actor"
                          ? "Select actor image"
                          : "Select media library image"
                      }
                    >
                      {referencePreviewUrl ? (
                        <div className="relative aspect-square">
                          <img
                            src={referencePreviewUrl}
                            alt="Reference"
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="text-sm font-medium text-white">
                              Click to change
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-muted/50 transition-colors group-hover:bg-muted">
                          <ImagePlusIcon className="size-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Select image
                          </span>
                        </div>
                      )}
                    </button>
                  )}
                  {modalState?.type !== "edit" &&
                  referenceSource === "media" &&
                  referenceMediaUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit text-destructive hover:text-destructive"
                      onClick={clearReferenceMedia}
                    >
                      Remove image
                    </Button>
                  ) : null}
                  {modalState?.type !== "edit" && referenceSource === "media" ? (
                    <MediaPicker
                      open={pickerOpen}
                      onOpenChange={setPickerOpen}
                      onSelectMedia={handleReferenceSelect}
                      currentMediaUrl={referenceMediaUrl ?? undefined}
                      showVideos={false}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="first-frame-prompt">Prompt</Label>
                <Textarea
                  id="first-frame-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the first frame composition, scene, pose, lighting, and mood."
                  rows={5}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="first-frame-tags">Tags</Label>
                  <Input
                    id="first-frame-tags"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="hook, studio, closeup"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>AI Model</Label>
                  <Select
                    value={model}
                    onOpenChange={handleModalSelectOpenChange}
                    onValueChange={(value) => setModel(value as ActorModelId)}
                  >
                    <SelectTrigger id="first-frame-model" className="w-full">
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
                  {model === "dall-e-3" ? (
                    <p className="text-xs text-muted-foreground">
                      DALL-E 3 uses text context only; reference images are not sent to this model.
                    </p>
                  ) : null}
                </div>
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
                  disabled={saveDisabled}
                  onClick={handleSubmitFirstFrame}
                >
                  {submitAction === "save" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  {submitAction === "save" ? "Saving" : "Save Details"}
                </Button>
                <Button
                  type="button"
                  disabled={generateDisabled}
                  onClick={handleRegenerateFirstFrame}
                >
                  {submitAction === "regenerate" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                  {submitAction === "regenerate"
                    ? "Regenerating"
                    : "Regenerate Image"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={generateDisabled}
                onClick={handleSubmitFirstFrame}
              >
                {submitAction === "generate" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                {submitAction === "generate" ? "Generating" : "Generate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={actorPickerOpen}
        onOpenChange={(open) => {
          if (open) {
            setActorPickerOpen(true)
            return
          }
          closeActorPicker()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Select Actor Image</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <Input
                type="search"
                value={actorPickerQuery}
                onChange={(event) => setActorPickerQuery(event.target.value)}
                placeholder="Search actors"
              />
              <div className="min-h-[260px] overflow-y-auto rounded-lg border p-3">
                {actorPickerOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {actorPickerOptions.map((actor) => (
                      <button
                        key={actor.id}
                        type="button"
                        className={cn(
                          "overflow-hidden rounded-md border bg-muted text-left outline-none transition-colors hover:border-muted-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                          actorId === actor.id &&
                            "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => {
                          setActorId(actor.id)
                          setReferenceSource("actor")
                          setPickerOpen(false)
                          closeActorPicker()
                        }}
                      >
                        <img
                          src={actor.image_url}
                          alt={actor.name}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="block truncate px-2 py-1.5 text-xs">
                          {actor.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <ImageIcon className="mx-auto mb-3 size-10" />
                      <p>No actors found.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={closeActorPicker}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FirstFramePreviewDialog
        item={previewFrame}
        pinning={pinningId === previewFrame?.id}
        onOpenChange={(open) => !open && setPreviewFrameId(null)}
        onPin={() => previewFrame && handleTogglePinned(previewFrame)}
        onRemix={() => previewFrame && openRemixModal(previewFrame)}
        onDelete={() => previewFrame && setDeleteIds([previewFrame.id])}
      />

      <Dialog
        open={!!deleteIds}
        onOpenChange={(open) => !open && setDeleteIds(null)}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {(deleteIds?.length ?? 0) === 1
                ? "First Frame"
                : `${deleteIds?.length ?? 0} First Frames`}
              ?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes only the dashboard record. The generated media image
              remains in the media library.
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

function FirstFrameTableRow({
  item,
  selected,
  pinning,
  onToggle,
  onOpen,
  onPin,
  onDelete,
}: {
  item: FirstFrameItem
  selected: boolean
  pinning: boolean
  onToggle: () => void
  onOpen: () => void
  onPin: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${item.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted"
            onClick={onOpen}
            aria-label={`Preview ${item.name}`}
          >
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" />
            )}
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="flex max-w-full items-center gap-1 truncate font-medium group-hover:underline"
              onClick={onOpen}
            >
              {item.pinned ? <StarIcon className="size-3.5 fill-current" /> : null}
              <span className="truncate">{item.name}</span>
            </button>
            <div className="max-w-[280px] truncate text-xs text-muted-foreground">
              {item.prompt}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">{item.actor.name}</TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{item.aspect_ratio}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(item.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onPin}
            disabled={pinning}
            aria-label={item.pinned ? "Unpin first frame" : "Pin first frame"}
          >
            {pinning ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PinIcon className={cn("size-4", item.pinned && "fill-current")} />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete first frame"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function FirstFrameGalleryItem({
  item,
  selected,
  pinning,
  onToggle,
  onOpen,
  onPin,
  onDelete,
}: {
  item: FirstFrameItem
  selected: boolean
  pinning: boolean
  onToggle: () => void
  onOpen: () => void
  onPin: () => void
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
        className={cn(
          "relative grid w-full place-items-center bg-muted",
          aspectClassName(item.aspect_ratio)
        )}
        onClick={onOpen}
        aria-label={`Preview ${item.name}`}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
        <span className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.pinned ? (
            <Badge variant="secondary">
              <StarIcon className="size-3 fill-current" />
              Pinned
            </Badge>
          ) : null}
          <Badge variant="outline" className="bg-background/90">
            {item.aspect_ratio}
          </Badge>
        </span>
      </button>

      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100",
          selected ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${item.name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPin}
          disabled={pinning}
          aria-label={item.pinned ? "Unpin first frame" : "Pin first frame"}
        >
          {pinning ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PinIcon className={cn("size-4", item.pinned && "fill-current")} />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete first frame"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 bg-card p-3">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          onClick={onOpen}
        >
          {item.name}
        </button>
        <div className="truncate text-xs text-muted-foreground">
          {item.actor.name} · {referenceSourceLabels[item.reference_source]}
        </div>
        <FirstFrameTags tags={item.tags} />
      </div>
    </div>
  )
}

function FirstFramePreviewDialog({
  item,
  pinning,
  onOpenChange,
  onPin,
  onRemix,
  onDelete,
}: {
  item: FirstFrameItem | null
  pinning: boolean
  onOpenChange: (open: boolean) => void
  onPin: () => void
  onRemix: () => void
  onDelete: () => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{item?.name ?? "First Frame Preview"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {item ? (
            <div className="space-y-5">
              <div className="mx-auto grid max-h-[48vh] min-h-64 w-full max-w-xl place-items-center overflow-hidden rounded-lg border bg-muted">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="max-h-[48vh] w-full object-contain"
                  />
                ) : (
                  <div className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <ImageIcon className="mx-auto mb-3 size-10" />
                      <p>Generated media is missing.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <MetaRow label="Actor" value={item.actor.name} />
                <MetaRow label="Aspect" value={item.aspect_ratio} />
                <MetaRow label="Model" value={modelLabel(item.model)} />
                <MetaRow
                  label="Source"
                  value={referenceSourceLabels[item.reference_source]}
                />
                <MetaRow
                  label="Created"
                  value={dateFormatter.format(new Date(item.created_at))}
                />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Tags</div>
                  <FirstFrameTags tags={item.tags} />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Prompt</Label>
                <div className="min-h-24 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {item.prompt}
                </div>
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain" className="justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!item?.image_url || !item.generated_media_id}
              onClick={onRemix}
            >
              <CopyIcon className="size-4" />
              Remix
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onPin}>
              {pinning ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PinIcon className={cn("size-4", item?.pinned && "fill-current")} />
              )}
              {item?.pinned ? "Unpin" : "Pin"}
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  )
}

function FirstFrameTags({ tags }: { tags: string[] }) {
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

function EmptyFirstFrames({
  loading,
  onCreate,
}: {
  loading: boolean
  onCreate: () => void
}) {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        {loading ? (
          <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
        ) : (
          <ImageIcon className="mx-auto mb-3 size-10" />
        )}
        <p>{loading ? "Loading first frames..." : "No first frames yet."}</p>
        {!loading ? (
          <Button type="button" className="mt-4" onClick={onCreate}>
            <PlusIcon className="size-4" />
            Create First Frame
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function aspectClassName(aspectRatio: FirstFrameAspectRatio) {
  if (aspectRatio === "16:9") return "aspect-video"
  if (aspectRatio === "1:1") return "aspect-square"
  return "aspect-[9/16]"
}

function modelLabel(model: ActorModelId) {
  return ACTOR_MODELS.find((option) => option.id === model)?.label ?? model
}
