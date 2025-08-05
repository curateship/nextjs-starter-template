
import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/marketplace/PostGridBlock";
import { FaqBlock } from "@/components/frontend/layout/directory/FaqBlock";
import { ProductGridBlock } from "@/components/frontend/layout/marketplace/ProductGridBlock";
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
