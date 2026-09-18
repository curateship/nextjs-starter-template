import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { NewspaperIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PostDialog } from "@/components/posts/post-dialog"
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
import type { Category } from "@/lib/api/directory/categories"
import {
  getPostErrorMessage,
  removePosts,
  type PostsPage,
  type PostSummary,
} from "@/lib/api/posts/posts"
import {
  LISTING_STATUS_FILTERS,
  LISTING_STATUS_LABELS,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
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
import { postSortDirection, type PostSortColumn } from "@/lib/posts/post-sort"

const COLUMNS: SortableColumn<PostSortColumn>[] = [
  { key: "title", label: "Post", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "published", label: "Published", column: "meta" },
  {
    key: "updated",
    label: "Updated",
    column: "meta",
    className: "hidden md:table-cell",
  },
]

/**
 * The admin's Posts screen: this site's posts, searched, filtered by status,
 * sorted and paged on the server, in the same table as Listings. A row opens
 * the post's window over the list, and `?open=<id>` in the address says which.
 */
export function PostsDashboard({
  data,
  categories,
  search,
}: {
  data: PostsPage
  categories: Category[]
  search: {
    q?: string
    status?: ListingStatusFilter
    sort?: PostSortColumn
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
  const toggleSort = useListSort<PostSortColumn>(
    { sort, direction },
    postSortDirection
  )

  const selection = useSelection()
  const selectedIds = selection.selected
  const [run, deleting] = useAsyncAction(getPostErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    ids: string[]
    title: string | null
  } | null>(null)

  const listKey = `${search.q ?? ""}|${search.status ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)

  const visibleIds = React.useMemo(
    () => data.posts.map((post) => post.id),
    [data.posts]
  )
  const openRow = search.open
    ? (data.posts.find((post) => post.id === search.open) ?? null)
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
  const openEditor = (post: PostSummary) => setOpen(post.id)

  const confirmDelete = async () => {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removePosts(confirm.ids)
      await router.invalidate()
      selection.setSelected(new Set(kept))
      if (done.length === 0) {
        throw new Error(
          "No posts were deleted. They may already be gone. The list has been refreshed."
        )
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "post",
          many: "posts",
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
        title="Posts"
        icon={<NewspaperIcon className="text-muted-foreground" />}
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
              name="post-search"
              aria-label="Search posts"
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
                {LISTING_STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LISTING_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New post
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
                  aria-label="Select all posts on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={data.posts.length === 0}
        emptyText={
          search.q?.trim() || search.status
            ? "No post matches that search."
            : "No posts yet. Write the first one."
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
        {data.posts.map((post) => (
          <TableRow
            key={post.id}
            className="group"
            rowAction={() => openEditor(post)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(post.id)}
                onCheckedChange={() => selection.toggle(post.id)}
                aria-label={`Select ${post.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(post)}
                title={post.title}
              >
                {post.title}
              </button>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                {post.categories.length
                  ? post.categories.join(", ")
                  : `/posts/${post.slug}`}
              </span>
            </TableCell>
            <TableCell column="meta">
              {post.status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </TableCell>
            <TableCell column="meta">{formatDate(post.publishedAt)}</TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(post.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${post.title}`}
                  onClick={() => openEditor(post)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${post.title}`}
                  disabled={deleting}
                  onClick={() =>
                    setConfirm({ ids: [post.id], title: post.title })
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
      <PostDialog
        open={creating || Boolean(search.open)}
        postId={creating ? null : (search.open ?? null)}
        categories={categories}
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
            ? "Delete this post?"
            : `Delete ${confirm?.ids.length ?? 0} posts?`
        }
        description={
          confirm
            ? confirm.ids.length === 1
              ? `${confirm.title ?? "The post"} goes for good, and its page stops existing. The listings and categories it points at stay.`
              : `${confirm.ids.length} posts go for good, and their pages stop existing. The listings and categories they point at stay.`
            : null
        }
        confirmLabel={
          confirm && confirm.ids.length > 1
            ? `Delete ${confirm.ids.length} posts`
            : "Delete post"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
