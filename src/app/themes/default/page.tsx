import FeaturesSix from "@/components/frontend/features/features-6";
import { HeroRuixenBlock } from "@/components/frontend/hero/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/posts/PostGridBlock";
import FAQs from "@/components/ui/faqs-section-one";
import { ProductGridBlock } from "@/components/frontend/products/ProductGridBlock";
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