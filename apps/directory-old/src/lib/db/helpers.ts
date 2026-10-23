import { auth } from '@/lib/actions/auth/server'
import { headers } from '@/lib/request-headers'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { UUID_REGEX } from '@/lib/utils/validation'

interface AuthUser {
  id: string
  email: string
  name?: string | null
  displayName?: string | null
  image?: string | null
  role: string
}

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    displayName: (session.user as any).displayName || null,
    image: session.user.image || null,
    role: (session.user as any).role || 'end_user',
  }
}

async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthenticatedUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth()
  if (user.role !== 'super_admin') throw new Error('Not authorized')
  return user
}

/**
 * Does this user own this site? Plain yes/no, no throwing.
 * Callers already hold the user id and shape their own error message.
 *
 * Note this deliberately has NO super_admin bypass. Campaigns and sponsors keep
 * their own local versions because they do let a super admin reach any site.
 */
export async function verifySiteOwnership(siteId: string, userId: string): Promise<boolean> {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return Boolean(site)
}

export type SiteAccess =
  | { user: AuthUser; error: null }
  | { user: null; error: string }

/**
 * The standard three-step check an action runs before touching a site's data:
 * the id looks like an id, somebody is signed in, and that somebody owns the
 * site. It fails closed and always runs the steps in that order — never skip
 * ahead to the ownership check, because it needs a user to compare against.
 *
 * The three messages are the exact strings the call sites already returned, so
 * nothing users read changes. Actions that word their refusals differently keep
 * doing their own check rather than passing overrides through here.
 */
export async function checkSiteAccess(siteId: string): Promise<SiteAccess> {
  if (!UUID_REGEX.test(siteId)) return { user: null, error: 'Invalid site ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { user: null, error: 'Not authenticated' }

  if (!await verifySiteOwnership(siteId, user.id)) {
    return { user: null, error: 'Access denied' }
  }

  return { user, error: null }
}

/**
 * Verify the authenticated user owns the given site.
 * Throws on failure — use in try/catch action functions.
 */
export async function requireSiteOwnership(siteId: string): Promise<{ user: AuthUser; siteId: string }> {
  const user = await requireAuth()
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
  if (!site) throw new Error('Site not found or unauthorized')
  return { user, siteId: site.id }
}

export { type AuthUser }
