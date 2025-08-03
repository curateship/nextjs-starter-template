
import { HeroRuixenBlock } from "@/components/ui/hero/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/modules/posts/PostGridBlock";
import FAQs from "@/components/ui/faqs-section-one";
import { ProductGridBlock } from "@/components/frontend/modules/products/ProductGridBlock";
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