"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, Palette } from "lucide-react"
import { FontSelector } from "@/components/admin/page-builder/FontSelector"
import { getAdminSettingsAction, updateAdminSettingsAction } from "@/lib/actions/admin-settings/admin-settings-actions"

export default function PlatformSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Form states
  const [fontFamily, setFontFamily] = useState("urbanist")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("urbanist")
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const result = await getAdminSettingsAction()

      if (result.error || !result.data) {
        console.error('Error loading admin settings:', result.error)
        setMessage({ type: 'error', text: result.error || 'Failed to load settings' })
        return
      }

      // Set form values from loaded settings
      const settings = result.data.settings
      setFontFamily(settings.font_family || "urbanist")
      setSecondaryFontFamily(settings.secondary_font_family || "urbanist")

    } catch (err) {
      console.error('Error loading settings:', err)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const result = await updateAdminSettingsAction({
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
      })

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' })
      setHasChanges(false)

      // Reload the page after a short delay to apply the new fonts
      setTimeout(() => {
        window.location.reload()
      }, 1000)

    } catch (error: any) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleFontChange = (value: string, isPrimary: boolean) => {
    if (isPrimary) {
      setFontFamily(value)
    } else {
      setSecondaryFontFamily(value)
    }
    setHasChanges(true)
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
      <div className="w-full">
        <AdminPageHeader
          title="Platform Settings"
          subtitle="Configure default settings for the admin panel"
          primaryAction={{
            label: saving ? 'Saving...' : 'Save Changes',
            onClick: handleSave,
            disabled: saving || !hasChanges
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
          {/* Font Settings */}
          <AdminCard>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Palette className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Admin Panel Fonts</h3>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                These fonts will be applied across all admin panel pages. Changes will take effect after saving and refreshing the page.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <FontSelector
                  value={fontFamily}
                  onChange={(value) => handleFontChange(value, true)}
                  label="Primary Font"
                  description="Used for headings and titles in the admin panel"
                  disabled={saving}
                />
                <FontSelector
                  value={secondaryFontFamily}
                  onChange={(value) => handleFontChange(value, false)}
                  label="Secondary Font"
                  description="Used for body text and content in the admin panel"
                  disabled={saving}
                />
              </div>
            </div>
          </AdminCard>

          {/* Font Preview */}
          <AdminCard>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Font Preview</h3>

              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Primary Font Preview</p>
                  <div
                    className="p-4 border rounded-lg bg-muted/30"
                    style={{ fontFamily: `var(--font-${fontFamily})` }}
                  >
                    <h1 className="text-3xl font-semibold mb-2">The quick brown fox</h1>
                    <h2 className="text-2xl font-semibold mb-2">Jumps over the lazy dog</h2>
                    <h3 className="text-xl font-semibold">0123456789</h3>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Secondary Font Preview</p>
                  <div
                    className="p-4 border rounded-lg bg-muted/30"
                    style={{ fontFamily: `var(--font-${secondaryFontFamily})` }}
                  >
                    <p className="text-base mb-2">The quick brown fox jumps over the lazy dog</p>
                    <p className="text-sm mb-2">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                    <p className="text-sm">abcdefghijklmnopqrstuvwxyz 0123456789</p>
                  </div>
                </div>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminLayout>
  )
}
