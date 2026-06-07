"use client"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { MailAccountsDashboard } from "@/components/admin/mail/MailAccountsDashboard"

export default function AdminMailPage() {
  const { currentSite, loading, sites } = useSiteSwitcher()
  const message = loading || sites.length > 0 ? "Loading mail..." : "Choose a site to manage mail."

  return (
    <>
      <StickyHeader />
      <AdminLayout noPadding>
        {currentSite ? (
          <MailAccountsDashboard siteId={currentSite.id} />
        ) : (
          <div className="p-8 text-sm text-muted-foreground">
            {message}
          </div>
        )}
      </AdminLayout>
    </>
  )
}
