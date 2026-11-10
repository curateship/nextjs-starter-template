import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AutomationEditor, type EditorPane } from "@/components/automations/automation-editor"
import { NewAutomationDropdown } from "@/components/automations/new-automation-dropdown"
import { TestWithContactDialog } from "@/components/automations/test-with-contact-dialog"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, Dot, OpenBar } from "@/components/crm/crm-table"
import { NameDialog } from "@/components/shared/dashboard/name-dialog"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Switch } from "@/components/ui/switch"
import { TableCell } from "@/components/ui/table"
import { getAutomationRunErrorMessage, runAutomationNow } from "@/lib/api/automations/automation-runs"
import {
  saveAutomationTemplateGraph,
  type AutomationTemplateDetail,
} from "@/lib/api/automations/automation-templates"
import {
  deleteAutomations,
  duplicateAutomation,
  getAutomationErrorMessage,
  renameAutomation,
  setAutomationLive,
  toAutomationListItem,
  type AutomationDetail,
  type AutomationListItem,
  type AutomationsPage,
} from "@/lib/api/automations/automations"
import {
  flowSearch,
  type AutomationSort,
  type AutomationsSearch,
} from "@/lib/automations/automations-search"
import { compareAutomationSteps } from "@/lib/automations/list-sort"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** What the open canvas needs beyond the list, read by the route's loader. */
export type OpenCanvas =
  | {
      kind: "flow"
      automation: AutomationDetail
      favoriteNodeKeys: string[]
      blockDefaults: BroadcastBlockDefaults
    }
  | {
      kind: "template"
      template: AutomationTemplateDetail
      favoriteNodeKeys: string[]
      blockDefaults: BroadcastBlockDefaults
    }

/** Where the step last picked on each template is kept in this browser. */
const templateNodeKey = (templateKey: string) => `automation-template-node:${templateKey}`

function readRememberedTemplateNode(templateKey: string): string | undefined {
  try {
    return localStorage.getItem(templateNodeKey(templateKey)) ?? undefined
  } catch {
    return undefined
  }
}

function rememberTemplateNode(templateKey: string, nodeId: string) {
  try {
    localStorage.setItem(templateNodeKey(templateKey), nodeId)
  } catch {
    // Storage may be blocked; the template then opens on its first step.
  }
}

/** How the Live column sorts: switched on, could be switched on, runs only by hand. */
function liveRank(automation: AutomationListItem): number {
  if (automation.enabled) return 2
  return automation.trigger_name ? 1 : 0
}

/**
 * The Automations dashboard's Automations section (Tyler, 9 Nov 2026).
 *
 * - **The table:** every flow in the CRM's one table shape, two panels with
 *   no right panel. A press on a line opens its canvas in the middle at once,
 *   as Trade's Bots dashboard does ("clicking on the recipe should just go to
 *   the canvas"). Columns: Name, Live (its switch), Steps, Next run, Updated.
 *   The header has Search, Select, Pause all and New automation; the
 *   right-click menu has Mass select, Run now, Test with one person,
 *   Duplicate, Rename, then Delete.
 * - **An open flow** (`full=1`) or template (`template=`): the canvas in the
 *   middle (`AutomationEditor`). Back, or Automations in the Dashboards
 *   block, returns to the table with the same line picked.
 */
