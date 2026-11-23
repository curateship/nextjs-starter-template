import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Table } from "@/components/ui/table"

type Column = "name" | "created"

const columns: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Name", column: "main" },
  { key: "tags", label: "Tags", sortable: false, column: "meta" },
  { key: "created", label: "Created", column: "meta" },
]

describe("SortableTableHeader", () => {
  it("announces the current direction and marks other sortable columns none", () => {
    const markup = renderToStaticMarkup(
      <Table>
        <SortableTableHeader
          columns={columns}
          sort="name"
          direction="asc"
          onSort={vi.fn()}
        />
      </Table>
    )

    expect(markup).toContain('aria-sort="ascending"')
    expect(markup).toContain('aria-sort="none"')
    expect(markup).not.toContain('aria-sort="descending"')
    expect(markup.match(/aria-sort=/g)).toHaveLength(2)
  })
})
