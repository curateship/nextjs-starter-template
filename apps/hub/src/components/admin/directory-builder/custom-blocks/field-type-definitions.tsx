import {
  ChevronDownSquare,
  FileImage,
  Grip,
  Hash,
  Link2,
  Pilcrow,
  Rows4,
  Text,
} from "lucide-react"
import type { BlockTypeDefinition } from "@/lib/utils/block-types"

export const DIRECTORY_CUSTOM_BLOCK_FIELD_DEFINITIONS: BlockTypeDefinition[] = [
  {
    type: 'text',
    name: 'Text',
    icon: Text,
    description: 'Single-line text value',
    defaultContent: {},
  },
  {
    type: 'textarea',
    name: 'Textarea',
    icon: Rows4,
    description: 'Longer plain-text content',
    defaultContent: {},
  },
  {
    type: 'rich-text',
    name: 'Rich Text',
    icon: Pilcrow,
    description: 'Formatted HTML content',
    defaultContent: {},
  },
  {
    type: 'image',
    name: 'Image',
    icon: FileImage,
    description: 'Single image field',
    defaultContent: {},
  },
  {
    type: 'link',
    name: 'Link',
    icon: Link2,
    description: 'URL field',
    defaultContent: {},
  },
  {
    type: 'number',
    name: 'Number',
    icon: Hash,
    description: 'Numeric value',
    defaultContent: {},
  },
  {
    type: 'select',
    name: 'Select',
    icon: ChevronDownSquare,
    description: 'Single-choice dropdown field',
    defaultContent: {},
  },
  {
    type: 'repeater',
    name: 'Repeater',
    icon: Grip,
    description: 'Repeatable group of fields',
    defaultContent: {},
  },
]
