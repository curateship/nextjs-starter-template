
import { HeroRuixenBlock } from "@/components/ui/hero/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/PostGridBlock";
import FAQs from "@/components/ui/faqs";
import { ProductGridBlock } from "@/components/frontend/layout/ProductGridBlock";
import { Separator } from "@/components/ui/separator";

export default function DefaultThemeHome() {
  return (
    <>
      <HeroRuixenBlock />
      <ProductGridBlock />
      <PostGridBlock />
    </>
  );
} 