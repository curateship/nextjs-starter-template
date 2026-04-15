import { FileText, HelpCircle, LogIn, Minus } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/components/admin/shared/block-types"

export type { BlockTypeDefinition }

export const ACCOUNT_PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'auth',
    name: 'Authentication',
    icon: LogIn,
    description: 'Login, registration, password reset, and token-based reset handling',
    defaultContent: {
      defaultTab: 'login',
      showLoginTab: true,
      showRegisterTab: true,
      loginRedirectPath: '',
      registerRedirectPath: '',
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
        question: 'Sample Question',
        answer: 'Sample answer goes here...'
      }]
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
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(ACCOUNT_PAGE_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(ACCOUNT_PAGE_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(ACCOUNT_PAGE_BLOCK_TYPES, type)
}
