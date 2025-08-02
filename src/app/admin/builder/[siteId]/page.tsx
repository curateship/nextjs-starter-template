"use client"

import { useState } from "react"
import { use } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Eye, Save, Upload, Plus, ChevronUp, ChevronDown, Trash2, Plus as PlusIcon } from "lucide-react"
import Link from "next/link"

interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface PageData {
  slug: string
  name: string
  blocks: Block[]
}

export default function SiteBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [selectedPage, setSelectedPage] = useState("home")
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({
    home: [
      {
        id: "hero-1",
        type: "hero",
        title: "Hero Block",
        content: {
          title: "Welcome to Our Store",
          subtitle: "Discover amazing products at great prices",
          buttonText: "Shop Now",
          buttonLink: "/shop",
          backgroundImage: null
        }
      },
      {
        id: "features-1", 
        type: "features",
        title: "Features Block",
        content: {
          features: [
            { title: "Fast Shipping", description: "Free delivery in 2-3 days" },
            { title: "24/7 Support", description: "Always here to help you" },
            { title: "Quality Products", description: "Only the best for our customers" }
          ]
        }
      },
      {
        id: "cta-1",
        type: "cta", 
        title: "CTA Block",
        content: {
          title: "Ready to get started?",
          description: "Join thousands of satisfied customers",
          buttonText: "Contact Us",
          buttonLink: "/contact"
        }
      }
    ],
    about: [
      {
        id: "hero-2",
        type: "hero",
        title: "Hero Block",
        content: {
          title: "About Our Company",
          subtitle: "Learn more about our story and values",
          buttonText: "Learn More",
          buttonLink: "#story"
        }
      }
    ]
  })
  
  // Mock site data
  const siteData = {
    id: siteId,
    name: "mystore.domain.com",
    pages: {
      home: {
        slug: "home",
        name: "Home",
        blocks: [
          {
            id: "hero-1",
            type: "hero",
            title: "Hero Block",
            content: {
              title: "Welcome to Our Store",
              subtitle: "Discover amazing products at great prices",
              buttonText: "Shop Now",
              buttonLink: "/shop",
              backgroundImage: null
            }
          },
          {
            id: "features-1", 
            type: "features",
            title: "Features Block",
            content: {
              features: [
                { title: "Fast Shipping", description: "Free delivery in 2-3 days" },
                { title: "24/7 Support", description: "Always here to help you" },
                { title: "Quality Products", description: "Only the best for our customers" }
              ]
            }
          },
          {
            id: "cta-1",
            type: "cta", 
            title: "CTA Block",
            content: {
              title: "Ready to get started?",
              description: "Join thousands of satisfied customers",
              buttonText: "Contact Us",
              buttonLink: "/contact"
            }
          }
        ]
      },
      about: {
        slug: "about",
        name: "About",
        blocks: [
          {
            id: "hero-2",
            type: "hero",
            title: "Hero Block",
            content: {
              title: "About Our Company",
              subtitle: "Learn more about our story and values",
              buttonText: "Learn More",
              buttonLink: "#story"
            }
          }
        ]
      }
    }
  }
  
  const currentPage = {
    slug: selectedPage,
    name: selectedPage === 'home' ? 'Home' : selectedPage === 'about' ? 'About' : 'Contact',
    blocks: blocks[selectedPage] || []
  }
  
  // Site-specific block types
  const siteBlocks = [
    { type: "navigation", name: "Navigation Header", icon: "🧭" },
    { type: "hero", name: "Hero", icon: "🏛️" },
    { type: "features", name: "Features", icon: "⭐" },
    { type: "testimonials", name: "Testimonials", icon: "💬" },
    { type: "cta", name: "CTA", icon: "📞" },
    { type: "footer", name: "Footer", icon: "⬇️" },
  ]

  // Shared blocks (can be used across different content types)
  const sharedBlocks = [
    { type: "about", name: "About", icon: "ℹ️" },
    { type: "contact", name: "Contact", icon: "📧" },
  ]

  // Function to get default content for a block type
  const getDefaultContent = (blockType: string) => {
    switch (blockType) {
      case 'navigation':
        return {
          logo: { url: "/logo.png", alt: "Site Logo" },
          menuItems: [
            { id: "1", label: "Home", url: "/", order: 1 },
            { id: "2", label: "About", url: "/about", order: 2 },
            { id: "3", label: "Services", url: "/services", order: 3 },
            { id: "4", label: "Contact", url: "/contact", order: 4 }
          ],
          ctaButton: { label: "Get Started", url: "/signup" },
          showLogo: true,
          showCta: true,
          alignment: "center"
        }
      case 'hero':
        return {
          title: "Welcome to Our Site",
          subtitle: "Your business solution",
          buttonText: "Learn More",
          buttonLink: "/about",
          backgroundImage: null
        }
      case 'features':
        return {
          features: [
            { title: "Feature 1", description: "Description for feature 1" },
            { title: "Feature 2", description: "Description for feature 2" },
            { title: "Feature 3", description: "Description for feature 3" }
          ]
        }
      case 'testimonials':
        return {
          title: "What Our Customers Say",
          testimonials: [
            { name: "John Doe", text: "Great service!", rating: 5 },
            { name: "Jane Smith", text: "Highly recommended!", rating: 5 }
          ]
        }
      case 'cta':
        return {
          title: "Ready to get started?",
          description: "Join thousands of satisfied customers",
          buttonText: "Contact Us",
          buttonLink: "/contact"
        }
      case 'about':
        return {
          title: "About Us",
          content: "We are dedicated to providing the best service to our customers.",
          image: null
        }
      case 'contact':
        return {
          title: "Contact Us",
          description: "Get in touch with our team",
          email: "contact@example.com",
          phone: "+1 (555) 123-4567"
        }
      case 'footer':
        return {
          links: [
            { title: "Home", url: "/" },
            { title: "About", url: "/about" },
            { title: "Contact", url: "/contact" }
          ],
          copyright: "© 2024 Your Company. All rights reserved."
        }
      default:
        return {}
    }
  }

  // Function to add a new block
  const addBlock = (blockType: string) => {
    const newBlock = {
      id: `${blockType}-${Date.now()}`,
      type: blockType,
      title: `${blockType.charAt(0).toUpperCase() + blockType.slice(1)} Block`,
      content: getDefaultContent(blockType)
    }
    
    setBlocks(prev => ({
      ...prev,
      [selectedPage]: [...(prev[selectedPage] || []), newBlock]
    }))
  }

  return (
    <AdminLayout>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="border-b bg-background p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/admin/builder">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sites
                </Button>
              </Link>
              <div className="text-lg font-semibold">{siteData.name}</div>
              <Select value={selectedPage} onValueChange={setSelectedPage}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">🏠 Home</SelectItem>
                  <SelectItem value="about">📋 About</SelectItem>
                  <SelectItem value="contact">📞 Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button variant="outline" size="sm">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Publish
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - 3 Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Properties Panel */}
          <div className="w-[650px] border-r bg-muted/30 p-4 overflow-y-auto">
            {selectedBlock ? (
              <div>
                <h3 className="font-semibold mb-4">Block Properties</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Block: {selectedBlock.title}</label>
                  </div>
                  
                  {selectedBlock.type === 'hero' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">Title</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.title}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedPage][blockIndex] = {
                                ...updatedBlocks[selectedPage][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedPage][blockIndex].content,
                                  title: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
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
                            const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedPage][blockIndex] = {
                                ...updatedBlocks[selectedPage][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedPage][blockIndex].content,
                                  subtitle: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Button Text</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.buttonText}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedPage][blockIndex] = {
                                ...updatedBlocks[selectedPage][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedPage][blockIndex].content,
                                  buttonText: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Button Link</label>
                        <input 
                          type="text" 
                          value={selectedBlock.content.buttonLink}
                          className="w-full mt-1 px-3 py-2 border rounded-md"
                          onChange={(e) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedPage][blockIndex] = {
                                ...updatedBlocks[selectedPage][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedPage][blockIndex].content,
                                  buttonLink: e.target.value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Background Image</label>
                        <Button variant="outline" className="w-full mt-1">
                          Choose Image
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {selectedBlock.type === 'navigation' && (
                    <div className="space-y-4">
                      {/* Logo Settings */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Show Logo</label>
                          <input 
                            type="checkbox" 
                            checked={selectedBlock.content.showLogo}
                            onChange={(e) => {
                              const updatedBlocks = { ...blocks }
                              const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                              if (blockIndex !== -1) {
                                updatedBlocks[selectedPage][blockIndex] = {
                                  ...updatedBlocks[selectedPage][blockIndex],
                                  content: {
                                    ...updatedBlocks[selectedPage][blockIndex].content,
                                    showLogo: e.target.checked
                                  }
                                }
                                setBlocks(updatedBlocks)
                                setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </div>
                        {selectedBlock.content.showLogo && (
                          <div>
                            <label className="text-sm font-medium">Logo URL</label>
                            <input 
                              type="text" 
                              value={selectedBlock.content.logo?.url || ""}
                              className="w-full mt-1 px-3 py-2 border rounded-md"
                              onChange={(e) => {
                                const updatedBlocks = { ...blocks }
                                const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                if (blockIndex !== -1) {
                                  updatedBlocks[selectedPage][blockIndex] = {
                                    ...updatedBlocks[selectedPage][blockIndex],
                                    content: {
                                      ...updatedBlocks[selectedPage][blockIndex].content,
                                      logo: {
                                        ...updatedBlocks[selectedPage][blockIndex].content.logo,
                                        url: e.target.value
                                      }
                                    }
                                  }
                                  setBlocks(updatedBlocks)
                                  setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Menu Items */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Menu Items</label>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              const newItem = {
                                id: Date.now().toString(),
                                label: "New Item",
                                url: "/new-item",
                                order: (selectedBlock.content.menuItems?.length || 0) + 1
                              }
                              const updatedBlocks = { ...blocks }
                              const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                              if (blockIndex !== -1) {
                                updatedBlocks[selectedPage][blockIndex] = {
                                  ...updatedBlocks[selectedPage][blockIndex],
                                  content: {
                                    ...updatedBlocks[selectedPage][blockIndex].content,
                                    menuItems: [...(selectedBlock.content.menuItems || []), newItem]
                                  }
                                }
                                setBlocks(updatedBlocks)
                                setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                              }
                            }}
                          >
                            <PlusIcon className="w-4 h-4 mr-1" />
                            Add Item
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          {selectedBlock.content.menuItems?.map((item: any, index: number) => (
                            <div key={item.id} className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Item {index + 1}</span>
                                <div className="flex items-center space-x-1">
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    disabled={index === 0}
                                    onClick={() => {
                                      const updatedBlocks = { ...blocks }
                                      const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                      if (blockIndex !== -1) {
                                        const newMenuItems = [...selectedBlock.content.menuItems]
                                        const temp = newMenuItems[index]
                                        newMenuItems[index] = newMenuItems[index - 1]
                                        newMenuItems[index - 1] = temp
                                        updatedBlocks[selectedPage][blockIndex] = {
                                          ...updatedBlocks[selectedPage][blockIndex],
                                          content: {
                                            ...updatedBlocks[selectedPage][blockIndex].content,
                                            menuItems: newMenuItems
                                          }
                                        }
                                        setBlocks(updatedBlocks)
                                        setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                      }
                                    }}
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    disabled={index === selectedBlock.content.menuItems.length - 1}
                                    onClick={() => {
                                      const updatedBlocks = { ...blocks }
                                      const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                      if (blockIndex !== -1) {
                                        const newMenuItems = [...selectedBlock.content.menuItems]
                                        const temp = newMenuItems[index]
                                        newMenuItems[index] = newMenuItems[index + 1]
                                        newMenuItems[index + 1] = temp
                                        updatedBlocks[selectedPage][blockIndex] = {
                                          ...updatedBlocks[selectedPage][blockIndex],
                                          content: {
                                            ...updatedBlocks[selectedPage][blockIndex].content,
                                            menuItems: newMenuItems
                                          }
                                        }
                                        setBlocks(updatedBlocks)
                                        setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                      }
                                    }}
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => {
                                      const updatedBlocks = { ...blocks }
                                      const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                      if (blockIndex !== -1) {
                                        const newMenuItems = selectedBlock.content.menuItems.filter((_: any, i: number) => i !== index)
                                        updatedBlocks[selectedPage][blockIndex] = {
                                          ...updatedBlocks[selectedPage][blockIndex],
                                          content: {
                                            ...updatedBlocks[selectedPage][blockIndex].content,
                                            menuItems: newMenuItems
                                          }
                                        }
                                        setBlocks(updatedBlocks)
                                        setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <input 
                                type="text" 
                                value={item.label}
                                placeholder="Menu Label"
                                className="w-full px-2 py-1 text-sm border rounded"
                                onChange={(e) => {
                                  const updatedBlocks = { ...blocks }
                                  const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                  if (blockIndex !== -1) {
                                    const newMenuItems = [...selectedBlock.content.menuItems]
                                    newMenuItems[index] = { ...newMenuItems[index], label: e.target.value }
                                    updatedBlocks[selectedPage][blockIndex] = {
                                      ...updatedBlocks[selectedPage][blockIndex],
                                      content: {
                                        ...updatedBlocks[selectedPage][blockIndex].content,
                                        menuItems: newMenuItems
                                      }
                                    }
                                    setBlocks(updatedBlocks)
                                    setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                  }
                                }}
                              />
                              <input 
                                type="text" 
                                value={item.url}
                                placeholder="URL (e.g., /about)"
                                className="w-full px-2 py-1 text-sm border rounded"
                                onChange={(e) => {
                                  const updatedBlocks = { ...blocks }
                                  const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                  if (blockIndex !== -1) {
                                    const newMenuItems = [...selectedBlock.content.menuItems]
                                    newMenuItems[index] = { ...newMenuItems[index], url: e.target.value }
                                    updatedBlocks[selectedPage][blockIndex] = {
                                      ...updatedBlocks[selectedPage][blockIndex],
                                      content: {
                                        ...updatedBlocks[selectedPage][blockIndex].content,
                                        menuItems: newMenuItems
                                      }
                                    }
                                    setBlocks(updatedBlocks)
                                    setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                  }
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Show CTA Button</label>
                          <input 
                            type="checkbox" 
                            checked={selectedBlock.content.showCta}
                            onChange={(e) => {
                              const updatedBlocks = { ...blocks }
                              const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                              if (blockIndex !== -1) {
                                updatedBlocks[selectedPage][blockIndex] = {
                                  ...updatedBlocks[selectedPage][blockIndex],
                                  content: {
                                    ...updatedBlocks[selectedPage][blockIndex].content,
                                    showCta: e.target.checked
                                  }
                                }
                                setBlocks(updatedBlocks)
                                setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </div>
                        {selectedBlock.content.showCta && (
                          <>
                            <div>
                              <label className="text-sm font-medium">Button Text</label>
                              <input 
                                type="text" 
                                value={selectedBlock.content.ctaButton?.label || ""}
                                className="w-full mt-1 px-3 py-2 border rounded-md"
                                onChange={(e) => {
                                  const updatedBlocks = { ...blocks }
                                  const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                  if (blockIndex !== -1) {
                                    updatedBlocks[selectedPage][blockIndex] = {
                                      ...updatedBlocks[selectedPage][blockIndex],
                                      content: {
                                        ...updatedBlocks[selectedPage][blockIndex].content,
                                        ctaButton: {
                                          ...updatedBlocks[selectedPage][blockIndex].content.ctaButton,
                                          label: e.target.value
                                        }
                                      }
                                    }
                                    setBlocks(updatedBlocks)
                                    setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Button URL</label>
                              <input 
                                type="text" 
                                value={selectedBlock.content.ctaButton?.url || ""}
                                className="w-full mt-1 px-3 py-2 border rounded-md"
                                onChange={(e) => {
                                  const updatedBlocks = { ...blocks }
                                  const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                                  if (blockIndex !== -1) {
                                    updatedBlocks[selectedPage][blockIndex] = {
                                      ...updatedBlocks[selectedPage][blockIndex],
                                      content: {
                                        ...updatedBlocks[selectedPage][blockIndex].content,
                                        ctaButton: {
                                          ...updatedBlocks[selectedPage][blockIndex].content.ctaButton,
                                          url: e.target.value
                                        }
                                      }
                                    }
                                    setBlocks(updatedBlocks)
                                    setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                                  }
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Alignment */}
                      <div>
                        <label className="text-sm font-medium">Alignment</label>
                        <Select 
                          value={selectedBlock.content.alignment || "center"}
                          onValueChange={(value) => {
                            const updatedBlocks = { ...blocks }
                            const blockIndex = updatedBlocks[selectedPage].findIndex(b => b.id === selectedBlock.id)
                            if (blockIndex !== -1) {
                              updatedBlocks[selectedPage][blockIndex] = {
                                ...updatedBlocks[selectedPage][blockIndex],
                                content: {
                                  ...updatedBlocks[selectedPage][blockIndex].content,
                                  alignment: value
                                }
                              }
                              setBlocks(updatedBlocks)
                              setSelectedBlock(updatedBlocks[selectedPage][blockIndex])
                            }
                          }}
                        >
                          <SelectTrigger className="w-full mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t space-y-2">
                    <Button variant="destructive" className="w-full">
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
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-xl font-semibold mb-6">
                {currentPage.name} Page Blocks
              </h2>
              
              <div className="space-y-4">
                {currentPage.blocks.map((block) => (
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
                        <Button variant="ghost" size="sm">🗑️</Button>
                      </div>
                    </div>
                    
                    {/* Block Content Preview */}
                    <div className="text-sm text-muted-foreground space-y-1">
                      {block.type === 'navigation' && (
                        <>
                          <div>Logo: {block.content.showLogo ? "✓" : "✗"}</div>
                          <div>Menu Items: {block.content.menuItems?.length || 0} items</div>
                          <div>CTA: {block.content.showCta ? block.content.ctaButton?.label : "✗"}</div>
                          <div>Alignment: {block.content.alignment}</div>
                        </>
                      )}
                      {block.type === 'hero' && (
                        <>
                          <div>Title: {block.content.title}</div>
                          <div>Subtitle: {block.content.subtitle}</div>
                          <div>Button: {block.content.buttonText} → {block.content.buttonLink}</div>
                        </>
                      )}
                      {block.type === 'features' && (
                        <>
                          {block.content.features?.map((feature: any, index: number) => (
                            <div key={index}>Feature {index + 1}: {feature.title}</div>
                          ))}
                        </>
                      )}
                      {block.type === 'cta' && (
                        <>
                          <div>Title: {block.content.title}</div>
                          <div>Button: {block.content.buttonText} → {block.content.buttonLink}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Site Blocks & Shared Blocks (Sticky) */}
          <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto sticky top-0">
            {/* Site Blocks Section */}
            <div className="mb-6">
              <h3 className="font-semibold mb-4">Site Blocks</h3>
              <div className="space-y-2">
                {siteBlocks.map((block) => (
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