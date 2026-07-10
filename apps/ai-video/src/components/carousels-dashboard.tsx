import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  EditIcon,
  ImageIcon,
  LayersIcon,
  Loader2Icon,
  PanelsTopLeftIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarViewToggle,
} from "@/components/dashboard-toolbar"
import { DashboardNotices } from "@/components/dashboard-notices"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
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
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  bulkDeleteCarousels,
  createCarousel,
  deleteCarousel,
  getCarouselErrorMessage,
  listCarousels,
  renameCarousel,
  type CarouselFormat,
  type CarouselItem,
  type CarouselListResponse,
  type CarouselSortBy,
  type CarouselSortDirection,
} from "@/lib/api/carousels"
import { cn } from "@/lib/utils"
import { dateFormatter, pageSizeOptions } from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

type ViewMode = "gallery" | "list"
type CarouselModalState =
  | { type: "create" }
  | { type: "rename"; carousel: CarouselItem }
  | null

function formatCarouselFormat(format: CarouselFormat) {
  if (format === "4:5") return "4:5 portrait"
  if (format === "9:16") return "9:16 story"
  return "1:1 square"
}

export function CarouselsDashboard() {
  const navigate = useNavigate()
  const [data, setData] = React.useState<CarouselListResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
  const [sortBy, setSortBy] = React.useState<CarouselSortBy>("updated_at")
  const [sortDirection, setSortDirection] =
    React.useState<CarouselSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [modalState, setModalState] = React.useState<CarouselModalState>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")
  const [sourceText, setSourceText] = React.useState("")

  const fetchCurrentPage = React.useCallback(
    () =>
      listCarousels({
        page: currentPage,
        pageSize,
        search: searchQuery.trim() || undefined,
        sortBy,
        sortDirection,
      }),
    [currentPage, pageSize, searchQuery, sortBy, sortDirection]
  )

  const applyCurrentPage = React.useCallback(
    (next: CarouselListResponse) => {
      setData(next)
      const maxPage = next.total_pages || 1
      if (currentPage > maxPage) {
        setCurrentPage(maxPage)
      }
    },
    [currentPage]
  )

  const loadCurrentPage = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      applyCurrentPage(await fetchCurrentPage())
    } catch (loadError) {
      setError(getCarouselErrorMessage(loadError))
      throw loadError
    } finally {
      setLoading(false)
    }
  }, [applyCurrentPage, fetchCurrentPage])

  React.useEffect(() => {
    let active = true

    fetchCurrentPage()
      .then((next) => {
        if (!active) return
        applyCurrentPage(next)
      })
      .catch((loadError) => {
        if (active) setError(getCarouselErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [applyCurrentPage, fetchCurrentPage])

  const carousels = data?.carousels ?? []
  const totalPages = data?.total_pages ?? 0
  const totalCarousels = data?.total ?? 0
  const emptyLoading = loading && !data

  function beginLoad() {
    setLoading(true)
    setError(null)
  }

  function updateSearch(value: string) {
    beginLoad()
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function changePageSize(size: number) {
    beginLoad()
    setPageSize(size)
    setCurrentPage(1)
  }

  function toggleSort(column: CarouselSortBy) {
    beginLoad()
    setCurrentPage(1)
    if (sortBy === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortBy(column)
    setSortDirection(
      column === "updated_at" || column === "slide_count" ? "desc" : "asc"
    )
  }

  function goToPage(page: number) {
    beginLoad()
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  function openCarousel(carousel: CarouselItem) {
    void navigate({
      to: "/admin/carousels/$carouselId",
      params: { carouselId: carousel.id },
    })
  }

  function openCreateModal() {
    setModalState({ type: "create" })
    setName("")
    setSourceText("")
    setModalError(null)
    setError(null)
    setNotice(null)
  }

  function openRenameModal(carousel: CarouselItem) {
    setModalState({ type: "rename", carousel })
    setName(carousel.name)
    setSourceText("")
    setModalError(null)
    setError(null)
    setNotice(null)
  }

  function closeModal() {
    setModalState(null)
    setSubmitting(false)
    setModalError(null)
  }

  async function handleCreateCarousel() {
    setSubmitting(true)
    setModalError(null)
    try {
      const created = await createCarousel(name, sourceText)
      void navigate({
        to: "/admin/carousels/$carouselId",
        params: { carouselId: created.id },
      })
    } catch (createError) {
      setModalError(getCarouselErrorMessage(createError))
      setSubmitting(false)
    }
  }

  async function handleRenameCarousel() {
    if (modalState?.type !== "rename") return

    setSubmitting(true)
    setModalError(null)
    try {
      await renameCarousel(modalState.carousel.id, name)
      await loadCurrentPage()
      setNotice("Carousel renamed.")
      closeModal()
    } catch (renameError) {
      setModalError(getCarouselErrorMessage(renameError))
      setSubmitting(false)
    }
  }

  const visibleIds = carousels.map((carousel) => carousel.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "carousel",
    deleteOne: deleteCarousel,
    deleteMany: bulkDeleteCarousels,
    reload: loadCurrentPage,
    clearSelection,
    setNotice,
    setError,
    formatError: getCarouselErrorMessage,
  })

  const createDisabled =
    submitting || !name.trim() || sourceText.length > 20000
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
        name="carousel-search"
        aria-label="Search carousels"
        placeholder="Search carousels..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <DashboardToolbarViewToggle viewMode={viewMode} onChange={setViewMode} />
      <DashboardToolbarButton type="button" onClick={openCreateModal}>
        <PlusIcon className="size-4" />
        New Carousel
      </DashboardToolbarButton>
    </>
  )

  const paginationFooter = {
    type: "pagination" as const,
    page: currentPage,
    pageSize,
    total: totalCarousels,
    totalPages,
    pageSizeOptions,
    onPageChange: goToPage,
    onPageSizeChange: changePageSize,
  }

  return (
    <div className="w-full pb-8">
      <DashboardNotices notice={notice} error={error} />

      {viewMode === "gallery" ? (
        <DashboardTable
          title="Carousels"
          icon={
            <PanelsTopLeftIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={totalCarousels}
          controls={controls}
          content={
            <div className="px-5 pt-3 pb-5">
              {emptyLoading || carousels.length === 0 ? (
                <EmptyCarousels loading={emptyLoading} />
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                  {carousels.map((carousel) => (
                    <CarouselGalleryItem
                      key={carousel.id}
                      carousel={carousel}
                      selected={selectedIds.has(carousel.id)}
                      onToggle={() => toggleSelected(carousel.id)}
                      onOpen={() => openCarousel(carousel)}
                      onRename={() => openRenameModal(carousel)}
                      onDelete={() => setDeleteIds([carousel.id])}
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
          title="Carousels"
          icon={
            <PanelsTopLeftIcon className="size-4 text-muted-foreground sm:size-[18px]" />
          }
          count={totalCarousels}
          controls={controls}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleVisibleSelected}
                    aria-label="Select visible carousels"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton
                    active={sortBy === "name"}
                    direction={sortDirection}
                    onClick={() => toggleSort("name")}
                  >
                    Carousel
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sortBy === "slide_count"}
                    direction={sortDirection}
                    onClick={() => toggleSort("slide_count")}
                  >
                    Slides
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sortBy === "format"}
                    direction={sortDirection}
                    onClick={() => toggleSort("format")}
                  >
                    Format
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sortBy === "updated_at"}
                    direction={sortDirection}
                    onClick={() => toggleSort("updated_at")}
                  >
                    Updated
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={emptyLoading || carousels.length === 0}
          emptyText={
            emptyLoading ? "Loading carousels..." : "No carousels found."
          }
          emptyColSpan={6}
          footer={paginationFooter}
        >
          {carousels.map((carousel) => (
            <CarouselTableRow
              key={carousel.id}
              carousel={carousel}
              selected={selectedIds.has(carousel.id)}
              onToggle={() => toggleSelected(carousel.id)}
              onOpen={() => openCarousel(carousel)}
              onRename={() => openRenameModal(carousel)}
              onDelete={() => setDeleteIds([carousel.id])}
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
              {modalState?.type === "rename"
                ? "Rename Carousel"
                : "New Carousel"}
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
                <Label htmlFor="carousel-name">Name</Label>
                <Input
                  id="carousel-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Carousel name"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    if (modalState?.type === "rename" && !renameDisabled) {
                      void handleRenameCarousel()
                    }
                  }}
                />
              </div>

              {modalState?.type === "create" ? (
                <div className="grid gap-2">
                  <Label htmlFor="carousel-source">Source text (optional)</Label>
                  <Textarea
                    id="carousel-source"
                    rows={8}
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Paste blog or newsletter text to generate slides"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default format: 4:5 portrait.
                  </p>
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            {modalState?.type === "rename" ? (
              <Button
                type="button"
                disabled={renameDisabled}
                onClick={handleRenameCarousel}
              >
                {submitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {submitting ? "Saving" : "Save Changes"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={createDisabled}
                onClick={handleCreateCarousel}
              >
                {submitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                {submitting
                  ? sourceText.trim()
                    ? "Generating"
                    : "Creating"
                  : "Create Carousel"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        ids={deleteIds}
        noun="Carousel"
        description={(count) =>
          count === 1
            ? "This removes the carousel and its slides. This action cannot be undone."
            : "This removes these carousels and their slides. This action cannot be undone."
        }
        deleting={deleting}
        onClose={() => setDeleteIds(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function CarouselTableRow({
  carousel,
  selected,
  onToggle,
  onOpen,
  onRename,
  onDelete,
}: {
  carousel: CarouselItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${carousel.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted"
            onClick={onOpen}
            aria-label={`Open ${carousel.name}`}
          >
            <CarouselThumb carousel={carousel} className="h-full w-full" />
          </button>
          <div className="min-w-0">
            <button
              type="button"
              className="truncate font-medium group-hover:underline"
              onClick={onOpen}
            >
              {carousel.name}
            </button>
            <div className="text-xs text-muted-foreground">
              {formatCarouselFormat(carousel.format)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{carousel.slide_count}</Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {formatCarouselFormat(carousel.format)}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(carousel.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRename}
            aria-label="Rename carousel"
          >
            <EditIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete carousel"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function CarouselGalleryItem({
  carousel,
  selected,
  onToggle,
  onOpen,
  onRename,
  onDelete,
}: {
  carousel: CarouselItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
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
      <button
        type="button"
        className="relative grid aspect-[4/5] w-full place-items-center bg-muted"
        onClick={onOpen}
        aria-label={`Open ${carousel.name}`}
      >
        <CarouselThumb carousel={carousel} className="h-full w-full" />
        <span className="absolute bottom-2 left-2 flex gap-1">
          <Badge variant="secondary">{carousel.slide_count} slides</Badge>
          <Badge variant="secondary">{carousel.format}</Badge>
        </span>
      </button>
      <div className="space-y-1 bg-card p-3">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          onClick={onOpen}
        >
          {carousel.name}
        </button>
        <p className="text-xs text-muted-foreground">
          Updated {dateFormatter.format(new Date(carousel.updated_at))}
        </p>
      </div>
      <div className="absolute top-2 right-2 flex shrink-0 items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="border-foreground"
            aria-label={`Select ${carousel.name}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRename}
          aria-label="Rename carousel"
        >
          <EditIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete carousel"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function CarouselThumb({
  carousel,
  className,
}: {
  carousel: CarouselItem
  className?: string
}) {
  if (carousel.thumbnail_url) {
    return (
      <img
        src={carousel.thumbnail_url}
        alt=""
        className={cn("object-cover", className)}
      />
    )
  }

  return (
    <div
      className={cn(
        "grid place-items-center bg-gradient-to-br from-slate-950 to-slate-700",
        className
      )}
    >
      <div className="text-center text-white/85">
        <LayersIcon className="mx-auto mb-1 size-5" />
        <span className="text-[10px] font-medium">{carousel.format}</span>
      </div>
    </div>
  )
}

function EmptyCarousels({ loading }: { loading: boolean }) {
  return (
    <div className="grid h-72 place-items-center text-center text-sm text-muted-foreground">
      <div>
        {loading ? (
          <Loader2Icon className="mx-auto mb-3 size-10 animate-spin" />
        ) : (
          <ImageIcon className="mx-auto mb-3 size-10" />
        )}
        <p>{loading ? "Loading carousels..." : "No carousels found."}</p>
      </div>
    </div>
  )
}
