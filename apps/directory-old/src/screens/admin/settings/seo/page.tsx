"use client"

import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { useSiteSwitcher } from '@/components/admin/layout/providers/site-switcher-provider'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SeoSettingsPage } from '@/components/admin/seo-settings/SeoSettingsPage'

export default function SiteSeoSettingsRoute() {
  const { currentSite, loading, sites } = useSiteSwitcher()

  if (!currentSite) {
    return (
      <>
        <StickyHeader />
        <AdminLayout>
          {!loading && sites.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              Choose a site to manage SEO settings.
            </div>
          ) : null}
        </AdminLayout>
      </>
    )
  }

  return <SeoSettingsPage siteId={currentSite.id} />
}
