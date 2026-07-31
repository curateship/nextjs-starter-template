"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  createSponsorReportLinkAction,
  revokeSponsorReportLinkAction,
  type SponsorReportLinkStatus
} from "@/lib/actions/sponsors/sponsor-portal-actions"
import { cn } from "@/lib/utils/tailwind"
import Check from "lucide-react/dist/esm/icons/check.js"
import Copy from "lucide-react/dist/esm/icons/copy.js"
import Link2 from "lucide-react/dist/esm/icons/link-2.js"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js"
import ShieldOff from "lucide-react/dist/esm/icons/shield-off.js"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

interface SponsorReportLinkCellProps {
  sponsorId: string
  link: SponsorReportLinkStatus | null
  onLinkChange: (sponsorId: string, link: SponsorReportLinkStatus | null) => void
}

const LINK_BADGES: Record<"none" | SponsorReportLinkStatus["status"], { className: string; label: string }> = {
  none: { className: "bg-muted text-muted-foreground", label: "None" },
  active: { className: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300", label: "Active" },
  expired: { className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", label: "Expired" },
  revoked: { className: "bg-muted text-muted-foreground", label: "Revoked" },
}

export function SponsorReportLinkCell({ sponsorId, link, onLinkChange }: SponsorReportLinkCellProps) {
  const [pending, setPending] = useState(false)
  // The full URL exists only right after create/regenerate — tokens are stored hashed
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showActionError("Could not copy the link. Copy it manually: " + url)
    }
  }

  const handleCreate = async () => {
    setPending(true)
    const result = await createSponsorReportLinkAction({ data: { sponsorId: sponsorId } })
    setPending(false)

    if (result.error || !result.data) {
      showActionError(result.error || "Failed to create report link")
      return
    }

    setFreshUrl(result.data.url)
    onLinkChange(sponsorId, result.data.link)
    await copyToClipboard(result.data.url)
    showActionSuccess("Report link created and copied.")
  }

  const handleRevoke = async () => {
    setPending(true)
    const result = await revokeSponsorReportLinkAction({ data: { sponsorId: sponsorId } })
    setPending(false)

    if (result.error || !result.data) {
      showActionError(result.error || "Failed to revoke report link")
      return
    }

    setFreshUrl(null)
    onLinkChange(sponsorId, result.data)
    showActionSuccess("Report link revoked.")
  }

  const status = link?.status
  const badge = LINK_BADGES[status ?? "none"]

  return (
    <div className="flex items-center gap-1.5">
      <Badge className={badge.className}>{badge.label}</Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", pending && "opacity-50")}
            disabled={pending}
            title="Report link actions"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
            <span className="sr-only">Report link actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCreate} disabled={pending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {status === "active" ? "Regenerate link" : "Create link"}
          </DropdownMenuItem>
          {freshUrl && (
            <DropdownMenuItem onClick={() => copyToClipboard(freshUrl)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </DropdownMenuItem>
          )}
          {status === "active" && (
            <DropdownMenuItem onClick={handleRevoke} disabled={pending}>
              <ShieldOff className="mr-2 h-4 w-4" />
              Revoke link
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
