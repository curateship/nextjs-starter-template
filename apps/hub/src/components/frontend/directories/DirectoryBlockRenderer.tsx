import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { DirectoryCoreBlock } from "./core/DirectoryCoreBlock"
import { DirectoryCustomBlockSection } from "./DirectoryCustomBlockSection"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getDirectoryLayoutColumn } from "@/lib/actions/directories/directory-layout"
import {
  DIRECTORY_CORE_BLOCK_TYPE,
  normalizeDirectoryCoreContent,
} from "@/lib/actions/directories/directory-core"
import { cn } from "@/lib/utils/tailwind"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"

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
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
}

export function DirectoryBlockRenderer({ site, directory, customBlockTemplates = {}, breadcrumbs = [], isPreview = false, hideSiteChrome = false }: DirectoryBlockRendererProps) {
  const { blocks: directoryBlocks = [] } = directory
  const siteChrome = resolveSiteChrome(site.settings)
  const hasFixedNavigation = Boolean(siteChrome.navigation && !isPreview && !hideSiteChrome)

  // Sort directory blocks by display_order
  const sortedBlocks = [...directoryBlocks]
    .sort((a, b) => a.display_order - b.display_order)
    .filter((block) => block.type === DIRECTORY_CORE_BLOCK_TYPE || block.type === 'directory-custom')
    .map((block) => (
      block.type === DIRECTORY_CORE_BLOCK_TYPE
        ? {
            ...block,
            content: normalizeDirectoryCoreContent(block.content),
          }
        : block
    ))

  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)
  const mainBlocks = sortedBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'main')
  const sidebarBlocks = sortedBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'sidebar')
  const outerContainerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined

  function isStickyBlock(block: DirectoryWithBlocks["blocks"][number]) {
    return block.type === DIRECTORY_CORE_BLOCK_TYPE && block.content?.sticky === true
  }

  const mainHasStickyBlock = mainBlocks.some(isStickyBlock)
  const sidebarHasStickyBlock = sidebarBlocks.some(isStickyBlock)
  const containerClassName = cn(siteWidth === 'custom' ? "mx-auto px-6" : "px-6", "mt-6")

  function renderDirectoryBlock(block: DirectoryWithBlocks["blocks"][number]) {
    if (block.type === DIRECTORY_CORE_BLOCK_TYPE) {
      return (
        <div
          key={`directory-core-${block.id}`}
          data-block-id={block.id}
          data-block-type={block.type}
          className={cn(
            isStickyBlock(block) && "lg:sticky lg:self-start",
            isStickyBlock(block) && (hasFixedNavigation ? "lg:top-28" : "lg:top-10")
          )}
        >
          <DirectoryCoreBlock
            content={block.content}
            directory={directory}
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
          />
        </div>
      )
    }

    return null
  }

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
        <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />
        {sidebarBlocks.length > 0 && mainBlocks.length > 0 ? (
          <div
            className={containerClassName}
            style={outerContainerStyle}
          >
            <div className="grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1.36fr)_minmax(224px,0.64fr)] lg:items-start">
              <div className={cn("space-y-8 lg:order-2 lg:space-y-10", sidebarHasStickyBlock && "lg:self-stretch")}>
                {sidebarBlocks.map((block) => renderDirectoryBlock(block))}
              </div>
              <div className={cn("space-y-8 lg:order-1 lg:space-y-10", mainHasStickyBlock && "lg:self-stretch")}>
                {mainBlocks.map((block) => renderDirectoryBlock(block))}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(containerClassName, "space-y-6 lg:space-y-10")} style={outerContainerStyle}>
            {[...sidebarBlocks, ...mainBlocks].map((block) => renderDirectoryBlock(block))}
          </div>
        )}
      </SiteLayout>
  )
}
