'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { SiteSettingsContentTypeConfig } from '@/components/admin/layout/settings/site-settings-content-types'

interface ContentTypeDefaultBlocksCardProps {
  contentType: SiteSettingsContentTypeConfig
  selectedBlocks: string[]
  onSelectedBlocksChange: (blocks: string[]) => void
}

export function ContentTypeDefaultBlocksCard({
  contentType,
  selectedBlocks,
  onSelectedBlocksChange,
}: ContentTypeDefaultBlocksCardProps) {
  const toggleBlock = (blockType: string) => {
    const nextBlocks = selectedBlocks.includes(blockType)
      ? selectedBlocks.filter((type) => type !== blockType)
      : [...selectedBlocks, blockType]

    onSelectedBlocksChange(nextBlocks)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{contentType.label} Default Blocks</CardTitle>
        <CardDescription>{contentType.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {contentType.blocks.map((block) => {
          const isEnabled = selectedBlocks.includes(block.type)

          return (
            <div key={block.type} className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="font-medium">{block.name}</Label>
                <p className="text-xs text-muted-foreground">{block.description}</p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={() => toggleBlock(block.type)}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
