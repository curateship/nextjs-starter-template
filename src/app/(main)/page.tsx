
import { HeroRuixenBlock } from "@/components/frontend/layout/pages/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock";
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock";

export default function Home() {
  return (
    <>
      <HeroRuixenBlock />
      <ProductGridBlock />
      <PostGridBlock />
    </>
  )
}

export async function generateMetadata() {
  return {
    title: 'Site Builder Platform',
    description: 'Create beautiful websites with our drag-and-drop site builder',
  }
}
