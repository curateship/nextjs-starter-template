'use client'

import { useState, useEffect, useCallback, useRef, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { updateSiteAction, type Site } from "@/lib/actions/sites/site-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  getSiteIntegrations,
  createOrUpdateIntegration,
} from '@/lib/actions/integrations/integration-actions'
import type { SiteIntegration } from '@/lib/actions/integrations/integration-actions'
import { INTEGRATION_REGISTRY, type IntegrationCategory, type IntegrationRegistryEntry } from '@/lib/actions/integrations/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"
import { StylingSettingsCard } from "@/components/admin/layout/settings/StylingSettingsCard"
import { SiteSettingsHeaderNav } from "@/components/admin/layout/settings/SiteSettingsHeaderNav"

// --- IntegrationCard ---

interface IntegrationCardProps {
  entry: IntegrationRegistryEntry
  integration: SiteIntegration | null
  formValues: Record<string, string>
  onFormChange: (type: string, key: string, value: string) => void
}

function IntegrationCard({
  entry,
  integration,
  formValues,
  onFormChange,
}: IntegrationCardProps) {
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())

  const isConfigured = integration !== null
  const stripeMode = (formValues.mode || integration?.config?.mode) === 'sandbox' ? 'Sandbox' : 'Live'

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
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {entry.label}
              {!isConfigured && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  Not configured
                </span>
              )}
              {entry.type === 'stripe' && isConfigured && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  stripeMode === 'Sandbox'
                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  Using {stripeMode}
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">{entry.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {entry.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            {entry.type === 'stripe' && field.key === 'secret_key' && (
              <h3 className="pt-4 text-base font-semibold">Live Credentials</h3>
            )}
            {entry.type === 'stripe' && field.key === 'sandbox_secret_key' && (
              <h3 className="pt-4 text-base font-semibold">Sandbox Credentials</h3>
            )}
            <Label htmlFor={`${entry.type}-${field.key}`}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="relative">
              {entry.type === 'stripe' && field.key === 'mode' ? (
                <div className="flex h-10 items-center gap-2">
                  <Checkbox
                    id={`${entry.type}-${field.key}`}
                    checked={(formValues[field.key] || field.options?.[0]?.value || '') === 'sandbox'}
                    onCheckedChange={(checked) => onFormChange(entry.type, field.key, checked ? 'sandbox' : 'live')}
                  />
                  <Label htmlFor={`${entry.type}-${field.key}`} className="cursor-pointer font-normal">
                    Use sandbox keys
                  </Label>
                </div>
              ) : field.type === 'select' ? (
                <Select
                  value={formValues[field.key] || field.options?.[0]?.value || ''}
                  onValueChange={(value) => onFormChange(entry.type, field.key, value)}
                >
                  <SelectTrigger id={`${entry.type}-${field.key}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${entry.type}-${field.key}`}
                  type={field.type === 'password' && !revealedFields.has(field.key) ? 'password' : field.type}
                  placeholder={field.placeholder}
                  value={formValues[field.key] || ''}
                  onChange={(e) => onFormChange(entry.type, field.key, e.target.value)}
                  className={field.type === 'password' ? 'pr-10' : ''}
                />
              )}
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
            {entry.type === 'stripe' && field.key === 'mode' && (
              <p className="text-sm text-muted-foreground">
                Unchecked uses live keys for checkout payments and webhooks.
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// --- IntegrationTab ---

interface IntegrationTabProps {
  siteId: string
  category: IntegrationCategory
  saveTrigger: number
  onSuccess?: (message: string) => void
  onError?: (message: string) => void
}

function IntegrationTab({ siteId, category, saveTrigger, onSuccess, onError }: IntegrationTabProps) {
  const [integrations, setIntegrations] = useState<SiteIntegration[]>([])
  const [loading, setLoading] = useState(true)
  // Form state lives here — keyed by integration type, then field key
  const [allFormValues, setAllFormValues] = useState<Record<string, Record<string, string>>>({})

  const entries = INTEGRATION_REGISTRY.filter((e) => e.category === category)

  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getSiteIntegrations(siteId)
      setIntegrations(data)
      // Initialize form values from loaded integrations
      const values: Record<string, Record<string, string>> = {}
      for (const entry of INTEGRATION_REGISTRY.filter((e) => e.category === category)) {
        const integration = data.find((i) => i.integrationType ===entry.type)
        values[entry.type] = {}
        for (const field of entry.fields) {
          values[entry.type][field.key] = integration?.config?.[field.key] || field.options?.[0]?.value || ''
        }
      }
      setAllFormValues(values)
    } catch (err) {
      console.error('Error loading integrations:', err)
      onError?.('Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }, [siteId, category, onError])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  // Keep a ref to always-current form values (effects can't rely on state closures)
  const allFormValuesRef = useRef(allFormValues)
  allFormValuesRef.current = allFormValues

  // Save when saveTrigger increments
  useEffect(() => {
    if (saveTrigger === 0) return

    const doSave = async () => {
      let saved = 0
      const currentValues = allFormValuesRef.current
      for (const entry of entries) {
        const formValues = currentValues[entry.type] || {}
        const existingIntegration = integrations.find((integration) => integration.integrationType === entry.type)
        const config: Record<string, any> = { ...(existingIntegration?.config || {}) }
        let hasValues = !!existingIntegration
        for (const field of entry.fields) {
          if (formValues[field.key]) {
            config[field.key] = formValues[field.key]
            hasValues = true
          }
        }
        if (hasValues) {
          await createOrUpdateIntegration(siteId, entry.type, config)
          saved++
        }
      }
      await loadIntegrations()
      if (saved > 0) {
        onSuccess?.('Integration settings saved')
      } else {
        onSuccess?.('No changes to save')
      }
    }

    doSave()
  }, [saveTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormChange = useCallback((type: string, key: string, value: string) => {
    setAllFormValues((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value },
    }))
  }, [])

  const getIntegration = (type: string): SiteIntegration | null => {
    return integrations.find((i) => i.integrationType ===type) ?? null
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.type}>
            <CardHeader>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-muted rounded animate-pulse w-24" />
                  {entry.type === 'stripe' && (
                    <div className="h-5 bg-muted rounded-full animate-pulse w-20" />
                  )}
                </div>
                <div className="h-3 bg-muted/60 rounded animate-pulse w-56" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {entry.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  {entry.type === 'stripe' && (field.key === 'secret_key' || field.key === 'sandbox_secret_key') && (
                    <div className="h-5 bg-muted rounded animate-pulse w-36" />
                  )}
                  <div className="h-4 bg-muted rounded animate-pulse w-44" />
                  <div className={field.key === 'mode'
                    ? "h-5 bg-muted rounded animate-pulse w-36"
                    : "h-10 bg-muted rounded animate-pulse w-full"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <IntegrationCard
          key={entry.type}
          entry={entry}
          integration={getIntegration(entry.type)}
          formValues={allFormValues[entry.type] || {}}
          onFormChange={handleFormChange}
        />
      ))}
    </div>
  )
}

