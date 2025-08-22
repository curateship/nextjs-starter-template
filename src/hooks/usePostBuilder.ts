import { useState, useEffect } from "react"

interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UsePostBuilderParams {
  blocks: Record<string, PostBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, PostBlock[]>>>
  selectedPost: string
  postId?: string
  currentPost?: {
    title?: string
  }
}

interface UsePostBuilderReturn {
  selectedBlock: PostBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<PostBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: PostBlock) => void
  handleReorderBlocks: (blocks: PostBlock[]) => void
  handleAddPostContentBlock: () => void
  handleSaveAllBlocks: () => void
}

export function usePostBuilder({ 
  blocks, 
  setBlocks, 
  selectedPost,
  postId,
  currentPost
}: UsePostBuilderParams): UsePostBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<PostBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedPost])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return
    
    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedPost].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedPost][blockIndex] = {
        ...updatedBlocks[selectedPost][blockIndex],
        content: {
          ...updatedBlocks[selectedPost][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedPost][blockIndex])
    }
  }

  const handleDeleteBlock = (block: PostBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedPost] = updatedBlocks[selectedPost].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)
    
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: PostBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedPost] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const addBlock = (type: string, title: string, defaultContent: Record<string, any>) => {
    const newBlock: PostBlock = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      content: defaultContent
    }
    
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedPost] || []
    updatedBlocks[selectedPost] = [...currentBlocks, newBlock]
    
    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
  }

  const handleAddPostContentBlock = () => {
    addBlock('post-content', 'Content Block', {
      content: 'Write your content here...'
    })
  }

  const handleSaveAllBlocks = async () => {
    // Mock save for UI testing - no actual server call
    setIsSaving(true)
    setSaveMessage("Saving...")
    
    // Simulate API call delay
    setTimeout(() => {
      setSaveMessage("Saved! (Mock)")
      setIsSaving(false)
      setTimeout(() => setSaveMessage(""), 3000)
    }, 1000)
  }

  return {
    selectedBlock,
    setSelectedBlock,
    isSaving,
    saveMessage,
    updateBlockContent,
    handleDeleteBlock,
    handleReorderBlocks,
    handleAddPostContentBlock,
    handleSaveAllBlocks
  }
}