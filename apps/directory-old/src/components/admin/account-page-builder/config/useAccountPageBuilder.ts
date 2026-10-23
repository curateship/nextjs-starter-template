import { useState, useEffect, useRef } from "react"
import {
  updateAccountPageBlocksAction,
  type AccountPage
} from "@/lib/actions/account-pages/account-pages-actions"
import { convertBlocksToJson, generateBlockId } from "@/lib/utils/block-utils"
import { getBlockTypeDefinition } from "./account-page-block-types"
import { hasSaveableChange, type SaveStatus, useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { AUTO_SAVE_DEBOUNCE_MS } from "@/components/admin/layout/builder/use-auto-save"
import { type BlockSelection } from "@/components/admin/layout/builder/BlockSelectionModal"


interface UseAccountPagesBuilderParams {
  siteId: string
  pages: AccountPage[]
  blocks: Record<string, any[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, any[]>>>
  selectedPage: string
  reloadBlocks?: () => Promise<void>
}

interface UseAccountPagesBuilderReturn {
  selectedBlock: any | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<any | null>>
  isSaving: boolean
  saveStatus: SaveStatus
  deleting: string | null
  updateBlockContent: (field: string, value: any) => void
  saveSelectedBlockContent: (content: Record<string, any>) => Promise<boolean>
  handleDeleteBlock: (block: any) => Promise<void>
  handleReorderBlocks: (blocks: any[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
  handleSaveAllBlocks: () => Promise<void>
}

export function useAccountPageBuilder({
  siteId: _siteId,
  pages,
  blocks,
  setBlocks,
  selectedPage,
  reloadBlocks
}: UseAccountPagesBuilderParams): UseAccountPagesBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPage])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return

    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      if (!hasSaveableChange(updatedBlocks[selectedPage][blockIndex].content?.[field], value)) return

      updatedBlocks[selectedPage][blockIndex] = {
        ...updatedBlocks[selectedPage][blockIndex],
        content: {
          ...updatedBlocks[selectedPage][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
      setSaveStatus("dirty")
    }
  }

  const persistBlocks = async (pageBlocks: any[]) => {
    setIsSaving(true)
    setSaveStatus("saving")

    try {
      const currentPage = pages.find(p => p.slug === selectedPage)
      if (!currentPage) {
        setSaveStatus("error", "Page not found")
        return false
      }

      const jsonBlocks = convertBlocksToJson(pageBlocks)
      const { error } = await updateAccountPageBlocksAction({ data: { pageId: currentPage.id, contentBlocks: jsonBlocks } })

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

    const originalBlocks = { ...blocks }
    const originalSelectedBlock = selectedBlock
    const updatedBlocks = { ...blocks }
    const currentBlocks = [...(updatedBlocks[selectedPage] || [])]
    const blockIndex = currentBlocks.findIndex(b => b.id === selectedBlock.id)

    if (blockIndex === -1) {
      return false
    }

    currentBlocks[blockIndex] = {
      ...currentBlocks[blockIndex],
      content,
    }
    updatedBlocks[selectedPage] = currentBlocks
    setBlocks(updatedBlocks)
    setSelectedBlock(currentBlocks[blockIndex])

    const saved = await persistBlocks(currentBlocks)
    if (!saved) {
      setBlocks(originalBlocks)
      setSelectedBlock(originalSelectedBlock)
    }

    return saved
  }

  const handleDeleteBlock = async (block: any) => {
    setDeleting(block.id)

    try {
      const originalBlocks = { ...blocks }
      const updatedBlocks = { ...blocks }
      updatedBlocks[selectedPage] = updatedBlocks[selectedPage].filter(b => b.id !== block.id)
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
    const finalBlocks = reorderedBlocks.map((block, index) => ({
      ...block,
      display_order: index
    }))

    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedPage] = finalBlocks
    setBlocks(updatedBlocks)

    const currentPage = pages.find(p => p.slug === selectedPage)
    if (currentPage) {
      const saved = await persistBlocks(finalBlocks)

      if (!saved) {
        setBlocks(originalBlocks)
      }
    }
  }

  const handleSaveAllBlocks = async () => {
    const hasActiveBlocks = blocks[selectedPage] && blocks[selectedPage].length > 0

    if (!hasActiveBlocks) {
      setSaveStatus("saved")
      return
    }

    await persistBlocks(blocks[selectedPage])
  }

  const handleAddBlocks = (selections: BlockSelection[]) => {
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
    setSaveStatus("dirty")
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
    updateBlockContent,
    saveSelectedBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
    handleSaveAllBlocks
  }
}
