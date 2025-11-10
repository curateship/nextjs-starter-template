import { ProductDefaultBlock } from "@/components/admin/product-builder/blocks/ProductDefaultBlock"
import { ProductHeroBlock } from "@/components/admin/product-builder/blocks/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/product-builder/blocks/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/product-builder/blocks/ProductGalleryBlock"
import { ProductFeaturesBlock } from "@/components/admin/product-builder/blocks/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/admin/product-builder/blocks/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/admin/product-builder/blocks/ProductCheckoutBlock"
import ProductLeadMagnetBlock from "@/components/admin/product-builder/blocks/ProductLeadMagnetBlock"
import { ProductFAQBlock } from "@/components/admin/product-builder/blocks/ProductFAQBlock"
import { ProductListingViewBlock } from "@/components/admin/product-builder/blocks/ProductListingViewBlock"
import { ProductRichTextEditorBlock } from "@/components/admin/product-builder/blocks/ProductRichTextEditorBlock"
import { ProductVideoBlock } from "@/components/admin/product-builder/blocks/ProductVideoBlock"
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
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  onFeaturedImageChange?: (featuredImage: string) => void
  onStatusChange?: (status: string) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentProduct,
  site,
  blocksLoading = false,
  onOpenProductSettings,
  onTitleChange,
  onDescriptionChange,
  onFeaturedImageChange,
  onStatusChange
}: BlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-background overflow-y-auto pb-10">
      {selectedBlock ? (
        <div>
          <div className="">
            {selectedBlock.type === 'product-default' && (
              <ProductDefaultBlock
                title={currentProduct?.title || currentProduct?.name || ''}
                richText={currentProduct?.description || ''}
                featuredImage={currentProduct?.featured_image || ''}
                status={currentProduct?.is_published ? 'published' : 'draft'}
                downloadButtonText={selectedBlock.content.downloadButtonText || ''}
                downloadButtonStyle={selectedBlock.content.downloadButtonStyle || 'black'}
                downloadButtonUrl={selectedBlock.content.downloadButtonUrl || ''}
                onTitleChange={onTitleChange}
                onRichTextChange={onDescriptionChange}
                onFeaturedImageChange={onFeaturedImageChange}
                onStatusChange={onStatusChange}
                onDownloadButtonTextChange={(value) => updateBlockContent('downloadButtonText', value)}
                onDownloadButtonStyleChange={(value) => updateBlockContent('downloadButtonStyle', value)}
                onDownloadButtonUrlChange={(value) => updateBlockContent('downloadButtonUrl', value)}
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
                header={selectedBlock.content.header ?? ''}
                subheader={selectedBlock.content.subheader ?? ''}
                headerAlign={selectedBlock.content.headerAlign || 'left'}
                featuresCollection={selectedBlock.content.featuresCollection || []}
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onFeaturesCollectionChange={(features) => updateBlockContent('featuresCollection', features)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-hotspot' && (
              <ProductHotspotBlock
                header={selectedBlock.content.header ?? 'Interactive Product Overview'}
                subheader={selectedBlock.content.subheader ?? 'Hover over the blinking dots to discover more about our features'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                backgroundImage={selectedBlock.content.backgroundImage || ''}
                productHotspots={selectedBlock.content.productHotspots || []}
                showTooltipsAlways={selectedBlock.content.showTooltipsAlways || false}
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onBackgroundImageChange={(value) => updateBlockContent('backgroundImage', value)}
                onProductHotspotsChange={(productHotspots) => updateBlockContent('productHotspots', productHotspots)}
                onShowTooltipsAlwaysChange={(value) => updateBlockContent('showTooltipsAlways', value)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-checkout' && (
              <ProductCheckoutBlock
                header={selectedBlock.content.header ?? ''}
                subheader={selectedBlock.content.subheader ?? ''}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                productPricingTiers={selectedBlock.content.productPricingTiers || []}
                checkoutSettings={selectedBlock.content.checkoutSettings}
                downloadSettings={selectedBlock.content.downloadSettings}
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onProductPricingTiersChange={(productPricingTiers) => updateBlockContent('productPricingTiers', productPricingTiers)}
                onCheckoutSettingsChange={(settings) => updateBlockContent('checkoutSettings', settings)}
                onDownloadSettingsChange={(settings) => updateBlockContent('downloadSettings', settings)}
              />
            )}

            {selectedBlock.type === 'product-lead-magnet' && (
              <ProductLeadMagnetBlock
                block={selectedBlock as any}
                onUpdate={(updates) => {
                  Object.entries(updates).forEach(([key, value]) => {
                    updateBlockContent(key, value)
                  })
                }}
              />
            )}

            {selectedBlock.type === 'product-faq' && (
              <ProductFAQBlock
                header={selectedBlock.content.header ?? 'Product FAQ'}
                subheader={selectedBlock.content.subheader ?? 'Get answers to common questions about this product, its features, compatibility, and support options.'}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                productFaqItems={selectedBlock.content.productFaqItems || []}
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onProductFaqItemsChange={(productFaqItems) => updateBlockContent('productFaqItems', productFaqItems)}
              />
            )}
            
            {selectedBlock.type === 'listing-views' && (
              <ProductListingViewBlock
                header={selectedBlock.content.header ?? 'Latest Products'}
                subheader={selectedBlock.content.subheader ?? 'Check out our products'}
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
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
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
              />
            )}

            {selectedBlock.type === 'product-rich-text' && (
              <ProductRichTextEditorBlock
                content={{
                  header: selectedBlock.content.header || '',
                  subheader: selectedBlock.content.subheader || '',
                  headerAlign: selectedBlock.content.headerAlign || 'left',
                  richtextContent: selectedBlock.content.richtextContent || '',
                  hideHeader: selectedBlock.content.hideHeader,
                  hideEditorHeader: selectedBlock.content.hideEditorHeader
                }}
                onContentChange={(contentObj) => {
                  updateBlockContent('header', contentObj.header)
                  updateBlockContent('subheader', contentObj.subheader)
                  updateBlockContent('headerAlign', contentObj.headerAlign)
                  updateBlockContent('richtextContent', contentObj.richtextContent)
                }}
              />
            )}

            {selectedBlock.type === 'product-video' && (
              <ProductVideoBlock
                header={selectedBlock.content.header ?? ''}
                subheader={selectedBlock.content.subheader ?? ''}
                headerAlign={selectedBlock.content.headerAlign ?? 'left'}
                videoUrl={selectedBlock.content.videoUrl || ''}
                coverImage={selectedBlock.content.coverImage || ''}
                autoplay={selectedBlock.content.autoplay ?? false}
                loop={selectedBlock.content.loop ?? false}
                muted={selectedBlock.content.muted ?? false}
                onHeaderChange={(value) => updateBlockContent('header', value)}
                onSubheaderChange={(value) => updateBlockContent('subheader', value)}
                onHeaderAlignChange={(value) => updateBlockContent('headerAlign', value)}
                onVideoUrlChange={(value) => updateBlockContent('videoUrl', value)}
                onCoverImageChange={(value) => updateBlockContent('coverImage', value)}
                onAutoplayChange={(value) => updateBlockContent('autoplay', value)}
                onLoopChange={(value) => updateBlockContent('loop', value)}
                onMutedChange={(value) => updateBlockContent('muted', value)}
                siteId={siteId}
                blockId={selectedBlock.id}
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