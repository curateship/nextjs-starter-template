import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  Loader2Icon,
  MegaphoneIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  RocketIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { CallDetailModal } from "@/components/call-detail-modal"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table,
  TableBody,
  TableSurface,
} from "@/components/ui/table"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  campaignStatusBadgeVariant,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaign-format"
import {
  getCampaignErrorMessage,
  launchCampaign,
  setCampaignPaused,
  tickCampaign,
  type CampaignDetailResponse,
} from "@/lib/api/campaigns"

const TICK_INTERVAL_MS = 3000

const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  calling: "Calling",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
}

function recipientBadgeVariant(status: string) {
  if (status === "failed") return "destructive" as const
  if (status === "completed") return "secondary" as const
  if (status === "calling") return "default" as const
  return "outline" as const
}

// Campaign control room: launch/pause, live stat tiles, recipient progress.
// While the campaign runs, this page's 3s tick poll IS the dialer.
export function CampaignDetail({ initial }: { initial: CampaignDetailResponse }) {
  const [detail, setDetail] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [acting, setActing] = React.useState(false)
  const [detailCallId, setDetailCallId] = React.useState<string | null>(null)

  const { campaign, recipients } = detail
  // Tick while running, and while paused with calls still in flight.
  const ticking =
    campaign.status === "running" ||
    (campaign.status === "paused" && campaign.stats.calling > 0)

  React.useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => {
      tickCampaign(campaign.id)
        .then(setDetail)
        .catch((tickError) => {
          // Surface dialer errors — they stop the campaign from progressing.
          setError(getCampaignErrorMessage(tickError))
        })
    }, TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ticking, campaign.id])

  async function runAction(action: () => Promise<CampaignDetailResponse>) {
    if (acting) return
    setActing(true)
    setError(null)
    try {
      setDetail(await action())
    } catch (actionError) {
      setError(getCampaignErrorMessage(actionError))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Back to campaigns"
        >
          <Link to="/admin/campaigns">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <MegaphoneIcon className="size-4 text-muted-foreground" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {campaign.name}
        </h1>
        <Badge variant={campaignStatusBadgeVariant(campaign.status)}>
          {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
        </Badge>
        {campaign.status === "draft" ? (
          <Button
            type="button"
            disabled={acting}
            onClick={() => runAction(() => launchCampaign(campaign.id))}
          >
            {acting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RocketIcon className="size-4" />
            )}
            Launch Campaign
          </Button>
        ) : null}
        {campaign.status === "running" ? (
          <Button
            type="button"
            variant="outline"
            disabled={acting}
            onClick={() => runAction(() => setCampaignPaused(campaign.id, true))}
          >
            <PauseIcon className="size-4" />
            Pause
          </Button>
        ) : null}
        {campaign.status === "paused" ? (
          <Button
            type="button"
            disabled={acting}
            onClick={() => runAction(() => setCampaignPaused(campaign.id, false))}
          >
            <PlayIcon className="size-4" />
            Resume
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      {campaign.status === "running" ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Dialing — keep this page open while the campaign runs.
        </div>
      ) : null}

      {/* Setup facts */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {campaign.agent_name ? (
          <Badge variant="outline">Agent: {campaign.agent_name}</Badge>
        ) : null}
        {campaign.list_name ? (
          <Badge variant="outline">List: {campaign.list_name}</Badge>
        ) : null}
        {campaign.phone_number ? (
          <Badge variant="outline">From: {campaign.phone_number}</Badge>
        ) : null}
      </div>

      {/* Stat tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Pending" value={campaign.stats.pending} />
        <StatTile label="Calling" value={campaign.stats.calling} highlight />
        <StatTile label="Completed" value={campaign.stats.completed} />
        <StatTile label="Failed" value={campaign.stats.failed} />
        <StatTile label="Skipped" value={campaign.stats.skipped} />
      </div>

      {/* Recipients */}
      <TableSurface>
        <div className="flex items-center gap-2 p-4">
          <span className="text-sm font-medium sm:text-base">Recipients</span>
          <Badge variant="secondary">{campaign.stats.total}</Badge>
        </div>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="main">Contact</TableHead>
                <TableHead column="meta">Phone</TableHead>
                <TableHead column="meta">Status</TableHead>
                <TableHead column="main">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    Recipients appear when the campaign launches.
                  </TableCell>
                </TableRow>
              ) : (
                recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell column="main">
                      <span className="font-medium">{recipient.contact_name}</span>
                    </TableCell>
                    <TableCell column="meta">{recipient.phone}</TableCell>
                    <TableCell column="meta">
                      <Badge variant={recipientBadgeVariant(recipient.status)}>
                        {RECIPIENT_STATUS_LABELS[recipient.status] ?? recipient.status}
                      </Badge>
                    </TableCell>
                    <TableCell column="main">
                      {recipient.call_id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => setDetailCallId(recipient.call_id)}
                        >
                          <PhoneIcon className="size-3.5" />
                          View call
                        </Button>
                      ) : recipient.error ? (
                        <span className="text-xs text-muted-foreground">
                          {recipient.error}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TableSurface>

      <CallDetailModal
        callId={detailCallId}
        onOpenChange={(open) => !open && setDetailCallId(null)}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          highlight && value > 0
            ? "mt-1 text-2xl font-semibold text-primary"
            : "mt-1 text-2xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  )
}
