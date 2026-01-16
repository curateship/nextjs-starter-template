import { Zap, FileText, HelpCircle, LayoutGrid, Minus, LogIn, Code, LucideIcon } from "lucide-react"

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
    type: 'hero',
    name: 'Hero',
    icon: Zap,
    description: 'Eye-catching header section with title, subtitle, and call-to-action',
    defaultContent: {
      title: 'Welcome to Our Site',
      subtitle: 'Your subtitle here',
      buttonText: 'Get Started',
      buttonUrl: '#',
      backgroundImage: ''
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
