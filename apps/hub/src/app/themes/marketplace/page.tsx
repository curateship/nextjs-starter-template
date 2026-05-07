
import { ProductHeroBlock } from "@/components/frontend/products/hero/ProductHeroBlock";
import { PostGridBlock } from "@/components/frontend/posts/PostGridBlock";
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock";
import { ProductGridBlock } from "@/components/frontend/products/grid/ProductGridBlock";

export default function DefaultThemeHome() {
  return (
    <>
      <ProductHeroBlock />
      <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock />
    </>
  );
} 
