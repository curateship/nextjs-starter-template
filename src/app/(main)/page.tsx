import FeaturesSix from "@/components/frontend/features/features-6";
import FeaturesTwo from "@/components/frontend/features/features-two";
import RuixenHeroSection from "@/components/frontend/hero/ruixen-hero-section";
import { GridBlock } from "@/components/frontend/posts/GridBlock";
import FAQs from "@/components/ui/faqs-section-one";
import { Products2 } from "@/components/frontend/products/products-2";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <>
      <RuixenHeroSection />
      <Products2 />
      <GridBlock />
    </>
  );
}
