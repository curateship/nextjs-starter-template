"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { getDeliverabilityReport } from "@/lib/actions/newsletters/deliverability-actions"
import type { DeliverabilityReport } from "@/lib/actions/newsletters/deliverability-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import Shield from "lucide-react/dist/esm/icons/shield.js"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js"

export default function EmailHealthPage() {
  const { currentSite } = useSiteSwitcher()
  const searchParams = useSearchParams()
  const [report, setReport] = useState<DeliverabilityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const selectedSender = searchParams.get("sender")

  const loadReport = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(true)
      return
    }

    setLoading(true)
    setError(null)
    const { data, error } = await getDeliverabilityReport({ data: { siteId: currentSite.id } })
    if (error) setError(error)
    if (data) setReport(data)
    setLoading(false)
  }, [currentSite?.id])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const dnsStatusIcon = (status: string) => {
    if (status === "pass") return <CheckCircle className="h-4 w-4 text-green-600" />
    if (status === "fail") return <XCircle className="h-4 w-4 text-red-600" />
    return <AlertTriangle className="h-4 w-4 text-yellow-600" />
  }

  const dnsStatusBadge = (status: string) => {
    if (status === "pass") return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Pass</Badge>
    if (status === "fail") return <Badge variant="destructive">Fail</Badge>
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">Missing</Badge>
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              {
                label: "Email Accounts",
                href: "/admin/platforms/emails/senders"
              },
              { label: selectedSender || "Email Health" }
            ]}
            actions={
              <Button variant="outline" onClick={loadReport} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          />

          {loading ? (
            <div>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <div className="h-6 bg-muted rounded animate-pulse w-40 mb-4" />
                  <div className="h-20 bg-muted/60 rounded animate-pulse" />
                </Card>
              ))}
            </div>
          ) : error ? (
            <ErrorBanner message={error} onRetry={loadReport} />
          ) : report ? (
            <div className="pb-8">
              {selectedSender && (
                <Card>
                  <h3 className="font-semibold mb-2">Sender</h3>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium">{selectedSender}</p>
                    <Badge variant="secondary">Resend</Badge>
                  </div>
                </Card>
              )}

              {/* Domain Health */}
              <Card>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Domain Health
                </h3>
                {report.domain ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-3">
                      Sending domain: <span className="font-medium text-foreground">{report.domain.domain}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      {(["spf", "dkim", "dmarc"] as const).map((record) => (
                        <div key={record} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-2">
                            {dnsStatusIcon(report.domain![record])}
                            <span className="font-medium text-sm uppercase">{record}</span>
                          </div>
                          {dnsStatusBadge(report.domain![record])}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Configure a from email in Resend settings to check domain health.
                  </p>
                )}
              </Card>

              {/* Key Metrics (30-day) */}
              <Card>
                <h3 className="font-semibold mb-4">Email Metrics (30 days)</h3>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold">{report.emailMetrics.totalSent.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold">{report.emailMetrics.openRate}%</p>
                    <p className="text-xs text-muted-foreground">Open Rate</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold">{report.emailMetrics.clickRate}%</p>
                    <p className="text-xs text-muted-foreground">Click Rate</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className={`text-2xl font-bold ${report.emailMetrics.bounceRate > 2 ? "text-red-600" : ""}`}>
                      {report.emailMetrics.bounceRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Bounce Rate</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p
                      className={`text-2xl font-bold ${report.emailMetrics.complaintRate > 0.1 ? "text-red-600" : ""}`}
                    >
                      {report.emailMetrics.complaintRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Complaint Rate</p>
                  </div>
                </div>

                {/* Alerts */}
                {(report.emailMetrics.bounceRate > 2 || report.emailMetrics.complaintRate > 0.1) && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                    <div className="text-sm text-red-800">
                      {report.emailMetrics.bounceRate > 2 && (
                        <p>Bounce rate exceeds 2% — clean your list to protect deliverability.</p>
                      )}
                      {report.emailMetrics.complaintRate > 0.1 && (
                        <p>Complaint rate exceeds 0.1% — review your sending practices.</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* Contact Health */}
              <Card>
                <h3 className="font-semibold mb-4">Contact Health</h3>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{report.contactHealth.active.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{report.contactHealth.cold.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Cold (90d inactive)</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-gray-500">
                      {report.contactHealth.unsubscribed.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Unsubscribed</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-red-600">{report.contactHealth.bounced.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Bounced</p>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-red-600">
                      {report.contactHealth.complained.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Complained</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </AdminLayout>
    </>
  )
}
