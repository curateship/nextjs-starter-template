"use client"

import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"

interface PagePreviewProps {
  blocks: PreviewBlock[]
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  // allBlocks parameter removed - navigation/footer now come from site.settings
  className?: string
  blocksLoading?: boolean
}

export function PagePreview({ blocks, site, className = "", blocksLoading = false }: PagePreviewProps) {
  // Create preview site - navigation and footer will be added from site.settings automatically
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
          {blocksLoading ? (
            // Preview skeleton loading state
            <div className="space-y-6 p-6">
              {/* Header skeleton */}
              <div className="space-y-4">
                <div className="h-8 bg-muted rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-muted/60 rounded animate-pulse w-1/2"></div>
              </div>
              
              {/* Content blocks skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-muted rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted/60 rounded animate-pulse"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-muted/60 rounded animate-pulse"></div>
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