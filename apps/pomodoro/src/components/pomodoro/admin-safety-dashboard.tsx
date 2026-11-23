import * as React from "react"
import { BanIcon, EyeOffIcon, ShieldAlertIcon, UndoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { ViewMenu } from "@/components/shared/view-menu"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  liftPomodoroSafety,
  listPomodoroSafety,
  type AdminHiddenProfileRow,
  type AdminRoomBanRow,
  type AdminSuspensionRow,
} from "@/lib/api/pomodoro/admin-safety"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { SafetyTab } from "@/lib/pomodoro/admin-lists"

type SafetyList =
  | { tab: "bans"; rows: AdminRoomBanRow[]; total: number }
  | { tab: "hidden"; rows: AdminHiddenProfileRow[]; total: number }
  | { tab: "suspensions"; rows: AdminSuspensionRow[]; total: number }
type SafetyRow = AdminRoomBanRow | AdminHiddenProfileRow | AdminSuspensionRow

type BansSearch = { q?: string; tab?: SafetyTab; page?: number }

const VIEWS: Record<SafetyTab, { label: string; icon: React.ReactNode; noun: [string, string]; lift: string }> = {
  bans: {
    label: "Room bans",
    icon: <BanIcon />,
    noun: ["room ban", "room bans"],
    lift: "They can join that room again. Nobody is told.",
  },
  hidden: {
    label: "Hidden profiles",
    icon: <EyeOffIcon />,
    noun: ["hidden profile", "hidden profiles"],
    lift: "Their public page reads again at once, and each owner is told in the bell.",
  },
  suspensions: {
    label: "Suspensions",
    icon: <ShieldAlertIcon />,
    noun: ["suspension", "suspensions"],
    lift: "They can join, open and chat in rooms again at once. Nobody is told.",
  },
}

type Column = "who"
const COLUMNS: TableHeaderColumn<Column>[] = [{ key: "who", label: "Who", column: "main", sortable: false }]

/**
 * Safety → Bans on the Flowfly dashboard: room bans, hidden profiles and
 * suspensions (admin task 05), picked in the header's view dropdown, each
 * with Lift on its row and over ticked rows. Suspensions show only while
 * they run; one ends by itself on its date. A row opens on the right with
 * who, why and since when. See `workspace/docs/admin-safety-tools.md`.
 */
export function AdminSafetyDashboard({
  initial,
  initialPageSize,
}: {
  initial: SafetyList
  initialPageSize: number
}) {
  const tab: SafetyTab = initial.tab
  const search = useFlowflySearch<BansSearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const load = React.useCallback(
    async (pageSize: number) => {
      const result = await listPomodoroSafety({ tab, search: query, page, pageSize })
      return { rows: result.rows as SafetyRow[], total: result.total }
    },
    [page, query, tab]
  )
  const list = useAdminList<SafetyRow>({ initial, initialPageSize, page, onPageChange: setPage, load })
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const [one, many] = VIEWS[tab].noun
  const lift = useAdminDelete({
    one,
    many,
    run: async (ids) => {
      const { changed, skipped } = await liftPomodoroSafety(tab, ids)
      return { deleted: changed, skipped }
    },
    verb: "lifted",
    keptReason: "already lifted",
    selection,
    onDone: list.refresh,
  })
  const personId = (row: SafetyRow) => ("userId" in row ? row.userId : row.id)

  return (
    <AdminListTable
      noun={many}
      columns={COLUMNS}
      sort="who"
      direction="desc"
      onSort={() => {}}
      selection={{ noun: many, rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "safety-search",
        label: `Search ${many}`,
        placeholder: tab === "bans" ? "Search name, email or room" : "Search name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      view={
        <ViewMenu
          label="Which bans"
          value={tab}
          // A search belongs to the view it was typed on, so a new view starts empty.
          onValueChange={(value) => setListSearch({ tab: value === "bans" ? undefined : value, q: undefined, page: undefined, open: undefined })}
          choices={(Object.keys(VIEWS) as SafetyTab[]).map((value) => ({ value, label: VIEWS[value].label }))}
        />
      }
      bulk={(ids, menu) => (
        <SelectedMenuRow
          onClick={() => {
            menu.close()
            lift.ask(ids)
          }}
        >
          <UndoIcon className="size-4" />
          Lift
        </SelectedMenuRow>
      )}
      bulkBusy={lift.deleting}
      rowIds={rowIds}
      record={{
        label: VIEWS[tab].label.replace(/s$/, ""),
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title={VIEWS[tab].label} icon={VIEWS[tab].icon} line={`No ${many} right now.`} />
          return (
            <DetailRecord
              key={row.id}
              icon={VIEWS[tab].icon}
              title={row.name}
              line={row.email}
              hideLabel={`Hide the ${one}`}
              facts={[
                ["Who", <MemberName key="who" id={personId(row)} name={row.name} title={row.email} />],
                ...safetyFacts(row),
              ]}
              state={VIEWS[tab].label.replace(/s$/, "")}
              footer={
                <Button type="button" variant="outline" onClick={() => lift.ask([row.id])}>
                  <UndoIcon />
                  Lift
                </Button>
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={lift}
          title={`Lift ${lift.ids.length} ${plural(lift.ids.length, one, many)}?`}
          description={VIEWS[tab].lift}
          confirmLabel="Lift"
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={`the ${one} for ${row.name}`}>
          <MainCell name={row.name}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              <RowDetail row={row} />
            </span>
          </MainCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/** A row's facts on the right, by kind. */
function safetyFacts(row: SafetyRow): [string, React.ReactNode][] {
  if ("roomName" in row) {
    return [
      ["Room", row.roomName],
      ["Banned by", row.bannedByName],
      ["When", formatDateTime(row.createdAt)],
    ]
  }
  if ("hiddenAt" in row) {
    return [
      ["Address", row.handle ? `/u/${row.handle}` : "None"],
      ["Hidden", row.hiddenAt ? formatDateTime(row.hiddenAt) : "None"],
      ["Reported for", row.reportReason ?? "None"],
    ]
  }
  return [
    ["Until", row.endsAt ? formatDate(row.endsAt) : "Lifted by hand"],
    ["Why", row.reason],
    ["By", row.suspendedByName ?? "None"],
  ]
}

/** What each kind of row says under the name. */
function RowDetail({ row }: { row: SafetyRow }) {
  if ("roomName" in row) {
    return (
      <>
        Banned from {row.roomName} by {row.bannedByName} · {formatDateTime(row.createdAt)}
      </>
    )
  }
  if ("hiddenAt" in row) {
    return (
      <>
        {row.handle ? `/u/${row.handle}` : "No address"} · hidden {row.hiddenAt ? formatDateTime(row.hiddenAt) : ""}
        {row.reportReason ? ` · reported for "${row.reportReason}"` : ""}
      </>
    )
  }
  return (
    <>
      {row.endsAt ? `Until ${formatDate(row.endsAt)}` : "Until lifted"} · {row.reason}
      {row.suspendedByName ? ` · by ${row.suspendedByName}` : ""}
    </>
  )
}
