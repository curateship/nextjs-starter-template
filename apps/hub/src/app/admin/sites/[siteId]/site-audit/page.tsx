'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from '@/components/admin/layout/dashboard/StickyHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Save,
  Settings,
} from 'lucide-react'
import { getSiteForAudit, getSiteAuditData, saveSiteAuditSettings } from '@/lib/actions/site-audit/site-audit-actions'
import { calculateAuditScore } from '@/lib/utils/site-audit-scoring'

interface PageProps {
  params: Promise<{ siteId: string }>
}

// Score gauge component
function ScoreGauge({ score, label, maxScore }: { score: number; label: string; maxScore: number }) {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const color = percentage >= 80 ? 'text-green-500' : percentage >= 50 ? 'text-yellow-500' : 'text-red-500'
  const bgColor = percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="35" fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="40" cy="40" r="35" fill="none" strokeWidth="6"
            className={bgColor.replace('bg-', 'stroke-')}
            strokeDasharray={`${percentage * 2.2} 220`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`text-lg font-bold ${color}`}>{score}</span>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  )
}

// Main Site Audit Dashboard
export default function SiteAuditPage({ params }: PageProps) {
  const { siteId } = use(params)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [site, setSite] = useState<any>(null)
  const [auditData, setAuditData] = useState<any[]>([])
  const [score, setScore] = useState<any>(null)

  // Settings form state
  const [seoDesc, setSeoDesc] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [twitterCardType, setTwitterCardType] = useState('summary_large_image')
  const [twitterHandle, setTwitterHandle] = useState('')
  const [googleVerification, setGoogleVerification] = useState('')
  const [canonicalDomain, setCanonicalDomain] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgLogo, setOrgLogo] = useState('')
  const [socialLinks, setSocialLinks] = useState('')

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false)


  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [siteData, contentData] = await Promise.all([
        getSiteForAudit(siteId),
        getSiteAuditData(siteId),
      ])

      if (siteData) {
        setSite(siteData)
        const s = siteData.settings || {}
        setSeoDesc(s.seo_site_description || '')
        setOgImage(s.seo_default_og_image || '')
        setTwitterCardType(s.seo_twitter_card_type || 'summary_large_image')
        setTwitterHandle(s.seo_twitter_handle || '')
        setGoogleVerification(s.seo_google_verification || '')
        setCanonicalDomain(s.seo_canonical_domain || '')
        setOrgName(s.seo_org_name || '')
        setOrgLogo(s.seo_org_logo || '')
        setSocialLinks((s.seo_org_social_links || []).join('\n'))
      }

      setAuditData(contentData)

      if (siteData) {
        const auditScore = calculateAuditScore(siteData, contentData)
        setScore(auditScore)
      }
    } catch (err) {
      console.error('Error loading site audit data:', err)
    }
    setLoading(false)
  }, [siteId])

  useEffect(() => { loadData() }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    const result = await saveSiteAuditSettings(siteId, {
      seo_site_description: seoDesc || undefined,
      seo_default_og_image: ogImage || undefined,
      seo_twitter_card_type: (twitterCardType as any) || undefined,
      seo_twitter_handle: twitterHandle || undefined,
      seo_google_verification: googleVerification || undefined,
      seo_canonical_domain: (canonicalDomain as any) || undefined,
      seo_org_name: orgName || undefined,
      seo_org_logo: orgLogo || undefined,
      seo_org_social_links: socialLinks ? socialLinks.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
    })
    setSaving(false)
    if (result.success) {
      setSettingsOpen(false)
      loadData()
    }
  }

  const criticalIssues = score?.issues?.filter((i: any) => i.severity === 'critical') || []
  const warningIssues = score?.issues?.filter((i: any) => i.severity === 'warning') || []
  const infoIssues = score?.issues?.filter((i: any) => i.severity === 'info') || []

  if (loading) {
    return (
      <>
        <StickyHeader navLinks={[
          { label: 'Overview', href: `/admin/sites/${siteId}/site-audit`, active: true },
          { label: 'Content Audit', href: `/admin/sites/${siteId}/site-audit/audit` },
        { label: 'Internal Links', href: `/admin/sites/${siteId}/site-audit/links` },
        ]} />
        <AdminLayout>
          <DashboardSubheader items={[{ label: 'Site Audit Overview' }]} />
          <div className="pb-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-20 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </AdminLayout>
      </>
    )
  }

  return (
    <>
      <StickyHeader navLinks={[
        { label: 'Overview', href: `/admin/sites/${siteId}/site-audit`, active: true },
        { label: 'Content Audit', href: `/admin/sites/${siteId}/site-audit/audit` },
        { label: 'Internal Links', href: `/admin/sites/${siteId}/site-audit/links` },
      ]} />
      <AdminLayout>
        <DashboardSubheader
          items={[{ label: 'Site Audit Overview' }]}
          actions={
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Audit Settings
            </Button>
          }
        />

        <div className="pb-8">
          {/* Audit Score */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreGauge score={score?.totalScore || 0} label="" maxScore={100} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Site Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreGauge score={score?.siteSettingsScore || 0} label="" maxScore={30} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Content</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreGauge score={score?.contentScore || 0} label="" maxScore={40} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Technical</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreGauge score={score?.technicalScore || 0} label="" maxScore={30} />
              </CardContent>
            </Card>
          </div>

          {/* Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {criticalIssues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> Critical ({criticalIssues.length})
                  </h4>
                  {criticalIssues.map((issue: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm pl-5 py-1">
                      <span>{issue.message}</span>
                      {issue.fixAction && (
                        <span className="text-xs text-muted-foreground">{issue.fixAction}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {warningIssues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-yellow-600 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Warnings ({warningIssues.length})
                  </h4>
                  {warningIssues.map((issue: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm pl-5 py-1">
                      <span>{issue.message}</span>
                      {issue.fixAction && (
                        <span className="text-xs text-muted-foreground">{issue.fixAction}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {infoIssues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Info & Passed ({infoIssues.length})
                  </h4>
                  {infoIssues.map((issue: any, i: number) => (
                    <div key={i} className="text-sm pl-5 py-1 text-muted-foreground">
                      {issue.message}
                    </div>
                  ))}
                </div>
              )}
              {(!score?.issues || score.issues.length === 0) && (
                <p className="text-sm text-muted-foreground">No issues found.</p>
              )}
            </CardContent>
          </Card>

          {/* Audit Settings Modal */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Site Audit Settings</DialogTitle>
              </DialogHeader>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <Label htmlFor="seo-desc">Default Meta Description</Label>
                  <Textarea
                    id="seo-desc"
                    value={seoDesc}
                    onChange={(e) => setSeoDesc(e.target.value)}
                    placeholder="Default description used when pages don't have their own..."
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">{seoDesc.length}/160 characters</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="og-image">Default OG Image URL</Label>
                  <Input id="og-image" value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1">
                  <Label>Twitter Card Type</Label>
                  <Select value={twitterCardType} onValueChange={setTwitterCardType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary_large_image">Large Image</SelectItem>
                      <SelectItem value="summary">Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="twitter">Twitter Handle</Label>
                  <Input id="twitter" value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} placeholder="@yourhandle" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="google-verify">Google Verification Code</Label>
                  <Input id="google-verify" value={googleVerification} onChange={(e) => setGoogleVerification(e.target.value)} placeholder="google-site-verification value..." />
                </div>
                <div className="space-y-1">
                  <Label>Canonical Domain</Label>
                  <Select value={canonicalDomain || 'not_set'} onValueChange={(v) => setCanonicalDomain(v === 'not_set' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_set">Not configured</SelectItem>
                      <SelectItem value="custom">Custom Domain</SelectItem>
                      <SelectItem value="subdomain">Subdomain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Your organization name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="org-logo">Organization Logo URL</Label>
                  <Input id="org-logo" value={orgLogo} onChange={(e) => setOrgLogo(e.target.value)} placeholder="https://..." />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label htmlFor="social-links">Social Profile URLs (one per line)</Label>
                  <Textarea
                    id="social-links"
                    value={socialLinks}
                    onChange={(e) => setSocialLinks(e.target.value)}
                    placeholder={"https://twitter.com/yourhandle\nhttps://instagram.com/yourhandle"}
                    rows={3}
                  />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="h-10 w-full">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </DialogContent>
          </Dialog>



        </div>
      </AdminLayout>
    </>
  )
}
