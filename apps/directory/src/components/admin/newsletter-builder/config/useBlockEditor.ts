import { useState } from "react"
import { getBlockTypeDefinition } from "./newsletter-block-types"

export interface NewsletterBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export interface BlockSelection {
  type: string
  quantity: number
}

export interface UseBlockEditorReturn {
  blocks: NewsletterBlock[]
  setBlocks: React.Dispatch<React.SetStateAction<NewsletterBlock[]>>
  selectedBlock: NewsletterBlock | null
  setSelectedBlock: (block: NewsletterBlock | null) => void
  updateBlockContent: (blockId: string, field: string, value: any) => void
  replaceSelectedBlockContent: (content: Record<string, any>) => NewsletterBlock[] | null
  handleDeleteBlock: (block: NewsletterBlock) => void
  handleReorderBlocks: (blocks: NewsletterBlock[]) => void
  handleAddBlocks: (selections: BlockSelection[]) => void
}

export function parseBlocksFromJson(contentBlocks: Record<string, any>): NewsletterBlock[] {
  return Object.values(contentBlocks)
    .filter((b: any) => b.id && b.type)
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((b: any) => ({
      id: b.id,
      type: b.type,
      title: getBlockTypeDefinition(b.type)?.name || 'Block',
      content: b.content || {}
    }))
}

export function blocksToJson(blocks: NewsletterBlock[]): Record<string, any> {
  const contentBlocks: Record<string, any> = {}
  blocks.forEach((block, index) => {
    contentBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: index
    }
  })
  return contentBlocks
}

export function useBlockEditor(): UseBlockEditorReturn {
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([])
  const [selectedBlock, setSelectedBlock] = useState<NewsletterBlock | null>(null)

  const updateBlockContent = (blockId: string, field: string, value: any) => {
    setBlocks(prev => {
      const updated = prev.map(b => {
        if (b.id !== blockId) return b
        const newBlock = { ...b, content: { ...b.content, [field]: value } }
        if (selectedBlock?.id === blockId) {
          setSelectedBlock(newBlock)
        }
        return newBlock
      })
      return updated
    })
  }

  const replaceSelectedBlockContent = (content: Record<string, any>) => {
    if (!selectedBlock) return null

    const updatedBlocks = blocks.map((block) =>
      block.id === selectedBlock.id
        ? { ...block, content }
        : block
    )

    const updatedSelectedBlock = updatedBlocks.find((block) => block.id === selectedBlock.id) || null

    setBlocks(updatedBlocks)
    setSelectedBlock(updatedSelectedBlock)

    return updatedBlocks
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
    setSelectedBlock(null)
  }

  return {
    blocks,
    setBlocks,
    selectedBlock,
    setSelectedBlock,
    updateBlockContent,
    replaceSelectedBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddBlocks,
  }
}
