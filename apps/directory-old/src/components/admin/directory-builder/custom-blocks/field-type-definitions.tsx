import ChevronDownSquare from "lucide-react/dist/esm/icons/square-chevron-down.js"
import FileImage from "lucide-react/dist/esm/icons/file-image.js"
import Grip from "lucide-react/dist/esm/icons/grip.js"
import Hash from "lucide-react/dist/esm/icons/hash.js"
import Link2 from "lucide-react/dist/esm/icons/link-2.js"
import Pilcrow from "lucide-react/dist/esm/icons/pilcrow.js"
import Rows4 from "lucide-react/dist/esm/icons/rows-4.js"
import Tags from "lucide-react/dist/esm/icons/tags.js"
import Text from "lucide-react/dist/esm/icons/text.js"
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
    type: 'tags',
    name: 'Tags',
    icon: Tags,
    description: 'Comma-separated labels rendered as checkmark chips',
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
