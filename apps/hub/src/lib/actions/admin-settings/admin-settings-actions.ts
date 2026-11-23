'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { adminSettings } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import type { ShellStyling } from '@/lib/admin-styling'

export interface AdminSettings {
  id: string
  settings: {
    font_family?: string
    secondary_font_family?: string
    font_weights?: string[]
    secondary_font_weights?: string[]
    default_theme?: 'system' | 'light' | 'dark'
    dashboard_page_size?: number
    /** Runtime admin appearance styling (Settings → Appearance). */
    styling?: ShellStyling
  }
  created_at: string
  updated_at: string
}

export interface UpdateAdminSettingsData {
  font_family?: string
  secondary_font_family?: string
  font_weights?: string[]
  secondary_font_weights?: string[]
  default_theme?: 'system' | 'light' | 'dark'
  dashboard_page_size?: number
  styling?: ShellStyling
}

export const getCachedAdminSettings = unstable_cache(
  async () => {
    const result = await db.query.adminSettings.findFirst()
    if (!result) {
      console.error('Error fetching cached admin settings: no row found')
      return null
    }
    return result as unknown as AdminSettings
  },
  ['admin-settings'],
  { revalidate: false, tags: ['admin-settings'] }
)

export async function getAdminSettingsAction(): Promise<{
  success: boolean
  data?: AdminSettings
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }
    if (user.role !== 'super_admin') return { success: false, error: 'Forbidden: super_admin role required' }

    const result = await db.query.adminSettings.findFirst()
    if (!result) return { success: false, error: 'Admin settings not found' }

    return { success: true, data: result as unknown as AdminSettings }
  } catch (error) {
    console.error('Error in getAdminSettingsAction:', error)
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}

export async function updateAdminSettingsAction(
  settingsData: UpdateAdminSettingsData
): Promise<{
  success: boolean
  data?: AdminSettings
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }
    if (user.role !== 'super_admin') return { success: false, error: 'Forbidden: super_admin role required' }

    const currentSettings = await db.query.adminSettings.findFirst()
    if (!currentSettings) return { success: false, error: 'Admin settings not found' }

    if (settingsData.dashboard_page_size !== undefined) {
      const validSizes = [25, 50, 100]
      if (!validSizes.includes(settingsData.dashboard_page_size)) {
        return { success: false, error: 'Invalid page size. Must be 25, 50, or 100.' }
      }
    }

    const updatedSettings = {
      ...(currentSettings.settings as Record<string, any>),
      ...settingsData
    }

    const { eq } = await import('drizzle-orm')
    const [updated] = await db
      .update(adminSettings)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(eq(adminSettings.id, currentSettings.id))
      .returning()

    revalidateTag('admin-settings')
    revalidatePath('/admin', 'layout')

    return { success: true, data: updated as unknown as AdminSettings }
  } catch (error) {
    console.error('Error in updateAdminSettingsAction:', error)
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}
