import { useState, useEffect } from "react"
import { getNewsletterById, updateNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "./useBlockEditor"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"

export type { NewsletterBlock } from "./useBlockEditor"

interface BlockSelection {
  type: string
  quantity: number
}

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
  saveMessage: string
  loading: boolean
  error: string | null
  updateBlockContent: ReturnType<typeof useBlockEditor>['updateBlockContent']
  handleDeleteBlock: ReturnType<typeof useBlockEditor>['handleDeleteBlock']
  handleReorderBlocks: ReturnType<typeof useBlockEditor>['handleReorderBlocks']
  handleAddBlocks: ReturnType<typeof useBlockEditor>['handleAddBlocks']
  handleSave: () => Promise<void>
  reloadNewsletter: () => Promise<void>
}

export function useNewsletterBuilder({ newsletterId }: UseNewsletterBuilderParams): UseNewsletterBuilderReturn {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [subject, setSubject] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
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

  const handleSave = async () => {
    if (!newsletter) return
    setIsSaving(true)
    setSaveMessage("Saving...")

    const contentBlocks = blocksToJson(blockEditor.blocks)

    try {
      const { data, error: saveError } = await updateNewsletter(newsletter.id, {
        subject,
        content_blocks: contentBlocks
      })
      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setNewsletter(data)
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

  return {
    newsletter,
    subject,
    setSubject,
    blocks: blockEditor.blocks,
    selectedBlock: blockEditor.selectedBlock,
    setSelectedBlock: blockEditor.setSelectedBlock,
    isSaving,
    saveMessage,
    loading,
    error,
    updateBlockContent: blockEditor.updateBlockContent,
    handleDeleteBlock: blockEditor.handleDeleteBlock,
    handleReorderBlocks: blockEditor.handleReorderBlocks,
    handleAddBlocks: blockEditor.handleAddBlocks,
    handleSave,
    reloadNewsletter: loadNewsletter
  }
}
