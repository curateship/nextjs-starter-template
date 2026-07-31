"use client"

import { useEffect, useState, type ReactNode } from "react"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import type { SaveStatus } from "@/components/admin/layout/builder/save-status"
import { NEWSLETTER_BLOCK_TYPES } from "../config/newsletter-block-types"
import type { BlockSelection, NewsletterBlock } from "../config/useBlockEditor"
import { NewsletterBlockEditor } from "./NewsletterBlockEditor"
import { NewsletterPreviewPane } from "./NewsletterPreviewPane"

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
  saveStatus?: SaveStatus | null
  subject?: string
  onSubjectChange?: (value: string) => void
  emailWidth?: number
  headerActions?: ReactNode
  topNotice?: ReactNode
  onPublish?: () => void | Promise<void>
  renderSettingsModal?: (show: boolean, setShow: (show: boolean) => void) => ReactNode
  settingsDisabled?: boolean
}

function NewsletterEditorLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardStickyHeader />
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
          <p className="mb-4 text-destructive">{message}</p>
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
  saveStatus,
  subject,
  onSubjectChange,
  emailWidth = 600,
  headerActions,
  topNotice,
  onPublish,
  renderSettingsModal,
  settingsDisabled,
}: NewsletterEditorShellProps) {
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
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
      <NewsletterEditorLoading />
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
              </div>
            )}
            saveStatus={saveStatus}
            isSaving={isSaving}
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
              <DashboardModalContent
                busy={isSavingBlock}
                title={`Edit ${selectedBlock.title}`}
                titleAccessory={<ModalTabs />}
                className="max-w-[960px]"
                footer={
                  <>
                  <Button type="button" variant="outline" onClick={handleCloseBlockEditor} disabled={isSavingBlock}>
                    Cancel
                  </Button>
                  <Button form="newsletter-block-editor-form" type="submit" disabled={isSavingBlock}>
                    {isSavingBlock ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save
                  </Button>
                </>
                }
              >
              <form
                noValidate
                id="newsletter-block-editor-form"
                className="contents"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSaveBlockEditor()
                }}
              >
                <NewsletterBlockEditor
                  block={selectedBlock}
                  content={draftContent}
                  onContentChange={handleDraftChange}
                  siteId={siteId}
                  subject={draftSubject}
                  onSubjectChange={setDraftSubject}
                />
              </form>
            </DashboardModalContent>
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
