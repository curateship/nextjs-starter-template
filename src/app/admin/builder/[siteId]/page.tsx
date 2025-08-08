"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Eye, Save, Upload, Plus } from "lucide-react"
import Link from "next/link"
import { HeroRuixenBlock } from "@/components/admin/layout/site-builder/HeroRuixenBlock"
import { saveBlockCustomizationAction } from "@/lib/actions/site-customization-actions"
import { getSiteByIdAction, type SiteWithTheme } from "@/lib/actions/site-actions"

interface Block {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export default function SiteBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const [selectedPage, setSelectedPage] = useState("home")
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [site, setSite] = useState<SiteWithTheme | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteError, setSiteError] = useState("")
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({
    home: [
      {
        id: "hero-ruixen-1",
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
      }
    ],
    about: [],
    contact: []
  })

  // Load site data
  useEffect(() => {
    const loadSite = async () => {
      setSiteLoading(true)
      setSiteError("")
      
      const result = await getSiteByIdAction(siteId)
      
      if (result.data) {
        setSite(result.data)
      } else {
        setSiteError(result.error || 'Failed to load site')
      }
      
      setSiteLoading(false)
    }
    
    loadSite()
  }, [siteId])
  
  // Current page data
  const currentPage = {
    slug: selectedPage,
    name: selectedPage === 'home' ? 'Home' : selectedPage === 'about' ? 'About' : 'Contact',
    blocks: blocks[selectedPage] || []
  }

  // Available block types  
  const siteBlocks = [
    { type: "hero-ruixen", name: "Hero Section", icon: "🎯" }
  ]

  // Function to get default content for a block type
  const getDefaultContent = (blockType: string) => {
    switch (blockType) {
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
      default:
        return {}
    }
  }

  // Function to add a new block
  const addBlock = (blockType: string) => {
    const newBlock: Block = {
      id: `${blockType}-${Date.now()}`,
      type: blockType,
      title: blockType === 'hero-ruixen' ? 'Hero Section' : `${blockType} Block`,
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

  // Save all block customizations for the current page
  const handleSaveAllBlocks = async () => {    
    if (!site) {
      setSaveMessage("Site not loaded")
      return
    }
    
    if (!blocks[selectedPage] || blocks[selectedPage].length === 0) {
      setSaveMessage("No blocks to save")
      return
    }

    setIsSaving(true)
    setSaveMessage("")

    try {
      const savePromises = blocks[selectedPage].map(async (block) => {
        return saveBlockCustomizationAction({
          site_id: siteId,
          page_path: selectedPage === 'home' ? '/' : `/${selectedPage}`,
          block_type: block.type,
          block_identifier: block.id,
          customizations: block.content
        })
      })

      const results = await Promise.all(savePromises)
      
      const failedSaves = results.filter(r => !r.success)
      if (failedSaves.length > 0) {
        const firstError = failedSaves[0]?.error || 'Unknown error'
        setSaveMessage(`Error: ${firstError}`)
      } else {
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (error) {
      console.error('Error saving blocks:', error)
      setSaveMessage("Error saving blocks")
    } finally {
      setIsSaving(false)
    }
  }

  // Show loading state
  if (siteLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p>Loading site...</p>
        </div>
      </AdminLayout>
    )
  }

  // Show error state
  if (siteError || !site) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError || 'Site not found'}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Site ID: <code>{siteId}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please go to Sites page to get a valid site ID, or create a new site.
            </p>
            <div className="space-x-2">
              <Button asChild>
                <Link href="/admin/sites">Go to Sites</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/sites/new">Create New Site</Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="flex flex-col -m-4 -mt-6 h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-15 z-40">
          <div className="flex h-16 items-center px-6">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/sites">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sites
                </Link>
              </Button>
              <div className="h-4 w-px bg-border"></div>
              <h1 className="text-lg font-semibold">{site.name || 'Site Builder'}</h1>
              <div className="h-4 w-px bg-border"></div>
              <Select value={selectedPage} onValueChange={setSelectedPage}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">🏠 Home</SelectItem>
                  <SelectItem value="about">📋 About</SelectItem>
                  <SelectItem value="contact">📞 Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex items-center space-x-2">
              {saveMessage && (
                <span className={`text-sm ${saveMessage.includes('Error') || saveMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage}
                </span>
              )}
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button 
                size="sm" 
                onClick={handleSaveAllBlocks}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
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
              
              {currentPage.blocks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-muted-foreground mb-4">
                    <p className="text-lg font-medium">No blocks added yet</p>
                    <p className="text-sm">Add blocks from the right sidebar to start building your page</p>
                  </div>
                </div>
              ) : (
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
                        {block.type === 'hero-ruixen' && (
                          <>
                            <div>Title: {block.content.title}</div>
                            <div>Buttons: {block.content.primaryButton}, {block.content.secondaryButton}</div>
                            <div>Rainbow Button: {block.content.showRainbowButton ? "✓" : "✗"}</div>
                            <div>Particles: {block.content.showParticles ? "✓" : "✗"}</div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Site Blocks */}
          <div className="w-64 border-l bg-muted/30 p-4 overflow-y-auto">
            <div>
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
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}