'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, Save } from 'lucide-react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SiteSettingsHeaderNav } from '@/components/admin/layout/settings/SiteSettingsHeaderNav'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/tailwind'
import { SiteAuditOverviewTab } from './SiteAuditOverviewTab'
import { ContentAuditTab } from './ContentAuditTab'
import { InternalLinksTab } from './InternalLinksTab'
import { AuditSettingsTab } from './AuditSettingsTab'
import { SiteToolsAdminSettingsTab } from './SiteToolsAdminSettingsTab'
import { SiteHealthTab } from './SiteHealthTab'
import { CronJobsTab } from './CronJobsTab'

const SEO_TABS = [
  { id: 'site-audit', label: 'Site Audit', searchPlaceholder: 'Search issues' },
  { id: 'content-audit', label: 'Content Audit', searchPlaceholder: 'Search content' },
  { id: 'internal-links', label: 'Internal Links', searchPlaceholder: 'Search links' },
  { id: 'seo-defaults', label: 'Defaults & Metadata', searchPlaceholder: undefined },
  { id: 'content-type-defaults', label: 'Content Type Defaults', searchPlaceholder: undefined },
  { id: 'dashboard-quick-links', label: 'Dashboard Quick Links', searchPlaceholder: undefined },
  { id: 'site-health', label: 'Site Health', searchPlaceholder: undefined },
  { id: 'cron-jobs', label: 'Cron Jobs', searchPlaceholder: 'Search cron jobs' },
] as const

type SeoTabId = (typeof SEO_TABS)[number]['id']

function getSeoTabId(value: string | null): SeoTabId | null {
  if (value === 'audit-settings') return 'seo-defaults'
  return SEO_TABS.some((tab) => tab.id === value) ? value as SeoTabId : null
}

interface SeoSettingsPageProps {
  siteId: string
}

export function SeoSettingsPage({ siteId }: SeoSettingsPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [settingsStatus, setSettingsStatus] = useState({ loading: true, saving: false })
  const [adminSettingsStatus, setAdminSettingsStatus] = useState({ loading: true, saving: false })
  const [healthLoading, setHealthLoading] = useState(true)
  const [cronLoading, setCronLoading] = useState(true)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const requestedTab = searchParams.get('tab')
  const activeTab = getSeoTabId(requestedTab) || 'site-audit'

  const selectTab = useCallback((tab: SeoTabId) => {
    if (tab === activeTab) return
    setSearchQuery('')
    router.replace(`/admin/sites/${siteId}/settings/site-tools?tab=${tab}`, { scroll: false })
  }, [activeTab, router, siteId])

  const activeTabConfig = SEO_TABS.find((tab) => tab.id === activeTab) || SEO_TABS[0]
  const search = activeTabConfig.searchPlaceholder
    ? {
        value: searchQuery,
        onValueChange: setSearchQuery,
        placeholder: activeTabConfig.searchPlaceholder,
      }
    : undefined
  const isAdminSettingsTab = activeTab === 'content-type-defaults' || activeTab === 'dashboard-quick-links'
  const activeSettingsStatus = isAdminSettingsTab ? adminSettingsStatus : settingsStatus
  const isHealthTab = activeTab === 'site-health' || activeTab === 'cron-jobs'
  const actions = activeTab === 'seo-defaults' || isAdminSettingsTab ? (
    <Button
      type="submit"
      form={isAdminSettingsTab ? 'site-tools-admin-settings-form' : 'seo-settings-form'}
      disabled={activeSettingsStatus.loading || activeSettingsStatus.saving}
      size="sm"
    >
      <Save className="mr-2 h-4 w-4" />
      {activeSettingsStatus.saving ? 'Saving...' : 'Save'}
    </Button>
  ) : isHealthTab ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setRefreshSignal((current) => current + 1)}
      disabled={activeTab === 'site-health' ? healthLoading : cronLoading}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${(activeTab === 'site-health' ? healthLoading : cronLoading) ? 'animate-spin' : ''}`} />
      Refresh
    </Button>
  ) : undefined

  return (
    <>
      <StickyHeader navContent={<SiteSettingsHeaderNav siteId={siteId} activeSection="site-tools" />} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: 'Site Tools' },
              { label: activeTabConfig.label },
            ]}
            search={search}
            actions={actions}
          />

          <div className="flex items-start gap-6">
            <nav className="ml-2 flex w-48 shrink-0 flex-col">
              {SEO_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    'rounded-md px-4 py-2.5 text-left text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1">
              {activeTab === 'site-audit' && <SiteAuditOverviewTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'content-audit' && <ContentAuditTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'internal-links' && <InternalLinksTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'seo-defaults' && <AuditSettingsTab siteId={siteId} onStatusChange={setSettingsStatus} />}
              {activeTab === 'content-type-defaults' && (
                <SiteToolsAdminSettingsTab
                  siteId={siteId}
                  mode="content-type-defaults"
                  onStatusChange={setAdminSettingsStatus}
                />
              )}
              {activeTab === 'dashboard-quick-links' && (
                <SiteToolsAdminSettingsTab
                  siteId={siteId}
                  mode="dashboard-quick-links"
                  onStatusChange={setAdminSettingsStatus}
                />
              )}
              {activeTab === 'site-health' && (
                <SiteHealthTab
                  refreshSignal={refreshSignal}
                  onLoadingChange={setHealthLoading}
                />
              )}
              {activeTab === 'cron-jobs' && (
                <CronJobsTab
                  searchQuery={searchQuery}
                  refreshSignal={refreshSignal}
                  onLoadingChange={setCronLoading}
                />
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
