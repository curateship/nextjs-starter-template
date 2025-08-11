'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function createClient() {
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
            // Ignore
          }
        },
      },
    }
  )
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  
  // Input sanitization
  const displayName = (formData.get('display_name') as string)?.trim()?.slice(0, 100)
  const email = (formData.get('email') as string)?.trim()?.toLowerCase()
  
  try {
    const updates: any = {}
    
    // Validate and update display name in user metadata
    if (displayName) {
      // Additional validation
      if (displayName.length < 1 || displayName.length > 100) {
        return { error: 'Display name must be between 1-100 characters' }
      }
      
      // Sanitize display name (remove HTML tags, script content)
      const sanitizedDisplayName = displayName.replace(/<[^>]*>?/gm, '').replace(/[<>\"']/g, '')
      updates.display_name = sanitizedDisplayName
    }
    
    // Update email if provided
    if (email) {
      const { error: emailError } = await supabase.auth.updateUser({ email })
      if (emailError) throw emailError
    }
    
    // Update user metadata
    if (Object.keys(updates).length > 0) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: updates
      })
      if (metadataError) throw metadataError
    }
    
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string
  
  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }
  
  if (newPassword.length < 12) {
    return { error: 'Password must be at least 12 characters' }
  }

  // Server-side password strength validation
  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasNumbers = /\d/.test(newPassword)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    return { error: 'Password must contain uppercase, lowercase, numbers, and special characters' }
  }
  
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    
    if (error) throw error
    
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}