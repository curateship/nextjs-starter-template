import * as React from "react"
import { SparklesIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { UploadThumbnail } from "@/components/pomodoro/admin-uploads-dashboard"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { MediaPreview } from "@/components/pomodoro/flowfly/media-preview"
import {
  deletePomodoroGenerationFiles,
  listPomodoroGenerations,
  type AdminGenerationRow,
} from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { GENERATION_KIND_FILTERS, GENERATION_STATUS_FILTERS, GenerationSortColumn } from "@/lib/pomodoro/admin-lists"

type SortColumn = GenerationSortColumn

type GenerationsSearch = {
  q?: string
  kind?: (typeof GENERATION_KIND_FILTERS)[number]
  status?: (typeof GENERATION_STATUS_FILTERS)[number]
  user?: string
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "prompt", label: "Prompt", column: "main", sortable: false },
  { key: "person", label: "Asked by", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "status", label: "Result", column: "meta" },
  { key: "created", label: "Asked", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
]

const STATUS_LOOK: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  queued: { label: "Waiting", variant: "outline" },
  running: { label: "Making", variant: "default" },
  ready: { label: "Worked", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
}

const PROVIDER_NAMES: Record<string, string> = { gemini: "Google", elevenlabs: "ElevenLabs" }

/**
 * Library → AI generations on the Flowfly dashboard: every AI background
 * and soundscape a member asked for (admin task 06, part 12), the prompt,
 * what came back and who asked. Delete removes the file and keeps the
 * request on record. A request opens on the right with the file itself to
 * look at or play. See `workspace/docs/ai-generation.md`.
 */
export function AdminGenerationsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminGenerationRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<GenerationsSearch>()
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
  const load = React.useCallback(
    (pageSize: number) => listPomodoroGenerations({ search: query, kind, status, user: userId, sort, direction, page, pageSize }),
    [direction, kind, page, query, sort, status, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "created" ? "desc" : "asc"))
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const del = useAdminDelete({
    one: "file",
    many: "files",
    run: deletePomodoroGenerationFiles,
    keptReason: "had no file to delete",
    selection,
    onDone: list.refresh,
  })
  const filteredOwner = userId ? (list.rows[0]?.ownerName ?? null) : null
  const look = (row: AdminGenerationRow) => STATUS_LOOK[row.status] ?? { label: row.status, variant: "outline" as const }
  const subline = (row: AdminGenerationRow) =>
    [
      row.kind === "background" ? "Background" : "Soundscape",
      `${PROVIDER_NAMES[row.provider] ?? row.provider} ${row.model}`,
      row.status === "ready" && !row.mediaId ? "File deleted" : null,
    ]
      .filter(Boolean)
      .join(" · ")

  return (
    <AdminListTable
      noun="generations"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "generations", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "generation-search",
        label: "Search generations",
        placeholder: "Search prompt, name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredOwner, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      filter={{
        count: (kind !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0),
        onClear: () => setListSearch({ kind: undefined, status: undefined, page: undefined }),
        children: (
          <>
            <FilterPick
              id="generations-kind"
              label="Kind"
              value={kind === "all" ? undefined : kind}
              any="Backgrounds and soundscapes"
              options={[
                ["background", "Backgrounds"],
                ["soundscape", "Soundscapes"],
              ]}
              onChange={(next) => setListSearch({ kind: next, page: undefined })}
            />
            <FilterPick
              id="generations-result"
              label="Result"
              value={status === "all" ? undefined : status}
              any="Every result"
              options={[
                ["ready", "Worked"],
                ["failed", "Failed"],
                ["running", "Making"],
                ["queued", "Waiting"],
              ]}
              onChange={(next) => setListSearch({ status: next, page: undefined })}
            />
          </>
        ),
      }}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            del.ask(ids)
          }}
        >
          <Trash2Icon className="size-4" />
          Delete files
        </SelectedMenuRow>
      )}
      bulkBusy={del.deleting}
      rowIds={rowIds}
      record={{
        label: "Generation",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Generation" icon={<SparklesIcon aria-hidden />} line="No member has asked AI for anything yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<SparklesIcon aria-hidden />}
              title={row.prompt}
              line={subline(row)}
              hideLabel="Hide the generation"
              facts={[
                ["Asked by", <MemberName key="owner" id={row.userId} name={row.ownerName} title={row.ownerEmail} />],
                ["Kind", row.kind === "background" ? "Background" : "Soundscape"],
                ["Made with", `${PROVIDER_NAMES[row.provider] ?? row.provider} ${row.model}`],
                ["Asked", formatDateTime(row.createdAt)],
                ...(row.status === "failed" && row.failureReason ? ([["Why it failed", row.failureReason]] as [string, string][]) : []),
              ]}
              state={look(row).label}
              footer={
                row.mediaId ? (
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                    <Trash2Icon />
                    Delete the file
                  </Button>
                ) : null
              }
            >
              {row.status === "ready" ? (
                <MediaPreview kind={row.fileType ?? (row.kind === "soundscape" ? "audio" : "image")} url={row.mediaId ? row.url : null} />
              ) : null}
            </DetailRecord>
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={del}
          title={`Delete ${del.ids.length} ${plural(del.ids.length, "file", "files")}?`}
          description="The file is removed from storage and from the member's picker. A room background using it goes back to the default background, a room sound to silence. The request stays on this list with its prompt and result, marked File deleted. The credit is not given back, and the member is not told. This cannot be undone."
          confirmLabel={plural(del.ids.length, "Delete file", "Delete files")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={`the ${row.kind === "background" ? "background" : "soundscape"} "${row.prompt}"`}
          tickable={Boolean(row.mediaId)}
          onDelete={row.mediaId ? () => del.ask([row.id]) : undefined}
        >
          <MainCell name={row.prompt} lead={<UploadThumbnail kind={row.fileType ?? (row.kind === "soundscape" ? "audio" : null)} url={row.url} />}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{subline(row)}</span>
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
            <MemberName id={row.userId} name={row.ownerName} title={row.ownerEmail} className="max-w-48" />
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.status !== "failed"}>{look(row).label}</Chip>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
