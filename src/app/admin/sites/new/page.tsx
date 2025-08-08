"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { createSiteAction } from "@/lib/actions/site-actions"

export default function NewSitePage() {
  const router = useRouter()
  const [siteName, setSiteName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("draft")
  const [themeId, setThemeId] = useState("")
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
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

    if (!themeId) {
      setError('Please select a theme')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const { data, error } = await createSiteAction({
        name: siteName.trim(),
        description: description.trim() || undefined,
        theme_id: themeId,
        status: status as 'active' | 'inactive' | 'draft',
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
        console.log('Site created successfully:', data)
        // Redirect to sites list or site builder
        router.push('/admin/sites')
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
            description={description}
            status={status}
            themeId={themeId}
            logo={logo}
            logoPreview={logoPreview}
            onSiteNameChange={setSiteName}
            onDescriptionChange={setDescription}
            onStatusChange={setStatus}
            onThemeIdChange={setThemeId}
            onLogoChange={setLogo}
            onLogoPreviewChange={setLogoPreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}

// claude.md followed