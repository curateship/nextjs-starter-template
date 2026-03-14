import { ImageIcon, FileText, Minus, Footprints, LucideIcon, Info } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
}

export const NEWSLETTER_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'newsletter-header',
    name: 'Header',
    icon: ImageIcon,
    description: 'Logo and site name header',
    defaultContent: {
      logoUrl: '',
      siteName: '',
      showSiteName: true,
      alignment: 'center',
      backgroundColor: '#ffffff',
      padding: 20,
    }
  },
  {
    type: 'newsletter-rich-text',
    name: 'Rich Text',
    icon: FileText,
    description: 'Formatted text content',
    defaultContent: {
      htmlContent: '<p>Add your content here...</p>',
      backgroundColor: '#ffffff',
      padding: 20,
    }
  },
  {
    type: 'newsletter-divider',
    name: 'Divider',
    icon: Minus,
    description: 'Horizontal line separator',
    defaultContent: {
      color: '#e5e7eb',
      thickness: 1,
      width: 100,
      spacing: 20,
    }
  },
  {
    type: 'newsletter-footer',
    name: 'Footer',
    icon: Footprints,
    description: 'Company info and unsubscribe link',
    defaultContent: {
      companyName: '',
      companyAddress: '',
      showUnsubscribe: true,
      socialLinks: [],
      alignment: 'center',
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return NEWSLETTER_BLOCK_TYPES.find(block => block.type === type)
}

export function getBlockIcon(type: string): LucideIcon {
  const definition = getBlockTypeDefinition(type)
  return definition?.icon || Info
}

export function getBlockName(type: string): string {
  const definition = getBlockTypeDefinition(type)
  return definition?.name || 'Block'
}
