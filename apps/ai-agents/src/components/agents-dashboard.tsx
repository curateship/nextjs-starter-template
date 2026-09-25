import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BotIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import {
  Dialog,
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
} from "@/components/ui/table"
import {
  bulkDeleteAgents,
  createAgent,
  getAgentErrorMessage,
  listAgents,
  type AgentItem,
} from "@/lib/api/agents"
import { dateFormatter } from "@/lib/format"

const pageSizeOptions = [10, 20, 50]

// Voice agents table: create-then-navigate into the editor, row per agent.
export function AgentsDashboard() {
  const navigate = useNavigate()
  const [agents, setAgents] = React.useState<AgentItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    let active = true
    listAgents()
      .then((data) => {
        if (!active) return
        setAgents(data.agents)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getAgentErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filteredAgents = React.useMemo(() => {
    const query = searchQuery.toLowerCase()
    if (!query) return agents
    return agents.filter((agent) => agent.name.toLowerCase().includes(query))
  }, [agents, searchQuery])

  const totalPages = Math.ceil(filteredAgents.length / pageSize)
  const paginatedAgents = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAgents.slice(start, start + pageSize)
  }, [currentPage, filteredAgents, pageSize])

  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function toggleSelected(agentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const visibleIds = paginatedAgents.map((agent) => agent.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleVisibleSelected() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function handleCreate() {
    if (!newName || creating) return
    setCreating(true)
    setError(null)
    try {
      const agent = await createAgent(newName)
      // Straight into the editor for the new agent.
      navigate({ to: "/admin/agents/$agentId", params: { agentId: agent.id } })
    } catch (createError) {
      setError(getAgentErrorMessage(createError))
      setCreating(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return
    const ids = deleteIds
    setDeleting(true)
    setError(null)
    try {
      await bulkDeleteAgents(ids)
      const removed = new Set(ids)
      setAgents((current) => current.filter((agent) => !removed.has(agent.id)))
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
    } catch (deleteError) {
      setError(getAgentErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const deleteCount = deleteIds?.length ?? 0

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="agent-search"
        aria-label="Search agents"
        placeholder="Search agents..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <DashboardToolbarButton type="button" onClick={() => setCreateOpen(true)}>
        <PlusIcon className="size-4" />
        New Agent
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      <DashboardTable
        title="Agents"
        icon={<BotIcon className="text-muted-foreground" />}
        count={filteredAgents.length}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select visible agents"
                />
              </TableHead>
              <TableHead column="main">Agent</TableHead>
              <TableHead column="meta">Model</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Voice
              </TableHead>
              <TableHead column="meta">Sync</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Updated
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && paginatedAgents.length === 0}
        emptyText="No agents yet. Create your first voice agent to start making calls."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredAgents.length,
          totalPages,
          pageSizeOptions,
          onPageChange: (page: number) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (size: number) => {
            setPageSize(size)
            setCurrentPage(1)
          },
        }}
      >
        {paginatedAgents.map((agent) => (
          <AgentTableRow
            key={agent.id}
            agent={agent}
            selected={selectedIds.has(agent.id)}
            onToggle={() => toggleSelected(agent.id)}
            onOpen={() =>
              navigate({
                to: "/admin/agents/$agentId",
                params: { agentId: agent.id },
              })
            }
            onDelete={() => setDeleteIds([agent.id])}
          />
        ))}
      </DashboardTable>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setNewName("")
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>New Agent</DialogTitle>
            <DialogDescription>Name it now — you configure the voice and prompt next.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label htmlFor="new-agent-name">Agent name</Label>
              <Input
                id="new-agent-name"
                value={newName}
                placeholder="e.g. Appointment Reminder"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreate()
                }}
                autoFocus
              />
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!newName || creating} onClick={handleCreate}>
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {creating ? "Creating" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteIds}
        title={`Delete ${deleteCount === 1 ? "Agent" : `${deleteCount} Agents`}?`}
        description={`This removes ${deleteCount === 1 ? "the agent" : "these agents"} permanently. Past calls keep their history but lose the agent reference.`}
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function AgentTableRow({
  agent,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  agent: AgentItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const synced = Boolean(agent.provider_assistant_id)
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${agent.name}`}
        />
      </TableCell>
      <TableCell column="main">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onOpen}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <BotIcon className="size-4 text-muted-foreground" />
          </span>
          {/* Hard cap so a long first message can't widen the column. */}
          <div className="min-w-0 max-w-72">
            <span className="block truncate font-medium group-hover:underline">
              {agent.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {agent.first_message || "No first message yet"}
            </span>
          </div>
        </button>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{agent.model}</Badge>
      </TableCell>
      <TableCell column="meta" className="hidden lg:table-cell">
        {agent.voice_id ? (
          <Badge variant="outline">{agent.voice_id}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell column="meta">
        <Badge variant={synced ? "secondary" : "outline"}>
          {synced ? "Synced" : "Not synced"}
        </Badge>
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(agent.updated_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${agent.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
