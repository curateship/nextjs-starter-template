"use client"

import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface TaxonomyWithBlocks {
  id: string
  title: string
  slug: string
  description?: string | null
  featured_image?: string | null
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }>
}

interface TaxonomyBlockRendererProps {
  site: SiteWithBlocks
  taxonomy: TaxonomyWithBlocks
}

export function TaxonomyBlockRenderer({ site, taxonomy }: TaxonomyBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: taxonomyBlocks = [] } = taxonomy

  // Sort taxonomy blocks by display_order
  const sortedBlocks = taxonomyBlocks.sort((a, b) => a.display_order - b.display_order)

  // Find navigation and footer from site blocks
  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')

  // Get animation settings from site settings
  const animationSettings = site.settings?.animations;

  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;

  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
        {/* Taxonomy Header */}
        <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
          <div className="py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">{taxonomy.title}</h1>
              {taxonomy.description && (
                <div
                  className="prose prose-sm max-w-none mb-6 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: taxonomy.description }}
                />
              )}
              {taxonomy.featured_image && (
                <img
                  src={taxonomy.featured_image}
                  alt={taxonomy.title}
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}
            </div>
          </div>
        </BlockContainer>

        {/* Taxonomy Blocks */}
        {sortedBlocks.map((block) => {
          // Skip navigation and footer blocks as they're handled by SiteLayout
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          // Render taxonomy-specific blocks here
          if (block.type === 'taxonomy-default') {
            return (
              <BlockContainer
                key={`taxonomy-default-${block.id}`}
                siteWidth={siteWidth}
                customWidth={customWidth}
              >
                <div className="py-8 px-4">
                  <div className="max-w-4xl mx-auto">
                    <div className="border rounded-lg p-6 bg-card text-card-foreground">
                      <h3 className="text-lg font-semibold mb-2">Tag Information</h3>
                      <p className="text-sm text-muted-foreground">
                        This is a taxonomy default block. Additional content can be added here.
                      </p>
                    </div>
                  </div>
                </div>
              </BlockContainer>
            )
          }

          return null
        })}
      </SiteLayout>
    </AnimationProvider>
  )
}
