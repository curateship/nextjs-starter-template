import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { BookOpenIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { GuideDialog } from "@/components/directory/guide-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getGuideErrorMessage,
  removeGuides,
  type GuidesPage,
  type GuideSummary,
} from "@/lib/api/directory/guides"
import {
  guideSortDirection,
  type GuideSortColumn,
  type GuideStatus,
} from "@/lib/directory/guides"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"

const COLUMNS: SortableColumn<GuideSortColumn>[] = [
  { key: "title", label: "Guide", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "listings", label: "Listings", column: "meta" },
  {
    key: "updated",
    label: "Updated",
    column: "meta",
    className: "hidden md:table-cell",
  },
]

/**
 * Admin → Listings → Guides: this site's guides, searched, filtered by status,
 * sorted and paged on the server, in the same table as Listings and Posts. A
 * row opens the guide's window over the list, and `?open=<id>` says which.
 */
export function GuidesDashboard({
  data,
  search,
}: {
  data: GuidesPage
  search: {
    q?: string
    status?: GuideStatus
    sort?: GuideSortColumn
    direction?: "asc" | "desc"
    open?: string
  }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const sort = search.sort ?? "updated"
  const direction = search.direction ?? "desc"
  const toggleSort = useListSort<GuideSortColumn>(
    { sort, direction },
    guideSortDirection
  )

  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, deleting] = useAsyncAction(getGuideErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    ids: string[]
    title: string | null
  } | null>(null)

  const listKey = `${search.q ?? ""}|${search.status ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.guides.map((guide) => guide.id),
    [data.guides]
  )
  const openRow = search.open
    ? (data.guides.find((guide) => guide.id === search.open) ?? null)
    : null

  /** Opening pushes a history entry, so Back closes the window. */
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const openEditor = (guide: GuideSummary) => setOpen(guide.id)

  const confirmDelete = async () => {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removeGuides(confirm.ids)
      await router.invalidate()
      selection.setSelected(new Set(kept))
      if (done.length === 0) {
        throw new Error(
          "No guides were deleted. They may already be gone. The list has been refreshed."
        )
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "guide",
          many: "guides",
          verb: "deleted",
        })
      )
      setConfirm(null)
    })
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Guides"
        icon={<BookOpenIcon className="text-muted-foreground" />}
        count={data.total}
        fillHeight
        className="h-auto max-h-full"
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() =>
                  setConfirm({ ids: [...selectedIds], title: null })
                }
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="guide-search"
              aria-label="Search guides"
              placeholder="Search title or address…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={search.status ?? "all"}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New guide
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
                  aria-label="Select all guides on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={data.guides.length === 0}
        emptyText={
          search.q?.trim() || search.status
            ? "No guide matches that search."
            : "No guides yet. Write the first one."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => setListSearch({ size, page: undefined }),
        }}
      >
        {data.guides.map((guide) => (
          <TableRow
            key={guide.id}
            className="group"
            rowAction={() => openEditor(guide)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(guide.id)}
                onCheckedChange={() => selection.toggle(guide.id)}
                aria-label={`Select ${guide.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(guide)}
              >
                {guide.title}
              </button>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                /guides/{guide.slug}
              </span>
            </TableCell>
            <TableCell column="meta">
              {guide.status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              {/* "8 of 9 shown" when a listing in it is not published, so the
                  difference from the public page is never a surprise. */}
              {guide.shown === guide.listings
                ? guide.listings
                : `${guide.shown} of ${guide.listings} shown`}
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(guide.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${guide.title}`}
                  onClick={() => openEditor(guide)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${guide.title}`}
                  disabled={deleting}
                  onClick={() =>
                    setConfirm({ ids: [guide.id], title: guide.title })
                  }
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {/* One window for editing and creating. */}
      <GuideDialog
        open={creating || Boolean(search.open)}
        guideId={creating ? null : (search.open ?? null)}
        preview={
          openRow ? { title: openRow.title, status: openRow.status } : null
        }
        onClose={() => {
          if (creating) setCreating(false)
          else setOpen(undefined)
        }}
        onSaved={() => void router.invalidate()}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm && confirm.ids.length === 1
            ? "Delete this guide?"
            : `Delete ${confirm?.ids.length ?? 0} guides?`
        }
        description={
          confirm
            ? confirm.ids.length === 1
              ? `${confirm.title ?? "The guide"} goes for good, and its page stops existing. The listings in it stay.`
              : `${confirm.ids.length} guides go for good, and their pages stop existing. The listings in them stay.`
            : null
        }
        confirmLabel={
          confirm && confirm.ids.length > 1
            ? `Delete ${confirm.ids.length} guides`
            : "Delete guide"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
