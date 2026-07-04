import { useState, useEffect } from "react"
import { getNewsletterById, updateNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "./useBlockEditor"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"

export type { NewsletterBlock } from "./useBlockEditor"

interface UseNewsletterBuilderParams {
  newsletterId: string
}

interface UseNewsletterBuilderReturn {
  newsletter: Newsletter | null
  subject: string
  setSubject: (value: string) => void
  blocks: ReturnType<typeof useBlockEditor>['blocks']
  selectedBlock: ReturnType<typeof useBlockEditor>['selectedBlock']
  setSelectedBlock: ReturnType<typeof useBlockEditor>['setSelectedBlock']
  isSaving: boolean
  saveStatus: SaveStatus
  loading: boolean
  error: string | null
  updateBlockContent: ReturnType<typeof useBlockEditor>['updateBlockContent']
  replaceSelectedBlockContent: ReturnType<typeof useBlockEditor>['replaceSelectedBlockContent']
  handleDeleteBlock: ReturnType<typeof useBlockEditor>['handleDeleteBlock']
  handleReorderBlocks: ReturnType<typeof useBlockEditor>['handleReorderBlocks']
  handleAddBlocks: ReturnType<typeof useBlockEditor>['handleAddBlocks']
  handleSave: () => Promise<void>
  saveSelectedBlockContent: (content: Record<string, any>, nextSubject?: string) => Promise<boolean>
  reloadNewsletter: () => Promise<void>
}

export function useNewsletterBuilder({ newsletterId }: UseNewsletterBuilderParams): UseNewsletterBuilderReturn {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [subject, setSubject] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockEditor = useBlockEditor()

  const loadNewsletter = async () => {
    setLoading(true)
    const { data, error: fetchError } = await getNewsletterById(newsletterId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }
    setNewsletter(data)
    setSubject(data.subject || "")
    blockEditor.setBlocks(parseBlocksFromJson(data.content_blocks || {}))
    setLoading(false)
  }

  useEffect(() => {
    loadNewsletter()
  }, [newsletterId])

  const persistNewsletter = async (nextBlocks: ReturnType<typeof useBlockEditor>['blocks'], nextSubject = subject) => {
    if (!newsletter) return false

    setIsSaving(true)
    setSaveStatus("saving")

    const contentBlocks = blocksToJson(nextBlocks)

    try {
      const { data, error: saveError } = await updateNewsletter(newsletter.id, {
        subject: nextSubject,
        content_blocks: contentBlocks
      })
      if (saveError) {
        setSaveStatus("error", saveError)
        return false
      }

      if (data) {
        setNewsletter(data)
        setSubject(nextSubject)
        setSaveStatus("saved")
        return true
      }
    } catch (err) {
      setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }

    return false
  }

  const handleSave = async () => {
    await persistNewsletter(blockEditor.blocks, subject)
  }

  const saveSelectedBlockContent = async (content: Record<string, any>, nextSubject = subject) => {
    const updatedBlocks = blockEditor.replaceSelectedBlockContent(content)

    if (!updatedBlocks) {
      return false
    }

    return persistNewsletter(updatedBlocks, nextSubject)
  }

  return {
    newsletter,
    subject,
    setSubject,
    blocks: blockEditor.blocks,
    selectedBlock: blockEditor.selectedBlock,
    setSelectedBlock: blockEditor.setSelectedBlock,
    isSaving,
    saveStatus,
    loading,
    error,
    updateBlockContent: blockEditor.updateBlockContent,
    replaceSelectedBlockContent: blockEditor.replaceSelectedBlockContent,
    handleDeleteBlock: blockEditor.handleDeleteBlock,
    handleReorderBlocks: blockEditor.handleReorderBlocks,
    handleAddBlocks: blockEditor.handleAddBlocks,
    handleSave,
    saveSelectedBlockContent,
    reloadNewsletter: loadNewsletter
  }
}
