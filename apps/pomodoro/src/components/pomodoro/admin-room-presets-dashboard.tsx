import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListMusicIcon, PlusIcon, SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminListTable,
  AdminSelectCell,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { RoomPresetDialog } from "@/components/pomodoro/admin-room-dialogs"
import {
  deletePomodoroRoomPresets,
  listPomodoroRoomPresets,
  type RoomPreset,
} from "@/lib/api/pomodoro/admin-rooms"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { soundLabelFor, themeLabelFor } from "@/lib/pomodoro/media-pair"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"

type Column = "name"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Preset", column: "main", sortable: false },
]

/**
 * House room setups (admin task 04): a name, a rhythm and, if the admin
 * wants, a sound and theme. Hosts see them first in the Rhythm picker when
 * they open a room. A short list, so it is one page in the order made. See
 * `workspace/docs/rooms-admin.md`.
 */
export function AdminRoomPresetsDashboard({
  initial,
  catalog,
  openId,
}: {
  initial: RoomPreset[]
  catalog: MediaCatalog
  openId: string | undefined
}) {
  const navigate = useNavigate()
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
  const selection = useSelection()
  const load = React.useCallback(async () => {
    const rows = await listPomodoroRoomPresets()
    return { rows, total: rows.length }
  }, [])
  const list = useAdminList({
    initial: { rows: initial, total: initial.length },
    initialPageSize: 100,
    page: 1,
    onPageChange: () => {},
    load,
  })
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "preset",
    many: "presets",
    run: deletePomodoroRoomPresets,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })

  return (
    <>
      <AdminListTable
        title="Room presets"
        icon={<ListMusicIcon />}
        noun="presets"
        columns={COLUMNS}
        sort="name"
        direction="asc"
        onSort={() => {}}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "presets", rowIds, state: selection }}
        list={list}
        page={1}
        onPageChange={() => {}}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            <DashboardToolbarButton type="button" onClick={() => setOpen("new")}>
              <PlusIcon className="size-4" />
              New preset
            </DashboardToolbarButton>
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id} className="group" rowAction={() => setOpen(row.id)}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select ${row.name}`} />
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left font-medium group-hover:underline"
                onClick={() => setOpen(row.id)}
              >
                {row.name}
              </button>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                {row.focusMinutes} · {row.shortBreakMinutes} · {row.longBreakMinutes} min
                {row.autoStart ? " · auto" : ""}
                {row.sound ? ` · ${soundLabelFor(catalog, row.sound) ?? "a sound that is gone"}` : ""}
                {row.background ? ` · ${themeLabelFor(catalog, row.background) ?? "a theme that is gone"}` : ""}
              </span>
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Settings for ${row.name}`}
                onClick={() => setOpen(row.id)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              <AdminRowDeleteButton del={del} id={row.id} label={`Delete ${row.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <RoomPresetDialog
        openId={openId}
        presets={list.rows}
        catalog={catalog}
        onClose={() => setOpen(undefined)}
        onSaved={list.refresh}
        onDelete={(id) => del.ask([id])}
      />
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "preset", "presets")}?`}
        description="Hosts stop seeing them in the Rhythm picker. Rooms already made from them are not changed."
        confirmLabel={plural(del.ids.length, "Delete preset", "Delete presets")}
      />
    </>
  )
}
