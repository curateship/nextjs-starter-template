"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "@/lib/navigation-client"
import Check from "lucide-react/dist/esm/icons/check.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import X from "lucide-react/dist/esm/icons/x.js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NewsletterEditorShell } from "@/components/admin/newsletter-builder/layout/NewsletterEditorShell"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "@/components/admin/newsletter-builder/config/useBlockEditor"
import { getTemplateById, updateTemplate } from "@/lib/actions/newsletters/template-actions"
import type { NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface PageProps {
  params: Promise<{ templateId: string }>
}

export default function TemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  const [template, setTemplate] = useState<NewsletterTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")

  const blockEditor = useBlockEditor()
  const setBlocks = blockEditor.setBlocks

  const loadTemplate = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await getTemplateById({ data: { templateId: templateId } })
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }
    setTemplate(data)
    setNameInput(data.name)
    setBlocks(parseBlocksFromJson(data.content_blocks || {}))
    setLoading(false)
  }, [setBlocks, templateId])

  useEffect(() => {
    loadTemplate()
  }, [loadTemplate])

  // Auto-save: a change to the blocks is written once the edits stop.
  const templateRef = useRef(template)
  templateRef.current = template
  const blocksRef = useRef(blockEditor.blocks)
  blocksRef.current = blockEditor.blocks
  const lastSavedBlocksJsonRef = useRef<string | null>(null)

  const { saveStatus, isSaving, scheduleSave, saveNow } = useAutoSave<typeof blockEditor.blocks>({
    save: async (nextBlocks) => {
      const currentTemplate = templateRef.current
      if (!currentTemplate) return { saved: true }

      const { data, error: saveError } = await updateTemplate({ data: { templateId: currentTemplate.id, updates: {
        content_blocks: blocksToJson(nextBlocks),
      } } })

      if (saveError) return { saved: false, reason: saveError }
      if (data) setTemplate(data)
      return { saved: true }
    }
  })

  const blocksJson = JSON.stringify(blockEditor.blocks)

  useEffect(() => {
    if (loading) {
      lastSavedBlocksJsonRef.current = null
      return
    }
    if (lastSavedBlocksJsonRef.current === null) {
      lastSavedBlocksJsonRef.current = blocksJson
      return
    }
    if (lastSavedBlocksJsonRef.current === blocksJson) return

    lastSavedBlocksJsonRef.current = blocksJson
    scheduleSave(blocksRef.current)
  }, [blocksJson, loading, scheduleSave])

  async function handleSaveName() {
    if (!template || !nameInput.trim()) return
    const { data, error: saveError } = await updateTemplate({ data: { templateId: template.id, updates: { name: nameInput.trim() } } })
    if (!saveError && data) {
      setTemplate(data)
    }
    setEditingName(false)
  }

  const renameActions = editingName ? (
    <div className="flex items-center gap-1">
      <Input
        value={nameInput}
        onChange={(event) => setNameInput(event.target.value)}
        className="h-8 w-48 text-sm"
        onKeyDown={(event) => {
          if (event.key === "Enter") handleSaveName()
          if (event.key === "Escape") {
            setEditingName(false)
            setNameInput(template?.name || "")
          }
        }}
        autoFocus
      />
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleSaveName}>
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => {
          setEditingName(false)
          setNameInput(template?.name || "")
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setEditingName(true)}
      title="Rename template"
    >
      <Pencil className="mr-1 h-3.5 w-3.5" />
      Rename
    </Button>
  )

  return (
    <NewsletterEditorShell
      loading={loading}
      error={error}
      showError={Boolean(error && !template)}
      errorBackLabel="Back to Templates"
      onErrorBack={() => router.push("/admin/newsletters/templates")}
      blocks={blockEditor.blocks}
      selectedBlock={blockEditor.selectedBlock}
      onSelectBlock={blockEditor.setSelectedBlock}
      onDeleteBlock={blockEditor.handleDeleteBlock}
      onReorderBlocks={blockEditor.handleReorderBlocks}
      onAddBlocks={blockEditor.handleAddBlocks}
      updateBlockContent={blockEditor.updateBlockContent}
      onSaveSelectedBlock={async (content) => {
        const updatedBlocks = blockEditor.replaceSelectedBlockContent(content)
        if (!updatedBlocks) return false
        // The dialog closes on this, so it writes now rather than leaving the
        // edit sitting in the debounce.
        lastSavedBlocksJsonRef.current = JSON.stringify(updatedBlocks)
        return saveNow(updatedBlocks)
      }}
      siteId={currentSite?.id || ""}
      saveStatus={saveStatus}
      isSaving={isSaving}
      headerActions={renameActions}
    />
  )
}
