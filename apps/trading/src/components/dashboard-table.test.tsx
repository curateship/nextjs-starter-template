import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DashboardTable } from "@/components/dashboard-table"
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

describe("DashboardTable", () => {
  // Loading renders an empty body on purpose — no skeleton placeholders
  // (ui-rules: no first-load skeletons) and no premature empty-state text.
  it("renders no rows and no empty state while data is loading", () => {
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

    expect(markup.match(/data-slot="skeleton"/g)).toBeNull()
    expect(markup).not.toContain("No results.")
    expect(markup).toContain("<tbody")
  })
})
