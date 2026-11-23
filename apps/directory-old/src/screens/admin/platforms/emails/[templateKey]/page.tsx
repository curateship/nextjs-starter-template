"use client"

import { useEffect, useRef, useState, use } from "react"
import { useRouter } from "@/lib/navigation-client"
import Monitor from "lucide-react/dist/esm/icons/monitor.js"
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js"
import Tablet from "lucide-react/dist/esm/icons/tablet.js"
import { Button } from "@/components/ui/button"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { blocksToJson, parseBlocksFromJson, useBlockEditor } from "@/components/admin/newsletter-builder/config/useBlockEditor"
import { NewsletterPreviewPane } from "@/components/admin/newsletter-builder/layout/NewsletterPreviewPane"
import { NewsletterBlockEditor } from "@/components/admin/newsletter-builder/layout/NewsletterBlockEditor"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent, DashboardModalFormFooter } from "@/components/admin/layout/dashboard/modals"
import {
  getSystemEmailEditorAction,
  saveSystemEmailTemplateAction,
} from "@/lib/actions/email/system-email-actions"
import type { SystemEmailEditorData } from "@/lib/actions/email/system-email"

interface PageProps {
  params: Promise<{ templateKey: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

function isGlobalTemplateKey(templateKey: string) {
  return templateKey === "password_reset" || templateKey === "email_verification" || templateKey === "email_change_confirmation"
}

export default function SystemEmailBuilderPage({ params }: PageProps) {
  const { templateKey } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<SystemEmailEditorData | null>(null)
  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(false)
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftSubject, setDraftSubject] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const blockEditor = useBlockEditor()
  const requiresSiteContext = !isGlobalTemplateKey(templateKey)
  const selectedBlock = blockEditor.selectedBlock

  useEffect(() => {
    if (requiresSiteContext && !currentSite?.id) {
      return
    }

    let cancelled = false

    async function loadTemplate() {
      setLoading(true)
      setError(null)

      const result = await getSystemEmailEditorAction({ data: { templateKeyInput: templateKey, siteId: currentSite?.id } })
      if (cancelled) return

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to load system email template')
        setLoading(false)
        return
      }

      setTemplate(result.data.template)
      blockEditor.setBlocks(parseBlocksFromJson(result.data.template.content_blocks || {}))
      setLoading(false)
    }

    void loadTemplate()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id, requiresSiteContext, templateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(template?.subject || "")
  }, [selectedBlock, template?.subject])

  const templateRef = useRef(template)
  templateRef.current = template
  const blocksRef = useRef(blockEditor.blocks)
  blocksRef.current = blockEditor.blocks
  const lastSavedJsonRef = useRef<string | null>(null)

  // Auto-save: the subject line and the blocks are written once the edits stop.
  const { saveStatus, isSaving, scheduleSave, saveNow } = useAutoSave<{
    blocks: ReturnType<typeof useBlockEditor>["blocks"]
    subject: string
  }>({
    save: async (draft) => {
      const current = templateRef.current
      if (!current) return { saved: true }

      const result = await saveSystemEmailTemplateAction({ data: { input: {
        templateKey: current.template_key,
        siteId: current.site_id,
        subject: draft.subject,
        contentBlocks: blocksToJson(draft.blocks),
        fromName: current.from_name,
        replyTo: current.reply_to,
      } } })

      if (!result.success) return { saved: false, reason: result.error || "Failed to save" }
      return { saved: true }
    }
  })

  const watchedJson = JSON.stringify({ blocks: blockEditor.blocks, subject: template?.subject || "" })

  useEffect(() => {
    if (loading || !template) {
      lastSavedJsonRef.current = null
      return
    }
    if (lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = watchedJson
      return
    }
    if (lastSavedJsonRef.current === watchedJson) return

    lastSavedJsonRef.current = watchedJson
    scheduleSave({ blocks: blocksRef.current, subject: templateRef.current?.subject || "" })
  }, [loading, scheduleSave, template, watchedJson])

  function handleCloseBlockEditor() {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    setDraftSubject(template?.subject || "")
    blockEditor.setSelectedBlock(null)
  }

  async function handleSaveBlockEditor() {
    const updatedBlocks = blockEditor.replaceSelectedBlockContent(draftContent)
    if (!updatedBlocks) return

    setIsSavingBlock(true)
    setTemplate((current) => (current ? { ...current, subject: draftSubject } : current))
    // The dialog closes on this, so it writes now rather than leaving the edit
    // sitting in the debounce.
    lastSavedJsonRef.current = JSON.stringify({ blocks: updatedBlocks, subject: draftSubject })
    const saved = await saveNow({ blocks: updatedBlocks, subject: draftSubject })
    setIsSavingBlock(false)

    if (saved) {
      blockEditor.setSelectedBlock(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
                <div className="p-5 space-y-3">
                </div>
              </div>
            </div>
          </div>
          <div className="w-[250px] p-2.5">
            <div className="space-y-1">
              {[1, 2, 3].map((index) => (
                <div key={index} className="p-3">
                  <div className="flex items-center space-x-2">
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || 'Template not found'}</p>
            <Button onClick={() => router.push('/admin/platforms/emails')} variant="outline">
              Back to Platform Emails
            </Button>
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
                    title="Desktop"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={previewWidth === 'tablet' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none border-x"
                    onClick={() => setPreviewWidth('tablet')}
                    title="Tablet"
                  >
                    <Tablet className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={previewWidth === 'mobile' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0 rounded-l-none"
                    onClick={() => setPreviewWidth('mobile')}
                    title="Mobile"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            saveStatus={saveStatus}
            isSaving={isSaving}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <NewsletterPreviewPane
          selectedBlock={selectedBlock}
          blocks={blockEditor.blocks}
          emailWidth={PREVIEW_WIDTHS[previewWidth]}
          updateBlockContent={blockEditor.updateBlockContent}
          onSelectBlock={blockEditor.setSelectedBlock}
          siteId={currentSite?.id || ''}
          subject={template.subject}
          onSubjectChange={(value: string) => setTemplate((current) => current ? { ...current, subject: value } : current)}
        />

        {blockListOpen && (
          <BlockListPanel
            blockTypes={NEWSLETTER_BLOCK_TYPES}
            entityName="system email"
            deleting={null}
            blocks={blockEditor.blocks}
            selectedBlock={blockEditor.selectedBlock}
            onSelectBlock={blockEditor.setSelectedBlock}
            onDeleteBlock={blockEditor.handleDeleteBlock}
            onReorderBlocks={blockEditor.handleReorderBlocks}
            onAddBlock={() => setBlockModalOpen(true)}
            panelTitle="Blocks"
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
              className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
              title={`Edit ${selectedBlock.title}`}
              titleAccessory={
                <div className="flex items-center pr-10">
                  <ModalTabs />
                </div>
              }
              viewportClassName="[&_h3]:pt-4"
              footer={<DashboardModalFormFooter busy={isSavingBlock} cancelDisabled={isSavingBlock} form="email-block-editor-form" onCancel={handleCloseBlockEditor} submitLabel="Save" />}
            >
              <form
                noValidate
                id="email-block-editor-form"
                className="contents"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleSaveBlockEditor()
                }}
              >
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
              </form>
            </DashboardModalContent>
          </ModalTabsProvider>
        </Dialog>
      )}

      <BlockSelectionModal
        open={blockModalOpen}
        onOpenChange={setBlockModalOpen}
        onAddBlocks={blockEditor.handleAddBlocks}
        blockTypes={NEWSLETTER_BLOCK_TYPES}
        entityName="system email"
      />
    </div>
  )
}
