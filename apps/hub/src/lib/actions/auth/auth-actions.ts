'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { authUsers, media } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

const AVATAR_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

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
  const hasImageUpdate = formData.has('image')
  const imageUrl = hasImageUpdate ? String(formData.get('image') || '').trim() : undefined

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

    if (hasImageUpdate) {
      if (!imageUrl) {
        updates.image = null
      } else {
        if (imageUrl.length > 2048) {
          return { error: 'Avatar URL is too long' }
        }

        try {
          const parsedUrl = new URL(imageUrl)
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { error: 'Invalid avatar URL' }
          }
        } catch {
          return { error: 'Invalid avatar URL' }
        }

        const ownedMedia = await db.query.media.findFirst({
          where: and(
            eq(media.userId, authUser.id),
            eq(media.publicUrl, imageUrl),
            inArray(media.mimeType, AVATAR_IMAGE_MIME_TYPES)
          ),
        })
        if (!ownedMedia) return { error: 'Select an avatar image from your media library' }

        updates.image = imageUrl
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await auth.api.updateUser({
        body: updates,
        headers: await headers(),
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Profile update failed:', error)
    return { error: 'Failed to update profile' }
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
