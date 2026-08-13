import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CircleDashedIcon,
  CopyIcon,
  CreditCardIcon,
  Loader2Icon,
  MailIcon,
  NewspaperIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserIcon,
  WorkflowIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { TestWithMemberDialog } from "@/components/automations/test-with-member-dialog"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FormDialog } from "@/components/ui/form-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  getAutomationRunErrorMessage,
  runAutomationNow,
} from "@/lib/api/automations/automation-runs"
import {
  createAutomation,
  deleteAutomations,
  duplicateAutomation,
  getAutomationErrorMessage,
  renameAutomation,
  setAutomationLive,
  toAutomationListItem,
  type AutomationListItem,
  type AutomationsPage,
} from "@/lib/api/automations/automations"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import type { AutomationTemplateKey } from "@/lib/automations/templates"

type CreateChoice = "blank" | AutomationTemplateKey

const TEMPLATE_ICONS = {
  "welcome-members": MailIcon,
  "changelog-approval": NewspaperIcon,
  "payment-recovery": CreditCardIcon,
} satisfies Record<AutomationTemplateKey, typeof MailIcon>

type SortColumn = "name" | "trigger" | "status" | "nextRun" | "updated"

/**
 * How the Trigger column sorts: the flows that act on their own first when you
 * ask for it, then the ones that could, then the ones that only ever wait for
 * somebody to press Run.
 */
function triggerRank(automation: AutomationListItem): number {
  if (automation.enabled) return 2
  return automation.trigger_name ? 1 : 0
}

/**
 * The flows list: open, create, duplicate, delete. Deliberately small — the
 * automations-dashboard task rebuilds this page with run history, enable/pause,
 * and the full toolbar once the engine exists.
 */
