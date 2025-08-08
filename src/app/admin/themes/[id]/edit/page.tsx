"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { ThemeDashboard } from "@/components/admin/layout/dashboard/ThemeDashboard"
import { getAllThemesAction, updateThemeAction } from "@/lib/actions/theme-actions"
import type { Theme } from "@/lib/supabase/themes"

export default function EditThemePage() {
  const router = useRouter()
  const params = useParams()
  const themeId = params.id as string

  const [theme, setTheme] = useState<Theme | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("active")
  const [templatePath, setTemplatePath] = useState("")
  const [previewImage, setPreviewImage] = useState("")

  useEffect(() => {
    loadTheme()
  }, [themeId])

  const loadTheme = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Get all themes and find the one we need
      const { data: themes, error } = await getAllThemesAction()
      
      if (error) {
        setError(error)
        return
      }
      
      const foundTheme = themes?.find(t => t.id === themeId)
      if (!foundTheme) {
        setError('Theme not found')
        return
      }
      
      setTheme(foundTheme)
      setTitle(foundTheme.name)
      setDescription(foundTheme.description || "")
      setStatus(foundTheme.status)
      setTemplatePath(foundTheme.template_path)
      setPreviewImage(foundTheme.preview_image || "")
      
    } catch (err) {
      console.error('Error loading theme:', err)
      setError('Failed to load theme')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSaveClick()
  }

  const handleSaveClick = async () => {
    if (!theme) return

    try {
      setSaving(true)
      setError(null)

      const { data, error } = await updateThemeAction(themeId, {
        name: title,
        description: description || null,
        status: status as 'active' | 'inactive' | 'development',
        template_path: templatePath,
        preview_image: previewImage || null
      })
      
      if (error) {
        setError(error)
        return
      }
      
      // Redirect back to themes list
      router.push('/admin/themes')
      
    } catch (err) {
      console.error('Error saving theme:', err)
      setError('Failed to save theme')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading theme...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !theme) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <div className="p-8 text-center">
            <p className="text-red-600 mb-4">{error || 'Theme not found'}</p>
            <button 
              onClick={() => router.push('/admin/themes')} 
              className="px-4 py-2 bg-primary text-white rounded-md"
            >
              Back to Themes
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
          title={`Edit ${theme.name}`}
          subtitle="Update theme settings and configuration"
          primaryAction={{
            label: saving ? "Saving..." : "Save Changes",
            onClick: saving ? undefined : handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/themes"
          }}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <ThemeDashboard
            title={title}
            description={description}
            status={status}
            primaryFont="inter"
            secondaryFont="roboto"
            logo={null}
            logoPreview={previewImage}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onStatusChange={setStatus}
            onPrimaryFontChange={() => {}}
            onSecondaryFontChange={() => {}}
            onLogoChange={() => {}}
            onLogoPreviewChange={setPreviewImage}
            templatePath={templatePath}
            onTemplatePathChange={setTemplatePath}
          />
        </form>
      </div>
    </AdminLayout>
  )
}