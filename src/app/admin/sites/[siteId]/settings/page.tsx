'use client'

import { useState, useEffect, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { getSiteByIdAction, updateSiteAction } from "@/lib/actions/sites/site-actions"
import type { SiteWithTheme, AnimationSettings } from "@/lib/actions/sites/site-actions"
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
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteName, setSiteName] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [status, setStatus] = useState("draft")
  const [themeId, setThemeId] = useState("")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [favicon, setFavicon] = useState("")
  const [animations, setAnimations] = useState<AnimationSettings>({ enabled: false, preset: 'fade', duration: 0.6, stagger: 0.1, intensity: 'medium' })
  const [trackingScripts, setTrackingScripts] = useState("")
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
        setThemeId(data.theme_id)
        setFontFamily(data.settings?.font_family || "playfair-display")
        setSecondaryFontFamily(data.settings?.secondary_font_family || "inter")
        setFavicon(data.settings?.favicon || "")
        setAnimations(data.settings?.animations || { enabled: false, preset: 'fade', duration: 0.6, stagger: 0.1, intensity: 'medium' })
        setTrackingScripts(data.settings?.tracking_scripts || "")
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

    if (!themeId) {
      setError('Please select a theme')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      setSaveMessage(null)

      const { data, error } = await updateSiteAction(siteId, {
        name: siteName.trim(),
        subdomain: subdomain.trim(),
        custom_domain: customDomain.trim() || undefined,
        theme_id: themeId,
        status: status as 'active' | 'inactive' | 'draft',
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
        favicon: favicon === '' ? '' : favicon || undefined,
        animations: animations,
        tracking_scripts: trackingScripts,
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <AdminPageHeader
            title="Site Settings"
            subtitle="Configure your site"
            primaryAction={{
              label: "Save Changes",
              onClick: () => {}
            }}
          />
          
          {/* Skeleton loading - form field rows with card styling */}
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <div className="space-y-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                  <div className="h-10 bg-gray-100 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error && !site) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
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
      <div className="w-full max-w-6xl mx-auto pb-8">
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
            themeId={themeId}
            fontFamily={fontFamily}
            secondaryFontFamily={secondaryFontFamily}
            favicon={favicon}
            animations={animations}
            trackingScripts={trackingScripts}
            isEditMode={true}
            onSiteNameChange={setSiteName}
            onSubdomainChange={setSubdomain}
            onCustomDomainChange={setCustomDomain}
            onStatusChange={setStatus}
            onThemeIdChange={setThemeId}
            onFontFamilyChange={setFontFamily}
            onSecondaryFontFamilyChange={setSecondaryFontFamily}
            onFaviconChange={setFavicon}
            onAnimationsChange={setAnimations}
            onTrackingScriptsChange={setTrackingScripts}
          />
        </form>
      </div>
    </AdminLayout>
  )
}

// claude.md followed