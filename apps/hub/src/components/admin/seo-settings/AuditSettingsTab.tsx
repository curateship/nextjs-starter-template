'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getSiteForAudit, saveSiteAuditSettings } from '@/lib/actions/site-audit/site-audit-actions'

interface AuditSettingsTabProps {
  siteId: string
  onStatusChange?: (status: { loading: boolean; saving: boolean }) => void
}

export function AuditSettingsTab({ siteId, onStatusChange }: AuditSettingsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [site, setSite] = useState<any>(null)
  const [seoDesc, setSeoDesc] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [twitterCardType, setTwitterCardType] = useState('summary_large_image')
  const [twitterHandle, setTwitterHandle] = useState('')
  const [googleVerification, setGoogleVerification] = useState('')
  const [canonicalDomain, setCanonicalDomain] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgLogo, setOrgLogo] = useState('')
  const [socialLinks, setSocialLinks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const siteData = await getSiteForAudit(siteId)
      if (siteData) {
        setSite(siteData)
        const settings = siteData.settings || {}
        setSeoDesc(settings.seo_site_description || '')
        setOgImage(settings.seo_default_og_image || '')
        setTwitterCardType(settings.seo_twitter_card_type || 'summary_large_image')
        setTwitterHandle(settings.seo_twitter_handle || '')
        setGoogleVerification(settings.seo_google_verification || '')
        setCanonicalDomain(settings.seo_canonical_domain || '')
        setOrgName(settings.seo_org_name || '')
        setOrgLogo(settings.seo_org_logo || '')
        setSocialLinks((settings.seo_org_social_links || []).join('\n'))
      }
    } catch (err) {
      console.error('Error loading SEO settings:', err)
      setError('Failed to load SEO settings')
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    onStatusChange?.({ loading, saving })
  }, [loading, onStatusChange, saving])

  const canonicalPreview = useMemo(() => {
    if (!site) return ''
    if (canonicalDomain === 'custom') {
      return site.customDomain ? `https://${site.customDomain}` : 'Custom domain is not configured'
    }
    if (canonicalDomain === 'subdomain') {
      return `https://${site.subdomain}.systemeverything.com`
    }
    return site.customDomain ? `https://${site.customDomain}` : `https://${site.subdomain}.systemeverything.com`
  }, [canonicalDomain, site])

  const handleSave = async () => {
    if (saving) return

    setSaving(true)
    setError(null)
    setSaveMessage(null)

    const result = await saveSiteAuditSettings(siteId, {
      seo_site_description: seoDesc || undefined,
      seo_default_og_image: ogImage || undefined,
      seo_twitter_card_type: (twitterCardType as any) || undefined,
      seo_twitter_handle: twitterHandle || undefined,
      seo_google_verification: googleVerification || undefined,
      seo_canonical_domain: (canonicalDomain as any) || undefined,
      seo_org_name: orgName || undefined,
      seo_org_logo: orgLogo || undefined,
      seo_org_social_links: socialLinks ? socialLinks.split('\n').map((link) => link.trim()).filter(Boolean) : undefined,
    })

    setSaving(false)
    if (result.success) {
      setSaveMessage('SEO settings saved')
      setTimeout(() => setSaveMessage(null), 3000)
      loadData()
    } else {
      setError(result.error || 'Failed to save SEO settings')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <form
      id="seo-settings-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        handleSave()
      }}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {saveMessage && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">{saveMessage}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Appearance</CardTitle>
          <CardDescription>Default metadata and verification for search engines.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="seo-desc">Default Meta Description</Label>
            <Textarea
              id="seo-desc"
              value={seoDesc}
              onChange={(event) => setSeoDesc(event.target.value)}
              placeholder="Default description used when pages don't have their own..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{seoDesc.length}/160 characters</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="google-verify">Google Verification Code</Label>
            <Input
              id="google-verify"
              value={googleVerification}
              onChange={(event) => setGoogleVerification(event.target.value)}
              placeholder="google-site-verification value..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Graph</CardTitle>
          <CardDescription>Fallback image used when content does not provide its own social image.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="og-image">Default OG Image URL</Label>
            <Input
              id="og-image"
              value={ogImage}
              onChange={(event) => setOgImage(event.target.value)}
              placeholder="https://..."
            />
          </div>
          {ogImage && (
            <div className="overflow-hidden rounded-md border bg-muted">
              <img src={ogImage} alt="Default Open Graph preview" className="aspect-[1.91/1] w-full max-w-xl object-cover" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Twitter Card</CardTitle>
          <CardDescription>Default Twitter/X card metadata for shared pages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Twitter Card Type</Label>
            <Select value={twitterCardType} onValueChange={setTwitterCardType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary_large_image">Large Image</SelectItem>
                <SelectItem value="summary">Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="twitter">Twitter Handle</Label>
            <Input
              id="twitter"
              value={twitterHandle}
              onChange={(event) => setTwitterHandle(event.target.value)}
              placeholder="@yourhandle"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canonical URLs</CardTitle>
          <CardDescription>Choose the preferred domain search engines should index.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label>Canonical Domain</Label>
            <Select value={canonicalDomain || 'not_set'} onValueChange={(value) => setCanonicalDomain(value === 'not_set' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_set">Not configured</SelectItem>
                <SelectItem value="custom">Custom Domain</SelectItem>
                <SelectItem value="subdomain">Subdomain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canonicalPreview && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Preview: {canonicalPreview}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Structured Data</CardTitle>
          <CardDescription>Organization details used in JSON-LD schema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Your organization name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-logo">Organization Logo URL</Label>
              <Input
                id="org-logo"
                value={orgLogo}
                onChange={(event) => setOrgLogo(event.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-links">Social Profile URLs</Label>
            <Textarea
              id="social-links"
              value={socialLinks}
              onChange={(event) => setSocialLinks(event.target.value)}
              placeholder={"https://twitter.com/yourhandle\nhttps://instagram.com/yourhandle"}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">One URL per line.</p>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
