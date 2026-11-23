import * as React from "react"
import { ListMusicIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { RoomPresetDialog } from "@/components/pomodoro/admin-room-dialogs"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { deletePomodoroRoomPresets, listPomodoroRoomPresets, type RoomPreset } from "@/lib/api/pomodoro/admin-rooms"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { soundLabelFor, themeLabelFor } from "@/lib/pomodoro/media-pair"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"

type Column = "name"

const COLUMNS: TableHeaderColumn<Column>[] = [{ key: "name", label: "Preset", column: "main", sortable: false }]

/**
 * Rooms → Presets on the Flowfly dashboard: house room setups (admin task
 * 04), a name, a rhythm and, if the admin wants, a sound and background.
 * Hosts see them first in the Rhythm picker when they open a room. A short
 * list, so it is one page in the order made, with no search. A preset opens
 * on the right; New preset and Change open the preset window, since a
 * preset asks for its rhythm, sound and background when it is made. See
 * `workspace/docs/rooms-admin.md`.
 */
export function AdminRoomPresetsDashboard({ initial, catalog }: { initial: RoomPreset[]; catalog: MediaCatalog }) {
  // The preset window: a preset's id, "new", or shut.
  const [windowFor, setWindowFor] = React.useState<string | undefined>(undefined)
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
  const del = useAdminDelete({
    one: "preset",
    many: "presets",
    run: deletePomodoroRoomPresets,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const rhythm = (row: RoomPreset) => `${row.focusMinutes} · ${row.shortBreakMinutes} · ${row.longBreakMinutes} min`

  return (
    <AdminListTable
      noun="presets"
      columns={COLUMNS}
      sort="name"
      direction="asc"
      onSort={() => {}}
      selection={{ noun: "presets", rowIds, state: selection }}
      list={list}
      page={1}
      onPageChange={() => {}}
      search={null}
      primary={
        <DashboardToolbarButton type="button" onClick={() => setWindowFor("new")}>
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New preset</span>
        </DashboardToolbarButton>
      }
      bulk={(ids, menu) => (
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
      )}
      bulkBusy={del.deleting}
      emptyText="No house presets yet. New preset makes one."
      rowIds={rowIds}
      record={{
        label: "Preset",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Preset" icon={<ListMusicIcon aria-hidden />} line="No house presets yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<ListMusicIcon aria-hidden />}
              title={row.name}
              line={rhythm(row)}
              hideLabel="Hide the preset"
              facts={[
                ["Focus", `${row.focusMinutes} min`],
                ["Short break", `${row.shortBreakMinutes} min`],
                ["Long break", `${row.longBreakMinutes} min`],
                ["Starts by itself", row.autoStart ? "Yes" : "No"],
                ["Sound", row.sound ? (soundLabelFor(catalog, row.sound) ?? "A sound that is gone") : "None"],
                ["Background", row.background ? (themeLabelFor(catalog, row.background) ?? "A background that is gone") : "None"],
              ]}
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => setWindowFor(row.id)}>
                    <SettingsIcon />
                    Change
                  </Button>
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              }
            />
          )
        },
      }}
      windows={
        <>
          <RoomPresetDialog
            openId={windowFor}
            presets={list.rows}
            catalog={catalog}
            onClose={() => setWindowFor(undefined)}
            onSaved={list.refresh}
            onDelete={(id) => {
              setWindowFor(undefined)
              del.ask([id])
            }}
          />
          <AdminDeleteConfirm
            del={del}
            title={`Delete ${del.ids.length} ${plural(del.ids.length, "preset", "presets")}?`}
            description="Hosts stop seeing them in the Rhythm picker. Rooms already made from them are not changed."
            confirmLabel={plural(del.ids.length, "Delete preset", "Delete presets")}
          />
        </>
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={row.name} onDelete={() => del.ask([row.id])}>
          <MainCell name={row.name}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {rhythm(row)}
              {row.autoStart ? " · auto" : ""}
              {row.sound ? ` · ${soundLabelFor(catalog, row.sound) ?? "a sound that is gone"}` : ""}
              {row.background ? ` · ${themeLabelFor(catalog, row.background) ?? "a background that is gone"}` : ""}
            </span>
          </MainCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
