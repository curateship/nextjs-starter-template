import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  GlobeIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { SiteDialog } from "@/components/sites/site-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getSiteErrorMessage,
  loadSiteDeleteImpact,
  removeSite,
  type Site,
  type SiteDeleteImpact,
} from "@/lib/api/sites/sites"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

/**
 * The sites this deployment serves.
 *
 * The address column is the point of the screen, so it is a real link — the
 * quickest way to check a site is to open it, and in development those
 * `*.localhost` addresses work with no setup at all.
 */

const STATUS_LABELS: Record<Site["status"], string> = {
  draft: "Draft",
  active: "Live",
  inactive: "Switched off",
}

export function SitesDashboard({
  sites,
  baseDomain,
  searchText,
}: {
  sites: Site[]
  baseDomain: string
  searchText: string
}) {
  const router = useRouter()
  const navigate = useListSearchNavigate()
  const [text, setText] = useSearchBoxText(searchText, (value) =>
    navigate({ q: value || undefined })
  )

  /** The window's subject: a site being edited, or null when creating one. */
  const [editing, setEditing] = React.useState<{ site: Site | null } | null>(null)
  const [run, busy] = useAsyncAction(getSiteErrorMessage)
  const [confirm, setConfirm] = React.useState<
    (SiteDeleteImpact & { id: string }) | null
  >(null)

  const rows = React.useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) return sites
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(query) ||
        site.address.toLowerCase().includes(query)
    )
  }, [sites, searchText])

  const askToDelete = React.useCallback(
    (site: Site) => {
      void run(async () => {
        const impact = await loadSiteDeleteImpact(site.id)
        setConfirm({ ...impact, id: site.id })
      })
    },
    [run]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!confirm) return
    const done = await run(async () => {
      await removeSite(confirm.id)
      await router.invalidate()
      toast.success(`${confirm.name} was deleted.`)
    })
    if (done) setConfirm(null)
  }, [confirm, router, run])

  return (
    <>
      <DashboardTable
        title="Sites"
        icon={<GlobeIcon className="text-muted-foreground" />}
        count={sites.length}
        controls={
          <>
            <DashboardToolbarSearch
              name="site-search"
              aria-label="Search sites"
              placeholder="Search sites…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setEditing({ site: null })}
            >
              <PlusIcon className="size-4" />
              New site
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Site</TableHead>
              <TableHead column="meta">Address</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                State
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={rows.length === 0}
        emptyText={
          searchText.trim()
            ? "No site matches that search."
            : "No sites yet. Create the first one."
        }
        emptyColSpan={4}
        footer={{ type: "summary", count: sites.length, label: "sites" }}
      >
        {rows.map((site) => (
          <TableRow
            key={site.id}
            className="group"
            rowAction={() => setEditing({ site })}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block min-w-0 truncate text-left text-sm font-medium group-hover:underline"
                title={site.name}
                onClick={() => setEditing({ site })}
              >
                {site.name}
              </button>
              {site.description ? (
                <span
                  className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                  title={site.description}
                >
                  {site.description}
                </span>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              <a
                href={`//${site.address}`}
                target="_blank"
                rel="noreferrer"
                className="block max-w-56 truncate underline-offset-4 hover:underline"
                title={`Open ${site.address}`}
              >
                {site.address}
              </a>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {STATUS_LABELS[site.status]}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${site.name}`}
                  onClick={() => setEditing({ site })}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Delete ${site.name}`}
                  onClick={() => askToDelete(site)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <SiteDialog
        open={editing !== null}
        site={editing?.site ?? null}
        baseDomain={baseDomain}
        onClose={() => setEditing(null)}
        onSaved={(saved, wasNew) => {
          setEditing(null)
          void router.invalidate()
          toast.success(wasNew ? `${saved.name} was created.` : "Site saved.")
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title="Delete this site?"
        description={
          confirm
            ? `${confirm.name} goes for good, and ${confirm.address} stops answering. Everything belonging to this site goes with it.`
            : null
        }
        confirmLabel="Delete site"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
