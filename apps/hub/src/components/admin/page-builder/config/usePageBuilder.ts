import { useState, useEffect } from "react"
import { updatePageBlocksAction, type Page } from "@/lib/actions/pages/page-actions"
import { convertBlocksToJson, generateBlockId } from "@/lib/utils/block-utils"
import { getBlockTypeDefinition } from "./page-block-types"

interface BlockSelection {
  type: string
  quantity: number
}

interface UsePageBuilderParams {
  siteId: string
  pages: Page[]
  blocks: Record<string, any[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, any[]>>>
  selectedPage: string
  reloadBlocks?: () => Promise<void>
}

interface UsePageBuilderReturn {
  selectedBlock: any | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<any | null>>
  isSaving: boolean
  saveMessage: string
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: any) => Promise<void>
  handleReorderBlocks: (blocks: any[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => Promise<void>
  handleSaveAllBlocks: () => Promise<void>
}

export function usePageBuilder({
  siteId: _siteId,
  pages,
  blocks,
  setBlocks,
  selectedPage,
  reloadBlocks
}: UsePageBuilderParams): UsePageBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPage])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedPage][blockIndex] = {
        ...updatedBlocks[selectedPage][blockIndex],
        content: {
          ...updatedBlocks[selectedPage][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
    }
  }

  const handleDeleteBlock = async (block: any) => {
    setDeleting(block.id)

    try {
      const updatedBlocks = { ...blocks }
      updatedBlocks[selectedPage] = updatedBlocks[selectedPage].filter(b => b.id !== block.id)
      setBlocks(updatedBlocks)

      if (selectedBlock?.id === block.id) {
        setSelectedBlock(null)
      }

      const currentPage = pages.find(p => p.slug === selectedPage)
      if (currentPage) {
        const jsonBlocks = convertBlocksToJson(updatedBlocks[selectedPage])
        await updatePageBlocksAction(currentPage.id, jsonBlocks)
      }

      if (reloadBlocks) {
        await reloadBlocks()
      }

      setSaveMessage("Block deleted!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err) {
      console.error('Error deleting block:', err)
      setSaveMessage("Error deleting block")
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setDeleting(null)
    }
  }

  const handleReorderBlocks = async (reorderedBlocks: any[]) => {
    const originalBlocks = { ...blocks }
    const finalBlocks = reorderedBlocks.map((block, index) => ({
      ...block,
      display_order: index
    }))

    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedPage] = finalBlocks
    setBlocks(updatedBlocks)

    const currentPage = pages.find(p => p.slug === selectedPage)
    if (currentPage) {
      const jsonBlocks = convertBlocksToJson(finalBlocks)
      const { error } = await updatePageBlocksAction(currentPage.id, jsonBlocks)

      if (error) {
        setBlocks(originalBlocks)
        setSaveMessage(`Error reordering blocks: ${error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      }
    }
  }

  const handleSaveAllBlocks = async () => {
    const hasActiveBlocks = blocks[selectedPage] && blocks[selectedPage].length > 0

    if (!hasActiveBlocks) {
      setSaveMessage("No changes to save")
      setTimeout(() => setSaveMessage(""), 2000)
      return
    }

    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (!currentPage) {
        setSaveMessage("Error: Page not found")
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }

      const jsonBlocks = convertBlocksToJson(blocks[selectedPage])
      const results = await Promise.all([updatePageBlocksAction(currentPage.id, jsonBlocks)])
      const errors = results.filter(result => result.error)

      if (errors.length > 0) {
        setSaveMessage(`Error: ${errors[0].error}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else {
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (error) {
      console.error('Error saving blocks:', error)
      setSaveMessage("Error saving blocks")
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddBlocks = async (selections: BlockSelection[]) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedPage] || []
    const newBlocksToAdd: any[] = []

    for (const selection of selections) {
      const blockDefinition = getBlockTypeDefinition(selection.type)

      if (!blockDefinition) {
        console.warn(`Unknown block type: ${selection.type}`)
        continue
      }

      for (let i = 0; i < selection.quantity; i++) {
        newBlocksToAdd.push({
          id: generateBlockId(),
          type: selection.type,
          content: { ...blockDefinition.defaultContent },
          display_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    const newBlocks = [...currentBlocks, ...newBlocksToAdd]
    newBlocks.forEach((block, index) => {
      block.display_order = index
    })

    updatedBlocks[selectedPage] = newBlocks
    setBlocks(updatedBlocks)

    if (newBlocksToAdd.length > 0) {
      setSelectedBlock(newBlocksToAdd[newBlocksToAdd.length - 1])
    }

    const currentPage = pages.find(p => p.slug === selectedPage)
    if (currentPage) {
      const jsonBlocks = convertBlocksToJson(newBlocks)
      await updatePageBlocksAction(currentPage.id, jsonBlocks)
    }
  }

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    deleting,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
