'use server'

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

// Admin client for creating users (requires service role key)
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

/**
 * Check if a user exists by email
 * @param email - Email address to check
 * @returns true if user exists, false otherwise
 */
export async function checkUserExists(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()

    if (error) {
      console.error('Error checking user existence:', error)
      return false
    }

    return data.users.some((user) => user.email === email)
  } catch (error) {
    console.error('Exception checking user existence:', error)
    return false
  }
}

/**
 * Get user by email
 * @param email - Email address
 * @returns User object or null
 */
export async function getUserByEmail(email: string) {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()

    if (error) {
      console.error('Error getting user by email:', error)
      return null
    }

    return data.users.find((user) => user.email === email) || null
  } catch (error) {
    console.error('Exception getting user by email:', error)
    return null
  }
}

/**
 * Create auto-account for lead magnet user
 * @param params - Account creation parameters
 * @returns Created user object
 */
export async function createAutoAccount(params: {
  email: string
  siteId: string
  productId: string
  productSlug: string
}) {
  try {
    // Generate cryptographically secure random password
    const tempPassword = randomBytes(32).toString('base64url')

    // Create user with auto-confirmed email
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: tempPassword,
      email_confirm: true, // Skip confirmation (email already verified by click)
      user_metadata: {
        created_from: 'lead_magnet',
        first_lead_magnet_site_id: params.siteId,
        first_lead_magnet_product_id: params.productId,
        first_lead_magnet_product_slug: params.productSlug,
        lead_magnet_count: 1,
        sites_interacted_with: [params.siteId],
        account_created_at: new Date().toISOString(),
      },
    })

    if (error) {
      throw new Error(`Failed to create auto-account: ${error.message}`)
    }

    if (!newUser.user) {
      throw new Error('User creation returned no user object')
    }

    return newUser.user
  } catch (error: any) {
    console.error('Exception in createAutoAccount:', error)
    throw error
  }
}

/**
 * Send magic link for password setup
 * @param email - User email
 * @param siteUrl - Site URL for redirect
 */
export async function sendPasswordSetupEmail(
  email: string,
  siteUrl: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/set-password`,
    })

    if (error) {
      console.error('Error sending password setup email:', error)
      throw new Error('Failed to send password setup email')
    }
  } catch (error: any) {
    console.error('Exception in sendPasswordSetupEmail:', error)
    throw error
  }
}

/**
 * Link order to user account
 * @param orderId - Product order ID
 * @param userId - User ID from auth.users
 */
export async function linkOrderToUser(
  orderId: string,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('product_orders')
      .update({ user_id: userId })
      .eq('id', orderId)

    if (error) {
      throw new Error(`Failed to link order to user: ${error.message}`)
    }
  } catch (error: any) {
    console.error('Exception in linkOrderToUser:', error)
    throw error
  }
}
