import { ProductHeroBlock } from "@/components/frontend/modules/products/ProductHeroBlock";
import ProductFeatureGridBlock from "@/components/frontend/modules/products/ProductFeatureGridBlock";
import { ProductBonusBlock } from "@/components/frontend/modules/products/ProductBonusBlock";
import FAQs from "@/components/ui/faqs";

export default function DefaultThemeProductDemoPage() {
  return (
    <>
      <ProductHeroBlock />
      <ProductFeatureGridBlock />
      <ProductBonusBlock />
      <FAQs />
    </>
  );
} 