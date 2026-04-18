"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { StylingSettingsCard } from "@/components/admin/layout/settings/StylingSettingsCard"
import { createSiteAction, type Site } from "@/lib/actions/sites/site-actions"
import { getTemplateSitesAction, applyThemeToSiteAction } from "@/lib/actions/themes/user-theme-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Palette } from "lucide-react"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"

export default function NewSitePage() {
  const router = useRouter()
  const { refreshSites } = useSiteSwitcher()
  const [siteName, setSiteName] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [status, setStatus] = useState("draft")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [favicon, setFavicon] = useState("")
  const [defaultTheme, setDefaultTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [templates, setTemplates] = useState<Site[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasTemplate = selectedTemplateId && selectedTemplateId !== 'none'

  useEffect(() => {
    getTemplateSitesAction().then(({ data }) => {
      if (data) setTemplates(data)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveClick()
  }

  const handleSaveClick = async () => {
    if (!siteName.trim()) {
      setError('Site name is required')
      return
    }

    if (!subdomain.trim()) {
      setError('Subdomain is required')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const { data, error } = await createSiteAction({
        name: siteName.trim(),
        subdomain: subdomain.trim(),
        custom_domain: customDomain.trim() || undefined,
        status: status as 'active' | 'inactive' | 'draft',
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
        favicon: favicon || undefined,
        default_theme: defaultTheme,
        settings: {
          site_title: siteName.trim(),
          analytics_enabled: false,
          seo_enabled: true
        }
      })

      if (error) {
        setError(error)
        return
      }

      if (data) {
        // Apply template if one was selected
        if (hasTemplate) {
          const { error: themeError } = await applyThemeToSiteAction(data.id, selectedTemplateId)
          if (themeError) {
            setError(`Site created but failed to apply template: ${themeError}`)
            return
          }
        }

        localStorage.setItem('selectedSiteId', data.id)
        await refreshSites()
        router.push(`/admin/pages/${data.id}`)
      }
    } catch (err) {
      console.error('Error creating site:', err)
      setError('Failed to create site. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
    <StickyHeader />
    <AdminLayout>
      <div className="w-full pb-8">
        <DashboardSubheader
          items={[
            { label: "Sites", href: "/admin/sites" },
            { label: "New" },
          ]}
          actions={
            <Button
              onClick={isSubmitting ? undefined : handleSaveClick}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Site"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <SiteDashboard
            siteName={siteName}
            subdomain={subdomain}
            customDomain={customDomain}
            status={status}
            onSiteNameChange={setSiteName}
            onSubdomainChange={setSubdomain}
            onCustomDomainChange={setCustomDomain}
            onStatusChange={setStatus}
          />

          {/* Template Picker */}
          {templates.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Start from Template
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No template (blank site)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template (blank site)</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Apply a saved template to copy its pages, navigation, footer, and styling.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Styling Settings - only show when no template selected */}
          {!hasTemplate && (
            <StylingSettingsCard
              fontFamily={fontFamily}
              secondaryFontFamily={secondaryFontFamily}
              favicon={favicon}
              defaultTheme={defaultTheme}
              onFontFamilyChange={setFontFamily}
              onSecondaryFontFamilyChange={setSecondaryFontFamily}
              onFaviconChange={setFavicon}
              onDefaultThemeChange={setDefaultTheme}
            />
          )}
        </form>
      </div>
    </AdminLayout>
    </>
  )
}
