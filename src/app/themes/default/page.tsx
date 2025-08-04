
import { HeroRuixenBlock } from "@/components/frontend/layout/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/PostGridBlock";
import { FaqBlock } from "@/components/frontend/layout/FaqBlock";
import { ProductGridBlock } from "@/components/frontend/layout/ProductGridBlock";
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