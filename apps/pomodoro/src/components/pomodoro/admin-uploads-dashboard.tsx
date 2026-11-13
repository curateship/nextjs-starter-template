import * as React from "react"
import { CheckIcon, EyeOffIcon, FolderUpIcon, MusicIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { ShareRowMenu, UnshareDialog, shareLabel, useShareActions } from "@/components/pomodoro/admin-share-actions"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { MediaPreview } from "@/components/pomodoro/flowfly/media-preview"
import { deletePomodoroUploads, listPomodoroUploads, type AdminUploadRow } from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { UPLOAD_PURPOSE_FILTERS, UploadSortColumn } from "@/lib/pomodoro/admin-lists"
import type { UploadSharingFilter } from "@/lib/pomodoro/shared-media-reports"

type SortColumn = UploadSortColumn

type UploadsSearch = {
  q?: string
  purpose?: (typeof UPLOAD_PURPOSE_FILTERS)[number]
  user?: string
  sharing?: UploadSharingFilter
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "file", label: "File", column: "main", sortable: false },
  { key: "owner", label: "Owner", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "size", label: "Size", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
  { key: "used", label: "In use", column: "meta", sortable: false, className: "hidden md:hidden @4xl:table-cell" },
  { key: "sharing", label: "Sharing", column: "meta", sortable: false },
  { key: "created", label: "Uploaded", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
]

const STATUS_LINE: Record<string, string> = {
  queued: "Waiting to be converted",
  processing: "Being converted",
  failed: "Failed",
}

/**
 * Library → Member uploads on the Flowfly dashboard: every background and
 * sound a member uploaded or had made by AI (admin task 06, part 3). A file
 * opens on the right with the picture to look at or the sound to play
 * (Tyler's pick "Upload with a preview"), Approve at the foot while a share
 * waits for its check, and the sharing menu (Unshare, Feature, Add to
 * catalogue) in its header. Filter narrows by kind and sharing. See
 * `workspace/docs/own-media-uploads.md`.
 */
export function AdminUploadsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminUploadRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<UploadsSearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const purpose = search.purpose ?? "all"
  const userId = search.user
  const sharing = search.sharing ?? "all"
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const load = React.useCallback(
    (pageSize: number) => listPomodoroUploads({ search: query, purpose, user: userId, sharing, sort, direction, page, pageSize }),
    [direction, page, purpose, query, sharing, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "owner" ? "asc" : "desc"))
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.mediaId), [list.rows])
  const del = useAdminDelete({
    one: "upload",
    many: "uploads",
    run: deletePomodoroUploads,
    keptReason: "already gone, or kept by the site",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.mediaId))
  const shareActions = useShareActions({ onDone: list.refresh })
  // One running action holds every other button on the list until it ends.
  const busy = shareActions.busy || del.deleting
  // Whose files these are, off the first row: every row the filter returns is theirs.
  const filteredOwner = userId ? (list.rows[0]?.ownerName ?? null) : null
  const subline = (row: AdminUploadRow) =>
    [row.purpose === "background" ? "Background" : "Sound", row.generated ? "Made by AI" : "Uploaded", STATUS_LINE[row.status]]
      .filter(Boolean)
      .join(" · ")

  return (
    <AdminListTable
      noun="uploads"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "uploads", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "upload-search",
        label: "Search uploads",
        placeholder: "Search owner or file name",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredOwner, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      filter={{
        count: (purpose !== "all" ? 1 : 0) + (sharing !== "all" ? 1 : 0),
        onClear: () => setListSearch({ purpose: undefined, sharing: undefined, page: undefined }),
        children: (
          <>
            <FilterPick
              id="uploads-kind"
              label="Kind"
              value={purpose === "all" ? undefined : purpose}
              any="Backgrounds and sounds"
              options={[
                ["background", "Backgrounds"],
                ["sound", "Sounds"],
              ]}
              onChange={(next) => setListSearch({ purpose: next, page: undefined })}
            />
            <FilterPick
              id="uploads-sharing"
              label="Sharing"
              value={sharing === "all" ? undefined : sharing}
              any="Shared or not"
              options={[
                ["shared", "Shared"],
                ["waiting", "Waiting to be shared"],
                ["taken_down", "Taken off sharing"],
              ]}
              onChange={(next) => setListSearch({ sharing: next, page: undefined })}
            />
          </>
        ),
      }}
      bulk={(ids, menu) => (
        <>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              void shareActions.approve(ids)
            }}
          >
            <CheckIcon className="size-4" />
            Approve
          </SelectedMenuRow>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              shareActions.setUnsharing(ids)
            }}
          >
            <EyeOffIcon className="size-4" />
            Unshare
          </SelectedMenuRow>
          <SelectedMenuRow
            className="text-destructive"
            onClick={() => {
              menu.close()
              del.ask(ids)
            }}
          >
            <Trash2Icon className="size-4" />
            Delete
          </SelectedMenuRow>
        </>
      )}
      bulkBusy={busy}
      rowIds={rowIds}
      record={{
        label: "Upload",
        content: (openId) => {
          const row = list.rows.find((each) => each.mediaId === openId)
          if (!row) return <NoRecord title="Upload" icon={<FolderUpIcon aria-hidden />} line="No member has uploaded anything yet." />
          return (
            <DetailRecord
              key={row.mediaId}
              icon={row.purpose === "sound" ? <MusicIcon aria-hidden /> : <FolderUpIcon aria-hidden />}
              title={row.name}
              line={`${row.ownerName} · ${formatFileSize(row.fileSize)}`}
              hideLabel="Hide the upload"
              actions={<ShareRowMenu row={row} actions={shareActions} busy={busy} />}
              facts={[
                ["Owner", <MemberName key="owner" id={row.userId} name={row.ownerName} title={row.ownerEmail} />],
                ["Kind", subline(row)],
                ["Size", formatFileSize(row.fileSize)],
                ["In use", row.usedAs.length ? row.usedAs.join(", ") : "No"],
                ["Sharing", shareLabel(row.share, row.featured) ?? "No"],
                ...(row.takenDownReason ? ([["Why it was taken off", row.takenDownReason]] as [string, string][]) : []),
                ["Uploaded", formatDate(row.createdAt)],
              ]}
              state={shareLabel(row.share, row.featured) ?? "Not shared"}
              footer={
                <>
                  {row.share === "waiting" ? (
                    <Button type="button" disabled={busy} onClick={() => void shareActions.approve([row.mediaId])}>
                      <CheckIcon />
                      Approve
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => del.ask([row.mediaId])}>
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              }
            >
              <MediaPreview kind={row.kind} url={row.url || null} />
            </DetailRecord>
          )
        },
      }}
      windows={
        <>
          <AdminDeleteConfirm
            del={del}
            title={`Delete ${del.ids.length} ${plural(del.ids.length, "upload", "uploads")}?`}
            description={describeUploadDeletion(asked)}
            confirmLabel={plural(del.ids.length, "Delete upload", "Delete uploads")}
          />
          <UnshareDialog actions={shareActions} />
        </>
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.mediaId} id={row.mediaId} label={row.name} onDelete={() => del.ask([row.mediaId])}>
          <MainCell name={row.name} lead={<UploadThumbnail kind={row.kind} url={row.url} />}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{subline(row)}</span>
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
            <MemberName id={row.userId} name={row.ownerName} title={row.ownerEmail} className="max-w-48" />
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @3xl:table-cell">
            {formatFileSize(row.fileSize)}
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            {row.usedAs.length ? <span className="block max-w-40 truncate">{row.usedAs.join(", ")}</span> : <span className="text-muted-foreground">No</span>}
          </TableCell>
          <TableCell column="meta">
            {shareLabel(row.share, row.featured) ? (
              <Chip muted={row.share !== "waiting"}>{shareLabel(row.share, row.featured)}</Chip>
            ) : (
              <span className="text-muted-foreground">No</span>
            )}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @5xl:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/** What the delete takes and who notices, from the rows on screen. */
function describeUploadDeletion(rows: { usedAs: string[] }[]) {
  const inUse = rows.filter((row) => row.usedAs.length).length
  return [
    "The file is removed from storage, and the owner loses it from their picker.",
    inUse
      ? `${inUse} ${plural(inUse, "is", "are")} in use: a room background goes back to the default background, a room sound to silence, and a profile banner to none.`
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
