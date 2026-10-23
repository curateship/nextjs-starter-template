import { ProductHeroBlock } from "@/components/frontend/blocks/product-hero-block-alt";
import { ProductFeatureGridBlock } from "@/components/frontend/blocks/product-feature-grid-block";
import { ProductBonusBlock } from "@/components/frontend/blocks/product-bonus-block";
import { ProductHotspotBlock } from "@/components/frontend/products/hotspot/ProductHotspotBlock";
import { ProductFeatureCarousel } from "@/components/frontend/blocks/product-feature-carousel";
import { ProductCheckoutBlock } from "@/components/frontend/blocks/product-checkout-block";
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock";

export default function DefaultThemeProductDemoPage() {
  return (
    <>
      <ProductHeroBlock />
      <ProductFeatureGridBlock />
      <ProductHotspotBlock />
      <ProductBonusBlock />
      <ProductCheckoutBlock />
      <ProductFeatureCarousel />
      <FaqBlock />
    </>
  );
}