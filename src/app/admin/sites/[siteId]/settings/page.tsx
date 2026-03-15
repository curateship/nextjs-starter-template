'use client'

import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { updateSiteAction, createSiteAction } from "@/lib/actions/sites/site-actions"
import type { Site } from "@/lib/actions/sites/site-actions"
import { useSiteContext } from "@/contexts/site-context"
import {
  getSiteIntegrations,
  createOrUpdateIntegration,
  toggleIntegration,
} from '@/lib/actions/integrations/integration-actions'
import type { SiteIntegration } from '@/lib/actions/integrations/integration-actions'
import { INTEGRATION_REGISTRY, type IntegrationCategory, type IntegrationRegistryEntry } from '@/lib/actions/integrations/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle, Eye, EyeOff, Loader2, Trash2, MoreHorizontal, Edit, Paintbrush, Pencil } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { getTemplateSitesAction, deleteTemplateAction } from "@/lib/actions/themes/user-theme-actions"
import { ApplyThemeDialog } from "@/components/admin/themes/ApplyThemeDialog"
import { StylingSettingsCard } from "@/components/admin/layout/dashboard/StylingSettingsCard"
import { ContentTypesSettingsCard } from "@/components/admin/layout/dashboard/ContentTypesSettingsCard"

// --- IntegrationCard ---

interface IntegrationCardHandle {
  getConfig: () => { type: string; config: Record<string, any>; hasValues: boolean }
}

interface IntegrationCardProps {
  entry: IntegrationRegistryEntry
  integration: SiteIntegration | null
  onToggle: (integrationId: string, isEnabled: boolean) => Promise<void>
}

