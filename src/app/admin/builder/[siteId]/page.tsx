"use client"

import { useState } from "react"
import { use } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Eye, Save, Upload, Plus, ChevronUp, ChevronDown, Trash2, Plus as PlusIcon } from "lucide-react"
import Link from "next/link"
import { HeroRuixenBlock } from "@/components/admin/layout/site-builder/HeroRuixenBlock"

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
        type: "hero-ruixen",
        title: "Hero Section",
        content: {
          title: "Build Exceptional Interfaces with Ease",
          subtitle: "Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs.",
          primaryButton: "Get Started",
          secondaryButton: "Browse Components",
          showRainbowButton: true,
          githubLink: "https://github.com/ruixenui/ruixen-free-components",
          showParticles: true
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
        type: "hero-ruixen", 
        title: "Hero Section",
        content: {
          title: "About Our Company",
          subtitle: "Learn more about our story and values",
          primaryButton: "Learn More",
          secondaryButton: "Our Story",
          showRainbowButton: false,
          githubLink: "",
          showParticles: true
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
            type: "hero-ruixen",
            title: "Hero Section",
            content: {
              title: "Build Exceptional Interfaces with Ease",
              subtitle: "Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs.",
              primaryButton: "Get Started",
              secondaryButton: "Browse Components",
              showRainbowButton: true,
              githubLink: "https://github.com/ruixenui/ruixen-free-components",
              showParticles: true
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
            type: "hero-ruixen",
            title: "Hero Section", 
            content: {
              title: "About Our Company",
              subtitle: "Learn more about our story and values",
              primaryButton: "Learn More",
              secondaryButton: "Our Story",
              showRainbowButton: false,
              githubLink: "",
              showParticles: true
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
    { type: "hero-ruixen", name: "Hero Section", icon: "🎯" },
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
      case 'hero-ruixen':
        return {
          title: "Build Exceptional Interfaces with Ease",
          subtitle: "Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs.",
          primaryButton: "Get Started",
          secondaryButton: "Browse Components",
          showRainbowButton: true,
          githubLink: "https://github.com/ruixenui/ruixen-free-components",
          showParticles: true
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
    const newBlock: Block = {
      id: `${blockType}-${Date.now()}`,
      type: blockType,
      title: getDefaultContent(blockType).title || `${blockType} Block`,
      content: getDefaultContent(blockType)
    }
    
    setBlocks(prev => ({
      ...prev,
      [selectedPage]: [...(prev[selectedPage] || []), newBlock]
    }))
  }

  const deleteBlock = (blockId: string) => {
    setBlocks(prev => ({
      ...prev,
      [selectedPage]: prev[selectedPage].filter(block => block.id !== blockId)
    }))
    
    // Clear selected block if it was the one being deleted
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null)
    }
  }

  // Helper function to update block content
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

  return (
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        {/* Header */}
        <div className="border-b bg-background p-4 sticky top-15 z-40">
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
        <div className="flex-1 flex">
          {/* Left Sidebar - Properties Panel */}
          <div className="w-[845px] border-r bg-muted/30 p-4 overflow-y-auto">
            {selectedBlock ? (
              <div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Edit {selectedBlock.title}</label>
                  </div>
                  
                  {selectedBlock.type === 'hero-ruixen' && (
                    <HeroRuixenBlock
                      title={selectedBlock.content.title || ''}
                      subtitle={selectedBlock.content.subtitle || ''}
                      primaryButton={selectedBlock.content.primaryButton || ''}
                      secondaryButton={selectedBlock.content.secondaryButton || ''}
                      showRainbowButton={selectedBlock.content.showRainbowButton || false}
                      githubLink={selectedBlock.content.githubLink || ''}
                      showParticles={selectedBlock.content.showParticles || false}
                      onTitleChange={(value) => updateBlockContent('title', value)}
                      onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                      onPrimaryButtonChange={(value) => updateBlockContent('primaryButton', value)}
                      onSecondaryButtonChange={(value) => updateBlockContent('secondaryButton', value)}
                      onShowRainbowButtonChange={(value) => updateBlockContent('showRainbowButton', value)}
                      onGithubLinkChange={(value) => updateBlockContent('githubLink', value)}
                      onShowParticlesChange={(value) => updateBlockContent('showParticles', value)}
                    />
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
                    <Button variant="destructive" className="w-full" onClick={() => deleteBlock(selectedBlock.id)}>
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
                        <Button variant="ghost" size="sm" onClick={(e) => {
                          e.stopPropagation();
                          deleteBlock(block.id);
                        }}>🗑️</Button>
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
                      {block.type === 'hero-ruixen' && (
                        <>
                          <div>Title: {block.content.title}</div>
                          <div>Buttons: {block.content.primaryButton}, {block.content.secondaryButton}</div>
                          <div>Rainbow Button: {block.content.showRainbowButton ? "✓" : "✗"}</div>
                          <div>Particles: {block.content.showParticles ? "✓" : "✗"}</div>
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

          {/* Right Sidebar - Site Blocks & Shared Blocks */}
          <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
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