"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getPlatformEmailAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getSiteIntegration, type SiteIntegration } from "@/lib/actions/integrations/integration-actions"

interface SenderRow {
  name: string
  email: string
  provider: string
  status: "Connected" | "Disabled"
  updatedAt: string | null
}

function buildSenderRows(integration: SiteIntegration | null): SenderRow[] {
  const fromEmail = integration?.config?.from_email?.trim()
  if (!fromEmail) {
    return []
  }

  return [{
    name: integration?.config?.from_name?.trim() || "Unnamed Sender",
    email: fromEmail,
    provider: "Resend",
    status: integration?.isEnabled ? "Connected" : "Disabled",
    updatedAt: integration?.updatedAt?.toISOString?.() ?? null,
  }]
}

export default function PlatformSenderEmailsPage() {
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [senders, setSenders] = useState<SenderRow[]>([])

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage(null)

    const resendIntegration = await getSiteIntegration(currentSite.id, "resend")
    const rows = buildSenderRows(resendIntegration)

    setSenders(rows)
    if (rows.length === 0) {
      setMessage("No sender email is configured for this site.")
    }

    setLoading(false)
  }, [currentSite?.id])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">Choose a site to manage emails.</div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader navLinks={getPlatformEmailAdminTopNavLinks("emails", currentSite?.id ? `/admin/sites/${currentSite.id}/settings?tab=email` : undefined)} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[{ label: "Email Accounts" }]}
          />

          {message && (
            <div className="mb-6 rounded-md border px-4 py-3 text-sm">
              {message}
            </div>
          )}

          <Card className="shadow-sm">
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-6">Sender</div>
                <div className="col-span-2">Provider</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2" />
              </div>
            </div>

            <div className="divide-y">
              {loading && (
                <div className="px-6 py-4">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-6 h-4 w-56 animate-pulse rounded bg-muted" />
                    <div className="col-span-2 h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="col-span-2 h-4 w-20 animate-pulse rounded bg-muted" />
                    <div className="col-span-2 justify-self-end h-9 w-24 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              )}

              {!loading && senders.map((sender) => (
                <div key={sender.email} className="px-6 py-4">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-6 min-w-0">
                      <Link
                        href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}
                        className="block hover:underline"
                      >
                        <p className="font-medium">{sender.name}</p>
                        <p className="text-sm text-muted-foreground">{sender.email}</p>
                      </Link>
                    </div>
                    <div className="col-span-2 text-sm">{sender.provider}</div>
                    <div className="col-span-2">
                      <Badge variant={sender.status === "Connected" ? "default" : "secondary"}>
                        {sender.status}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}>
                          View Health
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  )
}
