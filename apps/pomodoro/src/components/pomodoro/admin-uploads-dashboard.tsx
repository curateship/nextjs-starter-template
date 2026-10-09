import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { FolderUpIcon, MusicIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  deletePomodoroUploads,
  listPomodoroUploads,
  type AdminUploadRow,
} from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import type { UploadSortColumn } from "@/lib/pomodoro/admin-lists"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"

const route = getRouteApi("/_authenticated/admin/pomodoro-uploads")

type SortColumn = UploadSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "file", label: "File", column: "main", sortable: false },
  { key: "owner", label: "Owner", column: "meta" },
  { key: "size", label: "Size", column: "meta" },
  { key: "used", label: "In use", column: "meta", sortable: false },
  { key: "created", label: "Uploaded", column: "meta", className: "hidden 2xl:table-cell" },
]

const STATUS_LINE: Record<string, string> = {
  queued: "Waiting to be converted",
  processing: "Being converted",
  failed: "Failed",
}

/**
 * Every background and sound a member uploaded or had made by AI (admin task
 * 06, part 3), and deleting them through the shell's admin delete. See
 * `workspace/docs/own-media-uploads.md`.
 */
export function AdminUploadsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminUploadRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const purpose = search.purpose ?? "all"
  const userId = search.user
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroUploads({ search: query, purpose, user: userId, sort, direction, page, pageSize }),
    [direction, page, purpose, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "owner" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.mediaId), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "upload",
    many: "uploads",
    run: deletePomodoroUploads,
    keptReason: "already gone, or kept by the site",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.mediaId))
  const preview = usePreviewAudio()
  // Whose files these are, off the first row: every row the filter returns is theirs.
  const filteredOwner = userId ? (list.rows[0]?.ownerName ?? null) : null

  return (
    <>
      <AdminListTable
        title="Member uploads"
        icon={<FolderUpIcon />}
        noun="uploads"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "uploads", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            {userId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => setListSearch({ user: undefined, page: undefined })}
              >
                <XIcon className="size-4" />
                {filteredOwner ? `Only ${filteredOwner}` : "One member only"}
              </Button>
            ) : null}
            <DashboardToolbarSearch
              name="upload-search"
              aria-label="Search uploads"
              placeholder="Search owner or file name…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={purpose}
              onValueChange={(value) =>
                setListSearch({ purpose: value === "all" ? undefined : value, page: undefined })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by kind">
                <SelectValue placeholder="Kind" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Backgrounds and sounds</SelectItem>
                <SelectItem value="background">Backgrounds</SelectItem>
                <SelectItem value="sound">Sounds</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.mediaId}>
            <AdminSelectCell selection={selection} id={row.mediaId} label={`Select ${row.name}`} />
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-3">
                <UploadThumbnail kind={row.kind} url={row.url} />
                <div className="min-w-0">
                  <span className="block max-w-80 truncate text-sm font-medium" title={row.name}>
                    {row.name}
                  </span>
                  <span
                    className="block max-w-80 truncate text-xs text-muted-foreground"
                    title={row.failureReason ?? undefined}
                  >
                    {[
                      row.purpose === "background" ? "Background" : "Sound",
                      row.generated ? "Made by AI" : "Uploaded",
                      STATUS_LINE[row.status],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              <MemberName id={row.userId} name={row.ownerName} title={row.ownerEmail} className="max-w-48" />
            </TableCell>
            <TableCell column="meta">{formatFileSize(row.fileSize)}</TableCell>
            <TableCell column="meta">
              {row.usedAs.length ? (
                <span className="block max-w-40 truncate" title={row.usedAs.join(", ")}>
                  {row.usedAs.join(", ")}
                </span>
              ) : (
                <span className="text-muted-foreground">No</span>
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <PreviewPlayButton preview={preview} mediaId={row.mediaId} url={row.url} kind={row.kind} name={row.name} />
              <AdminRowDeleteButton del={del} id={row.mediaId} label={`Delete ${row.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "upload", "uploads")}?`}
        description={describeUploadDeletion(asked)}
        confirmLabel={plural(del.ids.length, "Delete upload", "Delete uploads")}
      />
    </>
  )
}

/** What the delete takes and who notices, from the rows on screen. */
function describeUploadDeletion(rows: { usedAs: string[] }[]) {
  const inUse = rows.filter((row) => row.usedAs.length).length
  return [
    "The file is removed from storage, and the owner loses it from their picker.",
    inUse
      ? `${inUse} ${plural(inUse, "is", "are")} in use: a room background goes back to the default scene, a room sound to silence, and a profile banner to none.`
      : null,
    "The owner is not told.",
    "This cannot be undone.",
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * The small picture at the front of a row: the image, a video's first frame,
 * or a music note for a sound. Always the same 36 by 56 box, ready or not, so
 * a file still converting never changes the row's height.
 */
export function UploadThumbnail({ kind, url }: { kind: string | null; url: string }) {
  if (url && kind === "image")
    return <img src={url} alt="" className="h-9 w-14 shrink-0 rounded-md object-cover" />
  if (url && kind === "video")
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-9 w-14 shrink-0 rounded-md bg-muted object-cover"
      />
    )
  return (
    <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      {kind === "audio" ? <MusicIcon className="size-4" /> : null}
    </span>
  )
}

/** Play and stop for a sound, on the page's own preview player. Nothing for pictures. */
export function PreviewPlayButton({
  preview,
  mediaId,
  url,
  kind,
  name,
}: {
  preview: ReturnType<typeof usePreviewAudio>
  mediaId: string | null
  url: string
  kind: string | null
  name: string
}) {
  if (!mediaId || !url || kind !== "audio") return null
  const playing =
    preview.playing && preview.previewing?.type === "media" && preview.previewing.mediaId === mediaId
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={playing}
      aria-label={playing ? `Stop ${name}` : `Play ${name}`}
      onClick={() => preview.toggle({ type: "media", mediaId, mediaUrl: url })}
    >
      {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
    </Button>
  )
}
