import { ProductHeroBlock } from "@/components/frontend/modules/products/ProductHeroBlock";
import ProductFeatureGridBlock from "@/components/frontend/modules/products/ProductFeatureGridBlock";
import FAQs from "@/components/ui/faqs";

export default function DefaultThemeProductDemoPage() {
  return (
    <>
      <ProductHeroBlock />
      <ProductFeatureGridBlock />
      <FAQs />
    </>
  );
} 