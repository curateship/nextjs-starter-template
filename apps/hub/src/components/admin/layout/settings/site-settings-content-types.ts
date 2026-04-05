import type { LucideIcon } from 'lucide-react'
import { BookOpen, Calendar, FileText, FolderOpen, Mail, Package, Tag, Users } from 'lucide-react'
import type { BlockTypeDefinition } from '@/components/admin/shared/block-types'
import { PAGE_BLOCK_TYPES } from '@/components/admin/page-builder/config/page-block-types'
import { PRODUCT_BLOCK_TYPES } from '@/components/admin/product-builder/config/product-block-types'
import { POST_BLOCK_TYPES } from '@/components/admin/post-builder/config/post-block-types'
import { EVENT_BLOCK_TYPES } from '@/components/admin/event-builder/config/event-block-types'
import { DIRECTORY_BLOCK_TYPES } from '@/components/admin/directory-builder/config/directory-block-types'
import { CATEGORY_BLOCK_TYPES } from '@/components/admin/category-builder/config/category-block-types'
import { USER_PAGE_BLOCK_TYPES } from '@/components/admin/user-page-builder/config/user-page-block-types'
import { NEWSLETTER_BLOCK_TYPES } from '@/components/admin/newsletter-builder/config/newsletter-block-types'

export interface SiteSettingsContentTypeConfig {
  slug: string
  key: string
  label: string
  description: string
  icon: LucideIcon
  blocks: BlockTypeDefinition[]
}

export const SITE_SETTINGS_CONTENT_TYPES: SiteSettingsContentTypeConfig[] = [
  {
    slug: 'posts',
    key: 'posts',
    label: 'Posts',
    description: 'Choose which blocks are automatically added when creating new posts.',
    icon: BookOpen,
    blocks: POST_BLOCK_TYPES,
  },
  {
    slug: 'products',
    key: 'products',
    label: 'Products',
    description: 'Choose which blocks are automatically added when creating new products.',
    icon: Package,
    blocks: PRODUCT_BLOCK_TYPES,
  },
  {
    slug: 'directory',
    key: 'directories',
    label: 'Directory',
    description: 'Choose which blocks are automatically added when creating new directory items.',
    icon: FolderOpen,
    blocks: DIRECTORY_BLOCK_TYPES,
  },
  {
    slug: 'events',
    key: 'events',
    label: 'Events',
    description: 'Choose which blocks are automatically added when creating new events.',
    icon: Calendar,
    blocks: EVENT_BLOCK_TYPES,
  },
  {
    slug: 'newsletters',
    key: 'newsletters',
    label: 'Newsletters',
    description: 'Choose which blocks are automatically added when creating new newsletters.',
    icon: Mail,
    blocks: NEWSLETTER_BLOCK_TYPES,
  },
  {
    slug: 'pages',
    key: 'pages',
    label: 'Pages',
    description: 'Choose which blocks are automatically added when creating new pages.',
    icon: FileText,
    blocks: PAGE_BLOCK_TYPES,
  },
  {
    slug: 'user-pages',
    key: 'user_pages',
    label: 'User Pages',
    description: 'Choose which blocks are automatically added when creating new user pages.',
    icon: Users,
    blocks: USER_PAGE_BLOCK_TYPES,
  },
  {
    slug: 'categories',
    key: 'categories',
    label: 'Categories',
    description: 'Choose which blocks are automatically added when creating new categories.',
    icon: Tag,
    blocks: CATEGORY_BLOCK_TYPES,
  },
]

export function getSiteSettingsContentTypeBySlug(slug: string) {
  return SITE_SETTINGS_CONTENT_TYPES.find((contentType) => contentType.slug === slug)
}
