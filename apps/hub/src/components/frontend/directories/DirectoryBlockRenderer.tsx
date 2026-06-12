import { CardGroup } from "@/components/ui/card"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { DirectoryCoreBlock } from "./core/DirectoryCoreBlock"
import { DirectoryCustomBlockSection } from "./DirectoryCustomBlockSection"
import { DirectoryGoogleMapBlock } from "./google-map/DirectoryGoogleMapBlock"
import { DirectoryOpeningHoursBlock } from "./opening-hours/DirectoryOpeningHoursBlock"
import { DirectoryRelatedListingBlock } from "./related-listing/DirectoryRelatedListingBlock"
import { DirectoryRichTextBlock } from "./rich-text/DirectoryRichTextBlock"
import type { ReactNode } from "react"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getDirectoryLayoutColumn } from "@/lib/actions/directories/directory-layout"
import {
  DIRECTORY_CORE_BLOCK_TYPE,
  normalizeDirectoryCoreContent,
} from "@/lib/actions/directories/directory-core"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from "@/lib/actions/directories/directory-google-map"
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from "@/lib/actions/directories/directory-opening-hours"
import { getRenderBlockContent, prepareBlocksForRender } from "@/lib/utils/frontend-blocks"
import { cn } from "@/lib/utils/tailwind"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"

interface DirectoryWithBlocks {
  id: string
  title: string
  slug: string
  featured_image?: string | null
  source_type?: string | null
  source_id?: string | null
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
  googleMapsEmbedApiKey?: string
  renderRichTextBody?: (block: DirectoryWithBlocks["blocks"][number], bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: DirectoryWithBlocks["blocks"][number]) => ReactNode
}

