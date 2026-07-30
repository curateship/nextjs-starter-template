import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import Minus from "lucide-react/dist/esm/icons/minus.js"
import Footprints from "lucide-react/dist/esm/icons/footprints.js"
import { BlockTypeDefinition, findBlockType } from "@/lib/utils/block-types"
import {
  DEFAULT_NEWSLETTER_RICH_TEXT_CONTENT,
  NEWSLETTER_RICH_TEXT_BLOCK_TYPE,
} from "@/lib/actions/newsletters/render"

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
    type: NEWSLETTER_RICH_TEXT_BLOCK_TYPE,
    name: 'Rich Text',
    icon: FileText,
    description: 'Formatted text content',
    defaultContent: { ...DEFAULT_NEWSLETTER_RICH_TEXT_CONTENT }
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
