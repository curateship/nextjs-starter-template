import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CopyIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { ListHeader } from "@/components/content-app/list-header"
import { Chip, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import { deleteFlow, duplicateFlow, getFlowErrorMessage, type FlowListItem } from "@/lib/api/video/flow"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import type { FlowSearch } from "@/lib/video/flow/flow-search"

import { NewFlowDropdown, RunFlowButton } from "./flow-dropdowns"
import { FlowPanel } from "./flow-panel"

type FlowSort = "name" | "nodes" | "runs" | "updated"

/**
 * The Flows section: every flow in the CRM's one header and table shape, as
 * Admin → Pages lists pages (`pages-tab.tsx`). A press on a row opens the
 * builder in the middle; its cog shows the flow on the right, with Run and
 * Edit flow at its foot, then a copy button duplicates it and the bin deletes
 * it. The right-click menu has Edit flow, Duplicate, then Delete.
 */
export function FlowsTab({
  flows,
  search,
  heading,
  headingEnd,
  frame,
}: {
  flows: FlowListItem[]
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
  const [sort, setSort] = React.useState<FlowSort>("updated")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const toggleSort = (column: FlowSort) => {
    if (column === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection(column === "name" ? "asc" : "desc")
  }

  const shown = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    return flows
      .filter((flow) => !query || `${flow.name} ${flow.description}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "name") return sign * a.name.localeCompare(b.name)
        if (sort === "nodes") return sign * (a.nodeCount - b.nodeCount) || a.name.localeCompare(b.name)
        if (sort === "runs") return sign * (a.runCount - b.runCount) || a.name.localeCompare(b.name)
        return sign * a.updatedAt.localeCompare(b.updatedAt)
      })
  }, [flows, q, sort, direction])
  const ids = shown.map((flow) => flow.id)
  const openId = search.open && ids.includes(search.open) ? search.open : ids[0]
  const openFlow = flows.find((flow) => flow.id === openId) ?? null

  const edit = (flowId: string) => void navigate({ to: "/admin/video-flow", search: { edit: flowId } })
  const openRun = (runId: string) => void navigate({ to: "/admin/video-flow", search: { tab: "runs", run: runId } })

  const [deleting, setDeleting] = React.useState<FlowListItem | null>(null)
  const closingDelete = useLastValue(deleting)
  const [runDelete, deleteBusy] = useAsyncAction(getFlowErrorMessage)
  const removeFlow = () => {
    const target = deleting
    if (!target) return
    void runDelete(async () => {
      await deleteFlow(target.id)
      if (search.open === target.id) setListSearch({ open: undefined })
      setDeleting(null)
      await router.invalidate()
    })
  }
  const [runDuplicate] = useAsyncAction(getFlowErrorMessage)
  const copy = (flowId: string) =>
    void runDuplicate(async () => {
      const made = await duplicateFlow(flowId)
      await router.invalidate()
      setOpen(made.id)
    })

  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const rightClicked = rightClick ? flows.find((flow) => flow.id === rightClick.id) : undefined
  const rowMenuItems = (flow: FlowListItem): RowMenuItem[] => [
    { label: "Edit flow", icon: <SettingsIcon className="size-4" />, onSelect: () => edit(flow.id) },
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => copy(flow.id) },
    { label: "Delete flow", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting(flow) },
  ]

  const columns: TableHeaderColumn<FlowSort>[] = [
    { key: "name", label: "Flow", column: "main", className: "!min-w-0" },
    { key: "nodes", label: "Nodes", column: "meta", className: "hidden md:hidden @xl:table-cell" },
    { key: "runs", label: "Runs", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
    { key: "updated", label: "Updated", column: "meta" },
  ]

  return frame({
    ids,
    showMiddleFor: `flows|${q}`,
    showRightFor: search.open,
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <ListHeader
          tabs={heading}
          end={headingEnd}
          menuLabel="More for flows"
          search={{
            name: "flow-search",
            label: "Search flows",
            placeholder: "Search flows",
            value: q,
            onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
          }}
          massSelect={null}
          primary={
            <NewFlowDropdown
              onCreated={async (flowId) => {
                await router.invalidate()
                edit(flowId)
              }}
              trigger={
                <DashboardToolbarButton type="button" aria-label="New flow">
                  <PlusIcon className="size-4" />
                  <span className="@max-3xl:sr-only">New flow</span>
                </DashboardToolbarButton>
              }
            />
          }
        />
        <CrmTable<FlowSort>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          empty={
            shown.length > 0 ? null : q.trim() ? (
              <span className="grid justify-items-center gap-2">
                {`No flow matches "${q.trim()}".`}
                <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                  Clear filters
                </Button>
              </span>
            ) : (
              "No flows yet. New flow makes the first one."
            )
          }
        >
          {shown.map((flow) => (
            <CrmTableRow
              key={flow.id}
              open={flow.id === openId}
              label={flow.name}
              // A press opens the canvas; the cog shows the flow on the right
              // (Tyler, 14 Nov 2026: "clicking the flow in the table goes
              // straight to the canvas. Only clicking on the settings cog
              // opens the right panel").
              onOpen={() => edit(flow.id)}
              cog={{ label: `Settings for ${flow.name}`, onPress: () => setOpen(flow.id) }}
              // A copy beside the cog, so a flow is a template for the next
              // (Tyler, 14 Nov 2026: "For flow table, add a duplicate function").
              buttons={[{ label: `Duplicate ${flow.name}`, icon: <CopyIcon className="size-4" />, onPress: () => copy(flow.id) }]}
              onDelete={() => setDeleting(flow)}
              onRightClick={(x, y) => setRightClick({ id: flow.id, x, y })}
            >
              <TableCell column="main" className="!min-w-0 max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <OpenBar />
                  <span data-row-name="" className="truncate font-medium">
                    {flow.name}
                  </span>
                  {flow.problemCount ? (
                    <Chip className="hidden text-destructive @2xl:inline-flex">
                      {flow.problemCount === 1 ? "1 thing to fix" : `${flow.problemCount} things to fix`}
                    </Chip>
                  ) : null}
                </span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                {flow.nodeCount}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
                {flow.runCount}
              </TableCell>
              <TableCell column="mutedMeta">
                <span className="whitespace-nowrap">{formatInboxTime(flow.updatedAt)}</span>
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
        {rightClick && rightClicked ? (
          <CrmRowMenu
            key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
            at={rightClick}
            massSelect={null}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Flow",
      showLabel: "Show the flow",
      content: (
        <FlowPanel
          key={openFlow?.id ?? "none"}
          flow={openFlow}
          onEdit={edit}
          onDuplicate={copy}
          onDelete={(flow) => setDeleting(flow)}
          runButton={
            openFlow ? (
              <RunFlowButton
                flowId={openFlow.id}
                variant="outline"
                onStarted={async (runId) => {
                  await router.invalidate()
                  openRun(runId)
                }}
              >
                Run
              </RunFlowButton>
            ) : null
          }
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={closingDelete ? `Delete ${quoteOneLine(closingDelete.name)}?` : "Delete this flow?"}
        description="The flow and its canvas go for good. Its runs stay, and every video they made stays in its project."
        confirmLabel="Delete flow"
        loading={deleteBusy}
        onConfirm={removeFlow}
      />
    ),
  })
}
