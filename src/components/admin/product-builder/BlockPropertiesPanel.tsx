import { ProductDefaultBlock } from "@/components/admin/product-builder/blocks/ProductDefaultBlock"
import { ProductHeroBlock } from "@/components/admin/product-builder/blocks/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/product-builder/blocks/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/product-builder/blocks/ProductGalleryBlock"
import { ProductFeaturesBlock } from "@/components/admin/product-builder/blocks/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/admin/product-builder/blocks/ProductHotspotBlock"
import { ProductPricingBlock } from "@/components/admin/product-builder/blocks/ProductPricingBlock"
import { ProductFAQBlock } from "@/components/admin/product-builder/blocks/ProductFAQBlock"
import { ProductListingViewBlock } from "@/components/admin/product-builder/blocks/ProductListingViewBlock"
import { ProductPreview } from "./ProductPreview"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  selectedBlock: ProductBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentProduct?: {
    slug: string
    name: string
    blocks: ProductBlock[]
    id?: string
    title?: string
    meta_description?: string
    site_id?: string
    featured_image?: string | null
    description?: string | null
    is_published?: boolean
  }
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
    }
  }
  // allBlocks removed - navigation/footer now come from site.settings
  blocksLoading?: boolean
  onOpenProductSettings?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentProduct,
  site,
  blocksLoading = false,
  onOpenProductSettings
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'product-default' && (
              <ProductDefaultBlock
                title={currentProduct?.title || currentProduct?.name || ''}
                richText={currentProduct?.description || ''}
                featuredImage={currentProduct?.featured_image || ''}
                onOpenSettings={onOpenProductSettings}
              />
            )}
            
            {selectedBlock.type === 'product-hero' && (
              <ProductHeroBlock
                title={selectedBlock.content.title || ''}
                subtitle={selectedBlock.content.subtitle || ''}
                primaryButton={selectedBlock.content.primaryButton || ''}
                secondaryButton={selectedBlock.content.secondaryButton || ''}
                primaryButtonLink={selectedBlock.content.primaryButtonLink || ''}
                secondaryButtonLink={selectedBlock.content.secondaryButtonLink || ''}
                primaryButtonStyle={selectedBlock.content.primaryButtonStyle || 'primary'}
                secondaryButtonStyle={selectedBlock.content.secondaryButtonStyle || 'outline'}
                showRainbowButton={selectedBlock.content.showRainbowButton || false}
                rainbowButtonText={selectedBlock.content.rainbowButtonText || ''}
                rainbowButtonIcon={selectedBlock.content.rainbowButtonIcon || 'github'}
                githubLink={selectedBlock.content.githubLink || ''}
                showParticles={selectedBlock.content.showParticles || false}
                trustedByText={selectedBlock.content.trustedByText || ''}
                trustedByCount={selectedBlock.content.trustedByCount || ''}
                trustedByAvatars={selectedBlock.content.trustedByAvatars || [
                  { src: "", alt: "User 1", fallback: "U1" },
                  { src: "", alt: "User 2", fallback: "U2" },
                  { src: "", alt: "User 3", fallback: "U3" }
                ]}
                backgroundPattern={selectedBlock.content.backgroundPattern || 'dots'}
                backgroundPatternSize={selectedBlock.content.backgroundPatternSize || 'medium'}
                backgroundPatternOpacity={selectedBlock.content.backgroundPatternOpacity || 80}
                backgroundPatternColor={selectedBlock.content.backgroundPatternColor || '#a3a3a3'}
                heroImage={selectedBlock.content.heroImage || ''}
                showHeroImage={selectedBlock.content.showHeroImage || false}
                showTrustedByBadge={selectedBlock.content.showTrustedByBadge ?? true}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onPrimaryButtonChange={(value) => updateBlockContent('primaryButton', value)}
                onSecondaryButtonChange={(value) => updateBlockContent('secondaryButton', value)}
                onPrimaryButtonLinkChange={(value) => updateBlockContent('primaryButtonLink', value)}
                onSecondaryButtonLinkChange={(value) => updateBlockContent('secondaryButtonLink', value)}
                onPrimaryButtonStyleChange={(value) => updateBlockContent('primaryButtonStyle', value)}
                onSecondaryButtonStyleChange={(value) => updateBlockContent('secondaryButtonStyle', value)}
                onShowRainbowButtonChange={(value) => updateBlockContent('showRainbowButton', value)}
                onRainbowButtonTextChange={(value) => updateBlockContent('rainbowButtonText', value)}
                onRainbowButtonIconChange={(value) => updateBlockContent('rainbowButtonIcon', value)}
                onGithubLinkChange={(value) => updateBlockContent('githubLink', value)}
                onShowParticlesChange={(value) => updateBlockContent('showParticles', value)}
                onTrustedByTextChange={(value) => updateBlockContent('trustedByText', value)}
                onTrustedByCountChange={(value) => updateBlockContent('trustedByCount', value)}
                onTrustedByAvatarsChange={(avatars) => updateBlockContent('trustedByAvatars', avatars)}
                onBackgroundPatternChange={(value) => updateBlockContent('backgroundPattern', value)}
                onBackgroundPatternSizeChange={(value) => updateBlockContent('backgroundPatternSize', value)}
                onBackgroundPatternOpacityChange={(value) => updateBlockContent('backgroundPatternOpacity', value)}
                onBackgroundPatternColorChange={(value) => updateBlockContent('backgroundPatternColor', value)}
                onHeroImageChange={(value) => updateBlockContent('heroImage', value)}
                onShowHeroImageChange={(value) => updateBlockContent('showHeroImage', value)}
                onShowTrustedByBadgeChange={(value) => updateBlockContent('showTrustedByBadge', value)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-details' && (
              <ProductDetailsBlock
                description={selectedBlock.content.description || ''}
                specifications={selectedBlock.content.specifications || []}
                onDescriptionChange={(value) => updateBlockContent('description', value)}
                onSpecificationsChange={(specs) => updateBlockContent('specifications', specs)}
              />
            )}
            
            {selectedBlock.type === 'product-gallery' && (
              <ProductGalleryBlock
                images={selectedBlock.content.images || []}
                showThumbnails={selectedBlock.content.showThumbnails || false}
                onImagesChange={(images) => updateBlockContent('images', images)}
                onShowThumbnailsChange={(show) => updateBlockContent('showThumbnails', show)}
              />
            )}
            
            {selectedBlock.type === 'product-features' && (
              <ProductFeaturesBlock
                headerTitle={selectedBlock.content.headerTitle ?? ''}
                headerSubtitle={selectedBlock.content.headerSubtitle ?? ''}
                headerAlign={selectedBlock.content.headerAlign || 'left'}
                features={selectedBlock.content.features || []}
                onHeaderTitleChange={(value) => updateBlockContent('headerTitle', value)}
                onHeaderSubtitleChange={(value) => updateBlockContent('headerSubtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onFeaturesChange={(features) => updateBlockContent('features', features)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-hotspot' && (
              <ProductHotspotBlock
                title={selectedBlock.content.title ?? 'Interactive Product Overview'}
                subtitle={selectedBlock.content.subtitle ?? 'Hover over the blinking dots to discover more about our features'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                backgroundImage={selectedBlock.content.backgroundImage || ''}
                hotspots={selectedBlock.content.hotspots || []}
                showTooltipsAlways={selectedBlock.content.showTooltipsAlways || false}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onBackgroundImageChange={(value) => updateBlockContent('backgroundImage', value)}
                onHotspotsChange={(hotspots) => updateBlockContent('hotspots', hotspots)}
                onShowTooltipsAlwaysChange={(value) => updateBlockContent('showTooltipsAlways', value)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-pricing' && (
              <ProductPricingBlock
                headerTitle={selectedBlock.content.headerTitle ?? 'Pricing'}
                headerSubtitle={selectedBlock.content.headerSubtitle ?? 'Check out our affordable pricing plans below and choose the one that suits you best.'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                tiers={selectedBlock.content.tiers || []}
                onHeaderTitleChange={(value) => updateBlockContent('headerTitle', value)}
                onHeaderSubtitleChange={(value) => updateBlockContent('headerSubtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onTiersChange={(tiers) => updateBlockContent('tiers', tiers)}
              />
            )}
            
            {selectedBlock.type === 'faq' && (
              <ProductFAQBlock
                title={selectedBlock.content.title ?? 'Product FAQ'}
                subtitle={selectedBlock.content.subtitle ?? 'Get answers to common questions about this product, its features, compatibility, and support options.'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                faqItems={selectedBlock.content.faqItems || []}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onFaqItemsChange={(faqItems) => updateBlockContent('faqItems', faqItems)}
              />
            )}
            
            {selectedBlock.type === 'listing-views' && (
              <ProductListingViewBlock
                title={selectedBlock.content.title ?? 'Latest Products'}
                subtitle={selectedBlock.content.subtitle ?? 'Check out our products'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                contentType={selectedBlock.content.contentType ?? 'products'}
                displayMode={selectedBlock.content.displayMode ?? 'grid'}
                itemsToShow={selectedBlock.content.itemsToShow ?? 6}
                columns={selectedBlock.content.columns ?? 3}
                sortBy={selectedBlock.content.sortBy ?? 'date'}
                sortOrder={selectedBlock.content.sortOrder ?? 'desc'}
                showImage={selectedBlock.content.showImage ?? true}
                showTitle={selectedBlock.content.showTitle ?? true}
                showDescription={selectedBlock.content.showDescription ?? true}
                isPaginated={selectedBlock.content.isPaginated ?? false}
                itemsPerPage={selectedBlock.content.itemsPerPage ?? 12}
                viewAllText={selectedBlock.content.viewAllText ?? ''}
                viewAllLink={selectedBlock.content.viewAllLink ?? ''}
                backgroundColor={selectedBlock.content.backgroundColor ?? '#ffffff'}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onContentTypeChange={(value) => updateBlockContent('contentType', value)}
                onDisplayModeChange={(value) => updateBlockContent('displayMode', value)}
                onItemsToShowChange={(value) => updateBlockContent('itemsToShow', value)}
                onColumnsChange={(value) => updateBlockContent('columns', value)}
                onSortByChange={(value) => updateBlockContent('sortBy', value)}
                onSortOrderChange={(value) => updateBlockContent('sortOrder', value)}
                onShowImageChange={(value) => updateBlockContent('showImage', value)}
                onShowTitleChange={(value) => updateBlockContent('showTitle', value)}
                onShowDescriptionChange={(value) => updateBlockContent('showDescription', value)}
                onIsPaginatedChange={(value) => updateBlockContent('isPaginated', value)}
                onItemsPerPageChange={(value) => updateBlockContent('itemsPerPage', value)}
                onViewAllTextChange={(value) => updateBlockContent('viewAllText', value)}
                onViewAllLinkChange={(value) => updateBlockContent('viewAllLink', value)}
                onBackgroundColorChange={(value) => updateBlockContent('backgroundColor', value)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <ProductPreview 
            blocks={currentProduct?.blocks || []} 
            product={currentProduct ? {
              id: currentProduct.id || 'preview',
              title: currentProduct.title || currentProduct.name,
              slug: currentProduct.slug,
              meta_description: currentProduct.meta_description,
              site_id: currentProduct.site_id || siteId,
              featured_image: currentProduct.featured_image || null,
              description: currentProduct.description || null,
              is_published: currentProduct.is_published || false
            } : undefined}
            site={site}
            className="h-full"
            blocksLoading={blocksLoading}
          />
        </div>
      )}
    </div>
  )
}