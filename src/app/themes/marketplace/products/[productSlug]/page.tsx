interface MarketplaceProductPageProps {
  params: Promise<{ 
    productSlug: string
  }>
}

export default async function MarketplaceProductPage({ params }: MarketplaceProductPageProps) {
  const { productSlug } = await params
  
  // Create a simple demo product page using the slug
  const productTitle = productSlug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            {productTitle}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            This is the {productSlug} product page - built with the Product Builder! 🎉
          </p>
          <div className="text-3xl md:text-4xl font-bold text-primary">
            $99.99
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors">
              Add to Cart
            </button>
            <button className="border border-border px-8 py-3 rounded-lg font-semibold hover:bg-muted transition-colors">
              Learn More
            </button>
          </div>
          <div className="mt-12">
            <div className="bg-muted rounded-lg aspect-video max-w-2xl mx-auto flex items-center justify-center">
              <div className="text-muted-foreground text-lg">
                Product Image Preview
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: MarketplaceProductPageProps) {
  const { productSlug } = await params
  
  const productTitle = productSlug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
  
  return {
    title: `${productTitle} - Marketplace Demo`,
    description: `${productTitle} product page built with the Product Builder system.`,
  }
}