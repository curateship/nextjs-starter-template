'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/actions/auth/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { authUsers, media } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'

const AVATAR_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
const EMAIL_CHANGE_WINDOW_MS = 15 * 60 * 1000
const EMAIL_CHANGE_MAX_REQUESTS = 5

function isSafeAvatarUrl(imageUrl: string) {
  if (imageUrl.startsWith('/cdn/') && !imageUrl.includes('\\')) {
    return true
  }

  try {
    const parsedUrl = new URL(imageUrl)
    return ['http:', 'https:'].includes(parsedUrl.protocol)
  } catch {
    return false
  }
}

export async function getCurrentUser() {
  return await getAuthenticatedUser()
}

export interface ProfileSocialLink {
  platform: string
  url: string
}

// Strip HTML tags and angle-bracket/quote characters (same approach as display name)
function sanitizeProfileText(value: string, maxLength: number) {
  return value.replace(/<[^>]*>?/gm, '').replace(/[<>"']/g, '').trim().slice(0, maxLength)
}

// Validate and normalize user-submitted social links — http/https URLs only,
// capped count/lengths. Returns null when the payload is malformed.
function sanitizeSocialLinks(rawJson: string): ProfileSocialLink[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const links: ProfileSocialLink[] = []
  for (const entry of parsed.slice(0, 10)) {
    if (!entry || typeof entry !== 'object') continue
    const platform = sanitizeProfileText(String((entry as any).platform || ''), 30)
    const url = String((entry as any).url || '').trim()
    if (!url || url.length > 2048) continue
    try {
      const parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) continue
    } catch {
      continue
    }
    links.push({ platform, url })
  }
  return links
}

// Full profile row for the current user — the session object doesn't carry
// the bio/socialLinks columns, so the account Core block reads via this action.
export async function getMyProfile() {
  const authUser = await getAuthenticatedUser()
  if (!authUser) return null

  const [row] = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      displayName: authUsers.displayName,
      email: authUsers.email,
      image: authUsers.image,
      bio: authUsers.bio,
      socialLinks: authUsers.socialLinks,
    })
    .from(authUsers)
    .where(eq(authUsers.id, authUser.id))
    .limit(1)

  if (!row) return null

  return {
    ...row,
    socialLinks: Array.isArray(row.socialLinks) ? (row.socialLinks as ProfileSocialLink[]) : [],
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
      return { error: 'Use the verified email change flow to update your email address' }
    }

    if (hasImageUpdate) {
      if (!imageUrl) {
        updates.image = null
      } else {
        if (imageUrl.length > 2048) {
          return { error: 'Avatar URL is too long' }
        }

        if (!isSafeAvatarUrl(imageUrl)) {
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

    // Bio + social links are custom columns better-auth's updateUser won't
    // persist — write them directly to the users table instead.
    const profileUpdates: Record<string, any> = {}

    if (formData.has('bio')) {
      // Bio renders as escaped plain text — only strip tags/angle brackets so
      // apostrophes and quotes survive in prose
      const bio = String(formData.get('bio') || '').replace(/<[^>]*>?/gm, '').replace(/[<>]/g, '').trim().slice(0, 500)
      profileUpdates.bio = bio || null
    }

    if (formData.has('social_links')) {
      const socialLinks = sanitizeSocialLinks(String(formData.get('social_links') || '[]'))
      if (!socialLinks) return { error: 'Invalid social links' }
      profileUpdates.socialLinks = socialLinks
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await auth.api.updateUser({
        body: updates,
        headers: await headers(),
      })
    }

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updatedAt = new Date()
      await db.update(authUsers).set(profileUpdates).where(eq(authUsers.id, authUser.id))
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

function getSafeAccountCallbackPath(value?: string | null) {
  const fallback = '/account'
  if (!value) return fallback

  const callbackPath = value.trim()
  if (!callbackPath.startsWith('/') || callbackPath.startsWith('//') || callbackPath.includes('\\')) {
    return fallback
  }

  try {
    const url = new URL(callbackPath, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid') {
      return fallback
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export async function requestEmailChange(formData: FormData) {
  const authUser = await getAuthenticatedUser()
  if (!authUser) return { error: 'Not authenticated' }

  const requestHeaders = await headers()
  const ip = getClientIp(requestHeaders)
  const newEmail = (formData.get('new_email') as string)?.trim()?.toLowerCase()
  const callbackURL = getSafeAccountCallbackPath(formData.get('callback_url') as string | null)

  if (!newEmail || !newEmail.includes('@')) {
    return { error: 'Enter a valid email address' }
  }

  if (newEmail === authUser.email.toLowerCase()) {
    return { error: 'Enter a different email address' }
  }

  if (
    isRateLimited(`email-change:user:${authUser.id}`, EMAIL_CHANGE_MAX_REQUESTS, EMAIL_CHANGE_WINDOW_MS) ||
    (ip && isRateLimited(`email-change:ip:${ip}`, EMAIL_CHANGE_MAX_REQUESTS, EMAIL_CHANGE_WINDOW_MS))
  ) {
    return { error: 'Too many email change requests. Try again later.' }
  }

  try {
    await auth.api.changeEmail({
      body: {
        newEmail,
        callbackURL,
      },
      headers: requestHeaders,
    })

    return {
      success: true,
      message: 'Check your current email address to confirm this change.',
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to request email change' }
  }
}
