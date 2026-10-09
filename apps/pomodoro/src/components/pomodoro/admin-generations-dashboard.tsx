import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { SparklesIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { PreviewPlayButton, UploadThumbnail } from "@/components/pomodoro/admin-uploads-dashboard"
import {
  deletePomodoroGenerationFiles,
  listPomodoroGenerations,
  type AdminGenerationRow,
} from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import type { GenerationSortColumn } from "@/lib/pomodoro/admin-lists"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"

const route = getRouteApi("/_authenticated/admin/pomodoro-generations")

type SortColumn = GenerationSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "prompt", label: "Prompt", column: "main", sortable: false },
  { key: "person", label: "Asked by", column: "meta" },
  { key: "status", label: "Result", column: "meta" },
  { key: "created", label: "Asked", column: "meta", className: "hidden 2xl:table-cell" },
]

const STATUS_LOOK: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  queued: { label: "Waiting", variant: "outline" },
  running: { label: "Making", variant: "default" },
  ready: { label: "Worked", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
}

const PROVIDER_NAMES: Record<string, string> = { gemini: "Google", elevenlabs: "ElevenLabs" }

/**
 * Every AI background and soundscape a member asked for (admin task 06, part
 * 12): the prompt, what came back and who asked. Delete removes the file and
 * keeps the request on record. See `workspace/docs/ai-generation.md`.
 */
export function AdminGenerationsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminGenerationRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const kind = search.kind ?? "all"
  const status = search.status ?? "all"
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
      listPomodoroGenerations({ search: query, kind, status, user: userId, sort, direction, page, pageSize }),
    [direction, kind, page, query, sort, status, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" ? "desc" : "asc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "file",
    many: "files",
    run: deletePomodoroGenerationFiles,
    keptReason: "had no file to delete",
    selection,
    onDone: list.refresh,
  })
  const preview = usePreviewAudio()
  const filteredOwner = userId ? (list.rows[0]?.ownerName ?? null) : null

  return (
    <>
      <AdminListTable
        title="AI generations"
        icon={<SparklesIcon />}
        noun="generations"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "generations", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} label="Delete files" />
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
              name="generation-search"
              aria-label="Search generations"
              placeholder="Search prompt, name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={kind}
              onValueChange={(value) => setListSearch({ kind: value === "all" ? undefined : value, page: undefined })}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by kind">
                <SelectValue placeholder="Kind" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Backgrounds and soundscapes</SelectItem>
                <SelectItem value="background">Backgrounds</SelectItem>
                <SelectItem value="soundscape">Soundscapes</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => setListSearch({ status: value === "all" ? undefined : value, page: undefined })}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by result">
                <SelectValue placeholder="Result" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every result</SelectItem>
                <SelectItem value="ready">Worked</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Making</SelectItem>
                <SelectItem value="queued">Waiting</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => {
          const look = STATUS_LOOK[row.status] ?? { label: row.status, variant: "outline" as const }
          const what = row.kind === "background" ? "background" : "soundscape"
          return (
            <TableRow key={row.id}>
              <AdminSelectCell selection={selection} id={row.id} label={`Select the ${what} "${row.prompt}"`} />
              <TableCell column="main">
                <div className="flex min-w-0 items-center gap-3">
                  <UploadThumbnail kind={row.fileType ?? (row.kind === "soundscape" ? "audio" : null)} url={row.url} />
                  <div className="min-w-0">
                    <span className="block max-w-80 truncate text-sm" title={row.prompt}>
                      {row.prompt}
                    </span>
                    <span className="block max-w-80 truncate text-xs text-muted-foreground">
                      {[
                        row.kind === "background" ? "Background" : "Soundscape",
                        `${PROVIDER_NAMES[row.provider] ?? row.provider} ${row.model}`,
                        row.status === "ready" && !row.mediaId ? "File deleted" : null,
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
              <TableCell column="meta">
                <Badge variant={look.variant}>{look.label}</Badge>
                {row.status === "failed" && row.failureReason ? (
                  <span className="block max-w-48 truncate text-xs text-muted-foreground" title={row.failureReason}>
                    {row.failureReason}
                  </span>
                ) : null}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
                {formatDateTime(row.createdAt)}
              </TableCell>
              <TableCell column="actions">
                <PreviewPlayButton
                  preview={preview}
                  mediaId={row.mediaId}
                  url={row.url}
                  kind={row.fileType}
                  name={row.prompt}
                />
                {row.mediaId ? (
                  <AdminRowDeleteButton del={del} id={row.id} label={`Delete the file made for "${row.prompt}"`} />
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "file", "files")}?`}
        description="The file is removed from storage and from the member's picker. A room background using it goes back to the default scene, a room sound to silence. The request stays on this page with its prompt and result, marked File deleted. The credit is not given back, and the member is not told. This cannot be undone."
        confirmLabel={plural(del.ids.length, "Delete file", "Delete files")}
      />
    </>
  )
}