// --- Settings Page ---

interface SiteEditPageProps {
  params: Promise<{
    siteId: string
  }>
}

const TABS = [
  { id: 'general', label: 'General Settings' },
  { id: 'style', label: 'Style' },
  { id: 'payments', label: 'Payments' },
  { id: 'email', label: 'Email' },
  { id: 'ai', label: 'AI Providers' },
  { id: 'seo', label: 'Integration' },
] as const

type TabId = (typeof TABS)[number]['id']

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value)
}

export default function SiteEditPage({ params }: SiteEditPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { siteId } = use(params)
  const { sites, currentSite, setCurrentSite } = useSiteSwitcher()
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const requestedTab = searchParams.get('tab')
    return isTabId(requestedTab) ? requestedTab : 'general'
  })
  const contextSite = sites.find((site) => site.id === siteId) || (currentSite?.id === siteId ? currentSite : null)
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [integrationSaveTrigger, setIntegrationSaveTrigger] = useState(0)

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

      if (activeTab === 'general' || activeTab === 'style') {
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
          }
        })

        if (error) {
          setError(error)
          return
        }

        if (data) {
          setSite(prev => prev ? { ...prev, ...data } : null)
          if (currentSite?.id === siteId) {
            setCurrentSite({ ...currentSite, ...data })
          }
          showSuccess('Settings saved successfully')
        }
      } else {
        setIntegrationSaveTrigger((prev) => prev + 1)
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
      <StickyHeader navContent={<SiteSettingsHeaderNav siteId={siteId} activeSection="general" />} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: siteName || "Site", href: `/admin/sites/${siteId}/dashboard` },
              { label: "General Settings" },
            ]}
            actions={
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 text-sm font-medium">{saveMessage}</span>
                  </div>
                )}
                <Button
                  onClick={isSubmitting ? undefined : handleSaveClick}
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            }
          />

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="flex items-start gap-6">
            {/* Vertical tab list */}
            <nav className="ml-2 flex w-48 shrink-0 flex-col">
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

              {activeTab === 'payments' && (
                <IntegrationTab siteId={siteId} category="payments" saveTrigger={integrationSaveTrigger} onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'email' && (
                <IntegrationTab siteId={siteId} category="email" saveTrigger={integrationSaveTrigger} onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'ai' && (
                <IntegrationTab siteId={siteId} category="ai" saveTrigger={integrationSaveTrigger} onSuccess={showSuccess} onError={showError} />
              )}

              {activeTab === 'seo' && (
                <IntegrationTab siteId={siteId} category="seo" saveTrigger={integrationSaveTrigger} onSuccess={showSuccess} onError={showError} />
              )}

            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
