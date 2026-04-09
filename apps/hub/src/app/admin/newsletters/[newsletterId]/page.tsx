"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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
import { Monitor, Tablet, Smartphone, Settings, Save, Pause, Play, AlertTriangle, Send } from "lucide-react"

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

function formatDripStatus(newsletter: { status: string; total_sent: number; total_recipients: number; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config
  const parts = [`${newsletter.status === 'paused' ? 'Paused' : 'Drip sending'}: ${newsletter.total_sent}/${newsletter.total_recipients} sent`]

  if (dripConfig?.batches_sent > 0) {
    const label = dripConfig.batches_sent === 1 ? 'batch' : 'batches'
    parts.push(`${dripConfig.batches_sent} ${label}`)
  }

  if (dripConfig?.total_bounced > 0) {
    parts.push(`${dripConfig.total_bounced} bounced`)
  }

  if (newsletter.status === 'paused') {
    if (dripConfig?.paused_reason && dripConfig.paused_reason !== 'manual') {
      parts.push(dripConfig.paused_reason)
    }
    return parts.join(' · ')
  }

  if (!isWithinSendWindow(dripConfig)) {
    parts.push('Waiting for send window')
    return parts.join(' · ')
  }

  if (typeof dripConfig?.next_batch_at === 'string') {
    const nextBatchAt = new Date(dripConfig.next_batch_at)
    if (nextBatchAt > new Date()) {
      parts.push(`Next batch: ${nextBatchAt.toLocaleTimeString()}`)
    } else {
      parts.push('Waiting for next cron run')
    }
  }

  return parts.join(' · ')
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
        <div className={`px-4 py-2.5 flex items-center justify-between text-sm ${builder.newsletter.status === 'paused' ? 'bg-orange-50 border-b border-orange-200' : 'bg-blue-50 border-b border-blue-200'}`}>
          <div className="flex items-center gap-3">
            {builder.newsletter.status === 'paused' && <AlertTriangle className="h-4 w-4 text-orange-600" />}
            <span>{formatDripStatus(builder.newsletter)}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
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
              <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>
            ) : (
              <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>
            )}
          </Button>
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
