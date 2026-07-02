import { Building2, FileText, UserRound, UserRoundCog } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const ACCOUNT_PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'account-core',
    name: 'Core',
    icon: UserRound,
    description: 'Front-facing member profile with avatar, bio, social links, and saved listings',
    defaultContent: {
      savedTitle: 'Saved Listings',
      emptyText: 'No saved listings yet.',
      imageFit: 'crop',
      imageQuality: 25,
      saveIconOpacity: 70,
      displayMode: 'grid',
      mobileColumns: 1,
      columns: 3,
      sortBy: 'date',
      sortOrder: 'desc',
      visibility: {},
    },
    conflictsWith: ['account-core'],
  },
  {
    type: 'account-edit-profile',
    name: 'Edit Profile',
    icon: UserRoundCog,
    description: 'Let account members edit profile details, email, avatar, and password',
    defaultContent: {
      title: 'Edit Profile',
      description: 'Manage your account details and security.',
      profileTitle: 'Profile Information',
      emailTitle: 'Email Address',
      passwordTitle: 'Security Settings',
      avatarLabel: 'Avatar',
      nameLabel: 'Display Name',
      bioLabel: 'Bio',
      socialLinksLabel: 'Social Links',
      emailLabel: 'New Email Address',
      currentPasswordLabel: 'Current Password',
      newPasswordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm New Password',
      profileButtonText: 'Save Profile',
      emailButtonText: 'Send Verification Email',
      passwordButtonText: 'Update Password',
      visibility: {},
    },
    conflictsWith: ['account-edit-profile'],
  },
  {
    type: 'account-claimed-listings',
    name: 'Claimed Listings',
    icon: Building2,
    description: 'Let approved listing owners edit their claimed directory listings',
    defaultContent: {
      title: 'Claimed Listings',
      description: 'Manage the listings approved for your account.',
      listingLabel: 'Listing',
      saveButtonText: 'Submit for Review',
      emptyText: 'No approved listing claims yet.',
      visibility: {},
    },
    conflictsWith: ['account-claimed-listings'],
  },
]

const ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET = new Set(ACCOUNT_PAGE_BLOCK_TYPES.map(blockType => blockType.type))

export function isAccountPageBuilderBlockType(type: string | null | undefined) {
  return !!type && ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(ACCOUNT_PAGE_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(ACCOUNT_PAGE_BLOCK_TYPES, type)
}