export function AutomationsTab({
  page,
  canvas,
  search,
  heading,
  headingEnd,
  frame,
}: {
  page: AutomationsPage
  /** The flow or template open in the middle, when one is. */
  canvas: OpenCanvas | null
  search: AutomationsSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const { config, automationPauseBusy, onAutomationPauseChange } = useShellRuntime()
  const paused = config.automationPause.enabled

  const [automations, setAutomations] = React.useState(page.automations)
  const [lastLoaded, setLastLoaded] = React.useState(page.automations)
  if (lastLoaded !== page.automations) {
    setLastLoaded(page.automations)
    setAutomations(page.automations)
  }

  const q = search.q ?? ""
  const sort: AutomationSort = search.sort ?? "updated"
  const direction = search.direction ?? (sort === "updated" ? "desc" : "asc")
  const toggleSort = useListSort<AutomationSort>({ sort, direction }, (column) =>
    column === "updated" ? "desc" : "asc"
  )

  const shown = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = q.trim().toLowerCase()
    return automations
      .filter((item) => !query || item.name.toLowerCase().includes(query) || item.summary.toLowerCase().includes(query))
      .sort((left, right) => {
        if (sort === "name") return factor * left.name.localeCompare(right.name)
        if (sort === "live") {
          return (
            factor *
            (liveRank(left) - liveRank(right) || (left.trigger_name ?? "").localeCompare(right.trigger_name ?? ""))
          )
        }
        if (sort === "steps") return compareAutomationSteps(left, right, direction)
        if (sort === "nextRun") {
          if (left.next_run_at === null) return right.next_run_at === null ? 0 : 1
          if (right.next_run_at === null) return -1
          return factor * left.next_run_at.localeCompare(right.next_run_at)
        }
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [automations, direction, q, sort])
  const ids = shown.map((item) => item.id)
  const pickedId = search.open ?? ids[0]

  // Mass select, held here and handed to the table.
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
  const selectedIds = ids.filter((id) => selection.selected.has(id))
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)

  // The windows: create, rename, delete, test, pause.
  const [renameTarget, setRenameTarget] = React.useState<AutomationListItem | null>(null)
  const [renameName, setRenameName] = React.useState("")
  const [runRename, renaming] = useAsyncAction(getAutomationErrorMessage)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [runningId, setRunningId] = React.useState<string | null>(null)
  const [testTarget, setTestTarget] = React.useState<AutomationListItem | null>(null)
  const [liveId, setLiveId] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<AutomationListItem[] | null>(null)
  const [runDelete, deleting] = useAsyncAction(getAutomationErrorMessage)
  const closingDeleteTargets = useLastValue(deleteTargets)
  const [confirmPauseOpen, setConfirmPauseOpen] = React.useState(false)

  const byId = new Map(automations.map((item) => [item.id, item]))

  /** One press opens the canvas; the history gets a step, so Back returns to the table. */
  const openCanvas = (automationId: string, extra: { pane?: "runs"; run?: string } = {}) =>
    void navigate({ to: "/admin/automations", search: flowSearch(automationId, extra) })

  const openRename = (automation: AutomationListItem) => {
    setRenameTarget(automation)
    setRenameName(automation.name)
  }

  const handleRename = async () => {
    const target = renameTarget
    if (!target || renaming) return
    if (!renameName.trim()) {
      showErrorToast("Automation name is required.")
      return
    }
    if (renameName.trim() === target.name) {
      setRenameTarget(null)
      return
    }
    await runRename(async () => {
      const renamed = await renameAutomation(target.id, renameName)
      setAutomations((current) =>
        current.map((item) =>
          item.id === renamed.id ? { ...item, name: renamed.name, updated_at: renamed.updated_at } : item
        )
      )
      toast.success(`Renamed to "${renamed.name}".`)
      setRenameTarget(null)
    })
  }

  const handleDuplicate = async (automationId: string, openCopy = false) => {
    if (duplicatingId) return
    setDuplicatingId(automationId)
    try {
      const copy = await duplicateAutomation(automationId)
      dismissErrorToast()
      setAutomations((current) => [toAutomationListItem(copy), ...current])
      toast.success(`Duplicated as "${copy.name}".`)
      if (openCopy) openCanvas(copy.id)
      void router.invalidate()
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setDuplicatingId(null)
    }
  }

  /** Sets a flow going and opens its canvas on the Runs tab with that run open. */
  const handleRunNow = async (automation: AutomationListItem) => {
    if (runningId) return
    setRunningId(automation.id)
    try {
      const { runId } = await runAutomationNow(automation.id)
      dismissErrorToast()
      toast.success(`Started "${automation.name}".`)
      openCanvas(automation.id, { pane: "runs", run: runId })
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  /**
   * Switches one flow's trigger on or off. Nothing is caught up on the way
   * back on, and the toast says so.
   */
  const handleToggleLive = async (automation: AutomationListItem, next: boolean) => {
    if (liveId) return
    setLiveId(automation.id)
    try {
      const saved = await setAutomationLive(automation.id, next)
      dismissErrorToast()
      setAutomations((current) => current.map((item) => (item.id === saved.id ? toAutomationListItem(saved) : item)))
      toast.success(
        next
          ? `"${automation.name}" is on. Its "${saved.trigger_name}" step starts it from now on. Nothing from before is caught up.`
          : `"${automation.name}" is off. Nothing starts it on its own any more.`
      )
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setLiveId(null)
    }
  }

  /** Pausing asks first, because it stops everything at once; resuming does not. */
  const handlePauseChange = async (enabled: boolean) => {
    if (automationPauseBusy) return
    if (await onAutomationPauseChange(enabled)) setConfirmPauseOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteTargets?.length || deleting) return
    await runDelete(async () => {
      const gone = new Set(deleteTargets.map((item) => item.id))
      const { count } = await deleteAutomations([...gone])
      setAutomations((current) => current.filter((item) => !gone.has(item.id)))
      toast.success(
        describeBulkResult({
          done: count,
          kept: gone.size - count,
          one: "automation",
          many: "automations",
          verb: "deleted",
        })
      )
      selection.clear()
      setDeleteTargets(null)
      // Deleted from its own canvas, or the picked line: back to the table.
      if (search.open && gone.has(search.open)) {
        await navigate({ to: "/admin/automations", search: { tab: "automations" }, replace: true })
      }
      await router.invalidate()
    })
  }

  const rowMenuItems = (id: string): RowMenuItem[] => {
    const automation = byId.get(id)
    if (!automation) return []
    const canStart = !paused && automation.isValid
    return [
      ...(automation.can_run_manually && canStart
        ? [{ label: "Run now", icon: <PlayIcon className="size-4" />, onSelect: () => void handleRunNow(automation) }]
        : []),
      ...(canStart
        ? [{ label: "Test with one person", icon: <UserIcon className="size-4" />, onSelect: () => setTestTarget(automation) }]
        : []),
      { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => void handleDuplicate(automation.id) },
      { label: "Rename", icon: <PencilIcon className="size-4" />, onSelect: () => openRename(automation) },
      {
        label: "Delete automation",
        icon: <Trash2Icon className="size-4" />,
        destructive: true,
        onSelect: () => setDeleteTargets([automation]),
      },
    ]
  }

  const windows = (
    <>
      {testTarget ? (
        <TestWithContactDialog
          open
          automationId={testTarget.id}
          automationName={testTarget.name}
          onOpenChange={(open) => {
            if (!open) setTestTarget(null)
          }}
          onStarted={(runId) => openCanvas(testTarget.id, { pane: "runs", run: runId })}
        />
      ) : null}

      <NameDialog
        open={renameTarget !== null}
        title="Rename automation"
        description="Only the name changes. The steps and whether it is live stay as they are."
        cardTitle="Automation details"
        inputId="rename-automation-name"
        value={renameName}
        onValueChange={setRenameName}
        maxLength={80}
        placeholder="Weekly product email"
        dirty={renameName.trim() !== (renameTarget?.name ?? "")}
        busy={renaming}
        submitLabel="Save name"
        onSubmit={() => void handleRename()}
        onClose={() => setRenameTarget(null)}
      />

      <ConfirmDialog
        open={deleteTargets !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets(null)
        }}
        title={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? `Delete ${closingDeleteTargets.length} automations?`
            : closingDeleteTargets?.[0]
              ? `Delete ${quoteOneLine(closingDeleteTargets[0].name)}?`
              : "Delete this automation?"
        }
        description={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "The flows, their canvases and their runs are removed for good. This cannot be undone."
            : "The flow, its canvas and its runs are removed for good. This cannot be undone."
        }
        confirmLabel={closingDeleteTargets && closingDeleteTargets.length > 1 ? "Delete automations" : "Delete automation"}
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={confirmPauseOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmPauseOpen(false)
        }}
        title="Pause every automation?"
        description="Every flow stops as soon as you confirm, and no new one can be started by hand. A run part-way through finishes the step it is on, then holds its place. Nothing is thrown away, and everything picks up where it left off when you resume."
        confirmLabel="Pause automations"
        loading={automationPauseBusy}
        onConfirm={() => void handlePauseChange(true)}
      />
    </>
  )

  // An open flow or template: the canvas takes the middle.
  if (canvas) {
    const pane: EditorPane = search.pane === "runs" ? "runs" : "canvas"
    const common = {
      initialFavoriteNodeKeys: canvas.favoriteNodeKeys,
      initialBlockDefaults: canvas.blockDefaults,
      initialTemplates: page.templates,
      frame: (panels: Parameters<CrmFrame>[0]) =>
        frame({ ...panels, windows: (
          <>
            {panels.windows}
            {windows}
          </>
        ) }),
      headingEnd,
      onNodePicked: (nodeId: string | null) => setListSearch({ node: nodeId ?? undefined }),
    }
    if (canvas.kind === "template") {
      const template = canvas.template
      // A template opens on a step: the one last picked on it in this
      // browser, or else its first, the leftmost on the canvas (Tyler,
      // 9 Nov 2026: "in template, clicking the template auto select the
      // first node if it doesnt remember its last node").
      const templateNode = (nodeId: string | undefined) =>
        nodeId && template.graph.nodes.some((node) => node.id === nodeId) ? nodeId : undefined
      const firstNode = [...template.graph.nodes].sort((a, b) => a.x - b.x || a.y - b.y)[0]?.id
      const openNode =
        templateNode(search.node) ?? templateNode(readRememberedTemplateNode(template.key)) ?? firstNode
      return (
        <AutomationEditor
          key={`template:${template.key}`}
          mode="template"
          initial={{ id: template.key, name: template.name, graph: template.graph, enabled: false }}
          openNode={openNode}
          onSaveTemplateGraph={(graph) => saveAutomationTemplateGraph({ templateKey: template.key, graph })}
          onPaneChange={() => {}}
          onOpenRun={() => {}}
          {...common}
          onNodePicked={(nodeId) => {
            if (nodeId) rememberTemplateNode(template.key, nodeId)
            common.onNodePicked(nodeId)
          }}
        />
      )
    }
    const automation = canvas.automation
    const listed = byId.get(automation.id)
    return (
      <AutomationEditor
        key={automation.id}
        initial={automation}
        pane={pane}
        runId={search.run}
        openNode={search.node}
        onPaneChange={(next, runId) =>
          setListSearch({ pane: next === "runs" ? "runs" : undefined, run: runId, node: undefined })
        }
        onOpenRun={(runId) => setListSearch({ run: runId })}
        onRenamed={(name) =>
          setAutomations((current) => current.map((item) => (item.id === automation.id ? { ...item, name } : item)))
        }
        onDuplicate={() => void handleDuplicate(automation.id, true)}
        onDelete={() => setDeleteTargets([listed ?? toAutomationListItem(automation)])}
        {...common}
      />
    )
  }

  const columns: TableHeaderColumn<AutomationSort>[] = [
    // No 20rem floor on the name, so the table fits a phone: the name gives
    // way, cut short with "…", and the columns after it drop out first.
    { key: "name", label: "Name", column: "main", className: "!min-w-0" },
    { key: "live", label: "Live", column: "meta" },
    { key: "steps", label: "Steps", column: "preview", className: "hidden md:hidden @xl:table-cell" },
    { key: "nextRun", label: "Next run", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
    { key: "updated", label: "Updated", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  ]

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        menuLabel="More for automations"
        search={{
          name: "automation-search",
          label: "Search automations",
          placeholder: "Search automations",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        selected={
          massSelect && selectedIds.length ? (
            <DashboardToolbarButton
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => setDeleteTargets(automations.filter((item) => selection.selected.has(item.id)))}
            >
              <Trash2Icon className="size-4" />
              Delete ({selectedIds.length})
            </DashboardToolbarButton>
          ) : null
        }
        view={
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={automationPauseBusy}
            aria-label={paused ? "Resume all" : "Pause all"}
            onClick={() => (paused ? void handlePauseChange(false) : setConfirmPauseOpen(true))}
          >
            {automationPauseBusy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : paused ? (
              <PlayIcon className="size-4" />
            ) : (
              <PauseIcon className="size-4" />
            )}
            <span className="@max-3xl:sr-only">{paused ? "Resume all" : "Pause all"}</span>
          </DashboardToolbarButton>
        }
        primary={
          <NewAutomationDropdown
            templates={page.templates}
            onCreated={async (automationId) => {
              await router.invalidate()
              openCanvas(automationId)
            }}
            trigger={
              <DashboardToolbarButton type="button" aria-label="New automation">
                <PlusIcon className="size-4" />
                <span className="@max-3xl:sr-only">New automation</span>
              </DashboardToolbarButton>
            }
          />
        }
      />
      <CrmTable<AutomationSort>
        columns={columns}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions={false}
        select={
          massSelect
            ? {
                noun: "automations",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          shown.length > 0 ? null : q.trim() ? (
            <span className="grid justify-items-center gap-2">
              {`No automation matches "${q.trim()}".`}
              <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                Clear search
              </Button>
            </span>
          ) : (
            "No automations yet. Press New automation to make the first one."
          )
        }
      >
        {shown.map((automation) => (
          <CrmTableRow
            key={automation.id}
            open={automation.id === pickedId}
            label={automation.name}
            tick={{
              shown: massSelect,
              ticked: selection.selected.has(automation.id),
              onToggle: () => selection.toggle(automation.id),
            }}
            onOpen={() => openCanvas(automation.id)}
            onRightClick={(x, y) => setRightClick({ id: automation.id, x, y })}
          >
            <TableCell column="main" className="!min-w-0 max-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <OpenBar />
                <Dot
                  className={automation.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}
                  label={automation.enabled ? "Live" : "Off"}
                />
                <span data-row-name="" className="truncate font-medium">
                  {automation.name}
                </span>
                {!automation.isValid ? (
                  <Chip className="hidden text-destructive @2xl:inline-flex">Has a step to fix</Chip>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="meta">
              <LiveCell
                automation={automation}
                busy={liveId === automation.id}
                disabled={liveId !== null}
                onChange={(next) => void handleToggleLive(automation, next)}
              />
            </TableCell>
            <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
              <span className="block max-w-72 truncate text-muted-foreground">{automation.summary}</span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
              <span className="whitespace-nowrap">
                {automation.next_run_at ? formatDateTime(automation.next_run_at) : "None"}
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              <span className="whitespace-nowrap">{formatInboxTime(automation.updated_at)}</span>
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={rowMenuItems(rightClick.id)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `automations|${q}`,
    middle,
    right: null,
    windows,
  })
}

/**
 * Whether one flow acts on its own. A flow with no trigger step cannot be
 * switched on, so it says what it is instead. A flow already on can always be
 * switched off; switching one on needs a flow that compiles.
 */
function LiveCell({
  automation,
  busy,
  disabled,
  onChange,
}: {
  automation: AutomationListItem
  busy: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  if (!automation.trigger_name) {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">Runs by hand</span>
  }
  const blocked = !automation.isValid && !automation.enabled
  const stalled = automation.enabled && !automation.isValid
  return (
    // A press on the switch is the switch's, not the row's, which would open the canvas.
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <DisabledReason
        disabled={blocked}
        reason="This flow has something to fix before it can go live. Open it and check the steps marked in red."
      >
        <Switch
          checked={automation.enabled}
          // Held while its change saves; no circle beside it, because a
          // loading circle sits only in a button (Tyler, 7 Nov 2026).
          disabled={blocked || disabled || busy}
          aria-label={`${automation.enabled ? "Stop" : "Start"} ${automation.name} reacting to ${automation.trigger_name}`}
          onCheckedChange={onChange}
        />
      </DisabledReason>
      {stalled ? <span className="truncate text-xs text-destructive">On, but not running</span> : null}
      {!automation.enabled && automation.paused_reason ? (
        <span className="max-w-56 truncate text-xs text-destructive">{automation.paused_reason}</span>
      ) : null}
    </div>
  )
}
