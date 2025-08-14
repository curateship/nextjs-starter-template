"use client"

import { BlockRenderer } from "@/components/frontend/layout/block-renderer"
import { createPreviewSite } from "@/lib/utils/admin-to-frontend-blocks"
import type { Block } from "@/lib/actions/page-blocks-actions"

interface PagePreviewProps {
  blocks: Block[]
  site?: {
    id: string
    name: string
    subdomain: string
  }
  className?: string
}

export function PagePreview({ blocks, site, className = "" }: PagePreviewProps) {
  // Transform admin blocks to frontend format
  const previewSite = createPreviewSite(blocks, site)
  
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