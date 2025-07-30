import FeaturesSix from "@/components/feature/features-6";
import FeaturesTwo from "@/components/feature/features-two";
import RuixenHeroSection from "@/components/hero/ruixen-hero-section";
import { Blog7 } from "@/components/posts/blog7";
import FAQs from "@/components/ui/faqs-section-one";
import { Products2 } from "@/components/products/products-2";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <>
      <RuixenHeroSection />
      <Products2 />
      <Blog7 />
    </>
  );
}
