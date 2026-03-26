'use server'

import { db } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { eq, sql, desc } from 'drizzle-orm'

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
    const currentUser = await getAuthenticatedUser()

    if (!currentUser) {
      return { error: 'Unauthorized - not authenticated', users: [], total: 0 }
    }

    if (currentUser.role !== 'super_admin') {
      return { error: 'Unauthorized - super_admin role required', users: [], total: 0 }
    }

    const offset = (page - 1) * pageSize

    const [userRows, countResult] = await Promise.all([
      db
        .select({
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          createdAt: authUsers.createdAt,
          updatedAt: authUsers.updatedAt,
          role: authUsers.role,
          displayName: authUsers.displayName,
          emailVerified: authUsers.emailVerified,
          lastSignInAt: sql<string | null>`(
            select max("updatedAt")::text
            from user_sessions
            where "userId" = ${authUsers.id}
          )`,
        })
        .from(authUsers)
        .orderBy(desc(authUsers.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(authUsers),
    ])

    const total = Number(countResult[0]?.count ?? 0)

    const mappedUsers: UserListItem[] = userRows.map((row) => ({
      id: row.id,
      email: row.email,
      created_at: row.createdAt.toISOString(),
      last_sign_in_at: row.lastSignInAt,
      role: row.role || 'end_user',
      display_name: row.displayName || row.name || null,
      email_confirmed_at: row.emailVerified ? row.updatedAt.toISOString() : null,
    }))

    return {
      success: true,
      users: mappedUsers,
      total,
      page,
      pageSize,
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
    const currentUser = await getAuthenticatedUser()

    if (!currentUser) {
      return { error: 'Unauthorized - not authenticated' }
    }

    if (currentUser.role !== 'super_admin') {
      return { error: 'Unauthorized - super_admin role required' }
    }

    const row = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
        role: authUsers.role,
        displayName: authUsers.displayName,
        emailVerified: authUsers.emailVerified,
        lastSignInAt: sql<string | null>`(
          select max("updatedAt")::text
          from user_sessions
          where "userId" = ${authUsers.id}
        )`,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0])

    if (!row) {
      return { error: 'User not found' }
    }

    return {
      success: true,
      user: {
        id: row.id,
        email: row.email,
        created_at: row.createdAt.toISOString(),
        last_sign_in_at: row.lastSignInAt,
        role: row.role || 'end_user',
        display_name: row.displayName || row.name || null,
        email_confirmed_at: row.emailVerified ? row.updatedAt.toISOString() : null,
        user_metadata: {
          display_name: row.displayName || row.name || null,
        },
        app_metadata: {
          role: row.role,
        },
      },
    }
  } catch (error: any) {
    console.error('Exception getting user:', error)
    return { error: 'Failed to get user' }
  }
}
