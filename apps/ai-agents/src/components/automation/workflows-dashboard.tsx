import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dateFormatter } from "@/lib/format"
import {
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  getWorkflowErrorMessage,
  listWorkflows,
  type WorkflowDetail,
  type WorkflowItem,
} from "@/lib/api/workflows"

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
}

function runStatusBadgeVariant(status: string) {
  if (status === "failed") return "destructive" as const
  if (status === "running") return "default" as const
  if (status === "completed") return "secondary" as const
  return "outline" as const
}

// A freshly created/duplicated workflow hasn't run yet — shape it for the list.
function toListItem(workflow: WorkflowDetail): WorkflowItem {
  return {
    id: workflow.id,
    name: workflow.name,
    node_count: workflow.nodes.length,
    last_run_status: null,
    last_run_at: null,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
  }
}

// Workflow list: open one to edit and run it on the canvas.
export function WorkflowsDashboard() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = React.useState<WorkflowItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<WorkflowItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    let active = true
    listWorkflows()
      .then((data) => {
        if (active) setWorkflows(data.workflows)
      })
      .catch((loadError) => {
        if (active) setError(getWorkflowErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function openWorkflow(workflowId: string) {
    navigate({
      to: "/admin/automation/$workflowId",
      params: { workflowId },
    })
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const workflow = await createWorkflow("Untitled workflow")
      openWorkflow(workflow.id)
    } catch (createError) {
      setError(getWorkflowErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  async function handleDuplicate(workflowId: string) {
    setError(null)
    try {
      const copy = await duplicateWorkflow(workflowId)
      setWorkflows((current) => [toListItem(copy), ...current])
    } catch (duplicateError) {
      setError(getWorkflowErrorMessage(duplicateError))
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await deleteWorkflow(deleteTarget.id)
      setWorkflows((current) =>
        current.filter((workflow) => workflow.id !== deleteTarget.id)
      )
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(getWorkflowErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? <ErrorAlert className="mb-4" message={error} /> : null}

      <DashboardTable
        title="Automation"
        icon={
          <WorkflowIcon className="text-muted-foreground" />
        }
        count={workflows.length}
        controls={
          <DashboardToolbarButton
            type="button"
            disabled={creating}
            onClick={handleCreate}
          >
            <PlusIcon className="size-4" />
            New Workflow
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Workflow</TableHead>
              <TableHead column="meta">Nodes</TableHead>
              <TableHead column="meta">Last run</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Updated
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && workflows.length === 0}
        emptyText="No workflows yet. Build one on the canvas to call contacts, hit APIs, and update your CRM automatically."
        emptyColSpan={5}
      >
        {workflows.map((workflow) => (
          <WorkflowTableRow
            key={workflow.id}
            workflow={workflow}
            onOpen={() => openWorkflow(workflow.id)}
            onDuplicate={() => handleDuplicate(workflow.id)}
            onDelete={() => setDeleteTarget(workflow)}
          />
        ))}
      </DashboardTable>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete Workflow?"
        description={`This removes "${deleteTarget?.name}" and its run history. Calls already made keep their recordings and history.`}
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function WorkflowTableRow({
  workflow,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  workflow: WorkflowItem
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group">
      <TableCell column="main">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onOpen}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <WorkflowIcon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <span className="block max-w-full truncate font-medium group-hover:underline">
              {workflow.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {workflow.node_count === 1
                ? "1 node"
                : `${workflow.node_count} nodes`}
            </span>
          </div>
        </button>
      </TableCell>
      <TableCell column="meta">{workflow.node_count}</TableCell>
      <TableCell column="meta">
        {workflow.last_run_status ? (
          <Badge variant={runStatusBadgeVariant(workflow.last_run_status)}>
            {RUN_STATUS_LABELS[workflow.last_run_status] ??
              workflow.last_run_status}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(workflow.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDuplicate}
            aria-label={`Duplicate ${workflow.name}`}
          >
            <CopyIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${workflow.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
