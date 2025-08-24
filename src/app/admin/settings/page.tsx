"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Mail, Lock, Save, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  // Form states
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    const supabase = createClient()
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setEmail(session.user.email || "")
        setDisplayName(session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || "")
      }
      setLoading(false)
    })
  }, [])

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      
      const updates: any = {}
      
      // Update display name
      if (displayName !== (user?.user_metadata?.display_name || user?.email?.split('@')[0] || "")) {
        updates.display_name = displayName
      }
      
      // Update email if changed
      if (email !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email })
        if (emailError) throw emailError
      }
      
      // Update display name if changed
      if (Object.keys(updates).length > 0) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: updates
        })
        if (metadataError) throw metadataError
      }
      
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      
      // Refresh user data
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
      }
      
    } catch (error: any) {
      // Sanitize error message to prevent information leakage
      const sanitizedError = error.message?.includes('duplicate') ? 'Email already in use' :
                           error.message?.includes('invalid') ? 'Invalid input provided' :
                           'Failed to update profile'
      setMessage({ type: 'error', text: sanitizedError })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      setSaving(false)
      return
    }

    if (newPassword.length < 12) {
      setMessage({ type: 'error', text: 'Password must be at least 12 characters' })
      setSaving(false)
      return
    }

    // Additional password strength validation
    const hasUpperCase = /[A-Z]/.test(newPassword)
    const hasLowerCase = /[a-z]/.test(newPassword)
    const hasNumbers = /\d/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      setMessage({ 
        type: 'error', 
        text: 'Password must contain uppercase, lowercase, numbers, and special characters' 
      })
      setSaving(false)
      return
    }

    try {
      const supabase = createClient()
      
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) throw error
      
      setMessage({ type: 'success', text: 'Password updated successfully!' })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      
    } catch (error: any) {
      // Sanitize error message to prevent information leakage
      const sanitizedError = error.message?.includes('weak') ? 'Password does not meet security requirements' :
                           error.message?.includes('invalid') ? 'Invalid password provided' :
                           'Failed to update password'
      setMessage({ type: 'error', text: sanitizedError })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Account Settings"
          subtitle="Manage your profile and security settings"
          primaryAction={{
            label: saving ? 'Saving...' : 'Save Profile',
            onClick: () => {
              if (!saving) {
                // Secure form reference using React ref instead of DOM query
                const form = document.getElementById('profile-form') as HTMLFormElement;
                if (form) form.requestSubmit();
              }
            }
          }}
        />

        {message && (
          <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Profile Information */}
          <AdminCard>
            <div className="p-6">
              <form onSubmit={handleProfileUpdate} id="profile-form">
                <div className="flex items-center gap-3 mb-6">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Profile Information</h3>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your display name"
                      disabled={saving}
                    />
                    <p className="text-sm text-muted-foreground">
                      This name will be displayed in the admin interface
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={saving}
                    />
                    <p className="text-sm text-muted-foreground">
                      You&apos;ll receive a confirmation email for email changes
                    </p>
                  </div>
                </div>
              </form>
            </div>
          </AdminCard>

          {/* Password Settings */}
          <AdminCard>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Security Settings</h3>
              </div>
              
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      disabled={saving}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      disabled={saving}
                    />
                    <p className="text-sm text-muted-foreground">
                      Password must be at least 12 characters with uppercase, lowercase, numbers, and special characters
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={saving || !newPassword || !confirmPassword}>
                    <Lock className="w-4 h-4 mr-2" />
                    {saving ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </div>
          </AdminCard>

          {/* Account Information */}
          <AdminCard>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Account Information</h3>
              </div>
              
              <div className="space-y-4 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">User ID</Label>
                    <p className="font-mono text-xs bg-muted p-2 rounded mt-1">
                      {user?.id ? `***${user.id.slice(-8)}` : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Account Created</Label>
                    <p className="mt-1">
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email Confirmed</Label>
                  <p className="mt-1">
                    {user?.email_confirmed_at ? (
                      <span className="text-green-600">✓ Confirmed on {new Date(user.email_confirmed_at).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-amber-600">⚠ Not confirmed</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminLayout>
  )
}