"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Lock, Mail, AlertTriangle } from "lucide-react"
import { updateProfile, updatePassword, getCurrentUser } from "@/lib/actions/auth/auth-actions"

export default function SettingsPage() {
  const [user, setUser] = useState<{ id: string; email: string; name?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (u) {
        setUser(u)
        setEmail(u.email || "")
        setDisplayName(u.name || u.email?.split('@')[0] || "")
      }
      setLoading(false)
    })
  }, [])

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set('display_name', displayName)
      formData.set('email', email)

      const result = await updateProfile(formData)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({ type: 'success', text: 'Profile updated successfully!' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' })
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
      const formData = new FormData()
      formData.set('current_password', currentPassword)
      formData.set('new_password', newPassword)
      formData.set('confirm_password', confirmPassword)

      const result = await updatePassword(formData)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully!' })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update password' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
      <StickyHeader />
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </AdminLayout>
      </>
    )
  }

  return (
    <>
    <StickyHeader />
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <DashboardSubheader
          items={[
            { label: "Settings", href: "/admin/users/settings" },
            { label: "Account" },
          ]}
          actions={
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Button
                disabled={saving}
                onClick={() => {
                  if (!saving) {
                    const form = document.getElementById('profile-form') as HTMLFormElement;
                    if (form) form.requestSubmit();
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          }
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
                  </div>
                </div>
              </form>
            </div>
          </AdminCard>

          <AdminCard>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Security Settings</h3>
              </div>

              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      disabled={saving}
                    />
                  </div>

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
                  <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>
                    <Lock className="w-4 h-4 mr-2" />
                    {saving ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </div>
          </AdminCard>

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
                </div>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminLayout>
    </>
  )
}
