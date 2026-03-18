import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { AdminClientShell } from "./admin-client-shell"
import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions"
import { getAllSitesAction } from "@/lib/actions/sites/site-actions"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login?redirect=/admin')
  }

  if (user.app_metadata?.role !== 'super_admin') {
    redirect('/user-pages')
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

  const userName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'
  const userEmail = user.email || ''

  return (
    <AdminClientShell
      fontFamily={fontFamily}
      secondaryFontFamily={secondaryFontFamily}
      initialSites={sites}
      pageSize={pageSize}
      user={{ name: userName, email: userEmail }}
    >
      {children}
    </AdminClientShell>
  )
}
