"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { useAutomationEmailBuilder } from "@/components/admin/newsletter-builder/config/useAutomationEmailBuilder"
import { NewsletterPreviewPane } from "@/components/admin/newsletter-builder/layout/NewsletterPreviewPane"
import { NewsletterBlockEditor } from "@/components/admin/newsletter-builder/layout/NewsletterBlockEditor"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
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
import { Monitor, Tablet, Smartphone, ArrowLeft } from "lucide-react"

interface PageProps {
  params: Promise<{ automationId: string; stepId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

export default function AutomationEmailEditorPage({ params }: PageProps) {
  const { automationId, stepId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftSubject, setDraftSubject] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const builder = useAutomationEmailBuilder({ stepId, automationId })
  const selectedBlock = builder.selectedBlock

  useEffect(() => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(builder.subject)
  }, [selectedBlock, builder.subject])

  const handleBack = () => {
    router.push(`/admin/newsletters/automations/${automationId}`)
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
          rightActions={(
            <StickybarTopRightActions
              rightActions={(
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                </div>
              )}
            />
          )}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
                <div className="p-5 flex flex-col items-center">
                  <div className="w-16 h-16 bg-muted rounded-lg animate-pulse mb-3" />
                  <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                </div>
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                </div>
              </div>
            </div>
          </div>
          <div className="w-[250px] p-2.5">
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

  if (builder.error && !builder.step) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{builder.error}</p>
            <Button onClick={handleBack} variant="outline">Back to Automation</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
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
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <NewsletterPreviewPane
          selectedBlock={selectedBlock}
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
                      onContentChange={(field, value) => {
                        setDraftContent((current) => ({
                          ...current,
                          [field]: value,
                        }))
                      }}
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
    </div>
  )
}
