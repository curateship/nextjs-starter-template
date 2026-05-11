"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { AdminListSkeleton, formatShortDate } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTableHeader } from "@/components/ui/card"
import { getSystemEmailDashboardAction } from "@/lib/actions/email/system-email-actions"
import type { SystemEmailListItem } from "@/lib/actions/email/system-email"

interface DashboardData {
  templates: SystemEmailListItem[]
}

export default function PlatformEmailsPage() {
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage(null)

    const dashboardResult = await getSystemEmailDashboardAction(currentSite.id)

    if (!dashboardResult.success || !dashboardResult.data) {
      setMessage({
        type: "error",
        text: dashboardResult.error || "Failed to load system emails."
      })
      setDashboard(null)
    } else {
      setDashboard(dashboardResult.data)
    }

    setLoading(false)
  }, [currentSite?.id])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const templates = dashboard?.templates ?? []
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => {
        const searchText = [template.name, template.description, template.scope_label, template.template_key]
          .join(" ")
          .toLowerCase()

        return searchText.includes(normalizedSearchQuery)
      })
    : templates

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">Choose a site to manage system emails.</div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[{ label: "Email Templates" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search email templates"
            }}
          />

          {message && (
            <div
              className={`mb-6 rounded-md border px-4 py-3 text-sm ${message.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-6">
            <Card>
              <CardTableHeader className="grid-cols-12">
                <div className="col-span-6">Template</div>
                <div className="col-span-2">Scope</div>
                <div className="col-span-2">Updated</div>
                <div className="col-span-2" />
              </CardTableHeader>

              <div className="divide-y">
                {loading && (
                  <AdminListSkeleton columns={12} firstColumnSpan={6} rowCount={3} showCheckbox={false} showThumbnail={false} />
                )}

                {!loading && filteredTemplates.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {normalizedSearchQuery ? "No email templates match your search." : "No email templates found."}
                  </div>
                )}

                {!loading &&
                  filteredTemplates.map((template) => (
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
                          {template.updated_at
                            ? formatShortDate(template.updated_at)
                            : "Default"}
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
