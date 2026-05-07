"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "@/components/admin/newsletter-builder/config/useBlockEditor"
import { NewsletterPreviewPane } from "@/components/admin/newsletter-builder/layout/NewsletterPreviewPane"
import { NewsletterBlockEditor } from "@/components/admin/newsletter-builder/layout/NewsletterBlockEditor"
import { getTemplateById, updateTemplate } from "@/lib/actions/newsletters/template-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
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
import { Monitor, Tablet, Smartphone, Pencil, Check, X } from "lucide-react"

interface PageProps {
  params: Promise<{ templateId: string }>
}

const PREVIEW_WIDTHS = {
  desktop: 600,
  tablet: 480,
  mobile: 320,
} as const

export default function TemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<NewsletterTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [previewWidth, setPreviewWidth] = useState<keyof typeof PREVIEW_WIDTHS>('desktop')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  const blockEditor = useBlockEditor()
  const selectedBlock = blockEditor.selectedBlock

  useEffect(() => {
    loadTemplate()
  }, [templateId])

  useEffect(() => {
    if (!selectedBlock) return
    setDraftContent(selectedBlock.content)
  }, [selectedBlock])

  async function loadTemplate() {
    setLoading(true)
    const { data, error: fetchError } = await getTemplateById(templateId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }
    setTemplate(data)
    setNameInput(data.name)
    blockEditor.setBlocks(parseBlocksFromJson(data.content_blocks || {}))
    setLoading(false)
  }

  async function handleSave() {
    if (!template) return
    await persistTemplate(blockEditor.blocks)
  }

  async function persistTemplate(nextBlocks: ReturnType<typeof useBlockEditor>["blocks"]) {
    if (!template) return false
    setIsSaving(true)
    setSaveMessage("Saving...")

    const contentBlocks = blocksToJson(nextBlocks)

    try {
      const { data, error: saveError } = await updateTemplate(template.id, {
        content_blocks: contentBlocks,
      })
      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return false
      } else if (data) {
        setTemplate(data)
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
        return true
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }

    return false
  }

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return
    const { data, error: saveError } = await updateTemplate(template.id, { name: nameInput.trim() })
    if (!saveError && data) {
      setTemplate(data)
    }
    setEditingName(false)
  }

  function handleCloseBlockEditor() {
    if (!selectedBlock) return

    setDraftContent(selectedBlock.content)
    blockEditor.setSelectedBlock(null)
  }

  async function handleSaveBlockEditor() {
    const updatedBlocks = blockEditor.replaceSelectedBlockContent(draftContent)
    if (!updatedBlocks) return

    setIsSavingBlock(true)
    const saved = await persistTemplate(updatedBlocks)
    setIsSavingBlock(false)

    if (saved) {
      blockEditor.setSelectedBlock(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader
          rightActions={(
            <StickybarTopRightActions
              rightActions={(
                <div className="flex items-center gap-2">
                  <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                </div>
              )}
            />
          )}
        />
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
              {[1, 2, 3].map((i) => (
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

  if (error && !template) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <DashboardStickyHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/admin/newsletters/templates")} variant="outline">Back to Templates</Button>
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
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="h-8 w-48 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') { setEditingName(false); setNameInput(template?.name || "") }
                      }}
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSaveName}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingName(false); setNameInput(template?.name || "") }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingName(true)}
                    title="Rename template"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Rename
                  </Button>
                )}

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
        />

        {blockListOpen && (
          <BlockListPanel
            blockTypes={NEWSLETTER_BLOCK_TYPES}
            entityName="newsletter"
            deleting={null}
            blocks={blockEditor.blocks}
            selectedBlock={blockEditor.selectedBlock}
            onSelectBlock={blockEditor.setSelectedBlock}
            onDeleteBlock={blockEditor.handleDeleteBlock}
            onReorderBlocks={blockEditor.handleReorderBlocks}
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
        entityName="newsletter"
      />
    </div>
  )
}
