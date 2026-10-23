import { redirect } from "@/lib/navigation-server"
import { auth } from "@/lib/actions/auth/server"
import { headers } from "@/lib/request-headers"
import { getCurrentUserSiteId, getDefaultAccountPagePath } from "@/lib/actions/account-pages/account-pages-frontend-actions"

// The admin shell and the admin pages render through two separate server
// functions, and a server function is reachable by anyone who knows its URL.
// Both entry points must run this: guarding only the shell leaves every page
// renderable without a session.
export async function requireAdminAccess() {
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

  return session
}
