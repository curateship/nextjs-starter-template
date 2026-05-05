import { FileText, UserRoundCog } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const ACCOUNT_PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
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
]

const ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET = new Set(ACCOUNT_PAGE_BLOCK_TYPES.map(blockType => blockType.type))

export function isAccountPageBuilderBlockType(type: string | null | undefined) {
  return !!type && ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(ACCOUNT_PAGE_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(ACCOUNT_PAGE_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(ACCOUNT_PAGE_BLOCK_TYPES, type)
}
