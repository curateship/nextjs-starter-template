"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { IDLE_SAVE_STATUS, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { SiteDashboard } from "@/components/admin/layout/dashboard/SiteDashboard"
import { updateSiteAction, type Site } from "@/lib/actions/sites/site-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getSiteIntegrations, createOrUpdateIntegration } from "@/lib/actions/integrations/integration-actions"
import type { SiteIntegration } from "@/lib/actions/integrations/integration-actions"
import {
  INTEGRATION_REGISTRY,
  type IntegrationCategory,
  type IntegrationRegistryEntry
} from "@/lib/actions/integrations/types"
import { Card, CardGroup, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.js"
import CheckCircle from "lucide-react/dist/esm/icons/circle-check-big.js"
import Copy from "lucide-react/dist/esm/icons/copy.js"
import Eye from "lucide-react/dist/esm/icons/eye.js"
import EyeOff from "lucide-react/dist/esm/icons/eye-off.js"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js"
import Shield from "lucide-react/dist/esm/icons/shield.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"
import { cn } from "@/lib/utils/tailwind"
import { StylingSettingsCard } from "@/components/admin/layout/settings/StylingSettingsCard"
import { SiteAdminSettingsTab } from "@/components/admin/layout/settings/SiteAdminSettingsTab"
import { checkDomainHealth, type DomainHealth } from "@/lib/actions/newsletters/deliverability-actions"
import { normalizeContactColdEmailThreshold } from "@/lib/actions/newsletters/contact-filters"
import { SiteHealthTab } from "@/components/admin/seo-settings/SiteHealthTab"
import { DripSettingsFields, useDripSettings } from "@/components/admin/newsletter-builder/layout/DripSettingsFields"

// --- IntegrationCard ---

interface IntegrationCardProps {
  entry: IntegrationRegistryEntry
  integration: SiteIntegration | null
  formValues: Record<string, string>
  onFormChange: (type: string, key: string, value: string) => void
  siteId: string
}

function IntegrationCard({ entry, integration, formValues, onFormChange, siteId }: IntegrationCardProps) {
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("")
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false)

  const isConfigured = integration !== null
  const stripeMode = (formValues.mode || integration?.config?.mode) === "sandbox" ? "Sandbox" : "Live"
  const configuredSensitiveFields = integration?.configuredSensitiveFields ?? []
  const hasSavedWebhookSecret = configuredSensitiveFields.includes("webhook_secret")
  const enteredWebhookSecret = formValues.webhook_secret || ""
  const savedWebhookSecret =
    typeof integration?.config?.webhook_secret === "string" ? integration.config.webhook_secret : ""
  const webhookSecret = savedWebhookSecret || enteredWebhookSecret
  const webhookSlug =
    entry.type === "notion_marketplace" ? "notion-marketplace" : ""
  const webhookUrl =
    webhookSlug && webhookSecret && webhookBaseUrl
      ? `${webhookBaseUrl}/api/webhooks/${webhookSlug}?siteId=${encodeURIComponent(siteId)}&secret=${encodeURIComponent(webhookSecret)}`
      : ""
  const webhookUrlPreview = webhookUrl
    ? `${webhookBaseUrl}/api/webhooks/${webhookSlug}?siteId=${encodeURIComponent(siteId)}&secret=********`
    : ""
  const savedWebhookUrlPreview =
    webhookSlug && hasSavedWebhookSecret && webhookBaseUrl
      ? `${webhookBaseUrl}/api/webhooks/${webhookSlug}?siteId=${encodeURIComponent(siteId)}&secret=********`
      : ""

  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    setWebhookBaseUrl(configuredUrl || window.location.origin)
  }, [])

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

  const handleCopyWebhookUrl = async () => {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopiedWebhookUrl(true)
    setTimeout(() => setCopiedWebhookUrl(false), 2000)
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
              {entry.type === "stripe" && isConfigured && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stripeMode === "Sandbox" ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"}`}
                >
                  Using {stripeMode}
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">{entry.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {entry.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            {entry.type === "stripe" && field.key === "secret_key" && (
              <h3 className="pt-4 text-base font-semibold">Live Credentials</h3>
            )}
            {entry.type === "stripe" && field.key === "sandbox_secret_key" && (
              <h3 className="pt-4 text-base font-semibold">Sandbox Credentials</h3>
            )}
            <Label htmlFor={`${entry.type}-${field.key}`}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="relative">
              {entry.type === "stripe" && field.key === "mode" ? (
                <div className="flex h-10 items-center gap-2">
                  <Checkbox
                    id={`${entry.type}-${field.key}`}
                    checked={(formValues[field.key] || field.options?.[0]?.value || "") === "sandbox"}
                    onCheckedChange={(checked) => onFormChange(entry.type, field.key, checked ? "sandbox" : "live")}
                  />
                  <Label htmlFor={`${entry.type}-${field.key}`} className="cursor-pointer font-normal">
                    Use sandbox keys
                  </Label>
                </div>
              ) : field.type === "select" ? (
                <Select
                  value={formValues[field.key] || field.options?.[0]?.value || ""}
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
                  type={field.type === "password" && !revealedFields.has(field.key) ? "password" : field.type}
                  placeholder={
                    field.type === "password" && configuredSensitiveFields.includes(field.key)
                      ? "********"
                      : field.placeholder
                  }
                  value={formValues[field.key] || ""}
                  onChange={(e) => onFormChange(entry.type, field.key, e.target.value)}
                  className={
                    field.type === "password"
                      ? formValues[field.key]
                        ? "pr-10"
                        : configuredSensitiveFields.includes(field.key)
                          ? "pr-16"
                          : ""
                      : ""
                  }
                />
              )}
              {field.type === "password" && formValues[field.key] ? (
                <button
                  type="button"
                  onClick={() => toggleReveal(field.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {revealedFields.has(field.key) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              ) : field.type === "password" && configuredSensitiveFields.includes(field.key) ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  Saved
                </span>
              ) : null}
            </div>
            {entry.type === "stripe" && field.key === "mode" && (
              <p className="text-sm text-muted-foreground">
                Unchecked uses live keys for checkout payments and webhooks.
              </p>
            )}
          </div>
        ))}

        {entry.type === "notion_marketplace" && (
          <div className="space-y-2">
            <Label htmlFor={`${entry.type}-webhook-url`}>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id={`${entry.type}-webhook-url`}
                value={
                  webhookUrlPreview ||
                  savedWebhookUrlPreview ||
                  (hasSavedWebhookSecret
                    ? "********"
                    : "Save a webhook secret to generate the URL")
                }
                readOnly
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" onClick={handleCopyWebhookUrl} disabled={!webhookUrl}>
                <Copy className="mr-2 h-4 w-4" />
                {copiedWebhookUrl ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
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
        const integration = data.find((i) => i.integrationType === entry.type)
        values[entry.type] = {}
        for (const field of entry.fields) {
          values[entry.type][field.key] = integration?.config?.[field.key] || field.options?.[0]?.value || ""
        }
      }
      setAllFormValues(values)
    } catch (err) {
      console.error("Error loading integrations:", err)
      onError?.("Failed to load integrations")
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
        const config: Record<string, any> = {
          ...(existingIntegration?.config || {})
        }
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
        onSuccess?.("Integration settings saved")
      } else if (category !== "email") {
        onSuccess?.("No changes to save")
      }
    }

    doSave()
  }, [saveTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormChange = useCallback((type: string, key: string, value: string) => {
    setAllFormValues((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: value }
    }))
  }, [])

  const getIntegration = (type: string): SiteIntegration | null => {
    return integrations.find((i) => i.integrationType === type) ?? null
  }

  if (loading) {
    return (
      <CardGroup className="grid">
        {entries.map((entry) => (
          <Card key={entry.type}>
            <CardHeader>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-muted rounded animate-pulse w-24" />
                  {entry.type === "stripe" && <div className="h-5 bg-muted rounded-full animate-pulse w-20" />}
                </div>
                <div className="h-3 bg-muted/60 rounded animate-pulse w-56" />
              </div>
            </CardHeader>
            <CardContent>
              {entry.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  {entry.type === "stripe" && (field.key === "secret_key" || field.key === "sandbox_secret_key") && (
                    <div className="h-5 bg-muted rounded animate-pulse w-36" />
                  )}
                  <div className="h-4 bg-muted rounded animate-pulse w-44" />
                  <div
                    className={
                      field.key === "mode"
                        ? "h-5 bg-muted rounded animate-pulse w-36"
                        : "h-10 bg-muted rounded animate-pulse w-full"
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </CardGroup>
    )
  }

  return (
    <CardGroup className="grid">
      {entries.map((entry) => (
        <IntegrationCard
          key={entry.type}
          entry={entry}
          integration={getIntegration(entry.type)}
          formValues={allFormValues[entry.type] || {}}
          onFormChange={handleFormChange}
          siteId={siteId}
        />
      ))}
    </CardGroup>
  )
}

// --- EmailDomainHealthCard ---

function dnsStatusIcon(status: DomainHealth["spf"]) {
  if (status === "pass") return <CheckCircle className="h-4 w-4 text-green-600" />
  if (status === "fail") return <XCircle className="h-4 w-4 text-red-600" />
  return <AlertTriangle className="h-4 w-4 text-yellow-600" />
}

function dnsStatusBadge(status: DomainHealth["spf"]) {
  if (status === "pass") return <Badge className="bg-green-100 text-green-800">Pass</Badge>
  if (status === "fail") return <Badge variant="destructive">Fail</Badge>
  return <Badge className="bg-yellow-100 text-yellow-800">Missing</Badge>
}

function EmailDomainHealthCard({ siteId, refreshSignal }: { siteId: string; refreshSignal: number }) {
  const [domainHealth, setDomainHealth] = useState<DomainHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDomainHealth = useCallback(async () => {
    setLoading(true)
    const { data } = await checkDomainHealth(siteId)
    setDomainHealth(data)
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    void loadDomainHealth()
  }, [loadDomainHealth, refreshSignal])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Domain Health
            </CardTitle>
            <CardDescription className="mt-1">
              SPF, DKIM, and DMARC status for your Resend sender domain.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadDomainHealth} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        ) : domainHealth ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sending domain: <span className="font-medium text-foreground">{domainHealth.domain}</span>
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {(["spf", "dkim", "dmarc"] as const).map((record) => (
                <div key={record} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    {dnsStatusIcon(domainHealth[record])}
                    <span className="text-sm font-medium uppercase">{record}</span>
                  </div>
                  {dnsStatusBadge(domainHealth[record])}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Configure a from email in Resend settings to check domain health.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// --- Settings Page ---

const TABS = [
  { id: "general", label: "General Settings" },
  { id: "style", label: "Style" },
  { id: "payments", label: "Payments" },
  { id: "newsletters", label: "Newsletters" },
  { id: "email", label: "Email" },
  { id: "integrations", label: "Integrations" },
  { id: "cron-jobs", label: "Cron Jobs" },
  { id: "ai", label: "AI Providers" },
  { id: "sidebar", label: "Sidebar" },
  { id: "dashboard-quick-links", label: "Dashboard Quick Links" }
] as const

type TabId = (typeof TABS)[number]["id"]

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value)
}

export default function SiteEditPage() {
  const searchParams = useSearchParams()
  const { currentSite, loading: sitesLoading, setCurrentSite, sites } = useSiteSwitcher()
  const siteId = currentSite?.id ?? ""
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const requestedTab = searchParams.get("tab")
    return isTabId(requestedTab) ? requestedTab : "general"
  })
  const contextSite = currentSite
  const [site, setSite] = useState<Site | null>(contextSite as Site | null)
  const [siteName, setSiteName] = useState(contextSite?.name || "")
  const [subdomain, setSubdomain] = useState(contextSite?.subdomain || "")
  const [customDomain, setCustomDomain] = useState(contextSite?.custom_domain || "")
  const [status, setStatus] = useState<string>(contextSite?.status || "draft")
  const [siteTag, setSiteTag] = useState(contextSite?.settings?.site_tag || "")
  const [fontFamily, setFontFamily] = useState(contextSite?.settings?.font_family || "playfair-display")
  const [secondaryFontFamily, setSecondaryFontFamily] = useState(
    contextSite?.settings?.secondary_font_family || "inter"
  )
  const [favicon, setFavicon] = useState(contextSite?.settings?.favicon || "")
  const [trackingScripts, setTrackingScripts] = useState(contextSite?.settings?.tracking_scripts || "")
  const [customAnalyticsEnabled, setCustomAnalyticsEnabled] = useState(
    !!contextSite?.settings?.custom_analytics_enabled
  )
  const [listingWidgetsEnabled, setListingWidgetsEnabled] = useState(
    contextSite?.settings?.listing_widgets_enabled !== false
  )
  const [siteWidth, setSiteWidth] = useState<"full" | "custom">(contextSite?.settings?.site_width || "custom")
  const [customWidth, setCustomWidth] = useState<number | undefined>(contextSite?.settings?.custom_width)
  const [defaultTheme, setDefaultTheme] = useState<"system" | "light" | "dark">(
    contextSite?.settings?.default_theme || "system"
  )
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(!!contextSite?.settings?.maintenance?.enabled)
  const newsletterDripDefaults = useDripSettings(false, false)
  const loadNewsletterDripDefaults = newsletterDripDefaults.loadFromConfig
  const [coldThresholdEmails, setColdThresholdEmails] = useState(
    String(normalizeContactColdEmailThreshold(contextSite?.settings?.newsletter_cold_threshold_emails))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [adminSettingsStatus, setAdminSettingsStatus] = useState({
    loading: true,
    saving: false,
    saveStatus: IDLE_SAVE_STATUS
  })

  const [integrationSaveTrigger, setIntegrationSaveTrigger] = useState(0)
  const [domainHealthRefreshSignal, setDomainHealthRefreshSignal] = useState(0)
  const [cronJobsLoading, setCronJobsLoading] = useState(true)
  const [cronJobsRefreshSignal, setCronJobsRefreshSignal] = useState(0)
  const isAdminSettingsTab = activeTab === "sidebar" || activeTab === "dashboard-quick-links"
  const isCronJobsTab = activeTab === "cron-jobs"
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) || TABS[0]
  const headerSaveStatus = isAdminSettingsTab ? adminSettingsStatus.saveStatus : saveStatus
  const isCustomDomainVerificationError =
    activeTab === "general" && /^Add TXT record .+ with value .+ before using this domain$/.test(error || "")

  useEffect(() => {
    if (!contextSite) {
      setSite(null)
      return
    }

    setSite(contextSite as Site)
    setSiteName(contextSite.name || "")
    setSubdomain(contextSite.subdomain || "")
    setCustomDomain(contextSite.custom_domain || "")
    setStatus(contextSite.status || "draft")
    setSiteTag(contextSite.settings?.site_tag || "")
    setFontFamily(contextSite.settings?.font_family || "playfair-display")
    setSecondaryFontFamily(contextSite.settings?.secondary_font_family || "inter")
    setFavicon(contextSite.settings?.favicon || "")
    setTrackingScripts(contextSite.settings?.tracking_scripts || "")
    setCustomAnalyticsEnabled(!!contextSite.settings?.custom_analytics_enabled)
    setListingWidgetsEnabled(contextSite.settings?.listing_widgets_enabled !== false)
    setSiteWidth(contextSite.settings?.site_width || "custom")
    setCustomWidth(contextSite.settings?.custom_width)
    setDefaultTheme(contextSite.settings?.default_theme || "system")
    setMaintenanceEnabled(!!contextSite.settings?.maintenance?.enabled)
  }, [contextSite])

  useEffect(() => {
    if (site?.settings?.newsletter_drip_defaults) {
      loadNewsletterDripDefaults(site.settings.newsletter_drip_defaults)
    }
  }, [loadNewsletterDripDefaults, site?.settings?.newsletter_drip_defaults])

  useEffect(() => {
    setColdThresholdEmails(String(normalizeContactColdEmailThreshold(site?.settings?.newsletter_cold_threshold_emails)))
  }, [site?.settings?.newsletter_cold_threshold_emails])

  const showSuccess = useCallback((message: string) => {
    setSaveStatus("saved", message)
  }, [setSaveStatus])

  const showError = useCallback((message: string) => {
    setError(message)
    setSaveStatus("error", message)
  }, [setSaveStatus])

  const handleEmailIntegrationSuccess = useCallback(
    (message: string) => {
      showSuccess(message)
      setDomainHealthRefreshSignal((current) => current + 1)
    },
    [showSuccess]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSaveClick()
  }

  const handleSaveClick = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      setSaveStatus("saving")

      if (activeTab === "general" || activeTab === "style") {
        if (!siteName.trim()) {
          showError("Site name is required")
          return
        }

        const { data, error } = await updateSiteAction(siteId, {
          name: siteName.trim(),
          subdomain: subdomain.trim(),
          custom_domain: customDomain.trim() || null,
          status: status as "active" | "inactive" | "draft",
          settings: {
            ...site?.settings,
            site_title: site?.settings?.site_title || siteName.trim(),
            analytics_enabled: false,
            seo_enabled: true,
            site_tag: siteTag.trim() || undefined,
            maintenance: { enabled: maintenanceEnabled },
            font_family: fontFamily,
            secondary_font_family: secondaryFontFamily,
            favicon: favicon === "" ? "" : favicon || undefined,
            tracking_scripts: trackingScripts,
            custom_analytics_enabled: customAnalyticsEnabled,
            listing_widgets_enabled: listingWidgetsEnabled,
            site_width: siteWidth,
            custom_width: customWidth,
            default_theme: defaultTheme
          }
        })

        if (error) {
          showError(error)
          return
        }

        if (data) {
          setSite((prev) => (prev ? { ...prev, ...data } : null))
          setCustomDomain(data.custom_domain || "")
          if (currentSite?.id === siteId) {
            setCurrentSite({ ...currentSite, ...data })
          }
          showSuccess("Settings saved successfully")
        }
      } else if (activeTab === "newsletters") {
        const dripError = newsletterDripDefaults.validate()
        if (dripError) {
          showError(dripError)
          return
        }
        const coldThreshold = normalizeContactColdEmailThreshold(coldThresholdEmails)

        const { data, error } = await updateSiteAction(siteId, {
          settings: {
            ...site?.settings,
            newsletter_drip_defaults: newsletterDripDefaults.buildConfig(),
            newsletter_cold_threshold_emails: coldThreshold
          }
        })

        if (error) {
          showError(error)
          return
        }

        if (data) {
          setSite((prev) => (prev ? { ...prev, ...data } : null))
          if (currentSite?.id === siteId) {
            setCurrentSite({ ...currentSite, ...data })
          }
          showSuccess("Newsletter settings saved")
        }
      } else if (activeTab === "email") {
        setIntegrationSaveTrigger((prev) => prev + 1)
      } else {
        setIntegrationSaveTrigger((prev) => prev + 1)
      }
    } catch (err) {
      console.error("Error saving:", err)
      showError("Failed to save. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleHeaderSave = () => {
    if (isAdminSettingsTab) {
      const form = document.getElementById("site-admin-settings-form") as HTMLFormElement | null
      form?.requestSubmit()
      return
    }

    if (!isSubmitting) {
      void handleSaveClick()
    }
  }

  if (!siteId || !site) {
    return (
      <>
        <StickyHeader />
        <AdminLayout>
          {!sitesLoading && sites.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              Choose a site to manage settings.
            </div>
          ) : null}
        </AdminLayout>
      </>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[
              {
                label: siteName || "Site",
                href: `/admin/sites/${siteId}/dashboard`
              },
              { label: activeTabConfig.label }
            ]}
            saveStatus={!isCronJobsTab ? headerSaveStatus : null}
            isSaving={isAdminSettingsTab ? adminSettingsStatus.saving : isSubmitting}
            onSave={!isCronJobsTab ? handleHeaderSave : undefined}
            saveDisabled={isAdminSettingsTab ? adminSettingsStatus.loading : false}
            saveLabel="Save"
            savingLabel="Saving..."
            saveVariant="default"
            actions={isCronJobsTab ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={cronJobsLoading}
                  onClick={() => setCronJobsRefreshSignal((current) => current + 1)}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${cronJobsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            ) : undefined}
          />

          {error && !isCustomDomainVerificationError && (
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
                    activeTab === tab.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Tab content */}
            <div className="flex-1 min-w-0">
              {activeTab === "general" && (
                <form onSubmit={handleSubmit}>
                  <SiteDashboard
                    siteName={siteName}
                    subdomain={subdomain}
                    customDomain={customDomain}
                    status={status}
                    siteTag={siteTag}
                    trackingScripts={trackingScripts}
                    customAnalyticsEnabled={customAnalyticsEnabled}
                    listingWidgetsEnabled={listingWidgetsEnabled}
                    maintenanceEnabled={maintenanceEnabled}
                    customDomainError={error}
                    isEditMode={true}
                    loading={loading}
                    onSiteNameChange={setSiteName}
                    onSubdomainChange={setSubdomain}
                    onCustomDomainChange={setCustomDomain}
                    onStatusChange={setStatus}
                    onSiteTagChange={setSiteTag}
                    onTrackingScriptsChange={setTrackingScripts}
                    onCustomAnalyticsEnabledChange={setCustomAnalyticsEnabled}
                    onListingWidgetsEnabledChange={setListingWidgetsEnabled}
                    onMaintenanceChange={setMaintenanceEnabled}
                  />
                </form>
              )}

              {activeTab === "style" && (
                <div>
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

              {activeTab === "payments" && (
                <IntegrationTab
                  siteId={siteId}
                  category="payments"
                  saveTrigger={integrationSaveTrigger}
                  onSuccess={showSuccess}
                  onError={showError}
                />
              )}

              {activeTab === "newsletters" && (
                <CardGroup className="grid">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Default Drip Sending</CardTitle>
                      <CardDescription>
                        Used when creating new newsletters and automation emails.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DripSettingsFields form={newsletterDripDefaults} idPrefix="newsletter-defaults" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Cold Contact Threshold</CardTitle>
                      <CardDescription>
                        Contacts are marked cold when they have not opened this many recent emails.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-w-xs space-y-2">
                        <Label htmlFor="newsletter-cold-threshold">Emails without an open</Label>
                        <Input
                          id="newsletter-cold-threshold"
                          type="number"
                          min="1"
                          max="50"
                          step="1"
                          value={coldThresholdEmails}
                          onChange={(event) => setColdThresholdEmails(event.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </CardGroup>
              )}

              {activeTab === "email" && (
                <CardGroup className="grid">
                  <IntegrationTab
                    siteId={siteId}
                    category="email"
                    saveTrigger={integrationSaveTrigger}
                    onSuccess={handleEmailIntegrationSuccess}
                    onError={showError}
                  />
                  <EmailDomainHealthCard siteId={siteId} refreshSignal={domainHealthRefreshSignal} />
                </CardGroup>
              )}

              {activeTab === "integrations" && (
                <IntegrationTab
                  siteId={siteId}
                  category="integrations"
                  saveTrigger={integrationSaveTrigger}
                  onSuccess={showSuccess}
                  onError={showError}
                />
              )}

              {activeTab === "cron-jobs" && (
                <SiteHealthTab refreshSignal={cronJobsRefreshSignal} onLoadingChange={setCronJobsLoading} />
              )}

              {activeTab === "ai" && (
                <IntegrationTab
                  siteId={siteId}
                  category="ai"
                  saveTrigger={integrationSaveTrigger}
                  onSuccess={showSuccess}
                  onError={showError}
                />
              )}

              {activeTab === "sidebar" && (
                <SiteAdminSettingsTab siteId={siteId} mode="sidebar" onStatusChange={setAdminSettingsStatus} />
              )}

              {activeTab === "dashboard-quick-links" && (
                <SiteAdminSettingsTab
                  siteId={siteId}
                  mode="dashboard-quick-links"
                  onStatusChange={setAdminSettingsStatus}
                />
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
