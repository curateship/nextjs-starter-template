import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Auth shim — returns the same interface as the old Supabase server client.
 * Files importing this continue working without changes.
 */
export async function createServerSupabaseClient() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return {
    auth: {
      async getUser() {
        if (!session?.user) {
          return {
            data: { user: null },
            error: { message: 'Not authenticated' },
          }
        }
        const role = (session.user as any).role || 'end_user'
        return {
          data: {
            user: {
              id: session.user.id,
              email: session.user.email,
              app_metadata: { role },
              user_metadata: {
                display_name: session.user.name,
              },
              created_at: null,
              email_confirmed_at: null,
            },
          },
          error: null,
        }
      },
    },
  }
}
