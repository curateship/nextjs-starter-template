import { BookmarkIcon } from "lucide-react"

import { AdminSavedListsTable } from "@/components/directory/admin-saved-lists-table"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  loadSavesAdmin,
  SavedListsSearch,
} from "@/lib/api/directory/saves"

type Data = Awaited<ReturnType<typeof loadSavesAdmin>>

export function SavesDashboard({
  data,
  search,
}: {
  data: Data
  search: SavedListsSearch
}) {
  const rows = data.mostSaved
  return (
    <>
      <AdminSavedListsTable data={data.savedLists} search={search} />
      <DashboardTable
        title="Most saved listings"
        icon={<BookmarkIcon className="text-muted-foreground" />}
        count={rows.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Listing</TableHead>
              <TableHead column="meta">Saves</TableHead>
              <TableHead column="meta">People</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={rows.length === 0}
        emptyText="No listings have been saved on this site yet."
        emptyColSpan={3}
        footer={{ type: "summary", count: rows.length, label: "listings" }}
      >
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell column="main" className="font-medium">
              {row.title}
            </TableCell>
            <TableCell column="meta">{row.saves}</TableCell>
            <TableCell column="meta">{row.people}</TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </>
  )
}
