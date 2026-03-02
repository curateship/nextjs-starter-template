'use client'

import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, use } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { getSiteByIdAction, updateSiteAction } from "@/lib/actions/sites/site-actions"
import type { Site, AnimationSettings } from "@/lib/actions/sites/site-actions"
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
import { CheckCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"

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
  { id: 'payments', label: 'Payments' },
  { id: 'email', label: 'Email' },
  { id: 'ai', label: 'AI Providers' },
  { id: 'seo', label: 'SEO' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SiteEditPage({ params }: SiteEditPageProps) {
  const router = useRouter()
  const { siteId } = use(params)
  const [activeTab, setActiveTab] = useState<TabId>('general')
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

  const paymentsRef = useRef<IntegrationTabHandle>(null)
  const emailRef = useRef<IntegrationTabHandle>(null)
  const aiRef = useRef<IntegrationTabHandle>(null)
  const seoRef = useRef<IntegrationTabHandle>(null)

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

      if (activeTab === 'general') {
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
          setSite(prev => prev ? { ...prev, ...data } : null)
          showSuccess('Settings saved successfully')
        }
      } else {
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
            primaryAction={{
              label: isSubmitting ? "Saving..." : "Save Changes",
              onClick: isSubmitting ? undefined : handleSaveClick
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
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