export function AutomationsListPage({ initial }: { initial: AutomationsPage }) {
  const navigate = useNavigate()
  const [automations, setAutomations] = React.useState(initial.automations)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("updated", "desc", (column) => column === "updated" ? "desc" : "asc")
  const [search, setSearch] = React.useState("")
  const { config, automationPauseBusy, onAutomationPauseChange } =
    useShellRuntime()
  const [confirmPauseOpen, setConfirmPauseOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createChoice, setCreateChoice] = React.useState<CreateChoice>("blank")
  const [runCreate, creating] = useAsyncAction(getAutomationErrorMessage)
  const [renameTarget, setRenameTarget] =
    React.useState<AutomationListItem | null>(null)
  const [renameName, setRenameName] = React.useState("")
  const [runRename, renaming] = useAsyncAction(getAutomationErrorMessage)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [runningId, setRunningId] = React.useState<string | null>(null)
  const [testTarget, setTestTarget] = React.useState<AutomationListItem | null>(
    null
  )
  const [liveId, setLiveId] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<
    AutomationListItem[] | null
  >(null)
  const [runDelete, deleting] = useAsyncAction(getAutomationErrorMessage)
  const selection = useSelection()
  const selectedIds = selection.selected
  // The confirmation is still on screen while it fades out, after Cancel has
  // already cleared the targets — so its heading reads the names it opened with.
  const closingDeleteTargets = useLastValue(deleteTargets)

  // The loader brings the whole list in one go, so finding and paging happen
  // here. If it ever grows past that, this wants a server parameter instead.
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = search.trim().toLowerCase()
    return automations
      .filter(
        (item) =>
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (sort === "name") return factor * left.name.localeCompare(right.name)
        if (sort === "trigger") {
          return (
            factor *
            (triggerRank(left) - triggerRank(right) ||
              (left.trigger_name ?? "").localeCompare(right.trigger_name ?? ""))
          )
        }
        if (sort === "status") return factor * left.summary.localeCompare(right.summary)
        if (sort === "nextRun") {
          if (left.next_run_at === null)
            return right.next_run_at === null ? 0 : 1
          if (right.next_run_at === null) return -1
          return factor * left.next_run_at.localeCompare(right.next_run_at)
        }
        return factor * left.updated_at.localeCompare(right.updated_at)
      })
  }, [automations, direction, search, sort])

  // Paging, and the jump back to page 1 when the search or sort changes. The
  // shared helper does that adjustment while drawing rather than in an effect,
  // which is what stops the list drawing once on the old page and again on the
  // new one.
  const { page, pageSize, visible, footer } = useClientPage(
    sorted,
    config.dashboardRowsPerPage,
    `${search}|${sort}|${direction}`
  )

  useClearSelectionOnListChange(
    selection.setSelected,
    `${search}|${sort}|${direction}|${page}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => visible.map((automation) => automation.id),
    [visible]
  )

  const selectedAutomations = React.useMemo(
    () => automations.filter((automation) => selectedIds.has(automation.id)),
    [automations, selectedIds]
  )

  const openEditor = (automationId: string) =>
    navigate({
      to: "/admin/automations/$automationId",
      params: { automationId },
    })

  const closeCreate = () => {
    setCreateOpen(false)
    setCreateName("")
    setCreateChoice("blank")
  }

  const chooseCreateStart = (choice: CreateChoice) => {
    setCreateChoice(choice)
    setCreateName(
      choice === "blank"
        ? ""
        : (initial.templates.find((item) => item.key === choice)?.name ?? "")
    )
  }

  const handleCreate = async () => {
    if (creating) return
    if (!createName.trim()) {
      showErrorToast("Automation name is required.")
      return
    }
    await runCreate(async () => {
      const created = await createAutomation(
        createName,
        createChoice === "blank" ? null : createChoice
      )
      toast.success(`Created "${created.name}".`)
      setCreateOpen(false)
      setCreateName("")
      setCreateChoice("blank")
      await openEditor(created.id)
    })
  }

  const openRename = (automation: AutomationListItem) => {
    setRenameTarget(automation)
    setRenameName(automation.name)
  }

  const closeRename = () => {
    setRenameTarget(null)
    setRenameName("")
  }

  const handleRename = async () => {
    const target = renameTarget
    if (!target || renaming) return
    if (!renameName.trim()) {
      showErrorToast("Automation name is required.")
      return
    }
    // Nothing to save, so say nothing and close. Opening the window and
    // pressing Save without typing is not a failure worth a message.
    if (renameName.trim() === target.name) {
      closeRename()
      return
    }
    await runRename(async () => {
      const renamed = await renameAutomation(target.id, renameName)
      setAutomations((current) =>
        current.map((automation) =>
          automation.id === renamed.id
            ? { ...automation, name: renamed.name, updated_at: renamed.updated_at }
            : automation
        )
      )
      toast.success(`Renamed to "${renamed.name}".`)
      closeRename()
    })
  }

  const handleDuplicate = async (automation: AutomationListItem) => {
    if (duplicatingId) return
    setDuplicatingId(automation.id)
    try {
      const copy = await duplicateAutomation(automation.id)
      dismissErrorToast()
      setAutomations((current) => [toAutomationListItem(copy), ...current])
      toast.success(`Duplicated as "${copy.name}".`)
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setDuplicatingId(null)
    }
  }

  /**
   * Sets a flow going and opens the flow with that run already showing in the
   * panel under the canvas. The server walks the flow once before answering, so
   * a run that stopped at an approval checkpoint is already sitting there
   * waiting by the time the editor paints.
   */
  const handleRunNow = async (automation: AutomationListItem) => {
    if (runningId) return
    setRunningId(automation.id)
    try {
      const { runId } = await runAutomationNow(automation.id)
      dismissErrorToast()
      toast.success(`Started "${automation.name}".`)
      await navigate({
        to: "/admin/automations/$automationId",
        params: { automationId: automation.id },
        search: { run: runId },
      })
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setRunningId(null)
    }
  }

  /**
   * Switches one flow's trigger on or off.
   *
   * Nothing is caught up on the way back on, and the toast says so — a payment
   * that failed while this was off is not chased when it goes back on. That is
   * the promise that makes switching a flow on safe to do at any moment.
   */
  const handleToggleLive = async (
    automation: AutomationListItem,
    next: boolean
  ) => {
    if (liveId) return
    setLiveId(automation.id)
    try {
      const saved = await setAutomationLive(automation.id, next)
      dismissErrorToast()
      setAutomations((current) =>
        current.map((item) =>
          item.id === saved.id ? toAutomationListItem(saved) : item
        )
      )
      toast.success(
        next
          ? `"${automation.name}" is on. Its "${saved.trigger_name}" step starts it from now on — nothing from before is caught up.`
          : `"${automation.name}" is off. Nothing starts it on its own any more.`
      )
    } catch (error) {
      showErrorToast(getAutomationErrorMessage(error))
    } finally {
      setLiveId(null)
    }
  }

  /**
   * The kill switch. Pausing asks first, because it stops everything at once;
   * resuming does not, because it is the way back out of a mistake and putting
   * a question in front of it is the last thing anybody wants at that moment.
   */
  const handlePauseChange = async (enabled: boolean) => {
    if (automationPauseBusy) return
    // The toast says how many runs were caught mid-flight; nothing on this page
    // needs the number, so the answer is only checked for having worked.
    if (await onAutomationPauseChange(enabled)) setConfirmPauseOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteTargets?.length || deleting) return
    await runDelete(async () => {
      const ids = new Set(deleteTargets.map((item) => item.id))
      await deleteAutomations([...ids])
      setAutomations((current) => current.filter((item) => !ids.has(item.id)))
      toast.success(
        deleteTargets.length === 1 && deleteTargets[0]
          ? `Deleted "${deleteTargets[0].name}".`
          : `Deleted ${deleteTargets.length} automations.`
      )
      selection.clear()
      setDeleteTargets(null)
    })
  }

  // One copy of the switch, shared with the header badge, which is the only
  // place that says "everything is stopped" — this page just offers the toggle.
  const paused = config.automationPause.enabled

  return (
    <>
      <DashboardTable
        title="Automations"
        icon={<WorkflowIcon />}
        count={sorted.length}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setDeleteTargets(selectedAutomations)}
                disabled={deleting}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="automation-search"
              aria-label="Search automations"
              placeholder="Search automations…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton
              variant="outline"
              disabled={automationPauseBusy}
              onClick={() =>
                paused ? void handlePauseChange(false) : setConfirmPauseOpen(true)
              }
            >
              {automationPauseBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : paused ? (
                <PlayIcon className="size-4" />
              ) : (
                <PauseIcon className="size-4" />
              )}
              {paused ? "Resume all" : "Pause all"}
            </DashboardToolbarButton>
            <DashboardToolbarButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New automation
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select automations on this page"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "trigger"}
                  direction={direction}
                  onClick={() => toggleSort("trigger")}
                >
                  Trigger
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                <TableSortButton
                  active={sort === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort === "nextRun"}
                  direction={direction}
                  onClick={() => toggleSort("nextRun")}
                >
                  Next run
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "updated"}
                  direction={direction}
                  onClick={() => toggleSort("updated")}
                >
                  Updated
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText={
          search.trim()
            ? "No automations match that search."
            : "No automations yet. Create the first one."
        }
        emptyColSpan={7}
        footer={footer}
      >
        {visible.map((automation) => (
          <TableRow
            key={automation.id}
            className="group"
            rowAction={() => void openEditor(automation.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(automation.id)}
                onCheckedChange={() => selection.toggle(automation.id)}
                aria-label={`Select ${automation.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <Link
                to="/admin/automations/$automationId"
                params={{ automationId: automation.id }}
                className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
                title={automation.name}
              >
                {automation.name}
              </Link>
            </TableCell>
            <TableCell column="meta">
              <LiveCell
                automation={automation}
                busy={liveId === automation.id}
                disabled={liveId !== null}
                onChange={(next) => void handleToggleLive(automation, next)}
              />
            </TableCell>
            <TableCell column="meta" className="hidden sm:table-cell">
              <Badge variant={automation.isValid ? "secondary" : "outline"}>
                {automation.summary}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {automation.next_run_at
                ? formatDateTime(automation.next_run_at)
                : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {formatDate(automation.updated_at)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                {automation.can_run_manually ? (
                  <DisabledReason
                    disabled={paused || !automation.isValid}
                    reason={
                      paused
                        ? "Every automation is paused. Resume them to start this flow."
                        : "This flow has something to fix before it can run. Open it and check the steps marked in red."
                    }
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={
                        paused || !automation.isValid || runningId !== null
                      }
                      aria-label={`Run ${automation.name} now`}
                      onClick={() => void handleRunNow(automation)}
                    >
                      {runningId === automation.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <PlayIcon className="size-4" />
                      )}
                    </Button>
                  </DisabledReason>
                ) : null}
                <DisabledReason
                  disabled={paused || !automation.isValid}
                  reason={
                    paused
                      ? "Every automation is paused. Resume them to test this flow."
                      : "This flow has something to fix before it can be tested."
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={paused || !automation.isValid}
                    aria-label={`Test ${automation.name} with one member`}
                    onClick={() => setTestTarget(automation)}
                  >
                    <UserIcon className="size-4" />
                  </Button>
                </DisabledReason>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate ${automation.name}`}
                  disabled={duplicatingId !== null}
                  onClick={() => void handleDuplicate(automation)}
                >
                  {duplicatingId === automation.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
                {/*
                  Renames rather than opening the editor: clicking the row
                  already does that, so this was a second way to do the same
                  thing and no way at all to change a flow's name without
                  opening its canvas.
                */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename ${automation.name}`}
                  onClick={() => openRename(automation)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${automation.name}`}
                  onClick={() => setDeleteTargets([automation])}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {testTarget ? (
        <TestWithMemberDialog
          open
          automationId={testTarget.id}
          automationName={testTarget.name}
          onOpenChange={(open) => {
            if (!open) setTestTarget(null)
          }}
          onStarted={(runId) =>
            navigate({
              to: "/admin/automations/$automationId",
              params: { automationId: testTarget.id },
              search: { run: runId },
            })
          }
        />
      ) : null}

      <FormDialog
        open={createOpen}
        dirty={Boolean(createName.trim()) || createChoice !== "blank"}
        busy={creating}
        onClose={closeCreate}
      >
        {(requestClose) => (
          <DialogContent variant="admin" className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>New automation</DialogTitle>
              <DialogDescription>
                Start with a ready-to-edit flow or a blank canvas.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Starting point</legend>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <TemplateChoiceCard
                    selected={createChoice === "blank"}
                    icon={<CircleDashedIcon className="size-4" />}
                    name="Blank canvas"
                    description="Build your own flow one step at a time."
                    steps={["No steps yet"]}
                    onClick={() => chooseCreateStart("blank")}
                  />
                  {initial.templates.map((template) => {
                    const Icon = TEMPLATE_ICONS[template.key]
                    return (
                      <TemplateChoiceCard
                        key={template.key}
                        selected={createChoice === template.key}
                        icon={<Icon className="size-4" />}
                        name={template.name}
                        description={template.description}
                        steps={template.steps}
                        onClick={() => chooseCreateStart(template.key)}
                      />
                    )
                  })}
                </div>
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor="automation-name">Name</Label>
                <Input
                  id="automation-name"
                  value={createName}
                  maxLength={80}
                  placeholder="Weekly changelog email"
                  onChange={(event) => setCreateName(event.target.value)}
                  aria-invalid={!createName.trim() || undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCreate()
                    }
                  }}
                />
              </div>

              {createChoice !== "blank" ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  This flow starts turned off. Review its audience and email
                  before you turn it on or run it.
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create automation
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <FormDialog
        open={renameTarget !== null}
        dirty={renameName.trim() !== (renameTarget?.name ?? "")}
        busy={renaming}
        onClose={closeRename}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Rename automation</DialogTitle>
              <DialogDescription>
                Only the name changes. The steps and whether it is live stay
                exactly as they are.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void handleRename()
              }}
            >
              <DialogBody className="grid gap-2">
                <Label htmlFor="rename-automation-name">Name</Label>
                <Input
                  id="rename-automation-name"
                  value={renameName}
                  maxLength={80}
                  placeholder="Weekly changelog email"
                  onChange={(event) => setRenameName(event.target.value)}
                  aria-invalid={!renameName.trim() || undefined}
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={renaming}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={renaming}>
                  {renaming ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : null}
                  Save name
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>

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
            ? "The flows and their canvases are permanently removed. This cannot be undone."
            : "The flow and its canvas are permanently removed. This cannot be undone."
        }
        confirmLabel={
          closingDeleteTargets && closingDeleteTargets.length > 1
            ? "Delete automations"
            : "Delete automation"
        }
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={confirmPauseOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmPauseOpen(false)
        }}
        title="Pause every automation?"
        description="Every flow stops as soon as you confirm, and no new one can be started by hand. A run part-way through finishes the step it is on, then holds its place — nothing is thrown away, and everything picks up where it left off when you resume."
        confirmLabel="Pause automations"
        loading={automationPauseBusy}
        onConfirm={() => void handlePauseChange(true)}
      />
    </>
  )
}

function TemplateChoiceCard({
  selected,
  icon,
  name,
  description,
  steps,
  onClick,
}: {
  selected: boolean
  icon: React.ReactNode
  name: string
  description: string
  steps: readonly string[]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex aspect-square min-h-0 flex-col items-start overflow-hidden rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30",
        focusRing,
        selected
          ? "border-primary ring-3 ring-primary/15"
          : "border-foreground/10"
      )}
    >
      <span className="mb-1.5 flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="line-clamp-2 text-xs font-medium">{name}</span>
      <span className="mt-1 line-clamp-3 text-xs leading-4 text-muted-foreground">
        {description}
      </span>
      <span className="mt-auto line-clamp-2 pt-2 text-[10px] leading-4 text-muted-foreground">
        {steps.join(" → ")}
      </span>
    </button>
  )
}

/**
 * Whether one flow acts on its own, and what it acts on.
 *
 * Three states, and the switch only appears in the two where it means
 * something. A flow with nothing in the Triggers group on it cannot be switched
 * on at all, so it says what it is instead of offering a control that would
 * only ever refuse.
 *
 * A flow that is already on can always be switched off, whatever is wrong with
 * it — getting out is never blocked. Switching one *on* needs a flow that
 * compiles, because a trigger is read from the compiled copy and a broken draft
 * has none.
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
    return (
      <span className="text-xs text-muted-foreground">Runs by hand</span>
    )
  }

  const blocked = !automation.isValid && !automation.enabled
  // Switched on, but edited since into something that cannot run. It fires
  // nothing in that state, so the switch must not be the only warning.
  const stalled = automation.enabled && !automation.isValid
  const safelyPaused = !automation.enabled && automation.paused_reason

  return (
    <div className="flex items-center gap-2">
      <DisabledReason
        disabled={blocked}
        reason="This flow has something to fix before it can go live. Open it and check the steps marked in red."
      >
        <Switch
          checked={automation.enabled}
          disabled={blocked || disabled}
          aria-label={`${automation.enabled ? "Stop" : "Start"} ${automation.name} reacting to ${automation.trigger_name}`}
          onCheckedChange={onChange}
        />
      </DisabledReason>
      {busy ? (
        <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
      ) : null}
      {stalled ? (
        <span className="truncate text-xs text-destructive">
          On, but not running
        </span>
      ) : null}
      {safelyPaused ? (
        <span
          className="max-w-56 truncate text-xs text-destructive"
          title={automation.paused_reason ?? undefined}
        >
          {automation.paused_reason}
        </span>
      ) : null}
    </div>
  )
}
