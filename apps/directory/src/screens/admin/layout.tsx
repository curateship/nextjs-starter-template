import { AdminClientShell } from "./admin-client-shell"
import { requireAdminAccess } from "./require-admin"
import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions.server"
import { getAllSitesActionImpl } from "@/lib/actions/sites/site-actions.server"
import { DEFAULT_ADMIN_SIDEBAR_WIDTH } from "@/lib/utils/admin-sidebar-width"
import { normalizeStyling } from "@/lib/utils/admin-styling"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAdminAccess()

  // Parallel fetch: admin settings + sites
  const [adminSettings, sitesResult] = await Promise.all([
    getCachedAdminSettings(),
    getAllSitesActionImpl(),
  ])

  const settings = adminSettings?.settings ?? {}
  const pageSize = settings.dashboard_page_size || 50
  const sidebarWidth = settings.sidebar_width || DEFAULT_ADMIN_SIDEBAR_WIDTH
  const styling = normalizeStyling(settings.styling)
  const sites = sitesResult.data ?? []

  const userName = (session.user as any).displayName || session.user.name || session.user.email?.split('@')[0] || 'User'
  const userEmail = session.user.email || ''
  const userAvatar = session.user.image || ''

  return (
    <AdminClientShell
      initialSites={sites}
      pageSize={pageSize}
      initialSidebarWidth={sidebarWidth}
      initialStyling={styling}
      user={{ name: userName, email: userEmail, avatar: userAvatar }}
    >
      {children}
    </AdminClientShell>
  )
}
