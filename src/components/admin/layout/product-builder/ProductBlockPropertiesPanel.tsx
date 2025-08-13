import { ProductHeroBlock } from "@/components/admin/modules/product-blocks/ProductHeroBlock"
import { ProductDetailsBlock } from "@/components/admin/modules/product-blocks/ProductDetailsBlock"
import { ProductGalleryBlock } from "@/components/admin/modules/product-blocks/ProductGalleryBlock"

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
}

export function ProductBlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId
}: ProductBlockPropertiesPanelProps) {
  return (
    <div className="w-[845px] border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
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
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground">
          <p>Select a block to edit its properties</p>
        </div>
      )}
    </div>
  )
}