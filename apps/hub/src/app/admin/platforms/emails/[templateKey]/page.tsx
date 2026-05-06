"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { Monitor, Smartphone, Tablet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { getPlatformEmailAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { blocksToJson, parseBlocksFromJson, useBlockEditor } from "@/components/admin/newsletter-builder/config/useBlockEditor"
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
import {
  getSystemEmailEditorAction,
  saveSystemEmailTemplateAction,
} from "@/lib/actions/email/system-email-actions"
import type { SystemEmailEditorData } from "@/lib/email/system-email"

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
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftSubject, setDraftSubject] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const blockEditor = useBlockEditor()
  const requiresSiteContext = !isGlobalTemplateKey(templateKey)
  const selectedBlock = blockEditor.selectedBlock
  const emailSettingsHref = currentSite?.id ? `/admin/sites/${currentSite.id}/settings?tab=email` : undefined

  useEffect(() => {
    if (requiresSiteContext && !currentSite?.id) {
      return
    }

    let cancelled = false

    async function loadTemplate() {
      setLoading(true)
      setError(null)

      const result = await getSystemEmailEditorAction(templateKey, currentSite?.id)
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

  async function handleSave() {
    if (!template) return

    await persistTemplate(blockEditor.blocks, template.subject)
  }

  async function persistTemplate(nextBlocks: ReturnType<typeof useBlockEditor>["blocks"], nextSubject: string) {
    if (!template) return false

    setIsSaving(true)
    setSaveMessage('Saving...')

    const result = await saveSystemEmailTemplateAction({
      templateKey: template.template_key,
      siteId: template.site_id,
      subject: nextSubject,
      contentBlocks: blocksToJson(nextBlocks),
      fromName: template.from_name,
      replyTo: template.reply_to,
    })

    if (!result.success) {
      setSaveMessage(`Error: ${result.error || 'Failed to save'}`)
      setIsSaving(false)
      return false
    }

    const refreshed = await getSystemEmailEditorAction(template.template_key, template.site_id)
    if (refreshed.success && refreshed.data) {
      setTemplate(refreshed.data.template)
      blockEditor.setBlocks(parseBlocksFromJson(refreshed.data.template.content_blocks || {}))
    }

    setSaveMessage('Saved!')
    setIsSaving(false)
    setTimeout(() => setSaveMessage(''), 3000)
    return true
  }

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
    const saved = await persistTemplate(updatedBlocks, draftSubject)
    setIsSavingBlock(false)

    if (saved) {
      blockEditor.setSelectedBlock(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={getPlatformEmailAdminTopNavLinks("templates", emailSettingsHref)} />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r bg-background overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-muted/30 p-8 h-full">
              <div className="mx-auto bg-white shadow-sm rounded-sm" style={{ maxWidth: 600 }}>
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
              {[1, 2, 3].map((index) => (
                <div key={index} className="p-3">
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

  if (error || !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader navLinks={getPlatformEmailAdminTopNavLinks("templates", emailSettingsHref)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || 'Template not found'}</p>
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
        navLinks={getPlatformEmailAdminTopNavLinks("templates", emailSettingsHref)}
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
            saveMessage={saveMessage}
            isSaving={isSaving}
            onSave={handleSave}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
          />
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        <NewsletterPreviewPane
          selectedBlock={selectedBlock}
          blocks={blockEditor.blocks}
          previewWidth={PREVIEW_WIDTHS[previewWidth]}
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
        onAddBlocks={blockEditor.handleAddBlocks}
        blockTypes={NEWSLETTER_BLOCK_TYPES}
        entityName="system email"
      />
    </div>
  )
}
