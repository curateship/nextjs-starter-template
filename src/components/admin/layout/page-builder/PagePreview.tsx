"use client"

import { BlockRenderer } from "@/components/frontend/layout/pages/page-block-renderer"
import { createPreviewSite } from "@/lib/utils/admin-to-frontend-blocks"
import type { Block } from "@/lib/actions/page-blocks-actions"

interface PagePreviewProps {
  blocks: Block[]
  site?: {
    id: string
    name: string
    subdomain: string
  }
  allBlocks?: Record<string, Block[]>
  className?: string
}

export function PagePreview({ blocks, site, allBlocks, className = "" }: PagePreviewProps) {
  // Combine page blocks with navigation and footer from allBlocks
  let allPreviewBlocks = [...blocks]
  
  if (allBlocks) {
    // Find navigation and footer blocks from all pages (they're usually on 'home' or 'global')
    const navigationBlock = Object.values(allBlocks).flat().find(block => block.type === 'navigation')
    const footerBlock = Object.values(allBlocks).flat().find(block => block.type === 'footer')
    
    // Add navigation and footer if they exist and aren't already in the page blocks
    if (navigationBlock && !blocks.some(b => b.type === 'navigation')) {
      allPreviewBlocks.unshift(navigationBlock)
    }
    if (footerBlock && !blocks.some(b => b.type === 'footer')) {
      allPreviewBlocks.push(footerBlock)
    }
  }
  
  // Transform admin blocks to frontend format
  const previewSite = createPreviewSite(allPreviewBlocks, site)
  
  return (
    <div className={`overflow-x-hidden ${className}`}>
      <div 
        style={{
          zoom: 0.8,
          width: '100%',
          contain: 'layout style', // Create new containing block
          position: 'relative',
        }}
      >
        <div className="bg-background">
          {blocks.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">No blocks added yet</div>
                <div className="text-sm">Add blocks to see your page preview</div>
              </div>
            </div>
          ) : (
            <BlockRenderer site={previewSite} />
          )}
        </div>
      </div>
    </div>
  )
}