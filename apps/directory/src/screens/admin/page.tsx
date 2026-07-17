import { getCachedAdminSettings } from "@/lib/actions/admin-settings/admin-settings-actions"
import { configuredRouteTarget } from "@/lib/home-route"
import { redirect } from "@/lib/navigation-server"

export default async function AdminHome() {
  const adminSettings = await getCachedAdminSettings()
  redirect(configuredRouteTarget(adminSettings?.settings?.home_route) ?? "/admin/dashboard")
}
