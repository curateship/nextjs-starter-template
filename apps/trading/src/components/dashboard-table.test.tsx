import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DashboardTable } from "@/components/dashboard-table"
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

describe("DashboardTable", () => {
  it("renders skeleton rows while data is loading", () => {
    const markup = renderToStaticMarkup(
      <DashboardTable
        title="Results"
        count={0}
        loading
        header={
          <TableHeader>
            <TableRow>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty
        emptyText="No results."
        emptyColSpan={1}
        footer={{ type: "summary", count: 0 }}
      >
        {null}
      </DashboardTable>
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup.match(/data-slot="skeleton"/g)).toHaveLength(6)
    expect(markup).not.toContain("No results.")
  })
})
