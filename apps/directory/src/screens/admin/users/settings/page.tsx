"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminCard } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import User from "lucide-react/dist/esm/icons/user.js"
import Lock from "lucide-react/dist/esm/icons/lock.js"
import Mail from "lucide-react/dist/esm/icons/mail.js"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { updateProfile, updatePassword, getCurrentUser, requestEmailChange } from "@/lib/actions/auth/auth-actions"

export default function SettingsPage() {
  const [user, setUser] = useState<{ id: string; email: string; name?: string | null; displayName?: string | null; image?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [initialAvatarUrl, setInitialAvatarUrl] = useState("")
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (u) {
        setUser(u)
        setEmail(u.email || "")
        setDisplayName(u.displayName || u.name || u.email?.split('@')[0] || "")
        setAvatarUrl(u.image || "")
        setInitialAvatarUrl(u.image || "")
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
      if (avatarUrl !== initialAvatarUrl) {
        formData.set('image', avatarUrl)
      }

      const result = await updateProfile({ data: formData })
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        const emailChanged = user && email.trim().toLowerCase() !== user.email.toLowerCase()
        if (emailChanged) {
          const emailFormData = new FormData()
          emailFormData.set('new_email', email)
          emailFormData.set('callback_url', '/admin/users/settings')

          const emailResult = await requestEmailChange({ data: emailFormData })
          if (emailResult.error) {
            setMessage({ type: 'error', text: emailResult.error })
            return
          }

          setEmail(user.email)
        }

        setInitialAvatarUrl(avatarUrl)
        setMessage({
          type: 'success',
          text: emailChanged
            ? 'Profile updated. Check your new email address for a verification link.'
            : 'Profile updated successfully!'
        })
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

      const result = await updatePassword({ data: formData })
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
        {null}
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
          <Alert className={`mb-6 ${message.type === 'error' ? 'border-destructive/30 bg-destructive/10' : 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/50'}`}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className={message.type === 'error' ? 'text-destructive' : 'text-green-800 dark:text-green-300'}>
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

                <div className="grid gap-4 md:grid-cols-[5.625rem_minmax(0,1fr)_minmax(0,1fr)] md:items-start">
                  <div className="space-y-2">
                    <Label>Avatar</Label>
                    {avatarUrl ? (
                      <div className="relative h-[90px] w-[90px] overflow-hidden rounded-full bg-muted">
                        <img
                          src={avatarUrl}
                          alt="Avatar preview"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                        <button
                          type="button"
                          onClick={() => setAvatarUrl("")}
                          className="absolute right-3 top-3 z-10 rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div
                          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                          onClick={() => setShowAvatarPicker(true)}
                        >
                          <div className="text-center text-white">
                            <ImageIcon className="mx-auto mb-1 h-6 w-6" />
                            <p className="text-xs font-medium">Change</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex h-[90px] w-[90px] cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                        onClick={() => setShowAvatarPicker(true)}
                      >
                        <div className="text-center">
                          <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/50" />
                          <p className="mt-1 text-xs text-muted-foreground">Select</p>
                        </div>
                      </div>
                    )}
                  </div>

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

                <MediaPicker
                  open={showAvatarPicker}
                  onOpenChange={setShowAvatarPicker}
                  onSelectMedia={(mediaUrl) => setAvatarUrl(mediaUrl)}
                  currentMediaUrl={avatarUrl}
                  showVideos={false}
                />
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
