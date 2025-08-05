
import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/shared/PostGridBlock";
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock";
import { ProductGridBlock } from "@/components/frontend/layout/marketplace/ProductGridBlock";
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