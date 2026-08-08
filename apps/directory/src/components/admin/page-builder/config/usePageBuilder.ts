import { useState, useEffect, useRef } from "react"
import { updatePageBlocksAction, type Page } from "@/lib/actions/pages/page-actions"
import { convertBlocksToJson, generateBlockId } from "@/lib/utils/block-utils"
import { getBlockTypeDefinition } from "./page-block-types"
import { normalizePageBlock, normalizePageBlockContent } from "./page-block-utils"
import { hasSaveableChange, type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"
import { type BlockSelection } from "@/components/admin/layout/builder/BlockSelectionModal"


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
  saveStatus: SaveStatus
  deleting: string | null
  saveSelectedBlockContent: (content: Record<string, any>) => Promise<boolean>
  handleUpdateBlock: (blockId: string, updates: Record<string, any>) => void
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
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPage])

  const persistBlocks = async (pageBlocks: any[]) => {
    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (!currentPage) {
        setSaveStatus("error", "Page not found")
        return false
      }

      const normalizedPageBlocks = pageBlocks.map(normalizePageBlock)
      const jsonBlocks = convertBlocksToJson(normalizedPageBlocks)
      const { error } = await updatePageBlocksAction({ data: { pageId: currentPage.id, contentBlocks: jsonBlocks } })

      if (error) {
        setSaveStatus("error", error)
        return false
      }

      setSaveStatus("saved")
      return true
    } catch (error) {
      console.error('Error saving blocks:', error)
      setSaveStatus("error", "Error saving blocks")
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const saveSelectedBlockContent = async (content: Record<string, any>) => {
    if (!selectedBlock) return false

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)

    if (blockIndex === -1) {
      return false
    }

    const currentBlock = updatedBlocks[selectedPage][blockIndex]
    updatedBlocks[selectedPage][blockIndex] = normalizePageBlock({
      ...currentBlock,
      content: normalizePageBlockContent(currentBlock.type, content),
    })

    setBlocks(updatedBlocks)
    setSelectedBlock(updatedBlocks[selectedPage][blockIndex])

    return persistBlocks(updatedBlocks[selectedPage])
  }

  const handleUpdateBlock = (blockId: string, updates: Record<string, any>) => {
    const updatedBlocks = { ...blocks }
    const currentBlocks = [...(updatedBlocks[selectedPage] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === blockId)

    if (blockIndex === -1) return

    const currentBlock = currentBlocks[blockIndex]
    const nextType = updates.type || currentBlock.type
    const updatedBlock = normalizePageBlock({
      ...currentBlock,
      ...updates,
      type: nextType,
      content: normalizePageBlockContent(
        nextType,
        updates.content !== undefined ? updates.content : currentBlock.content
      ),
    })
    const currentNormalizedBlock = normalizePageBlock(currentBlock)

    if (!hasSaveableChange(currentNormalizedBlock, updatedBlock)) return

    currentBlocks[blockIndex] = updatedBlock
    updatedBlocks[selectedPage] = currentBlocks
    setBlocks(updatedBlocks)

    if (selectedBlock?.id === blockId) {
      setSelectedBlock(updatedBlock)
    }
    setSaveStatus("dirty")
  }

  const handleDeleteBlock = async (block: any) => {
    setDeleting(block.id)
    const originalBlocks = { ...blocks }

    try {
      const updatedBlocks = { ...blocks }
      updatedBlocks[selectedPage] = updatedBlocks[selectedPage]
        .filter(b => b.id !== block.id)
        .map(normalizePageBlock)
      setBlocks(updatedBlocks)

      if (selectedBlock?.id === block.id) {
        setSelectedBlock(null)
      }

      const saved = await persistBlocks(updatedBlocks[selectedPage] || [])
      if (!saved) {
        setBlocks(originalBlocks)
        return
      }

      if (reloadBlocks) {
        await reloadBlocks()
      }
    } catch (err) {
      console.error('Error deleting block:', err)
      setSaveStatus("error", "Error deleting block")
    } finally {
      setDeleting(null)
    }
  }

  const handleReorderBlocks = async (reorderedBlocks: any[]) => {
    const originalBlocks = { ...blocks }
    const finalBlocks = reorderedBlocks.map((block, index) => normalizePageBlock({
      ...block,
      display_order: index
    }))

    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedPage] = finalBlocks
    setBlocks(updatedBlocks)

    const saved = await persistBlocks(finalBlocks)
    if (!saved) {
      setBlocks(originalBlocks)
    }
  }

  const handleSaveAllBlocks = async () => {
    const hasActiveBlocks = blocks[selectedPage] && blocks[selectedPage].length > 0

    if (!hasActiveBlocks) {
      setSaveStatus("saved")
      return
    }

    const normalizedBlocks = blocks[selectedPage].map(normalizePageBlock)
    setBlocks({
      ...blocks,
      [selectedPage]: normalizedBlocks,
    })
    await persistBlocks(normalizedBlocks)
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
        newBlocksToAdd.push(normalizePageBlock({
          id: generateBlockId(),
          type: selection.type,
          content: { ...blockDefinition.defaultContent },
          display_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
      }
    }

    if (newBlocksToAdd.length === 0) {
      return
    }

    const newBlocks = [...currentBlocks, ...newBlocksToAdd]
    const normalizedBlocks = newBlocks.map((block, index) => normalizePageBlock({
      ...block,
      display_order: index,
    }))

    updatedBlocks[selectedPage] = normalizedBlocks
    setBlocks(updatedBlocks)

    const currentPage = pages.find(p => p.slug === selectedPage)
    if (currentPage) {
      await persistBlocks(normalizedBlocks)
    }
  }

  // Auto-save: block edits only mark things unsaved, so write them once the
  // typing stops. Same wait as everywhere else — see use-auto-save.ts.
  const saveAllBlocksRef = useRef(handleSaveAllBlocks)
  saveAllBlocksRef.current = handleSaveAllBlocks
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  useEffect(() => {
    if (saveStatus.state !== "dirty") return

    const timer = setTimeout(() => {
      void saveAllBlocksRef.current()
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // Leaving the screen inside that wait must not lose the edit.
  useEffect(() => {
    return () => {
      if (saveStatusRef.current.state === "dirty") {
        void saveAllBlocksRef.current()
      }
    }
  }, [])

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveStatus,
    deleting,
    saveSelectedBlockContent,
    handleUpdateBlock,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
