import { redirect } from "@/lib/navigation-server"
import { auth } from "@/lib/actions/auth/server"
import { headers } from "@/lib/request-headers"
import { AdminClientShell } from "./admin-client-shell"
import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions"
import { getAllSitesAction } from "@/lib/actions/sites/site-actions"
import { getCurrentUserSiteId, getDefaultAccountPagePath } from "@/lib/actions/account-pages/account-pages-frontend-actions"

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
  const fontFamily = settings.font_family || "urbanist"
  const secondaryFontFamily = settings.secondary_font_family || "urbanist"
  const pageSize = settings.dashboard_page_size || 50
  const sites = sitesResult.data ?? []

  const userName = (session.user as any).displayName || session.user.name || session.user.email?.split('@')[0] || 'User'
  const userEmail = session.user.email || ''
  const userAvatar = session.user.image || ''

  return (
    <AdminClientShell
      fontFamily={fontFamily}
      secondaryFontFamily={secondaryFontFamily}
      initialSites={sites}
      pageSize={pageSize}
      user={{ name: userName, email: userEmail, avatar: userAvatar }}
    >
      {children}
    </AdminClientShell>
  )
}
