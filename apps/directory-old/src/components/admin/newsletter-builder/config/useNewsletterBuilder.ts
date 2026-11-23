import { useState, useEffect, useCallback, useRef } from "react"
import { getNewsletterById, updateNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { type SaveStatus } from "@/components/admin/layout/builder/save-status"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
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
  saveNow: () => Promise<boolean>
  saveSelectedBlockContent: (content: Record<string, any>, nextSubject?: string) => Promise<boolean>
  reloadNewsletter: () => Promise<void>
}

export function useNewsletterBuilder({ newsletterId }: UseNewsletterBuilderParams): UseNewsletterBuilderReturn {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [subject, setSubject] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockEditor = useBlockEditor()
  const setBlocks = blockEditor.setBlocks

  const loadNewsletter = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await getNewsletterById({ data: { newsletterId: newsletterId } })
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }
    setNewsletter(data)
    setSubject(data.subject || "")
    setBlocks(parseBlocksFromJson(data.content_blocks || {}))
    setLoading(false)
  }, [newsletterId, setBlocks])

  useEffect(() => {
    loadNewsletter()
  }, [loadNewsletter])

  const newsletterRef = useRef(newsletter)
  newsletterRef.current = newsletter
  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const blocksRef = useRef(blockEditor.blocks)
  blocksRef.current = blockEditor.blocks
  const lastSavedJsonRef = useRef<string | null>(null)

  // Auto-save: the subject line and the blocks are written once the edits stop.
  const { saveStatus, isSaving, scheduleSave, saveNow } = useAutoSave<{
    blocks: ReturnType<typeof useBlockEditor>['blocks']
    subject: string
  }>({
    save: async (draft) => {
      const current = newsletterRef.current
      if (!current) return { saved: true }

      const { data, error: saveError } = await updateNewsletter({ data: { newsletterId: current.id, updates: {
        subject: draft.subject,
        content_blocks: blocksToJson(draft.blocks)
      } } })

      if (saveError) return { saved: false, reason: saveError }
      if (data) setNewsletter(data)
      return { saved: true }
    }
  })

  const watchedJson = JSON.stringify({ blocks: blockEditor.blocks, subject })

  useEffect(() => {
    if (loading) {
      lastSavedJsonRef.current = null
      return
    }
    if (lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = watchedJson
      return
    }
    if (lastSavedJsonRef.current === watchedJson) return

    lastSavedJsonRef.current = watchedJson
    scheduleSave({ blocks: blocksRef.current, subject: subjectRef.current })
  }, [loading, scheduleSave, watchedJson])

  const flushSave = useCallback(
    () => saveNow({ blocks: blocksRef.current, subject: subjectRef.current }),
    [saveNow]
  )

  const saveSelectedBlockContent = async (content: Record<string, any>, nextSubject = subject) => {
    const updatedBlocks = blockEditor.replaceSelectedBlockContent(content)

    if (!updatedBlocks) {
      return false
    }

    // The block dialog closes on this, so it writes now rather than leaving the
    // edit sitting in the debounce.
    setSubject(nextSubject)
    lastSavedJsonRef.current = JSON.stringify({ blocks: updatedBlocks, subject: nextSubject })
    return saveNow({ blocks: updatedBlocks, subject: nextSubject })
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
    saveNow: flushSave,
    saveSelectedBlockContent,
    reloadNewsletter: loadNewsletter
  }
}
