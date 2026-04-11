"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BuilderToolbar } from "@/components/admin/shared/BuilderToolbar"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/newsletter-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import { PublishNewsletterModal } from "@/components/admin/newsletter-builder/layout/PublishNewsletterModal"
import { useNewsletterBuilder } from "@/components/admin/newsletter-builder/config/useNewsletterBuilder"
import { pauseNewsletter, resumeNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/dashboard/admin-top-nav-links"
import { Monitor, Tablet, Smartphone, Settings, Save, Pause, Play, Send } from "lucide-react"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

function isWithinSendWindow(dripConfig: Record<string, any> | undefined) {
  if (!dripConfig?.send_window_start || !dripConfig?.send_window_end) return true

  const tz = dripConfig.send_window_timezone || 'America/New_York'
  const localizedNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const currentMinutes = localizedNow.getHours() * 60 + localizedNow.getMinutes()
  const [startH, startM] = dripConfig.send_window_start.split(':').map(Number)
  const [endH, endM] = dripConfig.send_window_end.split(':').map(Number)
  const windowStart = startH * 60 + startM
  const windowEnd = endH * 60 + endM

  return currentMinutes >= windowStart && currentMinutes < windowEnd
}

function formatSendWindow(dripConfig: Record<string, any> | undefined) {
  if (!dripConfig?.send_window_start || !dripConfig?.send_window_end) return 'send'

  const formatTime = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const displayHour = hours % 12 || 12

    if (minutes === 0) return `${displayHour}${period}`
    return `${displayHour}:${String(minutes).padStart(2, '0')}${period}`
  }

  return `${formatTime(dripConfig.send_window_start)} - ${formatTime(dripConfig.send_window_end)}`
}

