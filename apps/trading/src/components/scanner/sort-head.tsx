import { TableHead, TableSortButton } from "@/components/ui/table"

export type SortDir = "asc" | "desc"

/**
 * A sortable column header. Clicking an inactive column sorts it descending;
 * clicking the active column toggles direction. Works for both server-sorted
 * (search-param) and client-sorted tables — the parent decides what `onSort`
 * does with the next {sortBy, dir}.
 */
export function SortHead<K extends string>({
  sortKey,
  label,
  activeKey,
  dir,
  onSort,
  column = "meta",
}: {
  sortKey: K
  label: string
  activeKey: K
  dir: SortDir
  onSort: (next: { sortBy: K; dir: SortDir }) => void
  column?: "main" | "meta"
}) {
  const active = activeKey === sortKey
  return (
    <TableHead column={column}>
      <TableSortButton
        active={active}
        direction={dir}
        onClick={() =>
          onSort({
            sortBy: sortKey,
            dir: active && dir === "desc" ? "asc" : "desc",
          })
        }
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}
