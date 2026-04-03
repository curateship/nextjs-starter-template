import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { DIRECTORY_CONTENT_STYLE_RENDERERS } from "./directory-content-styles"
import { DirectoryCustomBlockSection } from "./DirectoryCustomBlockSection"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryWithBlocks {
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

interface DirectoryBlockRendererProps {
  site: SiteWithBlocks
  directory: DirectoryWithBlocks
  customBlockTemplates?: Record<string, DirectoryCustomBlockTemplate>
}

function DirectoryContentStyled({
  block,
  directory,
  siteWidth,
  customWidth,
}: {
  block: { id: string; type: string; content: Record<string, any> }
  directory: DirectoryWithBlocks
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}) {
  const styleName = block.content.directoryContentStyle || 'default'
  const styleConfig = block.content.styleConfig || {}
  const config = styleConfig[styleName] || {}

  const Renderer = DIRECTORY_CONTENT_STYLE_RENDERERS[styleName] || DIRECTORY_CONTENT_STYLE_RENDERERS.default

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className="pb-2 px-4">
        <Renderer
          config={config}
          sharedContent={{
            title: directory.title,
            description: directory.description,
            featuredImage: directory.featured_image,
            showFeaturedImage: block.content.showFeaturedImage ?? true,
            body: block.content.body,
          }}
        />
      </div>
    </BlockContainer>
  )
}

export function DirectoryBlockRenderer({ site, directory, customBlockTemplates = {} }: DirectoryBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: directoryBlocks = [] } = directory

  // Sort directory blocks by display_order
  const sortedBlocks = directoryBlocks.sort((a, b) => a.display_order - b.display_order)

  // Find navigation and footer from site blocks
  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')

  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;

  return (
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
        {/* Directory Blocks */}
        {sortedBlocks.map((block) => {
          // Skip navigation and footer blocks as they're handled by SiteLayout
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          if (block.type === 'directory-content') {
            return (
              <div key={`directory-content-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <DirectoryContentStyled
                block={block}
                directory={directory}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
              </div>
            )
          }

          if (block.type === 'directory-custom') {
            const templateId = block.content?.templateId
            const template = typeof templateId === 'string' ? customBlockTemplates[templateId] : undefined

            if (!template) {
              return null
            }

            return (
              <div key={`directory-custom-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
                <DirectoryCustomBlockSection
                  template={template}
                  values={block.content?.values && typeof block.content.values === 'object' ? block.content.values : {}}
                  siteWidth={siteWidth}
                  customWidth={customWidth}
                />
              </div>
            )
          }

          return null
        })}
      </SiteLayout>
  )
}
