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
  blocksLoading?: boolean
}

export function PagePreview({ blocks, site, allBlocks, className = "", blocksLoading = false }: PagePreviewProps) {
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
          {blocksLoading ? (
            // Preview skeleton loading state
            <div className="space-y-6 p-6">
              {/* Header skeleton */}
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2"></div>
              </div>
              
              {/* Content blocks skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-gray-100 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : blocks.length === 0 ? (
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