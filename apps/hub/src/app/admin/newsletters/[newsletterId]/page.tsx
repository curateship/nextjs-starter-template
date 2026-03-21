"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/newsletter-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/newsletter-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/newsletter-builder/layout/BlockSelectionModal"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import { PublishNewsletterModal } from "@/components/admin/newsletter-builder/layout/PublishNewsletterModal"
import { useNewsletterBuilder } from "@/components/admin/newsletter-builder/config/useNewsletterBuilder"
import { pauseNewsletter, resumeNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { SaveAsTemplateModal } from "@/components/admin/newsletter-builder/layout/SaveAsTemplateModal"
import { useSiteContext } from "@/contexts/site-context"
import { Monitor, Tablet, Smartphone, Settings, Save, Pause, Play, AlertTriangle, Send, FileText } from "lucide-react"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

export default function NewsletterBuilderPage({ params }: PageProps) {
  const { newsletterId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteContext()

  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false)

  const builder = useNewsletterBuilder({ newsletterId })

  if (builder.loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
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
        <StickyHeader
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
      <StickyHeader
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

{/* Save as Template */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveAsTemplateOpen(true)}
            >
              <FileText className="w-4 h-4 mr-1" />
              Save as Template
            </Button>

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
            <span>
              {builder.newsletter.status === 'paused' ? 'Paused' : 'Drip sending'}: {builder.newsletter.total_sent}/{builder.newsletter.total_recipients} sent
              {builder.newsletter.metadata.drip_config.batches_sent > 0 && ` · ${builder.newsletter.metadata.drip_config.batches_sent} batches`}
              {builder.newsletter.metadata.drip_config.total_bounced > 0 && ` · ${builder.newsletter.metadata.drip_config.total_bounced} bounced`}
              {builder.newsletter.status === 'paused' && builder.newsletter.metadata.drip_config.paused_reason && (
                <span className="text-orange-600 ml-2">({builder.newsletter.metadata.drip_config.paused_reason})</span>
              )}
              {builder.newsletter.status === 'sending' && builder.newsletter.metadata.drip_config.next_batch_at && (
                <span className="text-muted-foreground ml-2">
                  · Next batch: {new Date(builder.newsletter.metadata.drip_config.next_batch_at).toLocaleTimeString()}
                </span>
              )}
            </span>
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
          updateBlockContent={builder.updateBlockContent}
          onSelectBlock={builder.setSelectedBlock}
          siteId={currentSite?.id || ''}
          subject={builder.subject}
          onSubjectChange={builder.setSubject}
        />

        {blockListOpen && (
          <BlockListPanel
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

      <SaveAsTemplateModal
        open={saveAsTemplateOpen}
        onOpenChange={setSaveAsTemplateOpen}
        blocks={builder.blocks}
        siteId={currentSite?.id || ''}
      />
    </div>
  )
}