const IntegrationCard = forwardRef<IntegrationCardHandle, IntegrationCardProps>(
  function IntegrationCard({ entry, integration, onToggle }, ref) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())
    const [formValues, setFormValues] = useState<Record<string, string>>(() => {
      const values: Record<string, string> = {}
      entry.fields.forEach((field) => {
        values[field.key] = integration?.config?.[field.key] || ''
      })
      return values
    })

    const isConfigured = integration !== null
    const isEnabled = integration?.is_enabled ?? false

    useImperativeHandle(ref, () => ({
      getConfig: () => {
        const config: Record<string, any> = {}
        let hasValues = false
        entry.fields.forEach((field) => {
          if (formValues[field.key]) {
            config[field.key] = formValues[field.key]
            hasValues = true
          }
        })
        return { type: entry.type, config, hasValues }
      },
    }))

    const handleToggle = async (checked: boolean) => {
      if (!integration) return
      await onToggle(integration.id, checked)
    }

    const toggleReveal = (key: string) => {
      setRevealedFields((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    }

    return (
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {entry.label}
                {isConfigured && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    isEnabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {isEnabled ? 'Connected' : 'Disabled'}
                  </span>
                )}
                {!isConfigured && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    Not configured
                  </span>
                )}
              </CardTitle>
              <CardDescription className="mt-1">{entry.description}</CardDescription>
            </div>
            {isConfigured && (
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                />
              </div>
            )}
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 space-y-4">
            {entry.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`${entry.type}-${field.key}`}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id={`${entry.type}-${field.key}`}
                    type={field.type === 'password' && !revealedFields.has(field.key) ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={formValues[field.key] || ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className={field.type === 'password' ? 'pr-10' : ''}
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {revealedFields.has(field.key) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    )
  }
)

// --- IntegrationTab ---

interface IntegrationTabHandle {
  save: () => Promise<void>
}

interface IntegrationTabProps {
  siteId: string
  category: IntegrationCategory
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
}

const IntegrationTab = forwardRef<IntegrationTabHandle, IntegrationTabProps>(
  function IntegrationTab({ siteId, category, onSuccess, onError }, ref) {
    const [integrations, setIntegrations] = useState<SiteIntegration[]>([])
    const [loading, setLoading] = useState(true)

    const entries = INTEGRATION_REGISTRY.filter((e) => e.category === category)
    const cardRefs = useRef<Map<string, IntegrationCardHandle>>(new Map())

    const loadIntegrations = useCallback(async () => {
      try {
        setLoading(true)
        const data = await getSiteIntegrations(siteId)
        setIntegrations(data)
      } catch (err) {
        console.error('Error loading integrations:', err)
        onError?.('Failed to load integrations')
      } finally {
        setLoading(false)
      }
    }, [siteId, onError])

    useEffect(() => {
      loadIntegrations()
    }, [loadIntegrations])

    useImperativeHandle(ref, () => ({
      save: async () => {
        let saved = 0
        for (const [, cardRef] of cardRefs.current) {
          const { type, config, hasValues } = cardRef.getConfig()
          if (hasValues) {
            await createOrUpdateIntegration(siteId, type, config, true)
            saved++
          }
        }
        await loadIntegrations()
        if (saved > 0) {
          onSuccess?.('Integration settings saved')
        } else {
          onSuccess?.('No changes to save')
        }
      },
    }))

    const handleToggle = async (integrationId: string, isEnabled: boolean) => {
      try {
        await toggleIntegration(integrationId, isEnabled)
        await loadIntegrations()
      } catch (err) {
        console.error('Error toggling integration:', err)
        onError?.('Failed to toggle integration')
      }
    }

    const getIntegration = (type: string): SiteIntegration | null => {
      return integrations.find((i) => i.integration_type === type) ?? null
    }

    const setCardRef = (type: string) => (handle: IntegrationCardHandle | null) => {
      if (handle) {
        cardRefs.current.set(type, handle)
      } else {
        cardRefs.current.delete(type)
      }
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {entries.map((entry) => (
          <IntegrationCard
            key={entry.type}
            ref={setCardRef(entry.type)}
            entry={entry}
            integration={getIntegration(entry.type)}
            onToggle={handleToggle}
          />
        ))}
      </div>
    )
  }
)

// --- Settings Page ---

interface SiteEditPageProps {
  params: Promise<{
    siteId: string
  }>
}

const TABS = [
  { id: 'general', label: 'General Settings' },
  { id: 'style', label: 'Style' },
  { id: 'content-types', label: 'Content Types' },
  { id: 'payments', label: 'Payments' },
  { id: 'email', label: 'Email' },
  { id: 'ai', label: 'AI Providers' },
  { id: 'seo', label: 'Integration' },
  { id: 'themes', label: 'Themes' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SiteEditPage({ params }: SiteEditPageProps) {
  const router = useRouter()
  const { siteId } = use(params)
  const { sites, currentSite } = useSiteContext()
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const contextSite = sites.find(s => s.id === siteId) || currentSite
  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [siteName, setSiteName] = useState(contextSite?.name || "")
  const [subdomain, setSubdomain] = useState(contextSite?.subdomain || "")
  const [customDomain, setCustomDomain] = useState(contextSite?.custom_domain || "")
  const [status, setStatus] = useState<string>(contextSite?.status || "draft")
  const [fontFamily, setFontFamily] = useState(contextSite?.settings?.font_family || "playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState(contextSite?.settings?.secondary_font_family || "inter")
  const [favicon, setFavicon] = useState(contextSite?.settings?.favicon || "")
  const [trackingScripts, setTrackingScripts] = useState(contextSite?.settings?.tracking_scripts || "")
  const [customAnalyticsEnabled, setCustomAnalyticsEnabled] = useState(!!contextSite?.settings?.custom_analytics_enabled)
  const [siteWidth, setSiteWidth] = useState<'full' | 'custom'>(contextSite?.settings?.site_width || 'custom')
  const [customWidth, setCustomWidth] = useState<number | undefined>(contextSite?.settings?.custom_width)
  const [defaultTheme, setDefaultTheme] = useState<'system' | 'light' | 'dark'>(contextSite?.settings?.default_theme || 'system')
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(!!contextSite?.settings?.maintenance?.enabled)
  const [defaultBlocks, setDefaultBlocks] = useState<Record<string, string[]>>(contextSite?.settings?.default_blocks || {})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Theme state
  const [templates, setTemplates] = useState<Site[]>([])
  const [themesLoading, setThemesLoading] = useState(true)
  const [themesError, setThemesError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; templateId: string; templateName: string }>({
    open: false, templateId: "", templateName: "",
  })
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; templateId: string; currentName: string }>({
    open: false, templateId: "", currentName: "",
  })
  const [renameName, setRenameName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [applyDialog, setApplyDialog] = useState<{ open: boolean; templateId: string; templateName: string }>({
    open: false, templateId: "", templateName: "",
  })

  const paymentsRef = useRef<IntegrationTabHandle>(null)
  const emailRef = useRef<IntegrationTabHandle>(null)
  const aiRef = useRef<IntegrationTabHandle>(null)
  const seoRef = useRef<IntegrationTabHandle>(null)

  // Theme handlers
  const loadTemplates = useCallback(async () => {
    try {
      setThemesLoading(true)
      setThemesError(null)
      const { data, error } = await getTemplateSitesAction()
      if (error) { setThemesError(error); return }
      setTemplates(data || [])
    } catch {
      setThemesError("Failed to load themes")
    } finally {
      setThemesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'themes') {
      loadTemplates()
    }
  }, [loadTemplates, activeTab])

  const handleCreateTheme = async () => {
    const trimmed = createName.trim()
    if (!trimmed) return
    try {
      setCreating(true)
      const { data, error } = await createSiteAction({ name: trimmed, is_template: true })
      if (error) { alert(`Failed to create theme: ${error}`); return }
      if (data) { setCreateDialogOpen(false); router.push(`/admin/pages/${data.id}`) }
    } catch { alert("Failed to create theme") }
    finally { setCreating(false) }
  }

  const handleRenameSubmit = async () => {
    const trimmed = renameName.trim()
    if (!trimmed || trimmed === renameDialog.currentName) return
    try {
      setRenaming(true)
      const { error } = await updateSiteAction(renameDialog.templateId, { name: trimmed })
      if (error) { alert(`Failed to rename theme: ${error}`); return }
      setTemplates(prev => prev.map(t => t.id === renameDialog.templateId ? { ...t, name: trimmed } : t))
      setRenameDialog(prev => ({ ...prev, open: false }))
    } catch { alert("Failed to rename theme") }
    finally { setRenaming(false) }
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(deleteDialog.templateId)
      const { success, error } = await deleteTemplateAction(deleteDialog.templateId)
      if (error) { alert(`Failed to delete theme: ${error}`); return }
      if (success) { setTemplates(prev => prev.filter(t => t.id !== deleteDialog.templateId)) }
      setDeleteDialog(prev => ({ ...prev, open: false }))
    } catch { alert("Failed to delete theme") }
    finally { setDeleting(null) }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }

  const showSuccess = useCallback((message: string) => {
    setSaveMessage(message)
    setTimeout(() => setSaveMessage(null), 3000)
  }, [])

  const showError = useCallback((message: string) => {
    setError(message)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveClick()
  }

  const handleSaveClick = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      setSaveMessage(null)

      if (activeTab === 'general' || activeTab === 'style' || activeTab === 'content-types') {
        if (!siteName.trim()) {
          setError('Site name is required')
          return
        }

        const { data, error } = await updateSiteAction(siteId, {
          name: siteName.trim(),
          subdomain: subdomain.trim(),
          custom_domain: customDomain.trim() || null,
          status: status as 'active' | 'inactive' | 'draft',
          settings: {
            ...site?.settings,
            site_title: siteName.trim(),
            analytics_enabled: false,
            seo_enabled: true,
            maintenance: { enabled: maintenanceEnabled },
            font_family: fontFamily,
            secondary_font_family: secondaryFontFamily,
            favicon: favicon === '' ? '' : favicon || undefined,
            tracking_scripts: trackingScripts,
            custom_analytics_enabled: customAnalyticsEnabled,
            site_width: siteWidth,
            custom_width: customWidth,
            default_theme: defaultTheme,
            default_blocks: defaultBlocks
          }
        })

        if (error) {
          setError(error)
          return
        }

        if (data) {
          setSite(prev => prev ? { ...prev, ...data } : null)
          showSuccess('Settings saved successfully')
        }
      } else if (activeTab !== 'themes') {
        const refMap: Record<string, React.RefObject<IntegrationTabHandle | null>> = {
          payments: paymentsRef,
          email: emailRef,
          ai: aiRef,
          seo: seoRef,
        }
        const tabRef = refMap[activeTab]
        if (tabRef?.current) {
          await tabRef.current.save()
        }
      }
    } catch (err) {
      console.error('Error saving:', err)
      setError('Failed to save. Please try again.')
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
    <>
      <StickyHeader
        breadcrumbItems={[
          { href: `/admin/sites/${siteId}/dashboard`, label: "Dashboard" },
          { label: "Settings", isPage: true },
        ]}
      />
      <AdminLayout>
        <div className="w-full pb-8">
          <AdminPageHeader
            title="Site Settings"
            subtitle={`Manage settings for ${site?.subdomain || 'your site'}`}
            primaryAction={activeTab === 'themes'
              ? { label: "Create Theme", onClick: () => { setCreateName(""); setCreateDialogOpen(true) } }
              : { label: isSubmitting ? "Saving..." : "Save Changes", onClick: isSubmitting ? undefined : handleSaveClick }
            }
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

          <div className="flex items-start gap-6">
            {/* Vertical tab list */}
            <nav className="flex flex-col w-48 shrink-0 pt-[15px] ml-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "text-left px-4 py-2.5 text-sm font-medium rounded-md transition-colors",
                    activeTab === tab.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Tab content */}
            <div className="flex-1 min-w-0">
              {activeTab === 'general' && (
                <form onSubmit={handleSubmit}>
                  <SiteDashboard
                    siteName={siteName}
                    subdomain={subdomain}
                    customDomain={customDomain}
                    status={status}
                    trackingScripts={trackingScripts}
                    customAnalyticsEnabled={customAnalyticsEnabled}
                    maintenanceEnabled={maintenanceEnabled}
                    isEditMode={true}
                    loading={loading}
                    onSiteNameChange={setSiteName}
                    onSubdomainChange={setSubdomain}
                    onCustomDomainChange={setCustomDomain}
                    onStatusChange={setStatus}
                    onTrackingScriptsChange={setTrackingScripts}
                    onCustomAnalyticsEnabledChange={setCustomAnalyticsEnabled}
                    onMaintenanceChange={setMaintenanceEnabled}
                  />
                </form>
              )}

              {activeTab === 'style' && (
                <div className="space-y-6">
                  <StylingSettingsCard
                    fontFamily={fontFamily}
                    secondaryFontFamily={secondaryFontFamily}
                    favicon={favicon}
                    siteWidth={siteWidth}
                    customWidth={customWidth}
                    defaultTheme={defaultTheme}
                    onFontFamilyChange={setFontFamily}
                    onSecondaryFontFamilyChange={setSecondaryFontFamily}
                    onFaviconChange={setFavicon}
                    onSiteWidthChange={setSiteWidth}
                    onCustomWidthChange={setCustomWidth}
                    onDefaultThemeChange={setDefaultTheme}
                  />
                </div>
              )}

              {activeTab === 'content-types' && (
                <ContentTypesSettingsCard
                  defaultBlocks={defaultBlocks}
                  onDefaultBlocksChange={setDefaultBlocks}
                />
              )}

              {activeTab === 'payments' && (
                <IntegrationTab ref={paymentsRef} siteId={siteId} category="payments" onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'email' && (
                <IntegrationTab ref={emailRef} siteId={siteId} category="email" onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'ai' && (
                <IntegrationTab ref={aiRef} siteId={siteId} category="ai" onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'seo' && (
                <IntegrationTab ref={seoRef} siteId={siteId} category="seo" onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'themes' && (
                <>
                  <AdminCard>
                    <div className="p-6 border-b">
                      <p className="text-sm text-muted-foreground">
                        {themesLoading ? 'Loading...' : `${templates.length} theme${templates.length !== 1 ? 's' : ''} found`}
                      </p>
                    </div>

                    <div className="px-6 py-4 border-b bg-muted/30">
                      <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                        <div className="col-span-2">Theme</div>
                        <div>Created</div>
                        <div>Actions</div>
                      </div>
                    </div>

                    <div className="divide-y divide-muted/80">
                      {themesLoading ? (
                        <div className="space-y-0">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="p-6 border-b border-muted/80">
                              <div className="grid grid-cols-5 gap-4 items-center">
                                <div className="col-span-2">
                                  <div className="flex items-center space-x-4">
                                    <div className="w-12 h-12 bg-muted rounded-lg animate-pulse"></div>
                                    <div>
                                      <div className="h-4 bg-muted rounded animate-pulse mb-2 w-32"></div>
                                      <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                                    </div>
                                  </div>
                                </div>
                                <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div></div>
                                <div><div className="h-8 w-8 bg-muted rounded animate-pulse"></div></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : themesError ? (
                        <div className="p-8 text-center">
                          <p className="text-red-600 mb-4">{themesError}</p>
                          <Button onClick={loadTemplates} variant="outline" size="sm">Try Again</Button>
                        </div>
                      ) : templates.length === 0 ? (
                        <div className="p-8 text-center">
                          <Paintbrush className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                          <p className="text-muted-foreground mb-1">No themes yet</p>
                          <p className="text-sm text-muted-foreground">
                            Click &ldquo;Create Theme&rdquo; to start building a reusable template.
                          </p>
                        </div>
                      ) : (
                        templates.map((template) => (
                          <div key={template.id} className="p-6">
                            <div className="grid grid-cols-5 gap-4 items-center">
                              <div className="col-span-2">
                                <Link
                                  href={`/admin/pages/${template.id}`}
                                  className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                                >
                                  <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-sm font-medium">
                                      {template.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                                    </span>
                                  </div>
                                  <div>
                                    <h4 className="font-medium hover:underline">{template.name}</h4>
                                    <p className="text-sm text-muted-foreground">
                                      {template.settings?.description || "Reusable template"}
                                    </p>
                                  </div>
                                </Link>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">{formatDate(template.created_at)}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                      <span className="sr-only">Open menu</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link href={`/admin/pages/${template.id}`} className="flex items-center">
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => setApplyDialog({ open: true, templateId: template.id, templateName: template.name })}
                                    >
                                      <Paintbrush className="h-4 w-4 mr-2" />
                                      Apply to Site
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        setRenameName(template.name)
                                        setTimeout(() => setRenameDialog({ open: true, templateId: template.id, currentName: template.name }), 0)
                                      }}
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => setTimeout(() => setDeleteDialog({ open: true, templateId: template.id, templateName: template.name }), 0)}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Theme
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </AdminCard>

                  {/* Create Theme Dialog */}
                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create Theme</DialogTitle>
                        <DialogDescription>Enter a name for your new theme template.</DialogDescription>
                      </DialogHeader>
                      <div className="py-2">
                        <Label htmlFor="create-theme-name" className="sr-only">Name</Label>
                        <Input
                          id="create-theme-name"
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && createName.trim()) handleCreateTheme() }}
                          placeholder="Theme name"
                          autoFocus
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateTheme} disabled={creating || !createName.trim()}>
                          {creating ? "Creating..." : "Create"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Rename Theme Dialog */}
                  <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog(prev => ({ ...prev, open }))}>
                    <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
                      <DialogHeader>
                        <DialogTitle>Rename Theme</DialogTitle>
                        <DialogDescription>Enter a new name for this theme.</DialogDescription>
                      </DialogHeader>
                      <div className="py-2">
                        <Label htmlFor="theme-name" className="sr-only">Name</Label>
                        <Input
                          id="theme-name"
                          value={renameName}
                          onChange={(e) => setRenameName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit() }}
                          placeholder="Theme name"
                          autoFocus
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
                        <Button onClick={handleRenameSubmit} disabled={renaming || !renameName.trim() || renameName.trim() === renameDialog.currentName}>
                          {renaming ? "Saving..." : "Save"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Delete Theme Dialog */}
                  <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
                    <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
                      <DialogHeader>
                        <DialogTitle>Delete Theme</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete &ldquo;{deleteDialog.templateName}&rdquo;? This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting === deleteDialog.templateId}>
                          {deleting === deleteDialog.templateId ? "Deleting..." : "Delete"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Apply Theme Dialog */}
                  <ApplyThemeDialog
                    templateId={applyDialog.templateId}
                    templateName={applyDialog.templateName}
                    open={applyDialog.open}
                    onOpenChange={(open) => setApplyDialog(prev => ({ ...prev, open }))}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
