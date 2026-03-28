import { auth } from '@/lib/auth/server'
import { headers } from 'next/headers'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'

interface AuthUser {
  id: string
  email: string
  name?: string | null
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
    role: (session.user as any).role || 'end_user',
  }
}

export async function requireAuth(): Promise<AuthUser> {
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
