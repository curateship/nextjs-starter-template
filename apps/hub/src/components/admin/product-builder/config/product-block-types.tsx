import { Zap, Star, Target, HelpCircle, Info, DollarSign, LayoutGrid, FileText, Video, Mail } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/components/admin/shared/block-types"

export type { BlockTypeDefinition }

export const PRODUCT_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'product-content',
    name: 'Product Content',
    icon: FileText,
    description: 'Product title, description, and featured content',
    defaultContent: {
      productContentStyle: 'default',
      styleConfig: { default: {} },
      showFeaturedImage: true
    }
  },
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
    type: 'product-lead-magnet',
    name: 'Lead Magnet',
    icon: Mail,
    description: 'Collect email addresses with lead magnet offer',
    defaultContent: {
      heading: 'Get This Free Resource',
      benefits: []
    },
    conflictsWith: ['product-checkout']
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
    },
    conflictsWith: ['product-lead-magnet']
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
    type: 'listing-views',
    name: 'Product Listing Views',
    icon: LayoutGrid,
    description: 'Display products in different layout views',
    defaultContent: {
      displaySettings: {},
      contentType: 'products',
      sortOptions: {}
    }
  },
  {
    type: 'product-rich-text',
    name: 'Rich Text',
    icon: FileText,
    description: 'Add formatted text content with rich editing capabilities',
    defaultContent: {
      richtextContent: '<p>Add your content here...</p>'
    }
  },
  {
    type: 'product-video',
    name: 'Product Video',
    icon: Video,
    description: 'Embed video content with customizable player',
    defaultContent: {
      header: 'Watch Video',
      videoUrl: '',
      coverImage: '',
      autoplay: false,
      loop: false,
      muted: false
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
