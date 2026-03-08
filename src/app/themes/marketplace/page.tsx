
import { ProductHeroBlock } from "@/components/frontend/products/hero/ProductHeroBlock";
import { PostGridBlock } from "@/components/frontend/posts/PostGridBlock";
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock";
import { ProductGridBlock } from "@/components/frontend/products/grid/ProductGridBlock";
import { Separator } from "@/components/ui/separator";

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