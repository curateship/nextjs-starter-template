"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Eye, Save, Upload, Plus, ChevronUp, ChevronDown, Trash2, Plus as PlusIcon } from "lucide-react"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface ProductData {
  slug: string
  name: string
  blocks: ProductBlock[]
}

export default function ProductBuilderPage() {
  const [selectedProduct, setSelectedProduct] = useState("new-product")
  const [selectedBlock, setSelectedBlock] = useState<ProductBlock | null>(null)
  const [blocks, setBlocks] = useState<Record<string, ProductBlock[]>>({
    "new-product": []
  })

  // Product-specific block types
  const productBlocks = [
    { type: "product-hero", name: "Product Hero", icon: "🏷️" },
    { type: "product-gallery", name: "Product Gallery", icon: "🖼️" },
    { type: "product-details", name: "Product Details", icon: "📋" },
    { type: "pricing-options", name: "Pricing Options", icon: "💰" },
    { type: "customer-reviews", name: "Customer Reviews", icon: "⭐" },
    { type: "related-products", name: "Related Products", icon: "🔄" },
    { type: "product-faq", name: "Product FAQ", icon: "❓" },
    { type: "contact-sales", name: "Contact Sales", icon: "📞" }
  ]

  // Shared blocks (can be used across different content types)
  const sharedBlocks = [
    { type: "about", name: "About", icon: "ℹ️" },
    { type: "contact", name: "Contact", icon: "📧" },
  ]

  // Function to get default content for a block type
  const getDefaultContent = (blockType: string) => {
    switch (blockType) {
      case 'product-hero':
        return {
          title: "New Product",
          subtitle: "Product description",
          price: "$99",
          originalPrice: "$129",
          discount: "23% off",
          images: [],
          ctaText: "Add to Cart",
          ctaLink: "/cart"
        }
      case 'product-gallery':
        return {
          images: [],
          showThumbnails: true,
          showZoom: true
        }
      case 'product-details':
        return {
          description: "Product description goes here...",
          specifications: [
            { label: "Feature 1", value: "Value 1" },
            { label: "Feature 2", value: "Value 2" }
          ],
          features: ["Feature 1", "Feature 2", "Feature 3"]
        }
      case 'pricing-options':
        return {
          options: [
            { name: "Basic", price: "$99", features: ["Feature 1", "Feature 2"] },
            { name: "Pro", price: "$199", features: ["Feature 1", "Feature 2", "Feature 3"] }
          ],
          showComparison: true
        }
      case 'customer-reviews':
        return {
          title: "Customer Reviews",
          reviews: [
            { name: "John D.", rating: 5, text: "Great product!", date: "2024-01-15" },
            { name: "Sarah M.", rating: 4, text: "Very satisfied!", date: "2024-01-10" }
          ]
        }
      case 'related-products':
        return {
          title: "Related Products",
          products: [
            { name: "Related Product 1", price: "$89", image: "/product-1.jpg" },
            { name: "Related Product 2", price: "$129", image: "/product-2.jpg" }
          ]
        }
      case 'product-faq':
        return {
          title: "Frequently Asked Questions",
          questions: [
            { question: "What's the warranty?", answer: "1 year standard warranty" },
            { question: "Is shipping free?", answer: "Free shipping on orders over $50" }
          ]
        }
      case 'contact-sales':
        return {
          title: "Contact Sales",
          description: "Need help? Contact our sales team",
          email: "sales@example.com",
          phone: "+1 (555) 123-4567",
          showForm: true
        }
      // Shared blocks (can be used across different content types)
      case 'about':
        return {
          title: "About Our Product",
          subtitle: "The story behind our success",
          description: "Learn about our mission, values, and the team behind this amazing product.",
          image: "/about-image.jpg",
          stats: [
            { number: "10K+", label: "Happy Customers" },
            { number: "50+", label: "Countries" },
            { number: "99%", label: "Satisfaction Rate" }
          ]
        }
      case 'contact':
        return {
          title: "Get in Touch",
          subtitle: "We'd love to hear from you",
          description: "Have questions? Need support? Reach out to our team.",
          email: "contact@example.com",
          phone: "+1 (555) 123-4567",
          address: "123 Main St, City, State 12345",
          showForm: true
        }
      default:
        return {}
    }
  }

  // Function to add a new block
  const addBlock = (blockType: string) => {
    const newBlock: ProductBlock = {
      id: `${blockType}-${Date.now()}`,
      type: blockType,
      title: getDefaultContent(blockType).title || `${blockType} Block`,
      content: getDefaultContent(blockType)
    }
    
    setBlocks(prev => ({
      ...prev,
      [selectedProduct]: [...(prev[selectedProduct] || []), newBlock]
    }))
  }

  const deleteBlock = (blockId: string) => {
    setBlocks(prev => ({
      ...prev,
      [selectedProduct]: prev[selectedProduct].filter(block => block.id !== blockId)
    }))
    
    // Clear selected block if it was the one being deleted
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null)
    }
  }

  const currentProduct = {
    slug: selectedProduct,
    name: "New Product",
    blocks: blocks[selectedProduct] || []
  }

  return (
    <AdminLayout>
              <div className="flex flex-col -m-4 -mt-6 h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-15 z-40">
          <div className="flex h-16 items-center px-6">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <a href="/admin/products">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Products
                </a>
              </Button>
              <div className="h-4 w-px bg-border"></div>
              <h1 className="text-lg font-semibold">Product Builder</h1>
            </div>
            
            <div className="ml-auto flex items-center space-x-4">
              <Button variant="outline">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button>
                <Save className="w-4 h-4 mr-2" />
                Save Product
              </Button>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Publish
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - 3 Column Layout */}
        <div className="flex-1 flex">
          {/* Left Sidebar - Properties Panel */}
          <div className="w-[650px] border-r bg-muted/30 p-4 overflow-y-auto">
            {selectedBlock ? (
              <div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Edit {selectedBlock.title}</label>
                  </div>
                  
                  {selectedBlock.type === 'product-hero' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">Product Title</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.title}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedProduct][blockIndex] = {
                                ...updatedBlocks[selectedProduct][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedProduct][blockIndex].content,
                                  title: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Subtitle</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.subtitle}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedProduct][blockIndex] = {
                                ...updatedBlocks[selectedProduct][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedProduct][blockIndex].content,
                                  subtitle: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Price</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.price}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedProduct][blockIndex] = {
                                ...updatedBlocks[selectedProduct][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedProduct][blockIndex].content,
                                  price: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Original Price</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.originalPrice}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedProduct][blockIndex] = {
                                ...updatedBlocks[selectedProduct][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedProduct][blockIndex].content,
                                  originalPrice: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">CTA Button Text</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.ctaText}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedProduct].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedProduct][blockIndex] = {
                                ...updatedBlocks[selectedProduct][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedProduct][blockIndex].content,
                                  ctaText: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedProduct][blockIndex])
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t space-y-2">
                    <Button variant="destructive" className="w-full" onClick={(e) => {
                      e.stopPropagation();
                      deleteBlock(selectedBlock.id);
                    }}>
                      Delete Block
                    </Button>
                    <Button variant="outline" className="w-full">
                      Duplicate Block
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <p>Select a block to edit its properties</p>
              </div>
            )}
          </div>

          {/* Middle Section - Block List */}
          <div className="flex-1 p-6">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl font-semibold mb-6">
                {currentProduct.name} Product Blocks
              </h2>
              
              {currentProduct.blocks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-muted-foreground mb-4">
                    <p className="text-lg font-medium">No blocks added yet</p>
                    <p className="text-sm">Add blocks from the right sidebar to start building your product page</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentProduct.blocks.map((block) => (
                    <div
                      key={block.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedBlock?.id === block.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setSelectedBlock(block)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">{block.title}</h3>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm">↑</Button>
                          <Button variant="ghost" size="sm">↓</Button>
                          <Button variant="ghost" size="sm">✏️</Button>
                          <Button variant="ghost" size="sm" onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(block.id);
                          }}>🗑️</Button>
                        </div>
                      </div>
                      
                      {/* Block Content Preview */}
                      <div className="text-sm text-muted-foreground space-y-1">
                        {block.type === 'product-hero' && (
                          <>
                            <div>Title: {block.content.title}</div>
                            <div>Price: {block.content.price}</div>
                            <div>CTA: {block.content.ctaText}</div>
                          </>
                        )}
                        {block.type === 'product-gallery' && (
                          <>
                            <div>Images: {block.content.images?.length || 0} images</div>
                            <div>Thumbnails: {block.content.showThumbnails ? "✓" : "✗"}</div>
                            <div>Zoom: {block.content.showZoom ? "✓" : "✗"}</div>
                          </>
                        )}
                        {block.type === 'product-details' && (
                          <>
                            <div>Specifications: {block.content.specifications?.length || 0} items</div>
                            <div>Features: {block.content.features?.length || 0} features</div>
                          </>
                        )}
                        {block.type === 'pricing-options' && (
                          <>
                            <div>Options: {block.content.options?.length || 0} pricing tiers</div>
                            <div>Comparison: {block.content.showComparison ? "✓" : "✗"}</div>
                          </>
                        )}
                        {/* Shared blocks preview */}
                        {block.type === 'about' && (
                          <>
                            <div>Title: {block.content.title}</div>
                            <div>Stats: {block.content.stats?.length || 0} items</div>
                          </>
                        )}
                        {block.type === 'contact' && (
                          <>
                            <div>Title: {block.content.title}</div>
                            <div>Form: {block.content.showForm ? "✓" : "✗"}</div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Product Blocks & Shared Blocks */}
          <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
            {/* Product Blocks Section */}
            <div className="mb-6">
              <h3 className="font-semibold mb-4">Product Blocks</h3>
              <div className="space-y-2">
                {productBlocks.map((block) => (
                  <div
                    key={block.type}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{block.icon}</span>
                      <span className="text-sm font-medium">{block.name}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => addBlock(block.type)}
                      className="h-8 w-8 p-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Shared Blocks Section */}
            <div>
              <h3 className="font-semibold mb-4">Shared Blocks</h3>
              <div className="space-y-2">
                {sharedBlocks.map((block) => (
                  <div
                    key={block.type}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{block.icon}</span>
                      <span className="text-sm font-medium">{block.name}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => addBlock(block.type)}
                      className="h-8 w-8 p-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
} 