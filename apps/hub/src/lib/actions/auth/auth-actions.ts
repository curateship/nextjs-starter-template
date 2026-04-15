'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { authUsers } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export async function getCurrentUser() {
  return await getAuthenticatedUser()
}

export async function registerUser({
  email,
  password,
  displayName,
}: {
  email: string
  password: string
  displayName?: string
}) {
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: email.toLowerCase(),
        password,
        name: displayName || email.split('@')[0],
        displayName: displayName || email.split('@')[0],
      },
    })

    if (!result?.user) {
      return { error: 'Failed to create account' }
    }

    return { data: { id: result.user.id }, error: null }
  } catch (error: any) {
    return { error: error.message || 'Failed to create account' }
  }
}

export async function updateProfile(formData: FormData) {
  const authUser = await getAuthenticatedUser()
  if (!authUser) return { error: 'Not authenticated' }

  const displayName = (formData.get('display_name') as string)?.trim()?.slice(0, 100)
  const email = (formData.get('email') as string)?.trim()?.toLowerCase()

  try {
    const updates: Record<string, any> = {}

    if (displayName) {
      if (displayName.length < 1 || displayName.length > 100) {
        return { error: 'Display name must be between 1-100 characters' }
      }
      const sanitizedDisplayName = displayName.replace(/<[^>]*>?/gm, '').replace(/[<>\"']/g, '')
      updates.name = sanitizedDisplayName
      updates.displayName = sanitizedDisplayName
    }

    if (email && email !== authUser.email) {
      const existing = await db.query.authUsers.findFirst({
        where: eq(authUsers.email, email),
      })
      if (existing) return { error: 'Email already in use' }
      updates.email = email
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await auth.api.updateUser({
        body: updates,
        headers: await headers(),
      })
    }

    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updatePassword(formData: FormData) {
  const authUser = await getAuthenticatedUser()
  if (!authUser) return { error: 'Not authenticated' }

  const currentPassword = formData.get('current_password') as string
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  if (newPassword.length < 12) {
    return { error: 'Password must be at least 12 characters' }
  }

  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasNumbers = /\d/.test(newPassword)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    return { error: 'Password must contain uppercase, lowercase, numbers, and special characters' }
  }

  try {
    await auth.api.changePassword({
      body: {
        newPassword,
        currentPassword,
      },
      headers: await headers(),
    })

    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}
