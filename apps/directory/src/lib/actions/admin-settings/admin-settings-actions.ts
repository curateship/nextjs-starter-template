'use server'

import { revalidatePath, revalidateTag } from '@/lib/cache'
import { unstable_cache } from '@/lib/cache'
import { db } from '@/lib/db'
import { adminSettings } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { MAX_ADMIN_SIDEBAR_WIDTH, MIN_ADMIN_SIDEBAR_WIDTH } from '@/lib/utils/admin-sidebar-width'

export interface AdminSettings {
  id: string
  settings: {
    default_theme?: 'system' | 'light' | 'dark'
    dashboard_page_size?: number
    sidebar_width?: number
    home_route?: string
  }
  created_at: string
  updated_at: string
}

export interface UpdateAdminSettingsData {
  default_theme?: 'system' | 'light' | 'dark'
  dashboard_page_size?: number
  sidebar_width?: number
  home_route?: string
}

const DEFAULT_ADMIN_SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

async function getOrCreateAdminSettings() {
  const existingSettings = await db.query.adminSettings.findFirst()
  if (existingSettings) return existingSettings

  const [createdSettings] = await db
    .insert(adminSettings)
    .values({ id: DEFAULT_ADMIN_SETTINGS_ID, settings: {} })
    .onConflictDoNothing()
    .returning()

  return createdSettings ?? await db.query.adminSettings.findFirst()
}

export const getCachedAdminSettings = unstable_cache(
  async () => {
    const result = await getOrCreateAdminSettings()
    if (!result) {
      console.error('Error initializing cached admin settings')
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

    const result = await getOrCreateAdminSettings()
    if (!result) return { success: false, error: 'Failed to initialize admin settings' }

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

    if (settingsData.dashboard_page_size !== undefined) {
      const validSizes = [25, 50, 100]
      if (!validSizes.includes(settingsData.dashboard_page_size)) {
        return { success: false, error: 'Invalid page size. Must be 25, 50, or 100.' }
      }
    }

    if (
      settingsData.sidebar_width !== undefined &&
      (!Number.isInteger(settingsData.sidebar_width) ||
        settingsData.sidebar_width < MIN_ADMIN_SIDEBAR_WIDTH ||
        settingsData.sidebar_width > MAX_ADMIN_SIDEBAR_WIDTH)
    ) {
      return {
        success: false,
        error: `Invalid sidebar width. Must be between ${MIN_ADMIN_SIDEBAR_WIDTH} and ${MAX_ADMIN_SIDEBAR_WIDTH} pixels.`
      }
    }

    if (settingsData.home_route !== undefined && typeof settingsData.home_route !== 'string') {
      return { success: false, error: 'Invalid home route.' }
    }

    if (typeof settingsData.home_route === 'string') {
      settingsData = { ...settingsData, home_route: settingsData.home_route.trim() }
    }

    const currentSettings = await getOrCreateAdminSettings()
    if (!currentSettings) return { success: false, error: 'Failed to initialize admin settings' }

    const updatedSettings = {
      ...(currentSettings.settings as Record<string, unknown>),
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
