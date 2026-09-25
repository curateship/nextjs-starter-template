import * as React from "react"
import {
  BookmarkIcon,
  CalendarClockIcon,
  EyeOffIcon,
  FolderTreeIcon,
  Loader2Icon,
  PencilIcon,
  SparklesIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import {
  IntentBadge,
  KeywordStatusBadge,
  OpportunityScoreBadge,
} from "@/components/keywords-dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  TableSortButton,
} from "@/components/ui/table"
import {
  getClusterErrorMessage,
  listClusters,
  rebuildClusters,
  renameKeywordCluster,
  updateKeywordClusterStatus,
  type ClusterRow,
  type ClusterSortField,
} from "@/lib/api/clusters"
import {
  getKeywordErrorMessage,
  listProjectKeywords,
  type ProjectKeywordRow,
} from "@/lib/api/keywords"
import type { ProjectItem } from "@/lib/api/seo-projects"
import { KEYWORD_STATUSES } from "@/lib/keyword-research"

const numberFormatter = new Intl.NumberFormat("en-US")

export function ClustersDashboard({ project }: { project: ProjectItem }) {
  const projectId = project.id
  const [rows, setRows] = React.useState<ClusterRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [unclusteredCount, setUnclusteredCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [sort, setSort] = React.useState<{
    field: ClusterSortField
    direction: "asc" | "desc"
  }>({ field: "keywords", direction: "desc" })

  const [building, setBuilding] = React.useState(false)
  const [confirmRebuild, setConfirmRebuild] = React.useState(false)
  const [detailCluster, setDetailCluster] = React.useState<ClusterRow | null>(
    null
  )
  const [renaming, setRenaming] = React.useState<ClusterRow | null>(null)

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  React.useEffect(() => {
    setPage(1)
  }, [debouncedQuery, sort, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    listClusters({
      projectId,
      q: debouncedQuery.trim() || undefined,
      sort,
      pagination: { page, pageSize },
    })
      .then((data) => {
        if (!active) return
        setRows(data.rows)
        setTotal(data.total)
        setUnclusteredCount(data.unclusteredCount)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(getClusterErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, debouncedQuery, sort, page, pageSize, refreshToken])

  async function build() {
    setBuilding(true)
    setError(null)
    try {
      await rebuildClusters(projectId)
      setConfirmRebuild(false)
      setRefreshToken((token) => token + 1)
    } catch (buildError) {
      setError(getClusterErrorMessage(buildError))
    } finally {
      setBuilding(false)
    }
  }

  function toggleSort(field: ClusterSortField) {
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
        : { field, direction: field === "name" ? "asc" : "desc" }
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Topic Clusters"
        icon={
          <FolderTreeIcon className="text-muted-foreground" />
        }
        count={total}
        controls={
          <>
            {unclusteredCount > 0 && total > 0 ? (
              <span className="text-xs text-muted-foreground">
                {numberFormatter.format(unclusteredCount)} unclustered
              </span>
            ) : null}
            <DashboardToolbarSearch
              name="clusters-search"
              aria-label="Search clusters"
              placeholder="Search clusters..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              disabled={building}
              onClick={() => {
                if (total > 0) {
                  setConfirmRebuild(true)
                } else {
                  void build()
                }
              }}
            >
              {building ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {total > 0 ? "Re-cluster" : "Build Clusters"}
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sort.field === "name"}
                  direction={sort.direction}
                  onClick={() => toggleSort("name")}
                >
                  Cluster
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "keywords"}
                  direction={sort.direction}
                  onClick={() => toggleSort("keywords")}
                >
                  Keywords
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "volume"}
                  direction={sort.direction}
                  onClick={() => toggleSort("volume")}
                >
                  Total volume
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Avg KD
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "opportunity"}
                  direction={sort.direction}
                  onClick={() => toggleSort("opportunity")}
                >
                  Best opportunity
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Top keyword
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && rows.length === 0}
        emptyText="No clusters yet. Build clusters to group keywords into topics."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          pageSizeOptions: [10, 25, 50, 100],
          onPageChange: (nextPage) =>
            setPage(Math.max(1, Math.min(nextPage, totalPages))),
          onPageSizeChange: setPageSize,
        }}
      >
        {rows.map((row) => (
          <TableRow key={row.id} className="group">
            <TableCell column="main">
              <button
                type="button"
                className="max-w-full truncate text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setDetailCluster(row)}
                title={row.name}
              >
                {row.name}
              </button>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">{row.keywordCount}</Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {row.totalVolume ? numberFormatter.format(row.totalVolume) : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {row.avgDifficulty ?? "—"}
            </TableCell>
            <TableCell column="meta">
              <OpportunityScoreBadge score={row.bestOpportunity} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              <span
                className="inline-block max-w-56 truncate align-middle"
                title={row.topKeyword ?? ""}
              >
                {row.topKeyword ?? "—"}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRenaming(row)}
                title="Rename cluster"
                aria-label="Rename cluster"
              >
                <PencilIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <RebuildConfirmDialog
        open={confirmRebuild}
        building={building}
        onOpenChange={setConfirmRebuild}
        onConfirm={() => void build()}
      />
      <ClusterDetailDialog
        projectId={projectId}
        cluster={detailCluster}
        onOpenChange={(open) => {
          if (!open) setDetailCluster(null)
        }}
        onUpdated={() => setRefreshToken((token) => token + 1)}
      />
      <RenameClusterDialog
        projectId={projectId}
        cluster={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onRenamed={() => setRefreshToken((token) => token + 1)}
      />
    </div>
  )
}

function RebuildConfirmDialog({
  open,
  building,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  building: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Re-cluster Keywords</DialogTitle>
          <DialogDescription>
            This replaces all clusters. Renamed clusters lose their custom
            names.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Rebuild topic clusters from the current keyword list?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={building}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={building} onClick={onConfirm}>
              {building ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              Re-cluster
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ClusterDetailDialog({
  projectId,
  cluster,
  onOpenChange,
  onUpdated,
}: {
  projectId: string
  cluster: ClusterRow | null
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [members, setMembers] = React.useState<ProjectKeywordRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!cluster) {
      setMembers([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    listProjectKeywords({
      projectId,
      filters: { clusterId: cluster.id, status: [...KEYWORD_STATUSES] },
      sort: { field: "searchVolume", direction: "desc" },
      pagination: { page: 1, pageSize: 100 },
    })
      .then((data) => {
        if (!active) return
        setMembers(data.rows)
        setTotal(data.total)
      })
      .catch((loadError) => {
        if (active) setError(getKeywordErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, cluster])

  async function applyStatus(status: (typeof KEYWORD_STATUSES)[number]) {
    if (!cluster) return
    setBusy(true)
    setError(null)
    try {
      await updateKeywordClusterStatus(projectId, cluster.id, status)
      onUpdated()
      onOpenChange(false)
    } catch (statusError) {
      setError(getClusterErrorMessage(statusError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(cluster)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{cluster?.name ?? "Cluster"}</DialogTitle>
          <DialogDescription>
            {total
              ? `${total} keyword${total === 1 ? "" : "s"} in this topic cluster.`
              : "Keywords in this topic cluster."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading keywords...
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {members.length ? (
            <ul className="divide-y">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate" title={member.keyword}>
                    {member.keyword}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <IntentBadge intent={member.intent} />
                    <span className="w-16 text-right">
                      {member.searchVolume != null
                        ? numberFormatter.format(member.searchVolume)
                        : "—"}
                    </span>
                    <OpportunityScoreBadge score={member.opportunityScore} />
                    <KeywordStatusBadge status={member.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {total > members.length ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {members.length} of {total} keywords. Bulk
              actions apply to all of them.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void applyStatus("ignored")}
            >
              <EyeOffIcon className="size-4" />
              Ignore all
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void applyStatus("saved")}
            >
              <BookmarkIcon className="size-4" />
              Save all
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void applyStatus("planned")}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CalendarClockIcon className="size-4" />
              )}
              Plan all
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameClusterDialog({
  projectId,
  cluster,
  onOpenChange,
  onRenamed,
}: {
  projectId: string
  cluster: ClusterRow | null
  onOpenChange: (open: boolean) => void
  onRenamed: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (cluster) {
      setName(cluster.name)
      setError(null)
    }
  }, [cluster])

  async function save() {
    if (!cluster) return
    if (!name.trim()) {
      setError("Cluster name is required")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await renameKeywordCluster(projectId, cluster.id, name)
      onRenamed()
      onOpenChange(false)
    } catch (saveError) {
      setError(getClusterErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(cluster)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Rename Cluster</DialogTitle>
          <DialogDescription>
            Give this topic cluster a descriptive name.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cluster-name">Name</Label>
            <Input
              id="cluster-name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
