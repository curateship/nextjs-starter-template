import { useState, useEffect } from "react"
import { updateTaxonomyBlocksAction } from "@/lib/actions/taxonomies/taxonomy-actions"
import { getBlockTypeDefinition } from "@/config/taxonomy-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseTaxonomyBuilderParams {
  blocks: Record<string, TaxonomyBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, TaxonomyBlock[]>>>
  selectedTaxonomy: string
  taxonomyId?: string
  currentTaxonomy?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseTaxonomyBuilderReturn {
  selectedBlock: TaxonomyBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<TaxonomyBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: TaxonomyBlock) => void
  handleReorderBlocks: (blocks: TaxonomyBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => void
}

export function useTaxonomyBuilder({
  blocks,
  setBlocks,
  selectedTaxonomy,
  taxonomyId,
  currentTaxonomy
}: UseTaxonomyBuilderParams): UseTaxonomyBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<TaxonomyBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedTaxonomy])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedTaxonomy].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedTaxonomy][blockIndex] = {
        ...updatedBlocks[selectedTaxonomy][blockIndex],
        content: {
          ...updatedBlocks[selectedTaxonomy][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedTaxonomy][blockIndex])
    }
  }

  const handleDeleteBlock = (block: TaxonomyBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedTaxonomy] = updatedBlocks[selectedTaxonomy].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: TaxonomyBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedTaxonomy] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedTaxonomy] || []
    const newBlocksToAdd: TaxonomyBlock[] = []

    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)
      if (!blockDefinition) continue

      for (let i = 0; i < selection.quantity; i++) {
        const newBlock: TaxonomyBlock = {
          id: `block-${Date.now()}-${Math.random()}`,
          type: selection.type,
          title: blockDefinition.name,
          content: { ...blockDefinition.defaultContent }
        }
        newBlocksToAdd.push(newBlock)
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    // Add new blocks to current blocks
    const newBlocks = [...currentBlocks, ...newBlocksToAdd]
    updatedBlocks[selectedTaxonomy] = newBlocks
    setBlocks(updatedBlocks)

    // Select the last added block
    if (newBlocksToAdd.length > 0) {
      setSelectedBlock(newBlocksToAdd[newBlocksToAdd.length - 1])
    }
  }

  const handleSaveAllBlocks = async () => {
    if (!taxonomyId) {
      setSaveMessage("Error: Taxonomy ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedTaxonomy] || []

    // Get existing content blocks from the currentTaxonomy to preserve settings
    const existingContentBlocks = currentTaxonomy?.content_blocks || {}

    // Convert blocks array to JSON object format
    const newContentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      newContentBlocks[block.type] = {
        ...block.content,
        display_order: index
      }
    })

    // Preserve existing _settings and merge with new blocks
    const contentBlocks: Record<string, any> = {
      ...newContentBlocks,
      // Preserve _settings if it exists
      ...(existingContentBlocks._settings && {
        _settings: existingContentBlocks._settings
      })
    }

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateTaxonomyBlocksAction(taxonomyId, contentBlocks)

      if (result.success) {
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      } else {
        setSaveMessage(`Error: ${result.error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      }
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
