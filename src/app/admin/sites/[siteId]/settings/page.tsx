'use client'

import { useState, useEffect, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { getSiteByIdAction, updateSiteAction } from "@/lib/actions/sites/site-actions"
import type { Site, AnimationSettings } from "@/lib/actions/sites/site-actions"
import { useSiteContext } from "@/contexts/site-context"
import { CheckCircle } from "lucide-react"

interface SiteEditPageProps {
  params: Promise<{
    siteId: string
  }>
}

export default function SiteEditPage({ params }: SiteEditPageProps) {
  const router = useRouter()
  const { siteId } = use(params)
  const [site, setSite] = useState<Site | null>(null)
  const [siteName, setSiteName] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [status, setStatus] = useState("draft")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [favicon, setFavicon] = useState("")
  const [animations, setAnimations] = useState<AnimationSettings>({ enabled: false, preset: 'fade', duration: 0.6, stagger: 0.1, intensity: 'medium' })
  const [trackingScripts, setTrackingScripts] = useState("")
  const [siteWidth, setSiteWidth] = useState<'full' | 'custom'>('custom')
  const [customWidth, setCustomWidth] = useState<number | undefined>()
  const [defaultTheme, setDefaultTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadSite = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await getSiteByIdAction(siteId)
      
      if (error) {
        setError(error)
        return
      }

      if (data) {
        setSite(data)
        setSiteName(data.name)
        setSubdomain(data.subdomain || "")
        setCustomDomain(data.custom_domain || "")
        setStatus(data.status)
        setFontFamily(data.settings?.font_family || "playfair-display")
        setSecondaryFontFamily(data.settings?.secondary_font_family || "inter")
        setFavicon(data.settings?.favicon || "")
        setAnimations(data.settings?.animations || { enabled: false, preset: 'fade', duration: 0.6, stagger: 0.1, intensity: 'medium' })
        setTrackingScripts(data.settings?.tracking_scripts || "")
        setSiteWidth(data.settings?.site_width || 'custom')
        setCustomWidth(data.settings?.custom_width)
        setDefaultTheme(data.settings?.default_theme || 'system')
        setMaintenanceEnabled(!!data.settings?.maintenance?.enabled)
      }
    } catch (err) {
      console.error('Error loading site:', err)
      setError('Failed to load site')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    loadSite()
  }, [loadSite])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveClick()
  }

  const handleSaveClick = async () => {
    if (!siteName.trim()) {
      setError('Site name is required')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      setSaveMessage(null)

      const { data, error } = await updateSiteAction(siteId, {
        name: siteName.trim(),
        subdomain: subdomain.trim(),
        custom_domain: customDomain.trim() || null,
        status: status as 'active' | 'inactive' | 'draft',
        settings: {
          ...site?.settings, // Preserve existing settings like navigation and footer
          site_title: siteName.trim(),
          analytics_enabled: false,
          seo_enabled: true,
          maintenance: { enabled: maintenanceEnabled },
          font_family: fontFamily,
          secondary_font_family: secondaryFontFamily,
          favicon: favicon === '' ? '' : favicon || undefined,
          animations: animations,
          tracking_scripts: trackingScripts,
          site_width: siteWidth,
          custom_width: customWidth,
          default_theme: defaultTheme
        }
      })

      if (error) {
        setError(error)
        return
      }

      if (data) {
        // Refresh site settings in context to update cached URL prefixes
        // Stay on the same page after successful update
        setSite(prev => prev ? { ...prev, ...data } : null)
        
        // Show success message
        setSaveMessage('Site settings saved successfully')
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      }
    } catch (err) {
      console.error('Error updating site:', err)
      setError('Failed to update site. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (error && !site) {
    return (
      <AdminLayout>
        <div className="w-full">
          <div className="p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => router.push('/admin/sites')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Sites
            </button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="w-full pb-8">
        <AdminPageHeader
          title="Edit Site"
          subtitle={`Edit settings for ${site?.subdomain}.domain.com`}
          primaryAction={{
            label: isSubmitting ? "Saving Changes..." : "Save Changes",
            onClick: isSubmitting ? undefined : handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/sites"
          }}
          extraContent={saveMessage && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-green-700 text-sm font-medium">{saveMessage}</span>
            </div>
          )}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <SiteDashboard
            siteName={siteName}
            subdomain={subdomain}
            customDomain={customDomain}
            status={status}
            fontFamily={fontFamily}
            secondaryFontFamily={secondaryFontFamily}
            favicon={favicon}
            animations={animations}
            trackingScripts={trackingScripts}
            siteWidth={siteWidth}
            customWidth={customWidth}
            defaultTheme={defaultTheme}
            maintenanceEnabled={maintenanceEnabled}
            isEditMode={true}
            loading={loading}
            onSiteNameChange={setSiteName}
            onSubdomainChange={setSubdomain}
            onCustomDomainChange={setCustomDomain}
            onStatusChange={setStatus}
            onFontFamilyChange={setFontFamily}
            onSecondaryFontFamilyChange={setSecondaryFontFamily}
            onFaviconChange={setFavicon}
            onAnimationsChange={setAnimations}
            onTrackingScriptsChange={setTrackingScripts}
            onSiteWidthChange={setSiteWidth}
            onCustomWidthChange={setCustomWidth}
            onDefaultThemeChange={setDefaultTheme}
            onMaintenanceChange={setMaintenanceEnabled}
          />
        </form>
      </div>
    </AdminLayout>
  )
}

// claude.md followed