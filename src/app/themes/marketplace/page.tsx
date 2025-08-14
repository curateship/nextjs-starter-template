
import { HeroRuixenBlock } from "@/components/frontend/layout/pages/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock";
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock";
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock";
import { Separator } from "@/components/ui/separator";

export default function DefaultThemeHome() {
  return (
    <>
      <HeroRuixenBlock />
      <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock />
    </>
  );
} 