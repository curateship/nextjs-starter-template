import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  ImagesIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { CarouselFormDialog } from "@/components/carousel-studio/carousel-form-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  deleteCarousels,
  duplicateCarousel,
  getCarouselErrorMessage,
  type CarouselItem,
  type CarouselListResponse,
} from "@/lib/api/video/carousels"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

const route = getRouteApi("/_authenticated/admin/video-carousels/")

export type CarouselSortColumn = "name" | "slides" | "format" | "updated"

const COLUMNS: SortableColumn<CarouselSortColumn>[] = [
  { key: "name", label: "Carousel", column: "main" },
  { key: "slides", label: "Slides", column: "meta" },
  { key: "format", label: "Shape", column: "meta" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compareCarousels(
  a: CarouselItem,
  b: CarouselItem,
  column: CarouselSortColumn
) {
  if (column === "slides") return a.slide_count - b.slide_count
  if (column === "format") return a.format.localeCompare(b.format)
  if (column === "updated") {
    return Date.parse(a.updated_at) - Date.parse(b.updated_at)
  }
  return a.name.localeCompare(b.name)
}

export function CarouselsPage({ initial }: { initial: CarouselListResponse }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const search = route.useSearch()
  const setSearch = useListSearchNavigate()
  const searchQuery = search.q ?? ""
  const currentPage = search.page ?? 1
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (value) =>
    setSearch({ q: value.trim() ? value : undefined, page: undefined })
  )
  const sort: CarouselSortColumn = search.sort ?? "updated"
  const direction = search.direction ?? "desc"
  const toggleSort = useListSort<CarouselSortColumn>({ sort, direction })
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CarouselItem | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<CarouselItem[]>([])
  const [run, busy] = useAsyncAction(getCarouselErrorMessage)
  const selection = useSelection()

  const carousels = initial.carousels
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...carousels].sort((a, b) => factor * compareCarousels(a, b, sort))
  }, [carousels, direction, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visible = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [currentPage, pageSize, sorted])
  const visibleIds = visible.map((carousel) => carousel.id)
  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  function openStudio(carousel: CarouselItem) {
    void navigate({
      to: "/admin/video-carousels/$carouselId",
      params: { carouselId: carousel.id },
    })
  }

  async function handleDuplicate(carousel: CarouselItem) {
    await run(async () => {
      const copy = await duplicateCarousel(carousel.id)
      await router.invalidate()
      toast.success(`"${copy.name}" created.`)
    })
  }

  async function confirmDelete() {
    if (!deleteTargets.length) return
    await run(async () => {
      const result = await deleteCarousels(
        deleteTargets.map((carousel) => carousel.id)
      )
      if (!result.deleted_ids.length) {
        showErrorToast("Nothing was deleted. It may already be gone.")
        return
      }
      selection.clear()
      setDeleteTargets([])
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: result.deleted_ids.length,
          kept: deleteTargets.length - result.deleted_ids.length,
          one: "carousel",
          many: "carousels",
          verb: "deleted",
        })
      )
    })
  }

  const selected = carousels.filter((item) => selection.selected.has(item.id))
  const hasMoreThanLoaded = initial.total > carousels.length

  return (
    <>
      <DashboardTable
        title="Carousels"
        icon={<ImagesIcon />}
        count={initial.total}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteTargets(selected)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="carousel-search"
              aria-label="Search carousels"
              placeholder="Search carousels…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon className="size-4" />
              New carousel
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select visible carousels"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sorted.length === 0}
        emptyText={
          searchQuery
            ? "No carousels match that search."
            : "No carousels yet. Make one to start designing."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sorted.length,
          totalPages,
          onPageChange: (page) =>
            setSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => {
            setPageSize(size)
            setSearch({ page: undefined })
          },
        }}
      >
        {visible.map((carousel) => (
          <TableRow
            key={carousel.id}
            className="group"
            rowAction={() => openStudio(carousel)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(carousel.id)}
                onCheckedChange={() => selection.toggle(carousel.id)}
                aria-label={`Select ${carousel.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {carousel.thumbnail_url ? (
                    <img
                      src={carousel.thumbnail_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImagesIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <button
                  type="button"
                  className="block max-w-full truncate text-left font-medium group-hover:underline"
                  onClick={() => openStudio(carousel)}
                  title={carousel.name}
                >
                  {carousel.name}
                </button>
              </div>
            </TableCell>
            <TableCell column="meta">{carousel.slide_count}</TableCell>
            <TableCell column="meta">{carousel.format}</TableCell>
            <TableCell column="meta">
              {formatDate(carousel.updated_at)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => void handleDuplicate(carousel)}
                  aria-label={`Duplicate ${carousel.name}`}
                  title={`Duplicate ${carousel.name}`}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(carousel)
                    setFormOpen(true)
                  }}
                  aria-label={`Rename ${carousel.name}`}
                  title={`Rename ${carousel.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([carousel])}
                  aria-label={`Delete ${carousel.name}`}
                  title={`Delete ${carousel.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {hasMoreThanLoaded ? (
        <p className="text-sm text-muted-foreground">
          Showing the {carousels.length} most recently changed of{" "}
          {initial.total} carousels. Search to find the older ones.
        </p>
      ) : null}

      <CarouselFormDialog
        open={formOpen}
        carousel={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onCreated={openStudio}
        onSaved={() => void router.invalidate()}
      />
      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length > 1
            ? `Delete ${deleteTargets.length} ${plural(deleteTargets.length, "carousel", "carousels")}?`
            : "Delete this carousel?"
        }
        description="Its slides go for good. Pictures in the media library stay where they are."
        confirmLabel={
          deleteTargets.length > 1 ? "Delete carousels" : "Delete carousel"
        }
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}
