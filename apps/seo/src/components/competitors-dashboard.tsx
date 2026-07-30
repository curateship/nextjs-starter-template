import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  GitCompareIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createCompetitorGapJob,
  getKeywordErrorMessage,
} from "@/lib/api/keywords"
import {
  addCompetitor,
  getProjectErrorMessage,
  removeCompetitor,
  type CompetitorItem,
  type ProjectItem,
} from "@/lib/api/seo-projects"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function CompetitorsDashboard({
  project,
  initialCompetitors: competitors,
}: {
  project: ProjectItem
  initialCompetitors: CompetitorItem[]
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = React.useState(false)
  const [gapOpen, setGapOpen] = React.useState(false)
  const [pendingRemove, setPendingRemove] =
    React.useState<CompetitorItem | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function confirmRemove() {
    if (!pendingRemove) return
    setBusy(true)
    setError(null)
    try {
      await removeCompetitor(project.id, pendingRemove.id)
      await router.invalidate()
      setPendingRemove(null)
    } catch (removeError) {
      setError(getProjectErrorMessage(removeError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!project.domain ? (
        <div className="mb-4 rounded-md border border-yellow-300/40 bg-yellow-100/40 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-200">
          Set a domain in Settings → Project to run gap analysis against your
          site.
        </div>
      ) : null}

      <DashboardTable
        title="Competitors"
        icon={<UsersIcon className="text-muted-foreground" />}
        count={competitors.length}
        controls={
          <>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={!competitors.length || !project.domain}
              onClick={() => setGapOpen(true)}
            >
              <GitCompareIcon className="size-4" />
              Run Gap Analysis
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon className="size-4" />
              Add Competitor
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Competitor</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Added
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={competitors.length === 0}
        emptyText="No competitors yet. Add a competitor domain to compare keyword gaps."
        emptyColSpan={3}
        footer={{
          type: "summary",
          count: competitors.length,
          label: "competitors",
        }}
      >
        {competitors.map((competitor) => (
          <TableRow key={competitor.id}>
            <TableCell column="main">
              <div className="truncate font-medium">{competitor.domain}</div>
              <div className="text-xs text-muted-foreground">
                {competitor.normalizedDomain}
              </div>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {dateFormatter.format(new Date(competitor.created_at))}
            </TableCell>
            <TableCell column="meta">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPendingRemove(competitor)}
                aria-label={`Remove ${competitor.domain}`}
                title={`Remove ${competitor.domain}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <AddCompetitorDialog
        projectId={project.id}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void router.invalidate()}
      />
      <RunGapDialog
        project={project}
        competitors={competitors}
        open={gapOpen}
        onOpenChange={setGapOpen}
      />
      <RemoveCompetitorDialog
        competitor={pendingRemove}
        removing={busy}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  )
}

function AddCompetitorDialog({
  projectId,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [domain, setDomain] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setDomain("")
      setError(null)
    }
  }, [open])

  async function save() {
    if (!domain.trim()) {
      setError("Enter a competitor domain.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addCompetitor(projectId, domain)
      onAdded()
      onOpenChange(false)
    } catch (saveError) {
      setError(getProjectErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add Competitor</DialogTitle>
          <DialogDescription>
            Add a competitor domain to compare keyword coverage.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="competitor-domain">Competitor domain</Label>
            <Input
              id="competitor-domain"
              placeholder="competitor.com"
              value={domain}
              disabled={busy}
              onChange={(event) => setDomain(event.target.value)}
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
              {busy ? "Adding..." : "Add Competitor"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RemoveCompetitorDialog({
  competitor,
  removing,
  onOpenChange,
  onConfirm,
}: {
  competitor: CompetitorItem | null
  removing: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(competitor)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Remove Competitor</DialogTitle>
          <DialogDescription>
            Keywords already discovered from this competitor stay in the
            project.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Remove{" "}
            <span className="font-medium">
              {competitor?.domain ?? "this competitor"}
            </span>
            ?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={removing}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing}
              onClick={onConfirm}
            >
              {removing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Remove
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunGapDialog({
  project,
  competitors,
  open,
  onOpenChange,
}: {
  project: ProjectItem
  competitors: CompetitorItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [competitorDomain, setCompetitorDomain] = React.useState("")
  const [limit, setLimit] = React.useState("300")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setCompetitorDomain(competitors[0]?.normalizedDomain ?? "")
      setError(null)
    }
  }, [open, competitors])

  async function start() {
    if (!competitorDomain) {
      setError("Select a competitor.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createCompetitorGapJob({
        projectId: project.id,
        competitorDomain,
        limit: Number(limit) || undefined,
      })
      onOpenChange(false)
      void router.navigate({
        to: "/keywords",
        search: { source: "competitor_gap" },
      })
    } catch (startError) {
      setError(getKeywordErrorMessage(startError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Run Competitor Gap Analysis</DialogTitle>
          <DialogDescription>
            Find keywords where {project.domain ?? "your domain"} is missing but
            the competitor ranks.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="gap-competitor">Competitor</Label>
            <Select
              value={competitorDomain}
              disabled={busy}
              onValueChange={setCompetitorDomain}
            >
              <SelectTrigger id="gap-competitor" className="w-full">
                <SelectValue placeholder="Select competitor" />
              </SelectTrigger>
              <SelectContent>
                {competitors.map((competitor) => (
                  <SelectItem
                    key={competitor.id}
                    value={competitor.normalizedDomain}
                  >
                    {competitor.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gap-limit">Result limit</Label>
            <Select value={limit} onValueChange={setLimit} disabled={busy}>
              <SelectTrigger id="gap-limit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["100", "300", "500", "1000"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value} keywords
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
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
            <Button type="button" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Starting..." : "Run Analysis"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
