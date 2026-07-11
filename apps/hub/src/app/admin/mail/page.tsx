"use client"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { MailAccountsDashboard, MailAccountsSkeleton } from "@/components/admin/mail/MailAccountsDashboard"

export default function AdminMailPage() {
  const { currentSite, loading, sites } = useSiteSwitcher()
  const isLoading = loading || sites.length > 0

  return (
    <>
      <StickyHeader />
      <AdminLayout noPadding>
        {currentSite ? (
          <MailAccountsDashboard siteId={currentSite.id} />
        ) : isLoading ? (
          <MailAccountsSkeleton />
        ) : (
          <div className="p-8 text-sm text-muted-foreground">
            Choose a site to manage mail.
          </div>
        )}
      </AdminLayout>
    </>
  )
}
