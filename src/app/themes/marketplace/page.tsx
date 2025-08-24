
import { ProductHeroBlock } from "@/components/frontend/products/ProductHeroBlock";
import { PostGridBlock } from "@/components/frontend/posts/PostGridBlock";
import { FaqBlock } from "@/components/frontend/pages/PageFaqBlock";
import { ProductGridBlock } from "@/components/frontend/products/ProductGridBlock";
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