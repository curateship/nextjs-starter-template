"use client"

import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { useSiteSwitcher } from '@/components/admin/layout/providers/site-switcher-provider'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SeoSettingsPage } from '@/components/admin/seo-settings/SeoSettingsPage'

export default function SiteSeoSettingsRoute() {
  const { currentSite, loading, sites } = useSiteSwitcher()
  const message = loading || sites.length > 0 ? "Loading SEO settings..." : "Choose a site to manage SEO settings."

  if (!currentSite) {
    return (
      <>
        <StickyHeader />
        <AdminLayout>
          <div className="p-8 text-sm text-muted-foreground">
            {message}
          </div>
        </AdminLayout>
      </>
    )
  }

  return <SeoSettingsPage siteId={currentSite.id} />
}
