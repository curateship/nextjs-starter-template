"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { getPlatformEmailAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getSystemEmailDashboardAction } from "@/lib/actions/email/system-email-actions"
import type { SystemEmailListItem } from "@/lib/email/system-email"

interface DashboardData {
  templates: SystemEmailListItem[]
}

export default function PlatformEmailsPage() {
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage(null)

    const dashboardResult = await getSystemEmailDashboardAction(currentSite.id)

    if (!dashboardResult.success || !dashboardResult.data) {
      setMessage({ type: 'error', text: dashboardResult.error || 'Failed to load system emails.' })
      setDashboard(null)
    } else {
      setDashboard(dashboardResult.data)
    }

    setLoading(false)
  }, [currentSite?.id])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">Choose a site to manage system emails.</div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader navLinks={getPlatformEmailAdminTopNavLinks("templates", currentSite?.id ? `/admin/sites/${currentSite.id}/settings?tab=email` : undefined)} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[{ label: "Email Templates" }]}
          />

          {message && (
            <div className={`mb-6 rounded-md border px-4 py-3 text-sm ${
              message.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-green-200 bg-green-50 text-green-800'
            }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-6">
            <Card className="shadow-sm">
              <div className="px-6 py-4 border-b bg-muted/30">
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                  <div className="col-span-6">Template</div>
                  <div className="col-span-2">Scope</div>
                  <div className="col-span-2">Updated</div>
                  <div className="col-span-2" />
                </div>
              </div>

              <div className="divide-y">
                {loading && (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="px-6 py-4">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-6 space-y-2">
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-72 animate-pulse rounded bg-muted/60" />
                        </div>
                        <div className="col-span-2 h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="col-span-2 h-4 w-24 animate-pulse rounded bg-muted" />
                        <div className="col-span-2 justify-self-end h-9 w-20 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))
                )}

                {!loading && dashboard?.templates.map((template) => (
                  <div key={template.template_key} className="px-6 py-4">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-6 min-w-0">
                        <div className="flex items-center gap-2">
                          {template.editable ? (
                            <Link
                              href={`/admin/platforms/emails/${template.template_key}`}
                              className="font-medium hover:underline"
                            >
                              {template.name}
                            </Link>
                          ) : (
                            <p className="font-medium">{template.name}</p>
                          )}
                          {!template.editable && <Badge variant="secondary">Super Admin</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      <div className="col-span-2 text-sm">{template.scope_label}</div>
                      <div className="col-span-2 text-sm text-muted-foreground">
                        {template.updated_at ? new Date(template.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }) : 'Default'}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        {template.editable ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/platforms/emails/${template.template_key}`}>Edit</Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
