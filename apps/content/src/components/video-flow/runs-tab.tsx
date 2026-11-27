import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { PlayIcon, Trash2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { ListHeader } from "@/components/content-app/list-header"
import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import { deleteFlowRuns, getFlowErrorMessage, type FlowRunListItem } from "@/lib/api/video/flow"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { formatCents } from "@/lib/video/project-spend"
import type { FlowSearch } from "@/lib/video/flow/flow-search"
import { FLOW_RUN_STATUS_LABELS } from "@/lib/video/flow/run-shape"
import { runStatusClass } from "@/lib/video/flow/run-view"
import { cn } from "@/lib/utils"

import { RunPanel } from "./run-panel"

type RunSort = "flow" | "project" | "status" | "started"

/**
 * The Runs section: every run, newest first, in the CRM's one table shape.
 * A press on a row opens its steps page in the middle, as a press on an
 * automation opens its canvas; its cog shows the run on the right, where it
 * is renamed, and its bin deletes it (Tyler, 14 Nov 2026: "add an action col
 * for the runs table with mass select. Also need ability to edit the run
 * like title"). Select ticks runs to delete together. Runs only come from
 * Run on a flow, so there is no New button.
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
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
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

  const ids = shown.map((run) => run.id)
  const openId = search.open && ids.includes(search.open) ? search.open : ids[0]
  const openRun = runs.find((run) => run.id === openId) ?? null
  const goToRun = (runId: string) => void navigate({ to: "/admin/video-flow", search: { tab: "runs", run: runId } })

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, `${q}|${sort}|${direction}`)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const tickedCount = selection.selected.size

  // One run from its bin, ⋮ or right-click, or the ticked ones together.
  const [deleting, setDeleting] = React.useState<{ ids: string[]; name: string | null } | null>(null)
  const closingDelete = useLastValue(deleting)
  const [runDelete, deleteBusy] = useAsyncAction(getFlowErrorMessage)
  const removeRuns = () => {
    const target = deleting
    if (!target) return
    void runDelete(async () => {
      await deleteFlowRuns(target.ids)
      const gone = new Set(target.ids)
      selection.setSelected((current) => new Set([...current].filter((id) => !gone.has(id))))
      if (search.open && gone.has(search.open)) setListSearch({ open: undefined })
      setDeleting(null)
      await router.invalidate()
    })
  }
  const deleteOne = (run: FlowRunListItem) => setDeleting({ ids: [run.id], name: run.flowName })

  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const rightClicked = rightClick ? runs.find((run) => run.id === rightClick.id) : undefined
  const rowMenuItems = (run: FlowRunListItem): RowMenuItem[] => [
    { label: "Open the run", icon: <PlayIcon className="size-4" />, onSelect: () => goToRun(run.id) },
    { label: "Delete run", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => deleteOne(run) },
  ]

  const columns: TableHeaderColumn<RunSort>[] = [
    { key: "flow", label: "Run", column: "main", className: "!min-w-0" },
    { key: "project", label: "Project", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    { key: "status", label: "State", column: "meta" },
    { key: "started", label: "Started", column: "meta", className: "hidden md:hidden @xl:table-cell" },
  ]

  return frame({
    ids,
    showMiddleFor: `runs|${q}`,
    showRightFor: search.open,
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <ListHeader
          tabs={heading}
          end={headingEnd}
          menuLabel="More for runs"
          selected={
            massSelect && tickedCount ? (
              <SelectedMenu
                count={tickedCount}
                busy={deleteBusy}
                onClear={selection.clear}
                pages={{}}
                main={(menu) => (
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setDeleting({ ids: [...selection.selected], name: null })
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                )}
              />
            ) : null
          }
          search={{
            name: "flow-run-search",
            label: "Search runs",
            placeholder: "Search runs",
            value: q,
            onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
          }}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        />
        <CrmTable<RunSort>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          select={
            massSelect
              ? {
                  noun: "runs",
                  disabled: ids.length === 0,
                  checked: selection.selectAllState(ids),
                  onToggle: () => selection.toggleVisible(ids),
                }
              : null
          }
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
              open={run.id === openId}
              label={run.flowName}
              tick={
                massSelect
                  ? { shown: true, ticked: selection.selected.has(run.id), onToggle: () => selection.toggle(run.id) }
                  : null
              }
              onOpen={() => goToRun(run.id)}
              cog={{ label: `Settings for ${run.flowName}`, onPress: () => setOpen(run.id) }}
              onDelete={() => deleteOne(run)}
              onRightClick={(x, y) => setRightClick({ id: run.id, x, y })}
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
        {rightClick && rightClicked ? (
          <CrmRowMenu
            key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
            at={rightClick}
            massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Run",
      showLabel: "Show the run",
      content: <RunPanel key={openRun?.id ?? "none"} run={openRun} onOpen={goToRun} onDelete={deleteOne} />,
    },
    windows: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={
          closingDelete?.name
            ? `Delete ${quoteOneLine(closingDelete.name)}?`
            : `Delete ${closingDelete?.ids.length ?? 0} ${plural(closingDelete?.ids.length ?? 0, "run", "runs")}?`
        }
        description={
          (closingDelete?.ids.length ?? 0) > 1
            ? "These runs and their steps go for good. The files they made stay in Media, and any video they saved stays in its project."
            : "The run and its steps go for good. The files it made stay in Media, and a video it saved stays in its project."
        }
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={removeRuns}
      />
    ),
  })
}
