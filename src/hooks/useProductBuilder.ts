import { useState, useEffect } from "react"
import { updateProductBlocksAction } from "@/lib/actions/product-actions"

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
  handleAddProductPricingBlock: () => void
  handleAddProductFAQBlock: () => void
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

  const handleAddProductPricingBlock = () => {
    addBlock('product-pricing', 'Product Pricing', {
      title: 'Pricing',
      subtitle: 'Check out our affordable pricing plans below and choose the one that suits you best.',
      pricingTiers: [
        {
          id: `tier-${Date.now()}-1`,
          name: 'Free',
          description: 'For personal use only with limited features and support',
          price: '0',
          interval: 'Includes 1 user.',
          buttonText: 'Get Started',
          buttonVariant: 'outline',
          features: ['Live Collaboration', '1 GB Storage', '2 Projects', 'Basic Support'],
          comparison: 'Features',
          hasPurchaseOption: false
        },
        {
          id: `tier-${Date.now()}-2`,
          name: 'Pro',
          description: 'For small businesses with all the features and support',
          price: '29',
          interval: 'Per user, per month.',
          buttonText: 'Purchase',
          buttonVariant: 'default',
          features: ['2 Team Members', '10 GB Storage', '10 Projects', 'Priority Support'],
          comparison: 'Everything in Free, and:',
          hasPurchaseOption: true,
          isPopular: true
        },
        {
          id: `tier-${Date.now()}-3`,
          name: 'Premium',
          description: 'For teams and organizations with advanced features and support',
          price: '59',
          interval: 'Per user, per month.',
          buttonText: 'Purchase',
          buttonVariant: 'outline',
          features: ['5 Team Members', '50 GB Storage', '50 Projects', 'Dedicated Support'],
          comparison: 'Everything in Pro, and:',
          hasPurchaseOption: true
        }
      ]
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

  const handleSaveAllBlocks = async () => {
    if (!productId) {
      setSaveMessage("Error: Product ID required")
      setTimeout(() => setSaveMessage(""), 3000)
      return
    }

    const currentBlocks = blocks[selectedProduct] || []
    
    // Convert blocks array to JSON object format
    const contentBlocks: Record<string, any> = {}
    currentBlocks.forEach((block, index) => {
      contentBlocks[block.type] = {
        ...block.content,
        display_order: index
      }
    })
    
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
    handleAddProductPricingBlock,
    handleAddProductFAQBlock,
    handleSaveAllBlocks
  }
}