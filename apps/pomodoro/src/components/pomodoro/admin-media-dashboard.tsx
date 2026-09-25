import * as React from "react"
import { ImageIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableRow } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { curatedBackgrounds } from "@/lib/pomodoro/background-catalog"
import { curatedSounds } from "@/lib/pomodoro/sound-catalog"
import type { AdminMediaUsage } from "@/lib/api/pomodoro/admin"

type SortColumn = "name" | "kind" | "access" | "chosen"

type MediaRow = {
  key: string
  name: string
  kind: string
  locked: boolean
  chosenBy: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Media", column: "main" },
  { key: "kind", label: "Kind", column: "meta" },
  { key: "access", label: "Access", column: "meta" },
  { key: "chosen", label: "Chosen by", column: "meta" },
]

/**
 * The scenes and loops the app ships, and how many accounts have each one
 * selected right now.
 *
 * There is no media table to manage: the catalogue is eight background scenes
 * and eight sound loops fixed in code, and the files ship with the app. What
 * the database knows, and this page shows, is what people picked. Files a
 * member uploaded are the shell's own media library at /admin/media, not this
 * page, and they are counted here under one "Their own upload" row.
 */
export function AdminMediaDashboard({ usage }: { usage: AdminMediaUsage }) {
  const rows = React.useMemo(() => buildRows(usage), [usage])
  const { sort, direction, toggleSort } = useTableSort<SortColumn>(
    "chosen",
    "desc",
    (column) => (column === "chosen" ? "desc" : "asc")
  )

  // Sixteen rows and two loops, so the whole catalogue sorts in the browser
  // and the page never asks the server for a different order.
  const sorted = React.useMemo(() => {
    const value = {
      name: (row: MediaRow) => row.name,
      kind: (row: MediaRow) => row.kind,
      access: (row: MediaRow) => (row.locked ? "Pro" : "Free"),
      chosen: (row: MediaRow) => row.chosenBy,
    }[sort]
    const flip = direction === "asc" ? 1 : -1

    return [...rows].sort((left, right) => {
      const a = value(left)
      const b = value(right)
      if (a === b) return left.name.localeCompare(right.name)
      if (typeof a === "number" && typeof b === "number") {
        return (a - b) * flip
      }
      return String(a).localeCompare(String(b)) * flip
    })
  }, [direction, rows, sort])

  return (
    <DashboardTable
      title="Media"
      icon={<ImageIcon />}
      count={sorted.length}
      header={
        <SortableTableHeader
          columns={COLUMNS}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
        />
      }
      isEmpty={false}
      emptyText="No media."
      emptyColSpan={COLUMNS.length}
      footer={{ type: "summary", count: sorted.length, label: "items" }}
    >
      {sorted.map((row) => (
        <TableRow key={`${row.kind}:${row.key}`}>
          <TableCell column="main">{row.name}</TableCell>
          <TableCell column="meta">{row.kind}</TableCell>
          <TableCell column="meta">
            <Badge variant={row.locked ? "default" : "outline"}>
              {row.locked ? "Pro" : "Free"}
            </Badge>
          </TableCell>
          <TableCell column="meta">{row.chosenBy.toLocaleString()}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

/**
 * The catalogue joined to the tallies. An upload gets one row per kind rather
 * than one per file, because the files themselves belong to the shell's media
 * library and listing them twice would give an operator two places to look.
 */
function buildRows(usage: AdminMediaUsage): MediaRow[] {
  const scenes = curatedBackgrounds.map((scene) => ({
    key: scene.key,
    name: scene.label,
    kind: "Background",
    locked: scene.locked,
    chosenBy: usage.backgrounds[scene.key] ?? 0,
  }))
  const sounds = curatedSounds.map((sound) => ({
    key: sound.key,
    name: sound.label,
    kind: "Sound",
    locked: sound.locked,
    chosenBy: usage.sounds[sound.key] ?? 0,
  }))

  return [
    ...scenes,
    ...sounds,
    {
      key: "media",
      name: "Their own upload",
      kind: "Background",
      locked: false,
      chosenBy: usage.backgrounds.media ?? 0,
    },
    {
      key: "media",
      name: "Their own upload",
      kind: "Sound",
      locked: false,
      chosenBy: usage.sounds.media ?? 0,
    },
  ]
}
