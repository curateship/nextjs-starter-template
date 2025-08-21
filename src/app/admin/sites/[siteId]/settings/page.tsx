'use client'

import { useState, useEffect, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { getSiteByIdAction, updateSiteAction } from "@/lib/actions/site-actions"
import type { SiteWithTheme } from "@/lib/actions/site-actions"

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
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("draft")
  const [themeId, setThemeId] = useState("")
  const [fontFamily, setFontFamily] = useState("playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState("inter")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setDescription(data.description || "")
        setStatus(data.status)
        setThemeId(data.theme_id)
        setFontFamily(data.settings?.font_family || "playfair-display")
        setSecondaryFontFamily(data.settings?.secondary_font_family || "inter")
        console.log('Loaded site for editing:', data)
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

      const { data, error } = await updateSiteAction(siteId, {
        name: siteName.trim(),
        description: description.trim() || undefined,
        theme_id: themeId,
        status: status as 'active' | 'inactive' | 'draft',
        font_family: fontFamily,
        secondary_font_family: secondaryFontFamily,
        settings: {
          site_title: siteName.trim(),
          site_description: description.trim(),
          analytics_enabled: false,
          seo_enabled: true
        }
      })

      if (error) {
        setError(error)
        return
      }

      if (data) {
        console.log('Site updated successfully:', data)
        // Stay on the same page after successful update
        // Optionally show a success message or update the site state
        setSite(data)
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
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading site...</p>
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
      <div className="w-full max-w-6xl mx-auto">
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
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <SiteDashboard
            siteName={siteName}
            description={description}
            status={status}
            themeId={themeId}
            fontFamily={fontFamily}
            secondaryFontFamily={secondaryFontFamily}
            isEditMode={true}
            onSiteNameChange={setSiteName}
            onDescriptionChange={setDescription}
            onStatusChange={setStatus}
            onThemeIdChange={setThemeId}
            onFontFamilyChange={setFontFamily}
            onSecondaryFontFamilyChange={setSecondaryFontFamily}
          />
        </form>
      </div>
    </AdminLayout>
  )
}

// claude.md followed