"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Monitor, Smartphone, Tablet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { NEWSLETTER_BLOCK_TYPES } from "../config/newsletter-block-types"
import type { BlockSelection, NewsletterBlock } from "../config/useBlockEditor"
import { NewsletterBlockEditor } from "./NewsletterBlockEditor"
import { NewsletterPreviewPane } from "./NewsletterPreviewPane"

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

type PreviewWidth = keyof typeof PREVIEW_WIDTHS

interface NewsletterEditorShellProps {
  blocks: NewsletterBlock[]
  selectedBlock: NewsletterBlock | null
  onSelectBlock: (block: NewsletterBlock | null) => void
  onDeleteBlock: (block: NewsletterBlock) => void
  onReorderBlocks: (blocks: NewsletterBlock[]) => void
  onAddBlocks: (selections: BlockSelection[]) => void
  updateBlockContent: (blockId: string, field: string, value: any) => void
  onSaveSelectedBlock: (content: Record<string, any>, subject: string) => Promise<boolean>
  siteId: string
  loading: boolean
  error?: string | null
  showError: boolean
  errorBackLabel: string
  onErrorBack: () => void
  isSaving?: boolean
  saveMessage?: string | null
  onSave: () => void | Promise<void>
  subject?: string
  onSubjectChange?: (value: string) => void
  emailWidth?: number
  headerActions?: ReactNode
  topNotice?: ReactNode
  loadingActionCount?: number
  loadingSidebarRows?: number
  loadingContentRows?: number
  loadingShowHeader?: boolean
  onPublish?: () => void | Promise<void>
  renderSettingsModal?: (show: boolean, setShow: (show: boolean) => void) => ReactNode
  settingsDisabled?: boolean
}

