import { useState, useEffect } from "react"
import { updateTaxonomyBlocksAction } from "@/lib/actions/taxonomies/taxonomy-actions"

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
  handleAddTaxonomyDefaultBlock: () => void
  handleAddTaxonomyHeroBlock: () => void
  handleAddTaxonomyStatsBlock: () => void
  handleAddTaxonomyRichTextBlock: () => void
  handleAddTaxonomyListingViewsBlock: () => void
  handleAddTaxonomyFAQBlock: () => void
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

  const addBlock = (type: string, title: string, defaultContent: Record<string, any>) => {
    const newBlock: TaxonomyBlock = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      content: defaultContent
    }

    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedTaxonomy] || []
    updatedBlocks[selectedTaxonomy] = [...currentBlocks, newBlock]

    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
  }

  const handleAddTaxonomyDefaultBlock = () => {
    addBlock('taxonomy-default', 'Taxonomy Information', {
      viewOnly: true
    })
  }

  const handleAddTaxonomyHeroBlock = () => {
    addBlock('taxonomy-hero', 'Hero Section', {
      title: 'Taxonomy Hero',
      subtitle: 'Add your subtitle here',
      primaryButton: 'Learn More',
      secondaryButton: 'View All',
      primaryButtonLink: '',
      secondaryButtonLink: '',
      primaryButtonStyle: 'primary',
      secondaryButtonStyle: 'outline',
      backgroundColor: '#ffffff'
    })
  }

  const handleAddTaxonomyStatsBlock = () => {
    addBlock('taxonomy-stats', 'Statistics', {
      headerTitle: 'Key Statistics',
      headerSubtitle: 'Important numbers and facts',
      stats: [
        {
          id: `stat-${Date.now()}-1`,
          label: 'Total Items',
          value: '0',
          icon: '📊'
        }
      ]
    })
  }

  const handleAddTaxonomyRichTextBlock = () => {
    addBlock('rich-text', 'Rich Text', {
      content: '<p>Add your content here...</p>'
    })
  }

  const handleAddTaxonomyListingViewsBlock = () => {
    addBlock('listing-views', 'Content Listings', {
      title: 'Related Content',
      subtitle: 'Explore content in this category',
      headerAlign: 'left',
      contentType: 'directory', // Default to directories
      displayMode: 'grid',
      itemsToShow: 6,
      columns: 3,
      sortBy: 'date',
      sortOrder: 'desc',
      showImage: true,
      showTitle: true,
      showDescription: true,
      isPaginated: false,
      itemsPerPage: 12,
      viewAllText: '',
      viewAllLink: '',
      backgroundColor: '#ffffff',
      filterByCurrentTaxonomy: true // Auto-filter by current taxonomy
    })
  }

  const handleAddTaxonomyFAQBlock = () => {
    addBlock('faq', 'FAQ', {
      title: 'Frequently Asked Questions',
      subtitle: 'Common questions about this category',
      faqItems: [
        {
          id: 'item-1',
          question: 'What is included in this category?',
          answer: 'This category includes various items related to the topic.'
        }
      ]
    })
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
    handleAddTaxonomyDefaultBlock,
    handleAddTaxonomyHeroBlock,
    handleAddTaxonomyStatsBlock,
    handleAddTaxonomyRichTextBlock,
    handleAddTaxonomyListingViewsBlock,
    handleAddTaxonomyFAQBlock,
    handleSaveAllBlocks
  }
}
