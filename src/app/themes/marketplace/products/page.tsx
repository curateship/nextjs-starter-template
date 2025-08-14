import { ProductHeroBlock } from "@/components/ui/product-hero-block-alt";
import { ProductFeatureGridBlock } from "@/components/ui/product-feature-grid-block";
import { ProductBonusBlock } from "@/components/ui/product-bonus-block";
import { ProductHotspotBlock } from "@/components/ui/product-hotspot-block";
import { ProductFeatureCarousel } from "@/components/ui/product-feature-carousel";
import { ProductPricingBlock } from "@/components/ui/product-pricing-block";
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock";

export default function DefaultThemeProductDemoPage() {
  return (
    <>
      <ProductHeroBlock />
      <ProductFeatureGridBlock />
      <ProductHotspotBlock />
      <ProductBonusBlock />
      <ProductPricingBlock />
      <ProductFeatureCarousel />
      <FaqBlock />
    </>
  );
} 