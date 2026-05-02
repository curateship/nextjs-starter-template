'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SiteSettingsHeaderNav } from '@/components/admin/layout/settings/SiteSettingsHeaderNav'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/tailwind'
import { SiteHealthTab } from './SiteHealthTab'
import { CronJobsTab } from './CronJobsTab'

const SITE_TOOL_TABS = [
  { id: 'site-health', label: 'Site Health', searchPlaceholder: undefined },
  { id: 'cron-jobs', label: 'Cron Jobs', searchPlaceholder: 'Search cron jobs' },
] as const

type SiteToolTabId = (typeof SITE_TOOL_TABS)[number]['id']

function getSiteToolTabId(value: string | null): SiteToolTabId | null {
  return SITE_TOOL_TABS.some((tab) => tab.id === value) ? value as SiteToolTabId : null
}

interface SiteToolsPageProps {
  siteId: string
}

export function SiteToolsPage({ siteId }: SiteToolsPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [healthLoading, setHealthLoading] = useState(true)
  const [cronLoading, setCronLoading] = useState(true)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const requestedTab = searchParams.get('tab')
  const activeTab = getSiteToolTabId(requestedTab) || 'site-health'

  const selectTab = useCallback((tab: SiteToolTabId) => {
    if (tab === activeTab) return
    setSearchQuery('')
    router.replace(`/admin/sites/${siteId}/settings/site-tools?tab=${tab}`, { scroll: false })
  }, [activeTab, router, siteId])

  const activeTabConfig = SITE_TOOL_TABS.find((tab) => tab.id === activeTab) || SITE_TOOL_TABS[0]
  const search = activeTabConfig.searchPlaceholder
    ? {
        value: searchQuery,
        onValueChange: setSearchQuery,
        placeholder: activeTabConfig.searchPlaceholder,
      }
    : undefined
  const isLoading = activeTab === 'site-health' ? healthLoading : cronLoading

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
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefreshSignal((current) => current + 1)}
                disabled={isLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          />

          <div className="flex items-start gap-6">
            <nav className="ml-2 flex w-48 shrink-0 flex-col">
              {SITE_TOOL_TABS.map((tab) => (
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
