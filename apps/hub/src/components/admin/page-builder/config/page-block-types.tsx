import { Zap, FileText, HelpCircle, LayoutGrid, Minus, Code, Quote } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'hero',
    name: 'Hero',
    icon: Zap,
    description: 'Eye-catching header section with title, subtitle, and call-to-action',
    defaultContent: {
      title: 'Welcome to Our Site',
      subtitle: 'Your subtitle here',
      primaryButton: 'Get Started',
      primaryButtonLink: '#',
      primaryButtonStyle: 'primary',
      secondaryButton: 'Learn More',
      secondaryButtonLink: '#',
      secondaryButtonStyle: 'outline',
      emailForm: {
        enabled: false,
        formId: '',
        apiEndpoint: '',
        placeholder: 'Enter your email address',
        buttonText: 'Subscribe',
        successMessage: 'Thanks for subscribing!',
        layout: 'inline',
      },
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
    type: 'rich-text',
    name: 'Rich Text',
    icon: FileText,
    description: 'Flexible content editor for formatted text, images, and media',
    defaultContent: {
      content: '<p>Add your content here...</p>'
    }
  },
  {
    type: 'faq',
    name: 'FAQ',
    icon: HelpCircle,
    description: 'Frequently asked questions with expandable answers',
    defaultContent: {
      faqItems: [{
        id: `faq-${Date.now()}-1`,
        question: 'Sample Question',
        answer: 'Sample answer goes here...'
      }]
    }
  },
  {
    type: 'listing-views',
    name: 'Listing Views',
    icon: LayoutGrid,
    description: 'Display product or content listings in grid or list format',
    defaultContent: {
      title: 'Product Listings',
      viewType: 'grid'
    }
  },
  {
    type: 'divider',
    name: 'Divider / Spacer',
    icon: Minus,
    description: 'Visual separator or spacing between content sections',
    defaultContent: {
      style: 'solid',
      width: 'full',
      color: '#e5e7eb'
    }
  },
  {
    type: 'testimonials',
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
        default: { speed: 0.7, showSecondRow: true }
      }
    }
  },
  {
    type: 'embedded',
    name: 'Embedded',
    icon: Code,
    description: 'Embed HTML code, scripts, or newsletter signup forms',
    defaultContent: {
      code: '',
      type: 'html'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(PAGE_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(PAGE_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(PAGE_BLOCK_TYPES, type)
}