function PreviewWidthControls({
  previewWidth,
  onPreviewWidthChange,
}: {
  previewWidth: PreviewWidth
  onPreviewWidthChange: (width: PreviewWidth) => void
}) {
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md border">
      <Button
        variant={previewWidth === "desktop" ? "default" : "ghost"}
        size="sm"
        className="h-8 w-8 rounded-r-none p-0"
        onClick={() => onPreviewWidthChange("desktop")}
        title="Desktop (600px)"
      >
        <Monitor className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={previewWidth === "tablet" ? "default" : "ghost"}
        size="sm"
        className="h-8 w-8 rounded-none border-x p-0"
        onClick={() => onPreviewWidthChange("tablet")}
        title="Tablet (480px)"
      >
        <Tablet className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={previewWidth === "mobile" ? "default" : "ghost"}
        size="sm"
        className="h-8 w-8 rounded-l-none p-0"
        onClick={() => onPreviewWidthChange("mobile")}
        title="Mobile (320px)"
      >
        <Smartphone className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function NewsletterEditorLoading({
  actionCount,
  contentRows,
  sidebarRows,
  showHeader,
}: {
  actionCount: number
  contentRows: number
  sidebarRows: number
  showHeader: boolean
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            rightActions={(
              <div className="flex items-center gap-2">
                {Array.from({ length: actionCount }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-8 rounded bg-muted animate-pulse ${index === 1 ? "w-8" : index === 2 ? "w-20" : "w-24"}`}
                  />
                ))}
              </div>
            )}
          />
        )}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <div className="h-full flex-1 overflow-y-auto bg-muted/30 p-8">
            <div className="mx-auto rounded-sm bg-white shadow-sm" style={{ maxWidth: 600 }}>
              {showHeader && (
                <div className="flex flex-col items-center p-5">
                  <div className="mb-3 h-16 w-16 animate-pulse rounded-lg bg-muted" />
                  <div className="h-6 w-40 animate-pulse rounded bg-muted" />
                </div>
              )}
              <div className="space-y-3 p-5">
                {Array.from({ length: contentRows }).map((_, index) => (
                  <div
                    key={index}
                    className="h-4 animate-pulse rounded bg-muted"
                    style={{ width: `${100 - Math.min(index, 4) * 12}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="w-[250px] p-2.5">
          <div className="mb-4 flex items-center justify-between px-5">
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-1">
            {Array.from({ length: sidebarRows }).map((_, index) => (
              <div key={index} className="p-3">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewsletterEditorError({
  message,
  backLabel,
  onBack,
}: {
  message: string
  backLabel: string
  onBack: () => void
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardStickyHeader />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-600">{message}</p>
          <Button onClick={onBack} variant="outline">{backLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export function NewsletterEditorShell({
  blocks,
  selectedBlock,
  onSelectBlock,
  onDeleteBlock,
  onReorderBlocks,
  onAddBlocks,
  updateBlockContent,
  onSaveSelectedBlock,
  siteId,
  loading,
  error,
  showError,
  errorBackLabel,
  onErrorBack,
  isSaving = false,
  saveMessage,
  onSave,
  subject,
  onSubjectChange,
  emailWidth = 600,
  headerActions,
  topNotice,
  loadingActionCount = 3,
  loadingSidebarRows = 4,
  loadingContentRows = 3,
  loadingShowHeader = false,
  onPublish,
  renderSettingsModal,
  settingsDisabled,
}: NewsletterEditorShellProps) {
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop")
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftSubject, setDraftSubject] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  useEffect(() => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(subject ?? "")
  }, [selectedBlock, subject])

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(subject ?? "")
    onSelectBlock(null)
  }

  const handleSaveBlockEditor = async () => {
    if (!selectedBlock) return

    setIsSavingBlock(true)
    const saved = await onSaveSelectedBlock(draftContent, draftSubject)
    setIsSavingBlock(false)

    if (saved) {
      onSelectBlock(null)
    }
  }

  if (loading) {
    return (
      <NewsletterEditorLoading
        actionCount={loadingActionCount}
        contentRows={loadingContentRows}
        sidebarRows={loadingSidebarRows}
        showHeader={loadingShowHeader}
      />
    )
  }

  if (showError) {
    return (
      <NewsletterEditorError
        message={error || "Not found"}
        backLabel={errorBackLabel}
        onBack={onErrorBack}
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            rightActions={(
              <div className="flex items-center gap-2">
                {headerActions}
                <PreviewWidthControls previewWidth={previewWidth} onPreviewWidthChange={setPreviewWidth} />
              </div>
            )}
            saveMessage={saveMessage}
            isSaving={isSaving}
            onSave={onSave}
            onPublish={onPublish}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={settingsDisabled}
            renderSettingsModal={renderSettingsModal}
          />
        )}
      />

      {topNotice}

      <div className="flex flex-1 overflow-hidden">
        <NewsletterPreviewPane
          selectedBlock={selectedBlock}
          blocks={blocks}
          previewWidth={PREVIEW_WIDTHS[previewWidth]}
          emailWidth={emailWidth}
          updateBlockContent={updateBlockContent}
          onSelectBlock={onSelectBlock}
          siteId={siteId}
          subject={subject}
          onSubjectChange={onSubjectChange}
        />

        {blockListOpen && (
          <BlockListPanel
            blockTypes={NEWSLETTER_BLOCK_TYPES}
            entityName="newsletter"
            deleting={null}
            blocks={blocks}
            selectedBlock={selectedBlock}
            onSelectBlock={onSelectBlock}
            onDeleteBlock={onDeleteBlock}
            onReorderBlocks={onReorderBlocks}
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

              <AdminModalBody className="min-h-0 flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full">
                  <div className="px-6 pb-0 pr-8 pt-6 [&_h3]:pt-4">
                    <NewsletterBlockEditor
                      block={selectedBlock}
                      content={draftContent}
                      onContentChange={handleDraftChange}
                      siteId={siteId}
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
        onAddBlocks={onAddBlocks}
        blockTypes={NEWSLETTER_BLOCK_TYPES}
        entityName="newsletter"
      />
    </div>
  )
}
