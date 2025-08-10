"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import type { Page, UpdatePageData } from "@/lib/actions/page-actions"
import type { SiteWithTheme } from "@/lib/actions/site-actions"

interface PageSettingsProps {
  params: Promise<{
    siteId: string
    pageId: string
  }>
}

export default function PageSettingsPage({ params }: PageSettingsProps) {
  const { siteId, pageId } = use(params)
  const router = useRouter()
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  const [formData, setFormData] = useState<UpdatePageData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Load site and page data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Load site data
        const siteResponse = await fetch(`/api/sites/${siteId}`)
        const siteResult = await siteResponse.json()
        if (!siteResponse.ok || siteResult.error) {
          setError(siteResult.error || 'Failed to load site data')
          return
        }
        setSite(siteResult.data)

        // Load page data
        const response = await fetch(`/api/pages/${pageId}`)
        const result = await response.json()
        
        if (!response.ok || result.error) {
          setError(result.error || 'Failed to load page data')
          return
        }
        
        if (!result.data) {
          setError('No page data returned from server')
          return
        }
        
        setPage(result.data)
        
        // Initialize form data with page data
        if (result.data) {
          setFormData({
            title: result.data.title,
            slug: result.data.slug,
            meta_description: result.data.meta_description || '',
            meta_keywords: result.data.meta_keywords || '',
            is_homepage: result.data.is_homepage,
            is_published: result.data.is_published
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load page data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [siteId, pageId])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveClick()
  }

  const handleSaveClick = async () => {
    if (!formData.title?.trim()) {
      setError('Page title is required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSaveMessage(null)
      
      const response = await fetch(`/api/pages/${pageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
      
      const result = await response.json()
      
      if (!response.ok || result.error) {
        setError(result.error || 'Failed to save page settings')
        return
      }
      
      if (result.data) {
        setPage(result.data)
        setSaveMessage('Page settings saved successfully!')
        
        // Clear success message after 3 seconds
        setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (err) {
      setError('Failed to save page settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !site || !page) {
    return (
      <AdminLayout>
        <div className="w-full max-w-6xl mx-auto">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error || 'Page not found'}</p>
            <Button asChild>
              <Link href={`/admin/sites/${siteId}/pages`}>Back to Pages</Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Page Settings"
          subtitle={`Configure settings for "${page.title}"`}
          primaryAction={{
            label: saving ? "Saving..." : "Save Settings",
            onClick: saving ? undefined : handleSaveClick
          }}
          secondaryAction={{
            label: "Back to Pages",
            href: `/admin/sites/${siteId}/pages`
          }}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {saveMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">{saveMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Configure the basic settings for this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Page Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Page Title *</Label>
                <Input
                  id="title"
                  value={formData.title || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter page title"
                  required
                />
              </div>

              {/* Page Slug */}
              <div className="space-y-2">
                <Label htmlFor="slug">Page Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="page-url-slug"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The URL slug for this page: /{formData.slug || 'page-slug'}
                </p>
              </div>


              {/* Status Checkboxes */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_published"
                    checked={formData.is_published !== false}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, is_published: checked === true }))
                    }
                  />
                  <div>
                    <Label htmlFor="is_published">Published</Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.is_published !== false ? 'Page is visible to visitors' : 'Page is hidden from visitors'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_homepage"
                    checked={formData.is_homepage === true}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, is_homepage: checked === true }))
                    }
                  />
                  <div>
                    <Label htmlFor="is_homepage">Set as homepage</Label>
                    <p className="text-xs text-muted-foreground">
                      This page will be the main landing page for your site
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEO Settings */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>SEO Settings</CardTitle>
              <CardDescription>
                Optimize this page for search engines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Meta Description */}
              <div className="space-y-2">
                <Label htmlFor="meta_description">Meta Description</Label>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="A brief description of this page for search engines"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Recommended length: 150-160 characters ({(formData.meta_description || '').length}/160)
                </p>
              </div>

              {/* Meta Keywords */}
              <div className="space-y-2">
                <Label htmlFor="meta_keywords">Meta Keywords</Label>
                <Input
                  id="meta_keywords"
                  value={formData.meta_keywords || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_keywords: e.target.value }))}
                  placeholder="keyword1, keyword2, keyword3"
                />
                <p className="text-xs text-muted-foreground">
                  Separate keywords with commas
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common page management tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/builder/${siteId}?page=${page.slug}`}>
                    Edit Content
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={site ? `/${site.subdomain}/${page.slug}` : '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Preview Page
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/sites/${siteId}/pages`}>
                    View All Pages
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AdminLayout>
  )
}