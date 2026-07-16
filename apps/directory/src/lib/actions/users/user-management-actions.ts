'use server'

import { db } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { lastSignInAtSql } from '@/lib/actions/users/last-sign-in-sql'
import { eq, sql, desc, inArray } from 'drizzle-orm'

export interface UserListItem {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  role: string
  display_name: string | null
  image: string | null
  status: 'active' | 'unverified' | 'banned'
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
      return { error: 'Unauthorized - not authenticated', users: [], total: 0, currentUserId: null }
    }

    if (currentUser.role !== 'super_admin') {
      return { error: 'Unauthorized - super_admin role required', users: [], total: 0, currentUserId: null }
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
          image: authUsers.image,
          banned: authUsers.banned,
          banExpires: authUsers.banExpires,
          emailVerified: authUsers.emailVerified,
          lastSignInAt: lastSignInAtSql(),
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
      image: row.image,
      status: row.banned && (!row.banExpires || row.banExpires > new Date()) ? 'banned' : row.emailVerified ? 'active' : 'unverified',
      email_confirmed_at: row.emailVerified ? row.updatedAt.toISOString() : null,
    }))

    return {
      success: true,
      users: mappedUsers,
      total,
      page,
      pageSize,
      currentUserId: currentUser.id,
    }
  } catch (error: any) {
    console.error('Exception listing users:', error)
    return { error: 'Failed to list users', users: [], total: 0, currentUserId: null }
  }
}

/**
 * Delete a single user
 * REQUIRES: super_admin role
 * Also removes auth accounts, sessions, and user-linked verification rows.
 */
export async function deleteUser(userId: string) {
  try {
    const currentUser = await getAuthenticatedUser()

    if (!currentUser) {
      return { success: false, error: 'Unauthorized - not authenticated' }
    }

    if (currentUser.role !== 'super_admin') {
      return { success: false, error: 'Unauthorized - super_admin role required' }
    }

    const normalizedUserId = userId.trim()

    if (!normalizedUserId) {
      return { success: false, error: 'User ID is required' }
    }

    if (normalizedUserId === currentUser.id) {
      return { success: false, error: 'You cannot delete your own account' }
    }

    const targetUser = await db
      .select({
        id: authUsers.id,
        role: authUsers.role,
      })
      .from(authUsers)
      .where(eq(authUsers.id, normalizedUserId))
      .then((rows) => rows[0])

    if (!targetUser) {
      return { success: false, error: 'User not found' }
    }

    if (targetUser.role === 'super_admin') {
      const adminCountResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(authUsers)
        .where(eq(authUsers.role, 'super_admin'))

      const adminCount = Number(adminCountResult[0]?.count ?? 0)

      if (adminCount <= 1) {
        return { success: false, error: 'Cannot delete the last super admin' }
      }
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from user_sessions where "userId" = ${normalizedUserId}`)
      await tx.execute(sql`delete from user_auth_paths where "userId" = ${normalizedUserId}`)
      await tx.execute(sql`delete from user_verifications where value = ${normalizedUserId}`)
      await tx.delete(authUsers).where(eq(authUsers.id, normalizedUserId))
    })

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Exception deleting user:', error)
    return { success: false, error: error.message || 'Failed to delete user' }
  }
}

export async function deleteUsers(userIds: string[]) {
  try {
    const currentUser = await getAuthenticatedUser()

    if (!currentUser) {
      return { success: false, error: 'Unauthorized - not authenticated', deletedCount: 0 }
    }

    if (currentUser.role !== 'super_admin') {
      return { success: false, error: 'Unauthorized - super_admin role required', deletedCount: 0 }
    }

    const normalizedUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)))

    if (!normalizedUserIds.length) {
      return { success: false, error: 'No users selected', deletedCount: 0 }
    }

    if (normalizedUserIds.includes(currentUser.id)) {
      return { success: false, error: 'You cannot delete your own account', deletedCount: 0 }
    }

    const targetUsers = await db
      .select({
        id: authUsers.id,
        role: authUsers.role,
      })
      .from(authUsers)
      .where(inArray(authUsers.id, normalizedUserIds))

    if (targetUsers.length !== normalizedUserIds.length) {
      return { success: false, error: 'Some selected users were not found', deletedCount: 0 }
    }

    const selectedSuperAdmins = targetUsers.filter((user) => user.role === 'super_admin').length

    if (selectedSuperAdmins > 0) {
      const adminCountResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(authUsers)
        .where(eq(authUsers.role, 'super_admin'))

      const adminCount = Number(adminCountResult[0]?.count ?? 0)

      if (adminCount - selectedSuperAdmins < 1) {
        return { success: false, error: 'Cannot delete the last super admin', deletedCount: 0 }
      }
    }

    await db.transaction(async (tx) => {
      for (const userId of normalizedUserIds) {
        await tx.execute(sql`delete from user_sessions where "userId" = ${userId}`)
        await tx.execute(sql`delete from user_auth_paths where "userId" = ${userId}`)
        await tx.execute(sql`delete from user_verifications where value = ${userId}`)
        await tx.delete(authUsers).where(eq(authUsers.id, userId))
      }
    })

    return { success: true, error: null, deletedCount: normalizedUserIds.length }
  } catch (error: any) {
    console.error('Exception deleting users:', error)
    return { success: false, error: error.message || 'Failed to delete users', deletedCount: 0 }
  }
}
