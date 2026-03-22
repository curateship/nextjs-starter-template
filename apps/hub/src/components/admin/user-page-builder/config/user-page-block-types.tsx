import { User, FileText, HelpCircle, Minus } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/components/admin/shared/block-types"

export type { BlockTypeDefinition }

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
  return findBlockType(USER_PAGE_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(USER_PAGE_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(USER_PAGE_BLOCK_TYPES, type)
}
