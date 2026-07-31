"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "@/lib/navigation-client"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { IDLE_SAVE_STATUS, type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { showErrorToast } from "@/lib/error-toast"
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
import { FieldLabel } from "@/components/ui/field-label"
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
import { AdminStylingSettingsTab } from "@/components/admin/layout/settings/AdminStylingSettingsTab"
import { checkDomainHealth, type DomainHealth } from "@/lib/actions/newsletters/deliverability-actions"
import { normalizeContactColdEmailThreshold } from "@/lib/actions/newsletters/contact-filters"
import { SiteHealthTab } from "@/components/admin/seo-settings/SiteHealthTab"
import { DripSettingsFields, useDripSettings } from "@/components/admin/newsletter-builder/layout/DripSettingsFields"

// --- IntegrationCard ---

interface IntegrationCardProps {
  entry: IntegrationRegistryEntry
  integration: SiteIntegration | null
  formValues: Record<string, string>
  onFormChange: (type: string, key: string, value: string, deferSave?: boolean) => void
  /** Keys and passwords are written when the box is left, not per keystroke. */
  onSecretCommit: (type: string) => void
  siteId: string
}

function IntegrationCard({ entry, integration, formValues, onFormChange, onSecretCommit, siteId }: IntegrationCardProps) {
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
    setWebhookBaseUrl(window.location.origin)
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
              {!isConfigured && <Badge variant="secondary">Not configured</Badge>}
              {entry.type === "stripe" && isConfigured && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stripeMode === "Sandbox" ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-900/30 dark:text-green-400"}`}
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
          <div key={field.key} className="grid gap-2">
            {entry.type === "stripe" && field.key === "secret_key" && (
              <h3 className="pt-4 text-base font-semibold">Live Credentials</h3>
            )}
            {entry.type === "stripe" && field.key === "sandbox_secret_key" && (
              <h3 className="pt-4 text-base font-semibold">Sandbox Credentials</h3>
            )}
            {entry.type === "stripe" && field.key === "mode" ? (
              <FieldLabel
                htmlFor={`${entry.type}-${field.key}`}
                hint="Unchecked uses live keys for checkout payments and webhooks."
              >
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </FieldLabel>
            ) : (
              <Label htmlFor={`${entry.type}-${field.key}`}>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
            )}
            <div className="relative">
              {entry.type === "stripe" && field.key === "mode" ? (
                <div className="flex items-center gap-2">
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
                  onChange={(e) => onFormChange(entry.type, field.key, e.target.value, field.type === "password")}
                  onBlur={field.type === "password" ? () => onSecretCommit(entry.type) : undefined}
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
          </div>
        ))}

        {entry.type === "notion_marketplace" && (
          <div className="grid gap-2">
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
  onStatusChange?: (status: { loading: boolean; saving: boolean; saveStatus: SaveStatus }) => void
  onSaved?: () => void
  onError?: (message: string) => void
}

function IntegrationTab({ siteId, category, onStatusChange, onSaved, onError }: IntegrationTabProps) {
  const [integrations, setIntegrations] = useState<SiteIntegration[]>([])
  const [loading, setLoading] = useState(true)
  // Form state lives here — keyed by integration type, then field key
  const [allFormValues, setAllFormValues] = useState<Record<string, Record<string, string>>>({})

  const entries = INTEGRATION_REGISTRY.filter((e) => e.category === category)
  const integrationsRef = useRef(integrations)
  integrationsRef.current = integrations
  const allFormValuesRef = useRef(allFormValues)
  allFormValuesRef.current = allFormValues
  // What the server already has, per integration, so tabbing through a field
  // without changing it doesn't write anything.
  const lastSavedValuesRef = useRef<Record<string, string>>({})
  const hasUnsavedValues = (type: string) =>
    JSON.stringify(allFormValuesRef.current[type] || {}) !== lastSavedValuesRef.current[type]

  // One integration is written at a time — the one that was edited.
  const { saveStatus, isSaving, scheduleSave, saveNow, markSaved } = useAutoSave<string>({
    save: async (type) => {
      const entry = INTEGRATION_REGISTRY.find((candidate) => candidate.type === type)
      if (!entry) return { saved: true }

      const formValues = allFormValuesRef.current[type] || {}
      const existing = integrationsRef.current.find((integration) => integration.integrationType === type)
      // Sensitive values come back from the server stripped, not masked, so
      // spreading the saved config can never write a placeholder over a real key.
      const config: Record<string, any> = { ...(existing?.config || {}) }
      // An integration nobody has filled in yet is left alone — otherwise
      // clicking through the boxes would turn "Not configured" into a
      // configured integration holding nothing.
      let hasValues = !!existing
      for (const field of entry.fields) {
        if (formValues[field.key]) {
          config[field.key] = formValues[field.key]
          hasValues = true
        }
      }
      if (!hasValues) return { saved: true }

      const saved = await createOrUpdateIntegration({ data: { siteId: siteId, integrationType: type, config: config } })
      lastSavedValuesRef.current[type] = JSON.stringify(formValues)
      setIntegrations((prev) => {
        const next = prev.filter((integration) => integration.integrationType !== type)
        return [...next, saved]
      })
      onSaved?.()
      return { saved: true }
    }
  })

  useEffect(() => {
    onStatusChange?.({ loading, saving: isSaving, saveStatus })
  }, [isSaving, loading, onStatusChange, saveStatus])

  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getSiteIntegrations({ data: { siteId: siteId } })
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
      lastSavedValuesRef.current = Object.fromEntries(
        Object.entries(values).map(([type, fields]) => [type, JSON.stringify(fields)])
      )
      markSaved()
    } catch (err) {
      console.error("Error loading integrations:", err)
      onError?.("Failed to load integrations")
    } finally {
      setLoading(false)
    }
  }, [siteId, category, markSaved, onError])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  const pendingTypeRef = useRef<string | null>(null)

  const handleFormChange = useCallback(
    (type: string, key: string, value: string, deferSave?: boolean) => {
      setAllFormValues((prev) => ({
        ...prev,
        [type]: { ...prev[type], [key]: value }
      }))
      // Keys and passwords wait for the box to be left (handleSecretCommit) —
      // a half-typed key is a broken integration on a live site.
      if (deferSave) return
      // Only one card can be waiting to save at a time, so moving to a
      // different one writes the first before it is forgotten.
      if (pendingTypeRef.current && pendingTypeRef.current !== type) {
        void saveNow()
      }
      pendingTypeRef.current = type
      scheduleSave(type)
    },
    [saveNow, scheduleSave]
  )

  const handleSecretCommit = useCallback(
    (type: string) => {
      // Leaving a key box that was never touched must not write anything.
      if (!hasUnsavedValues(type)) return
      void saveNow(type)
    },
    [saveNow]
  )

  const getIntegration = (type: string): SiteIntegration | null => {
    return integrations.find((i) => i.integrationType === type) ?? null
  }

  if (loading) return null

  return (
    <CardGroup className="grid">
      {entries.map((entry) => (
        <IntegrationCard
          key={entry.type}
          entry={entry}
          integration={getIntegration(entry.type)}
          formValues={allFormValues[entry.type] || {}}
          onFormChange={handleFormChange}
          onSecretCommit={handleSecretCommit}
          siteId={siteId}
        />
      ))}
    </CardGroup>
  )
}

