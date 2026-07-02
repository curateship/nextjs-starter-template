import { BadgeInfo, Clock3, FileText, ListTree, MapPinned } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE, DIRECTORY_GOOGLE_MAP_DEFAULT_HEIGHT } from "@/lib/actions/directories/directory-google-map"
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from "@/lib/actions/directories/directory-opening-hours"

export type { BlockTypeDefinition }

export const DIRECTORY_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: DIRECTORY_CORE_BLOCK_TYPE,
    name: 'Core',
    icon: BadgeInfo,
    description: 'Compact directory profile with social and action links',
    defaultContent: {
      layoutColumn: 'main',
      sticky: false,
      claimEnabled: true,
      claimButtonText: 'Claim Listing',
      claimPendingEmailText: 'Check Business Email',
      claimPendingReviewText: 'Claim Pending Review',
      claimApprovedText: 'Edit Listing',
      visibility: {},
    },
    conflictsWith: [DIRECTORY_CORE_BLOCK_TYPE],
  },
  {
    type: 'directory-rich-text',
    name: 'Rich Text Editor',
    icon: FileText,
    description: 'Add formatted text content with links and media',
    defaultContent: {
      layoutColumn: 'main',
      visibility: {},
    },
  },
  {
    type: DIRECTORY_GOOGLE_MAP_BLOCK_TYPE,
    name: 'Google Map',
    icon: MapPinned,
    description: 'Embed a Google Map for a single address or Place ID',
    defaultContent: {
      height: DIRECTORY_GOOGLE_MAP_DEFAULT_HEIGHT,
      layoutColumn: 'sidebar',
      visibility: {},
    },
  },
  {
    type: DIRECTORY_OPENING_HOURS_BLOCK_TYPE,
    name: 'Opening Hours',
    icon: Clock3,
    description: 'Show live business hours from a Google Place ID',
    defaultContent: {
      layoutColumn: 'sidebar',
      visibility: {},
    },
  },
  {
    type: 'directory-related-listing',
    name: 'Related Listing',
    icon: ListTree,
    description: 'Show listings related by selected category group',
    defaultContent: {
      title: 'Related Listings',
      subtitle: '',
      parentCategoryId: '',
      itemsToShow: 5,
      layoutColumn: 'main',
      visibility: {},
    },
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(DIRECTORY_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(DIRECTORY_BLOCK_TYPES, type, BadgeInfo)
}

export function getBlockName(type: string): string {
  return _getBlockName(DIRECTORY_BLOCK_TYPES, type)
}
