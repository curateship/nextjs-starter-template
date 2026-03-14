import { useState, useEffect } from "react"
import { getNewsletterById, updateNewsletter } from "@/lib/actions/newsletters/newsletter-actions"
import { getBlockTypeDefinition } from "./newsletter-block-types"
import type { Newsletter } from "@/lib/actions/newsletters/newsletter-actions"

export interface NewsletterBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockSelection {
  type: string
  quantity: number
}

interface UseNewsletterBuilderParams {
  newsletterId: string
}

interface UseNewsletterBuilderReturn {
  newsletter: Newsletter | null
  blocks: NewsletterBlock[]
  selectedBlock: NewsletterBlock | null
  setSelectedBlock: (block: NewsletterBlock | null) => void
  isSaving: boolean
  saveMessage: string
  loading: boolean
  error: string | null
  updateBlockContent: (blockId: string, field: string, value: any) => void
  handleDeleteBlock: (block: NewsletterBlock) => void
  handleReorderBlocks: (blocks: NewsletterBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSave: () => Promise<void>
  reloadNewsletter: () => Promise<void>
}

export function useNewsletterBuilder({ newsletterId }: UseNewsletterBuilderParams): UseNewsletterBuilderReturn {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<NewsletterBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNewsletter = async () => {
    setLoading(true)
    const { data, error: fetchError } = await getNewsletterById(newsletterId)
    if (fetchError || !data) {
      setError(fetchError || "Not found")
      setLoading(false)
      return
    }
    setNewsletter(data)

    // Parse content_blocks into blocks array
    const contentBlocks = data.content_blocks || {}
    const parsed: NewsletterBlock[] = Object.values(contentBlocks)
      .filter((b: any) => b.id && b.type)
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((b: any) => ({
        id: b.id,
        type: b.type,
        title: getBlockTypeDefinition(b.type)?.name || 'Block',
        content: b.content || {}
      }))

    setBlocks(parsed)
    setLoading(false)
  }

  useEffect(() => {
    loadNewsletter()
  }, [newsletterId])

  const updateBlockContent = (blockId: string, field: string, value: any) => {
    setBlocks(prev => {
      const updated = prev.map(b => {
        if (b.id !== blockId) return b
        const newBlock = { ...b, content: { ...b.content, [field]: value } }
        // Keep selectedBlock in sync
        if (selectedBlock?.id === blockId) {
          setSelectedBlock(newBlock)
        }
        return newBlock
      })
      return updated
    })
  }

  const handleDeleteBlock = (block: NewsletterBlock) => {
    setBlocks(prev => prev.filter(b => b.id !== block.id))
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: NewsletterBlock[]) => {
    setBlocks(reorderedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const newBlocks: NewsletterBlock[] = []
    for (const selection of selections) {
      const blockDef = getBlockTypeDefinition(selection.type)
      if (!blockDef) continue
      for (let i = 0; i < selection.quantity; i++) {
        const timestamp = Date.now() + i
        newBlocks.push({
          id: `${selection.type}-${timestamp}`,
          type: selection.type,
          title: blockDef.name,
          content: { ...blockDef.defaultContent }
        })
      }
    }
    setBlocks(prev => [...prev, ...newBlocks])
    if (newBlocks.length > 0) {
      setSelectedBlock(newBlocks[newBlocks.length - 1])
    }
  }

  const handleSave = async () => {
    if (!newsletter) return
    setIsSaving(true)
    setSaveMessage("Saving...")

    // Convert blocks to content_blocks JSON
    const contentBlocks: Record<string, any> = {}
    blocks.forEach((block, index) => {
      contentBlocks[block.id] = {
        id: block.id,
        type: block.type,
        content: block.content,
        display_order: index
      }
    })

    try {
      const { data, error: saveError } = await updateNewsletter(newsletter.id, {
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
    blocks,
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    loading,
    error,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSave,
    reloadNewsletter: loadNewsletter
  }
}