export function DirectoryBlockRenderer({
  site,
  directory,
  customBlockTemplates = {},
  breadcrumbs = [],
  isPreview = false,
  hideSiteChrome = false,
  googleMapsEmbedApiKey = '',
  renderRichTextBody,
  renderBlockOverlay,
}: DirectoryBlockRendererProps) {
  const { blocks: directoryBlocks = [] } = directory
  const siteChrome = resolveSiteChrome(site.settings)
  const hasFixedNavigation = Boolean(siteChrome.navigation && !isPreview && !hideSiteChrome)
  const getBlockContent = (block: DirectoryWithBlocks["blocks"][number]) => getRenderBlockContent(block, isPreview)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const sortedBlocks = prepareBlocksForRender(directoryBlocks, isPreview)
    .filter((block) =>
      block.type === DIRECTORY_CORE_BLOCK_TYPE ||
      block.type === 'directory-custom' ||
      block.type === 'directory-rich-text' ||
      block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE ||
      block.type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE ||
      block.type === 'directory-related-listing'
    )
    .map((block) => (
      block.type === DIRECTORY_CORE_BLOCK_TYPE
        ? {
            ...block,
            content: normalizeDirectoryCoreContent(block.content),
          }
        : block
    ))
  const visibleBlocks = sortedBlocks

  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)
  const loginPath = typeof siteChrome.navigation?.accountMenu?.login?.url === 'string' && siteChrome.navigation.accountMenu.login.url.trim()
    ? siteChrome.navigation.accountMenu.login.url
    : "/account"
  const mainBlocks = visibleBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'main')
  const sidebarBlocks = visibleBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'sidebar')
  const outerContainerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined

  function isStickyBlock(block: DirectoryWithBlocks["blocks"][number]) {
    return block.type === DIRECTORY_CORE_BLOCK_TYPE && block.content?.sticky === true
  }

  const mainHasStickyBlock = mainBlocks.some(isStickyBlock)
  const sidebarHasStickyBlock = sidebarBlocks.some(isStickyBlock)
  const containerClassName = siteWidth === 'custom' ? "mx-auto px-6" : "px-6"

  function getBlockCardProps(
    block: DirectoryWithBlocks["blocks"][number],
    className?: string
  ) {
    return {
      "data-block-id": block.id,
      "data-block-type": block.type,
      className: cn(
        className,
        isStickyBlock(block) && "lg:sticky lg:self-start",
        isStickyBlock(block) && (hasFixedNavigation ? "lg:top-28" : "lg:top-10")
      ),
    }
  }

  function renderDirectoryBlock(block: DirectoryWithBlocks["blocks"][number]) {
    const blockContent = getBlockContent(block)

    if (block.type === DIRECTORY_CORE_BLOCK_TYPE) {
      return (
        <DirectoryCoreBlock
          key={`directory-core-${block.id}`}
          content={blockContent}
          directory={directory}
          loginPath={loginPath}
          siteId={site.id}
          cardProps={getBlockCardProps(block, "overflow-hidden")}
        />
      )
    }

    if (block.type === 'directory-rich-text') {
      const bodyHtml = typeof blockContent?.body === 'string' ? blockContent.body : ''
      const visibility = blockContent?.visibility && typeof blockContent.visibility === 'object'
        ? blockContent.visibility as Record<string, boolean>
        : {}

      if (!renderRichTextBody && (visibility.body === false || !bodyHtml.trim())) {
        return null
      }

      const inlineBody = renderRichTextBody?.(block, bodyHtml)

      return (
        <DirectoryRichTextBlock
          key={`directory-rich-text-${block.id}`}
          content={blockContent}
          cardOverlay={renderBlockOverlay?.(block)}
          cardProps={getBlockCardProps(block, "relative group/directory-preview-block")}
        >
          {inlineBody}
        </DirectoryRichTextBlock>
      )
    }

    if (block.type === 'directory-custom') {
      const templateId = blockContent?.templateId
      const template = typeof templateId === 'string' ? customBlockTemplates[templateId] : undefined

      if (!template) {
        return null
      }

      return (
        <DirectoryCustomBlockSection
          key={`directory-custom-${block.id}`}
          template={template}
          values={blockContent?.values && typeof blockContent.values === 'object' ? blockContent.values : {}}
          cardProps={getBlockCardProps(block)}
        />
      )
    }

    if (block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) {
      return (
        <DirectoryGoogleMapBlock
          key={`directory-google-map-${block.id}`}
          content={blockContent}
          isPreview={isPreview}
          apiKey={googleMapsEmbedApiKey}
          cardProps={getBlockCardProps(block)}
        />
      )
    }

    if (block.type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE) {
      return (
        <DirectoryOpeningHoursBlock
          key={`directory-opening-hours-${block.id}`}
          content={blockContent}
          sourceType={directory.source_type}
          sourceId={directory.source_id}
          isPreview={isPreview}
          siteId={isPreview ? site.id : undefined}
          cardProps={getBlockCardProps(block)}
        />
      )
    }

    if (block.type === 'directory-related-listing') {
      return (
        <DirectoryRelatedListingBlock
          key={`directory-related-listing-${block.id}`}
          content={blockContent}
          siteId={site.id}
          directory={directory}
          isPreview={isPreview}
          cardProps={getBlockCardProps(block)}
        />
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
            {/* grid-cols-1 (minmax(0,1fr)) lets cards shrink below their content's min width on mobile — a bare `grid` track sizes to the widest nowrap content and overflows the viewport */}
            <CardGroup className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.36fr)_minmax(224px,0.64fr)] lg:items-start">
              <CardGroup className={cn("grid grid-cols-1 gap-6 lg:order-2", sidebarHasStickyBlock && "lg:self-stretch")}>
                {sidebarBlocks.map((block) => renderDirectoryBlock(block))}
              </CardGroup>
              <CardGroup className={cn("grid grid-cols-1 gap-6 lg:order-1", mainHasStickyBlock && "lg:self-stretch")}>
                {mainBlocks.map((block) => renderDirectoryBlock(block))}
              </CardGroup>
            </CardGroup>
          </div>
        ) : (
          <CardGroup className={cn(containerClassName, "grid grid-cols-1 gap-6")} style={outerContainerStyle}>
            {[...sidebarBlocks, ...mainBlocks].map((block) => renderDirectoryBlock(block))}
          </CardGroup>
        )}
      </SiteLayout>
  )
}
