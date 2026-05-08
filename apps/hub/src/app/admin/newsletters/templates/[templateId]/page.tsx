"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NewsletterEditorShell } from "@/components/admin/newsletter-builder/layout/NewsletterEditorShell"
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
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")

  const blockEditor = useBlockEditor()
  const setBlocks = blockEditor.setBlocks

  const loadTemplate = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await getTemplateById(templateId)
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

  async function handleSave() {
    if (!template) return
    await persistTemplate(blockEditor.blocks)
  }

  async function persistTemplate(nextBlocks: ReturnType<typeof useBlockEditor>["blocks"]) {
    if (!template) return false
    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const { data, error: saveError } = await updateTemplate(template.id, {
        content_blocks: blocksToJson(nextBlocks),
      })
      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return false
      }

      if (data) {
        setTemplate(data)
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
        return true
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : "Failed to save"}`)
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
      loadingActionCount={2}
      loadingSidebarRows={3}
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
        return persistTemplate(updatedBlocks)
      }}
      siteId={currentSite?.id || ""}
      saveMessage={saveMessage}
      isSaving={isSaving}
      onSave={handleSave}
      headerActions={renameActions}
    />
  )
}
