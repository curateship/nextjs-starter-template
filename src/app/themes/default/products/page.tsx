import { ProductHeroBlock } from "@/components/frontend/modules/products/ProductHeroBlock";
import ProductFeatureGridBlock from "@/components/frontend/modules/products/ProductFeatureGridBlock";
import { ProductBonusBlock } from "@/components/frontend/modules/products/ProductBonusBlock";
import { ProductHotspotBlock } from "@/components/frontend/modules/products/ProductHotspotBlock";
import { ProductFeatureCarousel } from "@/components/frontend/modules/products/ProductFeatureCarousel";
import FAQs from "@/components/ui/faqs";

export default function DefaultThemeProductDemoPage() {
  return (
    <>
      <ProductHeroBlock />
      <ProductFeatureGridBlock />
      <ProductHotspotBlock />
      <ProductBonusBlock />
      <ProductFeatureCarousel />
      <FAQs />
    </>
  );
} 