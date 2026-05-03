"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { NewsletterSettingsModal } from "@/components/admin/newsletter-builder/layout/NewsletterSettingsModal"
import { PublishNewsletterModal } from "@/components/admin/newsletter-builder/layout/PublishNewsletterModal"
import { useNewsletterBuilder } from "@/components/admin/newsletter-builder/config/useNewsletterBuilder"
import { NewsletterPreviewPane } from "@/components/admin/newsletter-builder/layout/NewsletterPreviewPane"
import { NewsletterBlockEditor } from "@/components/admin/newsletter-builder/layout/NewsletterBlockEditor"
import { pauseNewsletter, resumeNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { getNewsletterAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { Monitor, Tablet, Smartphone, Pause, Play } from "lucide-react"
import { formatNewsletterSendWindows, isWithinNewsletterSendWindow } from "@/lib/newsletters/send-windows"

interface PageProps {
  params: Promise<{ newsletterId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

function getDripStatusLabel(newsletter: { status: string; metadata?: Record<string, any> }) {
  const dripConfig = newsletter.metadata?.drip_config

  if (newsletter.status === 'paused') return 'Paused'
  if (!isWithinNewsletterSendWindow(dripConfig)) return `Waiting for ${formatNewsletterSendWindows(dripConfig, 'send')}`

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
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftSubject, setDraftSubject] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const builder = useNewsletterBuilder({ newsletterId })
  const newsletterSettingsHref = currentSite?.id ? `/admin/sites/${currentSite.id}/settings/newsletters` : undefined
  const newsletterNavLinks = getNewsletterAdminTopNavLinks("newsletters", newsletterSettingsHref)
  const selectedBlock = builder.selectedBlock

  useEffect(() => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(builder.subject)
  }, [selectedBlock, builder.subject])

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(builder.subject)
    builder.setSelectedBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock) return

    setIsSavingBlock(true)
    const saved = await builder.saveSelectedBlockContent(draftContent, draftSubject)
    setIsSavingBlock(false)

    if (saved) {
      builder.setSelectedBlock(null)
    }
  }

  if (builder.loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader
          navLinks={newsletterNavLinks}
          rightActions={(
            <StickybarTopRightActions
              rightActions={(
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                </div>
              )}
            />
          )}
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
      <DashboardStickyHeader
        navLinks={newsletterNavLinks}
        rightActions={(
          <StickybarTopRightActions
            rightActions={(
              <div className="flex items-center gap-2">
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
              </div>
            )}
            saveMessage={builder.saveMessage}
            isSaving={builder.isSaving}
            onSave={builder.handleSave}
            onPublish={builder.newsletter && builder.newsletter.status !== 'sent' && builder.newsletter.status !== 'sending' && builder.newsletter.status !== 'paused'
              ? async () => {
                  await builder.handleSave()
                  setPublishModalOpen(true)
                }
              : undefined}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!builder.newsletter}
            renderSettingsModal={(show, setShow) => (
              <NewsletterSettingsModal
                open={show}
                onOpenChange={setShow}
                newsletter={builder.newsletter}
                siteId={currentSite?.id || ''}
                onSuccess={() => {
                  builder.reloadNewsletter()
                  setShow(false)
                }}
              />
            )}
          />
        )}
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
        <NewsletterPreviewPane
          selectedBlock={selectedBlock}
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
            onAddBlock={() => setBlockModalOpen(true)}
          />
        )}
      </div>

      {selectedBlock && (
        <Dialog
          open={!!selectedBlock}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseBlockEditor()
            }
          }}
        >
          <ModalTabsProvider>
            <AdminModalContent size="wide" className="h-[calc(100vh-4rem)] max-h-[820px]">
              <AdminModalHeader>
                <div className="flex min-w-0 items-center gap-4 pr-10">
                  <AdminModalTitle className="shrink-0">Edit {selectedBlock.title}</AdminModalTitle>
                  <ModalTabs />
                </div>
              </AdminModalHeader>

              <AdminModalBody className="flex-1 min-h-0 overflow-hidden p-0">
                <ScrollArea className="h-full">
                  <div className="px-6 pt-6 pb-0 pr-8 [&_h3]:pt-4">
                    <NewsletterBlockEditor
                      block={selectedBlock}
                      content={draftContent}
                      onContentChange={handleDraftChange}
                      siteId={currentSite?.id || ""}
                      subject={draftSubject}
                      onSubjectChange={setDraftSubject}
                    />
                  </div>
                </ScrollArea>
              </AdminModalBody>

              <AdminModalFooter className="sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCloseBlockEditor} disabled={isSavingBlock}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveBlockEditor} disabled={isSavingBlock}>
                  {isSavingBlock ? "Saving..." : "Save"}
                </Button>
              </AdminModalFooter>
            </AdminModalContent>
          </ModalTabsProvider>
        </Dialog>
      )}

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={builder.handleAddBlocks}
        blockTypes={NEWSLETTER_BLOCK_TYPES}
        entityName="newsletter"
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
