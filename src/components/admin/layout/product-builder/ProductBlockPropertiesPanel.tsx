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
}

export function ProductBlockPropertiesPanel({
  selectedBlock,
  updateBlockContent
}: ProductBlockPropertiesPanelProps) {
  return (
    <div className="w-[650px] border-r bg-muted/30 p-4 overflow-y-auto">
      {selectedBlock ? (
        <div>
          <div className="space-y-4">
            {selectedBlock.type === 'product-hero' && (
              <ProductHeroBlock
                title={selectedBlock.content.title || ''}
                subtitle={selectedBlock.content.subtitle || ''}
                price={selectedBlock.content.price || ''}
                ctaText={selectedBlock.content.ctaText || ''}
                onTitleChange={(value) => updateBlockContent('title', value)}
                onSubtitleChange={(value) => updateBlockContent('subtitle', value)}
                onPriceChange={(value) => updateBlockContent('price', value)}
                onCtaTextChange={(value) => updateBlockContent('ctaText', value)}
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