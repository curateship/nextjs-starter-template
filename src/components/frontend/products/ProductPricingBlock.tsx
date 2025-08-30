import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BlockContainer } from "@/components/frontend/layout/block-container"

// Security utility functions
const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    // Only allow HTTP(S) protocols - block javascript:, data:, file:, etc.
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

const sanitizeText = (text: string | undefined | null): string => {
  // Handle undefined/null values
  if (!text) return ''
  
  // Remove potential XSS vectors while preserving normal text
  return text
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .substring(0, 500) // Length limit to prevent DoS
}

interface PricingTier {
  id: string
  name: string
  description: string
  price: string
  interval: string
  buttonText: string
  buttonUrl: string
  buttonVariant: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link"
  features: string[]
  comparison: string
  isPopular?: boolean
  ribbonText?: string
  ribbonColor?: 'blue' | 'green' | 'purple' | 'red' | 'yellow'
}

interface ProductPricingBlockProps {
  title?: string
  subtitle?: string
  headerAlign?: 'left' | 'center'
  pricingTiers?: PricingTier[]
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

const SinglePricingCard = ({ tier }: { tier: PricingTier }) => {
  // Function to get ribbon color classes
  const getRibbonColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500 text-white'
      case 'green':
        return 'bg-green-500 text-white'
      case 'purple':
        return 'bg-purple-500 text-white'
      case 'red':
        return 'bg-red-500 text-white'
      case 'yellow':
        return 'bg-yellow-400 text-black'
      default:
        return 'bg-blue-500 text-white'
    }
  }

  return (
    <div className="relative">
      <div className="mx-auto max-w-xl lg:max-w-none">
        <div>
          <div className="bg-card relative rounded-3xl border shadow-2xl shadow-zinc-950/5 overflow-hidden">
            {/* Ribbon */}
            {tier.ribbonText && (
              <div className="absolute top-0 right-0 z-10">
                <div className={`${getRibbonColorClasses(tier.ribbonColor || 'blue')} px-3 py-1 text-sm font-semibold rounded-bl-lg`}>
                  {sanitizeText(tier.ribbonText)}
                </div>
              </div>
            )}
            <div className="grid items-start gap-12 divide-y p-12 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="pb-12 md:pb-0 md:pr-12">
                <h3 className="text-3xl font-semibold text-left">{sanitizeText(tier.name)}</h3>
                <p className="mt-6 text-lg text-left">{sanitizeText(tier.description)}</p>
                <div className="text-center">
                  <span className="mb-6 mt-12 inline-block text-6xl font-bold">
                    <span className="text-4xl">$</span>{sanitizeText(tier.price)}
                  </span>

                  <div className="flex justify-center">
                    {tier.buttonUrl && isValidUrl(tier.buttonUrl) ? (
                      <a href={tier.buttonUrl} target="_blank" rel="noopener noreferrer">
                        <Button
                          variant={tier.buttonVariant}
                          size="lg"
                          className="cursor-pointer">
                          {sanitizeText(tier.buttonText)}
                        </Button>
                      </a>
                    ) : (
                      <Button
                        variant={tier.buttonVariant}
                        size="lg">
                        {sanitizeText(tier.buttonText)}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="relative">
                <h4 className="text-2xl font-semibold mb-6">Features</h4>
                <ul
                  role="list"
                  className="space-y-4">
                  {tier.features.map((feature, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2">
                      <Check className="size-3" />
                      <span>{sanitizeText(feature)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const PricingCard = ({ tier }: { tier: PricingTier }) => {
  // Function to get ribbon color classes
  const getRibbonColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500 text-white'
      case 'green':
        return 'bg-green-500 text-white'
      case 'purple':
        return 'bg-purple-500 text-white'
      case 'red':
        return 'bg-red-500 text-white'
      case 'yellow':
        return 'bg-yellow-400 text-black'
      default:
        return 'bg-blue-500 text-white'
    }
  }

  // Determine background class based on isPopular flag
  const bgClass = tier.isPopular 
    ? "bg-card border-2 border-primary/20" 
    : "bg-card"
  
  return (
    <div className={`relative flex h-full flex-col rounded-lg shadow-lg overflow-hidden ${bgClass}`}>
      {/* Ribbon */}
      {tier.ribbonText && (
        <div className="absolute top-0 right-0 z-10">
          <div className={`${getRibbonColorClasses(tier.ribbonColor || 'blue')} px-3 py-1 text-sm font-semibold rounded-bl-lg`}>
            {sanitizeText(tier.ribbonText)}
          </div>
        </div>
      )}
      {/* Card top part with fixed height */}
      <div className="h-[360px] flex-none">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="px-8 pt-8 pb-3">
            <h3 className="text-3xl font-semibold">{sanitizeText(tier.name)}</h3>
          </div>

          {/* Description */}
          <div className="px-8 pb-6">
            <p className="line-clamp-2 text-balance text-muted-foreground">
              {sanitizeText(tier.description)}
            </p>
          </div>

          {/* Price */}
          <div className="flex grow flex-col justify-start px-8 pb-6">
            {tier.price && (
              <div className="mb-4 flex items-start justify-center">
                <div className="text-center">
                  <div className="flex items-start justify-center">
                    <span className="mt-2 text-lg font-semibold">$</span>
                    <span className="text-6xl font-semibold">{sanitizeText(tier.price)}</span>
                  </div>
                  {tier.interval && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {sanitizeText(tier.interval)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CTA Button */}
          <div className="mt-auto px-8 pb-8">
            {tier.buttonUrl && isValidUrl(tier.buttonUrl) ? (
              <a href={tier.buttonUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant={tier.buttonVariant} className="w-full py-6 cursor-pointer">
                  {sanitizeText(tier.buttonText)}
                </Button>
              </a>
            ) : (
              <Button variant={tier.buttonVariant} className="w-full py-6">
                {sanitizeText(tier.buttonText)}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grow border-t p-8 text-left">
        <p className="mb-4 text-lg font-semibold">{sanitizeText(tier.comparison)}</p>
        <ul className="space-y-4">
          {tier.features.map((feature, featureIndex) => (
            <li key={featureIndex} className="flex items-center gap-3">
              <Check className="size-5 text-primary" />
              <span>{sanitizeText(feature)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const ProductPricingBlock = ({
  title = '',
  subtitle = '',
  headerAlign = 'center',
  pricingTiers = [],
  siteWidth = 'custom',
  customWidth
}: ProductPricingBlockProps) => {
  // Show default pricing if no tiers configured
  const defaultTiers: PricingTier[] = [
    {
      id: "free",
      name: "Free",
      description: "For personal use only with limited features and support",
      price: "0",
      interval: "Includes 1 user.",
      buttonText: "Get Started",
      buttonUrl: "",
      buttonVariant: "outline",
      features: ["Live Collaboration", "1 GB Storage", "2 Projects", "Basic Support"],
      comparison: "Features",
    },
    {
      id: "pro",
      name: "Pro",
      description: "For small businesses with all the features and support",
      price: "29",
      interval: "Per user, per month.",
      buttonText: "Purchase",
      buttonUrl: "",
      buttonVariant: "default",
      features: ["2 Team Members", "10 GB Storage", "10 Projects", "Priority Support"],
      comparison: "Everything in Free, and:",
    },
    {
      id: "premium",
      name: "Premium",
      description: "For teams and organizations with advanced features and support",
      price: "59",
      interval: "Per user, per month.",
      buttonText: "Purchase",
      buttonUrl: "",
      buttonVariant: "outline",
      features: ["5 Team Members", "50 GB Storage", "50 Projects", "Dedicated Support"],
      comparison: "Everything in Pro, and:",
    }
  ]

  const displayTiers = pricingTiers.length > 0 ? pricingTiers : defaultTiers

  // Use single pricing layout when there's only one tier
  if (displayTiers.length === 1) {
    const singleTier = displayTiers[0]
    return (
      <BlockContainer
        id="pricing"
        className="white"
        siteWidth={siteWidth}
        customWidth={customWidth}
        header={{
          title,
          subtitle,
          align: headerAlign
        }}
      >
        <SinglePricingCard tier={singleTier} />
      </BlockContainer>
    )
  }

  // Use multi-tier grid layout for 2+ tiers
  return (
    <BlockContainer
      id="pricing"
      className="white"
      siteWidth={siteWidth}
      customWidth={customWidth}
      header={{
        title,
        subtitle,
        align: headerAlign
      }}
    >
      {/* Grid layout for pricing tiers */}
      <div className="mx-auto grid max-w-xl gap-8 rounded-md lg:max-w-none lg:grid-cols-3 lg:gap-10">
        {displayTiers.map((tier) => (
          <div key={tier.id} className="h-full">
            <PricingCard tier={tier} />
          </div>
        ))}
      </div>
    </BlockContainer>
  )
}

export { ProductPricingBlock }