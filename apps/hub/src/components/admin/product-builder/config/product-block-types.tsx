import { Zap, Star, Target, HelpCircle, Info, DollarSign, LayoutGrid, Quote, Magnet } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"
import { PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT } from "@/lib/products/lead-magnet"

export type { BlockTypeDefinition }

export const PRODUCT_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'product-hero',
    name: 'Product Hero',
    icon: Zap,
    description: 'Eye-catching hero section with title, subtitle, and call-to-action buttons',
    defaultContent: {
      title: 'New Product Hero',
      subtitle: 'Add your subtitle here',
      primaryButton: 'Get Started',
      primaryButtonLink: '#',
      primaryButtonStyle: 'primary',
      secondaryButton: 'Learn More',
      secondaryButtonLink: '#',
      secondaryButtonStyle: 'outline',
      heroStyle: 'default',
      styleConfig: {
        default: {
          heroImage: '',
          showHeroImage: false,
          rainbowButtonText: '',
          rainbowButtonIcon: 'star',
          rainbowButtonLink: '',
          trustedByText: '',
          trustedByAvatars: [],
          showTrustedByBadge: false,
          backgroundPattern: 'dots',
          backgroundPatternSize: 'medium',
          backgroundPatternOpacity: 80,
          showParticles: false,
          githubLink: '',
        }
      }
    }
  },
  {
    type: 'product-features',
    name: 'Product Features',
    icon: Star,
    description: 'Showcase product features in a grid layout',
    defaultContent: {
      header: 'Features',
      subheader: 'What makes this product special',
      featuresCollection: [
        {
          id: `feature-${Date.now()}-1`,
          image: '',
          title: 'Feature 1',
          description: 'Description of feature 1'
        }
      ]
    }
  },
  {
    type: 'product-hotspot',
    name: 'Product Hotspot',
    icon: Target,
    description: 'Interactive image with clickable hotspots',
    defaultContent: {
      header: 'Explore Features',
      subheader: 'Click on the hotspots to learn more',
      backgroundImage: '',
      productHotspots: []
    }
  },
  {
    type: 'product-checkout',
    name: 'Product Checkout',
    icon: DollarSign,
    description: 'Add pricing tiers and checkout functionality',
    defaultContent: {
      header: 'Choose Your Plan',
      subheader: 'Select the perfect plan for your needs',
      productPricingTiers: []
    }
  },
  {
    type: 'product-lead-magnet',
    name: 'Lead Magnet',
    icon: Magnet,
    description: 'Capture emails and deliver product-specific lead magnet content',
    defaultContent: PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT,
  },
  {
    type: 'product-faq',
    name: 'Product FAQ',
    icon: HelpCircle,
    description: 'Frequently asked questions section',
    defaultContent: {
      header: 'Frequently Asked Questions',
      subheader: 'Find answers to common questions',
      productFaqItems: [
        {
          id: `faq-${Date.now()}-1`,
          question: 'Sample question?',
          answer: 'Sample answer here.'
        }
      ]
    }
  },
  {
    type: 'product-testimonials',
    name: 'Testimonials',
    icon: Quote,
    description: 'Showcase client testimonials in an auto-scrolling carousel',
    defaultContent: {
      title: 'Meet Our Happy Clients',
      subtitle: 'Hear from the teams who have transformed their workflow.',
      headerAlign: 'center',
      testimonialItems: [
        {
          id: 'item-1',
          name: 'Sarah Chen',
          role: 'CEO & Founder',
          avatar: '',
          content: 'This product has transformed how we build and ship. We accomplished in weeks what used to take months.',
        },
        {
          id: 'item-2',
          name: 'Marcus Rodriguez',
          role: 'CTO',
          avatar: '',
          content: 'The attention to detail and performance is impressive. Our team productivity increased significantly.',
        },
        {
          id: 'item-3',
          name: 'Emily Watson',
          role: 'Head of Product',
          avatar: '',
          content: 'Finally, a solution that developers actually want to use. The documentation is clear and defaults are sensible.',
        },
      ],
      testimonialStyle: 'default',
      styleConfig: {
        default: { speed: 0.7, showSecondRow: true },
        'vertical-scroll': {
          firstColumnDuration: 15,
          secondColumnDuration: 19,
          thirdColumnDuration: 17,
        }
      }
    }
  },
  {
    type: 'listing-views',
    name: 'Product Listing Views',
    icon: LayoutGrid,
    description: 'Display products in different layout views',
    defaultContent: {
      displaySettings: {},
      contentType: 'products',
      sortOptions: {}
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(PRODUCT_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(PRODUCT_BLOCK_TYPES, type, Info)
}

export function getBlockName(type: string): string {
  return _getBlockName(PRODUCT_BLOCK_TYPES, type)
}
