import { Zap, FileText, HelpCircle, LayoutGrid, Minus, LogIn, Code, Quote, Navigation, PanelBottom, LucideIcon } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
  conflictsWith?: string[]
}

export const PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'navigation',
    name: 'Navigation',
    icon: Navigation,
    description: 'Site navigation bar with links, logo, and dark mode toggle',
    defaultContent: {
      logo: '',
      logoUrl: '/',
      links: [
        { id: 'link-default-0', text: 'Home', url: '/' },
      ],
      buttons: [],
      navigationStyle: 'default',
      styleConfig: {
        default: {
          textColor: '',
          blurEffect: 'light',
          containerWidth: 'custom',
          backgroundColor: '',
          showDarkModeToggle: true,
        },
      },
    },
    conflictsWith: ['navigation'],
  },
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
      faqs: [{
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
    type: 'auth',
    name: 'Authentication',
    icon: LogIn,
    description: 'User login, registration, and password reset forms with tabbed interface',
    defaultContent: {
      defaultTab: 'login',
      showLoginTab: true,
      showRegisterTab: true,
      loginRedirectPath: '/user-pages',
      registerRedirectPath: '/user-pages',
      emailVerificationEnabled: true,
      loginButtonText: 'Sign In',
      registerButtonText: 'Create Account',
      resetButtonText: 'Send Reset Link',
      loginTitle: 'Welcome back',
      loginDescription: 'Login to your account',
      registerTitle: 'Create an account',
      registerDescription: 'Enter your details to get started',
      resetTitle: 'Reset your password',
      resetDescription: 'Enter your email to receive a reset link'
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
  },
  {
    type: 'footer',
    name: 'Footer',
    icon: PanelBottom,
    description: 'Site footer with links, social links, and copyright',
    defaultContent: {
      logo: '',
      logoUrl: '/',
      links: [
        { id: 'footer-link-default-0', text: 'Home', url: '/' },
      ],
      socialLinks: [],
      copyright: '© All rights reserved.',
      style: { backgroundColor: '', textColor: '#6c757d' },
    },
    conflictsWith: ['footer'],
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return PAGE_BLOCK_TYPES.find(block => block.type === type)
}

export function getBlockIcon(type: string): LucideIcon {
  const definition = getBlockTypeDefinition(type)
  return definition?.icon || FileText
}

export function getBlockName(type: string): string {
  const definition = getBlockTypeDefinition(type)
  return definition?.name || 'Block'
}
