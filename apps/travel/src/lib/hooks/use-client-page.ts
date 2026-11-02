import * as React from "react"

/**
 * The client half of a paged table: slice the sorted rows to the current page
 * and hand `DashboardTable` its pagination footer ready-made.
 *
 * The page clamps rather than errors — deleting the last row of the last page
 * lands on the new last page, not an empty one. A dashboard that wants a
 * search or sort change to jump back to page 1 passes those values joined as
 * `resetKey`; one that would rather keep your place passes nothing.
 */
export function useClientPage<Row>(
  rows: Row[],
  defaultPageSize: number,
  resetKey?: unknown
) {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(defaultPageSize)

  // State follows a prop, so it adjusts during render, not in an effect.
  const [lastResetKey, setLastResetKey] = React.useState(resetKey)
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setPage(1)
  }

  const totalPages = rows.length ? Math.ceil(rows.length / pageSize) : 0
  const currentPage = Math.min(page, Math.max(1, totalPages))
  const visible = React.useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize]
  )

  const footer = {
    type: "pagination" as const,
    page: currentPage,
    pageSize,
    total: rows.length,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPage(1)
      setPageSize(size)
    },
  }

  return { page: currentPage, setPage, pageSize, visible, totalPages, footer }
}