function getDripStatusLabel(newsletter: { status: string; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config

  if (newsletter.status === 'paused') return 'Paused'
  if (!isWithinSendWindow(dripConfig)) return `Waiting for ${formatSendWindow(dripConfig)}`

  if (typeof dripConfig?.next_batch_at === 'string') {
    const nextBatchAt = new Date(dripConfig.next_batch_at)
    if (nextBatchAt > new Date()) {
      return `Next batch: ${nextBatchAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    }
    return 'Waiting for cron'
  }

  return 'Drip sending'
}

function getDripRowChips(newsletter: { total_sent: number; total_recipients: number; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config
  const batchesSent = dripConfig?.batches_sent || 0
  const totalBounced = dripConfig?.total_bounced || 0
  const batchLabel = batchesSent === 1 ? 'batch' : 'batches'

  return [
    {
      key: 'sent',
      label: `${newsletter.total_sent} of ${newsletter.total_recipients} sent`,
      className: 'bg-muted/40 text-muted-foreground',
    },
    {
      key: 'batches',
      label: `${batchesSent} ${batchLabel}`,
      className: 'bg-muted/40 text-muted-foreground',
    },
    {
      key: 'bounced',
      label: `${totalBounced} bounced`,
      className: 'border-red-200 bg-red-50 text-red-700',
    },
  ]
}

export default function NewsletterBuilderPage({ params }: PageProps) {
  const { newsletterId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [publishModalOpen, setPublishModalOpen] = useState(false)

  const builder = useNewsletterBuilder({ newsletterId })
  const newsletterNavLinks = getNewsletterAdminTopNavLinks("newsletters")

  if (builder.loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={newsletterNavLinks} />
        <BuilderToolbar
          className="top-16 z-40"
          showSidebarToggle={false}
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters", label: "Newsletters" },
            { label: "Loading...", isPage: true },
          ]}
          rightActions={
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-8 w-8 bg-muted rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            </div>
          }
        />
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel skeleton */}
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
                {/* Header skeleton */}
                <div className="p-5 flex flex-col items-center">
                  <div className="w-16 h-16 bg-muted rounded-lg animate-pulse mb-3" />
                  <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                </div>
                {/* Content skeleton */}
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                </div>
                {/* Divider skeleton */}
                <div className="py-5 px-5">
                  <div className="h-px bg-muted animate-pulse" />
                </div>
                {/* Footer skeleton */}
                <div className="p-5 flex flex-col items-center">
                  <div className="h-3 w-32 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-48 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
          {/* Right panel skeleton */}
          <div className="w-[250px] p-2.5">
            <div className="flex items-center justify-between mb-4 px-5">
              <div className="h-6 w-16 bg-muted rounded animate-pulse" />
            </div>
            <div className="space-y-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (builder.error && !builder.newsletter) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={newsletterNavLinks} />
        <BuilderToolbar
          className="top-16 z-40"
          showSidebarToggle={false}
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters", label: "Newsletters" },
            { label: "Error", isPage: true },
          ]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{builder.error}</p>
            <Button onClick={() => router.push("/admin/newsletters")} variant="outline">Back to Newsletters</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader navLinks={newsletterNavLinks} />
      <BuilderToolbar
        className="top-16 z-40"
        showSidebarToggle={false}
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters", label: "Newsletters" },
          { label: builder.newsletter?.subject || "Builder", isPage: true },
        ]}
        rightActions={
          <div className="flex items-center gap-2">
            {/* Save message */}
            {builder.saveMessage && (
              <span className={`text-sm ${builder.saveMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {builder.saveMessage}
              </span>
            )}

            {/* Responsive toggle */}
            <div className="flex items-center border rounded-md h-8 overflow-hidden">
              <Button
                variant={previewWidth === 'desktop' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-r-none"
                onClick={() => setPreviewWidth('desktop')}
                title="Desktop (600px)"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={previewWidth === 'tablet' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-none border-x"
                onClick={() => setPreviewWidth('tablet')}
                title="Tablet (480px)"
              >
                <Tablet className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={previewWidth === 'mobile' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0 rounded-l-none"
                onClick={() => setPreviewWidth('mobile')}
                title="Mobile (320px)"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Settings */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsModalOpen(true)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Settings
            </Button>

            {/* Save button */}
            <Button
              variant="outline"
              size="sm"
              onClick={builder.handleSave}
              disabled={builder.isSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>

            {/* Publish button */}
            {builder.newsletter && builder.newsletter.status !== 'sent' && builder.newsletter.status !== 'sending' && builder.newsletter.status !== 'paused' && (
              <Button
                size="sm"
                onClick={async () => {
                  await builder.handleSave()
                  setPublishModalOpen(true)
                }}
                disabled={builder.isSaving}
              >
                <Send className="w-4 h-4 mr-1" />
                Publish
              </Button>
            )}

          </div>
        }
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
      />

      {/* Drip progress / paused alert bar */}
      {builder.newsletter && (builder.newsletter.status === 'sending' || builder.newsletter.status === 'paused') && builder.newsletter.metadata?.drip_config?.enabled && (
        <div className={`flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden border-b px-4 py-2.5 text-sm ${builder.newsletter.status === 'paused' ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
          <button
            type="button"
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors ${builder.newsletter.status === 'sending' ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'}`}
            onClick={async () => {
              if (builder.newsletter!.status === 'sending') {
                await pauseNewsletter(builder.newsletter!.id)
              } else {
                await resumeNewsletter(builder.newsletter!.id)
              }
              builder.reloadNewsletter()
            }}
          >
            {builder.newsletter.status === 'sending' ? (
              <><Pause className="h-3 w-3" /> Pause</>
            ) : (
              <><Play className="h-3 w-3" /> Resume</>
            )}
          </button>
          <Badge variant="outline" className="h-6 shrink-0 bg-background px-2 text-xs font-medium">
            {getDripStatusLabel(builder.newsletter)}
          </Badge>
          {getDripRowChips(builder.newsletter).map((chip) => (
            <Badge key={chip.key} variant="outline" className={`h-6 shrink-0 px-2 text-xs font-normal ${chip.className}`}>
              {chip.label}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builder.selectedBlock}
          blocks={builder.blocks}
          previewWidth={PREVIEW_WIDTHS[previewWidth]}
          emailWidth={builder.newsletter?.metadata?.maxWidth || 600}
          updateBlockContent={builder.updateBlockContent}
          onSelectBlock={builder.setSelectedBlock}
          siteId={currentSite?.id || ''}
          subject={builder.subject}
          onSubjectChange={builder.setSubject}
        />

        {blockListOpen && (
          <BlockListPanel
            blockTypes={NEWSLETTER_BLOCK_TYPES}
            entityName="newsletter"
            deleting={null}
            blocks={builder.blocks}
            selectedBlock={builder.selectedBlock}
            onSelectBlock={builder.setSelectedBlock}
            onDeleteBlock={builder.handleDeleteBlock}
            onReorderBlocks={builder.handleReorderBlocks}
            onPreview={() => builder.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
          />
        )}
      </div>

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={builder.handleAddBlocks}
        blockTypes={NEWSLETTER_BLOCK_TYPES}
        entityName="newsletter"
      />

      <NewsletterSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        newsletter={builder.newsletter}
        siteId={currentSite?.id || ''}
        onSuccess={(updated) => {
          builder.reloadNewsletter()
          setSettingsModalOpen(false)
        }}
      />

      <PublishNewsletterModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        newsletter={builder.newsletter}
        siteId={currentSite?.id || ''}
        onSuccess={(updated) => {
          builder.reloadNewsletter()
          setPublishModalOpen(false)
        }}
      />
    </div>
  )
}
