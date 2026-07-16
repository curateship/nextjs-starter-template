import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  MegaphoneIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { CampaignWizardDialog } from "@/components/campaign-wizard-dialog"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  campaignStatusBadgeVariant,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaign-format"
import { dateFormatter } from "@/lib/format"
import {
  deleteCampaign,
  getCampaignErrorMessage,
  listCampaigns,
  type CampaignItem,
} from "@/lib/api/campaigns"

// Campaign list: status at a glance, drill into the detail page to run one.
export function CampaignsDashboard() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = React.useState<CampaignItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<CampaignItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    let active = true
    listCampaigns()
      .then((data) => {
        if (active) setCampaigns(data.campaigns)
      })
      .catch((loadError) => {
        if (active) setError(getCampaignErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await deleteCampaign(deleteTarget.id)
      setCampaigns((current) =>
        current.filter((campaign) => campaign.id !== deleteTarget.id)
      )
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(getCampaignErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      <DashboardTable
        title="Campaigns"
        icon={
          <MegaphoneIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={campaigns.length}
        controls={
          <DashboardToolbarButton type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New Campaign
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Campaign</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">Progress</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Agent
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                List
              </TableHead>
              <TableHead column="meta">Created</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && campaigns.length === 0}
        emptyText="No campaigns yet. A campaign calls every contact on a list with one of your agents."
        emptyColSpan={7}
      >
        {campaigns.map((campaign) => (
          <CampaignTableRow
            key={campaign.id}
            campaign={campaign}
            onOpen={() =>
              navigate({
                to: "/admin/campaigns/$campaignId",
                params: { campaignId: campaign.id },
              })
            }
            onDelete={() => setDeleteTarget(campaign)}
          />
        ))}
      </DashboardTable>

      <CampaignWizardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(campaign) =>
          navigate({
            to: "/admin/campaigns/$campaignId",
            params: { campaignId: campaign.id },
          })
        }
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        title="Delete Campaign?"
        description={`This removes "${deleteTarget?.name}" and its recipient list. Calls already made keep their recordings and history.`}
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function CampaignTableRow({
  campaign,
  onOpen,
  onDelete,
}: {
  campaign: CampaignItem
  onOpen: () => void
  onDelete: () => void
}) {
  const { stats } = campaign
  const done = stats.completed + stats.failed + stats.skipped
  return (
    <TableRow className="group">
      <TableCell column="main">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onOpen}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <MegaphoneIcon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <span className="block max-w-full truncate font-medium group-hover:underline">
              {campaign.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {campaign.phone_number ?? "No number"}
            </span>
          </div>
        </button>
      </TableCell>
      <TableCell column="meta">
        <Badge variant={campaignStatusBadgeVariant(campaign.status)}>
          {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
        </Badge>
      </TableCell>
      <TableCell column="meta">
        {campaign.status === "draft" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${done}/${stats.total}`
        )}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {campaign.agent_name ?? "—"}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {campaign.list_name ?? "—"}
      </TableCell>
      <TableCell column="mutedMeta">
        {dateFormatter.format(new Date(campaign.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${campaign.name}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
