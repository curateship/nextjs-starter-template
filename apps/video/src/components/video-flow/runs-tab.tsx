import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { FlowRunListItem } from "@/lib/api/video/flow"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { formatCents } from "@/lib/video/project-spend"
import type { FlowSearch } from "@/lib/video/flow/flow-search"
import { FLOW_RUN_STATUS_LABELS } from "@/lib/video/flow/run-shape"
import { runStatusClass } from "@/lib/video/flow/run-view"
import { cn } from "@/lib/utils"

type RunSort = "flow" | "project" | "status" | "started"

/**
 * The Runs section: every run, newest first, in the CRM's one table shape.
 * A press on a row opens its steps page in the middle, as a press on an
 * automation opens its canvas; the table has no right panel. Runs only come
 * from Run on a flow, so there is no New button.
 */
export function RunsTab({
  runs,
  search,
  heading,
  headingEnd,
  frame,
}: {
  runs: FlowRunListItem[]
  search: FlowSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const q = search.q ?? ""
  const [sort, setSort] = React.useState<RunSort>("started")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const toggleSort = (column: RunSort) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection(column === "started" ? "desc" : "asc")
  }
  const shown = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    return runs
      .filter((run) => !query || `${run.flowName} ${run.projectName ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "flow") return sign * a.flowName.localeCompare(b.flowName)
        if (sort === "project") return sign * (a.projectName ?? "").localeCompare(b.projectName ?? "")
        if (sort === "status") return sign * a.status.localeCompare(b.status)
        return sign * a.createdAt.localeCompare(b.createdAt)
      })
  }, [runs, q, sort, direction])

  const columns: TableHeaderColumn<RunSort>[] = [
    { key: "flow", label: "Run", column: "main", className: "!min-w-0" },
    { key: "project", label: "Project", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    { key: "status", label: "State", column: "meta" },
    { key: "started", label: "Started", column: "meta", className: "hidden md:hidden @xl:table-cell" },
  ]

  return frame({
    // No right panel, so nothing opens on arrival: a press opens the steps page.
    ids: [],
    showMiddleFor: `runs|${q}`,
    right: null,
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <CrmListHeader
          tabs={heading}
          end={headingEnd}
          menuLabel="More for runs"
          search={{
            name: "flow-run-search",
            label: "Search runs",
            placeholder: "Search runs",
            value: q,
            onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
          }}
          massSelect={null}
        />
        <CrmTable<RunSort>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          actions={false}
          empty={
            shown.length > 0 ? null : q.trim() ? (
              <span className="grid justify-items-center gap-2">
                {`No run matches "${q.trim()}".`}
                <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                  Clear filters
                </Button>
              </span>
            ) : (
              "No runs yet. Run a flow from the Flows section to make the first one."
            )
          }
        >
          {shown.map((run) => (
            <CrmTableRow
              key={run.id}
              open={false}
              label={run.flowName}
              onOpen={() => void navigate({ to: "/admin/video-flow", search: { tab: "runs", run: run.id } })}
            >
              <TableCell column="main" className="!min-w-0 max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <OpenBar />
                  <span data-row-name="" className="truncate font-medium">
                    {run.flowName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {run.stepsDone} of {run.stepCount}
                    {run.spentCents ? `, ${formatCents(run.spentCents)}` : ""}
                  </span>
                </span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                <span className="block max-w-48 truncate text-muted-foreground">{run.projectName ?? "Not saved yet"}</span>
              </TableCell>
              <TableCell column="meta">
                <Chip className={cn(runStatusClass(run.status))}>{FLOW_RUN_STATUS_LABELS[run.status]}</Chip>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                <span className="whitespace-nowrap">{formatInboxTime(run.createdAt)}</span>
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
      </div>
    ),
  })
}
