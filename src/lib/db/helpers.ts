import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

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
