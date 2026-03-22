"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StickyHeader } from "@/components/admin/newsletter-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/newsletter-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/shared/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/shared/BlockSelectionModal"
import { NEWSLETTER_BLOCK_TYPES } from "@/components/admin/newsletter-builder/config/newsletter-block-types"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "@/components/admin/newsletter-builder/config/useBlockEditor"
import { getTemplateById, updateTemplate } from "@/lib/actions/newsletters/template-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import { useSiteContext } from "@/contexts/site-context"
import { Monitor, Tablet, Smartphone, Save, Pencil, Check, X } from "lucide-react"

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
  const { currentSite } = useSiteContext()

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

  const blockEditor = useBlockEditor()

  useEffect(() => {
    loadTemplate()
  }, [templateId])

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
    setIsSaving(true)
    setSaveMessage("Saving...")

    const contentBlocks = blocksToJson(blockEditor.blocks)

    try {
      const { data, error: saveError } = await updateTemplate(template.id, {
        content_blocks: contentBlocks,
      })
      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setTemplate(data)
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return
    const { data, error: saveError } = await updateTemplate(template.id, { name: nameInput.trim() })
    if (!saveError && data) {
      setTemplate(data)
    }
    setEditingName(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters/templates", label: "Templates" },
            { label: "Loading...", isPage: true },
          ]}
          rightActions={
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            </div>
          }
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
        <StickyHeader
          breadcrumbItems={[
            { href: "/admin", label: "Dashboard" },
            { href: "/admin/newsletters/templates", label: "Templates" },
            { label: "Error", isPage: true },
          ]}
        />
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
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/newsletters/templates", label: "Templates" },
          { label: template?.name || "Editor", isPage: true },
        ]}
        rightActions={
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}

            {/* Template name inline edit */}
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

            {/* Save button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        }
        blockListOpen={blockListOpen}
        onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
      />

      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={blockEditor.selectedBlock}
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
            onPreview={() => blockEditor.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
          />
        )}
      </div>

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
