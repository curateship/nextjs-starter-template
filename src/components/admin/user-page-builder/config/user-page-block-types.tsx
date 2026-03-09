import { User, FileText, HelpCircle, Minus, LucideIcon } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
  conflictsWith?: string[]
}

export const USER_PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'user-profile',
    name: 'User Profile',
    icon: User,
    description: 'Display and edit user profile information',
    defaultContent: {
      title: 'My Profile',
      showAvatar: true,
      showEmail: true,
      showName: true,
      allowEdit: true
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
  return USER_PAGE_BLOCK_TYPES.find(block => block.type === type)
}

export function getBlockIcon(type: string): LucideIcon {
  const definition = getBlockTypeDefinition(type)
  return definition?.icon || FileText
}

export function getBlockName(type: string): string {
  const definition = getBlockTypeDefinition(type)
  return definition?.name || 'Block'
}
