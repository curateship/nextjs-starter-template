import { useState, useEffect } from "react"
import { updateProductBlocksAction } from "@/lib/actions/products/product-actions"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface UseProductBuilderParams {
  blocks: Record<string, ProductBlock[]>
  setBlocks: React.Dispatch<React.SetStateAction<Record<string, ProductBlock[]>>>
  selectedProduct: string
  productId?: string
  currentProduct?: {
    title?: string
    content_blocks?: Record<string, any>
  }
}

interface UseProductBuilderReturn {
  selectedBlock: ProductBlock | null
  setSelectedBlock: React.Dispatch<React.SetStateAction<ProductBlock | null>>
  isSaving: boolean
  saveMessage: string
  updateBlockContent: (field: string, value: any) => void
  handleDeleteBlock: (block: ProductBlock) => void
  handleReorderBlocks: (blocks: ProductBlock[]) => void
  handleAddProductDefaultBlock: () => void
  handleAddProductHeroBlock: () => void
  handleAddProductFeaturesBlock: () => void
  handleAddProductHotspotBlock: () => void
  handleAddProductCheckoutBlock: () => void
  handleAddProductLeadMagnetBlock: () => void
  handleAddProductFAQBlock: () => void
  handleAddListingViewsBlock: () => void
  handleAddProductRichTextBlock: () => void
  handleAddProductVideoBlock: () => void
  handleSaveAllBlocks: () => void
}

