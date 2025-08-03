
import { HeroRuixenBlock } from "@/components/ui/hero/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/modules/posts/PostGridBlock";
import FAQs from "@/components/ui/faqs";
import { ProductGridBlock } from "@/components/frontend/modules/products/ProductGridBlock";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <>
      <HeroRuixenBlock />
      <ProductGridBlock />
      <PostGridBlock />
    </>
  );
}
