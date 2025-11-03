import { ProductHeroBlock } from "@/components/ui/product-hero-block-alt";
import { ProductFeatureGridBlock } from "@/components/ui/product-feature-grid-block";
import { ProductBonusBlock } from "@/components/ui/product-bonus-block";
import { ProductHotspotBlock } from "@/components/frontend/products/ProductHotspotBlock";
import { ProductFeatureCarousel } from "@/components/ui/product-feature-carousel";
import { ProductCheckoutBlock } from "@/components/ui/product-checkout-block";
import { FaqBlock } from "@/components/frontend/pages/PageFaqBlock";

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