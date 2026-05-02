'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, Save } from 'lucide-react'
import { AdminLayout } from '@/components/admin/layout/admin-layout'
import { DashboardSubheader } from '@/components/admin/layout/dashboard/DashboardSubheader'
import { StickyHeader } from '@/components/admin/layout/stickybar/StickyHeader'
import { SiteSettingsHeaderNav } from '@/components/admin/layout/settings/SiteSettingsHeaderNav'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/tailwind'
import { SiteAuditOverviewTab } from './SiteAuditOverviewTab'
import { ContentAuditTab } from './ContentAuditTab'
import { InternalLinksTab } from './InternalLinksTab'
import { SeoSettingsFormTab } from './SeoSettingsFormTab'
import { SearchPreviewTab } from './SearchPreviewTab'

const SEO_METADATA_FORM_ID = 'seo-metadata-form'
const SEO_TECHNICAL_FORM_ID = 'seo-technical-form'

const SEO_TABS = [
  { id: 'metadata', label: 'Metadata', searchPlaceholder: undefined },
  { id: 'search-preview', label: 'Search Preview', searchPlaceholder: undefined },
  { id: 'site-audit', label: 'Site Audit', searchPlaceholder: 'Search issues' },
  { id: 'content-audit', label: 'Content Audit', searchPlaceholder: 'Search content' },
  { id: 'internal-links', label: 'Internal Links', searchPlaceholder: 'Search links' },
  { id: 'technical', label: 'Technical', searchPlaceholder: undefined },
] as const

type SeoTabId = (typeof SEO_TABS)[number]['id']

function getSeoTabId(value: string | null): SeoTabId | null {
  if (value === 'overview') return 'site-audit'
  if (value === 'seo-defaults' || value === 'audit-settings') return 'metadata'
  return SEO_TABS.some((tab) => tab.id === value) ? value as SeoTabId : null
}

interface SeoSettingsPageProps {
  siteId: string
}

export function SeoSettingsPage({ siteId }: SeoSettingsPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [metadataStatus, setMetadataStatus] = useState({ loading: true, saving: false, message: null as string | null })
  const [technicalStatus, setTechnicalStatus] = useState({ loading: true, saving: false, message: null as string | null })
  const requestedTab = searchParams.get('tab')
  const activeTab = getSeoTabId(requestedTab) || 'metadata'

  const selectTab = useCallback((tab: SeoTabId) => {
    if (tab === activeTab) return
    setSearchQuery('')
    router.replace(`/admin/sites/${siteId}/settings/seo?tab=${tab}`, { scroll: false })
  }, [activeTab, router, siteId])

  const activeTabConfig = SEO_TABS.find((tab) => tab.id === activeTab) || SEO_TABS[0]
  const search = activeTabConfig.searchPlaceholder
    ? {
        value: searchQuery,
        onValueChange: setSearchQuery,
        placeholder: activeTabConfig.searchPlaceholder,
      }
    : undefined
  const isMetadataTab = activeTab === 'metadata'
  const isTechnicalTab = activeTab === 'technical'
  const activeSettingsStatus = isMetadataTab ? metadataStatus : technicalStatus
  const actions = isMetadataTab || isTechnicalTab ? (
    <div className="flex items-center gap-2">
      {activeSettingsStatus.message && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">{activeSettingsStatus.message}</span>
        </div>
      )}
      <Button
        type="submit"
        form={isMetadataTab ? SEO_METADATA_FORM_ID : SEO_TECHNICAL_FORM_ID}
        disabled={activeSettingsStatus.loading || activeSettingsStatus.saving}
        size="sm"
      >
        <Save className="mr-2 h-4 w-4" />
        {activeSettingsStatus.saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  ) : undefined

  return (
    <>
      <StickyHeader navContent={<SiteSettingsHeaderNav siteId={siteId} activeSection="seo" />} />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader
            items={[
              { label: 'SEO' },
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
              {activeTab === 'metadata' && (
                <SeoSettingsFormTab
                  siteId={siteId}
                  mode="metadata"
                  formId={SEO_METADATA_FORM_ID}
                  onStatusChange={setMetadataStatus}
                />
              )}
              {activeTab === 'search-preview' && <SearchPreviewTab siteId={siteId} />}
              {activeTab === 'site-audit' && <SiteAuditOverviewTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'content-audit' && <ContentAuditTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'internal-links' && <InternalLinksTab siteId={siteId} searchQuery={searchQuery} />}
              {activeTab === 'technical' && (
                <SeoSettingsFormTab
                  siteId={siteId}
                  mode="technical"
                  formId={SEO_TECHNICAL_FORM_ID}
                  onStatusChange={setTechnicalStatus}
                />
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </>
  )
}
