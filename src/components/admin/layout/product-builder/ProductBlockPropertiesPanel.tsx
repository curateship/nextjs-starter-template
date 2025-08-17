import { ProductDefaultBlock } from "@/components/admin/layout/product-builder/ProductDefaultBlock"
import { ProductHeroBlock } from "@/components/admin/layout/product-builder/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/layout/product-builder/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/layout/product-builder/ProductGalleryBlock"
import { ProductFeaturesBlock } from "@/components/admin/layout/product-builder/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/admin/layout/product-builder/ProductHotspotBlock"
import { ProductFAQBlock } from "@/components/admin/layout/product-builder/ProductFAQBlock"
import { ProductPreview } from "./ProductPreview"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface ProductBlockPropertiesPanelProps {
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
  }
  site?: {
    id: string
    name: string
    subdomain: string
  }
  siteBlocks?: {
    navigation?: any
    footer?: any
  } | null
}

export function ProductBlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentProduct,
  site,
  siteBlocks
}: ProductBlockPropertiesPanelProps) {
  return (
    <div className="flex-1 border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'product-default' && (
              <ProductDefaultBlock
                title={selectedBlock.content.title || ''}
                richText={selectedBlock.content.richText || ''}
                featuredImage={selectedBlock.content.featuredImage || ''}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onRichTextChange={(value) => updateBlockContent('richText', value)}
                onFeaturedImageChange={(value) => updateBlockContent('featuredImage', value)}
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
                backgroundColor={selectedBlock.content.backgroundColor || '#ffffff'}
                showRainbowButton={selectedBlock.content.showRainbowButton || false}
                rainbowButtonText={selectedBlock.content.rainbowButtonText || 'Get Access to Everything'}
                rainbowButtonIcon={selectedBlock.content.rainbowButtonIcon || 'github'}
                githubLink={selectedBlock.content.githubLink || ''}
                showParticles={selectedBlock.content.showParticles || false}
                trustedByText={selectedBlock.content.trustedByText || ''}
                trustedByTextColor={selectedBlock.content.trustedByTextColor || '#6b7280'}
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
                onBackgroundColorChange={(value) => updateBlockContent('backgroundColor', value)}
                onShowRainbowButtonChange={(value) => updateBlockContent('showRainbowButton', value)}
                onRainbowButtonTextChange={(value) => updateBlockContent('rainbowButtonText', value)}
                onRainbowButtonIconChange={(value) => updateBlockContent('rainbowButtonIcon', value)}
                onGithubLinkChange={(value) => updateBlockContent('githubLink', value)}
                onShowParticlesChange={(value) => updateBlockContent('showParticles', value)}
                onTrustedByTextChange={(value) => updateBlockContent('trustedByText', value)}
                onTrustedByTextColorChange={(value) => updateBlockContent('trustedByTextColor', value)}
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
                headerTitle={selectedBlock.content.headerTitle || 'Effortless Task Management'}
                headerSubtitle={selectedBlock.content.headerSubtitle || 'Automate your tasks and workflows by connecting your favorite tools like Notion, Todoist, and more.'}
                features={selectedBlock.content.features || []}
                onHeaderTitleChange={(value) => updateBlockContent('headerTitle', value)}
                onHeaderSubtitleChange={(value) => updateBlockContent('headerSubtitle', value)}
                onFeaturesChange={(features) => updateBlockContent('features', features)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'product-hotspot' && (
              <ProductHotspotBlock
                title={selectedBlock.content.title || 'Interactive Product Overview'}
                subtitle={selectedBlock.content.subtitle || 'Hover over the blinking dots to discover more about our features'}
                backgroundImage={selectedBlock.content.backgroundImage || ''}
                hotspots={selectedBlock.content.hotspots || []}
                showTooltipsAlways={selectedBlock.content.showTooltipsAlways || false}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onBackgroundImageChange={(value) => updateBlockContent('backgroundImage', value)}
                onHotspotsChange={(hotspots) => updateBlockContent('hotspots', hotspots)}
                onShowTooltipsAlwaysChange={(value) => updateBlockContent('showTooltipsAlways', value)}
                siteId={siteId}
                blockId={selectedBlock.id}
              />
            )}
            
            {selectedBlock.type === 'faq' && (
              <ProductFAQBlock
                title={selectedBlock.content.title || 'Product FAQ'}
                subtitle={selectedBlock.content.subtitle || 'Get answers to common questions about this product, its features, compatibility, and support options.'}
                faqItems={selectedBlock.content.faqItems || []}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onFaqItemsChange={(faqItems) => updateBlockContent('faqItems', faqItems)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          {currentProduct && currentProduct.blocks.length > 0 ? (
            <ProductPreview 
              blocks={currentProduct.blocks} 
              product={{
                id: currentProduct.id || 'preview',
                title: currentProduct.title || currentProduct.name,
                slug: currentProduct.slug,
                meta_description: currentProduct.meta_description,
                site_id: currentProduct.site_id || siteId
              }}
              site={site}
              siteBlocks={siteBlocks}
              className="h-full"
            />
          ) : (
            <div className="text-center text-muted-foreground h-full flex items-center justify-center">
              <div>
                <p className="text-lg font-medium mb-2">No blocks added yet</p>
                <p className="text-sm">Add blocks to see your product preview</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}