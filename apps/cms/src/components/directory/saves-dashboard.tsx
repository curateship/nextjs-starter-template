import { BookmarkIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { loadMostSaved } from "@/lib/api/directory/saves"

type Rows = Awaited<ReturnType<typeof loadMostSaved>>

export function SavesDashboard({ rows }: { rows: Rows }) {
  return (
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
          <TableCell column="main" className="font-medium">{row.title}</TableCell>
          <TableCell column="meta">{row.saves}</TableCell>
          <TableCell column="meta">{row.people}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
