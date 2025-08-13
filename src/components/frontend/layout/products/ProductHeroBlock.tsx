"use client"

import { Button } from "@/components/ui/button"
import { FrontendBlockContainer } from "@/components/ui/frontend-block-container"

interface ProductHeroBlockProps {
  title?: string
  subtitle?: string
  price?: string
  ctaText?: string
  className?: string
}

export function ProductHeroBlock({
  title = "Product Title",
  subtitle = "Product description goes here",
  price = "$99",
  ctaText = "Add to Cart",
  className = "white"
}: ProductHeroBlockProps) {
  return (
    <FrontendBlockContainer className={className}>
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Product Title */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Product Price */}
        <div className="space-y-4">
          <div className="text-3xl md:text-4xl font-bold text-primary">
            {price}
          </div>
        </div>

        {/* Product Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button size="lg" className="min-w-[200px]">
            {ctaText}
          </Button>
          <Button variant="outline" size="lg" className="min-w-[200px]">
            Learn More
          </Button>
        </div>

        {/* Product Preview/Image Placeholder */}
        <div className="mt-12">
          <div className="bg-muted rounded-lg aspect-video max-w-2xl mx-auto flex items-center justify-center">
            <div className="text-muted-foreground text-lg">
              Product Image Preview
            </div>
          </div>
        </div>
      </div>
    </FrontendBlockContainer>
  )
}