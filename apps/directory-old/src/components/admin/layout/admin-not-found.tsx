"use client"

import Link from "@/components/app-link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePathname } from "@/lib/navigation-client"
import {
  ADMIN_DASHBOARD_HREF,
  getAdminSidebarSiteIdFromPathname,
  getClosestAdminSidebarLink,
} from "@/lib/utils/admin-sidebar"

// A missing /admin address keeps the dashboard around it — sidebar, header and
// site switcher all still mounted — so a stale bookmark reads as "that page
// moved", not "the admin is gone". Rendered by the /admin/$ route's
// notFoundComponent, which puts it in the shell's outlet; a thrown error is a
// different thing and still surfaces as an error.
export function AdminNotFound() {
  const { currentSite } = useSiteSwitcher()
  const pathname = usePathname()
  const siteId = getAdminSidebarSiteIdFromPathname(pathname) ?? currentSite?.id ?? null
  const closestLink = getClosestAdminSidebarLink(currentSite?.settings?.admin_sidebar, {
    siteId,
    pathname,
  })
  const showClosestLink = closestLink && closestLink.href !== ADMIN_DASHBOARD_HREF

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <Card>
          <CardHeader>
            <CardTitle>Page not found</CardTitle>
            <CardDescription>
              There is no admin page at this address. It may have been renamed or removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="break-all font-mono text-sm text-muted-foreground">{pathname}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild>
                <Link href={ADMIN_DASHBOARD_HREF}>Go to dashboard</Link>
              </Button>
              {showClosestLink ? (
                <Button asChild variant="outline">
                  <Link href={closestLink.href}>Go to {closestLink.label}</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
    </>
  )
}
