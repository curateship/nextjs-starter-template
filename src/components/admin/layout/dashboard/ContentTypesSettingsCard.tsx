'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PAGE_BLOCK_TYPES } from '@/components/admin/page-builder/config/page-block-types'
import { PRODUCT_BLOCK_TYPES } from '@/components/admin/product-builder/config/product-block-types'
import { POST_BLOCK_TYPES } from '@/components/admin/post-builder/config/post-block-types'
import { EVENT_BLOCK_TYPES } from '@/components/admin/event-builder/config/event-block-types'
import { DIRECTORY_BLOCK_TYPES } from '@/components/admin/directory-builder/config/directory-block-types'
import { CATEGORY_BLOCK_TYPES } from '@/components/admin/category-builder/config/category-block-types'
import { USER_PAGE_BLOCK_TYPES } from '@/components/admin/user-page-builder/config/user-page-block-types'

const CONTENT_TYPE_CONFIGS = [
  { key: 'pages', label: 'Pages', blocks: PAGE_BLOCK_TYPES },
  { key: 'products', label: 'Products', blocks: PRODUCT_BLOCK_TYPES },
  { key: 'posts', label: 'Posts', blocks: POST_BLOCK_TYPES },
  { key: 'events', label: 'Events', blocks: EVENT_BLOCK_TYPES },
  { key: 'directories', label: 'Directories', blocks: DIRECTORY_BLOCK_TYPES },
  { key: 'categories', label: 'Categories', blocks: CATEGORY_BLOCK_TYPES },
  { key: 'user_pages', label: 'User Pages', blocks: USER_PAGE_BLOCK_TYPES },
]

interface ContentTypesSettingsCardProps {
  defaultBlocks: Record<string, string[]>
  onDefaultBlocksChange: (blocks: Record<string, string[]>) => void
}

export function ContentTypesSettingsCard({ defaultBlocks, onDefaultBlocksChange }: ContentTypesSettingsCardProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  const toggleExpanded = (key: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleBlock = (contentTypeKey: string, blockType: string) => {
    const current = defaultBlocks[contentTypeKey] || []
    const updated = current.includes(blockType)
      ? current.filter(t => t !== blockType)
      : [...current, blockType]

    onDefaultBlocksChange({
      ...defaultBlocks,
      [contentTypeKey]: updated,
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Default Blocks</CardTitle>
          <CardDescription>
            Choose which blocks are automatically added when creating new items of each content type.
          </CardDescription>
        </CardHeader>
      </Card>

      {CONTENT_TYPE_CONFIGS.map(({ key, label, blocks }) => {
        const isExpanded = expandedTypes.has(key)
        const enabledCount = (defaultBlocks[key] || []).length

        return (
          <Card key={key}>
            <CardHeader
              className="cursor-pointer select-none py-4"
              onClick={() => toggleExpanded(key)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CardTitle className="text-base">{label}</CardTitle>
                  {enabledCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {enabledCount} block{enabledCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3">
                {blocks.map((block) => {
                  const isEnabled = (defaultBlocks[key] || []).includes(block.type)
                  return (
                    <div key={block.type} className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">{block.name}</Label>
                        <p className="text-xs text-muted-foreground">{block.description}</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleBlock(key, block.type)}
                      />
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
