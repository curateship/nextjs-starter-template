'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Admin client for user management (requires service role key)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// Create authenticated Supabase client for server actions
async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export interface UserListItem {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  role: string
  display_name: string | null
  email_confirmed_at: string | null
}

/**
 * List all users with pagination
 * REQUIRES: super_admin role
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of users per page
 * @returns List of users and total count
 */
export async function listUsers(page: number = 1, pageSize: number = 50) {
  try {
    // Verify user is authenticated and has super_admin role
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Unauthorized - not authenticated', users: [], total: 0 }
    }

    const role = user.app_metadata?.role
    if (role !== 'super_admin') {
      return { error: 'Unauthorized - super_admin role required', users: [], total: 0 }
    }

    // Fetch all users (Supabase admin API doesn't support pagination directly)
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: pageSize
    })

    if (error) {
      console.error('Error listing users:', error)
      return { error: error.message, users: [], total: 0 }
    }

    // Transform users to simpler format
    const users: UserListItem[] = data.users.map((user) => ({
      id: user.id,
      email: user.email || '',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      role: user.app_metadata?.role || 'end_user',
      display_name: user.user_metadata?.display_name || null,
      email_confirmed_at: user.email_confirmed_at || null,
    }))

    return {
      success: true,
      users,
      total: data.total || users.length,
      page,
      pageSize
    }
  } catch (error: any) {
    console.error('Exception listing users:', error)
    return { error: 'Failed to list users', users: [], total: 0 }
  }
}

/**
 * Get a single user by ID
 * REQUIRES: super_admin role
 * @param userId - User ID
 * @returns User details
 */
export async function getUserById(userId: string) {
  try {
    // Verify user is authenticated and has super_admin role
    const supabase = await createSupabaseServerClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (!currentUser) {
      return { error: 'Unauthorized - not authenticated' }
    }

    const role = currentUser.app_metadata?.role
    if (role !== 'super_admin') {
      return { error: 'Unauthorized - super_admin role required' }
    }

    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (error) {
      console.error('Error getting user:', error)
      return { error: error.message }
    }

    return {
      success: true,
      user: {
        id: user.user.id,
        email: user.user.email || '',
        created_at: user.user.created_at,
        last_sign_in_at: user.user.last_sign_in_at || null,
        role: user.user.app_metadata?.role || 'end_user',
        display_name: user.user.user_metadata?.display_name || null,
        email_confirmed_at: user.user.email_confirmed_at || null,
        user_metadata: user.user.user_metadata,
        app_metadata: user.user.app_metadata,
      }
    }
  } catch (error: any) {
    console.error('Exception getting user:', error)
    return { error: 'Failed to get user' }
  }
}