export function useProductBuilder({ 
  blocks, 
  setBlocks, 
  selectedProduct,
  productId,
  currentProduct
}: UseProductBuilderParams): UseProductBuilderReturn {
  const [selectedBlock, setSelectedBlock] = useState<ProductBlock | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    setSelectedBlock(null)
  }, [selectedProduct])

  const updateBlockContent = (field: string, value: any) => {
    if (!selectedBlock) return
    
    const updatedBlocks = { ...blocks }
    const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
    if (blockIndex !== -1) {
      updatedBlocks[selectedProduct][blockIndex] = {
        ...updatedBlocks[selectedProduct][blockIndex],
        content: {
          ...updatedBlocks[selectedProduct][blockIndex].content,
          [field]: value
        }
      }
      setBlocks(updatedBlocks)
      setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
    }
  }

  const handleDeleteBlock = (block: ProductBlock) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = updatedBlocks[selectedProduct].filter(b => b.id !== block.id)
    setBlocks(updatedBlocks)
    
    if (selectedBlock?.id === block.id) {
      setSelectedBlock(null)
    }
  }

  const handleReorderBlocks = (reorderedBlocks: ProductBlock[]) => {
    const updatedBlocks = { ...blocks }
    updatedBlocks[selectedProduct] = reorderedBlocks
    setBlocks(updatedBlocks)
  }

  const addBlock = (type: string, title: string, defaultContent: Record<string, any>) => {
    const newBlock: ProductBlock = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      content: defaultContent
    }
    
    const updatedBlocks = { ...blocks }
    const currentBlocks = updatedBlocks[selectedProduct] || []
    updatedBlocks[selectedProduct] = [...currentBlocks, newBlock]
    
    setBlocks(updatedBlocks)
    setSelectedBlock(newBlock)
  }

  const handleAddProductDefaultBlock = () => {
    addBlock('product-default', 'Product Information', {
      viewOnly: true
    })
  }

  const handleAddProductHeroBlock = () => {
    addBlock('product-hero', 'Product Hero', {
      title: 'New Hero Section',
      subtitle: 'Add your subtitle here',
      primaryButton: 'Get Started',
      secondaryButton: 'Learn More',
      primaryButtonLink: '',
      secondaryButtonLink: '',
      primaryButtonStyle: 'primary',
      secondaryButtonStyle: 'outline',
      backgroundColor: '#ffffff'
    })
  }

  const handleAddProductFeaturesBlock = () => {
    addBlock('product-features', 'Product Features', {
      headerTitle: 'Effortless Task Management',
      headerSubtitle: 'Automate your tasks and workflows.',
      features: [
        {
          id: `feature-${Date.now()}-1`,
          image: '',
          title: 'Marketing Campaigns',
          description: 'Effortlessly book and manage your meetings.'
        }
      ]
    })
  }

  const handleAddProductHotspotBlock = () => {
    addBlock('product-hotspot', 'Product Hotspot', {
      title: 'Interactive Product Overview',
      subtitle: 'Hover over the blinking dots to discover more',
      backgroundImage: '',
      hotspots: []
    })
  }

  const handleAddProductCheckoutBlock = () => {
    // Check if lead-magnet block exists
    const currentBlocks = blocks[selectedProduct] || []
    if (currentBlocks.some(b => b.type === 'lead-magnet')) {
      alert('Cannot add Pricing block: Product already has a Lead Magnet block. Products can have either Lead Magnet OR Pricing, not both.')
      return
    }

    addBlock('product-checkout', 'Product Checkout', {
      title: '',
      subtitle: '',
      headerTitle: '',
      headerSubtitle: '',
      pricingTiers: []
    })
  }

  const handleAddProductLeadMagnetBlock = () => {
    // Check if checkout block exists
    const currentBlocks = blocks[selectedProduct] || []
    if (currentBlocks.some(b => b.type === 'product-checkout')) {
      alert('Cannot add Lead Magnet block: Product already has a Checkout block. Products can have either Lead Magnet OR Checkout, not both.')
      return
    }

    addBlock('lead-magnet', 'Product Lead Magnet', {
      heading: 'Get Your Free Download',
      subheading: 'Enter your email to receive instant access',
      buttonText: 'Get Instant Access',
      benefits: [
        'Instant download',
        'No credit card required',
        'Unsubscribe anytime'
      ],
      emailSettings: {
        subject: 'Your download is ready!',
        fromName: '',
        replyTo: '',
        content: '<p>Thank you for signing up!</p><p>Click the link below to access your content:</p><p><a href="https://example.com/your-resource.pdf">Download Your Content</a></p>'
      },
      flodeskSettings: {
        enabled: false,
        segmentId: '',
        tags: []
      },
      thankYou: {
        heading: 'Check Your Email!',
        message: "We've sent your content to your email address."
      }
    })
  }

  const handleAddProductFAQBlock = () => {
    addBlock('faq', 'FAQ', {
      title: 'Product FAQ',
      subtitle: 'Get answers to common questions about this product, its features, compatibility, and support options.',
      faqItems: [
        {
          id: 'item-1',
          question: 'What are the product specifications?',
          answer: 'Our product features premium materials and high-quality construction. Detailed specifications are available in the product documentation section.'
        },
        {
          id: 'item-2',
          question: 'Is this product compatible with other systems?',
          answer: 'Yes, this product is designed to be compatible with most standard systems. Please check the compatibility chart for specific model requirements.'
        }
      ]
    })
  }

  const handleAddListingViewsBlock = () => {
    addBlock('listing-views', 'Product Listings', {
      title: 'Related Products',
      subtitle: 'Check out our other products',
      headerAlign: 'left',
      contentType: 'products',
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
      backgroundColor: '#ffffff'
    })
  }

  const handleAddProductRichTextBlock = () => {
    addBlock('rich-text', 'Rich Text', {
      content: '<p>Add your content here...</p>'
    })
  }

  const handleAddProductVideoBlock = () => {
    addBlock('product-video', 'Product Video', {
      title: 'Watch Our Product in Action',
      subtitle: 'See how our product works',
      headerAlign: 'left',
      videoUrl: '',
      coverImage: '',
      autoplay: false,
      loop: false,
      muted: false
    })
  }

  const handleSaveAllBlocks = async () => {
    if (!productId) {
      setSaveMessage("Error: Product ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedProduct] || []
    
    // Get existing content blocks from the currentProduct to preserve settings
    const existingContentBlocks = currentProduct?.content_blocks || {}
    
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
      // Preserve _settings if it exists (including privacy setting)
      ...(existingContentBlocks._settings && {
        _settings: existingContentBlocks._settings
      })
    }
    
    setIsSaving(true)
    setSaveMessage("Saving...")

    try {
      const result = await updateProductBlocksAction(productId, contentBlocks)
      
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
    handleAddProductDefaultBlock,
    handleAddProductHeroBlock,
    handleAddProductFeaturesBlock,
    handleAddProductHotspotBlock,
    handleAddProductCheckoutBlock,
    handleAddProductLeadMagnetBlock,
    handleAddProductFAQBlock,
    handleAddListingViewsBlock,
    handleAddProductRichTextBlock,
    handleAddProductVideoBlock,
    handleSaveAllBlocks
  }
}