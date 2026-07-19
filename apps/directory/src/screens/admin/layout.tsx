import { redirect } from "@/lib/navigation-server"
import { auth } from "@/lib/actions/auth/server"
import { headers } from "@/lib/request-headers"
import { AdminClientShell } from "./admin-client-shell"
import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions"
import { getAllSitesAction } from "@/lib/actions/sites/site-actions"
import { getCurrentUserSiteId, getDefaultAccountPagePath } from "@/lib/actions/account-pages/account-pages-frontend-actions"
import { DEFAULT_ADMIN_SIDEBAR_WIDTH } from "@/lib/utils/admin-sidebar-width"
import { normalizeStyling } from "@/lib/utils/admin-styling"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect('/login?redirect=/admin')
  }

  const role = (session.user as any).role || 'end_user'
  if (role !== 'super_admin') {
    const { siteId } = await getCurrentUserSiteId()
    if (siteId) {
      const { path } = await getDefaultAccountPagePath(siteId)
      if (path) {
        redirect(path)
      }
    }
    redirect('/')
  }

  // Parallel fetch: admin settings + sites
  const [adminSettings, sitesResult] = await Promise.all([
    getCachedAdminSettings(),
    getAllSitesAction(),
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
