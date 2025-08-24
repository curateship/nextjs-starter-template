"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { createSiteAction } from "@/lib/actions/site-actions"
import { useSiteContext } from "@/contexts/site-context"

export default function NewSitePage() {
  const router = useRouter()
  const { refreshSites, setCurrentSite } = useSiteContext()
  const [siteName, setSiteName] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [status, setStatus] = useState("draft")
  const [themeId, setThemeId] = useState("")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [favicon, setFavicon] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    if (!themeId) {
      setError('Please select a theme')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const { data, error } = await createSiteAction({
        name: siteName.trim(),
        subdomain: subdomain.trim(),
        custom_domain: customDomain.trim() || undefined,
        theme_id: themeId,
        status: status as 'active' | 'inactive' | 'draft',
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
        favicon: favicon || undefined,
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
        // Refresh the site context to get the new site with theme data
        await refreshSites()
        // Update localStorage to set the new site as selected
        localStorage.setItem('selectedSiteId', data.id)
        // The refreshSites will automatically set the current site from localStorage
        // Redirect to site builder for the new site
        router.push(`/admin/builder/${data.id}`)
      }
    } catch (err) {
      console.error('Error creating site:', err)
      setError('Failed to create site. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Create Site"
          subtitle="Add a new site to your multi-site collection"
          primaryAction={{
            label: isSubmitting ? "Creating Site..." : "Save Site",
            onClick: isSubmitting ? undefined : handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/sites"
          }}
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
            onSiteNameChange={setSiteName}
            onSubdomainChange={setSubdomain}
            onCustomDomainChange={setCustomDomain}
            onStatusChange={setStatus}
            onThemeIdChange={setThemeId}
            onFontFamilyChange={setFontFamily}
            onSecondaryFontFamilyChange={setSecondaryFontFamily}
            onFaviconChange={setFavicon}
          />
        </form>
      </div>
    </AdminLayout>
  )
}

// claude.md followed