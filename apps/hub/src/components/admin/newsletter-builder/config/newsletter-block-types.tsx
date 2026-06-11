import { ImageIcon, FileText, Minus, Footprints } from "lucide-react"
import { BlockTypeDefinition, findBlockType } from "@/lib/utils/block-types"
import { DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR } from "@/lib/actions/newsletters/render"

export type { BlockTypeDefinition }

export const NEWSLETTER_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'newsletter-header',
    name: 'Header',
    icon: ImageIcon,
    description: 'Logo and site name header',
    defaultContent: {
      logoUrl: '',
      alignment: 'center',
      backgroundColor: '#ffffff',
      paddingTop: 20,
      paddingBottom: 20,
    }
  },
  {
    type: 'newsletter-rich-text',
    name: 'Rich Text',
    icon: FileText,
    description: 'Formatted text content',
    defaultContent: {
      htmlContent: '',
      backgroundColor: '#ffffff',
      padding: 20,
      imageBorderSize: 0,
      imageBorderColor: DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR,
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
      socialLinks: [],
      alignment: 'center',
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(NEWSLETTER_BLOCK_TYPES, type)
}

