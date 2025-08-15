
import { ProductHeroBlock } from "@/components/frontend/layout/products/ProductHeroBlock";
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock";
import { FaqBlock } from "@/components/frontend/layout/pages/FaqBlock";
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock";
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