// --- EmailDomainHealthCard ---

function dnsStatusIcon(status: DomainHealth["spf"]) {
  if (status === "pass") return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
  if (status === "fail") return <XCircle className="h-4 w-4 text-destructive" />
  return <AlertTriangle className="h-4 w-4 text-yellow-600" />
}

function dnsStatusBadge(status: DomainHealth["spf"]) {
  if (status === "pass") return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Pass</Badge>
  if (status === "fail") return <Badge variant="destructive">Fail</Badge>
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">Missing</Badge>
}

function EmailDomainHealthCard({ siteId, refreshSignal }: { siteId: string; refreshSignal: number }) {
  const [domainHealth, setDomainHealth] = useState<DomainHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDomainHealth = useCallback(async () => {
    setLoading(true)
    const { data } = await checkDomainHealth({ data: { siteId: siteId } })
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
        {loading ? null : domainHealth ? (
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
  { id: "styling", label: "Styling" }
] as const

type TabId = (typeof TABS)[number]["id"]

/** Everything the General and Style tabs write, captured at the moment of the edit. */
interface SiteDraft {
  siteId: string
  siteName: string
  subdomain: string
  customDomain: string
  status: string
  siteTag: string
  fontFamily: string
  secondaryFontFamily: string
  favicon: string
  trackingScripts: string
  customAnalyticsEnabled: boolean
  listingWidgetsEnabled: boolean
  siteWidth: "full" | "custom"
  customWidth: number | undefined
  defaultTheme: "system" | "light" | "dark"
  maintenanceEnabled: boolean
}

/** The same values, read straight off a site record. */
function buildSiteDraft(source: any, siteId: string): SiteDraft {
  return {
    siteId,
    siteName: source?.name || "",
    subdomain: source?.subdomain || "",
    customDomain: source?.custom_domain || "",
    status: source?.status || "draft",
    siteTag: source?.settings?.site_tag || "",
    fontFamily: source?.settings?.font_family || "playfair-display",
    secondaryFontFamily: source?.settings?.secondary_font_family || "inter",
    favicon: source?.settings?.favicon || "",
    trackingScripts: source?.settings?.tracking_scripts || "",
    customAnalyticsEnabled: !!source?.settings?.custom_analytics_enabled,
    listingWidgetsEnabled: source?.settings?.listing_widgets_enabled !== false,
    siteWidth: source?.settings?.site_width || "custom",
    customWidth: source?.settings?.custom_width,
    defaultTheme: source?.settings?.default_theme || "system",
    maintenanceEnabled: !!source?.settings?.maintenance?.enabled
  }
}

/**
 * What the auto-save watches. The two address fields are left out on purpose:
 * a half-typed site URL is a live web address and a half-typed domain fails its
 * DNS check, so those wait for the box to be left instead.
 */
function watchedSiteKey(draft: SiteDraft) {
  return JSON.stringify({ ...draft, subdomain: null, customDomain: null })
}

interface NewsletterDraft {
  siteId: string
  dripConfig: Record<string, any>
  coldThresholdEmails: string
}

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
  const [loading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adminSettingsStatus, setAdminSettingsStatus] = useState({
    loading: true,
    saving: false,
    saveStatus: IDLE_SAVE_STATUS
  })
  const [integrationStatus, setIntegrationStatus] = useState({
    loading: true,
    saving: false,
    saveStatus: IDLE_SAVE_STATUS
  })

  const [domainHealthRefreshSignal, setDomainHealthRefreshSignal] = useState(0)

  // Auto-save bookkeeping. `pendingSiteEditsRef` stops a save's own round trip
  // from re-filling boxes that have been typed in since; the `last…` refs hold
  // what the server already has, so nothing is written twice.
  const pendingSiteEditsRef = useRef<string | null>(null)
  const lastWatchedSiteJsonRef = useRef<string | null>(null)
  const lastAddressRef = useRef<string | null>(null)
  const lastWatchedNewsletterJsonRef = useRef<string | null>(null)
  const [cronJobsLoading, setCronJobsLoading] = useState(true)
  const [cronJobsRefreshSignal, setCronJobsRefreshSignal] = useState(0)
  const isAdminSettingsTab = activeTab === "sidebar"
  const isStylingTab = activeTab === "styling"
  // Both the Sidebar and Styling tabs persist through their own form + admin
  // settings status (shared state — only one tab is mounted at a time).
  const usesAdminSettingsStatus = isAdminSettingsTab || isStylingTab
  const isCronJobsTab = activeTab === "cron-jobs"
  const isIntegrationTab =
    activeTab === "payments" || activeTab === "email" || activeTab === "integrations" || activeTab === "ai"
  const isNewslettersTab = activeTab === "newsletters"
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) || TABS[0]

  useEffect(() => {
    if (!contextSite) {
      setSite(null)
      return
    }

    setSite(contextSite as Site)

    // An auto-save pushes the saved site back into the switcher, which lands
    // here. Re-filling the boxes from it would undo whatever was typed in the
    // meantime, so anything still waiting to be written wins — but only for the
    // site it was typed on. Switching sites always re-fills, or a failed save
    // would leave one site's values sitting in another site's boxes.
    if (pendingSiteEditsRef.current === contextSite.id) return

    // Record what is being loaded as already-saved before filling the boxes,
    // so switching sites never looks like an edit and writes it straight back.
    const loaded = buildSiteDraft(contextSite, contextSite.id)
    lastWatchedSiteJsonRef.current = watchedSiteKey(loaded)
    lastAddressRef.current = `${loaded.subdomain}|${loaded.customDomain}`
    setSiteName(loaded.siteName)
    setSubdomain(loaded.subdomain)
    setCustomDomain(loaded.customDomain)
    setStatus(loaded.status)
    setSiteTag(loaded.siteTag)
    setFontFamily(loaded.fontFamily)
    setSecondaryFontFamily(loaded.secondaryFontFamily)
    setFavicon(loaded.favicon)
    setTrackingScripts(loaded.trackingScripts)
    setCustomAnalyticsEnabled(loaded.customAnalyticsEnabled)
    setListingWidgetsEnabled(loaded.listingWidgetsEnabled)
    setSiteWidth(loaded.siteWidth)
    setCustomWidth(loaded.customWidth)
    setDefaultTheme(loaded.defaultTheme)
    setMaintenanceEnabled(loaded.maintenanceEnabled)
  }, [contextSite])

  useEffect(() => {
    if (site?.settings?.newsletter_drip_defaults) {
      loadNewsletterDripDefaults(site.settings.newsletter_drip_defaults)
    }
  }, [loadNewsletterDripDefaults, site?.settings?.newsletter_drip_defaults])

  useEffect(() => {
    setColdThresholdEmails(String(normalizeContactColdEmailThreshold(site?.settings?.newsletter_cold_threshold_emails)))
  }, [site?.settings?.newsletter_cold_threshold_emails])

  const showError = useCallback((message: string) => {
    showErrorToast(message)
  }, [])

  const handleEmailIntegrationSaved = useCallback(() => {
    setDomainHealthRefreshSignal((current) => current + 1)
  }, [])

  // --- Auto-save: the site's own fields (General and Style share them) ---

  const siteDraft: SiteDraft = {
    siteId,
    siteName,
    subdomain,
    customDomain,
    status,
    siteTag,
    fontFamily,
    secondaryFontFamily,
    favicon,
    trackingScripts,
    customAnalyticsEnabled,
    listingWidgetsEnabled,
    siteWidth,
    customWidth,
    defaultTheme,
    maintenanceEnabled
  }
  const watchedSiteJson = watchedSiteKey(siteDraft)
  const siteDraftRef = useRef(siteDraft)
  siteDraftRef.current = siteDraft
  const siteSettingsRef = useRef(site?.settings)
  siteSettingsRef.current = site?.settings
  const currentSiteRef = useRef(currentSite)
  currentSiteRef.current = currentSite

  const {
    saveStatus: siteSaveStatus,
    scheduleSave: scheduleSiteSave,
    saveNow: saveSiteNow,
    setSaveStatus: setSiteSaveStatus
  } = useAutoSave<SiteDraft>({
    blockedReason: (draft) => (draft.siteName.trim() ? null : "Not saved — add a site name"),
    save: async (draft) => {
      setError(null)

      const { data, error: saveError } = await updateSiteAction(draft.siteId, {
        name: draft.siteName.trim(),
        subdomain: draft.subdomain.trim(),
        custom_domain: draft.customDomain.trim() || null,
        status: draft.status as "active" | "inactive" | "draft",
        settings: {
          ...siteSettingsRef.current,
          site_title: siteSettingsRef.current?.site_title || draft.siteName.trim(),
          analytics_enabled: false,
          seo_enabled: true,
          site_tag: draft.siteTag.trim() || undefined,
          maintenance: { enabled: draft.maintenanceEnabled },
          font_family: draft.fontFamily,
          secondary_font_family: draft.secondaryFontFamily,
          favicon: draft.favicon === "" ? "" : draft.favicon || undefined,
          tracking_scripts: draft.trackingScripts,
          custom_analytics_enabled: draft.customAnalyticsEnabled,
          listing_widgets_enabled: draft.listingWidgetsEnabled,
          site_width: draft.siteWidth,
          custom_width: draft.customWidth,
          default_theme: draft.defaultTheme
        }
      })

      if (saveError) {
        // Kept in state as well as the toast: a domain that needs a TXT record
        // shows the record to copy underneath the field.
        setError(saveError)
        return { saved: false, reason: saveError }
      }

      if (data) {
        setSite((prev) => (prev ? { ...prev, ...data } : null))
        setCustomDomain(data.custom_domain || "")
        lastAddressRef.current = `${draft.subdomain}|${data.custom_domain || ""}`
        const cachedSite = currentSiteRef.current
        if (cachedSite?.id === draft.siteId) {
          setCurrentSite({ ...cachedSite, ...data })
        }
      }

      // Nothing typed while this was in flight, so the boxes may follow the
      // server again.
      if (JSON.stringify(siteDraftRef.current) === JSON.stringify(draft)) {
        pendingSiteEditsRef.current = null
      }
      return { saved: true }
    }
  })

  useEffect(() => {
    if (!site) return
    if (lastWatchedSiteJsonRef.current === null) {
      lastWatchedSiteJsonRef.current = watchedSiteJson
      return
    }
    if (lastWatchedSiteJsonRef.current === watchedSiteJson) return

    lastWatchedSiteJsonRef.current = watchedSiteJson
    pendingSiteEditsRef.current = siteDraftRef.current.siteId
    scheduleSiteSave(siteDraftRef.current)
  }, [scheduleSiteSave, site, watchedSiteJson])

  const handleAddressCommit = useCallback(() => {
    const draft = siteDraftRef.current
    const address = `${draft.subdomain}|${draft.customDomain}`
    if (lastAddressRef.current === null) {
      lastAddressRef.current = address
      return
    }
    if (lastAddressRef.current === address) return

    lastAddressRef.current = address
    pendingSiteEditsRef.current = draft.siteId
    void saveSiteNow(draft)
  }, [saveSiteNow])

  // --- Auto-save: the Newsletters tab ---

  const newsletterDripConfig = newsletterDripDefaults.buildConfig()
  const newsletterDraft: NewsletterDraft = {
    siteId,
    dripConfig: newsletterDripConfig,
    coldThresholdEmails
  }
  const newsletterDraftRef = useRef(newsletterDraft)
  newsletterDraftRef.current = newsletterDraft
  const validateDripRef = useRef(newsletterDripDefaults.validate)
  validateDripRef.current = newsletterDripDefaults.validate

  const { saveStatus: newsletterSaveStatus, scheduleSave: scheduleNewsletterSave } =
    useAutoSave<NewsletterDraft>({
      blockedReason: () => {
        const reason = validateDripRef.current()
        return reason ? `Not saved — ${reason.toLowerCase()}` : null
      },
      save: async (draft) => {
        // Loading a site fills these fields in, which looks like an edit. Only
        // a real difference from what the site already holds is written.
        const savedSettings = siteSettingsRef.current
        const unchanged =
          JSON.stringify(savedSettings?.newsletter_drip_defaults ?? null) ===
            JSON.stringify(draft.dripConfig) &&
          (savedSettings?.newsletter_cold_threshold_emails ?? null) ===
            normalizeContactColdEmailThreshold(draft.coldThresholdEmails)
        if (unchanged) return { saved: true }

        const { data, error: saveError } = await updateSiteAction(draft.siteId, {
          settings: {
            ...siteSettingsRef.current,
            newsletter_drip_defaults: draft.dripConfig,
            newsletter_cold_threshold_emails: normalizeContactColdEmailThreshold(draft.coldThresholdEmails)
          }
        })

        if (saveError) return { saved: false, reason: saveError }

        if (data) {
          setSite((prev) => (prev ? { ...prev, ...data } : null))
          const cachedSite = currentSiteRef.current
          if (cachedSite?.id === draft.siteId) {
            setCurrentSite({ ...cachedSite, ...data })
          }
        }
        return { saved: true }
      }
    })

  // The drip fields write straight into their own hook, so the save watches
  // the values rather than sitting on every change handler.
  const watchedNewsletterJson = JSON.stringify({ drip: newsletterDripConfig, cold: coldThresholdEmails })

  useEffect(() => {
    if (!site) return
    if (lastWatchedNewsletterJsonRef.current === null) {
      lastWatchedNewsletterJsonRef.current = watchedNewsletterJson
      return
    }
    if (lastWatchedNewsletterJsonRef.current === watchedNewsletterJson) return

    lastWatchedNewsletterJsonRef.current = watchedNewsletterJson
    scheduleNewsletterSave(newsletterDraftRef.current)
  }, [scheduleNewsletterSave, site, watchedNewsletterJson])

  const headerSaveStatus = usesAdminSettingsStatus
    ? adminSettingsStatus.saveStatus
    : isIntegrationTab
      ? integrationStatus.saveStatus
      : isNewslettersTab
        ? newsletterSaveStatus
        : siteSaveStatus

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
                href: `/admin/dashboard/${siteId}`
              },
              { label: activeTabConfig.label }
            ]}
            saveStatus={!isCronJobsTab ? headerSaveStatus : null}
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

          <CardGroup className="flex items-start">
            {/* Vertical tab list */}
            <Card className="w-48 shrink-0">
              <CardContent className="grid gap-0.5 p-2">
                <nav className="grid gap-0.5">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "text-left px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        activeTab === tab.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>

            {/* Tab content */}
            <div className="flex-1 min-w-0">
              {activeTab === "general" && (
                <form onSubmit={(event) => event.preventDefault()}>
                  <SiteDashboard
                    siteId={siteId}
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
                    onAddressFieldCommit={handleAddressCommit}
                    onSiteNameChange={setSiteName}
                    onSubdomainChange={setSubdomain}
                    onCustomDomainChange={setCustomDomain}
                    onStatusChange={setStatus}
                    onSiteTagChange={setSiteTag}
                    onTrackingScriptsChange={setTrackingScripts}
                    onCustomAnalyticsEnabledChange={setCustomAnalyticsEnabled}
                    onListingWidgetsEnabledChange={setListingWidgetsEnabled}
                    onMaintenanceChange={setMaintenanceEnabled}
                    onSaveStatus={setSiteSaveStatus}
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
                  onStatusChange={setIntegrationStatus}
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
                    onStatusChange={setIntegrationStatus}
                    onSaved={handleEmailIntegrationSaved}
                    onError={showError}
                  />
                  <EmailDomainHealthCard siteId={siteId} refreshSignal={domainHealthRefreshSignal} />
                </CardGroup>
              )}

              {activeTab === "integrations" && (
                <IntegrationTab
                  siteId={siteId}
                  category="integrations"
                  onStatusChange={setIntegrationStatus}
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
                  onStatusChange={setIntegrationStatus}
                  onError={showError}
                />
              )}

              {activeTab === "sidebar" && (
                <SiteAdminSettingsTab siteId={siteId} onStatusChange={setAdminSettingsStatus} />
              )}

              {activeTab === "styling" && (
                <AdminStylingSettingsTab onStatusChange={setAdminSettingsStatus} />
              )}
            </div>
          </CardGroup>
        </div>
      </AdminLayout>
    </>
  )
}
