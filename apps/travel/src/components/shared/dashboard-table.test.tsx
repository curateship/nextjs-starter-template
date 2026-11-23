import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

describe("DashboardTable states", () => {
  it("shows a retryable failure in the rows without also claiming the list is empty", () => {
    const markup = renderToStaticMarkup(
      <DashboardTable
        title="Accounts"
        count={0}
        error={{ message: "Accounts could not be loaded.", onRetry: vi.fn() }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Account</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty
        emptyText="No accounts yet."
        emptyColSpan={1}
        footer={{ type: "summary", count: 0, label: "accounts" }}
      >
        <TableRow>
          <TableCell>Hidden row</TableCell>
        </TableRow>
      </DashboardTable>
    )

    expect(markup).toContain("Accounts could not be loaded.")
    expect(markup).toContain(">Accounts</h2>")
    expect(markup).toContain("Try again")
    expect(markup).not.toContain("No accounts yet.")
    expect(markup).not.toContain("Hidden row")
  })

  it("keeps the Load more label in place while its spinner is visible", () => {
    const markup = renderToStaticMarkup(
      <LoadMoreButton loading onClick={vi.fn()} />
    )

    expect(markup).toContain("Load more")
    expect(markup).toContain("opacity-0")
    expect(markup).toContain("animate-spin")
    expect(markup).toContain("disabled")
  })
})
